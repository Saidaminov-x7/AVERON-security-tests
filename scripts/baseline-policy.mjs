export function classifyFindingStatus(finding, approved) {
  return approved.has(finding.fingerprint) && finding.tool !== "Gitleaks"
    ? "BASELINE"
    : "NEW";
}

export function isBlockingFinding(finding) {
  return finding.category === "SECRET_DETECTION"
    || (["CRITICAL", "HIGH"].includes(finding.severity) && finding.status !== "BASELINE");
}
