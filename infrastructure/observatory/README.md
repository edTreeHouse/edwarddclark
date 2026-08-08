# EdwardDClark.com Site Observatory

This component provides a lighter-weight observability layer for `edwarddclark.com`.

## Purpose

The Observatory answers four practical questions:

1. How is the personal site being discovered?
2. Which pages and entry paths receive attention?
3. How often do sessions cross from the personal site to `collectivestateinference.org`?
4. Is the site being delivered cleanly through CloudFront?

It is intentionally smaller than the CSI Observatory and does not perform research-state inference.

## Architecture

```text
Public browser at edwarddclark.com
  -> attribution.js
  -> API Gateway HTTP API
     -> POST /event (public ingestion; origin checked in Lambda)
     -> GET /overview (Cognito JWT required)
  -> Lambda
  -> DynamoDB event table (30-day TTL)

Private browser at observatory.edwarddclark.com
  -> CloudFront
  -> private S3 origin
  -> Cognito hosted login with password + software-token MFA
  -> GET /overview
  -> aggregate metrics only

EventBridge
  -> Lambda daily digest
  -> Amazon SES
```

## Privacy boundary

The public tracker is deliberately privacy-minimized:

- Global Privacy Control and Do Not Track are honored.
- Browser automation signals are excluded.
- Raw IP addresses are never written to DynamoDB.
- Browser fingerprinting is not used.
- No name, email address, account identifier, or form content is collected.
- URL query strings and fragments are omitted from telemetry.
- A random browser-session identifier is stored only in `sessionStorage`.
- Telemetry expires automatically after 30 days.
- The private API returns aggregates, not raw event records.

The operational unit is a browser session, not a person.

## Metrics in v1

- Sessions today, 7 days, and 30 days
- Page views and pages per session
- Median session duration proxy
- Acquisition sources
- Top pages and entry pages
- 14-day daily session trend
- Sessions crossing to `collectivestateinference.org`
- CloudFront request volume and 4xx/5xx error rates
- Telemetry freshness
- Daily email digest

## Authentication

The private dashboard is hosted at `observatory.edwarddclark.com`.

- Cognito self-registration is disabled.
- The owner account is created administratively.
- Password policy minimum length is 14 characters.
- Software-token MFA is mandatory.
- OAuth uses authorization code flow with PKCE.
- Access tokens are kept in `sessionStorage`.
- The API Gateway `/overview` route requires a Cognito JWT.

The HTML shell itself contains no analytics data; all private data requires an authenticated API request.

## Deployment

`.github/workflows/deploy-site-observatory.yml` performs the production deployment using the existing GitHub OIDC AWS deployment role.

The workflow validates the implementation, resolves the existing public-site resources, packages the Lambda code, deploys the Observatory stack, generates the private runtime configuration, publishes the dashboard, activates public telemetry, invalidates CloudFront, and verifies that unauthenticated private API access is rejected.

The normal public-site deployment workflow also restores the live telemetry configuration after `aws s3 sync --delete`, so a routine site deployment does not accidentally disable analytics.

## Daily digest

The digest runs at 13:15 UTC and summarizes the previous UTC day. The initial configuration sends from the already verified CSI notification identity:

- From: `notifications@collectivestateinference.org`
- To: `ed@collectivestateinference.org`

This can later be moved to an `edwarddclark.com` sender after an SES identity is established for that domain.
