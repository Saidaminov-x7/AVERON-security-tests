# AVERON master roadmap completion — Task #21.2 audit

## Decision

**BLOCKED_FROM_PRODUCTION.** This matrix reflects the current repositories at
the start of Task #21.2, not prior completion claims. A code or test reference
proves source/test coverage only; it does not prove deployed behavior. No
staging/production credentials, deployed configuration, disposable database,
browser session, or hosted security-run artifact was available during this
inspection.

Repository heads and clean-tree state recorded at the start of Task #21.2 on
`2026-10-02` (the matrix below is the starting baseline, not the final working
tree):

| Repository | Branch | HEAD | Initial working tree |
| --- | --- | --- | --- |
| Backend | `main` | `ecfbc2d9e33eb7aa989518dafc4852ec61582536` | clean |
| Frontend | `main` | `e2b6e77ca9825afb46a17e712647c35592c4135f` | clean |
| Admin | `main` | `bf9cfedc3bebf82d1385b3db23bad526dfc8693e` | clean |
| Parser | `main` | `5f44304e30e45105f036df2fc22922cee55a12a0` | clean |
| Security Tests | `main` | `7e2adcfae4a7acbc412245afafcf477d844f74a1` | clean |

`Final status` uses only the requested audit labels. `BLOCKED_EXTERNAL` means
the evidence or dependency is outside this local checkout. `NOT_RUNTIME_VERIFIED`
means implementation or local test evidence exists but runtime behavior was
not exercised. A safe local remediation is recorded only after it is applied
and validated.

## Completion matrix

