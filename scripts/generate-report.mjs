import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { normalizeSeverity } from "./report-severity.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const rawDirectory = path.join(root, "reports/raw");
const generatedDirectory = path.join(root, "reports/generated");
const historicalDebt = JSON.parse(await readFile(path.join(root, "baseline/task11-remediation.json"), "utf8"));
const staticBaseline = JSON.parse(await readFile(path.join(root, "baseline/static-findings.json"), "utf8"));
const expectedRepositories = ["AVERON_backend", "AVERON_frontend", "AVERON_admin_panel", "AVERON_parser"];
const expectedScanRepositories = [...expectedRepositories, "AVERON_security_tests"];
await mkdir(generatedDirectory, { recursive: true });

function scannerFor(filename) {
  const name = filename.toLowerCase();
  if (name.includes("semgrep")) return "Semgrep";
  if (name.includes("gitleaks")) return "Gitleaks";
  if (name.includes("trivy")) return "Trivy";
  return null;
}

function severityFromSarif(level, rule) {
  const score = Number(rule?.properties?.["security-severity"]);
  if (Number.isFinite(score)) {
    if (score >= 9) return "CRITICAL";
    if (score >= 7) return "HIGH";
    if (score >= 4) return "MEDIUM";
    return "LOW";
  }
  return ({ error: "HIGH", warning: "MEDIUM", note: "LOW" })[level] ?? "INFO";
}

function repositoryFor(filename, file) {
  const value = `${filename} ${file ?? ""}`;
  return [...expectedRepositories, "AVERON_security_tests"]
    .find((repository) => value.includes(repository)) ?? "AVERON_security_tests";
}

function fingerprint(finding) {
  return createHash("sha256")
    .update([
      finding.repository,
      finding.tool,
      finding.id,
      finding.location.file ?? "",
      finding.location.line ?? "",
    ].join("\n"))
    .digest("hex");
}

