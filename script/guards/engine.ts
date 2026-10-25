// Pure evaluation: rules and a diff in, findings out. No git, no disk.

import type { Diff } from "./diff"
import { globs, inScope, lineHits, type Rule } from "./rule"

export type Config = {
  // Generated or vendored paths that added-lines rules skip unless the rule sets generated = "include".
  generated: string[]
  // Paths no added-lines rule reads (the engine's own samples).
  exclude: string[]
}

export type Finding = {
  rule: string
  severity: "gate" | "warn"
  path: string
  line: number | undefined
  message: string
}

// `guardrail-ignore: <rule id> <reason>` on the offending line. Without a reason it does not count.
const IGNORE = /guardrail-ignore:\s*(\S+)\s+\S/

export function evaluate(input: { rules: Rule[]; config: Config; diff: Diff; approved: string[] }) {
  return input.rules.flatMap((rule) =>
    rule.on === "changed-paths" ? pathFindings(rule, input) : lineFindings(rule, input),
  )
}

function pathFindings(rule: Rule, input: Parameters<typeof evaluate>[0]): Finding[] {
  if (input.approved.includes(rule.id)) return []
  return input.diff.changes
    .filter((change) => rule.statuses.length === 0 || rule.statuses.includes(change.status))
    .filter((change) => inScope(rule, change.path) || (change.from !== undefined && inScope(rule, change.from)))
    .map((change) => ({
      rule: rule.id,
      severity: rule.severity,
      path: change.path,
      line: undefined,
      message: rule.message,
    }))
}

function lineFindings(rule: Rule, input: Parameters<typeof evaluate>[0]): Finding[] {
  return input.diff.changes
    .filter((change) => inScope(rule, change.path) && !globs(input.config.exclude, change.path))
    .filter((change) => rule.generated === "include" || !globs(input.config.generated, change.path))
    .flatMap((change) =>
      change.added
        .filter((added) => lineHits(rule, added.text))
        .filter((added) => !input.diff.removed.has(added.text.trim()))
        .filter((added) => IGNORE.exec(added.text)?.[1] !== rule.id)
        .map((added) => ({
          rule: rule.id,
          severity: rule.severity,
          path: change.path,
          line: added.line,
          message: rule.message,
        })),
    )
}
