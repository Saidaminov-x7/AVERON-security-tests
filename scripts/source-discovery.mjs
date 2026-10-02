import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const excludedDirectories = new Set([
  ".git",
  "node_modules",
  "dist",
  "build",
  "coverage",
  "reports",
  "cache",
  "tmp",
  "temp",
  "temporary",
]);
const sourceExtensions = new Set([".ts", ".tsx", ".js", ".mjs", ".cjs"]);

export async function discoverSourceFile(
  repositoryPath,
  { markers, searchRoots, maxDepth = 8, maxFiles = 2000 } = {},
) {
  if (!markers?.length || !searchRoots?.length) {
    throw new Error("SOURCE_DISCOVERY_FAILURE: markers and approved search roots are required.");
  }

  const matches = [];
  let inspected = 0;

  async function visit(directory, depth) {
    if (depth > maxDepth) return;
    let entries;
    try {
      entries = await readdir(directory, { withFileTypes: true });
    } catch (error) {
      if (error?.code === "ENOENT" && depth === 0) {
        throw new Error(
          `SOURCE_DISCOVERY_FAILURE: approved source directory "${path.relative(repositoryPath, directory)}" is missing.`,
        );
      }
      throw error;
    }

    entries.sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (!excludedDirectories.has(entry.name.toLowerCase())) {
          await visit(path.join(directory, entry.name), depth + 1);
        }
        continue;
      }
      if (!entry.isFile() || !sourceExtensions.has(path.extname(entry.name).toLowerCase())) continue;
      inspected += 1;
      if (inspected > maxFiles) {
        throw new Error(`SOURCE_DISCOVERY_FAILURE: search exceeded the ${maxFiles} source-file bound.`);
      }
      const filePath = path.join(directory, entry.name);
      const contents = await readFile(filePath, "utf8");
      if (markers.every((marker) => contents.includes(marker))) matches.push(filePath);
    }
  }

  for (const relativeRoot of searchRoots) {
    const searchRoot = path.resolve(repositoryPath, relativeRoot);
    try {
      await visit(searchRoot, 0);
    } catch (error) {
      if (error instanceof Error && error.message.startsWith("SOURCE_DISCOVERY_FAILURE:")) throw error;
      if (error?.code === "ENOENT") {
        throw new Error(
          `SOURCE_DISCOVERY_FAILURE: approved source directory "${path.relative(repositoryPath, searchRoot)}" `
          + `was not found in checkout "${repositoryPath}".`,
        );
      }
      throw error;
    }
  }

  if (matches.length !== 1) {
    const outcome = matches.length ? `${matches.length} matching files were found` : "no matching file was found";
    throw new Error(
      `SOURCE_DISCOVERY_FAILURE: ${outcome} in approved source directories `
      + `[${searchRoots.join(", ")}] for checkout "${repositoryPath}".`,
    );
  }
  return matches[0];
}
