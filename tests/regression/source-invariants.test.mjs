import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { resolveAllRepositories } from "../../scripts/repositories.mjs";

const repositories = await resolveAllRepositories();

async function source(repository, relativePath) {
  return readFile(path.join(repositories[repository], relativePath), "utf8");
}

test("backend requires signing secrets and leaves unfinished visual features disabled", async () => {
  const env = await source("AVERON_backend", "apps/api/src/config/env.ts");
  for (const secretName of ["JWT_SECRET", "REFRESH_SECRET"]) {
    assert.match(env, new RegExp(`${secretName}:\\s*z\\.string\\(\\)\\.min\\(32`));
  }
  for (const featureName of ["FEATURE_VISUAL_SEARCH", "FEATURE_SIMILAR_PRODUCTS", "FEATURE_IMAGE_EMBEDDINGS"]) {
    assert.match(env, new RegExp(`${featureName}:.*default\\('false'\\)`));
  }
});

test("parser imports require the backend service boundary and enter review, not publication", async () => {
  const imports = await source("AVERON_backend", "apps/api/src/modules/commerce/parser-import.ts");
  assert.match(imports, /PARSER_IMPORT_TOKEN|Authorization|authorization/i);
  assert.match(imports, /PENDING_REVIEW/);
  assert.doesNotMatch(imports, /status\s*:\s*['"]PUBLISHED['"]/);

  const parserDomain = await source("AVERON_parser", "src/domain.ts");
  assert.match(parserDomain, /PENDING_REVIEW/);
  assert.doesNotMatch(parserDomain, /status\s*:\s*['"]PUBLISHED['"]/);
});

test("parser outbound destinations are constrained and URL guard regressions run in its test suite", async () => {
  const guard = await source("AVERON_parser", "src/security/external-url.ts");
  const adapter = await source("AVERON_parser", "src/adapter-1688.ts");
  const tests = await source("AVERON_parser", "test/external-url.test.ts");
  assert.match(guard, /https:/);
  assert.match(guard, /127\.|private|loopback|link.local/i);
  assert.match(adapter, /route\(/);
  assert.match(tests, /127\.0\.0\.1|localhost|169\.254|private/i);
});

test("backend migration deploy path is guarded by the harness policy script", async () => {
  const manifest = await source("AVERON_backend", "package.json");
  const entrypoint = await source("AVERON_backend", "apps/api/entrypoint.sh");
  assert.match(manifest, /prisma migrate deploy/);
  assert.match(entrypoint, /prisma:deploy/);
  assert.doesNotMatch(entrypoint, /prisma db push|prisma migrate reset|--force-reset|--accept-data-loss/i);
});

test("commerce route regressions cover ownership, price, stock, idempotency, and guarded transitions", async () => {
  const tests = await source(
    "AVERON_backend",
    "apps/api/src/modules/commerce/__tests__/checkout-orders.test.ts",
  );
  for (const scenario of [
    "derives cart ownership only from the authenticated user",
    "does not expose or mutate another customer cart items",
    "does not check out another customer cart",
    "rejects unpublished products and malformed quantities",
    "rejects client-supplied prices rather than accepting a tampered checkout",
    "replays a same-key checkout committed while the request waits for the cart lock",
    "rechecks and does not oversell stock during checkout",
    "does not return another customer order",
    "requires admin authorization and prevents invalid order status transitions",
    "accepts adjacent fulfillment and shipping transitions and rejects skipped stages",
  ]) {
    assert.ok(tests.includes(scenario), `Missing commerce security regression: ${scenario}`);
  }
});

test("frontend return-target regressions reject external and malformed destinations", async () => {
  const tests = await source("AVERON_frontend", "lib/safe-navigation.test.ts");
  for (const maliciousTarget of [
    "//evil.example/path",
    "https://evil.example/en/profile",
    "/en/%2e%2e/login",
    "/en/%2f%2fevil.example",
  ]) {
    assert.ok(tests.includes(maliciousTarget), `Missing unsafe returnTo regression: ${maliciousTarget}`);
  }
});

test("Telegram Mini App auth and manual publication keep identity, feature, and product state server-authoritative", async () => {
  const auth = await source("AVERON_backend", "apps/api/src/modules/auth/telegram-init-data.ts");
  const authTests = await source("AVERON_backend", "apps/api/src/modules/auth/__tests__/telegram-init-data.test.ts");
  const authRoutes = await source("AVERON_backend", "apps/api/src/modules/auth/telegram.ts");
  const publication = await source("AVERON_backend", "apps/api/src/modules/commerce/telegram-publication.ts");
  const publicationTests = await source("AVERON_backend", "apps/api/src/modules/commerce/__tests__/telegram-publication.test.ts");
  const cardTests = await source("AVERON_backend", "apps/api/src/modules/commerce/__tests__/telegram-publisher.test.ts");
  const commerce = await source("AVERON_backend", "apps/api/src/modules/commerce/index.ts");
  const env = await source("AVERON_backend", "apps/api/src/config/env.ts");

  assert.match(auth, /timingSafeEqual/);
  assert.match(auth, /authDate > nowSeconds \+ 30/);
  for (const scenario of [
    "accepts a valid, fresh Telegram signature",
    "rejects altered data and invalid hashes",
    "rejects stale, future-dated, malformed, and ambiguous initData",
  ]) {
    assert.ok(authTests.includes(scenario), `Missing Mini App auth regression: ${scenario}`);
  }
  assert.match(authRoutes, /telegram:mini-app:auth:/);
  assert.match(authRoutes, /'NX'/);
  assert.match(authRoutes, /telegramId: result\.identity\.id/);
  assert.match(publication, /adminMiddleware/);
  assert.match(publication, /FEATURE_DISABLED/);
  assert.match(publication, /status: \{ in: \[TelegramPublicationStatus\.NOT_PUBLISHED, TelegramPublicationStatus\.FAILED\] \}/);
  assert.match(publication, /product\.status !== 'PUBLISHED'/);
  for (const scenario of [
    "requires admin authorization",
    "returns FEATURE_DISABLED",
    "rejects unpublished products and unknown products",
    "claims publication atomically",
    "does not expose the configured bot token",
    "publishes only after an explicit admin request",
  ]) {
    assert.ok(publicationTests.includes(scenario), `Missing Telegram publish regression: ${scenario}`);
  }
  assert.match(cardTests, /mocked Telegram transport/);
  assert.match(cardTests, /rejects unsafe image URLs/);
  assert.doesNotMatch(commerce, /publishProductToTelegram|sendTelegramCard/);
  assert.match(env, /FEATURE_TELEGRAM_PRODUCT_PUBLISH:.*default\('false'\)/);
});

test("Task 15 product reviews preserve verified-purchase, moderation, aggregation, and media boundaries", async () => {
  const api = await source("AVERON_backend", "apps/api/src/modules/commerce/product-reviews.ts");
  const schema = await source("AVERON_backend", "prisma/schema.prisma");
  const migration = await source(
    "AVERON_backend",
    "prisma/migrations/20261002130000_add_verified_product_reviews/migration.sql",
  );
  const tests = await source(
    "AVERON_backend",
    "apps/api/src/modules/commerce/__tests__/product-reviews.test.ts",
  );
  const customerUi = await source(
    "AVERON_frontend",
    "components/commerce/ProductReviews.tsx",
  );
  const miniApp = await source(
    "AVERON_frontend",
    "components/telegram/TelegramMiniApp.tsx",
  );
  const adminUi = await source(
    "AVERON_admin_panel",
    "src/pages/commerce/ReviewsPage.tsx",
  );

  assert.match(api, /preHandler:\s*\[authMiddleware\]/);
  assert.match(api, /item\.order\.userId !== request\.user\.userId/);
  assert.match(api, /eligibleOrderStatus\(item\.order\.status/);
  assert.match(api, /verifiedPurchase:\s*true/);
  assert.match(api, /CommerceProductReviewStatus\.PUBLISHED/);
  assert.match(api, /preHandler:\s*adminMiddleware/);
  assert.match(api, /moderatedById:\s*request\.user\.userId/);
  assert.match(schema, /orderItemId\s+String\s+@unique/);
  assert.match(schema, /verifiedPurchase\s+Boolean\s+@default\(false\)/);
  assert.match(migration, /CommerceProductReview_orderItemId_key/);
  assert.match(migration, /CommerceProductReview_rating_check/);
  assert.match(api, /ownerId:\s*userId/);
  assert.match(api, /image\/jpeg.*image\/png.*image\/webp.*image\/gif/);
  assert.doesNotMatch(customerUi, /dangerouslySetInnerHTML/);
  assert.match(miniApp, /<ProductReviews/);
  assert.match(adminUi, /admin\/reviews/);
  assert.match(adminUi, /adminMiddleware|REJECTED|PUBLISHED/);

  for (const scenario of [
    "requires authentication and refuses unverified client claims",
    "derives verified purchase from the authenticated delivered order",
    "rejects an ineligible",
    "prevents another customer from claiming an order item",
    "rejects invalid rating",
    "rejects oversized or control-character review content",
    "rejects concurrent duplicate attempts using the database unique key",
    "rejects media that is not owned by the authenticated reviewer",
    "only permits the author to edit or delete",
    "soft-deletes only the current customer review",
    "calculates public rating statistics only from published reviews",
    "requires an admin and rejects invalid moderation transitions",
    "audits valid admin moderation",
  ]) {
    assert.ok(tests.includes(scenario), `Missing Task 15 regression scenario: ${scenario}`);
  }
});
