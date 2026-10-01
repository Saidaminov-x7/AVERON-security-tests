import { readFile } from "node:fs/promises";
import { isIP } from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const validEnvironments = new Set(["local", "staging", "production-safe"]);

function isLoopbackHost(hostname) {
  const normalized = hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (normalized === "localhost") return true;
  if (isIP(normalized) === 4) return normalized.startsWith("127.");
  return isIP(normalized) === 6 && normalized === "::1";
}

export async function loadSecurityPolicy() {
  return JSON.parse(await readFile(path.join(root, "config/security-policy.json"), "utf8"));
}

function parseOrigins(value) {
  return (value ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const url = new URL(entry);
      if (url.username || url.password || url.pathname !== "/" || url.search || url.hash) {
        throw new Error("Target allowlist entries must be bare origins.");
      }
      return url.origin;
    });
}

export function validateSecurityProfile(env = process.env) {
  const profile = env.SECURITY_ENV;
  if (!validEnvironments.has(profile)) {
    throw new Error("SECURITY_ENV must be local, staging, or production-safe.");
  }
  return profile;
}

export async function validateTarget(target, env = process.env) {
  const profileName = validateSecurityProfile(env);
  let targetUrl;
  try {
    targetUrl = new URL(target);
  } catch {
    throw new Error("SECURITY_TARGET_URL must be a valid absolute URL.");
  }
  if (targetUrl.username || targetUrl.password || targetUrl.search || targetUrl.hash) {
    throw new Error("Security targets must not include credentials, query strings, or fragments.");
  }
  if (!["http:", "https:"].includes(targetUrl.protocol)) {
    throw new Error("Security target must use HTTP or HTTPS.");
  }

  const policy = await loadSecurityPolicy();
  const profilePolicy = policy.profiles[profileName];
  if (profilePolicy.requiresHttps && targetUrl.protocol !== "https:") {
    throw new Error(`${profileName} targets must use HTTPS.`);
  }
  if (profileName === "local" && !isLoopbackHost(targetUrl.hostname)) {
    throw new Error("Local targets must use a loopback IP address or localhost.");
  }
  if (profileName !== "local") {
    const allowlist = parseOrigins(env[profilePolicy.targetOriginAllowlistVariable]);
    if (!allowlist.includes(targetUrl.origin)) {
      throw new Error(`${profileName} target origin is not explicitly allowlisted.`);
    }
  }
  return { profile: profileName, targetUrl, policy, profilePolicy };
}

export async function requireAggressivePermission(env = process.env) {
  const profile = validateSecurityProfile(env);
  const policy = await loadSecurityPolicy();
  if (!policy.profiles[profile].aggressiveAllowed || profile === "production-safe") {
    throw new Error("Aggressive security tests are forbidden in production-safe mode.");
  }
  if (env.ALLOW_AGGRESSIVE_SECURITY_TESTS !== "true") {
    throw new Error("Set ALLOW_AGGRESSIVE_SECURITY_TESTS=true to explicitly enable an aggressive suite.");
  }
  return profile;
}

export function requireTarget(env = process.env) {
  if (!env.SECURITY_TARGET_URL) {
    throw new Error("SECURITY_TARGET_URL is required; no target will be inferred.");
  }
  return env.SECURITY_TARGET_URL;
}
