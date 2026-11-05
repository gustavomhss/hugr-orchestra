export * as ReviewSarif from "./sarif"

import { posix, win32 } from "node:path"
import { Option, Schema } from "effect"
import { knownRule } from "./packs/ast-grep-rules"
import { ReviewItem } from "./item"

// §8.6 step 1 (normalize): SARIF 2.1.0 and pack-specific JSON reports become one raw shape, then ToolItems through the
// catalog's rule lookup. A report that cannot be read is an acquisition error, never an empty result.

export type Suppression = {
  kind: "inSource" | "external"
  status?: "accepted" | "underReview" | "rejected"
  justification?: string
}

/** One native result in pack-neutral form, before the catalog maps it. `snippet` is the tool's text, unnormalized. */
export type Raw = {
  pack: string
  rule: string
  path: string
  line: number
  endLine?: number
  snippet?: string
  toolFingerprint?: string
  message: string
  suppressions: readonly Suppression[]
}

export type ExcludedReason = "no-rule" | "no-location" | "not-a-finding" | "unknown-rule"
export type Excluded = { reason: ExcludedReason; rule?: string; count: number }

export type Parsed =
  | { status: "ok"; results: Raw[]; excluded: Excluded[] }
  | { status: "acquisition-error"; reason: string }

export type RuleInfo = {
  class: string
  lens: string
  severity: ReviewItem.Severity
  status: ReviewItem.RuleStatus
  triage: string
}
/** Catalog rule lookup by pack and native rule id; `undefined` means the catalog does not know the rule. */
export type Lookup = (pack: string, rule: string) => RuleInfo | undefined

/** `root` is the scanned tree's absolute path; result paths under it become relative to it. */
export type Options = { pack: string; root?: string }

/** A ToolItem with the suppressions its tool reported, which the noise pipeline honours or raises (§8.6 step 5). */
export type Entry = { item: ReviewItem.ToolItem; suppressions: readonly Suppression[] }

const Region = Schema.Struct({
  startLine: Schema.optionalKey(ReviewItem.Line),
  endLine: Schema.optionalKey(ReviewItem.Line),
  snippet: Schema.optionalKey(Schema.Struct({ text: Schema.optionalKey(Schema.String) })),
})
const SarifResult = Schema.Struct({
  ruleId: Schema.optionalKey(Schema.String),
  ruleIndex: Schema.optionalKey(Schema.Int),
  rule: Schema.optionalKey(Schema.Struct({ id: Schema.optionalKey(Schema.String) })),
  kind: Schema.optionalKey(Schema.String),
  message: Schema.optionalKey(Schema.Struct({ text: Schema.optionalKey(Schema.String) })),
  locations: Schema.optionalKey(Schema.Array(Schema.Struct({
    physicalLocation: Schema.optionalKey(Schema.Struct({
      artifactLocation: Schema.optionalKey(Schema.Struct({ uri: Schema.optionalKey(Schema.String) })),
      region: Schema.optionalKey(Region),
      contextRegion: Schema.optionalKey(Region),
    })),
  }))),
  fingerprints: Schema.optionalKey(Schema.Record(Schema.String, Schema.String)),
  partialFingerprints: Schema.optionalKey(Schema.Record(Schema.String, Schema.String)),
  suppressions: Schema.optionalKey(Schema.Array(Schema.Struct({
    kind: Schema.Literals(["inSource", "external"]),
    status: Schema.optionalKey(Schema.Literals(["accepted", "underReview", "rejected"])),
    justification: Schema.optionalKey(Schema.String),
  }))),
})
// `results: null` means the tool did not compute results; it fails decoding and so becomes an acquisition error.
const Sarif = Schema.Struct({
  version: Schema.Literal("2.1.0"),
  runs: Schema.Array(Schema.Struct({
    tool: Schema.Struct({
      driver: Schema.Struct({ rules: Schema.optionalKey(Schema.Array(Schema.Struct({ id: Schema.String }))) }),
    }),
    results: Schema.optionalKey(Schema.Array(SarifResult)),
  })),
})

// SARIF result kinds that are not findings.
const NOT_FINDINGS = new Set(["pass", "notApplicable", "informational"])

