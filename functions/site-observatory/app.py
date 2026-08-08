import json
import os
import re
import statistics
from collections import Counter, defaultdict
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from urllib.parse import urlparse

import boto3
from boto3.dynamodb.conditions import Key

TABLE_NAME = os.environ["TABLE_NAME"]
PUBLIC_DISTRIBUTION_ID = os.environ.get("PUBLIC_DISTRIBUTION_ID", "")
ALLOWED_SITE_ORIGIN = os.environ.get("ALLOWED_SITE_ORIGIN", "https://edwarddclark.com")
ALLOWED_OPS_ORIGIN = os.environ.get("ALLOWED_OPS_ORIGIN", "https://observatory.edwarddclark.com")
DIGEST_TO_EMAIL = os.environ.get("DIGEST_TO_EMAIL", "ed@collectivestateinference.org")
DIGEST_FROM_EMAIL = os.environ.get("DIGEST_FROM_EMAIL", "notifications@collectivestateinference.org")
REPLY_TO_EMAIL = os.environ.get("REPLY_TO_EMAIL", "ed@collectivestateinference.org")
RETENTION_DAYS = int(os.environ.get("RETENTION_DAYS", "30"))

TABLE = boto3.resource("dynamodb").Table(TABLE_NAME)
CLOUDWATCH = boto3.client("cloudwatch")
SES = boto3.client("sesv2")

EVENT_TYPES = {"page_view", "session_update", "outbound_click"}
CSI_HOSTS = {"collectivestateinference.org", "www.collectivestateinference.org"}
BOT_TOKENS = (
    "bot", "crawler", "spider", "slurp", "preview", "facebookexternalhit",
    "linkedinbot", "twitterbot", "curl/", "wget/", "python-requests",
    "headlesschrome", "lighthouse"
)
SESSION_RE = re.compile(r"^[A-Za-z0-9._:-]{8,100}$")


def _now():
    return datetime.now(timezone.utc)


def _json_response(status, payload, origin=None):
    headers = {
        "content-type": "application/json; charset=utf-8",
        "cache-control": "no-store, max-age=0",
        "x-content-type-options": "nosniff",
        "referrer-policy": "no-referrer",
    }
    if origin in {ALLOWED_SITE_ORIGIN, ALLOWED_OPS_ORIGIN}:
        headers["access-control-allow-origin"] = origin
        headers["vary"] = "Origin"
    return {
        "statusCode": status,
        "headers": headers,
        "body": json.dumps(payload, separators=(",", ":"), default=_json_default),
    }


def _json_default(value):
    if isinstance(value, Decimal):
        return int(value) if value % 1 == 0 else float(value)
    raise TypeError(f"Unsupported JSON type: {type(value).__name__}")


def _clean(value, limit=160):
    text = str(value or "").strip()
    text = "".join(ch for ch in text if ord(ch) >= 32 and ord(ch) != 127)
    return text[:limit]


def _safe_path(value, limit=500):
    text = _clean(value, limit)
    if not text:
        return "/"
    try:
        parsed = urlparse(text)
        if parsed.scheme and parsed.netloc:
            return (parsed.path or "/")[:limit]
    except Exception:
        pass
    if not text.startswith("/"):
        text = "/" + text
    return text.split("?", 1)[0].split("#", 1)[0][:limit]


def _referrer_parts(value):
    raw = _clean(value, 1000)
    if not raw:
        return "", ""
    try:
        parsed = urlparse(raw)
        return parsed.hostname or "", parsed.path or "/"
    except Exception:
        return "", ""


def _destination_parts(value):
    raw = _clean(value, 1000)
    if not raw:
        return "", ""
    try:
        parsed = urlparse(raw)
        return (parsed.hostname or "").lower(), parsed.path or "/"
    except Exception:
        return "", ""


def _viewport_class(value):
    text = _clean(value, 32)
    try:
        width = int(text.split("x", 1)[0])
    except Exception:
        return "unknown"
    if width < 600:
        return "mobile"
    if width < 1024:
        return "tablet"
    return "desktop"


