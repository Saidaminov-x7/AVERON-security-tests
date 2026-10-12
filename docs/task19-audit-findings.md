# Task #19 Audit Findings

## Scope and confidence

This report records concrete source findings and verification limits across
Backend, Frontend, Admin, Parser, and Security Tests. It is not a production
penetration test. No production database, user account, secret store, or
provider was accessed. No Task #20+ work, commit, push, or pull request was
performed.

## Findings requiring follow-up

| Severity | Component | Evidence | Why not fixed in this task | Recommended remediation |
|---|---|---|---|---|
| HIGH | Parser SSRF / Chromium egress | `AVERON_parser/src/security/external-url.ts` resolves marketplace hosts and rejects known private addresses; `AVERON_parser/src/adapter-1688.ts` validates intercepted requests, then calls `route.continue()`. Chromium resolves the hostname separately from the validation lookup. | A source-only check cannot bind Chromium's eventual socket to the address that was checked. Changing browser transport or proxying without a verified Chromium/network design could break marketplace access or leave the bypass intact. | Use an egress proxy that resolves once, validates, and pins the destination connection, or enforce equivalent network-level egress restrictions. Test redirects, DNS changes, IPv4/IPv6, and metadata/private ranges in an isolated environment. |
| MEDIUM | Backend proxy trust / IP-based controls | Fastify uses `trustProxyOption(TRUST_PROXY_ADDRESSES, isRailwayRuntime)`; the option returns `true` when Railway variables are present and the explicit allowlist is empty, while `request.ip` is used in rate-limit identity. | The Railway/Cloudflare origin exposure and trusted proxy chain are deployment-owned and were not available for verification. A guessed hop count or CIDR could break routing or still trust attacker-controlled forwarding headers. | Restrict the origin to the known proxy path and configure Fastify with the verified proxy identity strategy. Verify spoofed `X-Forwarded-For` cannot change effective client identity in staging. |
| MEDIUM | Static security assurance | `AVERON_security_tests/reports/raw/tool-execution.json` records failure for all 18 required Semgrep, Trivy, and Gitleaks scanner/repository pairs. The tools were unavailable locally; the harness removed stale outputs and the baseline remains `NOT_VERIFIED`. | No current scanner output exists to review. Reporting a clean scan or using old artifacts would be misleading. | Run the pinned scanners in an approved CI environment with read access to all four app repositories, then review fresh reports and keep the baseline gate enabled. |
| MEDIUM | API regression coverage | `docs/api-endpoint-registry.json` has 159 routes: 5 `TESTED`, 52 `PARTIAL`, 102 `NOT_TESTED`. Existing tests provide useful module evidence but do not cover every important route at runtime. | A production-like database, isolated staging fixtures, and approved destructive/security test boundaries are not available here. Mock-based coverage cannot establish PostgreSQL concurrency or deployed middleware behavior. | Add local `fastify.inject` tests by critical route family, then separately run explicitly approved staging checks for authentication, RBAC/IDOR, uploads, rate limits, and concurrent checkout. |
| LOW | Backend lint debt | Backend ESLint completed without errors but reported 77 warnings: 44 `no-explicit-any` and 33 `no-unused-vars`. | Broad lint cleanup would touch unrelated code and is not evidence of a security fix. | Triage in focused changes; prioritize warnings at external boundaries and privileged operations. Do not suppress rules to improve the count. |
| LOW | Admin lint debt | Admin `oxlint` completed without errors but reported 14 warnings, including effect-driven state updates, impure render-time `Date.now`, and fast-refresh export boundaries. | These are spread across unrelated screens/providers; opportunistic edits could change page behavior beyond the audited fix. | Triage each warning with focused UI tests and avoid lint suppressions. |
| LOW | Browser-level UI assurance | [`ui-coverage-matrix.md`](./ui-coverage-matrix.md) records no storefront/Admin end-to-end browser suite; outfit-builder and wishlist-sharing UI interactions have no focused UI tests. | No existing browser harness/test accounts were available for reliable, isolated end-to-end testing. | Add browser journeys against a disposable seeded environment for outfit editing/cart validation and wishlist sharing/revocation; test error/loading states and clipboard behavior. |

## Fixed during Task #19

- Backend production error handling and AI health diagnostics no longer return
  internal URLs, model names, raw provider error text, stacks, or query URLs.
- Registration/reset diagnostics and admin notifications no longer include
  unnecessary email/name details.
- Slow Prisma-query diagnostics now record duration only; SQL and parameter
  content are not logged. A source regression assertion protects this.
- Parser session/search failures return controlled client messages and avoid
  raw provider error text in logs.
- Admin not-found page is lazy-loaded, removing the ineffective static/dynamic
  import overlap observed in the build.
- Backend was migrated to Fastify 5 with compatible plugins; its production
  dependency audit and full dependency audit are clean after the patch updates.
- Frontend Vitest was upgraded to the patched 4.x release, and patched
  `brace-expansion`/`js-yaml` versions are enforced in both pnpm and npm
  dependency graphs.
- The scanner runner clears stale artifacts before scanning and refuses to
  treat missing/fresh-output-free scans as successful.

## Verified dependency and build state

| Repository / graph | Audit result |
|---|---|
| Backend pnpm workspace, all dependencies | 0 advisories |
| Frontend pnpm lockfile, all dependencies | 0 advisories |
| Frontend npm deployment lockfile, all dependencies | 0 advisories |
| Admin pnpm lockfile, all dependencies | 0 advisories |
| Parser npm lockfile, all dependencies | 0 advisories |

| Verification | Result |
|---|---|
| Backend build and API suite | Passed; 42 files / 298 tests |
| Frontend production build and suite | Passed; 25 files / 107 tests |
| Admin production build and suite | Passed; 9 files / 47 tests |
| Parser build, typecheck, and suite | Passed; 23 tests |
| Security harness policy suite | Passed; 31 tests |
| Cross-repository security regressions | Passed; 19 tests |

A clean dependency audit does not prove which lockfile a deployment uses; the
Frontend intentionally maintains both npm and pnpm lockfiles because its
deployment hook invokes npm.

## Unverified deployment-sensitive areas

The local audit cannot establish production trusted-proxy topology, deployed
CORS origins/TLS, secret-store values or historical rotation, multi-instance
Redis behavior, real PostgreSQL checkout concurrency, live SMS/iPost/n8n/
marketplace integrations, or staging DAST results. Provider capability labels
remain mock/not-configured/not-live-verified unless actual live evidence is
recorded. No weak secret default, destructive migration, or production data
operation was introduced.
