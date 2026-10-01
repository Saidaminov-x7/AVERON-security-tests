import test from "node:test";
import assert from "node:assert/strict";
import { normalizeSeverity } from "../../scripts/report-severity.mjs";

test("Semgrep ERROR and WARNING findings retain blocking normalized severities", () => {
  assert.equal(normalizeSeverity("ERROR"), "HIGH");
  assert.equal(normalizeSeverity("WARNING"), "MEDIUM");
  assert.equal(normalizeSeverity("INFO"), "INFO");
});

test("canonical scanner severities are preserved and unknown values stay informational", () => {
  assert.equal(normalizeSeverity("CRITICAL"), "CRITICAL");
  assert.equal(normalizeSeverity("HIGH"), "HIGH");
  assert.equal(normalizeSeverity("UNDEFINED"), "INFO");
});
