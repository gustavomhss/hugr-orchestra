import { groups, type Failure, type Finding, type Report, type Rule, type Severity } from "./contract"

export type Verdict = {
  kind: "clean" | "warnings" | "blocked" | "empty" | "no-repository" | "no-base" | "unchecked"
  gates: number
  warnings: number
  failure?: { kind: Failure; message: string }
}

export type Keyed = Finding & { key: string }

export type RuleFilter = {
  query: string
  severity: Severity | "all"
  kind: Rule["kind"] | "all"
  group: Rule["group"] | "all"
}

// The screen must never be more optimistic than the engine: a run with setup errors, no resolved base or no rules
// proves nothing, so none of them may read as clean (brief §5, hard rule).
export function verdict(report: Report): Verdict {
  const gates = report.findings.filter((finding) => finding.severity === "gate").length
  const counts = { gates, warnings: report.findings.length - gates }
  const failure = report.errors[0]
  if (report.errors.some((error) => error.kind === "no-repository")) return { kind: "no-repository", ...counts, failure }
  if (report.errors.some((error) => error.kind === "base-not-found") || (!failure && report.base === null))
    return { kind: "no-base", ...counts, failure }
  if (failure) return { kind: "unchecked", ...counts, failure }
  if (report.rules === 0) return { kind: "unchecked", ...counts, failure: { kind: "no-rules", message: "" } }
  if (report.files === 0) return { kind: "empty", ...counts }
  if (gates) return { kind: "blocked", ...counts }
  if (report.findings.length) return { kind: "warnings", ...counts }
  return { kind: "clean", ...counts }
}

// Files with a blocking finding come first, then by path; inside a file, gates first, then file-level findings
// (no line), then by line.
export function groupFindings(findings: readonly Finding[]) {
  const files = findings
    .map((finding, index): Keyed => ({ ...finding, key: `${index}` }))
    .reduce((all, finding) => all.set(finding.path, [...(all.get(finding.path) ?? []), finding]), new Map<string, Keyed[]>())
  return [...files]
    .map(([path, items]) => ({
      path,
      gate: items.some((finding) => finding.severity === "gate"),
      items: items.toSorted(
        (a, b) =>
          rank(a.severity) - rank(b.severity) ||
          (a.line ?? 0) - (b.line ?? 0) ||
          a.rule.localeCompare(b.rule),
      ),
    }))
    .toSorted((a, b) => Number(b.gate) - Number(a.gate) || a.path.localeCompare(b.path))
}

export function exceptions(report: Report) {
  return {
    ignores: report.findings.filter((finding) => finding.rule === "guardrail-ignore-added"),
    approved: report.approved,
    touchesGuards: report.touchesGuards,
  }
}

export function filterRules(rules: readonly Rule[], filter: RuleFilter) {
  const query = filter.query.trim().toLowerCase()
  return rules.filter(
    (rule) =>
      (filter.severity === "all" || rule.severity === filter.severity) &&
      (filter.kind === "all" || rule.kind === filter.kind) &&
      (filter.group === "all" || rule.group === filter.group) &&
      (!query || [rule.id, rule.message, rule.summary].some((text) => text.toLowerCase().includes(query))),
  )
}

// Groups in the brief's browsing order (§4); inside a group, gates first, then by id.
export function groupRules(rules: readonly Rule[]) {
  return groups
    .map((group) => ({
      category: group,
      items: rules
        .filter((rule) => rule.group === group)
        .toSorted((a, b) => rank(a.severity) - rank(b.severity) || a.id.localeCompare(b.id)),
    }))
    .filter((group) => group.items.length)
}

// Splits a path so the directory can ellipsize while the file name stays whole (middle truncation in CSS).
export function splitPath(path: string) {
  const cut = path.lastIndexOf("/") + 1
  return { dir: path.slice(0, cut), base: path.slice(cut) }
}

// The engine reports the match in UTF-16 units; clamp it so a stale or wrong range never throws or misplaces text.
export function excerptParts(finding: Pick<Finding, "excerpt" | "match">) {
  if (finding.excerpt === null) return
  const text = finding.excerpt
  if (!finding.match) return { before: text, match: "", after: "" }
  const start = Math.min(Math.max(finding.match[0], 0), text.length)
  const end = Math.min(Math.max(finding.match[1], start), text.length)
  return { before: text.slice(0, start), match: text.slice(start, end), after: text.slice(end) }
}

export function ignoreComment(rule: string, reason: string) {
  return `guardrail-ignore: ${rule} ${reason}`
}

export function approvalLabel(rule: string) {
  return `guardrail-approved:${rule}`
}

function rank(severity: Severity) {
  return severity === "gate" ? 0 : 1
}
