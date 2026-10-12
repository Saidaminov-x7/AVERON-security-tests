# AVERON UI Coverage Matrix

This matrix records checked-in automated evidence, not a claim that the UI was
manually exercised in a browser. `TESTED` means the named component/page
behavior has a focused automated test. `PARTIAL` means related components or
API adapters are tested, but the complete user journey is not. `NOT_TESTED`
means no focused UI test or browser flow was found.

## Frontend

| Surface / behavior | Status | Evidence | Coverage boundary |
|---|---|---|---|
| Product gallery controls, zoom, keyboard focus, Escape and scroll lock | PARTIAL | `components/commerce/ProductGallery.test.tsx`; `e2e/storefront-smoke.spec.ts` local fixture case (desktop + mobile) | Component coverage and loopback browser journey cover open, 150% zoom, next image, Escape, opener focus and body scroll lock; catalog-to-cart/persisted product acceptance remains separate. |
| Product cards, reviews, add-to-cart controls, price labels and quantity input | PARTIAL | `components/commerce/ProductCard.test.tsx`, `lib/price.test.ts`, `ProductReviews.test.tsx`, `AddToCart.test.tsx`, `QuantityStepper.test.tsx` | Shared UZS formatter now verifies RU/UZ/EN grouping, suffixes, invalid values and rounding, and ProductCard uses it for current and comparison prices. Component behavior remains isolated; no browser journey verifies catalog-to-cart state against a running backend. |
| Catalog loading and product retrieval | PARTIAL | `app/[locale]/(main)/catalog/loading.test.tsx`, `lib/storefront-catalog.test.ts`, `lib/products.test.ts` | Loading/data helpers are covered; category, filter, pagination, and real API error combinations lack end-to-end coverage. |
| Cart/order interactions | PARTIAL | `components/commerce/commerce-orders.test.tsx`, `lib/axios.test.ts` | Client interaction and mocked API behavior do not prove backend checkout concurrency, stock claims, or payment completion. |
| Catalog assistant and recommendations | PARTIAL | `components/commerce/CatalogAssistant.test.tsx`, `lib/catalog-assistant.test.ts`, `lib/recommendations.test.ts` | Provider failures and client mappings have focused tests; no live-provider or cross-user cache isolation browser test. |
| Visual search | PARTIAL | `components/commerce/VisualSearch.test.tsx`, `lib/visual-search.test.ts` | UI/API adapter behavior is covered; real upload limits, image decoding, inference provider, and deployed CSP/API-origin compatibility are not. |
| Authentication, navigation, and route protection | PARTIAL | `lib/phone.test.ts`, `lib/safe-navigation.test.ts`, `components/ProtectedRoute.test.tsx`, `lib/axios.test.ts`; loopback Playwright controlled SMS adapter | Local browser flow now covers unavailable SMS, invalid OTP recovery, synthetic successful login and protected profile route on desktop/mobile. Registration, refresh rotation, logout, password-reset and persisted backend commerce flows are not browser-tested. |
| Telegram Mini App | PARTIAL | `components/telegram/TelegramMiniApp.test.tsx` | Component-level cases do not prove Telegram-signed `initData` against a live bot configuration. |
| Favorites, public wishlist sharing, and share-token controls | NOT_TESTED | No focused frontend test file for share enable/copy/disable/regenerate interactions | Backend public-sharing invariants do not exercise owner UI state, stale-link messaging, or clipboard behavior. |
| Outfit builder | NOT_TESTED | No focused frontend test file for outfit editing or add-all-to-cart | Backend outfit tests do not exercise the end-user selection, variant, price-total, or partial-validation experience. |
| Locale routing and general navigation | PARTIAL | `lib/safe-navigation.test.ts`, `components/ui/LanguageFlag.test.tsx`, `components/ui/Select.test.tsx` | Safe return-target and primitive behavior are covered; no full locale-switching browser journey. |

## Admin panel