| Task | Original requirement | Backend evidence | Frontend evidence | Admin evidence | Parser evidence | Security Tests evidence | Tests / verification | Remaining gap | Task #21.2 remediation | Final status |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| #1 | Support product countries CN, US, TR, IT, GB end to end. | Product-country enum/contracts and product routes are present. | Catalog country filtering and country defaults are present. | Product country fields exist in the current product workflow. | Provider country/source behavior requires live source verification. | Existing regressions cover contracts; no complete cross-app country journey evidence. | Unit/build coverage only; no complete browser-to-API round trip. | Seeded DB, import, Admin edit, public DTO, flags, and storefront were not jointly exercised. | None at initial audit. | NOT_RUNTIME_VERIFIED |
| #2 | Stable unique slugs, normalization, collision handling, imports, public lookup, canonical URLs. | Product slug persistence/lookup is present. | Product links and SEO use slugs. | Product editing/import uses backend product records. | Imported product creation path requires end-to-end verification. | No current whole-flow proof. | Local tests/builds from prior recorded run; not rerun against current heads yet. | RU/UZ transliteration and collision fallback were not verified against a disposable DB and live routes. | None at initial audit. | NOT_RUNTIME_VERIFIED |
| #3 | Customer product/catalog UX, responsive mobile header, filters, navigation, favorites, compare, cart. | Commerce APIs exist. | Current storefront surfaces and unit tests exist. | Not applicable to customer header. | Not applicable. | No browser flow artifact. | Fresh current browser matrix not run. | Actual rendered UI at required widths, auth states, and Smart Back behavior. | None at initial audit. | NOT_RUNTIME_VERIFIED |
| #4 | Product modal/editor language and validation behavior; UZS authoritative; optional CNY/exchange fields. | UZS/product pricing contract is backend-owned. | RU/UZ/EN product rendering exists. | Product form implementation exists. | Imported price data needs provider verification. | No runtime evidence. | No current modal browser test. | Keyboard/focus/Escape/scroll behavior and all form permutations not browser-verified. | None at initial audit. | NOT_RUNTIME_VERIFIED |
| #5 | Product foundations, safe diagnostics/request IDs, category contract, controlled errors. | API diagnostics, category and capability routes exist. | Error and catalog consumers exist. | Admin diagnostics/error consumers exist. | Provider errors need runtime review. | Regression harness exists. | Local tests available; current full cross-repo regression suite not yet run. | Runtime checks for raw provider/Prisma error leakage. | None at initial audit. | NOT_RUNTIME_VERIFIED |
| #6 | TOTP security and consistent commerce categories. | TOTP, replay and recovery-code implementations/tests exist. | Admin access follows auth contracts. | TOTP setup and account flows exist. | Not applicable. | Security regressions exist. | Prior local test evidence only; Admin browser + real Redis behavior absent. | No Admin browser E2E, production datastore replay test, or full role matrix. | None at initial audit. | NOT_RUNTIME_VERIFIED |
| #7 | Security/auth hardening and preserve AVERON design (no rental brand, gold primary, or dominant purple). | Auth/session/phone/Argon2 controls exist; active theme default now uses AVERON blue, with an exact-value additive migration. | Storefront palette is teal/blue; PM2 and Nginx deployment identity was corrected. | Rental screens/settings and listing counts were removed from current user-management UI; legacy role data remains compatible. | Not applicable. | Added request-level notification ownership tests and media mutation role tests; saved-search module (not registered in active server) has defense-in-depth ownership tests. | Backend security tests: 12 passed; type-check passed; exact-SHA Backend CI passed 418/418 on `f96c3cdf`. Full auth/RBAC threat-model, external security gate, and rendered theme verification remain incomplete. | Full auth/RBAC threat-model and browser-rendered theme verification. | Closed an active notification IDOR, made media write access use the current database role, and added future-proof ownership checks for the inactive saved-search plugin. | PARTIAL |
| #8 | Centralized safe feature-gated optional integration foundation. | Central flag list includes AI, parser, commerce, SMS, visual-search and integration flags; iPost is hard-disabled. | Capability-driven controls exist. | Diagnostics/config controls exist. | Parser flags exist. | Policy/regression tests exist. | No live provider checks. | Verify every flag disabled by default when unconfigured and every disabled route fails safely. | None at initial audit. | NOT_RUNTIME_VERIFIED |
| #9 | Parser → Backend pending review → Admin approve/reject; never auto-publish. | Parser import routes/tests and moderation states exist. | Not applicable to Admin review pipeline. | Import review surfaces exist. | Backend submission/auth code exists. | Regression coverage exists. | No current cross-service staging or race test. | Real authentication, dedupe/race, disabled flag, and manual approval on shared disposable DB. | None at initial audit. | NOT_RUNTIME_VERIFIED |
| #10 | Visual search upload safety, image embeddings foundation, similar products. | Upload validation and shared similarity interfaces exist; runtime adapters are unavailable implementations. | Upload/search UI exists. | Diagnostics exist. | Not applicable. | Unit security tests exist. | Prior parser-independent local test record only. | Real configured storage/vector/embedding provider absent; live visual-search journey unverified. | Keep unconfigured provider state explicit; no provider invented. | PARTIAL |
| #11 | Security hardening, dependency hygiene, database/migration safety. | Prior Task #21.1 source edits are now in current history; additive theme migration has a narrow exact-value predicate. | Public Firebase config uses environment-backed values. | Action references are pinned to immutable artifact-action v6.0.0 SHA. | SSRF proxy design/tests exist. | Baseline distinguishes current secrets from exact reviewed historical findings; incomplete Semgrep parsing fails closed; no historical approvals were added. | Current Security Tests policy suite: 50 passed; syntax checked 41 JavaScript files. Fresh scanner output remains NOT_VERIFIED; hosted enforcement remains blocked by GitHub Actions runner billing. | Fresh complete scanner outputs, historical candidate review, hosted enforcement, and deployed infrastructure evidence remain open. | Added exact-context historical secret approval policy and regression tests; incomplete parse handling; pinned artifact action; preserved empty approval list pending actual review. | PARTIAL |
| #12 | Cart, checkout, orders with server-owned price/stock/user, idempotency, concurrency safety. | Canonical commerce transaction and tests exist. | Customer cart/checkout/order UI exists. | Order admin surfaces exist. | Not applicable. | Regression tests exist. | Local unit suite does not prove real PostgreSQL concurrency. | Disposable PostgreSQL contention and browser checkout flows. | None at initial audit. | NOT_RUNTIME_VERIFIED |
| #13 | Shipping, preorder, tracking, Admin transitions, customer tracking. | Shipping/preorder/order state implementations exist; iPost remains optional. | Tracking surfaces exist. | Shipment/order state controls exist. | Not applicable. | Mock boundary tests exist. | No carrier live test or concurrency test. | Official iPost transport and actual shipment tracking are not configured/live verified. | Keep provider disabled unless live contract evidence exists. | PARTIAL |
| #14 | Telegram Bot/Mini App security and manual-only product publication. | Init-data verification/manual publication interfaces exist. | Mini App URL/config surfaces exist. | Manual publish controls exist. | Not applicable. | Local unit tests exist. | No live Telegram credentials or channel test. | Live verification unavailable; ensure no automatic publication. | No live claim; feature remains gated by configuration. | NOT_RUNTIME_VERIFIED |
| #15 | Reviews with verified purchase, fit feedback, media ownership/moderation/edit/delete. | Review authority and tests exist. | Review form/list UI and tests exist. | Moderation surfaces exist. | Not applicable. | Unit/regression tests exist. | No full browser + persisted media ownership run. | Cross-role browser and DB behavior not runtime verified. | None at initial audit. | NOT_RUNTIME_VERIFIED |
| #16 | AI search/style/complete-look may select only canonical products and cannot invent commerce facts. | AI catalog assistant and capability routes exist. | AI search/style/look surfaces exist. | Product AI fill surfaces exist. | Not applicable. | Mock and regression tests exist. | No configured provider or live request validation. | Provider availability and canonical hydration not live verified. | Keep optional flows safely disabled/fallback when provider absent. | PARTIAL |
| #17 | Recommendations, recently viewed, similar/related products, canonical hydration and privacy. | Recommendation service and tests exist. | Recommendation UI exists. | Analytics/merchandising surfaces exist. | Not applicable. | Privacy/security regression coverage incomplete for runtime. | Unit coverage only. | Anonymous vs logged-in isolation and private cache behavior not E2E tested. | None at initial audit. | NOT_RUNTIME_VERIFIED |
| #18 | Integration foundations (1688, Pinduoduo, AI fill, iPost, n8n, Telegram, currency, SMS, Redis, scaling, outfit, sharing, promo). | Source implementations vary; Pinduoduo persistence and live providers are not confirmed; UZS is authoritative. | Outfit, share and promo UX exist. | Integration diagnostics/config exist. | 1688 adapter exists; provider/runtime needs verification. | Mock contract and security tests exist. | Local mocks do not equal sandbox/live verification. | Provider status must be tracked individually; Redis/Postgres/scale require staging access. | Mark unconfigured/incomplete providers honestly in matrix. | PARTIAL |
| #19 | API/architecture review, endpoint coverage, runtime security/performance and production evidence. | API registry and safety tests exist. | Product/runtime routes exist; unused rental hooks, region map, saved-search UI, Leaflet helper/assets/dependencies were removed after reference audit. | Obsolete rental listing moderation and legacy review/export routes were removed from the active Admin plugin. | SSRF proxy source-level control exists. | Security regression harness exists. | Current source-derived registry: 198 endpoints, 49 TESTED, 96 PARTIAL, 53 NOT_TESTED. Backend targeted security tests and type-check pass; no full active endpoint runtime sweep. | Full endpoint coverage and runtime security/performance evidence. | Tightened coverage detection to require matching method and exact injected route path; added regression assertions; dead service/schema/database structures remain subject to controlled Task #22 review. | PARTIAL |
| #20 | SEO, analytics, UI/motion/mobile polish and stale-task cleanup. | Page-view analytics exists; required commerce event taxonomy remains incomplete. | SEO metadata and page-view tracking exist; unused legacy files/assets and Leaflet dependencies removed; mobile visual E2E absent. | Analytics export now reports product activity; obsolete listing export and review routes are retired. | Not applicable. | No full Task #20 matrix. | Frontend build and tests pass (110 tests); Admin build/tests pass; no rendered metadata/mobile browser suite. | Commerce event taxonomy, rendered UX, SEO checks, localization quality, and mobile E2E. | Removed rental terminology/counts from Admin user management and analytics exports plus proven-unused Frontend legacy artifacts; this does not complete wider Task #20 UI/analytics requirements. | PARTIAL |
| #21 | Production blocker closure, green security baseline, staging E2E and infrastructure verification. | Backend build passed; backend suite passed (302 tests) with test-only environment values; no real datastore/concurrency run. | Prior build/tests pass; Firebase restrictions unknown. | Admin build and suite passed (47 tests); live configuration unknown. | Parser build/tests passed in prior recorded verification; runtime proxy/container test missing. | Policy tests passed (44); fresh static scan unavailable and baseline remains unestablished. | Hosted CI artifact and staging access not available. | Green security baseline, staging/browser E2E, real database/Redis, Cloudflare/Railway, backup/restore, and provider verification. | Refreshed route inventory and test evidence; fail-closed security reporting retained. No external/runtime result was fabricated. | BLOCKED_EXTERNAL |

