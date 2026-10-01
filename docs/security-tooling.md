# Security Tooling Runtime

## Static source and dependency scanning

Run `npm run security:static` from this repository after checking out all four
application repositories. Paths can be configured with
`AVERON_SOURCE_ROOT` or the individual `AVERON_*_REPO_PATH` variables described
in the README. All source scopes are validated before scanners start.

| Tool | Purpose and configuration | Invocation / output | Missing tool or finding behavior |
|---|---|---|---|
| Semgrep | Scans JavaScript/TypeScript using upstream `p/security-audit` plus `security-tools/semgrep/averon.yml` (unsafe evaluation and dangerous HTML sinks). CI installs pinned Semgrep `1.142.0` using Python 3.12. | `semgrep scan --config p/security-audit --config security-tools/semgrep/averon.yml --json`; per-repository JSON under `reports/raw/`. | Missing executable or malformed/missing report becomes a failed required scan. ERROR/WARNING severities normalize to HIGH/MEDIUM. New CRITICAL/HIGH findings fail the baseline gate. |
| Trivy | Scans dependency vulnerabilities and filesystem misconfiguration; CI uses `aquasecurity/trivy-action` v0.36.0 pinned to its verified commit and scanner v0.75.0. | Filesystem scan with `vuln,misconfig`; CI emits `reports/raw/averon-trivy.sarif`, local scan emits per-repository JSON. SARIF upload is limited to the static-scan job. | Scanner execution and report coverage are recorded. Findings remain visible; only individually approved, unexpired baseline entries are classified as baseline. New CRITICAL/HIGH findings fail the gate. |
| Gitleaks | Scans current files and full Git history for all four sources and this harness. CI installs v8.28.0 with the pinned Go setup action. | `gitleaks dir` and `gitleaks git`, both with `--redact`; JSON reports under `reports/raw/`. | Secret values are redacted. A report is processed by the normalized report gate, where secret findings fail regardless of severity. Scanner or report failures are not passes. |

The security report is machine-readable JSON plus a Markdown summary under
`reports/generated/`. It classifies scanner execution failure separately from
findings and `NOT_VERIFIED` coverage. Generated scan outputs are ignored by
Git and uploaded as CI artifacts; review/redact them before sharing outside
the private repository.

## Dynamic testing

`AVERON Staging DAST and API Fuzzing` is manual and runs only in the protected
`security-staging` GitHub environment. It requires an HTTPS target whose exact
origin is listed in `SECURITY_STAGING_ALLOWED_ORIGINS`. Configure the target
and origin allowlist as Actions variables. Schemathesis additionally requires
`SECURITY_STAGING_OPENAPI_URL` to be an OpenAPI endpoint on that same origin.

- OWASP ZAP baseline mode is passive and creates JSON/HTML output under
  `reports/generated/`. Active ZAP full scanning is only available against the
  validated staging target. It requires the separate, default-off
  `confirm_staging_active_tests` workflow input. GitHub issue writing is
  disabled.
- Schemathesis is installed as pinned `schemathesis==4.32.0` only when the
  operator selects backend API fuzzing. It tests the configured real schema,
  caps examples to 1–100 (default 40), and writes JSON, JUnit XML, and a
  captured command log under `reports/generated/`. Fuzzing also requires
  `confirm_staging_active_tests`; no schema URL is guessed.
- Scanner, schema, target-validation, and test failures propagate as workflow
  failures. There is no `continue-on-error` success fallback.

`AVERON Production Safe Checks` runs only the fixed safe probe. Its
`production-safe` policy allows unauthenticated GET requests only, no request
payloads, no redirect following, and no aggressive scan/fuzz command. Both
workflows upload reports as artifacts; the production-safe workflow uploads
only its masked safe-check JSON.

## Local requirements

The static runner expects Semgrep, Trivy, and Gitleaks on `PATH` (or their
`SEMGREP_BIN`, `TRIVY_BIN`, and `GITLEAKS_BIN` overrides). Semgrep requires
Python; Gitleaks can be installed with Go; Trivy is available as an upstream
binary or container. Staging ZAP actions run in the action's container.
Schemathesis requires Python 3.12 in CI and uses the pinned Python package.
Tool absence is reported as a scan failure/`NOT_VERIFIED`, not a clean scan.
