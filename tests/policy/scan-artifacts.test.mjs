import test from "node:test";
import assert from "node:assert/strict";
import { classifyScanArtifact } from "../../scripts/scan-artifacts.mjs";

test("distinguishes successful empty scanner output from a missing report", () => {
  assert.equal(
    classifyScanArtifact("Gitleaks current files", "[]", true).status,
    "SCAN_SUCCESS_ZERO_FINDINGS",
  );
  assert.equal(
    classifyScanArtifact("Gitleaks current files", null, true).status,
    "SCAN_OUTPUT_MISSING",
  );
});

test("does not treat findings or failed scanner output as a clean scan", () => {
  const report = JSON.stringify([{ RuleID: "generic-api-key" }]);
  const finding = classifyScanArtifact("Gitleaks Git history", report, true);
  assert.equal(finding.status, "SCAN_SUCCESS_WITH_FINDINGS");
  assert.equal(finding.findingsCount, 1);
  assert.equal(
    classifyScanArtifact("Gitleaks Git history", "[]", false).status,
    "SCANNER_FAILED",
  );
});

test("binds successful scanner output to its SHA-256 digest", () => {
  const result = classifyScanArtifact("Semgrep", JSON.stringify({ results: [] }), true);
  assert.match(result.reportSha256, /^[a-f0-9]{64}$/);
});

test("marks Semgrep parser errors as incomplete coverage, even when it reports no findings", () => {
  const result = classifyScanArtifact(
    "Semgrep",
    JSON.stringify({ results: [], errors: [{ type: ["PartialParsing"] }] }),
    true,
  );
  assert.equal(result.status, "SCAN_INCOMPLETE_PARSE_ERRORS");
  assert.equal(result.findingsCount, 0);
  assert.equal(result.scannerErrors, 1);
  assert.match(result.reportSha256, /^[a-f0-9]{64}$/);
});

test("reports complete Semgrep output without errors as a clean scan", () => {
  const result = classifyScanArtifact("Semgrep", JSON.stringify({ results: [], errors: [] }), true);
  assert.equal(result.status, "SCAN_SUCCESS_ZERO_FINDINGS");
  assert.equal(result.scannerErrors, 0);
});
