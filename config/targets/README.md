# Target configuration

Targets are passed explicitly through `SECURITY_TARGET_URL`; no target is
inferred from code or DNS. The required per-profile origin allowlists are:

- `SECURITY_STAGING_ALLOWED_ORIGINS`
- `SECURITY_PRODUCTION_SAFE_ALLOWED_ORIGINS`

Set these as protected GitHub Environment/repository variables. Values must be
comma-separated bare origins such as `https://staging.example.com`, without
credentials, paths, queries, or fragments. Use `config/environments/*.example.json`
as documentation only; `.example.invalid` values are intentionally non-routable.
