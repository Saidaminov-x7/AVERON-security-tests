import test from "node:test";
import assert from "node:assert/strict";
import { classifyFindingStatus, isBlockingFinding } from "../../scripts/baseline-policy.mjs";

test("an arbitrary new critical finding cannot inherit an unrelated approved baseline", () => {
  const approved = new Map([["reviewed-fingerprint", { reason: "Narrow reviewed item" }]]);
  const finding = {
    fingerprint: "unreviewed-fingerprint",
    tool: "Semgrep",
    category: "STATIC_ANALYSIS",
    severity: "CRITICAL",
  };
  finding.status = classifyFindingStatus(finding, approved);

  assert.equal(finding.status, "NEW");
  assert.equal(isBlockingFinding(finding), true);
});

test("secret findings remain blocking even if their status is mislabeled as baseline", () => {
  assert.equal(isBlockingFinding({
    category: "SECRET_DETECTION",
    severity: "CRITICAL",
    status: "BASELINE",
  }), true);
});
