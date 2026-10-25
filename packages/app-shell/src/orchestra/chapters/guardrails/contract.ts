// The Guardrails data contract (docs/guardrail/frontend-brief.md §5). The Guardrail side produces these shapes;
// the screen only presents them and never re-implements a rule's matching.
export type Severity = "gate" | "warn"

export const groups = ["tests", "silenced", "secrets", "leftovers", "dependencies", "workflows", "hygiene"] as const
export const kinds = ["added-lines", "changed-paths", "line-balance"] as const

export type Rule = {
  id: string
  group: (typeof groups)[number]
  severity: Severity
  kind: (typeof kinds)[number]
  message: string
  // Null until the rule file carries a plain-language summary; the screen falls back to message.
  summary: string | null
  positive: readonly string[]
  negative: readonly string[]
  paths: readonly string[]
  clearedBy: "fix" | "ignore" | "approval"
}

export type Finding = {
  rule: string
  severity: Severity
  path: string
  line: number | null
  message: string
  excerpt: string | null
  // [start, end) of the match inside excerpt, in UTF-16 units.
  match: readonly [number, number] | null
}

export type Failure = "no-repository" | "base-not-found" | "no-rules" | "rules-invalid" | "other"

export type Report = {
  base: string | null
  bootstrap: boolean
  rules: number
  files: number
  findings: readonly Finding[]
  errors: readonly { kind: Failure; message: string }[]
  approved: readonly string[]
  touchesGuards: boolean
}
