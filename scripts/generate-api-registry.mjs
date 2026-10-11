import { existsSync, statSync } from "node:fs";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { resolveAllRepositories } from "./repositories.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repositories = await resolveAllRepositories();
const backendRoot = repositories.AVERON_backend;
const apiRoot = path.join(backendRoot, "apps/api/src");
const requireBackend = createRequire(path.join(backendRoot, "apps/api/package.json"));
const ts = requireBackend("typescript");
const routeMethods = new Set(["get", "post", "put", "patch", "delete", "head", "options", "all", "route"]);
const scanned = new Map();
const endpoints = [];
const testFiles = [];

async function collectFiles(directory, predicate = () => true) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const filePath = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await collectFiles(filePath, predicate));
    else if (entry.isFile() && predicate(filePath)) files.push(filePath);
  }
  return files;
}

function stringValue(node) {
  if (!node) return null;
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
  return null;
}

function propertyValue(object, name) {
  if (!object || !ts.isObjectLiteralExpression(object)) return undefined;
  const property = object.properties.find((entry) =>
    (ts.isPropertyAssignment(entry) || ts.isShorthandPropertyAssignment(entry))
    && (ts.isIdentifier(entry.name) || ts.isStringLiteral(entry.name))
    && entry.name.text === name,
  );
  return property && ts.isPropertyAssignment(property) ? property.initializer : undefined;
}

function routePrefix(value) {
  if (!value || typeof value !== "string" || value === "/") return "";
  return `/${value.split("/").filter(Boolean).join("/")}`;
}

function routePath(prefix, value) {
  if (value === null) return "<dynamic>";
  const parts = `${prefix}/${value}`.split("/").filter(Boolean);
  return `/${parts.join("/")}`;
}

function testPathPattern(route) {
  const quoteCharacters = String.fromCharCode(34, 39, 96);
  const escaped = route.split("/").filter(Boolean).map((segment) =>
    segment.startsWith(":") ? `[^/${quoteCharacters}?]+` : segment.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
  );
  return new RegExp(`[${quoteCharacters}]\\s*/${escaped.join("/")}(?=$|[?/${quoteCharacters}])`);
}

function resolveImportedFile(sourcePath, specifier) {
  if (!specifier.startsWith(".")) return null;
  const base = path.resolve(path.dirname(sourcePath), specifier);
  return [base, `${base}.ts`, `${base}.tsx`, `${base}.js`, path.join(base, "index.ts")]
    .find((candidate) => existsSync(candidate) && statSync(candidate).isFile()) ?? null;
}

function schemaFields(options, sourceFile) {
  const schema = propertyValue(options, "schema");
  if (!schema || !ts.isObjectLiteralExpression(schema)) {
    return { request: "NOT_DECLARED", response: "NOT_DECLARED" };
  }
  const describe = (names) => Object.fromEntries(names.flatMap((name) => {
    const value = propertyValue(schema, name);
    if (!value) return [];
    return [[name, value.getText(sourceFile).replace(/\s+/g, " ").slice(0, 240)]];
  }));
  const request = describe(["params", "querystring", "body", "headers"]);
  const response = describe(["response"]);
  return {
    request: Object.keys(request).length ? request : "NOT_DECLARED",
    response: Object.keys(response).length ? response : "NOT_DECLARED",
  };
}

