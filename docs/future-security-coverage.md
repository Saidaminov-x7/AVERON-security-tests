# Security Coverage Extension Guide

This harness deliberately starts with policy, source/dependency/secret scans,
safe probes, migration checks, and environment guards. Add active tests only
after verifying the corresponding live route and fixture in the application
repository. Do not infer a route from a UI path.

## Adding an API regression test

1. Cite the backend route/plugin file in the test description.
2. Use a local fixture or a manually approved staging deployment; never point
   mutation tests at production.
3. Put mutation, malformed-input, ownership, upload, SSRF, rate-limit stress,
   and state-transition tests behind both `SECURITY_ENV !== "production-safe"`
   and `ALLOW_AGGRESSIVE_SECURITY_TESTS=true`.
4. Use test-only accounts and random resources; never brute-force real users.
5. Assert expected validation/auth responses separately from unexpected 5xx.
6. Ensure output excludes request bodies, cookies, tokens, uploaded bytes,
   embeddings, and provider credentials.

## Planned coverage areas

Create test files only when an actual route and non-production fixture exist:
authentication/session revocation; route-derived RBAC and resource ownership;
public product publication filters; parser import review states; outbound URL
validation and redirect blocking; media and Visual Search upload validation;
feature capability/provider gating; Visual Search audit/vector redaction;
configured CORS and headers; rate-limit 429 behavior; and safe error/log
redaction.

New tests must not pretend an unconfigured provider, vector store, OpenAPI
document, or staging target exists. Current Visual Search capabilities should
remain false when the flags/provider/storage are disabled.

## Current verification boundary

The source regression runner covers checked-in security invariants and Parser
URL-guard test presence. It is not a substitute for runtime ownership,
authorization, upload, SSRF redirect, or rate-limit testing. The API exposes
OpenAPI only outside production; the security harness does not invent a
production schema URL. Dynamic ZAP/Schemathesis runs remain staging-only and
require a protected target and explicit operator opt-in.

Commerce route-level regressions live with the backend API and are checked by
the cross-repository regression runner. They exercise cart/order ownership,
published-product and quantity checks, server-side pricing, idempotency,
stock claims, admin authorization, and sequential order/shipping transitions
using the API test harness. These tests use mocked Prisma behavior and do not
replace verification against a live PostgreSQL instance under concurrent load.
Frontend return-target tests reject external, protocol-relative, and malformed
localized paths; they do not substitute for an end-to-end authentication flow.

Parser review identified areas that need dedicated follow-up before claiming
complete SSRF/hostile-response coverage: DNS validation-to-connection
time-of-check/time-of-use, explicit response-body caps, request-body schema
validation, validation of the final navigated product URL, and restrictions
for configurable backend/AI destinations. These observations are not proof of
exploitation and were not silently treated as fixed by the presence of the
existing outbound URL guard.

Frontend review also identified dynamic CMS/imported URLs rendered as links
without visible scheme validation, a possible Visual Search CSP/API-origin
mismatch dependent on deployment configuration, and `unsafe-inline` /
`unsafe-eval` in the frontend script CSP. Confirm the production-facing API
origin and required Next.js script behavior before changing headers or
link-allowlisting policy. Historical secret scans may identify credentials
that require private investigation and rotation; the harness cannot verify
deployed secret-store values or claim rotation.
