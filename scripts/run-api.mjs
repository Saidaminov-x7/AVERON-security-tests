import { spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { requireAggressivePermission, requireTarget, validateTarget } from "./safety.mjs";

await requireAggressivePermission();
const { targetUrl } = await validateTarget(requireTarget());
const schemaValue = process.env.SECURITY_OPENAPI_URL;
if (!schemaValue) throw new Error("SECURITY_OPENAPI_URL is required; no OpenAPI endpoint will be guessed.");
const schemaUrl = new URL(schemaValue);
if (
  !["http:", "https:"].includes(schemaUrl.protocol)
  || schemaUrl.username
  || schemaUrl.password
  || schemaUrl.search
  || schemaUrl.hash
) {
  throw new Error("SECURITY_OPENAPI_URL must be an HTTP(S) URL without credentials, query, or fragment.");
}
if (schemaUrl.origin !== targetUrl.origin) {
  throw new Error("SECURITY_OPENAPI_URL must use the validated SECURITY_TARGET_URL origin.");
}
const maxExamples = Number(process.env.SECURITY_MAX_EXAMPLES ?? "40");
if (!Number.isInteger(maxExamples) || maxExamples < 1 || maxExamples > 100) {
  throw new Error("SECURITY_MAX_EXAMPLES must be an integer from 1 to 100.");
}
const command = process.env.SCHEMATHESIS_BIN ?? "schemathesis";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const reportDirectory = path.join(root, "reports/generated/schemathesis");
await mkdir(reportDirectory, { recursive: true });
const child = spawn(command, [
  "run",
  schemaUrl.href,
  "--base-url",
  targetUrl.origin,
  "--checks",
  "all",
  "--max-examples",
  String(maxExamples),
  "--report",
  "json",
  "--report-dir",
  reportDirectory,
  "--report-junit-path",
  path.join(reportDirectory, "junit.xml"),
], { cwd: root, stdio: "inherit", env: process.env });
child.on("error", (error) => {
  console.error(`Unable to start Schemathesis: ${error.message}`);
  process.exitCode = 1;
});
child.on("exit", (code) => { process.exitCode = code ?? 1; });