export function parseSarif(text: string, options: Options): Parsed {
  const json = Schema.decodeUnknownOption(Schema.UnknownFromJsonString)(text)
  if (Option.isNone(json)) return { status: "acquisition-error", reason: "malformed-json" }
  const sarif = Schema.decodeUnknownOption(Sarif)(json.value)
  if (Option.isNone(sarif)) return { status: "acquisition-error", reason: "not-sarif-2.1.0" }
  const read = sarif.value.runs.flatMap((run) => (run.results ?? []).map((result) => {
    const rule = result.ruleId ?? result.rule?.id ??
      (result.ruleIndex === undefined ? undefined : run.tool.driver.rules?.[result.ruleIndex]?.id)
    if (!rule) return { excluded: "no-rule" as const }
    if (result.kind && NOT_FINDINGS.has(result.kind)) return { excluded: "not-a-finding" as const, rule }
    const physical = result.locations?.[0]?.physicalLocation
    const uri = physical?.artifactLocation?.uri
    const line = physical?.region?.startLine
    if (!uri || line === undefined) return { excluded: "no-location" as const, rule }
    return {
      raw: {
        pack: options.pack,
        rule,
        path: relativePath(uri, options.root),
        line,
        ...endLine(line, physical?.region?.endLine),
        ...optional("snippet", physical?.region?.snippet?.text ?? physical?.contextRegion?.snippet?.text),
        ...optional("toolFingerprint", toolFingerprint(result.fingerprints) ?? toolFingerprint(result.partialFingerprints)),
        message: result.message?.text ?? "",
        suppressions: result.suppressions ?? [],
      } satisfies Raw,
    }
  }))
  return {
    status: "ok",
    results: read.flatMap((entry) => (isRaw(entry) ? [entry.raw] : [])),
    excluded: count(read.flatMap((entry) => (isExcluded(entry) ? [entry] : []))),
  }
}

/** Parsers for packs whose catalog output is `json` with a parser id (K5). */
export const jsonParsers = {
  gitleaks: parseGitleaks,
  "ast-grep": parseAstGrep,
} satisfies Record<string, (text: string, options: Options) => Parsed>

export function parseJson(parser: string, text: string, options: Options): Parsed {
  if (!Object.hasOwn(jsonParsers, parser)) return { status: "acquisition-error", reason: `unknown-parser:${parser}` }
  return jsonParsers[parser as keyof typeof jsonParsers](text, options)
}

// gitleaks 8.30.1 `--report-format json`: an array of findings. JSON rather than its SARIF because the JSON `Match`
// carries the matched text (redacted under `--redact`), while its SARIF fingerprints are commit metadata. gitleaks applies
// `gitleaks:allow` and `.gitleaksignore` itself, so its findings carry no suppressions. Its `Fingerprint` embeds the
// line number, so it is not used.
const GitleaksReport = Schema.Array(Schema.Struct({
  RuleID: Schema.String,
  Description: Schema.optionalKey(Schema.String),
  File: Schema.String,
  StartLine: ReviewItem.Line,
  EndLine: Schema.optionalKey(ReviewItem.Line),
  Match: Schema.optionalKey(Schema.String),
}))

// ast-grep 0.45.3 `scan --json`: an array of rule matches. Lines are zero-based. One invalid row fails the whole report;
// excluded rows must not become an empty pass. Only the two host rule ids are known. SARIF and gitleaks stay as they are.
function parseAstGrep(text: string, options: Options): Parsed {
  const json = Schema.decodeUnknownOption(Schema.UnknownFromJsonString)(text)
  if (Option.isNone(json)) return { status: "acquisition-error", reason: "malformed-json" }
  if (!Array.isArray(json.value)) return { status: "acquisition-error", reason: "not-ast-grep-json" }
  const read = json.value.map((row) => astGrepRow(row, options))
  const failed = read.find((row) => row.status === "acquisition-error")
  if (failed?.status === "acquisition-error") return failed
  return { status: "ok", results: read.flatMap((row) => row.status === "ok" ? [row.raw] : []), excluded: [] }
}