## Task #21.2 findings and work log

Initial inspection found the legacy primary default, rental Admin surfaces and
settings, listing counts, and placeholder PM2 identity. The checked-out
working tree now contains local remediations for those runtime/UI surfaces.
Legacy database tables/enums and some compatibility code remain intentionally
untouched; their presence is not evidence they are active AVERON functionality.

This section is updated with each validated local remediation. The physical
legacy schema is intentionally retained; do not drop tables or enums before
the controlled architecture/database work and backup review.

### Local remediation and verification snapshot

- Theme default is `#2563eb`; its additive migration updates only rows whose
  stored color is exactly the untouched `#a97724` value. Prisma schema
  validation passed; no live migration was run.
- Backend Admin no longer registers the legacy listing moderation or rental
  review endpoints. The listing export was removed; traffic CSV reports new
  products instead. User list/detail/export contracts no longer expose listing
  counts or listing records. Admin user role compatibility and physical legacy
  schema are retained pending controlled data review.
- Removed only Admin pages and Frontend modules/assets proven unreferenced by
  current routes/imports. Removed unused Leaflet packages and synchronized the
  pnpm and npm lockfiles. Site Settings no longer exposes rental-only controls.
  Frontend PM2/Nginx identity and Dockerfile branding were corrected; Dockerfile
  health check uses Node's built-in `fetch`.
