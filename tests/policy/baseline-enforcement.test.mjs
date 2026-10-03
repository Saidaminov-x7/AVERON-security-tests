import test from "node:test";
import assert from "node:assert/strict";
import { classifyFindingStatus, isBlockingFinding } from "../../scripts/baseline-policy.mjs";
import {
  historicalSecretFingerprint,
  validateHistoricalSecretApprovals,
} from "../../scripts/historical-secret-policy.mjs";

function approval(overrides = {}) {
  const now = Date.now();
  return {
    scanner: "Gitleaks",
    rule: "generic-api-key",
    repository: "AVERON_frontend",
    path: "src/config/firebase.ts",
    commit: "a".repeat(40),
    fingerprint: "generic-api-key:src/config/firebase.ts:abc123",
    classification: "TEST_FIXTURE",
    evidenceRef: "SEC-REVIEW-123",
    reviewedBy: "security-reviewer",
    reviewedAt: new Date(now - 60_000).toISOString(),
    reviewBy: new Date(now + 86_400_000).toISOString(),
    ...overrides,
  };
}

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

test("a current-file secret always blocks even if matching historical metadata exists", () => {
  const entry = approval();
  const { approvals } = validateHistoricalSecretApprovals([entry]);
  const historicalContext = { ...entry };
  const finding = {
    tool: "Gitleaks",
    source: "CURRENT",
    category: "SECRET_DETECTION",
    severity: "CRITICAL",
    historicalContext,
    fingerprint: historicalSecretFingerprint(historicalContext),
  };
  finding.status = classifyFindingStatus(finding, new Map(), approvals);

  assert.equal(finding.status, "NEW");
  assert.equal(isBlockingFinding(finding), true);
});

test("a new unreviewed historical secret blocks", () => {
  const context = approval();
  const finding = {
    tool: "Gitleaks",
    source: "HISTORY",
    category: "SECRET_DETECTION",
    severity: "CRITICAL",
    historicalContext: context,
    fingerprint: historicalSecretFingerprint(context),
  };
  finding.status = classifyFindingStatus(finding, new Map(), new Map());

  assert.equal(finding.status, "NEW");
  assert.equal(isBlockingFinding(finding), true);
});

test("an exact reviewed historical fixture is permitted but remains classified", () => {
  const entry = approval();
  const { approvals, invalidEntries } = validateHistoricalSecretApprovals([entry]);
  const finding = {
    tool: "Gitleaks",
    source: "HISTORY",
    category: "SECRET_DETECTION",
    severity: "CRITICAL",
    historicalContext: { ...entry },
    fingerprint: historicalSecretFingerprint(entry),
  };
  finding.status = classifyFindingStatus(finding, new Map(), approvals);

  assert.deepEqual(invalidEntries, []);
  assert.equal(finding.status, "HISTORICAL_REVIEWED");
  assert.equal(isBlockingFinding(finding), false);
});

test("a changed historical fingerprint is not covered by an approval", () => {
  const entry = approval();
  const { approvals } = validateHistoricalSecretApprovals([entry]);
  const context = { ...entry, fingerprint: `${entry.fingerprint}-changed` };
  const finding = {
    tool: "Gitleaks",
    source: "HISTORY",
    category: "SECRET_DETECTION",
    severity: "CRITICAL",
    historicalContext: context,
    fingerprint: historicalSecretFingerprint(context),
  };
  finding.status = classifyFindingStatus(finding, new Map(), approvals);

  assert.equal(finding.status, "NEW");
  assert.equal(isBlockingFinding(finding), true);
});

test("wildcard approvals and approval metadata containing secret-like values are rejected", () => {
  const wildcard = approval({ path: "src/**" });
  const extraSecret = approval({ token: "not-a-real-secret-value" });
  const secretInEvidence = approval({ evidenceRef: "AIzaSyDUMMYSECRETKEY1234567890" });

  const result = validateHistoricalSecretApprovals([wildcard, extraSecret, secretInEvidence]);

  assert.equal(result.approvals.size, 0);
  assert.equal(result.invalidEntries.length, 3);
});
