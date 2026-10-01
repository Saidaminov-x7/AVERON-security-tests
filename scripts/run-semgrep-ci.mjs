import { mkdir, readFile, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { resolveAllRepositories, sourceRepositories } from "./repositories.mjs";
import { formatSemgrepErrors } from "./semgrep-diagnostics.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourcePaths = await resolveAllRepositories();
const rawDirectory = path.join(root, "reports/raw");
await mkdir(rawDirectory, { recursive: true });

const results = [];
for (const [repository, definition] of Object.entries(sourceRepositories)) {
  const checkoutPath = sourcePaths[repository];
  const reportPath = path.join(rawDirectory, `${repository}-semgrep.json`);
  const logPath = path.join(rawDirectory, `${repository}-semgrep.log`);
  const logChunks = [];
  let exitCode = 1;
  let errorMessage = null;

  try {
    const child = spawn(
      process.env.SEMGREP_BIN ?? "semgrep",
      [
        "scan",
        "--verbose",
        "--config",
        "p/security-audit",
        "--config",
        path.join(root, "security-tools/semgrep/averon.yml"),
        "--json",
        "--output",
        reportPath,
        checkoutPath,
      ],
      { cwd: root, env: process.env, stdio: ["ignore", "pipe", "pipe"] },
    );

    const logStream = (stream) => {
      stream.on("data", (chunk) => {
        const text = chunk.toString();
        logChunks.push(text);
        process.stdout.write(text);
      });
    };
    logStream(child.stdout);
    logStream(child.stderr);
    exitCode = await new Promise((resolve, reject) => {
      child.once("error", reject);
      child.once("close", (code) => resolve(code ?? 1));
    });
  } catch (error) {
    errorMessage = error.message;
    const diagnostic = `Semgrep could not scan ${repository} (${definition.githubRepository}): ${errorMessage}\n`;
    logChunks.push(diagnostic);
    process.stderr.write(diagnostic);
  }

  if (exitCode !== 0 && !errorMessage) {
    let diagnostics;
    try {
      const report = JSON.parse(await readFile(reportPath, "utf8"));
      diagnostics = formatSemgrepErrors(report);
    } catch (error) {
      if (error.code === "ENOENT") {
        diagnostics = [`Semgrep exited with code ${exitCode} without creating its JSON report.`];
      } else if (error instanceof SyntaxError) {
        diagnostics = [`Semgrep exited with code ${exitCode} and produced invalid JSON: ${error.message}`];
      } else {
        throw error;
      }
    }
    if (diagnostics.length === 0) {
      diagnostics.push(`Semgrep exited with code ${exitCode}; inspect its captured output for details.`);
    }
    const diagnostic = `${diagnostics.join("\n")}\n`;
    logChunks.push(diagnostic);
    process.stderr.write(diagnostic);
  }

  await writeFile(logPath, logChunks.join(""));
  results.push({
    scanner: "Semgrep",
    repository,
    githubRepository: definition.githubRepository,
    checkoutPath,
    report: path.relative(root, reportPath).replaceAll(path.sep, "/"),
    log: path.relative(root, logPath).replaceAll(path.sep, "/"),
    outcome: exitCode === 0 ? "success" : "failure",
    exitCode,
    error: errorMessage,
  });
}

await writeFile(
  path.join(rawDirectory, "semgrep-execution.json"),
  `${JSON.stringify({ scans: results }, null, 2)}\n`,
);
const failures = results.filter((result) => result.outcome !== "success");
if (failures.length) {
  console.error("Semgrep execution failed for one or more repositories:");
  for (const result of failures) {
    console.error(`- ${result.repository} (${result.githubRepository}): exit ${result.exitCode}; log: ${result.log}`);
  }
  process.exitCode = 1;
} else {
  console.log(`Semgrep completed successfully for ${results.length} application repositories.`);
}
