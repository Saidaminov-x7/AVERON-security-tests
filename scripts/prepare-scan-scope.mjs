import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { resolveAllRepositories } from "./repositories.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const rawDirectory = path.join(root, "reports/raw");
const resolvedRepositories = await resolveAllRepositories();
const repositories = Object.keys(resolvedRepositories);
await mkdir(rawDirectory, { recursive: true });
await mkdir(path.join(root, "reports/generated"), { recursive: true });
const repositoriesToScan = [...repositories, "AVERON_security_tests"];
const priorArtifacts = [
  "semgrep-execution.json",
  "gitleaks-execution.json",
  "tool-execution.json",
  ...repositories.flatMap((repository) => [
    `${repository}-semgrep.json`,
    `${repository}-trivy.sarif`,
    `${repository}-semgrep.log`,
  ]),
  ...repositoriesToScan.flatMap((repository) => [
    `${repository}-gitleaks-current.json`,
    `${repository}-gitleaks-history.json`,
    `${repository}-gitleaks-current.log`,
    `${repository}-gitleaks-history.log`,
  ]),
];
await Promise.all(priorArtifacts.map((filename) =>
  rm(path.join(rawDirectory, filename), { force: true }),
));

let commitSha = process.env.GITHUB_SHA ?? null;
if (!commitSha) {
  try {
    commitSha = execFileSync("git", ["-C", root, "rev-parse", "HEAD"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    commitSha = null;
  }
}

await writeFile(
  path.join(rawDirectory, "scan-scope.json"),
  `${JSON.stringify({
    runId: process.env.GITHUB_RUN_ID ?? `local-${randomUUID()}`,
    commitSha,
    timestamp: new Date().toISOString(),
    repository: process.env.GITHUB_REPOSITORY ?? "Saidaminov-x7/AVERON-security-tests",
    scans: {
      Semgrep: repositories,
      Trivy: repositories,
      "Gitleaks current files": [...repositories, "AVERON_security_tests"],
      "Gitleaks Git history": [...repositories, "AVERON_security_tests"],
    },
  }, null, 2)}\n`,
);
console.log(`Prepared required scan scope for ${repositories.length} application repositories and this harness.`);
