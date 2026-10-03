import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { isBlockingFinding } from "./baseline-policy.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const report = JSON.parse(await readFile(path.join(root, "reports/generated/security-report.json"), "utf8"));
const errors = [];

if (report.status === "NOT_VERIFIED") {
  errors.push("One or more required static scanners or source-repository scopes are missing.");
  for (const scan of report.scans.static.missing) {
    errors.push(`Required scan did not complete: ${scan}`);
  }
}
if (report.baseline.invalidEntries.length) {
  errors.push(...report.baseline.invalidEntries.map((entry) => `Invalid baseline entry: ${entry}`));
}
if (report.baseline.invalidHistoricalSecretApprovals?.length) {
  errors.push(...report.baseline.invalidHistoricalSecretApprovals.map((entry) => `Invalid historical secret approval: ${entry}`));
}
for (const finding of report.findings) {
  if (isBlockingFinding(finding)) {
    errors.push(`${finding.severity} ${finding.tool} ${finding.id} (${finding.repository})`);
  }
}

if (errors.length) {
  console.error("Security baseline gate failed:");
  for (const error of errors) console.error(`- ${error}`);
  console.error("Scanner findings are not proof of exploitability; review each candidate privately before remediation or an exact historical approval.");
  process.exitCode = 1;
} else {
  console.log("Security baseline gate passed: required static scans complete; no unbaselined critical/high or unreviewed secret candidates.");
}
