export * as ReviewCargoAuditReport from "./cargo-audit-report"

import { Option, Schema } from "effect"
import { ReviewCargoAuditLock } from "./cargo-audit-lock"
import type { ResearchProcess } from "../research-toolkit/process"
import type { ReviewSarif } from "./sarif"

// Dedicated cargo-audit JSON -> Raw. Not a SARIF-kind review path: informational advisories stay warning candidates.
// A row is the advisory id plus title, never a claim that the JSON proved an exploit.

const CAP = 4 * 1024 * 1024
const PACK = "cargo-audit"
const RULE = "cargo-audit/advisory"
const CATEGORIES = ["unmaintained", "unsound", "notice"] as const
const ID = /^RUSTSEC-20\d{2}-\d{4}$/

const Advisory = Schema.Struct({
  id: Schema.String,
  package: Schema.String,
  title: Schema.String,
})
const Package = Schema.Struct({
  name: Schema.String,
  version: Schema.String,
  source: Schema.optionalKey(Schema.NullOr(Schema.String)),
})
const Warning = Schema.Struct({
  kind: Schema.String,
  package: Package,
  advisory: Schema.NullOr(Advisory),
})
const Report = Schema.Struct({
  database: Schema.Struct({
    "advisory-count": Schema.Int,
    "last-commit": Schema.NullOr(Schema.String),
    "last-updated": Schema.NullOr(Schema.String),
  }),
  lockfile: Schema.Struct({
    "dependency-count": Schema.Int,
  }),
  settings: Schema.Struct({
    target_arch: Schema.Array(Schema.String),
    target_os: Schema.Array(Schema.String),
    severity: Schema.NullOr(Schema.String),
    ignore: Schema.Array(Schema.String),
    informational_warnings: Schema.Array(Schema.String),
  }),
  vulnerabilities: Schema.Struct({
    found: Schema.Boolean,
    count: Schema.Int,
    list: Schema.Array(Schema.Struct({ advisory: Advisory, package: Package })),
  }),
  warnings: Schema.Record(Schema.String, Schema.Array(Warning)),
})

type Advisory = { readonly id: string; readonly package: string; readonly title: string }
type Package = { readonly name: string; readonly version: string; readonly source?: string | null }
type Warning = { readonly kind: string; readonly package: Package; readonly advisory: Advisory | null }
type Report = {
  readonly settings: {
    readonly target_arch: readonly string[]
    readonly target_os: readonly string[]
    readonly severity: string | null
    readonly ignore: readonly string[]
    readonly informational_warnings: readonly string[]
  }
  readonly vulnerabilities: { readonly found: boolean; readonly count: number; readonly list: readonly { readonly advisory: Advisory; readonly package: Package }[] }
  readonly warnings: Readonly<Record<string, readonly Warning[]>>
}
type Refused = { readonly status: "acquisition-error"; readonly reason: string }

export function parse(text: string, relativeLockfile: string, lockText: string): ReviewSarif.Parsed {
  if (Buffer.byteLength(text) > CAP) return fail("output cap")
  if (Buffer.byteLength(lockText) > CAP) return fail("lockfile-size-cap")
  const json = Schema.decodeUnknownOption(Schema.UnknownFromJsonString)(text)
  if (Option.isNone(json)) return fail("malformed-json")
  const decoded = Schema.decodeUnknownOption(Report)(json.value, { onExcessProperty: "ignore" })
  if (Option.isNone(decoded)) return fail("report-invalid")
  return bind(decoded.value, relativeLockfile, lockText)
}

