import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const rawDirectory = path.join(root, "reports/raw");
const repositories = [
  "AVERON_backend",
  "AVERON_frontend",
  "AVERON_admin_panel",
  "AVERON_parser",
];
const allRepositories = [...repositories, "AVERON_security_tests"];
const outcomeByScanner = {
  Semgrep: process.env.SEMGREP_OUTCOME,
  Trivy: process.env.TRIVY_OUTCOME,
  Gitleaks: process.env.GITLEAKS_OUTCOME,
};

await mkdir(rawDirectory, { recursive: true });

async function validReport(filename) {
  try {
    const contents = await readFile(path.join(rawDirectory, filename), "utf8");
    if (filename.endsWith(".json") || filename.endsWith(".sarif")) JSON.parse(contents);
    return true;
  } catch {
    return false;
  }
}

const scans = [];
for (const repository of repositories) {
  const semgrepOutput = `${repository}-semgrep.json`;
  scans.push({
    scanner: "Semgrep",
    repository,
    outcome: outcomeByScanner.Semgrep === "success" && await validReport(semgrepOutput) ? "success" : "failure",
  });
  const trivyOutput = "averon-trivy.sarif";
  scans.push({
    scanner: "Trivy",
    repository,
    outcome: outcomeByScanner.Trivy === "success" && await validReport(trivyOutput) ? "success" : "failure",
  });
}
for (const repository of allRepositories) {
  for (const [scanner, suffix] of [
    ["Gitleaks current files", "current"],
    ["Gitleaks Git history", "history"],
  ]) {
    const output = `${repository}-gitleaks-${suffix}.json`;
    scans.push({
      scanner,
      repository,
      outcome: outcomeByScanner.Gitleaks === "success" && await validReport(output) ? "success" : "failure",
    });
  }
}

await writeFile(
  path.join(rawDirectory, "tool-execution.json"),
  `${JSON.stringify({ scans }, null, 2)}\n`,
);
