# Private Cross-Repository Read Access

Both `AVERON Security CI` and `AVERON Application Regressions` need to clone
the private application repositories. Configure one GitHub Actions repository
secret in the private `Saidaminov-x7/AVERON-security-tests` repository:

1. Create a fine-grained personal access token (or an equivalent GitHub App
   installation token) with resource owner `Saidaminov-x7`.
2. Select **Only select repositories** and include:
   - `AVERON-backend`
   - `AVERON-frontend`
   - `AVERON-admin-panel`
   - `AVERON-parser`
3. Grant **Contents: Read-only**. GitHub's required Metadata read permission
   may be included automatically. Do not grant write, Actions, administration,
   or security-event permissions to this cross-repository token.
4. In `AVERON-security-tests`, open **Settings → Secrets and variables →
   Actions → New repository secret**. Set the name to
   `AVERON_REPOS_READ_TOKEN` and paste the token value into the secret field.
5. Keep an expiry/rotation owner and renew the token before expiration.

The read token is passed only to checkout steps and is never written to
workflow files or reports. An early preflight checks whether the secret is
configured without printing it. When absent, the workflow fails the preflight
and reports that required verification was **NOT performed**; dependent jobs
are skipped because access is unavailable, not marked as passed.

For exact source-commit status publication, create a separate fine-grained
token restricted to the same four repositories with **Commit statuses: Read
and write** and no Contents or administration permissions. Store it as
`AVERON_SOURCE_STATUS_TOKEN` in the security repository's Actions secrets. This
credential is used only by `publish-source-commit-status`; do not broaden the
read-only token to include write access.
