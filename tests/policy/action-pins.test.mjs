import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const workflowDirectory = path.join(root, ".github/workflows");

test("all workflow Actions use documented immutable commit pins", async () => {
  const workflowFiles = (await readdir(workflowDirectory))
    .filter((file) => /\.(?:yml|yaml)$/.test(file));
  assert.ok(workflowFiles.length > 0, "No workflow files were found.");
  const documentation = await readFile(path.join(root, "docs/action-pins.md"), "utf8");

  for (const filename of workflowFiles) {
    const content = await readFile(path.join(workflowDirectory, filename), "utf8");
    for (const line of content.split(/\r?\n/).filter((entry) => /^\s*-?\s*uses:/i.test(entry))) {
      const match = line.match(/uses:\s*([^\s#]+)@([^\s#]+)\s*(?:#\s*(.+))?/i);
      assert.ok(match, `${filename} has a malformed action reference: ${line.trim()}`);
      assert.match(match[2], /^[a-f0-9]{40}$/i, `${filename} action is not SHA-pinned: ${match[1]}`);
      assert.ok(match[3], `${filename} action pin has no upstream version comment: ${match[1]}`);
      assert.ok(
        documentation.includes(match[2]),
        `${filename} action pin is missing from docs/action-pins.md: ${match[2]}`,
      );
    }
  }
});
