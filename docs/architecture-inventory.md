# AVERON Architecture Inventory

Inventory captured 2026-10-01 before Task #11.5 implementation. This records
the checked-out Task #11 repository state; routes and deployment configuration
can change and must be re-inventoried when those repositories change.

| Repository | Observed framework / package manager | Security-relevant entry points |
|---|---|---|
| AVERON_backend | Node.js, Fastify 4, TypeScript, Prisma 5, PostgreSQL, Redis; pnpm workspace | Backend root `apps/api/src/server.ts`. API plugin prefixes include `/auth`, `/admin`, `/api/v1`, `/media`, `/ai-chat`, `/analytics`, `/site-settings`, `/error-reports`; health routes `/health`, `/health/live`, `/health/ready`, `/health/ai`. Swagger/OpenAPI is registered only outside production under `/docs`. |
| AVERON_frontend | Next.js App Router, React, TypeScript; pnpm is declared, and both `pnpm-lock.yaml` and tracked `package-lock.json` exist | Auth pages register/login/reset password; browser API client uses `/api/backend` proxy and access token in the auth store, refresh via cookie credentials; Visual Search calls `/api/v1/products/visual-search`. |
| AVERON_admin_panel | React, Vite, TypeScript, React Router; pnpm | `src/routes.tsx` gates UI routes with `ProtectedRoute`; backend is authoritative for admin RBAC. Visual Search audit and embedding controls call `/api/v1/admin/...`. |
| AVERON_parser | Fastify 5, Playwright, TypeScript; npm and `package-lock.json` | `/api/health`, `/api/session/open`, `/api/search`, `/api/product`, `/api/search/:id`; browser egress is intercepted by a marketplace host/IP guard. Parser-to-backend imports use `Authorization: Bearer` service token and target `/api/v1/parser/imports`. Search results are `PENDING_REVIEW`. |
| AVERON_security_tests | Private, Node.js built-in test runner; no runtime dependencies | Dedicated local/CI/staging test harness. It is not a deployable service and must not be deployed to Railway. |

## Build and lint entry points

- Backend API package provides build, type-check, test, and ESLint scripts;
  the root package is a pnpm workspace.
- Frontend package provides build, ESLint, and Vitest scripts and declares
  pnpm, while the separate npm deployment hook is documented below.
- Admin package provides `tsc -b && vite build`, `oxlint`, and Vitest scripts.
- Parser package provides build, typecheck, test, and ESLint scripts using
  npm. The earlier missing-lint-script observation does not apply to this
  checked-out state.
- The four application repos did not contain project-owned GitHub Actions
  workflow files in the scoped inventory.

## Confirmed security behavior

- Backend auth routes include password, phone OTP, refresh/logout, sessions,
  data export, and admin TOTP flows. JWT secrets are required by startup
  validation; the code does not provide a production fallback.
- Backend admin modules use server-side role middleware; staff roles include
  `SUPER_ADMIN`, `ADMIN`, `MODERATOR`, and `SUPPORT`.
- Commerce parser import is service-token protected and persists imports for
  review; parser DTOs use `PENDING_REVIEW`. Public product routes are served by
  the `/api/v1` commerce module.
- Visual Search, Similar Products, and Image Embeddings feature flags default
  to false. Runtime capabilities also depend on real provider/storage
  availability; the repository does not configure a production embedding
  provider or vector store.
- Backend multipart and media code has per-file bounds; the Visual Search
  input accepts one image and does not retain the query image.
- Task #11 added a backend outbound URL guard for webhook delivery and a
  parser browser egress guard for marketplace/CDN requests. Parser source
  product URLs are canonical HTTPS 1688 offer URLs.
- Backend CORS uses an explicit configured origin set plus the two deployed
  Vercel origins observed in source; credentials are enabled. The server sets
  `trustProxy: true`; actual trusted proxy boundaries are deployment-owned.
- Backend has global and endpoint-specific rate limits. The global async
  limiter caches `SiteSettings` for approximately 30 seconds; sensitive routes
  also retain endpoint-specific limits.
- Production startup calls Prisma `migrate deploy`. README documents the
  guarded initial migration baseline path; no production database is contacted
  by this suite.
- No GitHub Actions workflows were found in the four application repositories.
  This security harness owns policy, source-regression, static-scan, staging
  DAST, and production-safe workflows.

## Not verified by source inventory

Live production/staging configuration, CORS values in the deployed environment,
trusted proxy topology, secret-store contents or rotation, PostgreSQL migration
history, provider availability, OAuth behavior against Google, external
marketplace response behavior, production rate-limit backend behavior, and
actual CI runs are not established by this inventory.

The frontend declares pnpm and retains both `pnpm-lock.yaml` and
`package-lock.json`. They resolve some ranged dependencies differently
(including `next-intl`, `lucide-react`, and `vitest`), and the frontend's
`ecosystem.config.js` deployment hook still runs `npm install && npm run
build`. The npm lock is therefore not safely removable as an “unused” file.
Package-manager consistency remains a follow-up: align the deployment hook and
lockfiles deliberately rather than deleting one without changing its consumer.

The source audit ran frontend lint with 0 errors and 5 warnings. The Admin
panel uses route-level `React.lazy`, although `NotFoundPage` is also statically
imported and the production build reports that split as ineffective; no broad
bundle rewrite was justified. Current production dependency audits reported
zero advisory matches for all four checked-out dependency graphs; see
`../baseline/task11-remediation.json` for historical counts and limitations.
