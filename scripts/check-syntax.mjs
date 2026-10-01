import { readdir } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourceDirectories = ["scripts", "tests"];
const files = [];

async function collect(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const filename = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      await collect(filename);
    } else if (entry.isFile() && filename.endsWith(".mjs")) {
      files.push(filename);
    }
  }
}

for (const directory of sourceDirectories) await collect(path.join(root, directory));

let failed = false;
for (const filename of files) {
  const result = spawnSync(process.execPath, ["--check", filename], { cwd: root, stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    console.error(`JavaScript syntax check failed for ${filename}.`);
    failed = true;
  }
}

if (failed) throw new Error("JavaScript syntax check failed.");
console.log(`JavaScript syntax verified for ${files.length} files.`);
