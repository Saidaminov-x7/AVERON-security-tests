import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { resolveAllRepositories } from "../../scripts/repositories.mjs";
import { discoverSourceFile } from "../../scripts/source-discovery.mjs";

const repositories = await resolveAllRepositories();

async function source(repository, relativePath) {
  const filePath = path.join(repositories[repository], relativePath);
  try {
    return await readFile(filePath, "utf8");
  } catch (error) {
    if (error?.code === "ENOENT") {
      throw new Error(
        `SOURCE_DISCOVERY_FAILURE: expected source "${relativePath}" was not found `
        + `in checkout "${repositories[repository]}".`,
      );
    }
    throw error;
  }
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

test("public AI health and auth diagnostics do not expose endpoint configuration or PII", async () => {
  const server = await source("AVERON_backend", "apps/api/src/server.ts");
  const slowQueryStart = server.indexOf("prisma.$on('query'");
  const slowQueryEnd = server.indexOf("const redis", slowQueryStart);
  assert.notEqual(slowQueryStart, -1);
  assert.notEqual(slowQueryEnd, -1);
  const slowQueryLog = server.slice(slowQueryStart, slowQueryEnd);
  assert.match(slowQueryLog, /durationMs:\s*e\.duration/);
  assert.doesNotMatch(slowQueryLog, /e\.query|e\.params/);

  const aiHealthStart = server.indexOf("server.get('/health/ai'");
  const aiHealthEnd = server.indexOf("server.get('/health/ready'", aiHealthStart);
  assert.notEqual(aiHealthStart, -1);
  assert.notEqual(aiHealthEnd, -1);
  const aiHealth = server.slice(aiHealthStart, aiHealthEnd);
  assert.doesNotMatch(aiHealth, /url:\s*config\.OLLAMA_BASE_URL|model:\s*config\.OLLAMA_MODEL|models:|error:\s*err\.message/);
  assert.match(aiHealth, /error: 'AI_SERVICE_UNAVAILABLE'/);

  const register = await source("AVERON_backend", "apps/api/src/modules/auth/register.ts");
  const registerLog = register.match(/request\.log\.warn\(\{[\s\S]*?\}, 'Registration failed'\)/)?.[0] ?? "";
  assert.ok(registerLog, "Registration failures must keep a structured diagnostic log");
  assert.doesNotMatch(registerLog, /email|error\.message|dto\./);
  assert.doesNotMatch(register, /message:\s*`[^`]*(?:user\.name|user\.email)|meta:\s*\{\s*email:/);
  assert.match(register, /logUserActivity\(request\.server\.prisma, user\.id, 'REGISTER', request\)/);

  const forgotPassword = await source("AVERON_backend", "apps/api/src/modules/auth/forgot-password.ts");
  const resetNoticeStart = forgotPassword.indexOf("await sendTelegramMessage");
  const resetNoticeEnd = forgotPassword.indexOf("'HTML'", resetNoticeStart);
  assert.notEqual(resetNoticeStart, -1);
  assert.notEqual(resetNoticeEnd, -1);
  assert.doesNotMatch(forgotPassword.slice(resetNoticeStart, resetNoticeEnd), /user\.name|user\.email/);
  const resetLog = forgotPassword.match(/request\.log\.info\(\{\s*userId:\s*updatedUser\.id[^}]*\}\s*,\s*'Password successfully reset'\)/)?.[0] ?? "";
  assert.ok(resetLog, "Password resets must retain a user-scoped audit log");
  assert.doesNotMatch(resetLog, /email/);
  assert.doesNotMatch(forgotPassword, /request\.log\.(?:error|warn)\(\s*\{[^}]*\b(?:email|err)\s*:/);

  const parser = await source("AVERON_parser", "src/server.ts");
  assert.doesNotMatch(parser, /message:\s*error\.message|request\.log\.error\(error\)/);
  assert.match(parser, /Browser session open failed/);
  assert.match(parser, /Product search failed/);
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
  const backendPath = repositories.AVERON_backend;
  const authPath = await discoverSourceFile(backendPath, {
    searchRoots: ["apps/api/src"],
    markers: ["timingSafeEqual", "auth_date", "createHmac"],
  });
  const authTestsPath = await discoverSourceFile(backendPath, {
    searchRoots: ["apps/api/src"],
    markers: [
      "accepts a valid, fresh Telegram signature",
      "rejects altered data and invalid hashes",
      "rejects stale, future-dated, malformed, and ambiguous initData",
    ],
  });
  const auth = await readFile(authPath, "utf8");
  const authTests = await readFile(authTestsPath, "utf8");
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

test("Task 16 AI catalog security stays provider-bounded and database-authoritative", async () => {
  const aiService = await source(
    "AVERON_backend",
    "apps/api/src/modules/commerce/catalog-ai-service.ts",
  );
  const aiSchemas = await source(
    "AVERON_backend",
    "apps/api/src/modules/commerce/catalog-assistant-schemas.ts",
  );
  const assistant = await source(
    "AVERON_backend",
    "apps/api/src/modules/commerce/catalog-assistant.ts",
  );
  const providerTests = await source(
    "AVERON_backend",
    "apps/api/src/modules/commerce/__tests__/catalog-ai-service.test.ts",
  );
  const routeTests = await source(
    "AVERON_backend",
    "apps/api/src/modules/commerce/__tests__/catalog-assistant.test.ts",
  );

  assert.match(aiSchemas, /\.strict\(\)/);
  assert.match(aiService, /searchIntentSchema\.parse/);
  assert.match(assistant, /status:\s*ProductPublicationStatus\.PUBLISHED/);
  assert.match(assistant, /buildSearchWhere/);
  assert.match(assistant, /fallbackUsed:\s*!aiUsed/);
  for (const scenario of [
    "rejects unsupported or extra provider output instead of trusting it",
    "keeps prompt-injection text inside the bounded untrusted user-data field",
    "maps provider timeouts and upstream failures to controlled errors",
  ]) {
    assert.ok(providerTests.includes(scenario), `Missing Task 16 provider regression: ${scenario}`);
  }
  for (const scenario of [
    "uses strict server filters and returns only visible, available database products",
    "keeps catalog search usable with explicit fallback metadata when no provider is configured",
  ]) {
    assert.ok(routeTests.includes(scenario), `Missing Task 16 catalog regression: ${scenario}`);
  }
  assert.match(providerTests, /not\.toContain\('server-only-test-key'\)/);
  assert.match(providerTests, /salePriceUzs:\s*1/);
});

test("Task 17 recommendations share canonical eligibility and isolate behavioral history", async () => {
  const recommendations = await source(
    "AVERON_backend",
    "apps/api/src/modules/commerce/recommendations.ts",
  );
  const ranking = await source(
    "AVERON_backend",
    "apps/api/src/modules/commerce/recommendation-ranking.ts",
  );
  const schema = await source("AVERON_backend", "prisma/schema.prisma");
  const migration = await source(
    "AVERON_backend",
    "prisma/migrations/20261002133000_add_recommendation_history/migration.sql",
  );
  const flags = await source("AVERON_backend", "apps/api/src/modules/features/feature-flags.ts");
  const env = await source("AVERON_backend", "apps/api/src/config/env.ts");
  const similar = await source("AVERON_backend", "apps/api/src/modules/visual-search/index.ts");
  const tests = await source(
    "AVERON_backend",
    "apps/api/src/modules/commerce/__tests__/recommendations.test.ts",
  );

  assert.match(recommendations, /request\.jwtVerify\(\)/);
  assert.match(recommendations, /request\.user\.userId/);
  assert.match(recommendations, /createHash\('sha256'\)/);
  assert.match(recommendations, /randomBytes\(32\)/);
  assert.match(recommendations, /publicProductDto\(canonical\)/);
  assert.match(recommendations, /RECENT_HISTORY_RETENTION_DAYS/);
  assert.match(ranking, /isEligibleRecommendationProduct/);
  assert.match(ranking, /RECOMMENDATION_WEIGHTS/);
  assert.match(similar, /hydrateSimilarProducts/);
  assert.match(schema, /model CommerceRecentlyViewedProduct/);
  assert.match(migration, /CHECK.*userId.*sessionKey|CHECK.*sessionKey.*userId/is);
  for (const flag of [
    "FEATURE_RECOMMENDATIONS",
    "FEATURE_PERSONALIZED_RECOMMENDATIONS",
    "FEATURE_RECENTLY_VIEWED",
  ]) {
    assert.match(flags, new RegExp(`'${flag.replace('FEATURE_', '')}'`));
    assert.match(env, new RegExp(`${flag}:.*default\\('false'\\)`));
  }
  for (const scenario of [
    "derives recently-viewed ownership from the verified token, not request data",
    "isolates anonymous history with a server-issued opaque session cookie",
    "gates recommendation routes when the centralized feature flag is disabled",
  ]) {
    assert.ok(tests.includes(scenario), `Missing Task 17 security regression: ${scenario}`);
  }
});

test("Task 18 authentication and integration foundations fail closed and protect OTP state", async () => {
  const emailLogin = await source("AVERON_backend", "apps/api/src/modules/auth/login.ts");
  const phoneLogin = await source("AVERON_backend", "apps/api/src/modules/auth/phone-password.ts");
  const phoneOtp = await source("AVERON_backend", "apps/api/src/modules/auth/phone-otp.ts");
  const phoneAuth = await source("AVERON_backend", "apps/api/src/modules/auth/index.ts");
  const loginThrottle = await source("AVERON_backend", "apps/api/src/modules/auth/login-throttle.ts");
  const phoneOtpTests = await source("AVERON_backend", "apps/api/src/modules/auth/__tests__/phone-otp.test.ts");
  const phonePasswordTests = await source("AVERON_backend", "apps/api/src/modules/auth/__tests__/phone-password-security.test.ts");
  const otpStore = await source("AVERON_backend", "apps/api/src/modules/auth/otp-store.ts");
  const sms = await source("AVERON_backend", "apps/api/src/modules/auth/phone-otp.ts");
  const publisher = await source("AVERON_backend", "apps/api/src/modules/integrations/n8n-publisher.ts");
  const env = await source("AVERON_backend", "apps/api/src/config/env.ts");
  const flags = await source("AVERON_backend", "apps/api/src/modules/features/feature-flags.ts");
  const envExample = await source("AVERON_backend", "apps/api/.env.example");
  const server = await source("AVERON_backend", "apps/api/src/server.ts");

  assert.match(emailLogin, /verifyPassword\(await dummyPasswordHash, dto\.password\)/);
  assert.match(phoneLogin, /user\?\.passwordHash \?\? await dummyPasswordHash/);
  assert.match(phoneLogin, /PHONE_ALREADY_REGISTERED/);
  assert.match(phoneLogin, /redis\.set\(cooldownKey,\s*'1',\s*'EX',\s*60,\s*'NX'\)/);
  assert.match(phoneLogin, /registrationSchema[\s\S]*?\.strict\(\)/);
  assert.match(phoneOtp, /averon:v1:auth:phone-otp:code:/);
  assert.match(phoneOtp, /averon:v1:auth:phone-otp:cooldown:/);
  assert.match(phoneAuth, /keyGenerator:[\s\S]*?req\.ip/);
  assert.match(loginThrottle, /averon:v1:auth:login-failures:/);
  assert.match(otpStore, /redis\.call\('GET', KEYS\[1\]\)/);
  assert.match(otpStore, /redis\.call\('DEL', KEYS\[1\]\)/);
  assert.match(otpStore, /redis\.call\('SET', KEYS\[1\].*'KEEPTTL'/s);
  assert.match(sms, /config\.NODE_ENV === 'test'/);
  assert.match(publisher, /createHmac\('sha256'/);
  assert.match(publisher, /x-averon-timestamp/);
  assert.match(publisher, /x-averon-signature/);
  assert.match(publisher, /averon:v1:n8n:failed-events/);
  assert.match(env, /FEATURE_N8N:.*default\('false'\)/);
  assert.match(env, /N8N_WEBHOOK_SECRET:[\s\S]*?z\.string\(\)\.min\(32\)/);
  assert.match(flags, /N8N: config\.FEATURE_N8N && Boolean\(config\.N8N_WEBHOOK_URL && config\.N8N_WEBHOOK_SECRET\)/);
  assert.match(envExample, /JWT_SECRET=\r?\n/);
  assert.match(envExample, /REFRESH_SECRET=\r?\n/);
  assert.match(server, /skipOnError:\s*false/);
  for (const scenario of [
    "stores a hashed OTP under versioned Redis keys and never returns it outside tests",
    "enforces the phone resend cooldown before creating another OTP",
  ]) {
    assert.ok(phoneOtpTests.includes(scenario), `Missing Task 18 SMS regression: ${scenario}`);
  }
  for (const scenario of [
    "returns account-independent registration responses and atomically enforces per-phone resend cooldown",
    "does not create a duplicate account after an already-registered phone verifies a code",
  ]) {
    assert.ok(phonePasswordTests.includes(scenario), `Missing Task 18 phone-password regression: ${scenario}`);
  }
});

test("Task 18 outfit, wishlist, and promo boundaries remain server-authoritative", async () => {
  const outfits = await source("AVERON_backend", "apps/api/src/modules/commerce/outfits.ts");
  const wishlist = await source("AVERON_backend", "apps/api/src/modules/commerce/wishlist.ts");
  const promos = await source("AVERON_backend", "apps/api/src/modules/commerce/commerce-promos.ts");
  const checkout = await source("AVERON_backend", "apps/api/src/modules/commerce/cart-checkout.ts");
  const checkoutTests = await source("AVERON_backend", "apps/api/src/modules/commerce/__tests__/checkout-orders.test.ts");
  const currency = await source("AVERON_backend", "apps/api/src/modules/integrations/currency-rate.ts");
  const currencyTests = await source("AVERON_backend", "apps/api/src/modules/integrations/__tests__/currency-rate.test.ts");
  const migration = await source(
    "AVERON_backend",
    "prisma/migrations/20261002140000_task18_outfits_wishlist_and_commerce_promos/migration.sql",
  );
  const featureTests = await source(
    "AVERON_backend",
    "apps/api/src/modules/commerce/__tests__/task18-commerce-features.test.ts",
  );

  assert.match(outfits, /z\.array\(outfitItemSchema\)\.max\(MAX_OUTFIT_ITEMS\)/);
  assert.match(outfits, /status:\s*'PUBLISHED'/);
  assert.match(outfits, /where:\s*\{\s*id:\s*params\.data\.outfitId,\s*userId:\s*request\.user\.userId\s*\}/);
  assert.match(outfits, /outfits\/:outfitId\/cart/);
  assert.match(outfits, /rejectedItems/);
  assert.match(wishlist, /randomBytes\(32\)\.toString\('base64url'\)/);
  assert.match(wishlist, /status:\s*'PUBLISHED'/);
  assert.match(wishlist, /cache-control',\s*'private, no-store'/);
  assert.match(wishlist, /wishlistShareToken:\s*null/);
  assert.match(promos, /discountPercent:\s*z\.number\(\)\.int\(\)\.min\(1\)\.max\(15\)/);
  assert.match(checkout, /UPDATE "CommercePromoCode"[\s\S]*"usedActivations"\s*<\s*"maxActivations/);
  assert.match(checkout, /discountPercentSnapshot/);
  assert.match(checkout, /commercePromoCodeUsage\.create/);
  assert.match(currency, /averon:v1:currency/);
  assert.match(currency, /allowStaleOnProviderFailure/);
  assert.match(currency, /Number\.isFinite\(quote\.rate\)/);
  for (const scenario of [
    "caches provider-sourced rates with freshness metadata and explicit TTLs",
    "never invents a rate when no provider is registered",
    "uses last-known data only when both request and business policy explicitly allow stale data",
    "rejects and does not cache invalid provider rates",
  ]) {
    assert.ok(currencyTests.includes(scenario), `Missing currency provider security regression: ${scenario}`);
  }
  assert.match(migration, /CHECK\s*\("discountPercent"\s+BETWEEN\s+1\s+AND\s+15\)/);
  assert.match(migration, /CommercePromoCodeUsage_promoCodeId_userId_key/);
  assert.match(migration, /CommercePromoCodeUsage_orderId_key/);
  for (const scenario of [
    "rejects client-provided prices and IDs that do not resolve to published products",
    "returns only canonical public product fields and never owner PII",
    "rejects a discount above 15 percent at the admin API boundary",
    "validates without consuming a promo and applies canonical normalization",
    "uses an atomic usage-count guard when an admin lowers an activation cap",
  ]) {
    assert.ok(featureTests.includes(scenario), `Missing Task 18 commerce security regression: ${scenario}`);
  }
  for (const scenario of [
    "rejects fake client discounts and stacked promo payloads without consuming a promo",
    "consumes a promo once on successful order creation and preserves its order snapshot",
    "rolls back a promo activation when order creation fails",
    "allows only one checkout to consume the final promo activation",
    "prevents a customer from using the same promo a second time",
  ]) {
    assert.ok(checkoutTests.includes(scenario), `Missing Task 18 checkout security regression: ${scenario}`);
  }
});

test("Task 18 iPost shipment integration is idempotent, bounded, and does not own delivery truth", async () => {
  const contract = await source("AVERON_backend", "apps/api/src/modules/integrations/contracts.ts");
  const boundary = await source("AVERON_backend", "apps/api/src/modules/integrations/ipost-shipping.ts");
  const routes = await source("AVERON_backend", "apps/api/src/modules/commerce/ipost-shipping.ts");
  const tests = await source("AVERON_backend", "apps/api/src/modules/commerce/__tests__/ipost-shipping.test.ts");
  const schema = await source("AVERON_backend", "prisma/schema.prisma");
  const migration = await source(
    "AVERON_backend",
    "prisma/migrations/20261002161000_add_delivery_provider_reference/migration.sql",
  );
  const flags = await source("AVERON_backend", "apps/api/src/modules/features/feature-flags.ts");
  const env = await source("AVERON_backend", "apps/api/src/config/env.ts");
  const commerce = await source("AVERON_backend", "apps/api/src/modules/commerce/index.ts");

  assert.match(contract, /supportsIdempotentShipmentCreation/);
  assert.match(boundary, /createHash\('sha256'\)/);
  assert.match(boundary, /REQUEST_TIMEOUT_MS/);
  assert.match(boundary, /MAX_ATTEMPTS/);
  assert.match(boundary, /IPOST_INVALID_PROVIDER_RESPONSE/);
  assert.match(routes, /adminMiddleware/);
  assert.match(routes, /FOR UPDATE/);
  assert.match(routes, /statusApplied:\s*false/);
  assert.doesNotMatch(routes, /commerceDelivery\.update\(\{[\s\S]{0,500}data:\s*\{\s*status:/);
  assert.match(schema, /providerReference\s+String\?\s+@unique/);
  assert.match(migration, /ADD COLUMN "providerReference" TEXT/);
  assert.match(migration, /CREATE UNIQUE INDEX "CommerceDelivery_providerReference_key"/);
  assert.match(flags, /IPOST:\s*false/);
  assert.match(env, /FEATURE_IPOST:.*default\('false'\)/);
  assert.match(commerce, /ipostShippingModule/);
  for (const scenario of [
    "creates at most one order shipment and returns the persisted result on retry",
    "times out provider requests and returns a controlled timeout",
    "reports provider DELIVERED as evidence without changing backend delivery truth",
    "returns a controlled error for provider failure and malformed normalized states",
    "does not call a provider or persist shipment state when iPost is disabled",
  ]) {
    assert.ok(tests.includes(scenario), `Missing Task 18 iPost security regression: ${scenario}`);
  }
});
