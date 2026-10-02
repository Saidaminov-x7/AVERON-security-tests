# AVERON Architecture Inventory

This is a source-derived Task #19 snapshot of the five checked-out repositories.
It describes code and local verification only; it does not establish deployed
topology, production configuration, or live provider behavior.

## Repository map

| Repository | Architecture and entry points | Trust boundaries and important behavior |
|---|---|---|
| AVERON_backend | Node.js/TypeScript Fastify 5 API; pnpm workspace; Prisma 5/PostgreSQL; Redis; Pino. The API entry point is `apps/api/src/server.ts`; route modules are under `apps/api/src/modules`. Startup validates configuration and runs the guarded `prisma migrate deploy` entry point. | PostgreSQL is the commerce source of truth. Redis backs shared security state/rate limiting. Auth, admin RBAC, product/catalog, cart/order, promo, outfit, wishlist, recommendation, media, AI, webhook, Telegram, SMS, and integration code are server-side. Parser imports are service-token protected and remain `PENDING_REVIEW`. |
| AVERON_frontend | Next.js App Router, React, TypeScript, locale-aware routing, React Query, Zustand, and an Axios API client. API access is through the frontend backend proxy; app routes live under `app/[locale]`. | Client state is presentation state, not commerce authority. The repository retains both pnpm and npm lockfiles; the deployment hook uses npm, so both lockfiles must be updated together when dependencies change. |
| AVERON_admin_panel | React, Vite, TypeScript, React Router, React Query, and Zustand. Route definitions and guards are in `src/routes.tsx` and `src/components/ProtectedRoute.tsx`; pages and API adapters are split under `src/pages` and `src/lib`. | UI capabilities and guards do not grant privileges. Backend role checks remain authoritative. Page-level splitting is used; `NotFoundPage` is now lazy-loaded and emitted as a separate production chunk. |
| AVERON_parser | Node.js/TypeScript Fastify service; Playwright Chromium; provider adapters and bounded browser-request limiter under `src`. The 1688 adapter routes browser requests through `src/security/external-url.ts`; backend imports use the server-side service token. | Provider extraction is not publication. Requests are bounded and marketplace host/address checks block known private/link-local targets, but DNS validation is not pinned to the address used by Chromium; see the Task #19 findings. Pinduoduo has no real transport and is reported as blocked/not live-verified. |
| AVERON_security_tests | Node.js built-in test runner and policy scripts. Owns source-invariant tests, API inventory generation, safe probes, static-scan orchestration, and gated staging-only DAST/Schemathesis workflows. | This repository is a test harness, not a deployable service. Scanner output is required to be fresh; missing tools or reports remain a failed/unverified scan, not a clean result. |

## Backend API inventory and coverage

The maintainable endpoint registry is generated from TypeScript route
declarations and plugin prefixes by
[`generate-api-registry.mjs`](../scripts/generate-api-registry.mjs). Its latest
snapshot, [`api-endpoint-registry.json`](./api-endpoint-registry.json), contains
159 endpoint records:

| Registry status | Count |
|---|---:|
| TESTED | 5 |
| PARTIAL | 52 |
| NOT_TESTED | 102 |
| BLOCKED | 0 |

Each record includes method/path, source module and line, inferred access/role,
declared schema evidence, rate-limit category, ownership expectation, feature
flag evidence, sensitivity classification, and related test evidence. The
generator is deliberately conservative: importing a schema or finding a nearby
module test is not proof that the route enforces it. The registry is static
evidence, not a runtime authorization audit, and dynamic route behavior still
requires source/runtime review.

## Runtime boundaries and controls observed

- **Authentication and authorization:** backend auth and admin role middleware
  are the authorization boundary. Frontend/Admin guards are UX controls only.
  Signing secrets are required by startup validation; no production-safe
  secret fallback was found.
- **Commerce and persistence:** product, variant, price, inventory, discount,
  and order data are reloaded server-side. Prisma migrations deploy
  non-destructively with `migrate deploy`; no production database or destructive
  migration command was used during this audit.
- **Shared state:** the global rate limiter uses Redis and fails closed when
  its shared store fails. The adaptive limit setting uses a short-lived cache.
  Deployment behavior under a Redis outage was not tested against a live
  multi-instance environment.
- **CORS and headers:** backend CORS uses explicit configured origins plus two
  source-defined Vercel origins and credentials; wildcard credentialed CORS was
  not found. Fastify Helmet is enabled with a backend CSP. Frontend CSP and
  externally sourced content have deployment-dependent concerns recorded in
  [`task19-audit-findings.md`](./task19-audit-findings.md).
- **Proxy and client IP:** backend Fastify is configured with `trustProxy: true`
  for the expected Railway proxy. The real trusted-hop/CIDR boundary and direct
  origin reachability cannot be established from source.
- **Provider status:** iPost, SMS, n8n, currency, Telegram, and marketplace
  capability labels distinguish implementation/mock coverage from live
  verification. No provider was treated as live-verified merely because a
  feature flag or adapter exists.
- **Errors and logs:** backend production errors return generic 500 messages;
  health responses do not reveal internal AI endpoints/models; registration and
  reset diagnostics no longer include account PII; slow-query diagnostics log
  duration only, not SQL or query parameters. Parser public error messages are
  sanitized.
- **Parser egress:** parser source URLs are HTTPS/allowlisted and browser
  requests are intercepted. The allowlist DNS check and browser connection are
  separate resolutions, so source-level checks alone do not close DNS-rebinding
  risk.

## Local verification snapshot

The Task #19 changes were validated locally with:

- Backend build and API test suite: 42 files / 298 tests passed.
- Frontend production build and tests: 25 files / 107 tests passed; 32 routes
  were discovered by the route inventory script.
- Admin production build and tests: 9 files / 47 tests passed. `NotFoundPage`
  appears as its own emitted chunk; lint completed with 14 warnings.
- Parser TypeScript build and tests: 23 tests passed; ESLint completed.
- Backend ESLint completed with zero errors and 77 warnings; the top warning
  classes are `no-explicit-any` (44) and `no-unused-vars` (33).
- Security harness: 31 policy tests and 19 cross-repository regressions passed,
  including the slow-query logging invariant.
- Full dependency audits after patch updates: zero advisories in Backend,
  Frontend pnpm, Frontend npm deployment lockfile, Admin, and Parser graphs.

Semgrep, Trivy, and Gitleaks were unavailable in the local environment during
the recorded static scan. The harness correctly marks all required scanner /
repository pairs as failed and the baseline as `NOT_VERIFIED`; this is not a
clean scan or a security certification. Staging-only ZAP and Schemathesis were
not run because no approved staging target was supplied.

## Verification limits

Source review cannot confirm deployed environment variables, proxy topology,
secret-store contents or historical rotation, TLS termination, real Redis
failure behavior, database isolation under concurrent production load, SMS /
shipping / marketplace provider contracts, or current live service status.
Authentication/RBAC/IDOR and upload behavior are not uniformly covered by
runtime tests; the registry and UI matrix distinguish that evidence gap rather
than inferring success from schema declarations or route guards.
