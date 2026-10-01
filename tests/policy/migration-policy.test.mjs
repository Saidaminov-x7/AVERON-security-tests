import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { assertProductionMigrationPolicy } from "../../scripts/check-migration-policy.mjs";
import { resolveRepositoryPath } from "../../scripts/repositories.mjs";

test("production migration policy checks the actual checked-out backend", async () => {
  const backendRoot = await resolveRepositoryPath("AVERON_backend");
  const result = await assertProductionMigrationPolicy(backendRoot);
  assert.match(result, /migrate deploy only/);
});

test("migration policy ignores forbidden-command examples outside production inputs", async () => {
  const backendRoot = await mkdtemp(path.join(os.tmpdir(), "averon-migration-policy-"));
  try {
    await mkdir(path.join(backendRoot, "apps/api"), { recursive: true });
    await writeFile(path.join(backendRoot, "package.json"), JSON.stringify({
      scripts: { start: "sh apps/api/entrypoint.sh", "prisma:deploy": "prisma migrate deploy" },
    }));
    await writeFile(path.join(backendRoot, "railway.json"), '{"deploy":{"startCommand":"pnpm start"}}');
    await writeFile(path.join(backendRoot, "apps/api/entrypoint.sh"), "pnpm prisma:deploy\n");
    await writeFile(path.join(backendRoot, "README.md"), "Do not run prisma db push or prisma migrate reset.\n");
    await mkdir(path.join(backendRoot, "tests"), { recursive: true });
    await writeFile(path.join(backendRoot, "tests/migration-policy.test.mjs"), "const forbidden = '--force-reset --accept-data-loss';\n");

    await assert.doesNotReject(assertProductionMigrationPolicy(backendRoot));
  } finally {
    await rm(backendRoot, { recursive: true, force: true });
  }
});

test("migration policy rejects forbidden commands in production scripts and entrypoints", async () => {
  const backendRoot = await mkdtemp(path.join(os.tmpdir(), "averon-migration-policy-"));
  try {
    await mkdir(path.join(backendRoot, "apps/api"), { recursive: true });
    await writeFile(path.join(backendRoot, "package.json"), JSON.stringify({
      scripts: { start: "sh apps/api/entrypoint.sh", "prisma:deploy": "prisma migrate deploy" },
    }));
    await writeFile(path.join(backendRoot, "railway.json"), '{"deploy":{"startCommand":"pnpm start"}}');
    await writeFile(path.join(backendRoot, "apps/api/entrypoint.sh"), "prisma migrate reset\n");

    await assert.rejects(
      assertProductionMigrationPolicy(backendRoot),
      /Forbidden destructive migration command found in production file apps\/api\/entrypoint\.sh/,
    );
  } finally {
    await rm(backendRoot, { recursive: true, force: true });
  }
});

test("repository resolver honors explicit checkouts and explains missing sources", async () => {
  const harnessRoot = await mkdtemp(path.join(os.tmpdir(), "averon-repository-path-"));
  try {
    const backendPath = path.join(harnessRoot, "source-checkouts", "backend");
    await mkdir(backendPath, { recursive: true });
    await writeFile(path.join(backendPath, "package.json"), "{}");
    assert.equal(
      await resolveRepositoryPath("AVERON_backend", {
        harnessRoot,
        env: { AVERON_BACKEND_REPO_PATH: backendPath },
      }),
      backendPath,
    );
    await assert.rejects(
      resolveRepositoryPath("AVERON_frontend", {
        harnessRoot,
        env: { AVERON_FRONTEND_REPO_PATH: path.join(harnessRoot, "missing") },
      }),
      /Required source repository AVERON_frontend was not found/,
    );
  } finally {
    await rm(harnessRoot, { recursive: true, force: true });
  }
});
