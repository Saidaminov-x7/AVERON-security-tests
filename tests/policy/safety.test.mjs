import test from "node:test";
import assert from "node:assert/strict";
import { requireAggressivePermission, validateSecurityProfile, validateTarget } from "../../scripts/safety.mjs";

test("profile validation rejects missing or unknown modes", () => {
  assert.throws(() => validateSecurityProfile({}), /SECURITY_ENV/);
  assert.throws(() => validateSecurityProfile({ SECURITY_ENV: "production" }), /SECURITY_ENV/);
});

test("local profile allows only loopback targets over HTTP or HTTPS", async () => {
  const env = { SECURITY_ENV: "local" };
  await assert.doesNotReject(validateTarget("http://127.0.0.1:8080", env));
  await assert.doesNotReject(validateTarget("https://localhost:8443", env));
  await assert.doesNotReject(validateTarget("http://[::1]:8080", env));
  await assert.doesNotReject(validateTarget("http://2130706433:8080", env));
  await assert.rejects(validateTarget("http://example.com", env), /loopback/);
  await assert.rejects(validateTarget("https://example.com", env), /loopback/);
  await assert.rejects(validateTarget("http://192.168.1.20", env), /loopback/);
  await assert.rejects(validateTarget("http://[::ffff:7f00:1]", env), /loopback/);
});

test("staging requires HTTPS and an exact origin allowlist", async () => {
  const env = {
    SECURITY_ENV: "staging",
    SECURITY_STAGING_ALLOWED_ORIGINS: "https://staging.averon.example",
  };
  await assert.doesNotReject(validateTarget("https://staging.averon.example", env));
  await assert.rejects(validateTarget("https://other.example", env), /allowlisted/);
  await assert.rejects(validateTarget("http://staging.averon.example", env), /HTTPS/);
});

test("production-safe target requires explicit origin allowlist and disallows aggressive suites", async () => {
  const env = {
    SECURITY_ENV: "production-safe",
    SECURITY_PRODUCTION_SAFE_ALLOWED_ORIGINS: "https://averon.example",
    ALLOW_AGGRESSIVE_SECURITY_TESTS: "true",
  };
  await assert.doesNotReject(validateTarget("https://averon.example", env));
  await assert.rejects(requireAggressivePermission(env), /forbidden/);
  await assert.rejects(validateTarget("https://not-allowlisted.example", env), /allowlisted/);
});

test("all aggressive suites require an explicit opt-in outside production-safe", async () => {
  await assert.rejects(requireAggressivePermission({ SECURITY_ENV: "local" }), /ALLOW_AGGRESSIVE/);
  await assert.doesNotReject(requireAggressivePermission({
    SECURITY_ENV: "staging",
    ALLOW_AGGRESSIVE_SECURITY_TESTS: "true",
  }));
});

test("production-safe mode refuses every aggressive command before target access", async () => {
  const { spawnSync } = await import("node:child_process");
  const path = await import("node:path");
  const { fileURLToPath } = await import("node:url");
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

  for (const script of ["run-full.mjs", "run-api.mjs", "run-dast.mjs"]) {
    const result = spawnSync(process.execPath, [`scripts/${script}`], {
      cwd: root,
      encoding: "utf8",
      env: {
        ...process.env,
        SECURITY_ENV: "production-safe",
        ALLOW_AGGRESSIVE_SECURITY_TESTS: "true",
      },
    });
    assert.notEqual(result.status, 0, `${script} unexpectedly succeeded`);
    assert.match(result.stderr, /forbidden in production-safe mode/, `${script}: ${result.stderr}`);
  }
});

test("targets cannot embed credentials, query parameters, or fragments", async () => {
  const env = {
    SECURITY_ENV: "local",
    ALLOW_AGGRESSIVE_SECURITY_TESTS: "true",
  };
  await assert.rejects(validateTarget("http://user:pass@127.0.0.1", env), /credentials/);
  await assert.rejects(validateTarget("http://127.0.0.1:8080/?token=hidden", env), /query strings/);
  await assert.rejects(validateTarget("http://127.0.0.1:8080/#fragment", env), /fragments/);
});
