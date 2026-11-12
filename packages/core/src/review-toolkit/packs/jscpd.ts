export * as ReviewPackJscpd from "./jscpd"

import { Effect, Option, Schema } from "effect"
import { BackendToolkit } from "../../backend-toolkit"
import pinned from "../../backend-toolkit/packs/jscpd"
import { ResearchProcess } from "../../research-toolkit/process"
import { ReviewNativeFiles } from "../native-files"
import { ReviewSarif } from "../sarif"

// Closed review argv at tag v5.4.3. Config is read only from the host cwd, never from the scanned root.
// No --exit-code, threshold, semantic, blame, plugins, or shell. Clones exit 0. The binary writes only --output.

export const manifest = pinned
export const RULE = "jscpd/duplicate-code"
export const templateId = "jscpd-dir-sarif"
export const reportName = "jscpd-report.sarif"
const CAP = 4 * 1024 * 1024
const HASH = /^[0-9a-f]{16}$/i
const LEVELS = ["none", "note", "warning", "error"]

export function argv(executable: string, root: string, output: string) {
  return [executable, root, "--reporters", "sarif", "--output", output]
}

export function environment(home: string) {
  const inherited = Object.fromEntries(Object.entries(ResearchProcess.environment()).filter(([key]) => !key.startsWith("JSCPD_")))
  return { ...inherited, HOME: home, XDG_CONFIG_HOME: home, XDG_CACHE_HOME: home, TMPDIR: home }
}

export const locate = Effect.fn("ReviewPackJscpd.locate")(function* () {
  if (process.platform !== "linux" || process.arch !== "x64") return { absent: "jscpd unsupported: native-runtime-unqualified" }
  const target = yield* BackendToolkit.Target
  if ("unsupported" in target || target.target !== "linux-x64") return { absent: "jscpd unsupported: native-runtime-unqualified" }
  const states = yield* BackendToolkit.status<string>(manifest.id).pipe(
    Effect.provideService(BackendToolkit.Manifest, { [manifest.id]: manifest }),
  )
  const state = states[0]
  if (state?.status === "ready") return { executable: state.executable }
  if (state?.status === "unsupported") return { absent: `jscpd unsupported: ${state.reason}` }
  if (state?.status === "failed") return { absent: `jscpd absent: ${state.cause}` }
  return { absent: "jscpd absent" }
})

export function settle(outcome: ResearchProcess.Outcome, text: string, root: string): ReviewSarif.Parsed | { status: "not-run"; reason: string } {
  if (outcome.timedOut) return { status: "not-run", reason: "timeout" }
  if (outcome.memoryExceeded) return { status: "not-run", reason: "memory cap" }
  if (outcome.overflow || outcome.stdout.truncated || outcome.stderr.truncated) return fail("output cap")
  if (outcome.failure !== undefined) return fail(outcome.failure)
  if (outcome.exitCode === null) return fail("signal")
  if (outcome.exitCode !== 0) return fail(`exit ${outcome.exitCode}`)
  if (!text.trim()) return fail("missing-report")
  return parse(text, root)
}

export function parse(text: string, root: string): ReviewSarif.Parsed {
  if (Buffer.byteLength(text, "utf8") > CAP) return fail("report-too-large")
  if (!hostRoot(root)) return fail("host-context-invalid")
  const decoded = Schema.decodeUnknownOption(Schema.UnknownFromJsonString)(text)
  if (Option.isNone(decoded)) return fail("malformed-json")
  const data = decoded.value
  if (!record(data) || data.version !== "2.1.0" || !Array.isArray(data.runs) || data.runs.length !== 1) return fail("not-sarif-2.1.0")
  const run = data.runs[0]
  if (!record(run) || !record(run.tool) || !record(run.tool.driver)) return fail("native-driver-mismatch")
  const driver = run.tool.driver
  if (driver.name !== manifest.id || driver.version !== manifest.version) return fail("native-driver-mismatch")
  if (driver.semanticVersion !== undefined && driver.semanticVersion !== manifest.version) return fail("native-version-mismatch")
  if (!Array.isArray(driver.rules) || driver.rules.some((rule) => !record(rule) || rule.id !== RULE) || !driver.rules.some((rule) => record(rule) && rule.id === RULE)) return fail("unknown-rule")
  if (!Array.isArray(run.results)) return fail("native-envelope-invalid")
  const invocation = invocations(run.invocations)
  if (invocation) return fail(invocation)
  const bases = uriBases(run.originalUriBaseIds, root)
  if (bases === undefined) return fail("wrong-baseid")
  if (run.results.length === 0) return { status: "ok", results: [], excluded: [] }
  if (bases.size === 0) return fail("wrong-baseid")
  const results: ReviewSarif.Raw[] = []
  for (const row of run.results) {
    const pair = clone(row, bases, root)
    if ("reason" in pair) return fail(pair.reason)
    results.push(pair.primary, pair.counterpart)
  }
  return { status: "ok", results, excluded: [] }
}

