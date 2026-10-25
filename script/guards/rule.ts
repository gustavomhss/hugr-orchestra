// A guard rule is one TOML file in script/guards/rules/. The id is the file name. A rule without positive and negative
// samples does not load, so every rule that runs has been shown to fire and to stay quiet.

export type Rule = {
  id: string
  severity: "gate" | "warn"
  // added-lines: `match` runs on each added line. changed-paths: the rule fires on a changed path inside `paths`.
  on: "added-lines" | "changed-paths"
  paths: string[]
  exclude: string[]
  // Whether the shared generated-file list is skipped for this rule. A conflict marker is a defect even in generated code.
  generated: "skip" | "include"
  // Git status letters (A, M, D, R, C) a changed-paths rule applies to. Empty means all.
  statuses: string[]
  match: RegExp | undefined
  message: string
  // added-lines: sample lines. changed-paths: sample paths.
  positive: string[]
  negative: string[]
}

export function parseRule(file: string, text: string): Rule | string {
  const raw = parseToml(text)
  if (typeof raw === "string") return `${file}: ${raw}`
  const id = raw.id
  if (typeof id !== "string" || `${id}.toml` !== file) return `${file}: id must equal the file name`
  const severity = raw.severity
  if (severity !== "gate" && severity !== "warn") return `${file}: severity must be "gate" or "warn"`
  const on = raw.on
  if (on !== "added-lines" && on !== "changed-paths") return `${file}: on must be "added-lines" or "changed-paths"`
  const paths = strings(raw.paths)
  if (!paths || paths.length === 0) return `${file}: paths must be a non-empty list of globs`
  const exclude = strings(raw.exclude ?? [])
  if (!exclude) return `${file}: exclude must be a list of globs`
  const statuses = strings(raw.statuses ?? [])
  if (!statuses) return `${file}: statuses must be a list of git status letters`
  const generated = raw.generated ?? "skip"
  if (generated !== "skip" && generated !== "include") return `${file}: generated must be "skip" or "include"`
  const message = raw.message
  if (typeof message !== "string" || message.trim().length === 0) return `${file}: message is required`
  const positive = strings(raw.positive)
  const negative = strings(raw.negative)
  if (!positive || !negative || positive.length === 0 || negative.length === 0) {
    return `${file}: positive and negative samples are required`
  }
  const match = raw.match === undefined ? undefined : compile(raw.match)
  if (raw.match !== undefined && !match) return `${file}: match is not a valid regular expression`
  if (on === "added-lines" && !match) return `${file}: an added-lines rule needs a match`
  if (on === "changed-paths" && match) return `${file}: a changed-paths rule matches by paths, not by match`
  return { id, severity, on, paths, exclude, generated, statuses, match, message, positive, negative }
}

export function inScope(rule: Rule, path: string) {
  return globs(rule.paths, path) && !globs(rule.exclude, path)
}

export function globs(patterns: string[], path: string) {
  return patterns.some((pattern) => new Bun.Glob(pattern).match(path))
}

export function lineHits(rule: Rule, text: string) {
  return rule.match?.test(text) ?? false
}

// Runs the rule's own samples. Returns one error per sample that behaves wrongly.
export function selfCheck(rule: Rule) {
  const hits = (sample: string) => (rule.on === "added-lines" ? lineHits(rule, sample) : inScope(rule, sample))
  return [
    ...rule.positive.filter((sample) => !hits(sample)).map((sample) => `${rule.id}: positive sample does not fire: ${sample}`),
    ...rule.negative.filter((sample) => hits(sample)).map((sample) => `${rule.id}: negative sample fires: ${sample}`),
  ]
}

function parseToml(text: string): Record<string, unknown> | string {
  try {
    return Bun.TOML.parse(text) as Record<string, unknown>
  } catch (error) {
    return `invalid TOML (${String(error)})`
  }
}

function compile(value: unknown) {
  if (typeof value !== "string") return undefined
  try {
    return new RegExp(value)
  } catch {
    return undefined
  }
}

function strings(value: unknown) {
  if (!Array.isArray(value)) return undefined
  return value.every((item) => typeof item === "string") ? (value as string[]) : undefined
}
