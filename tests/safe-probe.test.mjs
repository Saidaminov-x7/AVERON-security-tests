import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function runSafeProbe(service, handler) {
  const server = createServer(handler);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address === "object");
  try {
    return await new Promise((resolve, reject) => {
      const child = spawn(process.execPath, ["scripts/run-safe.mjs"], {
        cwd: root,
        env: {
          ...process.env,
          SECURITY_ENV: "local",
          SECURITY_SERVICE: service,
          SECURITY_TARGET_URL: `http://127.0.0.1:${address.port}`,
        },
        stdio: ["ignore", "pipe", "pipe"],
      });
      let stdout = "";
      let stderr = "";
      child.stdout.setEncoding("utf8").on("data", (chunk) => { stdout += chunk; });
      child.stderr.setEncoding("utf8").on("data", (chunk) => { stderr += chunk; });
      child.on("error", reject);
      child.on("close", (code) => resolve({ code, stdout, stderr }));
    });
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

test("safe probes issue GET only and do not follow even same-origin redirects", async () => {
  const requests = [];
  const result = await runSafeProbe("frontend", (request, response) => {
    requests.push({ method: request.method, url: request.url });
    response.writeHead(302, { location: "/login" });
    response.end();
  });

  assert.equal(result.code, 0, result.stderr);
  assert.deepEqual(requests, [{ method: "GET", url: "/" }]);
  assert.match(result.stdout, /SAME_ORIGIN_NOT_FOLLOWED/);
});

test("capabilities safe probe checks feature booleans and does not disclose vector fields", async () => {
  const result = await runSafeProbe("backend", (request, response) => {
    if (request.url === "/health/live") {
      response.writeHead(200, { "content-type": "application/json" });
      response.end('{"status":"live"}');
      return;
    }
    response.writeHead(200, { "content-type": "application/json" });
    response.end('{"visualSearch":false,"similarProducts":false,"imageEmbeddings":false}');
  });

  assert.equal(result.code, 0, result.stderr);
  assert.match(result.stdout, /"capabilityShape": "PASS"/);
  assert.doesNotMatch(result.stdout, /embeddingVector|rawVector|vectorData/);
});

test("safe probe blocks external redirects without following them", async () => {
  const requests = [];
  const result = await runSafeProbe("frontend", (request, response) => {
    requests.push(request.url);
    response.writeHead(302, { location: "http://127.0.0.1:1/internal" });
    response.end();
  });

  assert.equal(result.code, 1);
  assert.deepEqual(requests, ["/"]);
  assert.match(result.stdout, /EXTERNAL_REDIRECT_BLOCKED/);
});
