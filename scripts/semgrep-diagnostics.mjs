export function formatSemgrepErrors(report) {
  if (!Array.isArray(report?.errors)) return [];
  return report.errors.map((error) =>
    `Semgrep ${error.level ?? "error"} (code ${error.code ?? "unknown"}): ${error.message ?? "Unspecified scanner error."}`,
  );
}
