import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const registry = JSON.parse(
  await readFile(path.join(root, "docs/api-endpoint-registry.json"), "utf8"),
);

test("backend API registry contains a complete record for every extracted route", () => {
  assert.equal(registry.version, 1);
  assert.equal(registry.endpointCount, registry.endpoints.length);
  assert.ok(registry.endpointCount >= 198, "Nested Fastify plugin routes were not fully extracted");
  for (const endpoint of registry.endpoints) {
    assert.ok(["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS", "ALL"].includes(endpoint.method));
    assert.ok(endpoint.path);
    assert.ok(endpoint.module);
    assert.ok(endpoint.sourceFile);
    assert.ok(Number.isInteger(endpoint.line) && endpoint.line > 0);
    assert.ok(["PUBLIC", "AUTHENTICATED", "ADMIN"].includes(endpoint.access));
    assert.ok(endpoint.requiredRole);
    assert.ok(endpoint.requestSchema);
    assert.ok(endpoint.handlerValidation);
    assert.ok(endpoint.responseSchema);
    assert.ok(endpoint.rateLimit?.category);
    assert.ok(endpoint.ownershipRequirement);
    assert.ok(endpoint.featureFlags);
    assert.ok(endpoint.sensitiveData);
    assert.ok(["TESTED", "PARTIAL", "NOT_TESTED", "BLOCKED"].includes(endpoint.testCoverageStatus));
    assert.ok(endpoint.coverageEvidence);
    assert.ok(Array.isArray(endpoint.testFiles));
  }
});

test("API registry excludes retired real-estate Admin routes", () => {
  const paths = new Set(registry.endpoints.map((endpoint) => endpoint.path));
  for (const path of [
    "/admin/listings",
    "/admin/listings/:id/approve",
    "/admin/listings/:id/reject",
    "/admin/listings/:id/request-changes",
    "/admin/listings/:id/verify",
    "/admin/listings/:id/fraud-analysis",
    "/admin/moderation/kanban",
    "/admin/reviews/pending",
    "/admin/reviews/:id/status",
  ]) {
    assert.equal(paths.has(path), false, `Retired Admin route remains registered: ${path}`);
  }
  assert.equal(paths.has("/ai-chat/chats/:listingId/summary"), false);
});

test("API registry distinguishes direct request coverage from module-level tests", () => {
  const direct = registry.endpoints.filter((endpoint) => endpoint.testCoverageStatus === "TESTED");
  const partial = registry.endpoints.filter((endpoint) => endpoint.testCoverageStatus === "PARTIAL");
  const missing = registry.endpoints.filter((endpoint) => endpoint.testCoverageStatus === "NOT_TESTED");

  assert.ok(direct.length > 0);
  assert.ok(partial.length > 0);
  assert.ok(missing.length > 0);
  for (const endpoint of direct) {
    assert.match(endpoint.coverageEvidence, /route path literal is asserted/i);
    assert.ok(endpoint.testFiles.length > 0);
  }

  const routes = new Map(registry.endpoints.map((endpoint) => [`${endpoint.method} ${endpoint.path}`, endpoint]));
  assert.equal(routes.get("GET /media")?.testCoverageStatus, "TESTED");
  assert.ok(routes.get("GET /media")?.testFiles.some((file) => file.endsWith("media/__tests__/access-control.test.ts")));
  assert.equal(routes.get("POST /media/upload")?.testCoverageStatus, "TESTED");
});

test("direct endpoint coverage is derived from exact Fastify inject method and URL pairs", async () => {
  const generator = await readFile(path.join(root, "scripts/generate-api-registry.mjs"), "utf8");
  assert.match(generator, /request\.method === method\.toUpperCase\(\)/);
  assert.match(generator, /routeInTest\.test\(request\.url\)/);
  assert.doesNotMatch(generator, /routeInTest\.test\(testFile\.contents\)/);
  assert.match(generator, /Fastify tests commonly table-drive requests as it\.each/);
  assert.match(generator, /requestMethods\.has\(method\) && url\?\.startsWith\("\/"\)/);
});

test("API registry follows nested commerce plugin registrations", () => {
  const routes = new Map(registry.endpoints.map((endpoint) => [`${endpoint.method} ${endpoint.path}`, endpoint]));
  for (const route of [
    "GET /api/v1/cart",
    "POST /api/v1/checkout",
    "GET /api/v1/orders/me",
    "GET /api/v1/orders/me/:orderNumber",
    "GET /api/v1/admin/orders",
  ]) {
    assert.ok(routes.has(route), `Nested commerce route was omitted from the API registry: ${route}`);
  }
  assert.equal(routes.get("GET /api/v1/admin/orders")?.access, "ADMIN");
  assert.equal(routes.get("GET /api/v1/admin/orders/:orderNumber")?.access, "ADMIN");
  assert.equal(routes.get("GET /api/v1/admin/orders")?.requiredRole, "SUPER_ADMIN|ADMIN");
});

test("API registry resolves Fastify route-option aliases before classifying access", () => {
  const routes = new Map(registry.endpoints.map((endpoint) => [`${endpoint.method} ${endpoint.path}`, endpoint]));
  for (const route of [
    "GET /api/v1/admin/fitting-room/generation-capabilities",
    "GET /api/v1/admin/products/:productId/fitting-room/assets",
    "POST /api/v1/admin/fitting-room/generation-jobs/:jobId/retry",
  ]) {
    const endpoint = routes.get(route);
    assert.ok(endpoint, `Expected protected fitting-room endpoint ${route}`);
    assert.equal(endpoint.access, "ADMIN", `${route} must not be catalogued as public`);
    assert.match(endpoint.requiredRole, /SUPER_ADMIN/);
  }
});
