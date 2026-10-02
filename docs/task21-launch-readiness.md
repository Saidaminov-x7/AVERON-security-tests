# Task #21 — Production launch readiness

## Decision

**BLOCKED_FROM_PRODUCTION.** Do not deploy. Local source and test changes are
uncommitted, the hosted security-baseline failure cannot be tied to its run
artifact, and the required staging, infrastructure, database, and browser
evidence is unavailable. No production deployment or publication was attempted.

## Repository snapshot

Before edits, all five repositories were clean on `main`; Task #20 changes were
already part of their current history. The initial HEADs were:

| Repository | Initial HEAD |
| --- | --- |
| `AVERON_backend` | `051deb8cd67a65ff2ac6a51e0840b2f960d0a118` |
| `AVERON_frontend` | `b3d7397bcc1bd9e1c69d911e5e08a67952e50ff9` |
| `AVERON_admin_panel` | `be4803c03f0b62cc4cf0715eeea156b3bdb47847` |
| `AVERON_parser` | `143772ee7a0767eaf0ec373956ae0719e4d33396` |
| `AVERON_security_tests` | `ad50f4e99b7ea2fddbe5bce3c8fe98360f242569` |

Task #21 changes are local and uncommitted in Backend, Parser, and Security
Tests. Frontend and Admin have no Task #21 source changes. No migration files
were changed. No commit, push, pull request, tag, release, or deployment was
created.

## Security baseline evidence

The hosted Actions run and its artifact could not be retrieved: the available
GitHub Actions integration returned 404 for the Security Tests repository.
Therefore, the precise cause of the reported hosted failure is
**NOT_VERIFIED**.

The locally available report is dated `2026-10-02T13:31:01.727Z`. It is
`NOT_VERIFIED`, has `established: false`, zero approved fingerprints, no
findings, and lists all 18 required scan/output pairs as missing. The empty
findings array is not a clean scan.

| Finding / scan evidence | Repository | Tool | Severity | Baseline state | Current evidence | Why the gate fails / remains blocked |
| --- | --- | --- | --- | --- | --- | --- |
| Required scanner outputs missing | Backend, Frontend, Admin, Parser | Semgrep | NOT_DETERMINED | Unestablished; no approved findings | Sidecar execution records say success, but normalized report files are absent and `tool-execution.json` says failure | Report status is `NOT_VERIFIED`; scanner output cannot be evaluated |
| Required scanner outputs missing | Backend, Frontend, Admin, Parser | Trivy | NOT_DETERMINED | Unestablished; no approved findings | SARIF output/complete execution evidence is absent in the local report set | Four required Trivy results are missing |
| Required scanner outputs missing | All four application repositories and Security Tests | Gitleaks current files + Git history | NOT_DETERMINED | Unestablished; no approved findings | Sidecar execution records say success, but normalized output files are absent and `tool-execution.json` says failure | Ten required Gitleaks results are missing |

The checked-in policy still blocks new unbaselined CRITICAL/HIGH findings and
all secret candidates. It was not weakened or edited. The local evidence
indicates an incomplete/mismatched scanner artifact set, not a verified
high-severity finding; it does not establish why the inaccessible hosted run
failed. A fresh complete CI run and its redacted artifact are required.

## Source remediation performed

- **Parser SSRF:** Added a loopback-only HTTP CONNECT proxy for Chromium. For
  every tunnel it resolves the approved marketplace host, rejects the
  connection if any answer is non-public, and connects directly to one of the
  vetted IP literals rather than asking Chromium/the OS to resolve the host
  again. Redirect destinations cause new tunnel checks. Chromium uses the
  proxy, disables QUIC, disables non-proxied WebRTC UDP, and removes the
  implicit loopback proxy bypass. Existing request interception remains as
  defense in depth. Private, link-local, reserved, IPv4-mapped IPv6, and
  non-global IPv6 ranges are rejected.
- **Backend forwarded IP trust:** Replaced unconditional `trustProxy: true`
  with an explicit `TRUST_PROXY_ADDRESSES` IP/CIDR allowlist. It defaults to
  trusting no forwarding headers; CIDR `/0` wildcard entries are rejected.
  Production logs a warning when unset. The actual Railway/Cloudflare
  addresses must be established before setting it.
- Added Parser proxy/rebinding and address-range tests, a Backend spoofed-header
  unit test, and Security Tests regression assertions for both controls.

These are source-level remediations only. They do not establish the production
egress boundary, deployed forwarding chain, or staging behavior.

## Local verification

| Check | Result |
| --- | --- |
| Parser tests | PASS — 27 tests |
| Parser typecheck, build, lint | PASS |
| Backend full API suite | PASS — 300 tests with disposable test-only configuration and a longer test timeout |
| Backend focused forwarded-header tests | PASS — 2 tests |
| Backend typecheck, build, Prisma schema validation | PASS |
| Backend lint | PASS with existing warnings; no lint errors |
| Frontend tests and production build | PASS — 110 tests |
| Admin tests and production build | PASS — 47 tests |
| Security Tests policy suite | PASS — 31 tests |
| Cross-repository source regressions | PASS — 20 tests |
| Migration policy and harness syntax checks | PASS |
| `git diff --check` | PASS across all five repositories |