def _is_bot(user_agent):
    ua = (user_agent or "").lower()
    return not ua or any(token in ua for token in BOT_TOKENS)


def _body(event):
    raw = event.get("body") or "{}"
    if event.get("isBase64Encoded"):
        return {}
    try:
        parsed = json.loads(raw)
        return parsed if isinstance(parsed, dict) else {}
    except json.JSONDecodeError:
        return {}


def _route_key(event):
    return event.get("routeKey") or ""


def _origin(event):
    headers = event.get("headers") or {}
    return headers.get("origin") or headers.get("Origin") or ""


def _ua(event):
    headers = event.get("headers") or {}
    return headers.get("user-agent") or headers.get("User-Agent") or ""


def _store_event(event):
    origin = _origin(event)
    if origin != ALLOWED_SITE_ORIGIN:
        return _json_response(403, {"accepted": False}, origin)

    if _is_bot(_ua(event)):
        return _json_response(202, {"accepted": False, "reason": "automation"}, origin)

    payload = _body(event)
    event_type = _clean(payload.get("event_type"), 40)
    session_id = _clean(payload.get("session_id"), 100)
    if event_type not in EVENT_TYPES or not SESSION_RE.match(session_id):
        return _json_response(400, {"accepted": False, "reason": "invalid_event"}, origin)

    now = _now()
    request_context = event.get("requestContext") or {}
    request_id = request_context.get("requestId") or os.urandom(12).hex()
    ref_host, ref_path = _referrer_parts(payload.get("referrer"))
    dest_host, dest_path = _destination_parts(payload.get("destination_url"))
    ttl = int((now + timedelta(days=RETENTION_DAYS)).timestamp())

    item = {
        "event_date": now.date().isoformat(),
        "event_id": f"{int(now.timestamp() * 1000):013d}#{request_id}",
        "event_ts": now.isoformat().replace("+00:00", "Z"),
        "expires_at": ttl,
        "event_type": event_type,
        "session_id": session_id,
        "page_path": _safe_path(payload.get("page_url")),
        "page_title": _clean(payload.get("page_title"), 220),
        "referrer_host": _clean(ref_host.lower(), 160),
        "referrer_path": _clean(ref_path, 500),
        "acquisition_source": _clean(payload.get("acquisition_source"), 160),
        "acquisition_medium": _clean(payload.get("acquisition_medium"), 80),
        "acquisition_campaign": _clean(payload.get("acquisition_campaign"), 160),
        "acquisition_content": _clean(payload.get("acquisition_content"), 160),
        "acquisition_via": _clean(payload.get("acquisition_via"), 160),
        "destination_host": _clean(dest_host, 160),
        "destination_path": _clean(dest_path, 500),
        "elapsed_seconds": max(0, min(int(payload.get("session_elapsed_seconds") or 0), 43200)),
        "viewport_class": _viewport_class(payload.get("viewport")),
        "language": _clean(payload.get("language"), 32),
        "timezone": _clean(payload.get("timezone"), 80),
    }
    TABLE.put_item(Item=item)
    return _json_response(202, {"accepted": True}, origin)


def _query_days(days, end_date=None):
    end_date = end_date or _now().date()
    start_date = end_date - timedelta(days=days - 1)
    items = []
    cursor = start_date
    while cursor <= end_date:
        response = TABLE.query(KeyConditionExpression=Key("event_date").eq(cursor.isoformat()))
        items.extend(response.get("Items", []))
        while response.get("LastEvaluatedKey"):
            response = TABLE.query(
                KeyConditionExpression=Key("event_date").eq(cursor.isoformat()),
                ExclusiveStartKey=response["LastEvaluatedKey"],
            )
            items.extend(response.get("Items", []))
        cursor += timedelta(days=1)
    return items


