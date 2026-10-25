// A guard rule is one TOML file in script/guards/rules/. The id is the file name. A rule without positive and negative
// samples does not load, so every rule that runs has been shown to fire and to stay quiet.

export type Rule = {
  id: string
  severity: "gate" | "warn"
  // added-lines: `match` runs on each added line. changed-paths: the rule fires on a changed path inside `paths`.
  // line-balance: in one file, lines matching `match` removed minus lines matching it added reaches `minNetRemoved`.
  on: "added-lines" | "changed-paths" | "line-balance"
  paths: string[]
  exclude: string[]
  // Whether the shared generated-file list is skipped for this rule. A conflict marker is a defect even in generated code.
  generated: "skip" | "include"
  // Git status letters (A, M, D, R, C) a changed-paths rule applies to. Empty means all.
  statuses: string[]
  // changed-paths only. The file must have one of these git modes (100755 executable, 120000 symlink, 160000 submodule).
  modes: string[]
  // changed-paths only. The file must be at least this many bytes.
  minBytes: number | undefined
  // changed-paths only. true: only binary files. false: only text files.
  binary: boolean | undefined
  // changed-paths only. true: only files that do not start with a #! line.
  noShebang: boolean
  // line-balance only.
  minNetRemoved: number | undefined
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
  if (on !== "added-lines" && on !== "changed-paths" && on !== "line-balance") {
    return `${file}: on must be "added-lines", "changed-paths" or "line-balance"`
  }
  const paths = strings(raw.paths)
  if (!paths || paths.length === 0) return `${file}: paths must be a non-empty list of globs`
  const exclude = strings(raw.exclude ?? [])
  if (!exclude) return `${file}: exclude must be a list of globs`
  const statuses = strings(raw.statuses ?? [])
  if (!statuses) return `${file}: statuses must be a list of git status letters`
  const modes = strings(raw.modes ?? [])
  if (!modes) return `${file}: modes must be a list of git modes`
  const minBytes = raw.min_bytes
  if (minBytes !== undefined && (typeof minBytes !== "number" || !Number.isSafeInteger(minBytes) || minBytes < 1)) {
    return `${file}: min_bytes must be a positive integer`
  }
  const binary = raw.binary
  if (binary !== undefined && typeof binary !== "boolean") return `${file}: binary must be true or false`
  const noShebang = raw.no_shebang ?? false
  if (typeof noShebang !== "boolean") return `${file}: no_shebang must be true or false`
  const minNetRemoved = raw.min_net_removed
  if (minNetRemoved !== undefined && (typeof minNetRemoved !== "number" || !Number.isSafeInteger(minNetRemoved) || minNetRemoved < 1)) {
    return `${file}: min_net_removed must be a positive integer`
  }
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
  if (on !== "changed-paths" && !match) return `${file}: an ${on} rule needs a match`
  if (on === "line-balance" && minNetRemoved === undefined) return `${file}: a line-balance rule needs min_net_removed`
  if (on !== "line-balance" && minNetRemoved !== undefined) return `${file}: min_net_removed is for line-balance rules`
  const fileFilters = modes.length > 0 || minBytes !== undefined || binary !== undefined || noShebang
  if (on === "added-lines" && fileFilters) return `${file}: modes, min_bytes, binary and no_shebang are for changed-paths rules`
  if (on === "changed-paths" && match) return `${file}: a changed-paths rule matches by paths, not by match`
  return {
    id,
    severity,
    on,
    paths,
    exclude,
    generated,
    statuses,
    modes,
    minBytes,
    binary,
    noShebang,
    minNetRemoved,
    match,
    message,
    positive,
    negative,
  }
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

// Runs the rule's own samples. Returns one error per sample that behaves wrongly. A changed-paths rule's samples are
// paths, so they check the path scope only; its mode, size and content filters are covered by the pack's golden test.
export function selfCheck(rule: Rule) {
  const hits = (sample: string) => (rule.on === "changed-paths" ? inScope(rule, sample) : lineHits(rule, sample))
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
