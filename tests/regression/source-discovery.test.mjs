import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { discoverSourceFile } from "../../scripts/source-discovery.mjs";

async function withFixture(run) {
  const root = await mkdtemp(path.join(os.tmpdir(), "averon-source-discovery-"));
  try {
    await run(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

test("discovers the required implementation in an available checkout", async () => {
  await withFixture(async (root) => {
    const implementation = path.join(root, "apps", "api", "src", "auth", "telegram-identity.ts");
    await mkdir(path.dirname(implementation), { recursive: true });
    await writeFile(implementation, "verifyTelegram(data) { timingSafeEqual(); auth_date; createHmac(); }");

    assert.equal(
      await discoverSourceFile(root, {
        searchRoots: [path.join("apps", "api", "src")],
        markers: ["timingSafeEqual", "auth_date", "createHmac"],
      }),
      implementation,
    );
  });
});

test("reports a controlled error when the expected checkout source root is missing", async () => {
  await withFixture(async (root) => {
    await assert.rejects(
      discoverSourceFile(root, { searchRoots: ["apps/api/src"], markers: ["signature"] }),
      /SOURCE_DISCOVERY_FAILURE: approved source directory .* is missing/,
    );
  });
});

test("finds implementation after a safe filename and module refactor", async () => {
  await withFixture(async (root) => {
    const implementation = path.join(root, "apps", "api", "src", "identity", "telegram-validation.ts");
    await mkdir(path.dirname(implementation), { recursive: true });
    await writeFile(implementation, "validateFreshTelegramPayload(); verifyTelegramSignature();");

    assert.equal(
      await discoverSourceFile(root, {
        searchRoots: ["apps/api/src"],
        markers: ["validateFreshTelegramPayload", "verifyTelegramSignature"],
      }),
      implementation,
    );
  });
});

test("ignores generated and dependency directories during source discovery", async () => {
  await withFixture(async (root) => {
    const valid = path.join(root, "apps", "api", "src", "authz", "telegram.ts");
    await mkdir(path.dirname(valid), { recursive: true });
    await mkdir(path.join(root, "apps", "api", "src", "auth", "node_modules"), { recursive: true });
    await mkdir(path.join(root, "apps", "api", "src", "auth", "dist"), { recursive: true });
    await writeFile(path.join(root, "apps", "api", "src", "auth", "node_modules", "telegram.ts"), "sameMarker");
    await writeFile(path.join(root, "apps", "api", "src", "auth", "dist", "generated.ts"), "sameMarker");
    await writeFile(valid, "sameMarker");

    assert.equal(
      await discoverSourceFile(root, { searchRoots: ["apps/api/src"], markers: ["sameMarker"] }),
      valid,
    );
  });
});

test("path resolution uses native path joining rather than separator assumptions", async () => {
  await withFixture(async (root) => {
    const implementation = path.join(root, "apps", "api", "src", "telegram.ts");
    await mkdir(path.dirname(implementation), { recursive: true });
    await writeFile(implementation, "nativePathMarker");

    const content = await readFile(await discoverSourceFile(root, {
      searchRoots: [path.join("apps", "api", "src")],
      markers: ["nativePathMarker"],
    }), "utf8");
    assert.equal(content, "nativePathMarker");
  });
});
