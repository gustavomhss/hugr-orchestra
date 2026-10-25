// Pure evaluation: rules and a diff in, findings out. No git, no disk.

import type { Diff } from "./diff"
import { globs, inScope, lineHits, type Rule } from "./rule"

export type Config = {
  // Generated or vendored paths that added-lines rules skip unless the rule sets generated = "include".
  generated: string[]
  // Paths no added-lines rule reads (the engine's own samples).
  exclude: string[]
  // Named glob lists a rule refers to as `$name` (see expandSets in rule.ts).
  sets: Record<string, string[]>
}

export type Finding = {
  rule: string
  severity: "gate" | "warn"
  path: string
  line: number | undefined
  message: string
  // added-lines only: the offending added line and where `match` hit in it, [start, end) in UTF-16 units, so a
  // viewer can underline the hit without running the regex again.
  excerpt?: string
  match?: [number, number]
}

// `guardrail-ignore: <rule id> <reason>` on the offending line. Without a reason it does not count.
const IGNORE = /guardrail-ignore:\s*(\S+)\s+\S/

export function evaluate(input: { rules: Rule[]; config: Config; diff: Diff; approved: string[] }) {
  return input.rules.flatMap((rule) => {
    // The label `guardrail-approved:<rule id>` clears a rule of any kind: a JSON line cannot carry an ignore comment.
    if (input.approved.includes(rule.id)) return []
    if (rule.on === "changed-paths") return pathFindings(rule, input)
    if (rule.on === "line-balance") return balanceFindings(rule, input)
    return lineFindings(rule, input)
  })
}

function pathFindings(rule: Rule, input: Parameters<typeof evaluate>[0]): Finding[] {
  if (input.diff.changes.some((change) => globs(rule.requiresChanged, change.path))) return []
  return input.diff.changes
    .filter((change) => rule.statuses.length === 0 || rule.statuses.includes(change.status))
    .filter((change) => inScope(rule, change.path) || (change.from !== undefined && inScope(rule, change.from)))
    .filter((change) => !rule.leavesScope || change.status === "D" || (change.from !== undefined && !inScope(rule, change.path)))
    .filter((change) => rule.modes.length === 0 || rule.modes.includes(change.mode ?? "100644"))
    .filter((change) => rule.minBytes === undefined || (change.size ?? 0) >= rule.minBytes)
    .filter((change) => rule.binary === undefined || (change.binary ?? false) === rule.binary)
    .filter((change) => !rule.noShebang || !(change.shebang ?? false))
    .filter((change) => !rule.touches || [...change.added.map((added) => added.text), ...(change.removedLines ?? [])].some((text) => rule.touches?.test(text)))
    .map((change) => ({
      rule: rule.id,
      severity: rule.severity,
      path: change.path,
      line: undefined,
      message: rule.message,
    }))
}

function lineFindings(rule: Rule, input: Parameters<typeof evaluate>[0]): Finding[] {
  // Each removed line excuses one identical added line for this rule, so deleting one `// @ts-ignore` does not let
  // a new one through for free.
  const moved = new Map(input.diff.removed)
  const excused = (text: string) => {
    const left = moved.get(text.trim()) ?? 0
    if (left > 0) moved.set(text.trim(), left - 1)
    return left > 0
  }
  return input.diff.changes
    .filter((change) => inScope(rule, change.path) && !globs(input.config.exclude, change.path))
    .filter((change) => rule.generated === "include" || !globs(input.config.generated, change.path))
    .flatMap((change) =>
      change.added
        .filter((added) => lineHits(rule, added.text))
        .filter((added) => IGNORE.exec(added.text)?.[1] !== rule.id)
        .filter((added) => !excused(added.text))
        .filter((added) => !rule.newOnly || !renamedOnly(rule, added.text, change.removedLines ?? []))
        .map((added) => ({
          rule: rule.id,
          severity: rule.severity,
          path: change.path,
          line: added.line,
          message: rule.message,
          excerpt: added.text,
          match: hitRange(rule, added.text),
        })),
    )
}

// Lines a file loses minus lines it gains, counting only lines the rule matches. A removed line that reappears
// anywhere else in the change was moved, not removed. Deleted files are the business of path rules.
function balanceFindings(rule: Rule, input: Parameters<typeof evaluate>[0]): Finding[] {
  const gained = new Set(input.diff.changes.flatMap((change) => change.added.map((added) => added.text.trim())))
  return input.diff.changes
    .filter((change) => change.status !== "D" && inScope(rule, change.path) && !globs(input.config.exclude, change.path))
    .filter((change) => rule.generated === "include" || !globs(input.config.generated, change.path))
    .filter((change) => {
      const lost = (change.removedLines ?? []).filter((text) => lineHits(rule, text) && !gained.has(text)).length
      const added = change.added.filter((line) => lineHits(rule, line.text)).length
      return lost - added >= (rule.minNetRemoved ?? 1)
    })
    .map((change) => ({ rule: rule.id, severity: rule.severity, path: change.path, line: undefined, message: rule.message }))
}

function hitRange(rule: Rule, text: string): [number, number] | undefined {
  const hit = rule.match?.exec(text)
  return hit ? [hit.index, hit.index + hit[0].length] : undefined
}

// A version bump removes the line that names the same dependency. Only meaningful with new_only.
function renamedOnly(rule: Rule, text: string, removed: string[]) {
  const name = rule.match?.exec(text)?.[1]
  return name !== undefined && removed.some((line) => rule.match?.exec(line)?.[1] === name)
}
