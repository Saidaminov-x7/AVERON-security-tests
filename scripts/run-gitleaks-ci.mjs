import { access, mkdir, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { resolveAllRepositories, sourceRepositories } from "./repositories.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourcePaths = await resolveAllRepositories();
const rawDirectory = path.join(root, "reports/raw");
await mkdir(rawDirectory, { recursive: true });

const targets = [
  ...Object.entries(sourceRepositories).map(([repository, definition]) => ({
    repository,
    githubRepository: definition.githubRepository,
    directory: sourcePaths[repository],
  })),
  {
    repository: "AVERON_security_tests",
    githubRepository: "Saidaminov-x7/AVERON-security-tests",
    directory: root,
  },
];
const results = [];

async function run(repository, githubRepository, directory, mode, suffix) {
  const reportPath = path.join(rawDirectory, `${repository}-gitleaks-${suffix}.json`);
  const logPath = path.join(rawDirectory, `${repository}-gitleaks-${suffix}.log`);
  let exitCode = 1;
  let errorMessage = null;
  const chunks = [];

  try {
    await access(path.join(directory, ".git"));
    const child = spawn(
      process.env.GITLEAKS_BIN ?? "gitleaks",
      [
        mode,
        "--no-banner",
        "--redact",
        "--report-format",
        "json",
        "--report-path",
        reportPath,
        "--exit-code",
        "0",
        ".",
      ],
      { cwd: directory, env: process.env, stdio: ["ignore", "pipe", "pipe"] },
    );
    for (const stream of [child.stdout, child.stderr]) {
      stream.on("data", (chunk) => {
        const text = chunk.toString();
        chunks.push(text);
        process.stdout.write(text);
      });
    }
    exitCode = await new Promise((resolve, reject) => {
      child.once("error", reject);
      child.once("close", (code) => resolve(code ?? 1));
    });
  } catch (error) {
    errorMessage = error.message;
    const diagnostic = `Gitleaks ${mode} scan could not run for ${repository} (${githubRepository}): ${errorMessage}\n`;
    chunks.push(diagnostic);
    process.stderr.write(diagnostic);
  }

  await writeFile(logPath, chunks.join(""));
  results.push({
    scanner: mode === "dir" ? "Gitleaks current files" : "Gitleaks Git history",
    repository,
    githubRepository,
    report: path.relative(root, reportPath).replaceAll(path.sep, "/"),
    log: path.relative(root, logPath).replaceAll(path.sep, "/"),
    outcome: exitCode === 0 ? "success" : "failure",
    exitCode,
    error: errorMessage,
  });
}

for (const target of targets) {
  await run(target.repository, target.githubRepository, target.directory, "dir", "current");
  await run(target.repository, target.githubRepository, target.directory, "git", "history");
}

await writeFile(
  path.join(rawDirectory, "gitleaks-execution.json"),
  `${JSON.stringify({ scans: results }, null, 2)}\n`,
);
const failures = results.filter((result) => result.outcome !== "success");
if (failures.length) {
  console.error("Gitleaks execution failed for one or more repository scans:");
  for (const result of failures) {
    console.error(`- ${result.scanner} / ${result.repository}: exit ${result.exitCode}; log: ${result.log}`);
  }
  process.exitCode = 1;
} else {
  console.log(`Gitleaks completed current-file and history scans for ${targets.length} repositories.`);
}
