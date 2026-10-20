#!/usr/bin/env python3
"""Validate JSON-LD date values and ProfilePage metadata in the static site."""

import json
import re
from datetime import date, datetime
from html.parser import HTMLParser
from pathlib import Path


ISO_DATE = re.compile(
    r"^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})?)?$"
)
ISO_DATETIME = re.compile(
    r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$"
)


class JSONLDScripts(HTMLParser):
    def __init__(self):
        super().__init__()
        self.blocks = []
        self._capture = False
        self._buffer = []

    def handle_starttag(self, tag, attrs):
        if tag == "script" and dict(attrs).get("type") == "application/ld+json":
            self._capture = True
            self._buffer = []

    def handle_data(self, data):
        if self._capture:
            self._buffer.append(data)

    def handle_endtag(self, tag):
        if tag == "script" and self._capture:
            self.blocks.append("".join(self._buffer))
            self._capture = False


def walk(value, path=()):
    if isinstance(value, dict):
        yield value, path
        for key, child in value.items():
            yield from walk(child, path + (key,))
    elif isinstance(value, list):
        for index, child in enumerate(value):
            yield from walk(child, path + (index,))


def validate_date(value, filename, path, field):
    if not isinstance(value, str) or not ISO_DATE.fullmatch(value):
        raise SystemExit(f"{filename}: invalid {field} at {path}: {value!r}")
    try:
        datetime.fromisoformat(value.replace("Z", "+00:00")) if "T" in value else date.fromisoformat(value)
    except ValueError as error:
        raise SystemExit(f"{filename}: invalid {field} at {path}: {value!r} ({error})") from error


def validate_profile_modified(value, filename, path):
    if not isinstance(value, str) or not ISO_DATETIME.fullmatch(value):
        raise SystemExit(
            f"{filename}: ProfilePage dateModified must be a complete ISO 8601 datetime with timezone "
            f"at {path}: {value!r}"
        )
    try:
        datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError as error:
        raise SystemExit(f"{filename}: invalid ProfilePage dateModified at {path}: {value!r} ({error})") from error


def main():
    profile_pages = 0
    for filename in sorted(Path("website").rglob("*.html")):
        parser = JSONLDScripts()
        parser.feed(filename.read_text(encoding="utf-8"))
        for index, block in enumerate(parser.blocks):
            try:
                document = json.loads(block)
            except json.JSONDecodeError as error:
                raise SystemExit(f"{filename}: invalid JSON-LD block {index}: {error}") from error
            for node, path in walk(document):
                for field in ("datePublished", "dateModified"):
                    if field in node:
                        validate_date(node[field], filename, path, field)
                types = node.get("@type", [])
                if isinstance(types, str):
                    types = [types]
                if "ProfilePage" in types:
                    profile_pages += 1
                    if "dateModified" not in node:
                        raise SystemExit(f"{filename}: ProfilePage is missing dateModified")
                    validate_profile_modified(node["dateModified"], filename, path)

    if profile_pages == 0:
        raise SystemExit("No ProfilePage JSON-LD found")
    print(f"Validated JSON-LD dates and {profile_pages} ProfilePage record(s).")


if __name__ == "__main__":
    main()
