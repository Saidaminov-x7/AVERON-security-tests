# AVERON UI Coverage Matrix

This matrix records checked-in automated evidence, not a claim that the UI was
manually exercised in a browser. `TESTED` means the named component/page
behavior has a focused automated test. `PARTIAL` means related components or
API adapters are tested, but the complete user journey is not. `NOT_TESTED`
means no focused UI test or browser flow was found.

## Frontend

| Surface / behavior | Status | Evidence | Coverage boundary |
|---|---|---|---|
| Product cards, gallery, reviews, add-to-cart controls and quantity input | PARTIAL | `components/commerce/ProductCard.test.tsx`, `ProductGallery.test.tsx`, `ProductReviews.test.tsx`, `AddToCart.test.tsx`, `QuantityStepper.test.tsx` | Component behavior is tested in isolation; no browser journey verifies catalog-to-cart state against a running backend. |
| Catalog loading and product retrieval | PARTIAL | `app/[locale]/(main)/catalog/loading.test.tsx`, `lib/storefront-catalog.test.ts`, `lib/products.test.ts` | Loading/data helpers are covered; category, filter, pagination, and real API error combinations lack end-to-end coverage. |
| Cart/order interactions | PARTIAL | `components/commerce/commerce-orders.test.tsx`, `lib/axios.test.ts` | Client interaction and mocked API behavior do not prove backend checkout concurrency, stock claims, or payment completion. |
| Catalog assistant and recommendations | PARTIAL | `components/commerce/CatalogAssistant.test.tsx`, `lib/catalog-assistant.test.ts`, `lib/recommendations.test.ts` | Provider failures and client mappings have focused tests; no live-provider or cross-user cache isolation browser test. |
| Visual search | PARTIAL | `components/commerce/VisualSearch.test.tsx`, `lib/visual-search.test.ts` | UI/API adapter behavior is covered; real upload limits, image decoding, inference provider, and deployed CSP/API-origin compatibility are not. |
| Authentication, navigation, and route protection | PARTIAL | `lib/phone.test.ts`, `lib/safe-navigation.test.ts`, `components/ProtectedRoute.test.tsx`, `lib/axios.test.ts` | Helpers/guard behavior are tested; complete registration, login, refresh rotation, logout, and password-reset flows are not browser-tested. |
| Telegram Mini App | PARTIAL | `components/telegram/TelegramMiniApp.test.tsx` | Component-level cases do not prove Telegram-signed `initData` against a live bot configuration. |
| Favorites, public wishlist sharing, and share-token controls | NOT_TESTED | No focused frontend test file for share enable/copy/disable/regenerate interactions | Backend public-sharing invariants do not exercise owner UI state, stale-link messaging, or clipboard behavior. |
| Outfit builder | NOT_TESTED | No focused frontend test file for outfit editing or add-all-to-cart | Backend outfit tests do not exercise the end-user selection, variant, price-total, or partial-validation experience. |
| Locale routing and general navigation | PARTIAL | `lib/safe-navigation.test.ts`, `components/ui/LanguageFlag.test.tsx`, `components/ui/Select.test.tsx` | Safe return-target and primitive behavior are covered; no full locale-switching browser journey. |

## Admin panel

| Surface / behavior | Status | Evidence | Coverage boundary |
|---|---|---|---|
| Visual Search audit controls and API adapter | TESTED | `src/pages/VisualSearchAuditPage.test.tsx`, `src/lib/visualSearchAuditApi.test.ts` | Focused page/API behavior is tested; backend vector-store/provider deployment is not exercised. |
| Product form validation | PARTIAL | `src/pages/commerce/productFormValidation.test.ts` | Validation rules are tested; create/edit/publish/moderation flows are not end-to-end tested. |
| Order page and delivery transitions | PARTIAL | `src/pages/commerce/OrdersPage.test.tsx`, `src/pages/commerce/deliveryTransitions.test.ts` | UI transitions and helpers are covered; concurrent real database transitions and provider delivery are not. |
| Commerce API adapters and promo UI | PARTIAL | `src/lib/commerceApi.test.ts` | Adapter behavior has tests; promo-code create/edit/activate/expiry/capacity controls have no dedicated page test. |
| Protected-route behavior and backend RBAC | NOT_TESTED | No focused `ProtectedRoute` test in the Admin test suite | Backend role middleware is authoritative; route hiding alone is not an authorization test. |
| Integration diagnostics, system health, settings, users, and staff screens | NOT_TESTED | No focused page tests found for these screens | API-level or source-invariant tests do not verify UI loading, error, and privileged-action states. |
| Not-found route chunking | TESTED | Production build emits `NotFoundPage-*.js` separately | Build output verifies splitting, not the rendered not-found navigation flow. |

## Cross-repository interpretation

There is no dedicated Playwright end-to-end UI suite in these application
repositories. Playwright is used by the Parser for marketplace extraction; it
is not evidence of storefront or Admin browser coverage. Backend route
coverage is tracked separately in
[`api-endpoint-registry.json`](./api-endpoint-registry.json), currently
5 `TESTED`, 52 `PARTIAL`, and 102 `NOT_TESTED` out of 159 extracted endpoints.
Those statuses are based on statically associated test evidence and must not
be interpreted as production integration coverage.