def _source_name(item):
    source = _clean(item.get("acquisition_source"), 160).lower()
    if source:
        aliases = {
            "linkedin": "LinkedIn",
            "google": "Google",
            "google_scholar": "Google Scholar",
            "github": "GitHub",
            "chatgpt": "ChatGPT",
            "perplexity": "Perplexity",
            "bing": "Bing",
        }
        return aliases.get(source, source.replace("_", " ").title())
    ref = _clean(item.get("referrer_host"), 160).lower().removeprefix("www.")
    if not ref or ref in {"edwarddclark.com"}:
        return "Direct"
    if "linkedin.com" in ref:
        return "LinkedIn"
    if "google." in ref:
        return "Google"
    if "github.com" in ref:
        return "GitHub"
    if "chatgpt.com" in ref:
        return "ChatGPT"
    if "perplexity.ai" in ref:
        return "Perplexity"
    return ref


def _rank(counter, limit=6):
    return [{"name": name, "count": count} for name, count in counter.most_common(limit)]


def _summarize(items, window_days):
    page_views = [x for x in items if x.get("event_type") == "page_view"]
    by_session = defaultdict(list)
    for item in items:
        by_session[item.get("session_id", "")].append(item)

    sessions = {sid: rows for sid, rows in by_session.items() if sid}
    session_first = {}
    durations = []
    for sid, rows in sessions.items():
        ordered = sorted(rows, key=lambda x: x.get("event_ts", ""))
        session_first[sid] = next((x for x in ordered if x.get("event_type") == "page_view"), ordered[0])
        durations.append(max(int(x.get("elapsed_seconds") or 0) for x in ordered))

    source_counter = Counter(_source_name(item) for item in session_first.values())
    page_counter = Counter(x.get("page_path") or "/" for x in page_views)
    entry_counter = Counter((item.get("page_path") or "/") for item in session_first.values())
    csi_sessions = {
        x.get("session_id")
        for x in items
        if x.get("event_type") == "outbound_click" and x.get("destination_host") in CSI_HOSTS
    }

    dates = [(_now().date() - timedelta(days=i)).isoformat() for i in range(window_days - 1, -1, -1)]
    sessions_by_date = Counter()
    for sid, first in session_first.items():
        date = (first.get("event_ts") or "")[:10]
        if date:
            sessions_by_date[date] += 1

    avg_duration = round(sum(durations) / len(durations)) if durations else 0
    median_duration = round(statistics.median(durations)) if durations else 0

    return {
        "sessions": len(sessions),
        "page_views": len(page_views),
        "average_pages_per_session": round(len(page_views) / len(sessions), 2) if sessions else 0,
        "average_session_seconds": avg_duration,
        "median_session_seconds": median_duration,
        "csi_crossover_sessions": len({x for x in csi_sessions if x}),
        "csi_crossover_rate": round(len({x for x in csi_sessions if x}) / len(sessions), 3) if sessions else 0,
        "top_sources": _rank(source_counter),
        "top_pages": _rank(page_counter),
        "top_entry_pages": _rank(entry_counter),
        "daily_sessions": [{"date": d, "sessions": sessions_by_date.get(d, 0)} for d in dates],
    }


def _cloudfront_metrics():
    if not PUBLIC_DISTRIBUTION_ID:
        return {"available": False}
    end = _now()
    start = end - timedelta(hours=24)
    dimensions = [
        {"Name": "DistributionId", "Value": PUBLIC_DISTRIBUTION_ID},
        {"Name": "Region", "Value": "Global"},
    ]
    queries = [
        {
            "Id": "requests",
            "MetricStat": {
                "Metric": {"Namespace": "AWS/CloudFront", "MetricName": "Requests", "Dimensions": dimensions},
                "Period": 3600,
                "Stat": "Sum",
            },
            "ReturnData": True,
        },
        {
            "Id": "errors4",
            "MetricStat": {
                "Metric": {"Namespace": "AWS/CloudFront", "MetricName": "4xxErrorRate", "Dimensions": dimensions},
                "Period": 3600,
                "Stat": "Average",
            },
            "ReturnData": True,
        },
        {
            "Id": "errors5",
            "MetricStat": {
                "Metric": {"Namespace": "AWS/CloudFront", "MetricName": "5xxErrorRate", "Dimensions": dimensions},
                "Period": 3600,
                "Stat": "Average",
            },
            "ReturnData": True,
        },
    ]
    try:
        response = CLOUDWATCH.get_metric_data(
            MetricDataQueries=queries,
            StartTime=start,
            EndTime=end,
            ScanBy="TimestampAscending",
        )
        data = {x["Id"]: x.get("Values", []) for x in response.get("MetricDataResults", [])}
        requests = int(round(sum(data.get("requests", []))))
        rate4 = round(sum(data.get("errors4", [])) / len(data.get("errors4", [])), 3) if data.get("errors4") else 0
        rate5 = round(sum(data.get("errors5", [])) / len(data.get("errors5", [])), 3) if data.get("errors5") else 0
        return {
            "available": True,
            "window_hours": 24,
            "requests": requests,
            "error_rate_4xx": rate4,
            "error_rate_5xx": rate5,
            "healthy": rate5 < 1.0,
        }
    except Exception as exc:
        print("CloudFront metric lookup failed:", repr(exc))
        return {"available": False}


