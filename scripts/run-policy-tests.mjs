import { readdir } from "node:fs/promises";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const testDirectories = ["tests/policy"];
const testFiles = [path.join(root, "tests/safe-probe.test.mjs")];

async function collect(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const filename = path.join(directory, entry.name);
    if (entry.isDirectory()) await collect(filename);
    else if (entry.isFile() && filename.endsWith(".test.mjs")) testFiles.push(filename);
  }
}

for (const directory of testDirectories) await collect(path.join(root, directory));

const child = spawn(process.execPath, ["--test", ...testFiles], {
  cwd: root,
  stdio: "inherit",
});
child.on("error", (error) => {
  console.error(`Unable to start policy tests: ${error.message}`);
  process.exitCode = 1;
});
child.on("exit", (code) => {
  process.exitCode = code ?? 1;
});
