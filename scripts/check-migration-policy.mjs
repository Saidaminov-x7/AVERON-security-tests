import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { resolveRepositoryPath } from "./repositories.mjs";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const forbidden = /\bprisma\s+(?:db\s+push|migrate\s+reset)\b|--(?:force-reset|accept-data-loss)\b/i;

export async function assertProductionMigrationPolicy(backendRoot) {
  const packageJson = JSON.parse(await readFile(path.join(backendRoot, "package.json"), "utf8"));
  const scripts = packageJson.scripts ?? {};
  const deployScript = scripts["prisma:deploy"];
  if (typeof deployScript !== "string" || !/\bprisma\s+migrate\s+deploy\b/.test(deployScript)) {
    throw new Error("Backend production migration script must use `prisma migrate deploy`.");
  }

  for (const name of ["start", "prisma:deploy"]) {
    const script = scripts[name];
    if (typeof script !== "string") {
      throw new Error(`Backend production script "${name}" is missing.`);
    }
    if (forbidden.test(script)) {
      throw new Error(`Forbidden destructive migration command found in package.json script "${name}".`);
    }
  }

  for (const relative of ["railway.json", "apps/api/entrypoint.sh"]) {
    const content = await readFile(path.join(backendRoot, relative), "utf8");
    if (forbidden.test(content)) {
      throw new Error(`Forbidden destructive migration command found in production file ${relative}.`);
    }
  }

  return "Migration policy verified: production deployment uses migrate deploy only.";
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const backendRoot = await resolveRepositoryPath("AVERON_backend");
  console.log(await assertProductionMigrationPolicy(backendRoot));
}
