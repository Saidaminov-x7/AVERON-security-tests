# AVERON deployment, promotion, and rollback verification

The repository does not perform a provider deployment. Railway/Vercel remain responsible for building and routing their configured services. The `AVERON Deployment SHA and Health Gate` workflow is an evidence gate to run after a provider reports deployment complete; it fails unless the running services report the exact full Git SHA and pass health checks.

## Required provider behavior

- Backend must be deployed from a GitHub-triggered Railway deployment so `RAILWAY_GIT_COMMIT_SHA` is populated.
- Storefront and admin must expose Vercel's `VERCEL_GIT_COMMIT_SHA` at runtime/build time. Enable Vercel System Environment Variables for both projects.
- Keep GitHub Environments named `staging` and `production`. Configure required reviewers and deployment branch/tag restrictions on `production` (and appropriate staging controls). A workflow environment name alone is not an approval gate until those settings exist.
- Keep separate provider projects/environments, databases, Redis, domains, and secrets for staging and production. Do not point staging at production data.
- Provide HTTPS origins for backend, storefront, and admin. Do not include credentials or query-string secrets in workflow inputs.

## GitHub cross-repository CI configuration

- In each application repository, configure `AVERON_SECURITY_DISPATCH_TOKEN` as a fine-grained token with `Contents: write` only on `Saidaminov-x7/AVERON-security-tests` so the notifier can send a repository dispatch.
- In `AVERON-security-tests`, configure `AVERON_REPOS_READ_TOKEN` with `Contents: read` on the four application repositories and `Commit statuses: write` on those same repositories. The central workflow checks out exact source SHAs and publishes `AVERON / cross-repository verify` to that commit. This token is not persisted in checkout credentials or exposed to application build/test steps.
- After the notifier and central workflow changes are merged and a successful source-commit status has been observed, add `AVERON / cross-repository verify` alongside the existing `verify` CI check in each application's protected-main ruleset. Keep protection in place while credentials or source checks are unavailable. GitHub protection on the private security repository may require a plan upgrade; do not treat a 403 as evidence that protection is enabled.
- Configure `AVERON_STOREFRONT_URL` and `AVERON_ADMIN_URL` as repository variables in the security repository for hosted Playwright runs. CI fails rather than skips the browser gate when either variable is absent.
- For a manual exact-revision verification, dispatch `AVERON Security CI` and `AVERON Application Regressions` from the remediation branch and pass the full 40-character SHA for all four application `*_ref` inputs. The security workflow then scans those checkouts; the application workflow tests, builds, runs desktop/mobile smoke, publishes a SHA manifest, and writes the required status to each supplied source SHA. `main` is the default for regular policy runs only.

## Promotion procedure

1. Merge only CI-green changes through the protected main branches. Record the complete 40-character SHA for each repository; backend, storefront, and admin are separate repositories and must not be forced to share a SHA. Keep parser/security SHA evidence from the cross-repository CI manifest.
2. Deploy the selected backend, storefront, and admin SHAs to staging through their configured providers. Dispatch the workflow with the three separate SHA inputs, `environment=staging`, `mode=deployment`, and the backend/storefront/admin URLs. The gate checks backend DB+Redis readiness, process liveness, and exact runtime SHA from all three applications. Browser smoke verification separately requires `AVERON_STOREFRONT_URL` and `AVERON_ADMIN_URL` repository variables.
3. Require a successful staging run and retain its verification artifact. Dispatch production with the same three SHAs, the successful staging run ID, production URLs, and `environment=production`. Configure GitHub production environment reviewers before relying on this gate.
4. The resulting JSON artifact is runtime evidence. It is not a deployment command and does not assert that parser, mobile, external providers, backups, or security scanners were verified.

## Rollback

1. Select the last known-good per-repository SHA set from a successful production runtime-verification artifact and the providers' deployment histories.
2. Use the provider's documented rollback/redeploy operation to restore that exact SHA. The workflow intentionally does not initiate a rollback.
3. Dispatch the gate with `mode=rollback`, `environment=production`, the restored SHA set, a successful staging verification artifact for the same SHAs, and production URLs. A successful artifact proves that the rollback targets are serving and healthy; it does not replace a database restore rehearsal or provider rollback audit.

Any missing SHA, unset runtime commit variable, failing dependency, unavailable URL, absent staging artifact, or provider response mismatch is a hard failure. Do not promote on a skipped or incomplete check.