export function settle(outcome: ResearchProcess.Outcome, text: string, relativeLockfile: string, lockText: string): ReviewSarif.Parsed | { status: "not-run"; reason: string } {
  if (outcome.timedOut) return { status: "not-run", reason: "timeout" }
  if (outcome.memoryExceeded) return { status: "not-run", reason: "memory cap" }
  if (outcome.overflow || outcome.stdout.truncated || outcome.stderr.truncated) return fail("output cap")
  if (outcome.failure !== undefined) return fail(outcome.failure)
  if (outcome.exitCode === null) return fail("signal")
  if (outcome.exitCode !== 0 && outcome.exitCode !== 1) return fail(`exit ${outcome.exitCode}`)
  const parsed = parse(text, relativeLockfile, lockText)
  if (parsed.status !== "ok") return parsed
  const vulnerabilities = parsed.results.filter((row) => row.nativeSeverity === "error").length
  if (outcome.exitCode === 0 && vulnerabilities > 0) return fail("exit 0")
  if (outcome.exitCode === 1 && vulnerabilities === 0) return fail("exit 1")
  return parsed
}

function bind(report: Report, relativeLockfile: string, lockText: string): ReviewSarif.Parsed {
  const settings = filters(report.settings)
  if (settings) return settings
  const keys = Object.keys(report.warnings)
  if (keys.includes("yanked")) return fail("warning-yanked")
  if (keys.some((key) => !CATEGORIES.includes(key as (typeof CATEGORIES)[number]))) return fail("warning-unknown")
  const vulnerabilities = report.vulnerabilities
  if (vulnerabilities.count !== vulnerabilities.list.length || vulnerabilities.found !== (vulnerabilities.list.length > 0)) return fail("count-mismatch")
  const locked = ReviewCargoAuditLock.parse(lockText)
  if (locked.status !== "ok") return locked
  const results: ReviewSarif.Raw[] = []
  for (const item of vulnerabilities.list) {
    const row = candidate(item.package, item.advisory, "error", relativeLockfile, locked.blocks)
    if (row.status !== "ok") return row
    results.push(row.raw)
  }
  for (const kind of CATEGORIES) {
    for (const item of report.warnings[kind] ?? []) {
      if (item.advisory === null) return fail("advisory-missing")
      if (item.kind !== kind) return fail("report-invalid")
      const row = candidate(item.package, item.advisory, "warning", relativeLockfile, locked.blocks)
      if (row.status !== "ok") return row
      results.push(row.raw)
    }
  }
  return { status: "ok", results, excluded: [] }
}

function filters(settings: Report["settings"]): Refused | undefined {
  if (settings.ignore.length > 0) return fail("ignore-filter")
  if (settings.severity !== null) return fail("severity-filter")
  if (settings.target_arch.length > 0 || settings.target_os.length > 0) return fail("target-filter")
  const info = settings.informational_warnings
  const seen = new Set(info)
  if (info.length !== CATEGORIES.length || seen.size !== CATEGORIES.length || CATEGORIES.some((kind) => !seen.has(kind))) return fail("informational-filter")
  return undefined
}

function candidate(pkg: Package, advisory: Advisory, nativeSeverity: "error" | "warning", path: string, blocks: readonly ReviewCargoAuditLock.Block[]): { status: "ok"; raw: ReviewSarif.Raw } | Refused {
  if (pkg.name.trim().length === 0 || pkg.version.trim().length === 0 || advisory.package !== pkg.name) return fail("package-invalid")
  if (!ID.test(advisory.id)) return fail("advisory-id-invalid")
  if (advisory.title.trim().length === 0) return fail("title-invalid")
  const source = pkg.source ?? undefined
  const matches = blocks.filter((block) => block.name === pkg.name && block.version === pkg.version && block.source === source)
  const block = matches[0]
  if (!block || matches.length !== 1) return fail(matches.length === 0 ? "lockfile-package-missing" : "lockfile-package-ambiguous")
  return {
    status: "ok",
    raw: {
      pack: PACK,
      rule: RULE,
      path,
      line: block.line,
      endLine: block.endLine,
      toolFingerprint: `${advisory.id}:${pkg.name}:${pkg.version}:${source ?? ""}`,
      message: `${advisory.id}: ${advisory.title}`,
      suppressions: [],
      nativeSeverity,
    },
  }
}

function fail(reason: string): Refused {
  return { status: "acquisition-error", reason }
}