The first unconfigured Backend test invocation did not run cleanly because
required test environment variables were absent and one timing-sensitive test
hit its five-second limit. The full suite passed after rerunning with
disposable local values, two workers, and a 15-second test timeout. No
production credentials were read or used.

## Mandatory launch gates

| Gate | Status | Evidence / remaining requirement |
| --- | --- | --- |
| Hosted security-baseline enforcement | BLOCKED | Run artifact unavailable; local normalized report is incomplete and baseline is unestablished |
| Fresh Semgrep, Trivy, and Gitleaks scans across required repositories | NOT_VERIFIED | No complete fresh output set available locally |
| Parser connection-time SSRF protection | NOT_VERIFIED | Proxy logic and tests pass; Chromium-through-proxy and container/network egress behavior not exercised in staging |
| Proxy spoofing and trusted-hop configuration | NOT_VERIFIED | Local Fastify test proves default ignores forged headers; Railway/Cloudflare peer chain and staging spoof tests unavailable |
| Railway origin access restriction | NOT_VERIFIED | Deployment docs say Cloudflare/origin rules are not configured; direct-origin reachability was not tested |
| Cloudflare WAF, TLS Full (strict), rate rules, cache bypass, security headers | NOT_VERIFIED | No Cloudflare account/config evidence |
| Staging TLS, redirects, cookies, CORS/CSP, authenticated cache isolation | NOT_VERIFIED | No staging URL or authorized test credentials supplied |
| Runtime API authorization, IDOR/BOLA, Admin RBAC | NOT_VERIFIED | Local source tests exist; staging/runtime behavior not established |
| Checkout/promo concurrency and immutable order snapshots | NOT_VERIFIED | No disposable PostgreSQL/staging environment for race testing |
| Customer/Admin/mobile browser E2E | NOT_VERIFIED | Local builds/tests pass; no end-to-end browser run against disposable seeded data |
| Production secret presence and strength | NOT_VERIFIED | Secret values were not inspected; production environment access unavailable |
| Production backup, restore rehearsal, pending migration review/status | NOT_VERIFIED | No production database access or backup evidence; no production migration was run |
| PostgreSQL/Prisma connection budget and multi-instance behavior | NOT_VERIFIED | Deployed replica, pooler, and database limits unavailable |
| Redis shared-state and failure behavior | NOT_VERIFIED | Staging multi-instance/failure tests unavailable |
| Health endpoints and deployed dependency behavior | NOT_VERIFIED | Local API was not started against a disposable database/Redis deployment |
| Analytics taxonomy, production canonical origin, legal pages, localization | NOT_VERIFIED | No production-domain or legal review evidence gathered in this launch pass |
| iPost/Pinduoduo/currency optional-provider safety | PASS (source/config status only) | Keep disabled when unconfigured. iPost remains `TESTED_WITH_MOCK`, `NOT_CONFIGURED`, `NOT_LIVE_VERIFIED`; Pinduoduo remains `BLOCKED_BY_PROVIDER`; no trusted currency provider is available |
| Production deployment | NOT_APPLICABLE | Explicitly not attempted; Task #21 changes are unpublished and local |

Prior Task #19 audit detail and known route-coverage limits remain in
[`task19-audit-findings.md`](./task19-audit-findings.md). Existing source/test
coverage is not a substitute for current staging evidence.

## Release runbook (not executed)

1. Obtain a fresh successful security workflow run, inspect the complete
   redacted artifact, and triage every CRITICAL/HIGH or secret candidate
   without changing the enforcement policy.
2. Deploy the reviewed local changes through the user-controlled release
   process only after they are manually reviewed and published. Keep the
   Parser feature disabled until its deployed proxy and network egress behavior
   are verified.
3. In isolated staging, verify the real client → Cloudflare → Railway → Fastify
   chain; test forged `X-Forwarded-For`, `Forwarded`, and `X-Real-IP`; verify
   origin reachability; validate TLS/cache/CORS/security headers; and run
   customer/Admin browser journeys and critical authorization/race tests.
4. Before any production migration, enumerate and review every pending SQL
   migration, confirm a current backup and retention, perform a restore
   rehearsal, confirm rollback/mitigation and connection budget, then use only
   `prisma migrate deploy` after explicit release approval.
5. Verify independent production/staging secrets and services, Redis/OTP/
   rate-limit behavior across at least two API instances, health/readiness,
   monitoring/alerts, SEO origin, legal approval, and rollback procedure.
6. Deploy only after every mandatory launch gate is PASS. If any item remains
   FAIL, BLOCKED, or NOT_VERIFIED, stop at `RELEASE_READY_NOT_PUBLISHED`.

No staging or production deployment was performed during Task #21.
