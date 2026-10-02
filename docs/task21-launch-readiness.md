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

## Task #21.1 — Local blocker closure status

This section supersedes the Task #21 local verification snapshot above for the
Task #21.1 work. It records the current local source/test remediation and fresh
Semgrep attempt; it does not convert missing hosted, staging, or infrastructure
evidence into a pass.

**Decision: `BLOCKED_FROM_PRODUCTION`.** Changes remain local and uncommitted.
No deployment, publication, baseline approval, or secret rotation claim was
made. The machine-readable record is
[`task21.1-release-manifest.json`](./task21.1-release-manifest.json).

### Current repository state

All repositories were on `main` at the supplied starting HEADs. Backend,
Frontend, Admin, and Security Tests contain local changes; Parser is unchanged.
No commits, pushes, PRs, tags, releases, or deployments were made. The manifest
records each exact HEAD and the local working-tree state.

### Source and local validation

- Backend: compromised default-secret rejection now compares a SHA-256
  fingerprint rather than retaining the raw value; test signing credentials
  are generated at runtime; CORS is limited to explicit validated origins; and
  adaptive rate limits target registered AVERON catalog, visual-search, and
  AI routes. `python-dotenv` is pinned to `1.2.2`.
- Frontend: Firebase browser configuration is environment-backed. It remains
  public client configuration, not a private secret; Firebase project identity
  and API restrictions have not been verified.
- Admin: the environment example uses the intended `https://averon.uz` site
  origin. Deployed origin/CORS configuration remains unverified.
- Security Tests: reports now distinguish empty scans, missing output, and
  scanner failure; add run/source metadata and digests; deduplicate findings;
  and test that unreviewed Critical/secret findings remain blocking.
- Backend type-check/build and full API suite passed (44 files, 302 tests).
  Frontend build and tests passed (25 files, 110 tests). Admin tests passed
  (9 files, 47 tests). Parser tests passed (27 tests). Security Tests policy
  suite passed (36 tests) and script syntax checks passed (36 files). AI
  service syntax/import and liveness-route checks passed with
  `python-dotenv==1.2.2`.

### Fresh scanner evidence

A local Semgrep `1.142.0` run produced zero findings in each output. Backend,
Admin, and Parser reports had no scanner errors. Frontend had four syntax/parser
errors in four TSX test files, so its zero-finding output is incomplete and
must not be treated as a clean scan. This run did not include Trivy or
Gitleaks, and it does not replace the inaccessible hosted security workflow.
The pre-existing generated security report remains stale/incomplete and the
baseline remains unestablished. No findings were approved or suppressed.

### Remaining production blockers

Hosted baseline enforcement and a complete fresh Semgrep/Trivy/Gitleaks run
remain blocked. Firebase ownership/restrictions, production CORS and canonical
origin, Cloudflare/Railway proxy and origin controls, staging spoof/cache/TLS
tests, Parser Chromium/container egress validation, PostgreSQL concurrency,
Redis multi-instance/outage behavior, customer/Admin/mobile browser E2E,
production migration status, backup evidence, and restore rehearsal remain
`NOT_VERIFIED`. No staging or production access was used. These gates must be
closed before any manual release; the local build/test results alone do not
establish production readiness.