const baselineEntries = staticBaseline.approvedFindings ?? [];
const now = Date.now();
const validBaselineEntries = new Set();
const invalidBaselineEntries = baselineEntries.flatMap((entry, index) => {
  const createdAt = Date.parse(entry.createdAt);
  const reviewBy = Date.parse(entry.reviewBy);
  const valid =
    typeof entry.fingerprint === "string"
    && /^[a-f0-9]{64}$/i.test(entry.fingerprint)
    && typeof entry.reason === "string"
    && entry.reason.trim().length >= 12
    && typeof entry.scope === "string"
    && entry.scope.trim().length >= 8
    && !/^(all|global|\*)$/i.test(entry.scope.trim())
    && !entry.scope.includes("*")
    && Number.isFinite(createdAt)
    && Number.isFinite(reviewBy)
    && createdAt <= now
    && reviewBy > now
    && reviewBy > createdAt
    && reviewBy - createdAt <= 366 * 24 * 60 * 60 * 1000;
  if (valid) validBaselineEntries.add(entry);
  return valid ? [] : [`approvedFindings[${index}] is malformed, expired, or broadly scoped`];
});
const approved = new Map(
  (staticBaseline.established === true ? baselineEntries : [])
    .filter((entry) => validBaselineEntries.has(entry))
    .map((entry) => [entry.fingerprint, entry]),
);
const availableScans = [];
const findings = [];
try {
  for (const filename of await readdir(rawDirectory)) {
    if (!filename.endsWith(".json") && !filename.endsWith(".sarif")) continue;
    if (filename === "scan-scope.json" || filename === "tool-execution.json") continue;
    availableScans.push(filename);
    const content = JSON.parse(await readFile(path.join(rawDirectory, filename), "utf8"));
    const pushFinding = (candidate) => {
      const record = {
        schemaVersion: 1,
        id: candidate.id ?? "UNKNOWN",
        tool: candidate.tool ?? scannerFor(filename) ?? "UNKNOWN",
        severity: normalizeSeverity(candidate.severity),
        repository: candidate.repository ?? repositoryFor(filename, candidate.file),
        category: candidate.category ?? "SECURITY_HARDENING",
        location: {
          file: candidate.file ?? null,
          endpoint: candidate.endpoint ?? null,
          line: candidate.line ?? null,
        },
        description: candidate.description ?? "Security scanner finding.",
        evidenceSummary: candidate.evidenceSummary ?? "Evidence is recorded without request secrets or secret values.",
        classification: candidate.classification ?? "NOT_VERIFIED",
        recommendedRemediation: candidate.recommendedRemediation
          ?? "Review the affected code/dependency and apply a tested, minimal remediation.",
      };
      record.fingerprint = fingerprint(record);
      const baselineEntry = approved.get(record.fingerprint);
      record.status = baselineEntry && record.tool !== "Gitleaks" ? "BASELINE" : "NEW";
      findings.push(record);
    };

    if (filename.endsWith(".sarif")) {
      for (const run of content.runs ?? []) {
        const rules = new Map((run.tool?.driver?.rules ?? []).map((rule) => [rule.id, rule]));
        for (const result of run.results ?? []) {
          const location = result.locations?.[0]?.physicalLocation;
          const rule = rules.get(result.ruleId);
          pushFinding({
            tool: run.tool?.driver?.name ?? scannerFor(filename) ?? "SARIF",
            id: result.ruleId ?? "UNKNOWN",
            severity: severityFromSarif(result.level, rule),
            category: "DEPENDENCY_OR_CONFIGURATION_ADVISORY",
            classification: "ADVISORY",
            description: result.message?.text ?? rule?.shortDescription?.text ?? "SARIF scanner finding.",
            evidenceSummary: "Scanner metadata and location only; exploitability is not established.",
            file: location?.artifactLocation?.uri ?? null,
            line: location?.region?.startLine ?? null,
            recommendedRemediation: rule?.help?.text ?? "Review the advisory and update or harden the affected component.",
          });
        }
      }
    } else if (filename.endsWith("-semgrep.json") || filename === "semgrep.json") {
      for (const result of content.results ?? []) {
        pushFinding({
          tool: "Semgrep",
          id: result.check_id ?? "UNKNOWN",
          severity: result.extra?.severity,
          category: "STATIC_ANALYSIS",
          classification: "NOT_VERIFIED",
          description: result.extra?.message ?? "Static analysis finding.",
          evidenceSummary: "Rule match and source location; exploitability requires review.",
          file: result.path ?? null,
          line: result.start?.line ?? null,
          recommendedRemediation: "Review the code path and fix only when the rule match is actionable.",
        });
      }
    } else if (filename.includes("-gitleaks-") || filename.endsWith("-gitleaks.json")) {
      for (const result of Array.isArray(content) ? content : []) {
        pushFinding({
          tool: "Gitleaks",
          id: result.RuleID ?? "SECRET_CANDIDATE",
          severity: "CRITICAL",
          category: "SECRET_DETECTION",
          classification: "NOT_VERIFIED",
          description: "Potential secret detected; value redacted.",
          evidenceSummary: "Secret value intentionally omitted; investigate the file/history location privately.",
          file: result.File ?? null,
          line: result.StartLine ?? null,
          recommendedRemediation: "Verify privately, revoke/rotate any real credential, and remove it from source history.",
        });
      }
    } else if (filename.endsWith("-trivy.json")) {
      for (const result of content.Results ?? []) {
        for (const item of result.Vulnerabilities ?? []) {
          pushFinding({
            tool: "Trivy",
            id: item.VulnerabilityID ?? "VULNERABILITY",
            severity: item.Severity,
            category: "DEPENDENCY_ADVISORY",
            classification: "ADVISORY",
            description: `${item.PkgName ?? "package"} ${item.InstalledVersion ?? ""}`.trim(),
            evidenceSummary: "Dependency advisory match; package reachability and application exploitability are not established.",
            file: result.Target ?? null,
            recommendedRemediation: item.FixedVersion
              ? `Review compatibility and upgrade to ${item.FixedVersion} or a later patched version.`
              : "Review the affected dependency and apply a compatible mitigation or upgrade when available.",
          });
        }
        for (const item of result.Misconfigurations ?? []) {
          pushFinding({
            tool: "Trivy",
            id: item.ID ?? "MISCONFIGURATION",
            severity: item.Severity,
            category: "MISCONFIGURATION",
            classification: "NOT_VERIFIED",
            description: item.Title ?? "Configuration finding.",
            evidenceSummary: "Configuration rule match; production exposure is not established.",
            file: result.Target ?? null,
            recommendedRemediation: item.Resolution ?? "Review and remediate the affected configuration.",
          });
        }
        for (const item of result.Secrets ?? []) {
          pushFinding({
            tool: "Trivy",
            id: item.RuleID ?? "SECRET_CANDIDATE",
            severity: "CRITICAL",
            category: "SECRET_DETECTION",
            classification: "NOT_VERIFIED",
            description: "Potential secret detected; value redacted.",
            evidenceSummary: "Secret value intentionally omitted; investigate the file privately.",
            file: result.Target ?? null,
            line: item.StartLine ?? null,
            recommendedRemediation: "Verify privately, revoke/rotate any real credential, and remove it from source.",
          });
        }
      }
    }
  }
} catch (error) {
  if (error?.code !== "ENOENT") throw error;
}

const scopePath = path.join(rawDirectory, "scan-scope.json");
let scanScope = null;
try {
  scanScope = JSON.parse(await readFile(scopePath, "utf8"));
} catch (error) {
  if (error?.code !== "ENOENT") throw error;
}
let scanExecution = null;
try {
  scanExecution = JSON.parse(await readFile(path.join(rawDirectory, "tool-execution.json"), "utf8"));
} catch (error) {
  if (error?.code !== "ENOENT") throw error;
}
const requiredScans = [
  ...expectedRepositories.flatMap((repository) => [
    { scanner: "Semgrep", repository },
    { scanner: "Trivy", repository },
  ]),
  ...expectedScanRepositories.flatMap((repository) => [
    { scanner: "Gitleaks current files", repository },
    { scanner: "Gitleaks Git history", repository },
  ]),
];
const executionFor = (scanner, repository) =>
  scanExecution?.scans?.find((entry) => entry.scanner === scanner && entry.repository === repository);