- Security Tests now reject incomplete Semgrep parsing and separate current
  secret findings from exact-context historical approvals. The approvals list
  remains empty until findings are reviewed with fresh scanner output.
- `docs/api-endpoint-registry.json` was regenerated against the current source:
  198 active endpoint records; 49 TESTED, 96 PARTIAL, and 53 NOT_TESTED. Direct
  coverage now requires a matching HTTP method and exact route path in a Fastify
  `inject` request; mentioning a route or mounting a plugin prefix is not enough.
- Backend added authenticated ownership/role regressions for admin notifications
  (4 tests), media mutations (4 tests), and the inactive saved-search plugin (4
  tests). The saved-search code is defense-in-depth only: the plugin is not
  registered by the active API server. These mocks do not replace staging or
  persisted-database verification.
- Verification: Backend production build passed; Backend API/unit suite passed
  (302 tests) with ephemeral test-only environment values; Admin production
  build passed; Admin suite passed (47 tests); Frontend production build and
  suite passed (110 tests) after legacy-artifact removal. Parser suite/build
  (27 tests) passed in prior recorded verification. Security policy suite passed
  (44 tests), and 37 Security Tests JavaScript
  files passed syntax validation. Backend tests did not use a real PostgreSQL
  or Redis service.
- A fresh static security scan could not run because Gitleaks, Semgrep, and
  Trivy executables were unavailable. The scan result is NOT_VERIFIED, not
  clean; historical candidates are unreviewed. Hosted security CI, required
  browser viewport matrix, real PostgreSQL concurrency, Redis scaling/outage,
  external provider, Cloudflare/Railway, and backup/restore checks remain
  unverified.

## Release evidence still required

The remaining external/runtime checks are listed in
[`task21.1-release-manifest.json`](./task21.1-release-manifest.json). In
particular, no baseline may be established until current Gitleaks/Trivy/
Semgrep outputs are complete, fresh, tied to the current commit and reviewed.
The release decision stays `BLOCKED_FROM_PRODUCTION` while any mandatory gate
is `BLOCKED_EXTERNAL` or `NOT_RUNTIME_VERIFIED`.

## Task #21.3 addendum — final blocker remediation

