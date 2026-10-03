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
  assert.ok(registry.endpointCount >= 129, "Unexpectedly few Fastify endpoints were extracted after legacy route retirement");
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
});
