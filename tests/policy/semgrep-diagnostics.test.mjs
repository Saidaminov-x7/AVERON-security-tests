import test from "node:test";
import assert from "node:assert/strict";
import { formatSemgrepErrors } from "../../scripts/semgrep-diagnostics.mjs";

test("Semgrep JSON configuration errors are surfaced with their actual messages", () => {
  const diagnostics = formatSemgrepErrors({
    errors: [
      {
        code: 5,
        level: "error",
        message: "Invalid YAML file: mapping values are not allowed here",
      },
      {
        code: 7,
        level: "error",
        message: "invalid configuration file found",
      },
    ],
  });

  assert.deepEqual(diagnostics, [
    "Semgrep error (code 5): Invalid YAML file: mapping values are not allowed here",
    "Semgrep error (code 7): invalid configuration file found",
  ]);
});

test("Semgrep reports without errors do not fabricate scanner diagnostics", () => {
  assert.deepEqual(formatSemgrepErrors({ results: [] }), []);
});
