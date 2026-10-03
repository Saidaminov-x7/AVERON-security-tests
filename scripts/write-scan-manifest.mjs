import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { resolveAllRepositories, sourceRepositories } from "./repositories.mjs";
import { inspectScanArtifact } from "./scan-artifacts.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const rawDirectory = path.join(root, "reports/raw");
const sourcePaths = await resolveAllRepositories();
const repositories = Object.keys(sourceRepositories);
const gitleaksRepositories = [...repositories, "AVERON_security_tests"];
const versions = {
  Semgrep: process.env.SEMGREP_VERSION ?? "unknown",
  Trivy: process.env.TRIVY_VERSION ?? "unknown",
  "Gitleaks current files": process.env.GITLEAKS_VERSION ?? "unknown",
  "Gitleaks Git history": process.env.GITLEAKS_VERSION ?? "unknown",
};
const trivyOutcomes = {
  AVERON_backend: process.env.TRIVY_BACKEND_OUTCOME,
  AVERON_frontend: process.env.TRIVY_FRONTEND_OUTCOME,
  AVERON_admin_panel: process.env.TRIVY_ADMIN_OUTCOME,
  AVERON_parser: process.env.TRIVY_PARSER_OUTCOME,
};

await mkdir(rawDirectory, { recursive: true });

async function readJson(filename) {
  try {
    return JSON.parse(await readFile(path.join(rawDirectory, filename), "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

async function readExecution(filename) {
  try {
    return JSON.parse(await readFile(path.join(rawDirectory, filename), "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return { scans: [] };
    throw error;
  }
}

function gitRevision(repositoryPath) {
  try {
    return execFileSync("git", ["-C", repositoryPath, "rev-parse", "HEAD"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return null;
  }
}

const scope = await readJson("scan-scope.json");
const runId = process.env.GITHUB_RUN_ID ?? scope?.runId ?? `local-${randomUUID()}`;
const commitSha = process.env.GITHUB_SHA ?? scope?.commitSha ?? gitRevision(root);
const repositoryName = process.env.GITHUB_REPOSITORY
  ?? scope?.repository
  ?? "Saidaminov-x7/AVERON-security-tests";
const recordedAt = new Date().toISOString();
const semgrepExecution = await readExecution("semgrep-execution.json");
const gitleaksExecution = await readExecution("gitleaks-execution.json");
const scans = [];

async function addScan({
  scanner,
  repository,
  repositoryPath,
  executionSucceeded,
  exitCode,
  report,
  log = null,
  actionOutcome = null,
}) {
  const evidence = await inspectScanArtifact(
    scanner,
    path.join(rawDirectory, report),
    executionSucceeded,
  );
  scans.push({
    scanner,
    repository,
    outcome: evidence.status.startsWith("SCAN_SUCCESS_") ? "success" : "failure",
    status: evidence.status,
    findingsCount: evidence.findingsCount,
    scannerErrors: evidence.scannerErrors,
    reportSha256: evidence.reportSha256,
    exitCode,
    actionOutcome,
    report,
    log,
    runId,
    commitSha,
    timestamp: recordedAt,
    repositoryName,
    sourceCommitSha: repositoryPath ? gitRevision(repositoryPath) : null,
    toolVersion: versions[scanner],
  });
}

for (const repository of repositories) {
  const semgrepResult = semgrepExecution.scans.find((entry) =>
    entry.scanner === "Semgrep" && entry.repository === repository);
  const semgrepReport = `${repository}-semgrep.json`;
  await addScan({
    scanner: "Semgrep",
    repository,
    repositoryPath: sourcePaths[repository],
    executionSucceeded: semgrepResult?.outcome === "success",
    exitCode: semgrepResult?.exitCode ?? null,
    report: semgrepReport,
    log: semgrepResult?.log ?? null,
  });

  const trivyReport = `${repository}-trivy.sarif`;
  await addScan({
    scanner: "Trivy",
    repository,
    repositoryPath: sourcePaths[repository],
    executionSucceeded: trivyOutcomes[repository] === "success",
    exitCode: trivyOutcomes[repository] === "success" ? 0 : null,
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
    await addScan({
      scanner,
      repository,
      repositoryPath: repository === "AVERON_security_tests" ? root : sourcePaths[repository],
      executionSucceeded: result?.outcome === "success",
      exitCode: result?.exitCode ?? null,
      report,
      log: result?.log ?? null,
    });
  }
}

await writeFile(
  path.join(rawDirectory, "tool-execution.json"),
  `${JSON.stringify({
    runId,
    commitSha,
    timestamp: recordedAt,
    repository: repositoryName,
    scans,
  }, null, 2)}\n`,
);