| Surface / behavior | Status | Evidence | Coverage boundary |
|---|---|---|---|
| Visual Search audit controls and API adapter | TESTED | `src/pages/VisualSearchAuditPage.test.tsx`, `src/lib/visualSearchAuditApi.test.ts` | Focused page/API behavior is tested; backend vector-store/provider deployment is not exercised. |
| Product-card country label/flag and responsive catalog | PARTIAL | `e2e/admin-routes-smoke.spec.ts` | Desktop/mobile loopback coverage checks the five-card layout and asserts the canonical `CN` fixture renders China instead of the unknown-country fallback; real API and production product records remain unverified. |
| Product form validation and final-only create | PARTIAL | `src/pages/commerce/productFormValidation.test.ts`; `e2e/admin-routes-smoke.spec.ts` | Desktop/mobile loopback Playwright now visits all six wizard steps with zero intermediate writes, double-clicks final create once, asserts canonical RU/UZ/EN/CN/UZS/media payload and UUID idempotency key, and cleans up the exact fixture product. Back/cancel/timeout/retry browser cases, edit/publish/moderation, and persisted DB acceptance remain. |
| Parser import detail, approve-as-draft, and reject-with-reason | PARTIAL | `e2e/admin-routes-smoke.spec.ts`; backend `parser-import.test.ts` and commerce `routes.test.ts` | Desktop/mobile Chromium uses run-scoped in-memory data and intercepts only the loopback admin-import API calls: opens source details, submits RU/UZ/EN titles and UZS price for explicit draft approval, rejects another import with a reason, verifies queue states and exact request bodies, then clears the run map. Parser tests cover DTO/auth/dedupe/error contract; backend route tests cover review endpoint guards. Real parser-to-PostgreSQL persistence, product/audit rows, and concurrent reviewer acceptance remain. |
| Order page and delivery transitions | PARTIAL | `src/pages/commerce/OrdersPage.test.tsx`, `src/pages/commerce/deliveryTransitions.test.ts` | UI transitions and helpers are covered; concurrent real database transitions and provider delivery are not. |
| Commerce API adapters and promo UI | PARTIAL | `src/lib/commerceApi.test.ts` | Adapter behavior has tests; promo-code create/edit/activate/expiry/capacity controls have no dedicated page test. |
| Protected-route behavior and backend RBAC | NOT_TESTED | No focused `ProtectedRoute` test in the Admin test suite | Backend role middleware is authoritative; route hiding alone is not an authorization test. |
| Integration diagnostics, system health, settings, users, and staff screens | NOT_TESTED | No focused page tests found for these screens | API-level or source-invariant tests do not verify UI loading, error, and privileged-action states. |
| Not-found route chunking | TESTED | Production build emits `NotFoundPage-*.js` separately | Build output verifies splitting, not the rendered not-found navigation flow. |

## Cross-repository interpretation

The security-tests repository contains a focused Playwright smoke suite for
storefront and Admin browser surfaces. Against explicitly configured loopback
apps on 2026-10-09, 20 checks passed and 2 project-inapplicable cases were
skipped across 22 desktop/mobile project cases. It covers localized route
rendering, overflow, catalog filter visibility, the SMS-unavailable/+998 login
state, a controlled OTP login with invalid-code recovery and a synthetic
successful sign-in to the protected profile, Admin login rendering, guest
fitting-room rotation/layer/total behavior, and a gallery flow for zoom, image
navigation, Escape, focus restoration and scroll lock. The OTP adapter uses
synthetic values and intercepts requests; no SMS is sent. It still does not
cover a persisted authenticated backend workflow.

Fitting-room continuation on 2026-10-09: the storefront rotation/layer/total
scenario passed on desktop and mobile (2/2) against a fresh isolated frontend
and loopback product/GLB fixture with a matching CORS origin. It verifies open,
rotation, front reset, layer add/remove, recalculated total, and close. The test
accepts either WebGL canvas or the explicit accessible photo fallback: this
Chrome/Playwright host did not provide a working WebGL renderer, so physical
GPU output is not claimed. Admin multipart GLB upload/review separately passed
desktop/mobile (2/2) against the loopback admin fixture. Neither path proves
backend storage ACL, PostgreSQL audit persistence, or production deployment.

Additional Admin browser evidence on 2026-10-09: the authenticated loopback
SUPER_ADMIN fixture rendered all 25 registered routes at desktop and mobile
viewports with no document-level 5xx, uncaught browser error, internal-error
copy, empty route mount, or horizontal overflow; the promo-code create path
persisted a row in the fixture. The sidebar resize/collapse/localization flow
passed after adding accessible names for collapsed controls. A dark-theme
Lighthouse snapshot on the Admin promo page improved from accessibility 86 to
100 after fixing primary-button foreground contrast and the collapsed logo hit
target. These remain fixture-backed UI results, not authenticated production
or real-backend verification. The three remaining Lighthouse findings were
SEO/agent-crawling checks (description, robots.txt, and llms.txt), not
accessibility failures.
Playwright is also used by the Parser for
marketplace extraction. Backend route coverage is tracked separately in
[`api-endpoint-registry.json`](./api-endpoint-registry.json), currently
5 `TESTED`, 52 `PARTIAL`, and 102 `NOT_TESTED` out of 159 extracted endpoints.
Those statuses are based on statically associated test evidence and must not
be interpreted as production integration coverage.

Final Admin route/sidebar E2E rerun on 2026-10-09 completed with 9 passed and 3
expected skips across desktop/mobile Chromium projects. Both route sweeps covered
all 25 routes; desktop promo-create and final-only product-create flows passed;
the desktop dark-theme collapse/localization check and mobile drawer
open/close/Escape/overflow check passed. The import scenario checks source details,
explicit draft approval with localized titles and UZS price, and reason-required
rejection; import API calls are intercepted only on the loopback origin with
run-scoped in-memory records. The product wizard asserts that the Telegram
publication-status failure alert is absent on the publication step. Skips were
project-inapplicable promo-create and sidebar cases. Product create used the
loopback fixture and the exact created product was deleted. Results remain
fixture-backed, not real-backend or production verification.