function classifyAccess(routeText, sourcePath, preHandlerText) {
  const fullText = `${routeText}\n${preHandlerText}`;
  const adminModule = sourcePath.includes(`${path.sep}modules${path.sep}admin${path.sep}`);
  const adminGuard = /adminMiddleware|requireAdminRole|requirePermission|ActionHandler|settingsHandler|analyticsHandler|cmsHandler|supportHandler/i.test(fullText);
  const authGuard = /authMiddleware|requireAuth|authenticate/i.test(fullText);
  if (adminModule || adminGuard) {
    const explicitRole = fullText.match(/requireAdminRole\(\s*['"]([^'"]+)['"]\s*\)/)?.[1];
    const enumRoles = [...new Set([...fullText.matchAll(/AdminRole\.([A-Z_]+)/g)].map((match) => match[1]))];
    return {
      access: "ADMIN",
      requiredRole: explicitRole ?? (enumRoles.length ? enumRoles.join("|") : "ADMIN_ROLE_OR_PERMISSION"),
    };
  }
  if (authGuard || /if\s*\(\s*!request\.user\b/.test(routeText)) {
    return { access: "AUTHENTICATED", requiredRole: "AUTHENTICATED_USER" };
  }
  return { access: "PUBLIC", requiredRole: "NONE" };
}

function moduleName(sourcePath) {
  const relative = path.relative(path.join(apiRoot, "modules"), sourcePath);
  return relative.startsWith("..") ? "core" : relative.split(path.sep)[0];
}

function ownershipRequirement(routePathValue, routeText) {
  if (/\/(?:me|my|cart|wishlist|outfits|orders|addresses)(?:\/|$)/i.test(routePathValue)
      || /request\.user\.(?:id|userId)|authenticatedUserId/i.test(routeText)) {
    return "DERIVE_OWNER_FROM_AUTHENTICATED_CONTEXT";
  }
  if (/:[^/]+/.test(routePathValue) || /\b(?:userId|ownerId|orderId|cartId|wishlistId|outfitId|addressId)\b/.test(routeText)) {
    return "RESOURCE_OWNERSHIP_OR_ADMIN_AUTHORIZATION_REQUIRED";
  }
  return "NOT_APPLICABLE";
}

function rateLimitCategory(routePathValue, optionsText) {
  const routeSpecific = /rateLimit\s*:/.test(optionsText);
  const sensitive = /auth|login|register|password|reset|otp|totp|sms|phone|request-code|verify-code|upload|visual-search|ai-chat|search/i.test(routePathValue);
  return {
    category: sensitive ? "SENSITIVE_ENDPOINT" : "GLOBAL",
    configuration: routeSpecific ? "ROUTE_SPECIFIC" : "GLOBAL_RATE_LIMIT",
  };
}

function sensitiveData(routePathValue, module) {
  if (/\/admin|auth|integrations|users|orders|address|password|otp|session|webhook/i.test(`${routePathValue} ${module}`)) {
    return "SENSITIVE_ACCOUNT_OR_ADMIN_DATA";
  }
  if (/cart|wishlist|outfit|review|history|recommendation|checkout|payment|analytics/i.test(routePathValue)) {
    return "PERSONAL_OR_COMMERCE_DATA";
  }
  return "PUBLIC_OR_LOW_SENSITIVITY";
}

async function emitRoutes(sourcePath, prefix, active = new Set()) {
  const visitKey = `${sourcePath}\0${prefix}`;
  if (active.has(visitKey) || scanned.has(`${sourcePath}\0${prefix}`)) return;
  const nextActive = new Set(active).add(visitKey);
  const sourceText = await readFile(sourcePath, "utf8");
  const sourceFile = ts.createSourceFile(sourcePath, sourceText, ts.ScriptTarget.Latest, true);
  scanned.set(`${sourcePath}\0${prefix}`, sourceFile);
  const imports = new Map();
  const localInitializers = new Map();
  function collectLocalInitializers(node) {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) {
      localInitializers.set(node.name.text, node.initializer);
    }
    ts.forEachChild(node, collectLocalInitializers);
  }
  collectLocalInitializers(sourceFile);

  function expandLocalAliases(node, seen = new Set()) {
    if (!node) return "";
    if (ts.isIdentifier(node)) {
      const initializer = localInitializers.get(node.text);
      if (!initializer || seen.has(node.text)) return node.text;
      const nextSeen = new Set(seen).add(node.text);
      return `${node.text} ${expandLocalAliases(initializer, nextSeen)}`;
    }
    if (ts.isArrayLiteralExpression(node)) {
      return node.elements.map((entry) => expandLocalAliases(entry, seen)).join(" ");
    }
    if (ts.isCallExpression(node)) {
      return `${node.expression.getText(sourceFile)} ${node.arguments.map((argument) => expandLocalAliases(argument, seen)).join(" ")}`;
    }
    return node.getText(sourceFile);
  }

  function resolveLocalExpression(node, seen = new Set()) {
    if (!node) return node;
    if (ts.isIdentifier(node)) {
      if (seen.has(node.text)) return node;
      const initializer = localInitializers.get(node.text);
      return initializer ? resolveLocalExpression(initializer, new Set(seen).add(node.text)) : node;
    }
    if (ts.isPropertyAccessExpression(node)) {
      const owner = resolveLocalExpression(node.expression, seen);
      const property = propertyValue(owner, node.name.text);
      return property ? resolveLocalExpression(property, seen) : node;
    }
    return node;
  }

  for (const statement of sourceFile.statements) {
    if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) continue;
    const clause = statement.importClause;
    if (!clause) continue;
    const importedFile = resolveImportedFile(sourcePath, statement.moduleSpecifier.text);
    if (!importedFile) continue;
    if (clause.name) imports.set(clause.name.text, importedFile);
    if (clause.namedBindings && ts.isNamedImports(clause.namedBindings)) {
      for (const binding of clause.namedBindings.elements) imports.set(binding.name.text, importedFile);
    }
  }

  function addEndpoint(node, method, declaredPath, options) {
    const pathValue = routePath(prefix, declaredPath);
    const routeText = node.getText(sourceFile);
    const resolvedOptions = resolveLocalExpression(options);
    const optionsText = resolvedOptions?.getText(sourceFile) ?? "";
    const preHandler = resolveLocalExpression(propertyValue(resolvedOptions, "preHandler"));
    const preHandlerText = preHandler
      ? `${preHandler.getText(sourceFile)} ${expandLocalAliases(preHandler)}`
      : "";
    const access = classifyAccess(routeText, sourcePath, preHandlerText);
    const schema = schemaFields(resolvedOptions, sourceFile);
    const limit = rateLimitCategory(pathValue, optionsText);
    const code = routeText;
    const flags = [...new Set([...code.matchAll(/\bFEATURE_[A-Z0-9_]+\b/g)].map((match) => match[0]))];
    const currentModule = moduleName(sourcePath);
    const moduleRoot = path.join(apiRoot, "modules", currentModule);
    const sourceBase = path.basename(sourcePath, path.extname(sourcePath));
    const routeInTest = testPathPattern(pathValue);
    const matchingTests = testFiles.filter((testFile) => {
      if (currentModule === "core" || !testFile.path.startsWith(`${moduleRoot}${path.sep}`)) return false;
      const testText = testFile.contents;
      return routeInTest.test(testText) || testText.includes(sourceBase);
    });
    const directlyCovered = matchingTests.some((testFile) =>
      routeInTest.test(testFile.contents)
      && /\b(?:server|app)\.inject\s*\(/.test(testFile.contents),
    );
    const line = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;

    endpoints.push({
      method: method.toUpperCase(),
      path: pathValue,
      module: currentModule,
      sourceFile: path.relative(backendRoot, sourcePath).replaceAll(path.sep, "/"),
      line,
      access: access.access,
      requiredRole: access.requiredRole,
      requestSchema: schema.request,
      handlerValidation: /(?:\.parse|\.safeParse)\s*\(\s*request\.(?:body|params|query)|request\.(?:body|params|query)\s*as\s+/i.test(sourceText)
        ? "PRESENT_IN_HANDLER_SOURCE_NOT_LINKED_TO_THIS_ROUTE"
        : "NOT_DETECTED",
      responseSchema: schema.response,
      rateLimit: { ...limit, globalFailBehavior: "FAIL_CLOSED" },
      ownershipRequirement: ownershipRequirement(pathValue, routeText),
      featureFlags: flags.length ? flags : "NOT_DETECTED_IN_ROUTE_DECLARATION",
      sensitiveData: sensitiveData(pathValue, currentModule),
      testCoverageStatus: declaredPath === null ? "BLOCKED" : directlyCovered ? "TESTED" : matchingTests.length ? "PARTIAL" : "NOT_TESTED",
      coverageEvidence: directlyCovered ? "Route path literal is asserted through Fastify inject in a related test file."
        : matchingTests.length ? "Related module tests exist, but no direct request test for this route was detected."
          : "No related module test file was detected.",
      testFiles: matchingTests.map((testFile) => path.relative(backendRoot, testFile.path).replaceAll(path.sep, "/")),
    });
  }

  function visit(node) {
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
      const method = node.expression.name.text.toLowerCase();
      const receiver = node.expression.expression;
      const receiverName = ts.isIdentifier(receiver) ? receiver.text : "";
      if (["server", "app", "fastify"].includes(receiverName) && routeMethods.has(method)) {
        if (method === "route") {
          const routeDefinition = node.arguments[0];
          if (routeDefinition && ts.isObjectLiteralExpression(routeDefinition)) {
            const url = propertyValue(routeDefinition, "url");
            const methods = propertyValue(routeDefinition, "method");
            const methodValue = stringValue(methods);
            const pathValue = stringValue(url);
            if (methodValue) addEndpoint(node, methodValue, pathValue, routeDefinition);
            else if (methods && ts.isArrayLiteralExpression(methods)) {
              for (const entry of methods.elements) {
                const value = stringValue(entry);
                if (value) addEndpoint(node, value, pathValue, routeDefinition);
              }
            }
          }
        } else {
          const declaredPath = stringValue(node.arguments[0]);
          const options = node.arguments.length > 2 ? node.arguments[1] : undefined;
          addEndpoint(node, method, declaredPath, options);
        }
      }

      if (["server", "app", "fastify"].includes(receiverName)
          && method === "register"
          && node.arguments[0]
          && ts.isIdentifier(node.arguments[0])) {
        const importedFile = imports.get(node.arguments[0].text);
        if (importedFile) {
          const options = node.arguments[1];
          const nestedPrefix = stringValue(propertyValue(options, "prefix"));
          children.push(emitRoutes(importedFile, routePrefix(`${prefix}${routePrefix(nestedPrefix)}`), nextActive));
        }
      }
    }
    ts.forEachChild(node, visit);
  }
  const children = [];
  visit(sourceFile);
  await Promise.all(children);
}

const testsRoot = path.join(apiRoot, "modules");
for (const testPath of await collectFiles(testsRoot, (filePath) => /\.test\.tsx?$/.test(filePath))) {
  testFiles.push({ path: testPath, contents: await readFile(testPath, "utf8") });
}

await emitRoutes(path.join(apiRoot, "server.ts"), "");
endpoints.sort((left, right) =>
  left.path.localeCompare(right.path) || left.method.localeCompare(right.method) || left.sourceFile.localeCompare(right.sourceFile),
);

const document = {
  version: 1,
  source: "AVERON_backend/apps/api/src",
  extraction: "TypeScript AST of Fastify route declarations and explicit plugin prefixes; verify dynamic/plugin-specific behavior against runtime registration.",
  endpointCount: endpoints.length,
  endpoints,
};
const outputPath = path.join(root, "docs/api-endpoint-registry.json");
await mkdir(path.dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(document, null, 2)}\n`);
console.log(`Generated ${endpoints.length} endpoint records at ${path.relative(root, outputPath)}.`);
