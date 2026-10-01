import { spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { requireAggressivePermission, requireTarget, validateTarget } from "./safety.mjs";

await requireAggressivePermission();
const { targetUrl } = await validateTarget(requireTarget());
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const reportDirectory = path.join(root, "reports/generated");
await mkdir(reportDirectory, { recursive: true });
const mode = process.env.SECURITY_DAST_MODE ?? "passive";
if (!["passive", "active"].includes(mode)) throw new Error("SECURITY_DAST_MODE must be passive or active.");
if (mode === "active" && process.env.SECURITY_ENV !== "staging") {
  throw new Error("ZAP active scanning is allowed only against an explicitly allowlisted staging target.");
}
if (process.env.SECURITY_DAST_PRECHECK_ONLY === "true") {
  console.log(`DAST target validated for staging ${mode} scan: ${targetUrl.origin}`);
  process.exit(0);
}
const executable = mode === "active"
  ? process.env.ZAP_FULL_SCAN_BIN ?? "zap-full-scan.py"
  : process.env.ZAP_BASELINE_BIN ?? "zap-baseline.py";
const args = mode === "active"
  ? ["-t", targetUrl.href, "-I", "-J", path.join(reportDirectory, "zap-active.json")]
  : ["-t", targetUrl.href, "-m", "2", "-I", "-J", path.join(reportDirectory, "zap-passive.json")];
const child = spawn(executable, args, { cwd: root, stdio: "inherit", env: process.env });
child.on("error", (error) => {
  console.error(`Unable to start OWASP ZAP: ${error.message}`);
  process.exitCode = 1;
});
child.on("exit", (code) => { process.exitCode = code ?? 1; });
