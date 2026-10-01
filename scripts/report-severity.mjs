const supportedSeverities = ["CRITICAL", "HIGH", "MEDIUM", "LOW", "INFO"];

export function normalizeSeverity(value) {
  const normalized = String(value ?? "INFO").toUpperCase();
  if (normalized === "ERROR") return "HIGH";
  if (normalized === "WARNING") return "MEDIUM";
  if (normalized === "UNKNOWN" || normalized === "UNDEFINED") return "INFO";
  return supportedSeverities.includes(normalized) ? normalized : "INFO";
}
