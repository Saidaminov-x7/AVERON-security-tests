# AVERON Security Tests

Private security-testing harness for AVERON backend, storefront, Admin panel,
and Parser. This repository is a local/CI/staging test suite, not an
application service; do not deploy it to Railway.

## Safety profiles

| `SECURITY_ENV` | Allowed use | Aggressive suites |
|---|---|---|
| `local` | Explicit loopback HTTP or HTTPS target | Require `ALLOW_AGGRESSIVE_SECURITY_TESTS=true` |
| `staging` | HTTPS origin listed in `SECURITY_STAGING_ALLOWED_ORIGINS` | Require the opt-in; staging workflow is manually dispatched and should use protected GitHub Environment approvals |
| `production-safe` | HTTPS origin listed in `SECURITY_PRODUCTION_SAFE_ALLOWED_ORIGINS` | Always refused |

Every target is explicit. Hostname heuristics are not a safety control. The
allowlists must contain bare origins, comma-separated, with no credentials or
paths. Production-safe probes use only fixed, non-authenticated GET checks;
they do not follow redirects, submit payloads, upload files, or retain response
bodies. Do not provide production credentials to this test harness.

Example, local backend:

```powershell
$env:SECURITY_ENV = "local"
$env:SECURITY_SERVICE = "backend"
$env:SECURITY_TARGET_URL = "http://127.0.0.1:8080"
npm run security:safe
```

For cross-repository regressions and static scans, check out all four
application repositories beside this repository, then set their common parent:

```powershell
$env:AVERON_SOURCE_ROOT = "C:\work\AVERON"
npm run security:regression
npm run security:static
```

The regression runner expects directories named `AVERON_backend`,
`AVERON_frontend`, `AVERON_admin_panel`, and `AVERON_parser` under that root.
The static command requires Semgrep, Trivy, and Gitleaks to be installed and
records each scanner's actual exit result and repository coverage. It fails
closed when a required scanner or source checkout is missing. Do not install
scanners from unreviewed sources or send private source to third-party hosted
scanning services.

An aggressive local or staging run additionally requires
`$env:ALLOW_AGGRESSIVE_SECURITY_TESTS = "true"`. Staging API tests also require
an explicit `SECURITY_OPENAPI_URL` on the same origin. Production-safe mode
refuses those commands even if the opt-in is set.

## Commands

```text
npm run security:tests       Run local policy and regression tests
npm run security:migrations  Verify the app's production migration command
npm run security:safe        Run fixed safe GET checks against one service
npm run security:static      Run Semgrep, Trivy, and redacted Gitleaks scans
npm run security:api         Run gated Schemathesis checks against OpenAPI
npm run security:dast        Run gated OWASP ZAP scan
npm run security:full        Run the full locally gated harness test suite
npm run security:report      Generate normalized JSON and Markdown reports
```

Static tools are separate executables: CI pins Semgrep `1.142.0`, Trivy
`v0.75.0`, and Gitleaks `v8.28.0`; dynamic CI pins ZAP action versions and
Schemathesis `4.32.0`. Local tool absence is reported as an error; missing scan
results are never represented as clean.
Generated files are written under `reports/generated/` and raw scanner output
under `reports/raw/`; both are ignored by Git. Raw scanner files stay on the
runner because tools can include matched source context. CI uploads the
normalized report and redacted Trivy SARIF, not raw scanner output. The
normalized report contains location/rule summaries only for Gitleaks findings,
never secret values. A generated report is `NOT_VERIFIED` until every required
scanner/repository pair has a successful execution record and declared scope.
`STATIC_COMPLETE_DYNAMIC_NOT_RUN` means static scans completed; it is not a
security certification, and the report lists staging-only dynamic scans as
unrun. A clean-looking report without scanner output is expressly not a pass.
Current automated coverage exercises safety-policy guards, mocked safe-probe
behavior, source invariants, and existing application test suites in CI. It
does not yet claim runtime auth/RBAC/IDOR, upload, hostile-response, or
staging SSRF coverage; see the future coverage guide.

## Cross-repository access

CI checks out the four application repositories using the GitHub Actions
secret `AVERON_SOURCE_READ_TOKEN`. Add it under the repository or organization
Actions secrets before enabling cross-repository CI. Use a fine-grained token
(or GitHub App installation token) scoped to read-only Contents access for:

- `Saidaminov-x7/AVERON-backend`
- `Saidaminov-x7/AVERON-frontend`
- `Saidaminov-x7/AVERON-admin-panel`
- `Saidaminov-x7/AVERON-parser`

No token is stored in this repository. The checked-out source is placed under
`source-checkouts/`, which is ignored by Git.

## Scanner use and CI

- Pull request/push CI runs policy tests, verifies Prisma's production
  migration command, and runs static source/security checks. Gitleaks is
  configured to redact matches. SARIF is uploaded where supported.
- The staging workflow is `workflow_dispatch` only, requires the protected
  `security-staging` GitHub Environment, an explicitly allowlisted HTTPS
  origin, and an OpenAPI URL on that origin. Active ZAP scanning and
  Schemathesis require the staging workflow's explicit operator selection.
- Production-safe checks are manually dispatched only and never run ZAP active
  scan, fuzzing, malformed inputs, upload probes, brute-force simulation, or
  state-changing calls.
- A failed test result in a staging run must distinguish expected 4xx
  validation/auth rejections from unexpected 5xx responses.
- No source write, pull-request, or administration permissions are needed for
  cross-repository checkout. If the token is unavailable, static coverage is
  blocked and CI must report the run as unverified rather than omit the source
  repositories silently.

## Task #11 debt and verification limits

The historical dependency advisory counts remain in
`baseline/task11-remediation.json`; a later production-dependency audit of the
checked-out repositories reported zero current matches for Backend, Frontend,
Admin, and Parser. This does not prove which dependency graph is deployed or
that every advisory's vulnerable path was unreachable. The historical
Fastify 4/Fastify 5 and plugin compatibility items remain documented rather
than being addressed through a blind major upgrade.

The frontend still has both npm and pnpm lockfiles, with divergent resolutions
for some ranged dependencies. Its deployment hook invokes `npm install`, so
removing `package-lock.json` without coordinating deployment would be unsafe.
Frontend lint had zero errors and five warnings at audit time. Backend already
uses a short-lived rate-limit settings cache, and production deployment uses
`prisma migrate deploy`; no destructive migration command or production
database was run. See the architecture inventory and future coverage guide for
remaining parser SSRF, external-link/CSP, staging and secret-rotation review
items. Secret-store contents and any historical credential rotation were not
verified.

See [docs/architecture-inventory.md](./docs/architecture-inventory.md) for the
source-derived architecture and its verification limits, and
[baseline/task11-remediation.json](./baseline/task11-remediation.json) for the
visible Task #11 advisory debt.