const fileFor = (scanner, repository) => {
  if (scanner === "Semgrep") return `${repository}-semgrep.json`;
  if (scanner === "Trivy") return `${repository}-trivy.sarif`;
  const suffix = scanner === "Gitleaks current files" ? "current" : "history";
  return `${repository}-gitleaks-${suffix}.json`;
};
const staticMissing = requiredScans.flatMap(({ scanner, repository }) => {
  const execution = executionFor(scanner, repository);
  const output = fileFor(scanner, repository);
  const collected = availableScans.includes(output);
  const inDeclaredScope = scanScope?.scans?.[scanner]?.includes(repository);
  return execution?.outcome === "success" && collected && inDeclaredScope
    ? []
    : [`${scanner} (${repository})`];
});
const scopeComplete = requiredScans.every(({ scanner, repository }) =>
  scanScope?.scans?.[scanner]?.includes(repository),
);
const report = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  profile: process.env.SECURITY_ENV ?? "NOT_CONFIGURED",
  sarifPublication: {
    status: process.env.SARIF_PUBLICATION_STATUS ?? "NOT_RUN",
  },
  status: staticMissing.length || !scopeComplete ? "NOT_VERIFIED" : "STATIC_COMPLETE_DYNAMIC_NOT_RUN",
  baseline: {
    established: staticBaseline.established === true,
    approvedFingerprintCount: approved.size,
    unbaselinedFindingsAreNew: staticBaseline.established !== true,
    invalidEntries: invalidBaselineEntries,
  },
  findings,
  historicalDebt,
  scans: {
    static: {
      available: availableScans,
      missing: staticMissing,
      expectedRepositories,
      expectedScanRepositories,
      scopeComplete: Boolean(scopeComplete),
    },
    dynamic: {
      notRun: ["OWASP ZAP", "Schemathesis"],
      stagingRequired: true,
    },
  },
  policyEvaluation: {
    failForNewSeverities: ["CRITICAL", "HIGH"],
    failForSecretCandidates: true,
    blockingFindingCount: findings.filter((finding) =>
      finding.status !== "BASELINE"
      && (finding.category === "SECRET_DETECTION" || ["CRITICAL", "HIGH"].includes(finding.severity)),
    ).length,
  },
};

const markdown = [
  "# AVERON Security Report",
  "",
  `Generated: ${report.generatedAt}`,
  `Profile: ${report.profile}`,
  `Static status: ${report.status}`,
  `SARIF publication: ${report.sarifPublication.status}`,
  `Reviewed static baseline established: ${report.baseline.established}`,
  "",
  "## Scan coverage",
  "",
  ...report.scans.static.available.map((scan) => `- Collected: \`${scan}\``),
  ...report.scans.static.missing.map((scan) => `- NOT VERIFIED: ${scan}`),
  ...report.scans.dynamic.notRun.map((scan) => `- NOT VERIFIED (staging-only): ${scan}`),
  "",
  "## Findings",
  "",
  ...(findings.length
    ? findings.map((finding) =>
      `- **${finding.severity} / ${finding.status} / ${finding.classification}** ${finding.tool} \`${finding.id}\` `
      + `(${finding.repository}) — ${finding.description}${finding.location.file ? ` (${finding.location.file}${finding.location.line ? `:${finding.location.line}` : ""})` : ""}`,
    )
    : ["No findings are available from completed scanners. This is not evidence that unrun scanners found nothing."]),
  "",
  "## Task #11 dependency-advisory history",
  "",
  "| Repository | Historical Critical | Historical High | Historical Moderate | Historical Low | Current production audit |",
  "|---|---:|---:|---:|---:|---|",
  ...Object.entries(historicalDebt.repositories).map(([repository, entry]) =>
    `| ${repository} | ${entry.counts.critical} | ${entry.counts.high} | ${entry.counts.moderate} | ${entry.counts.low} | ${entry.currentAudit?.status ?? "NOT VERIFIED"} |`,
  ),
  "",
  "Historical advisory counts describe affected dependency versions, not confirmed exploitable application paths.",
  `Dynamic scans not run: ${report.scans.dynamic.notRun.join(", ")}. Static scanner completeness does not imply a security certification.`,
  "Existing reviewed findings remain visible; only explicitly fingerprinted non-secret findings with documented scope and expiry may be baselined.",
  "Secret candidates are never baselined.",
  "",
].join("\n");

await writeFile(path.join(generatedDirectory, "security-report.json"), `${JSON.stringify(report, null, 2)}\n`);
await writeFile(path.join(generatedDirectory, "security-report.md"), markdown);
console.log(`Wrote normalized JSON and Markdown reports (static status: ${report.status}).`);
