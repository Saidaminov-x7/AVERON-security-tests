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
application repositories beside this repository, then set their common parent
or explicit repository paths:

```powershell
$env:AVERON_SOURCE_ROOT = "C:\work\AVERON"
# Or set only the paths needed by a command:
$env:AVERON_BACKEND_REPO_PATH = "C:\work\AVERON\AVERON_backend"
npm run security:regression
npm run security:static
npm run inventory:api
```

The resolver maps those local directory names to the exact GitHub repositories
in `scripts/repositories.mjs`. `AVERON_BACKEND_REPO_PATH`,
`AVERON_FRONTEND_REPO_PATH`, `AVERON_ADMIN_REPO_PATH`, and
`AVERON_PARSER_REPO_PATH` override individual checkout paths. Relative paths
are resolved from this repository. Every path is checked for its `package.json`
before a test or scan starts; missing checkouts are errors, never skips.
The static command requires Semgrep, Trivy, and Gitleaks to be installed and
records each scanner's actual exit result and repository coverage. Do not
install scanners from unreviewed sources or send private source to third-party
hosted scanning services.

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
npm run inventory:api        Regenerate the source-derived backend endpoint registry
npm run security:api         Run gated Schemathesis checks against OpenAPI
npm run security:dast        Run gated OWASP ZAP scan
npm run security:full        Run the full locally gated harness test suite
npm run security:report      Generate normalized JSON and Markdown reports
```

Static tools are separate executables: CI pins Semgrep `1.142.0`, Trivy
`v0.75.0`, and Gitleaks `v8.28.0`; dynamic CI pins ZAP action versions and
Schemathesis `4.32.0`. Third-party GitHub Actions are pinned to verified commit
SHAs; see [docs/action-pins.md](./docs/action-pins.md). Local tool absence is
reported as an error; missing scan results are never represented as clean.
See [docs/security-tooling.md](./docs/security-tooling.md) for scanner
configuration, runtime requirements, report output, and local/staging versus
production-safe execution boundaries.
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

CI checks out the four private application repositories using the GitHub
Actions secret `AVERON_REPOS_READ_TOKEN`. Add it under the private security
repository's Actions secrets before enabling cross-repository CI. Use a
fine-grained token with read-only Contents access for only:

- `Saidaminov-x7/AVERON-backend`
- `Saidaminov-x7/AVERON-frontend`
- `Saidaminov-x7/AVERON-admin-panel`
- `Saidaminov-x7/AVERON-parser`

No token is stored in this repository. If the secret is absent, CI reports
"Required cross-repository read credential is not configured", fails the
preflight, and marks dependent verification as not performed; it does not turn
the required jobs green. The checked-out source is placed under
`source-checkouts/`, which is ignored by Git. See
[docs/cross-repository-access.md](./docs/cross-repository-access.md) for the
minimum token permissions and setup steps.

## Scanner use and CI

- Pull request/push Security CI runs policy tests against a real checked-out
  backend, then performs cross-repository Semgrep, Trivy, and redacted Gitleaks
  scans. SARIF upload is scoped to the scanner job that needs it.
- The separate Application Regressions workflow installs dependencies and runs
  the existing tests/typechecks/builds for the four application repositories.
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

## Task #19 audit and verification limits

The Task #19 source-derived architecture, API inventory, UI coverage matrix,
and unresolved findings are documented in
[docs/architecture-inventory.md](./docs/architecture-inventory.md),
[docs/api-endpoint-registry.json](./docs/api-endpoint-registry.json),
[docs/ui-coverage-matrix.md](./docs/ui-coverage-matrix.md), and
[docs/task19-audit-findings.md](./docs/task19-audit-findings.md).

The API registry currently extracts 159 routes: 5 `TESTED`, 52 `PARTIAL`, and
102 `NOT_TESTED`. These statuses represent static test associations, not proof
of production runtime coverage. The parser DNS-validation-to-Chromium
connection boundary and the backend's deployment-owned `trustProxy: true`
configuration remain open pending a safe network/deployment design.

Backend, Frontend, Admin, and Parser dependency audits are run against the
checked-out lockfiles; the Frontend retains npm and pnpm lockfiles because the
deployment hook uses npm. Local source/build/test results do not establish
which graph is deployed. No destructive migration command or production
database was used.

The latest local static scan is `NOT_VERIFIED`: Semgrep, Trivy, and Gitleaks
were unavailable, and the harness correctly records missing scanner artifacts
as failures instead of reusing stale output. Staging-only ZAP and Schemathesis
were not run without an approved staging target. Secret-store contents,
historical credential rotation, deployed proxy topology, and live provider
behavior remain unverified. Historical Task #11 advisory data is preserved in
[baseline/task11-remediation.json](./baseline/task11-remediation.json).
