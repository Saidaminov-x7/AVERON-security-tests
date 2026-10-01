import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
test("Task 11 advisory debt is preserved as visible aggregate data, not suppressions", async () => {
  const baseline = JSON.parse(await readFile(path.join(root, "baseline/task11-remediation.json"), "utf8"));
  assert.equal(baseline.status, "historical-advisory-debt");
  assert.equal(baseline.repositories.AVERON_backend.counts.critical, 4);
  assert.equal(baseline.repositories.AVERON_frontend.counts.high, 1);
  assert.equal(baseline.repositories.AVERON_admin_panel.counts.moderate, 5);
  assert.equal(baseline.repositories.AVERON_parser.counts.critical, 0);
  assert.match(baseline.policy, /not scanner suppressions/);
  for (const repository of Object.values(baseline.repositories)) {
    assert.equal(repository.currentAudit.status, "PASS");
    assert.deepEqual(repository.currentAudit.counts, {
      critical: 0,
      high: 0,
      moderate: 0,
      low: 0,
    });
  }
});