function astGrepRow(row: unknown, options: Options): { status: "ok"; raw: Raw } | { status: "acquisition-error"; reason: string } {
  if (!record(row)) return { status: "acquisition-error", reason: "not-ast-grep-json" }
  if (typeof row.ruleId !== "string" || row.ruleId.length === 0) return { status: "acquisition-error", reason: "empty-rule" }
  if (!knownRule(row.ruleId)) return { status: "acquisition-error", reason: `unknown-rule:${row.ruleId}` }
  if (typeof row.file !== "string" || row.file.length === 0) return { status: "acquisition-error", reason: "file-missing" }
  if (!record(row.range)) return { status: "acquisition-error", reason: "range-invalid" }
  const start = point(row.range.start)
  const end = point(row.range.end)
  if (!start || !end || !ordered(start, end)) return { status: "acquisition-error", reason: "range-invalid" }
  const path = containedPath(row.file, options.root)
  if (!path) return { status: "acquisition-error", reason: "path-outside" }
  const line = start.line + 1
  const endLineNumber = end.line + 1
  if (!Number.isSafeInteger(line) || !Number.isSafeInteger(endLineNumber)) return { status: "acquisition-error", reason: "range-invalid" }
  return {
    status: "ok",
    raw: {
      pack: options.pack,
      rule: row.ruleId,
      path,
      line,
      ...endLine(line, endLineNumber),
      ...optional("snippet", typeof row.text === "string" ? row.text : undefined),
      message: typeof row.message === "string" ? row.message : "",
      suppressions: [],
    },
  }
}

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
}

function point(value: unknown) {
  if (!record(value) || !whole(value.line)) return undefined
  if (value.column !== undefined && !whole(value.column)) return undefined
  return whole(value.column) ? { line: value.line, column: value.column } : { line: value.line }
}

function whole(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0
}

function ordered(start: { line: number; column?: number }, end: { line: number; column?: number }) {
  if (end.line !== start.line) return end.line > start.line
  if (start.column === undefined || end.column === undefined) return true
  return end.column >= start.column
}

// Containment uses the root's own path flavor. A drive letter or UNC root is win32; anything else is posix. Drive-relative
// `C:foo` is rejected before resolve, which would otherwise borrow that drive's cwd. `/C:` is not rewritten into `C:`.
function containedPath(file: string, root: string | undefined) {
  if (!root || !file || file.includes("\0") || root.includes("\0")) return undefined
  if (driveRelative(file) || driveRelative(root)) return undefined
  const path = windowsRoot(root) ? win32 : posix
  // Flavor first: posix `\` is a filename character, so `src\..\a.js` is not a `..` segment. Win32 splits on both.
  if (hasDotDot(file, path) || hasDotDot(root, path)) return undefined
  if (!path.isAbsolute(root)) return undefined
  const resolvedRoot = path.resolve(root)
  const resolvedFile = path.isAbsolute(file) ? path.resolve(file) : path.resolve(root, file)
  const relative = path.relative(resolvedRoot, resolvedFile)
  if (!relative || path.isAbsolute(relative) || relative === ".." || relative.startsWith(`..${path.sep}`)) return undefined
  // Win32's relative form uses `\` as a separator. On posix a backslash is a filename character; Git can store it.
  return path === win32 ? relative.replaceAll("\\", "/") : relative
}

function driveRelative(value: string) {
  return /^[A-Za-z]:(?![\\/])/.test(value)
}

