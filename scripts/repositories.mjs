import { access } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export const sourceRepositories = {
  AVERON_backend: {
    githubRepository: "Saidaminov-x7/AVERON-backend",
    pathVariable: "AVERON_BACKEND_REPO_PATH",
  },
  AVERON_frontend: {
    githubRepository: "Saidaminov-x7/AVERON-frontend",
    pathVariable: "AVERON_FRONTEND_REPO_PATH",
  },
  AVERON_admin_panel: {
    githubRepository: "Saidaminov-x7/AVERON-admin-panel",
    pathVariable: "AVERON_ADMIN_REPO_PATH",
  },
  AVERON_parser: {
    githubRepository: "Saidaminov-x7/AVERON-parser",
    pathVariable: "AVERON_PARSER_REPO_PATH",
  },
};

async function validateRepository(repository, repositoryPath, variable) {
  try {
    await access(path.join(repositoryPath, "package.json"));
  } catch {
    throw new Error(
      `Required source repository ${repository} was not found at "${repositoryPath}". `
      + `Check ${variable} or AVERON_SOURCE_ROOT.`,
    );
  }
  return repositoryPath;
}

export async function resolveRepositoryPath(
  repository,
  { env = process.env, harnessRoot = root } = {},
) {
  const definition = sourceRepositories[repository];
  if (!definition) throw new Error(`Unknown AVERON source repository: ${repository}.`);

  const explicitPath = env[definition.pathVariable];
  if (explicitPath) {
    return validateRepository(
      repository,
      path.resolve(harnessRoot, explicitPath),
      definition.pathVariable,
    );
  }

  const configuredSourceRoot = env.AVERON_SOURCE_ROOT;
  const candidates = configuredSourceRoot
    ? [path.resolve(harnessRoot, configuredSourceRoot)]
    : [path.join(harnessRoot, "source-checkouts"), path.resolve(harnessRoot, "..")];

  for (const candidate of candidates) {
    const repositoryPath = path.join(candidate, repository);
    try {
      await access(path.join(repositoryPath, "package.json"));
      return repositoryPath;
    } catch {
      // Continue only through the known local defaults.
    }
  }

  const expectedPath = path.join(candidates[0], repository);
  throw new Error(
    `Required source repository ${repository} (${definition.githubRepository}) was not found. `
    + `Expected "${expectedPath}". Set ${definition.pathVariable} to its checkout path `
    + "or AVERON_SOURCE_ROOT to the common parent of all source checkouts.",
  );
}

export async function resolveAllRepositories(options = {}) {
  const resolved = {};
  for (const repository of Object.keys(sourceRepositories)) {
    resolved[repository] = await resolveRepositoryPath(repository, options);
  }
  return resolved;
}
