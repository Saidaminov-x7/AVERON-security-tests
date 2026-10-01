import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const workflow = await readFile(path.join(root, ".github/workflows/security-ci.yml"), "utf8");

function stepWithId(id) {
  const idIndex = workflow.indexOf(`id: ${id}`);
  assert.notEqual(idIndex, -1, `Missing workflow step id "${id}"`);
  const start = workflow.lastIndexOf("      - name:", idIndex);
  const next = workflow.indexOf("      - name:", idIndex);
  return workflow.slice(start, next === -1 ? undefined : next);
}

test("Semgrep, each Trivy scan, and Gitleaks run despite earlier scanner failures", () => {
  for (const id of [
    "semgrep",
    "trivy_backend",
    "trivy_frontend",
    "trivy_admin",
    "trivy_parser",
    "gitleaks",
  ]) {
    assert.match(stepWithId(id), /^\s*- name:[\s\S]*?\n\s*if: always\(\)/);
  }
});

test("Trivy scans each canonical application checkout alias independently", () => {
  for (const [id, repository] of [
    ["trivy_backend", "AVERON_backend"],
    ["trivy_frontend", "AVERON_frontend"],
    ["trivy_admin", "AVERON_admin_panel"],
    ["trivy_parser", "AVERON_parser"],
  ]) {
    const step = stepWithId(id);
    assert.ok(step.includes(`scan-ref: source-checkouts/${repository}`), `${id} uses the wrong checkout path`);
    assert.ok(step.includes(`output: reports/raw/${repository}-trivy.sarif`), `${id} has no repository-specific SARIF`);
  }
});

test("manifest, normalized report, and baseline gate always run after scanners", () => {
  for (const stepName of [
    "Record scanner execution and report coverage",
    "Generate normalized security report",
    "Enforce security baseline",
  ]) {
    const start = workflow.indexOf(`- name: ${stepName}`);
    assert.notEqual(start, -1, `Missing "${stepName}" step`);
    const next = workflow.indexOf("      - name:", start + 1);
    const step = workflow.slice(start, next === -1 ? undefined : next);
    assert.match(step, /\n\s*if: always\(\)/, `${stepName} must run after scanner failure`);
  }
});

test("Gitleaks installs the pinned official release with a verified digest", () => {
  const step = stepWithId("install_gitleaks");
  assert.match(step, /GITLEAKS_VERSION:\s*"8\.28\.0"/);
  assert.match(step, /GITLEAKS_SHA256:\s*"[a-f0-9]{64}"/);
  assert.match(step, /releases\/download\/v\$\{GITLEAKS_VERSION\}\/\$\{archive\}/);
  assert.match(step, /sha256sum --check/);
  assert.match(step, /gitleaks" version/);
  assert.doesNotMatch(step, /go install/);
});

test("SARIF upload has only the narrowly required token permissions", () => {
  const permissions = workflow.match(
    /  cross-repository-static:\r?\n[\s\S]*?    permissions:\r?\n((?:      [^\r\n]+\r?\n)+)/,
  )?.[1];
  assert.ok(permissions, "Missing permissions for cross-repository-static job");
  assert.deepEqual(
    permissions.split(/\r?\n/).filter(Boolean).map((permission) => permission.trim()),
    ["actions: read", "contents: read", "security-events: write"],
  );
});
