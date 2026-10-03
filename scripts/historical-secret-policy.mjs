import { createHash } from "node:crypto";

const repositories = new Set([
  "AVERON_backend",
  "AVERON_frontend",
  "AVERON_admin_panel",
  "AVERON_parser",
  "AVERON_security_tests",
]);

const classifications = new Set([
  "TEST_FIXTURE",
  "PUBLIC_CLIENT_CONFIGURATION",
  "REMEDIATED_HISTORICAL",
  "ROTATED_CREDENTIAL",
  "FALSE_POSITIVE_WITH_EVIDENCE",
]);

const requiredKeys = [
  "scanner",
  "rule",
  "repository",
  "path",
  "commit",
  "fingerprint",
  "classification",
  "evidenceRef",
  "reviewedBy",
  "reviewedAt",
  "reviewBy",
];
const sortedRequiredKeys = [...requiredKeys].sort();

export function historicalSecretFingerprint(context) {
  if (
    context?.scanner !== "Gitleaks"
    || typeof context.rule !== "string"
    || typeof context.repository !== "string"
    || typeof context.path !== "string"
    || typeof context.commit !== "string"
    || typeof context.fingerprint !== "string"
  ) {
    return null;
  }

  return createHash("sha256")
    .update([
      context.scanner,
      context.rule,
      context.repository,
      context.path,
      context.commit,
      context.fingerprint,
    ].join("\n"))
    .digest("hex");
}

function validPath(value) {
  return typeof value === "string"
    && value.length > 0
    && value.length <= 512
    && !value.startsWith("/")
    && !value.includes("\\")
    && !value.split("/").includes("..")
    && !/[*?\[\]]/.test(value)
    && !/[\u0000-\u001f]/.test(value);
}

function validReviewWindow(entry, now) {
  const reviewedAt = Date.parse(entry.reviewedAt);
  const reviewBy = Date.parse(entry.reviewBy);
  return Number.isFinite(reviewedAt)
    && Number.isFinite(reviewBy)
    && reviewedAt <= now
    && reviewBy > now
    && reviewBy > reviewedAt
    && reviewBy - reviewedAt <= 366 * 24 * 60 * 60 * 1000;
}

function validApproval(entry, now) {
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) return false;
  const keys = Object.keys(entry).sort();
  if (keys.length !== requiredKeys.length || keys.some((key, index) => key !== sortedRequiredKeys[index])) {
    return false;
  }

  return entry.scanner === "Gitleaks"
    && typeof entry.rule === "string"
    && /^[A-Za-z0-9_.-]{1,100}$/.test(entry.rule)
    && repositories.has(entry.repository)
    && validPath(entry.path)
    && /^[a-f0-9]{40}$/i.test(entry.commit)
    && typeof entry.fingerprint === "string"
    && /^[A-Za-z0-9_./:-]{1,512}$/.test(entry.fingerprint)
    && classifications.has(entry.classification)
    && typeof entry.evidenceRef === "string"
    && /^(?:SEC|ISSUE|PR)-[A-Za-z0-9-]{3,64}$/.test(entry.evidenceRef)
    && typeof entry.reviewedBy === "string"
    && /^[A-Za-z0-9][A-Za-z0-9._-]{1,38}$/.test(entry.reviewedBy)
    && validReviewWindow(entry, now);
}

export function validateHistoricalSecretApprovals(entries, now = Date.now()) {
  const approvals = new Map();
  const invalidEntries = [];
  if (!Array.isArray(entries)) {
    return { approvals, invalidEntries: ["approvedHistoricalSecrets must be an array"] };
  }

  entries.forEach((entry, index) => {
    if (!validApproval(entry, now)) {
      invalidEntries.push(`approvedHistoricalSecrets[${index}] is malformed, expired, or not exact-context metadata`);
      return;
    }
    const key = historicalSecretFingerprint(entry);
    if (approvals.has(key)) {
      invalidEntries.push(`approvedHistoricalSecrets[${index}] duplicates an existing exact fingerprint`);
      return;
    }
    approvals.set(key, entry);
  });

  return { approvals, invalidEntries };
}