**Decision: `BLOCKED_FROM_PRODUCTION`.** This addendum records local source and
policy work only. No production deployment, Task #22 work, commit, push, PR,
tag, or release was performed.

### Current source remediation

- Checkout idempotency test values are generated per test run; the existing
  assertions still exercise idempotency without secret-shaped literals.
- The four reported Vitest async module mocks use `vi.importActual`; the
  ProductCard JSX parse issue was corrected without changing its test behavior.
- Public Site Settings no longer return the rental photo limit. Admin reads only
  current setting fields. Listing-only media routes and the unused rental
  conversation-summary route are retired; physical legacy schema is retained.
- Password-reset URLs and the storefront CORS example use the approved
  `https://averon.uz` origin. SEO robots, sitemap, canonical, OpenGraph and
  product metadata share the production origin.
- Admin analytics exports now use the Backend-supported `products` report,
  and no longer describe traffic as new listings. A focused test asserts the
  supported report is offered and the retired report is absent. The
  unproduced `LISTING_REPORTED` webhook option was removed.
- Removed unused Frontend listing types, listing form validation, coordinate
  fallbacks, and the unreferenced rental filter store. Dynamic-section defaults
  and fallback UI now use commerce terminology. Platform statistics are omitted
  unless verified values are supplied, rather than rendering fabricated zeroes.
- Legacy runtime classification: the Backend `listings`, `viewing-requests`, and
  `saved-searches` plugins have definitions but are not imported or registered
  by the active server (`DEAD_RUNTIME`). The authenticated GDPR export still
  includes a user's historical listing/favorite/search records
  (`LEGACY_COMPATIBILITY`). Legacy physical tables/enums are retained
  (`LEGACY_SCHEMA_ONLY`). `Role.LANDLORD` remains accepted by a Backend Admin
  schema and included in legacy customer filters; the current Admin UI has no
  `LANDLORD` choice, and no commerce authorization check was found that grants
  access based on that role. The CMS section identifier `POPULAR_LISTINGS`
  remains for stored-content compatibility, but its current renderer uses
  product cards and product terminology (`LEGACY_COMPATIBILITY`).
- API registry: 198 active endpoint records; 49 `TESTED`, 96 `PARTIAL`, and 53
  `NOT_TESTED`. `TESTED` here means source-linked request coverage was detected;
  it does not imply deployed or full production runtime verification.

### Fresh static scan evidence

The latest pinned scanner execution, including its timestamp and per-repository
source SHAs, is recorded in
[`tool-execution.json`](../reports/raw/tool-execution.json):

| Scanner | Scope | Result |
| --- | --- | --- |
| Semgrep 1.142.0 | Backend, Frontend, Admin, Parser | `SCAN_SUCCESS_ZERO_FINDINGS`; zero scanner/parser errors in each repository |
| Trivy 0.75.0 | Backend, Frontend, Admin, Parser | `SCAN_SUCCESS_ZERO_FINDINGS` in each repository |
| Gitleaks 8.28.0 current files | All five repositories | Backend/Admin: zero; Frontend: 6 scanner records in ignored `.next` output; Parser: 5 records in ignored browser-profile files; Security Tests: 1 ignored local `.env` record |
| Gitleaks 8.28.0 Git history | All five repositories | Backend: 5 candidates; Frontend: 1 candidate; Admin/Parser/Security Tests: zero |

The six Frontend current-file records represent five ignored build-output paths
(one path produced duplicate records); they do not include a current Firebase
key literal. Frontend Firebase configuration reads `NEXT_PUBLIC_FIREBASE_*`
environment variables. The Parser browser profile and Security Tests `.env`
were not modified or printed. Scanner output is stored under
[`reports/raw`](../reports/raw) and [`reports/generated`](../reports/generated).
The source repository SHAs in the scan manifest match the checked-out HEADs,
but working-tree edits remain uncommitted. No baseline was established:
[`static-findings.json`](../baseline/static-findings.json) still has
`established: false` and empty approval arrays. Dynamic ZAP/Schemathesis scans
were not run.

### Unique historical Gitleaks candidates

No candidate below is approved. The listed classifications describe the
candidate evidence only; exact human reviewer, evidence reference, review date,
and expiration records are absent. Approval remains blocked.

