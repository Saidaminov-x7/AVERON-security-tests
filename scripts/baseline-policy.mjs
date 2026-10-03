import { historicalSecretFingerprint } from "./historical-secret-policy.mjs";

export function classifyFindingStatus(finding, approved, historicalApprovals = new Map()) {
  if (finding.category === "SECRET_DETECTION") {
    const contextFingerprint = historicalSecretFingerprint(finding.historicalContext);
    if (
      finding.tool === "Gitleaks"
      && finding.source === "HISTORY"
      && contextFingerprint === finding.fingerprint
      && historicalApprovals.has(finding.fingerprint)
    ) {
      return "HISTORICAL_REVIEWED";
    }
    return "NEW";
  }

  return approved.has(finding.fingerprint) ? "BASELINE" : "NEW";
}

export function isBlockingFinding(finding) {
  if (finding.category === "SECRET_DETECTION") {
    return finding.status !== "HISTORICAL_REVIEWED"
      || finding.tool !== "Gitleaks"
      || finding.source !== "HISTORY";
  }
  return ["CRITICAL", "HIGH"].includes(finding.severity) && finding.status !== "BASELINE";
}
