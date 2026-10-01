import { spawn } from "node:child_process";
import { requireAggressivePermission, requireTarget, validateTarget } from "./safety.mjs";

await requireAggressivePermission();
await validateTarget(requireTarget());
const child = spawn(process.execPath, ["scripts/run-policy-tests.mjs"], {
  cwd: new URL("..", import.meta.url),
  stdio: "inherit",
  env: process.env,
});
child.on("error", (error) => {
  console.error(`Unable to start the full harness test runner: ${error.message}`);
  process.exitCode = 1;
});
child.on("exit", (code) => { process.exitCode = code ?? 1; });
