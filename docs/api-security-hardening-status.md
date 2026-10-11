# AVERON API security hardening status — 2026-10-11

This is local source/test work only. It does not represent a completed
penetration test, staging release, or production activation. No production
configuration, DNS, database, or customer data was changed.

## Implemented in the current working tree

- Unknown Fastify routes return a generic 404 and do not reflect a submitted
  path, HTTP method, or query string.
- Fastify's automatic request serializer records only the HTTP method. It omits
  the raw URL/query string, headers, source IP, and request body; an integration
  test confirms an `access_token` query value is absent from the emitted log.
- The final Fastify error handler returns a generic message for every 5xx status,
  a fixed public 429 message, and records a truncated SHA-256 user identifier
  instead of a raw account ID. The fallback error handler also avoids logging
  serialized exception objects.
- Active Admin, media, AI-chat, and authentication handlers normalize caught
  errors where applicable: explicit 4xx/5xx statuses are preserved, but 5xx
  responses use a generic message and safe logs omit exception details. Cart,
  checkout, orders, reviews, fitting-room storage, product-media cleanup,
  analytics, and client error-report handlers likewise log only exception class
  names rather than serializing provider/Prisma details. The admin user collection is
  covered for unauthenticated 401, non-admin 403 before list queries, and
  sanitized database failure.
- Fastify proxy trust is now opt-in only: Railway environment variables no
  longer enable `trustProxy: true`. Forwarded IP/protocol headers are honored
  only when `TRUST_PROXY_ADDRESSES` explicitly lists verified proxy
  addresses/CIDRs. With an empty list, Fastify uses the direct peer address.
- 401/403 audit events persist the matched route template instead of the raw
  request URL, preventing query secrets and concrete resource identifiers from
  entering the audit record.
- Failed password-login lockout keys include both normalized account identity
  and `request.ip`; this avoids letting one remote source lock a victim's
  account. Keys are hashed before use. This does not prove `request.ip` is
  trustworthy behind the deployed proxy chain.
- Auth route rate-limit keys for login, registration, password reset, phone OTP,
  and 2FA are HMACs scoped by route, effective source IP, and normalized
  submitted identity. Redis no longer retains raw IP/email/phone/2FA-token
  strings in those keys; limits, windows, and route separation are unchanged.
- Repeated authorization denials from an authenticated principal are counted
  in Redis. Twelve 403 responses in five minutes generate one deduplicated
  administrator notification per hour; the event contains only a short hash
  of the account ID and the matched route template. This is an alert only: it
  never blocks the user, and Redis/notification failures do not change the
  original HTTP response. A failed notification retains a one-minute Redis
  retry cooldown, preventing every subsequent denied request from hammering
  the notification path.
- Repeated unknown-route 404 probes are counted per effective source in Redis.
  Forty unmatched 404s within five minutes create a deduplicated Admin incident
  containing only a short source hash. Matched-resource 404s and isolated
  unknown paths are ignored; this alert does not block a source or user.
- Repeated 404s on a registered parameterized route are counted per effective
  source and route template. Sixty missing-resource responses within five
  minutes create a deduplicated Admin incident; only the static route template
  and a short source hash are included. Successful reads and static collection
  routes are ignored, and no source/user is blocked.
- Successful reads of private resources are now counted as distinct hashed IDs
  for an authenticated account on five explicit detail-route templates: customer
  order detail, admin order detail, and admin user detail/session/AI-session.
  Route-specific thresholds (20, 50, or 30 distinct resources per five minutes)
  produce a deduplicated Admin incident. Redis stores only account/resource
  hashes, the set is capped at its route threshold, and the original resource ID
  is never logged or sent in a notification. This is an alert only; it neither
  rejects requests nor automatically blocks an account/source. Failed
  notifications use a one-minute retry cooldown rather than allowing every
  subsequent read to retry immediately.
- Commerce order list/detail/shipping/status operations require `ADMIN` or
  `SUPER_ADMIN`; customer order queries remain scoped to the authenticated
  owner. Cart, checkout, order, review, fitting-room upload/cleanup, and
  product-media cleanup failure logs retain only the error class name rather
  than serializing Prisma/provider exception details.
- Admin order status can no longer be changed to `PAID` solely by an API
  caller. The same database transaction now requires a `CommercePayment` row
  for that order with `PAID` state, exact order total/currency, non-null
  non-empty provider/reference values, and `paidAt`. Missing/mismatched settlement returns 409
  without changing order status/history. This validates a persisted payment
  record; it does not create provider verification or a payment webhook.
- The endpoint registry follows nested `app.register(...)` commerce plugins,
  resolves route-option/pre-handler aliases, and includes their role enums. It
  now contains 198 route records; fitting-room admin routes are recorded as
  `ADMIN` (`SUPER_ADMIN|ADMIN|MODERATOR`) rather than a false `PUBLIC`
  classification. This corrected an inventory false positive, not an
  authorization vulnerability in those handlers.
