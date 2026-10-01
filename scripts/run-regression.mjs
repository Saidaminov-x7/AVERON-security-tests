import { readdir } from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { resolveAllRepositories, sourceRepositories } from "./repositories.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repositories = await resolveAllRepositories();

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
    env: {
      ...process.env,
      ...Object.fromEntries(Object.entries(sourceRepositories).map(([repository, definition]) => [
        definition.pathVariable,
        repositories[repository],
      ])),
    },
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