function clone(row: unknown, bases: Map<string, string>, root: string): { primary: ReviewSarif.Raw; counterpart: ReviewSarif.Raw } | { reason: string } {
  if (!record(row) || unexpected(row, ["ruleId", "level", "message", "locations", "relatedLocations", "partialFingerprints", "properties"])) return { reason: "native-row-invalid" }
  if (row.ruleId !== RULE) return { reason: "unknown-rule" }
  if (row.level !== "warning") return { reason: "native-level-invalid" }
  if (!record(row.message) || typeof row.message.text !== "string" || unexpected(row.message, ["text"])) return { reason: "native-row-invalid" }
  if (!Array.isArray(row.locations) || row.locations.length !== 1 || !Array.isArray(row.relatedLocations) || row.relatedLocations.length !== 1) return { reason: "native-location-invalid" }
  const primary = place(row.locations[0], root, bases)
  if ("reason" in primary) return primary
  const related = row.relatedLocations[0]
  if (!record(related) || related.id !== 0) return { reason: "native-location-invalid" }
  const counterpart = place(related, root, bases)
  if ("reason" in counterpart) return counterpart
  if (record(row.properties) && unexpected(row.properties, ["token_count", "clone_hash"])) return { reason: "native-config-spoof" }
  const hash = fingerprint(row.partialFingerprints, row.properties)
  if (!hash) return { reason: "clone-hash-missing" }
  const message = row.message.text
  return {
    primary: raw(primary, message, hash),
    counterpart: raw(counterpart, message, hash),
  }
}

function raw(place: { path: string; line: number; endLine: number }, message: string, hash: string): ReviewSarif.Raw {
  return {
    pack: manifest.id,
    rule: RULE,
    path: place.path,
    line: place.line,
    ...(place.endLine >= place.line ? { endLine: place.endLine } : {}),
    toolFingerprint: hash,
    message,
    suppressions: [],
    nativeSeverity: "warning",
  }
}

function place(value: unknown, root: string, bases: Map<string, string>): { path: string; line: number; endLine: number } | { reason: string } {
  if (!record(value) || !record(value.physicalLocation)) return { reason: "native-location-invalid" }
  const physical = value.physicalLocation
  const artifact = physical.artifactLocation
  const region = physical.region
  if (!record(artifact) || typeof artifact.uri !== "string" || typeof artifact.uriBaseId !== "string") return { reason: "native-location-invalid" }
  if (artifact.uri.includes("\0") || artifact.uri.includes("?") || artifact.uri.includes("#") || /%2f|%5c|%2e%2e/i.test(artifact.uri)) return { reason: "native-uri-invalid" }
  if (!bases.has(artifact.uriBaseId)) return { reason: "wrong-baseid" }
  if (!record(region) || unexpected(region, ["startLine", "startColumn", "endLine", "endColumn"])) return { reason: "native-location-invalid" }
  if (region.snippet !== undefined) return { reason: "native-snippet" }
  if (!line(region.startLine) || !line(region.endLine) || region.endLine < region.startLine) return { reason: "native-location-invalid" }
  if ([region.startColumn, region.endColumn].some((column) => column !== undefined && !line(column))) return { reason: "native-location-invalid" }
  if (line(region.startColumn) && line(region.endColumn) && region.endLine === region.startLine && region.endColumn < region.startColumn) return { reason: "native-location-invalid" }
  if (/^[A-Za-z][A-Za-z0-9+.-]*:/.test(artifact.uri) && !artifact.uri.startsWith("file://")) return { reason: "native-uri-invalid" }
  const file = artifact.uri.startsWith("file://") ? filePath(artifact.uri) : artifact.uri
  if (!file || file.split(/[\\/]/).includes("..")) return { reason: "native-uri-invalid" }
  const relative = ReviewNativeFiles.containedPath(root, file)
  if (!relative) return { reason: "native-uri-invalid" }
  return { path: relative, line: region.startLine, endLine: region.endLine }
}

