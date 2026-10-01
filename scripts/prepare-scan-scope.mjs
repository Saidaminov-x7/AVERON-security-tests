import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { resolveAllRepositories } from "./repositories.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const rawDirectory = path.join(root, "reports/raw");
const resolvedRepositories = await resolveAllRepositories();
const repositories = Object.keys(resolvedRepositories);
await mkdir(rawDirectory, { recursive: true });
await mkdir(path.join(root, "reports/generated"), { recursive: true });

await writeFile(
  path.join(rawDirectory, "scan-scope.json"),
  `${JSON.stringify({
    scans: {
      Semgrep: repositories,
      Trivy: repositories,
      "Gitleaks current files": [...repositories, "AVERON_security_tests"],
      "Gitleaks Git history": [...repositories, "AVERON_security_tests"],
    },
  }, null, 2)}\n`,
);
console.log(`Prepared required scan scope for ${repositories.length} application repositories and this harness.`);