| Rule | Repository | Historical path | Commit | Fingerprint | Exact candidate in current source? | Classification / decision | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `generic-api-key` | Backend | `apps/api/src/modules/commerce/__tests__/checkout-orders.test.ts` | `3178959695c113a83c05acb3c66f72633bc91f67` | `3178959695c113a83c05acb3c66f72633bc91f67:apps/api/src/modules/commerce/__tests__/checkout-orders.test.ts:generic-api-key:710` | No; the fixture is now generated per run | `TEST_FIXTURE`; not approved | Historical checkout test; current idempotency assertions remain |
| `generic-api-key` | Backend | `apps/api/src/modules/commerce/__tests__/recommendations.test.ts` | `892f436f85126f0d8016f686a33abf7154c2d008` | `892f436f85126f0d8016f686a33abf7154c2d008:apps/api/src/modules/commerce/__tests__/recommendations.test.ts:generic-api-key:32` | No current-file finding | `TEST_FIXTURE`; not approved | Historical test-only mock setup |
| `generic-api-key` | Backend | `apps/api/src/modules/commerce/__tests__/checkout-orders.test.ts` | `dcba79458535fe6677371c09af4107246f6fccbd` | `dcba79458535fe6677371c09af4107246f6fccbd:apps/api/src/modules/commerce/__tests__/checkout-orders.test.ts:generic-api-key:490` | No; the fixture is no longer a current finding | `TEST_FIXTURE`; not approved | Historical test request context |
| `generic-api-key` | Backend | `apps/api/src/config/env.ts` | `55f34b1fce11569636efe9ad9184e0d9b8a4084e` | `55f34b1fce11569636efe9ad9184e0d9b8a4084e:apps/api/src/config/env.ts:generic-api-key:82` | No current-file finding | `FALSE_POSITIVE_WITH_EVIDENCE`; not approved | Historical match is a rejected refresh-secret validation sentinel, not a credential |
| `generic-api-key` | Backend | `apps/api/src/test/setup.ts` | `55f34b1fce11569636efe9ad9184e0d9b8a4084e` | `55f34b1fce11569636efe9ad9184e0d9b8a4084e:apps/api/src/test/setup.ts:generic-api-key:8` | No current-file finding | `TEST_FIXTURE`; not approved | Historical test-only signing setup |
| `gcp-api-key` | Frontend | `lib/firebase.ts` | `adb972be2661dcef5c8d223efbadb420cc9ae4a0` | `adb972be2661dcef5c8d223efbadb420cc9ae4a0:lib/firebase.ts:gcp-api-key:6` | No key literal; configuration uses public environment variables | `BLOCKED_EXTERNAL`; no public-client approval | Firebase project/domain/API restrictions could not be independently verified |

Current Gitleaks candidates remain blockers until the ignored local artifacts
are privately reviewed and handled by their owner. In particular, determine
whether the local Security Tests token was ever valid or deployed; rotate or
revoke it if so. Do not approve the historical Firebase finding without
independent restriction evidence.

### Runtime and infrastructure gates still open

- Browser customer/Admin E2E, the required responsive viewport and locale/theme
  matrices, keyboard/focus/drawer behavior, token-refresh concurrency, IDOR,
  and Admin RBAC remain unverified. The existing local Frontend server serves
  stale/missing chunks and is not suitable for E2E.
- Critical API route coverage is incomplete: the registry still has 53
  `NOT_TESTED` routes. Critical route families have not all been exercised
  through real runtime/integration paths.
- No disposable PostgreSQL/Redis services were available. Checkout/promo
  concurrency, order snapshots, multi-instance Redis behavior, and outage
  semantics were not verified against real services.
- Parser Chromium-through-proxy SSRF cases, live external providers, real
  Cloudflare/Railway/origin/TLS configuration, and backup/restore evidence
  remain unverified.
- Commerce analytics still lacks the required allowlisted event taxonomy,
  bounded metadata/privacy checks, and Backend-authoritative purchase revenue.
- Product locale quality has not been runtime-audited. SEO source tests pass,
  but the stale local server prevented rendered runtime validation.

Therefore this remediation does not satisfy the security-baseline, full-runtime
E2E, database/Redis concurrency, or production-readiness gates.
