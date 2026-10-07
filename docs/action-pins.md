# Verified GitHub Action Pins

Workflow `uses:` entries are pinned to the following immutable commits. The
comments beside each `uses:` entry state the upstream release/tag represented
by the commit.

| Action | Upstream version/tag | Commit SHA |
|---|---|---|
| `actions/checkout` | `v6.0.2` | `de0fac2e4500dabe0009e67214ff5f5447ce83dd` |
| `actions/setup-node` | `v6.5.0` | `249970729cb0ef3589644e2896645e5dc5ba9c38` |
| `actions/setup-python` | `v6` | `ece7cb06caefa5fff74198d8649806c4678c61a1` |
| `actions/setup-go` | `v6.5.0` | `924ae3a1cded613372ab5595356fb5720e22ba16` |
| `actions/upload-artifact` | `v6.0.0` | `b7c566a772e6b6bfb58ed0dc250532a479d7789f` |
| `actions/download-artifact` | `v6.0.0` | `018cc2cf5baa6db3ef3c5f8a56943fffe632ef53` |
| `pnpm/action-setup` | `v4` | `b906affcce14559ad1aafd4ab0e942779e9f58b1` |
| `github/codeql-action/upload-sarif` | `v4` | `2892aa5e19bbd11bc0cff5427e3b750a04d9e3c2` |
| `aquasecurity/trivy-action` | `v0.36.0` | `ed142fd0673e97e23eac54620cfb913e5ce36c25` |
| `zaproxy/action-baseline` | `v0.14.0` | `7c4deb10e6261301961c86d65d54a516394f9aed` |
| `zaproxy/action-full-scan` | `v0.13.0` | `3c58388149901b9a03b7718852c5ba889646c27c` |

The Trivy failure was caused by specifying `0.36.0`; the upstream repository
has the tag `v0.36.0`, and the workflow now pins the verified tag's commit.
The Trivy scanner itself remains enabled and uses release `v0.75.0`.

These values were resolved from the corresponding upstream GitHub tag/ref APIs
on 2026-10-01. Dependabot's GitHub Actions ecosystem is configured to propose
reviewable pin updates.
