export type JanitorSeverity = "ok" | "attention" | "urgent"

export interface JanitorFinding {
  readonly kind: string
  readonly severity: JanitorSeverity
  readonly summary: string
  readonly evidence: string
  readonly suggestion: string
}

export interface JanitorReport {
  readonly createdAt: string
  readonly findings: JanitorFinding[]
}

export function usefulJanitorReport(report: JanitorReport): JanitorReport | null {
  const findings = report.findings.filter((finding) => finding.severity !== "ok" && finding.kind !== "scanner")
  return findings.length === 0 ? null : { ...report, findings }
}

const Severities: ReadonlySet<string> = new Set(["ok", "attention", "urgent"])
const MaxFindings = 256
const MaxKindLength = 128
const MaxSummaryLength = 2_048
const MaxEvidenceLength = 16_384
const MaxSuggestionLength = 4_096

function isRecord(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object") return false
  return !Array.isArray(value)
}

function isFinding(value: unknown): value is JanitorFinding {
  if (!isRecord(value)) return false
  if (typeof value.kind !== "string" || value.kind.length === 0 || value.kind.length > MaxKindLength) return false
  if (typeof value.severity !== "string" || !Severities.has(value.severity)) return false
  if (typeof value.summary !== "string" || value.summary.length > MaxSummaryLength) return false
  if (typeof value.evidence !== "string" || value.evidence.length > MaxEvidenceLength) return false
  return typeof value.suggestion === "string" && value.suggestion.length <= MaxSuggestionLength
}

function fromValue(value: unknown): JanitorReport | null {
  if (!isRecord(value)) return null
  if (!Array.isArray(value.findings)) return null
  if (value.findings.length > MaxFindings || !value.findings.every(isFinding)) return null
  return {
    createdAt: typeof value.createdAt === "string" ? value.createdAt : "",
    findings: value.findings,
  }
}

export function parseJanitorReport(value: unknown): JanitorReport | null {
  if (typeof value === "string") {
    try {
      return fromValue(JSON.parse(value))
    } catch {
      return null
    }
  }
  return fromValue(value)
}