- Catalog reads permit configured read roles. Catalog mutations, imports,
  promo-code management, analytics, error-report access, media-library admin
  access, AI product suggestions, iPost, and Telegram operations require
  `ADMIN` or `SUPER_ADMIN`. Review moderation permits `SUPER_ADMIN`, `ADMIN`, or
  `MODERATOR`; `SUPPORT` cannot moderate.
- Added a low-load, read-only k6 catalog/search/filter/detail smoke harness.
  It defaults to loopback, caps at two virtual users, enforces p95/p99/error
  thresholds, and refuses production hostnames. A remote non-production run
  additionally requires explicit environment and approval variables.

## Verification performed

| Check | Result |
|---|---|
| Backend TypeScript type-check | PASS |
| Backend full API suite in this continuation | PASS — 60 files, 405 tests; loopback-only dummy environment values and mocks, no live DB/Redis connection |
| Backend production build in this continuation | PASS — Prisma Client generate + TypeScript compilation |
| Prisma schema validation in this continuation | PASS — `DATABASE_URL` set to loopback-only dummy value; validation does not connect to a database |
| Admin sidebar and product-form validation regressions in this continuation | PASS — 11 tests across 2 suites; admin production TypeScript/Vite build PASS |
| Storefront cart/catalog/loading/favorites/error/fitting-room regressions in this continuation | PASS — 25 tests across 7 suites; frontend production build PASS (Next.js warning: workspace-level `package-lock.json` ignored; config build otherwise succeeded) |
| Backend production build (`prisma generate` + `tsc`) | PASS — rerun after proxy-trust and route-monitoring changes |
| Backend full API suite | PASS after the monitor retry-cooldown change — 58 files, 396 tests; loopback-only dummy env and mocked/unit coverage, not real PostgreSQL/Redis integration |
| Backend focused auth/order/admin regressions | PASS — 105 tests across 8 suites |
| Commerce checkout/order ownership and transaction tests after safe error logging | PASS — 32 tests; API type-check and backend `git diff --check` also passed |
| Commerce checkout/order/review/fitting-room regression tests | PASS — 69 tests across 3 suites; API type-check, changed-file ESLint, and backend `git diff --check` passed using dummy loopback-only test environment values |
| Auth/admin/commerce safe-error regressions | PASS — 93 tests across 7 suites; API type-check passed; targeted ESLint had 0 errors and 10 pre-existing warnings in `admin/index.ts`; API security source invariants passed 27/27 |
| Global API error privacy and diagnostic logging | PASS — focused 89 backend tests across 6 suites; API TypeScript check passed; source-invariant suite 27/27; changed-file ESLint 0 errors and 10 existing admin warnings |
| Auth rate-limit key privacy | PASS — 4 focused HMAC-key tests; backend type-check and targeted ESLint pass |
| Backend targeted ESLint | PASS — 0 errors, 0 warnings in the changed files; full-repository lint was not run |
| Prisma schema validation | PASS; no migration was added for this hardening change |
| Security Tests policy suite | PASS — 50 tests in the current working tree |
| Cross-repository source regressions | PASS — focused `source-invariants.test.mjs` 26/26 after adding enumeration and auth-key invariants; the full regression wrapper was not rerun |
| Authorization-denial monitor tests | PASS — 4 unit tests for threshold, deduplication, privacy, retry and Redis failure behavior |
| Security monitor retry-cooldown tests | PASS — 9 focused tests across authorization-denial and successful-resource monitors; notification failures retain a 60-second cooldown |
| Trusted proxy tests | PASS — 3 tests; spoofed forwarded IP/protocol headers are ignored unless explicit trusted addresses are configured |
| Unmatched-route monitor tests | PASS — 6 tests for Fastify route-match integration, unmatched and parameterized-route thresholds, source-hash privacy, deduplication retry, and Redis failure handling |
| Successful private-resource enumeration monitor | PASS — 5 focused tests for route allowlist, distinct-ID thresholds, duplicate IDs, per-account separation, privacy, retry, and request-path failure isolation; API type-check and targeted ESLint pass. Redis Lua execution against a live Redis instance is NOT TESTED. |
| Automatic request-log privacy | PASS — 2 tests; Fastify emitted request log excludes query token, URL, headers, source IP, and body |
| Admin security-incident notification | PASS — desktop/mobile loopback E2E confirms the alert renders, marks read once and opens the audit log |
| JavaScript syntax check for k6 harness | PASS |
| k6 execution | NOT TESTED — k6 is not installed in the current environment |
| Hosted exact-SHA cross-repository run | PARTIAL — run `37796056829` on security-tests SHA `dfe45988600c910f4add76db0fb857e84c186810`: preflight and the full regression job passed, including API/UI checks and Playwright; final publisher failed with HTTP 403 from GitHub's commit-status API |
| Published source status | BLOCKED — `AVERON / cross-repository verify` remains pending on backend `339f3597`, frontend `929c29f`, admin `b0fc7d9`, and parser `34705c4`; the Admin and Frontend Vercel statuses are success on those hosted SHAs |
| Browser (Chrome DevTools), admin drawer at 390×844 | PASS — opens/closes; modal semantics, focus and body scroll lock observed; no horizontal overflow |
| Browser language dropdown in drawer | PASS — custom menu opened upward above the account footer, showed RU/UZ/EN flags/options; original Russian locale restored |
| Storefront dark theme at 390px | PASS — no horizontal overflow; readable text and contrasting add-to-cart control; local fixture only |
| Parser security suite | PASS — 27 tests cover external URL validation, DNS-pinned egress, redirect-to-private blocking, request limiting, and backend import DTO boundaries; run under Node 24.19 despite the repository's Node 22 engine declaration |
| Admin user access/error disclosure regression | PASS — 3 Fastify route tests: 401 without token, 403 before user enumeration, and generic 500 on simulated Prisma failure; safe-error utility tests 3/3 |
| Current focused commerce payment gate + admin user DTO/pagination tests | PASS — 38 tests across 2 suites; API TypeScript `tsc --noEmit` PASS |
| Current API endpoint registry policy | PASS — 5/5; registry regenerated with 198 extracted routes, nested cart/checkout/orders, explicit admin role aliases, and fitting-room permissions |
| Chrome DevTools live session in this continuation | NOT VERIFIED — `list_pages` timed out; no browser interaction was performed in this continuation |