def _overview(event):
    origin = _origin(event)
    items_30 = _query_days(30)
    today = _now().date().isoformat()
    items_7 = [x for x in items_30 if (x.get("event_ts") or "")[:10] >= (_now().date() - timedelta(days=6)).isoformat()]
    items_today = [x for x in items_30 if (x.get("event_ts") or "")[:10] == today]

    latest = max((x.get("event_ts", "") for x in items_30), default="")
    freshness_minutes = None
    if latest:
        try:
            latest_dt = datetime.fromisoformat(latest.replace("Z", "+00:00"))
            freshness_minutes = max(0, round((_now() - latest_dt).total_seconds() / 60))
        except ValueError:
            pass

    payload = {
        "generated_at": _now().isoformat().replace("+00:00", "Z"),
        "privacy": {
            "raw_ip_stored": False,
            "fingerprinting": False,
            "retention_days": RETENTION_DAYS,
            "unit": "browser session",
        },
        "today": _summarize(items_today, 1),
        "last_7_days": _summarize(items_7, 7),
        "last_30_days": _summarize(items_30, 30),
        "freshness": {
            "latest_event_at": latest or None,
            "minutes_since_latest_event": freshness_minutes,
        },
        "operations": _cloudfront_metrics(),
    }
    return _json_response(200, payload, origin)


def _digest():
    day = _now().date() - timedelta(days=1)
    items = _query_days(1, end_date=day)
    summary = _summarize(items, 1)
    sources = ", ".join(f"{x['name']} {x['count']}" for x in summary["top_sources"]) or "None"
    pages = ", ".join(f"{x['name']} {x['count']}" for x in summary["top_pages"]) or "None"
    subject = f"EdwardDClark.com daily site digest — {day.isoformat()}"
    body = "\n".join([
        f"EdwardDClark.com Site Observatory — {day.isoformat()}",
        "",
        f"Sessions: {summary['sessions']}",
        f"Page views: {summary['page_views']}",
        f"Average pages/session: {summary['average_pages_per_session']}",
        f"Median session duration: {summary['median_session_seconds']}s",
        f"CSI crossover sessions: {summary['csi_crossover_sessions']}",
        "",
        f"Top sources: {sources}",
        f"Top pages: {pages}",
        "",
        "Privacy: no raw IP storage; 30-day telemetry retention.",
    ])
    try:
        SES.send_email(
            FromEmailAddress=DIGEST_FROM_EMAIL,
            Destination={"ToAddresses": [DIGEST_TO_EMAIL]},
            ReplyToAddresses=[REPLY_TO_EMAIL],
            Content={"Simple": {"Subject": {"Data": subject}, "Body": {"Text": {"Data": body}}}},
        )
        return {"sent": True, "sessions": summary["sessions"]}
    except Exception as exc:
        print("Digest send failed:", repr(exc))
        return {"sent": False, "sessions": summary["sessions"]}


def handler(event, context):
    source = event.get("source")
    if source == "aws.events":
        return _digest()

    route = _route_key(event)
    if route == "POST /event":
        return _store_event(event)
    if route == "GET /overview":
        return _overview(event)
    if route == "OPTIONS /{proxy+}":
        return _json_response(204, {}, _origin(event))
    return _json_response(404, {"error": "not_found"}, _origin(event))
