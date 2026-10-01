import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";

const root = process.env.AVERON_SOURCE_ROOT;
assert.ok(root, "run these tests with scripts/run-regression.mjs");

async function source(repository, relativePath) {
  return readFile(path.join(root, repository, relativePath), "utf8");
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