## Open security/release blockers

- **PARTIAL — trusted proxy identity / automatic source restrictions:**
  Source-level implicit trust has been removed. `TRUST_PROXY_ADDRESSES` must
  contain explicit verified proxy addresses/CIDRs before forwarded headers are
  trusted. The real Railway/Cloudflare ingress chain, source ranges, and origin
  reachability still require staging verification; do not guess CIDRs or hop
  counts. With the list empty, users may share the ingress peer IP for limits.
  No automatic IP block has been added; NAT/mobile users must not be punished
  for a single failure.
- **PARTIAL — abuse detection and source restrictions:** repeated authenticated
  403s, high-volume unmatched-route 404 scans, repeated missing IDs on
  parameterized routes, and rapid successful reads on five explicit private
  detail-route templates now trigger deduplicated Admin notifications. The
  successful-read monitor does not cover every route or detect distributed
  enumeration across multiple accounts. No automatic temporary source
  quarantine is implemented. Do not block by
  `request.ip` until the Railway/Cloudflare forwarding chain and origin
  reachability are verified; otherwise shared ingress/NAT can cause false
  blocks.
- **NOT TESTED — k6 performance measurements.** The checked-in smoke is
  intentionally read-only; no authenticated checkout/admin workload was run.
- **BLOCKED — trusted payment provider integration.** The repository contains
  the `CommercePayment` persistence model but no provider client, webhook, or
  trusted settlement-ingest path. The `PAID` transition now fails closed until
  such a verified record exists. Provider selection, credentials, webhook
  signature contract, and staging credentials are required to implement and
  verify the actual payment flow; no provider has been guessed or contacted.
- Test commands ran under Node 24.19 in this host; the Security Tests and
  parser repositories declare Node 22. Repeat CI-critical acceptance on the
  pinned Node 22 runtime before release.
- **NOT VERIFIED — rate-limit behavior across multiple API instances, Redis
  outage behavior in deployment, PostgreSQL concurrency/query plans, and
  production field-level privacy.** No test/staging database was available;
  no production database was touched.
- **NOT VERIFIED — Cloudflare WAF, DDoS rules, origin lock, TLS, cache rules,
  and DNS.** No Cloudflare dashboard evidence or authorized staging host was
  available. A manual, non-activated checklist is in
  [`cloudflare-averon-runbook.md`](./cloudflare-averon-runbook.md). Production
  DNS was not modified.
- **NOT VERIFIED — current hosted GitHub checks / PR merge / deployment.**
  No new local changes were pushed. Security PR #7 remains open; its historical
  check rollup is red. The exact-SHA dispatch subsequently passed its preflight
  and regression jobs, but the source status writes still fail because the
  `AVERON_REPOS_READ_TOKEN` Actions secret lacks commit-status write permission.
  Replace that secret with a narrowly scoped token (or GitHub App token) granting
  Commit statuses: write on all four source repositories, then rerun the
  dispatch and verify the exact SHA status rollup before merge.

Before rollout, test proxy identity, rate-limit state, WAF/cache/TLS behavior,
authenticated user flows, and checkout races in a disposable staging
environment bound to the exact reviewed source SHAs.
