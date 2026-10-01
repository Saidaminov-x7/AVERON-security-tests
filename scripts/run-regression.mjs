import { access, readdir } from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourceRoot = path.resolve(
  process.env.AVERON_SOURCE_ROOT
    ?? path.join(root, "source-checkouts"),
);
const repositories = [
  "AVERON_backend",
  "AVERON_frontend",
  "AVERON_admin_panel",
  "AVERON_parser",
];

for (const repository of repositories) {
  try {
    await access(path.join(sourceRoot, repository, "package.json"));
  } catch {
    throw new Error(
      `Required source checkout is missing: ${path.join(sourceRoot, repository)}. `
      + "Set AVERON_SOURCE_ROOT to the directory containing all four AVERON source repositories.",
    );
  }
}

const testDirectory = path.join(root, "tests/regression");
const testFiles = (await readdir(testDirectory))
  .filter((file) => file.endsWith(".test.mjs"))
  .map((file) => path.join(testDirectory, file));
if (testFiles.length === 0) throw new Error("No source regression test files were found.");

const child = spawn(
  process.execPath,
  ["--test", ...testFiles],
  {
    cwd: root,
    env: { ...process.env, AVERON_SOURCE_ROOT: sourceRoot },
    stdio: "inherit",
  },
);
child.on("error", (error) => {
  console.error(`Unable to start source regression tests: ${error.message}`);
  process.exitCode = 1;
});
child.on("exit", (code) => {
  process.exitCode = code ?? 1;
});
