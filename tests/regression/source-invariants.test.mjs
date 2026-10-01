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
