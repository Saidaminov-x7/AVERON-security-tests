import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { requireTarget, validateTarget } from "./safety.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const servicePaths = {
  backend: ["/health/live", "/api/v1/capabilities"],
  frontend: ["/"],
  admin: ["/"],
  parser: ["/api/health"],
};

const service = process.env.SECURITY_SERVICE;
if (!Object.hasOwn(servicePaths, service)) {
  throw new Error("SECURITY_SERVICE must be backend, frontend, admin, or parser.");
}
const { targetUrl, profile, policy } = await validateTarget(requireTarget());
const timeoutMs = policy.limits.requestTimeoutMs;
const maxBytes = policy.limits.responseBytes;
const checks = [];

for (const requestPath of servicePaths[service]) {
  const url = new URL(requestPath, targetUrl);
  if (url.origin !== targetUrl.origin) throw new Error("Safe probe escaped the validated target origin.");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  let status;
  let headers = {};
  let responseBytes = 0;
  let redirectDisposition = null;
  let capabilityShape = "NOT_APPLICABLE";
  const bodyChunks = [];
  let failure;
  try {
    const response = await fetch(url, {
      method: "GET",
      redirect: "manual",
      signal: controller.signal,
      headers: { accept: "application/json,text/html;q=0.8" },
    });
    status = response.status;
    headers = {
      contentTypeOptions: response.headers.get("x-content-type-options"),
      referrerPolicy: response.headers.get("referrer-policy"),
      frameOptions: response.headers.get("x-frame-options"),
      contentSecurityPolicy: response.headers.get("content-security-policy"),
      strictTransportSecurity: response.headers.get("strict-transport-security"),
    };
    for await (const chunk of response.body ?? []) {
      responseBytes += chunk.byteLength;
      if (responseBytes > maxBytes) {
        failure = "RESPONSE_LIMIT_EXCEEDED";
        break;
      }
      bodyChunks.push(Buffer.from(chunk));
    }
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location) {
        failure = "REDIRECT_WITHOUT_LOCATION";
      } else {
        try {
          redirectDisposition = new URL(location, url).origin === targetUrl.origin
            ? "SAME_ORIGIN_NOT_FOLLOWED"
            : "EXTERNAL_REDIRECT_BLOCKED";
          if (redirectDisposition === "EXTERNAL_REDIRECT_BLOCKED") failure = redirectDisposition;
        } catch {
          failure = "INVALID_REDIRECT_LOCATION";
        }
      }
    } else if (response.status < 200 || response.status >= 400) {
      failure ??= "UNEXPECTED_STATUS";
    }
    if (service === "backend" && requestPath === "/api/v1/capabilities" && status < 300) {
      try {
        const capabilities = JSON.parse(Buffer.concat(bodyChunks).toString("utf8"));
        const expectedFlags = ["visualSearch", "similarProducts", "imageEmbeddings"];
        const hasBooleanCapabilities = expectedFlags.every((key) => typeof capabilities[key] === "boolean");
        const hasRawVector = Object.keys(capabilities).some((key) =>
          ["embedding", "embeddingVector", "rawVector", "vectorData"].includes(key),
        );
        capabilityShape = hasBooleanCapabilities && !hasRawVector ? "PASS" : "FAIL";
        if (capabilityShape === "FAIL") failure ??= "UNSAFE_CAPABILITY_RESPONSE";
      } catch {
        capabilityShape = "FAIL";
        failure ??= "INVALID_CAPABILITY_RESPONSE";
      }
    }
  } catch (error) {
    failure = error instanceof Error && error.name === "AbortError" ? "TIMEOUT" : "NETWORK_FAILURE";
  } finally {
    clearTimeout(timeout);
  }
  checks.push({
    method: "GET",
    path: requestPath,
    status: status ?? null,
    responseBytes,
    safeHeaders: headers,
    headerReview: {
      contentTypeOptions: headers.contentTypeOptions === "nosniff",
      referrerPolicyPresent: Boolean(headers.referrerPolicy),
      frameProtectionPresent: Boolean(headers.frameOptions || headers.contentSecurityPolicy?.includes("frame-ancestors")),
      strictTransportSecurityPresent: targetUrl.protocol !== "https:" || Boolean(headers.strictTransportSecurity),
    },
    redirectDisposition,
    capabilityShape,
    result: failure ? "FAIL" : "PASS",
    failureCode: failure ?? null,
  });
}

const report = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  profile,
  service,
  targetOrigin: targetUrl.origin,
  aggressive: false,
  checks,
};
const outputDirectory = path.join(root, "reports/generated");
await mkdir(outputDirectory, { recursive: true });
await writeFile(path.join(outputDirectory, "safe-checks.json"), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ profile, service, targetOrigin: targetUrl.origin, checks }, null, 2));
if (checks.some((check) => check.result !== "PASS")) process.exitCode = 1;