function hasDotDot(value: string, path: typeof posix) {
  return value.split(path === win32 ? /[\\/]/ : /\//).includes("..")
}

function windowsRoot(root: string) {
  return /^[A-Za-z]:[\\/]/.test(root) || root.startsWith("\\\\") || root.startsWith("//")
}

function parseGitleaks(text: string, options: Options): Parsed {
  const json = Schema.decodeUnknownOption(Schema.UnknownFromJsonString)(text)
  if (Option.isNone(json)) return { status: "acquisition-error", reason: "malformed-json" }
  const report = Schema.decodeUnknownOption(GitleaksReport)(json.value)
  if (Option.isNone(report)) return { status: "acquisition-error", reason: "not-gitleaks-json" }
  const read = report.value.map((finding) => {
    if (!finding.RuleID) return { excluded: "no-rule" as const }
    if (!finding.File) return { excluded: "no-location" as const, rule: finding.RuleID }
    return {
      raw: {
        pack: options.pack,
        rule: finding.RuleID,
        path: relativePath(finding.File, options.root),
        line: finding.StartLine,
        ...endLine(finding.StartLine, finding.EndLine),
        ...optional("snippet", finding.Match),
        message: finding.Description ?? "",
        suppressions: [],
      } satisfies Raw,
    }
  })
  return {
    status: "ok",
    results: read.flatMap((entry) => (isRaw(entry) ? [entry.raw] : [])),
    excluded: count(read.flatMap((entry) => (isExcluded(entry) ? [entry] : []))),
  }
}

/**
 * Maps raw results to ToolItems through the catalog. Unknown rules are kept out and counted, never guessed.
 * `changed` decides `onChangedLine`; without it every item starts off changed lines and the location step decides.
 */
export function toItems(
  results: readonly Raw[],
  lookup: Lookup,
  changed: (path: string, line: number, endLine?: number) => boolean = () => false,
) {
  const mapped = results.map((raw) => ({ raw, rule: lookup(raw.pack, raw.rule) }))
  const items = mapped.flatMap((entry): Entry[] => {
    if (!entry.rule) return []
    const raw = entry.raw
    const digest = ReviewItem.snippetDigest(identity(raw))
    return [{
      item: {
        fingerprint: ReviewItem.fingerprint({ pack: raw.pack, rule: raw.rule, path: raw.path, snippetDigest: digest }),
        class: entry.rule.class,
        lens: entry.rule.lens,
        pack: raw.pack,
        rule: raw.rule,
        ruleStatus: entry.rule.status,
        severity: entry.rule.severity,
        path: raw.path,
        line: raw.line,
        ...(raw.endLine === undefined ? {} : { endLine: raw.endLine }),
        snippetDigest: digest,
        sources: [{ pack: raw.pack, rule: raw.rule }],
        triage: entry.rule.triage,
        onChangedLine: changed(raw.path, raw.line, raw.endLine),
      },
      suppressions: raw.suppressions,
    }]
  })
  return {
    items,
    excluded: count(mapped.flatMap((entry) => (entry.rule ? [] : [{ excluded: "unknown-rule" as const, rule: entry.raw.rule }]))),
  }
}

// The text the fingerprint digests: the snippet when the tool gave one, else its own fingerprint, else its message.
// The message fallback is weaker: a tool that puts the line number in the message loses stability across shifts.
function identity(raw: Raw) {
  if (raw.snippet !== undefined && ReviewItem.normalizeSnippet(raw.snippet)) return raw.snippet
  if (raw.toolFingerprint !== undefined) return `tool-fingerprint\n${raw.toolFingerprint}`
  return `message\n${raw.message}`
}

function isRaw(entry: { raw?: Raw; excluded?: ExcludedReason }): entry is { raw: Raw } {
  return entry.raw !== undefined
}

function isExcluded(entry: { raw?: Raw; excluded?: ExcludedReason; rule?: string }): entry is { excluded: ExcludedReason; rule?: string } {
  return entry.excluded !== undefined
}

function count(entries: { excluded: ExcludedReason; rule?: string }[]): Excluded[] {
  const counts = entries.reduce((map, entry) => {
    const key = JSON.stringify([entry.excluded, entry.rule ?? null])
    const found = map.get(key)
    map.set(key, { reason: entry.excluded, ...optional("rule", entry.rule), count: (found?.count ?? 0) + 1 })
    return map
  }, new Map<string, Excluded>())
  return [...counts.values()]
}

function toolFingerprint(fingerprints: Record<string, string> | undefined) {
  if (!fingerprints || Object.keys(fingerprints).length === 0) return undefined
  return JSON.stringify(Object.entries(fingerprints).sort(([a], [b]) => a.localeCompare(b)))
}

function endLine(line: number, end: number | undefined) {
  return end !== undefined && end >= line ? { endLine: end } : {}
}

function optional<K extends string>(key: K, value: string | undefined) {
  return (value === undefined ? {} : { [key]: value }) as { [P in K]?: string }
}

// A SARIF uri or a tool path, as a forward-slash path relative to `root` when it lies under it.
function relativePath(uri: string, root: string | undefined) {
  const decoded = uri.startsWith("file://") ? decodePercent(uri.slice("file://".length)) : uri
  const slashed = decoded.replaceAll("\\", "/")
  const local = /^\/[A-Za-z]:\//.test(slashed) ? slashed.slice(1) : slashed
  const base = root?.replaceAll("\\", "/").replace(/\/+$/, "")
  const inside = base && local.startsWith(`${base}/`) ? local.slice(base.length + 1) : local
  return inside.replace(/^(\.\/)+/, "")
}

// Percent-decoding without decodeURIComponent, which throws on invalid sequences; invalid UTF-8 becomes U+FFFD.
function decodePercent(text: string) {
  const bytes = text.split(/(%[0-9A-Fa-f]{2})/).flatMap((part) =>
    /^%[0-9A-Fa-f]{2}$/.test(part) ? [Number.parseInt(part.slice(1), 16)] : [...new TextEncoder().encode(part)])
  return new TextDecoder().decode(new Uint8Array(bytes))
}
