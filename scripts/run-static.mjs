import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { resolveAllRepositories } from "./repositories.mjs";
import { inspectScanArtifact } from "./scan-artifacts.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourcePaths = await resolveAllRepositories();
const repositories = Object.keys(sourcePaths);
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

const runId = process.env.GITHUB_RUN_ID ?? `local-${randomUUID()}`;
const commitSha = process.env.GITHUB_SHA ?? gitRevision(root);
const repositoryName = process.env.GITHUB_REPOSITORY ?? "Saidaminov-x7/AVERON-security-tests";
const recordedAt = new Date().toISOString();
const versions = {
  Semgrep: process.env.SEMGREP_VERSION ?? "unknown",
  Trivy: process.env.TRIVY_VERSION ?? "unknown",
  "Gitleaks current files": process.env.GITLEAKS_VERSION ?? "unknown",
  "Gitleaks Git history": process.env.GITLEAKS_VERSION ?? "unknown",
};

const reportDirectory = path.join(root, "reports/raw");
await mkdir(reportDirectory, { recursive: true });
const scannerRepositories = [...repositories, "AVERON_security_tests"];
const scannerOutputs = scannerRepositories.flatMap((repository) => [
  ...(repository === "AVERON_security_tests"
    ? []
    : [
        `${repository}-semgrep.json`,
        `${repository}-trivy.sarif`,
      ]),
  `${repository}-gitleaks-current.json`,
  `${repository}-gitleaks-history.json`,
].map((filename) => path.join(reportDirectory, filename)));
await Promise.all(scannerOutputs.map((output) => rm(output, { force: true })));
await writeFile(
  path.join(reportDirectory, "scan-scope.json"),
  `${JSON.stringify({
    runId,
    commitSha,
    timestamp: recordedAt,
    repository: repositoryName,
    scans: {
      Semgrep: repositories,
      Trivy: repositories,
      "Gitleaks current files": [...repositories, "AVERON_security_tests"],
      "Gitleaks Git history": [...repositories, "AVERON_security_tests"],
    },
  }, null, 2)}\n`,
);
const toolResults = [];

function runTool(repository, tool, executable, args, cwd) {
  return new Promise((resolve) => {
    const child = spawn(executable, args, { cwd, stdio: "inherit", env: process.env });
    child.on("error", (error) => {
      console.error(`${tool} is unavailable for ${repository}: ${error.message}`);
      resolve({ repository, tool, exitCode: null });
    });
    child.on("exit", (code) => resolve({ repository, tool, exitCode: code ?? 1 }));
  });
}

for (const repository of repositories) {
  const repositoryPath = sourcePaths[repository];
  const semgrepReport = path.join(reportDirectory, `${repository}-semgrep.json`);
  const trivyReport = path.join(reportDirectory, `${repository}-trivy.sarif`);
  const gitleaksCurrentReport = path.join(reportDirectory, `${repository}-gitleaks-current.json`);
  const gitleaksHistoryReport = path.join(reportDirectory, `${repository}-gitleaks-history.json`);
  const scans = [
    [
      "Semgrep",
      process.env.SEMGREP_BIN ?? "semgrep",
      [
        "scan", "--config", "p/security-audit",
        "--config", path.join(root, "security-tools/semgrep/averon.yml"),
        "--json", "--output", semgrepReport, ".",
      ],
    ],
    [
      "Trivy",
      process.env.TRIVY_BIN ?? "trivy",
      [
        "fs", "--scanners", "vuln,misconfig", "--format", "sarif",
        "--output", trivyReport, ".",
      ],
    ],
    [
      "Gitleaks current files",
      process.env.GITLEAKS_BIN ?? "gitleaks",
      [
        "dir", "--redact", "--report-format", "json",
        "--report-path", gitleaksCurrentReport, "--exit-code", "0", ".",
      ],
    ],
    [
      "Gitleaks Git history",
      process.env.GITLEAKS_BIN ?? "gitleaks",
      [
        "git", "--redact", "--report-format", "json",
        "--report-path", gitleaksHistoryReport, "--exit-code", "0", ".",
      ],
    ],
  ];
  for (const [tool, executable, args] of scans) {
    toolResults.push(await runTool(repository, tool, executable, args, repositoryPath));
  }
}

const ownCurrentReport = path.join(reportDirectory, "AVERON_security_tests-gitleaks-current.json");
const ownHistoryReport = path.join(reportDirectory, "AVERON_security_tests-gitleaks-history.json");
for (const [tool, args] of [
  ["Gitleaks current files", ["dir", "--redact", "--report-format", "json", "--report-path", ownCurrentReport, "--exit-code", "0", "."]],
  ["Gitleaks Git history", ["git", "--redact", "--report-format", "json", "--report-path", ownHistoryReport, "--exit-code", "0", "."]],
]) {
  toolResults.push(await runTool("AVERON_security_tests", tool, process.env.GITLEAKS_BIN ?? "gitleaks", args, root));
}

const requiredScans = [
  ...repositories.flatMap((repository) => [
    { scanner: "Semgrep", repository },
    { scanner: "Trivy", repository },
  ]),
  ...[...repositories, "AVERON_security_tests"].flatMap((repository) => [
    { scanner: "Gitleaks current files", repository },
    { scanner: "Gitleaks Git history", repository },
  ]),
];
function outputFile(scanner, repository) {
  if (scanner === "Semgrep") return `${repository}-semgrep.json`;
  if (scanner === "Trivy") return `${repository}-trivy.sarif`;
  const suffix = scanner === "Gitleaks current files" ? "current" : "history";
  return `${repository}-gitleaks-${suffix}.json`;
}

const scans = await Promise.all(requiredScans.map(async ({ scanner, repository }) => {
  const result = toolResults.find((entry) => entry.repository === repository && entry.tool === scanner);
  const report = outputFile(scanner, repository);
  const evidence = await inspectScanArtifact(
    scanner,
    path.join(reportDirectory, report),
    result?.exitCode === 0,
  );
  const repositoryPath = repository === "AVERON_security_tests" ? root : sourcePaths[repository];
  return {
    scanner,
    repository,
    outcome: evidence.status.startsWith("SCAN_SUCCESS_") ? "success" : "failure",
    status: evidence.status,
    findingsCount: evidence.findingsCount,
    scannerErrors: evidence.scannerErrors,
    reportSha256: evidence.reportSha256,
    report,
    exitCode: result?.exitCode ?? null,
    runId,
    commitSha,
    timestamp: recordedAt,
    repositoryName,
    sourceCommitSha: gitRevision(repositoryPath),
    toolVersion: versions[scanner],
  };
}));
await writeFile(
  path.join(reportDirectory, "tool-execution.json"),
  `${JSON.stringify({
    runId,
    commitSha,
    timestamp: recordedAt,
    repository: repositoryName,
    scans,
  }, null, 2)}\n`,
);

for (const script of ["generate-report.mjs", "enforce-baseline.mjs"]) {
  const child = await runTool(
    "AVERON_security_tests",
    script,
    process.execPath,
    [path.join(root, "scripts", script)],
    root,
  );
  toolResults.push(child);
}

const failed = toolResults.filter(({ exitCode }) => exitCode !== 0);
if (failed.length) {
  console.error(JSON.stringify({ failed }, null, 2));
  process.exitCode = 1;
}
