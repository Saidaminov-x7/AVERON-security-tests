import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const workspaceParent = path.resolve(repositoryRoot, "..");
const sourceRoot = path.resolve(
  process.env.AVERON_SOURCE_ROOT
    ?? (await exists(path.join(repositoryRoot, "source-checkouts/AVERON_backend/package.json"))
      ? path.join(repositoryRoot, "source-checkouts")
      : workspaceParent),
);
const backendRoot = path.join(sourceRoot, "AVERON_backend");
const packageJson = JSON.parse(await readFile(path.join(backendRoot, "package.json"), "utf8"));
const deployScript = packageJson.scripts?.["prisma:deploy"];
if (typeof deployScript !== "string" || !/\bprisma\s+migrate\s+deploy\b/.test(deployScript)) {
  throw new Error("Backend production migration script must use `prisma migrate deploy`.");
}

const deploymentFiles = [
  "railway.json",
  "Dockerfile",
  "apps/api/entrypoint.sh",
];
const forbidden = /\bprisma\s+(?:db\s+push|migrate\s+reset)\b|--(?:force-reset|accept-data-loss)\b/i;
for (const relative of deploymentFiles) {
  let content;
  try {
    content = await readFile(path.join(backendRoot, relative), "utf8");
  } catch (error) {
    if (error?.code === "ENOENT") continue;
    throw error;
  }
  if (forbidden.test(content)) throw new Error(`Forbidden destructive migration command found in ${relative}.`);
}

console.log("Migration policy verified: production deployment uses migrate deploy only.");

async function exists(file) {
  try {
    await access(file);
    return true;
  } catch {
    return false;
  }
}
