import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { sourceRepositories } from "./repositories.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const rawDirectory = path.join(root, "reports/raw");
const repositories = Object.keys(sourceRepositories);
const gitleaksRepositories = [...repositories, "AVERON_security_tests"];
const trivyOutcomes = {
  AVERON_backend: process.env.TRIVY_BACKEND_OUTCOME,
  AVERON_frontend: process.env.TRIVY_FRONTEND_OUTCOME,
  AVERON_admin_panel: process.env.TRIVY_ADMIN_OUTCOME,
  AVERON_parser: process.env.TRIVY_PARSER_OUTCOME,
};

await mkdir(rawDirectory, { recursive: true });

async function readExecution(filename) {
  try {
    return JSON.parse(await readFile(path.join(rawDirectory, filename), "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return { scans: [] };
    throw error;
  }
}

async function validReport(filename) {
  try {
    const contents = await readFile(path.join(rawDirectory, filename), "utf8");
    JSON.parse(contents);
    return true;
  } catch {
    return false;
  }
}

const semgrepExecution = await readExecution("semgrep-execution.json");
const gitleaksExecution = await readExecution("gitleaks-execution.json");
const scans = [];

for (const repository of repositories) {
  const semgrepResult = semgrepExecution.scans.find((entry) =>
    entry.scanner === "Semgrep" && entry.repository === repository);
  const semgrepReport = `${repository}-semgrep.json`;
  scans.push({
    scanner: "Semgrep",
    repository,
    outcome: semgrepResult?.outcome === "success" && await validReport(semgrepReport) ? "success" : "failure",
    exitCode: semgrepResult?.exitCode ?? null,
    report: semgrepReport,
    log: semgrepResult?.log ?? null,
  });

  const trivyReport = `${repository}-trivy.sarif`;
  scans.push({
    scanner: "Trivy",
    repository,
    outcome: trivyOutcomes[repository] === "success" && await validReport(trivyReport) ? "success" : "failure",
    actionOutcome: trivyOutcomes[repository] ?? "not-run",
    report: trivyReport,
  });
}

for (const repository of gitleaksRepositories) {
  for (const [scanner, suffix] of [
    ["Gitleaks current files", "current"],
    ["Gitleaks Git history", "history"],
  ]) {
    const result = gitleaksExecution.scans.find((entry) =>
      entry.scanner === scanner && entry.repository === repository);
    const report = `${repository}-gitleaks-${suffix}.json`;
    scans.push({
      scanner,
      repository,
      outcome: result?.outcome === "success" && await validReport(report) ? "success" : "failure",
      exitCode: result?.exitCode ?? null,
      report,
      log: result?.log ?? null,
    });
  }
}

await writeFile(
  path.join(rawDirectory, "tool-execution.json"),
  `${JSON.stringify({ scans }, null, 2)}\n`,
);
