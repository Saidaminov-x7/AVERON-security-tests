import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

function findingsCount(scanner, report) {
  if (scanner.startsWith("Gitleaks")) {
    return Array.isArray(report) ? report.length : null;
  }
  if (scanner === "Semgrep") {
    return Array.isArray(report?.results) ? report.results.length : null;
  }
  if (scanner === "Trivy") {
    if (!Array.isArray(report?.runs)) return null;
    return report.runs.reduce((total, run) => total + (run.results?.length ?? 0), 0);
  }
  return null;
}

export function classifyScanArtifact(scanner, contents, scannerSucceeded) {
  if (!scannerSucceeded) {
    return { status: "SCANNER_FAILED", findingsCount: null, reportSha256: null };
  }
  if (contents === null) {
    return { status: "SCAN_OUTPUT_MISSING", findingsCount: null, reportSha256: null };
  }

  let report;
  try {
    report = JSON.parse(contents);
  } catch (error) {
    if (!(error instanceof SyntaxError)) throw error;
    return { status: "SCANNER_FAILED", findingsCount: null, reportSha256: null };
  }

  const count = findingsCount(scanner, report);
  if (count === null) {
    return { status: "SCANNER_FAILED", findingsCount: null, reportSha256: null };
  }

  return {
    status: count === 0 ? "SCAN_SUCCESS_ZERO_FINDINGS" : "SCAN_SUCCESS_WITH_FINDINGS",
    findingsCount: count,
    reportSha256: createHash("sha256").update(contents).digest("hex"),
  };
}

export async function inspectScanArtifact(scanner, filename, scannerSucceeded) {
  let contents;
  try {
    contents = await readFile(filename, "utf8");
  } catch (error) {
    if (error?.code === "ENOENT") contents = null;
    else throw error;
  }
  return classifyScanArtifact(scanner, contents, scannerSucceeded);
}