function fingerprint(partial: unknown, properties: unknown) {
  if (!record(partial) || unexpected(partial, ["jscpdCloneHash/v1"])) return undefined
  const hash = partial["jscpdCloneHash/v1"]
  if (typeof hash !== "string" || !HASH.test(hash)) return undefined
  if (!record(properties) || unexpected(properties, ["token_count", "clone_hash"])) return undefined
  if (typeof properties.token_count !== "number" || !Number.isSafeInteger(properties.token_count) || properties.token_count < 0) return undefined
  if (properties.clone_hash !== hash) return undefined
  return hash
}

function uriBases(value: unknown, root: string) {
  if (value === undefined) return new Map<string, string>()
  if (!record(value)) return undefined
  const bases = new Map<string, string>()
  for (const [id, entry] of Object.entries(value)) {
    if (!record(entry) || typeof entry.uri !== "string" || !sameRoot(entry.uri, root)) return undefined
    bases.set(id, entry.uri)
  }
  return bases
}

function invocations(value: unknown) {
  if (value === undefined) return undefined
  if (!Array.isArray(value)) return "native-invocation-invalid"
  for (const invocation of value) {
    if (!record(invocation)) return "native-invocation-invalid"
    if (invocation.executionSuccessful !== undefined && typeof invocation.executionSuccessful !== "boolean") return "native-invocation-invalid"
    if (invocation.executionSuccessful === false) return "native-invocation-failed"
    for (const name of ["toolExecutionNotifications", "toolConfigurationNotifications"]) {
      const notes = invocation[name]
      if (notes === undefined) continue
      if (!Array.isArray(notes) || notes.some((note) => !record(note) || (note.level !== undefined && (typeof note.level !== "string" || !LEVELS.includes(note.level))))) return "native-invocation-invalid"
      if (notes.some((note) => record(note) && note.level === "error")) return "native-invocation-failed"
    }
  }
  return undefined
}

function sameRoot(uri: string, root: string) {
  const file = filePath(uri)
  if (!file) return false
  return strip(file) === strip(root)
}

function filePath(uri: string) {
  if (!uri.startsWith("file://") || uri.includes("\\") || uri.includes("?") || uri.includes("#") || uri.includes("\0")) return undefined
  const rest = uri.slice("file://".length)
  const slash = rest.indexOf("/")
  const authority = slash < 0 ? rest : rest.slice(0, slash)
  const encoded = slash < 0 ? "" : rest.slice(slash)
  if (authority && authority.toLowerCase() !== "localhost") return undefined
  if (/%2f|%5c|%2e%2e/i.test(encoded)) return undefined
  try {
    const decoded = decodeURIComponent(encoded)
    if (decoded.split("/").includes("..")) return undefined
    return decoded
  } catch {
    return undefined
  }
}

function hostRoot(root: string) {
  const path = ReviewNativeFiles.flavor(root)
  return Boolean(root) && !root.includes("\0") && path.isAbsolute(root) && root !== path.parse(root).root && !root.split(path.sep === "\\" ? /[\\/]/ : /\//).includes("..")
}

function line(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 1
}

function strip(value: string) {
  return value.replace(/[\\/]+$/, "")
}

function unexpected(value: Record<string, unknown>, keys: readonly string[]) {
  return Object.keys(value).some((key) => !keys.includes(key))
}

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
}

function fail(reason: string): ReviewSarif.Parsed {
  return { status: "acquisition-error", reason }
}
