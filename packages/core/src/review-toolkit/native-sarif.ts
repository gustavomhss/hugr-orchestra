export * as ReviewNativeSarif from "./native-sarif"

import { ReviewSarif } from "./sarif"
import { Option, Schema } from "effect"
import { ReviewNativeFiles } from "./native-files"

/** Host-owned source mapping and native rule inventory, never supplied by the reviewed tree. */
export type Options = {
  readonly pack: string
  readonly version: string
  readonly root: string
  readonly paths: readonly { readonly file: string; readonly path: string }[]
  readonly rules: readonly string[]
}

/** Native error levels settle a tool's exit protocol; they do not confirm a finding or set review severity. */
export type Parsed =
  | { status: "ok"; results: ReviewSarif.Raw[]; excluded: ReviewSarif.Excluded[]; nativeErrors: number }
  | { status: "acquisition-error"; reason: string }

export function parse(text: string, options: Options): Parsed {
  const fail = (reason: string): Parsed => ({ status: "acquisition-error", reason })
  const path = ReviewNativeFiles.flavor(options.root)
  if (!options.pack.trim() || !options.version.trim() || deviceNamespace(options.root) || !path.isAbsolute(options.root) || options.root.includes("\0") || options.root.split(path.sep === "\\" ? /[\\/]/ : /\//).includes("..")) return fail("host-context-invalid")
  if (!options.paths.length || !options.rules.length || options.rules.some((rule) => !rule || rule === "*") || new Set(options.rules).size !== options.rules.length) return fail("host-inventory-invalid")
  const keys = (value: string) => path.sep === "\\" ? value.toLowerCase() : value
  const mappings = new Map<string, string>()
  const sources = new Set<string>()
  for (const entry of options.paths) {
    if (deviceNamespace(entry.file) || deviceNamespace(entry.path)) return fail("host-path-map-invalid")
    const file = ReviewNativeFiles.containedPath(options.root, entry.file)
    const source = ReviewNativeFiles.containedPath(options.root, entry.path)
    if (!file || !source || mappings.has(keys(file)) || sources.has(keys(source))) return fail("host-path-map-invalid")
    mappings.set(keys(file), source)
    sources.add(keys(source))
  }
  if (Buffer.byteLength(text, "utf8") > 4 * 1024 * 1024) return fail("report-too-large")
  const decoded = Schema.decodeUnknownOption(Schema.UnknownFromJsonString)(text)
  if (Option.isNone(decoded)) return fail("malformed-json")
  const data = decoded.value
  if (!record(data) || data.version !== "2.1.0" || !Array.isArray(data.runs) || data.runs.length !== 1) return fail("native-envelope-invalid")
  const run = data.runs[0]
  if (!record(run) || !record(run.tool) || !record(run.tool.driver) || run.tool.driver.name !== options.pack || run.tool.driver.version !== options.version || !Array.isArray(run.results)) return fail("native-driver-mismatch")
  if (run.tool.driver.semanticVersion !== undefined && run.tool.driver.semanticVersion !== options.version) return fail("native-version-mismatch")
  if (run.invocations !== undefined && (!Array.isArray(run.invocations) || run.invocations.some((i) => !record(i) || (i.executionSuccessful !== undefined && typeof i.executionSuccessful !== "boolean") || [i.toolExecutionNotifications, i.toolConfigurationNotifications].some((ns) => ns !== undefined && (!Array.isArray(ns) || ns.some((n) => !record(n) || (n.level !== undefined && (typeof n.level !== "string" || !["none", "note", "warning", "error"].includes(n.level))))))))) return fail("native-invocation-invalid")
  if (Array.isArray(run.invocations) && run.invocations.some((i) => record(i) && (i.executionSuccessful === false || [i.toolExecutionNotifications, i.toolConfigurationNotifications].some((ns) => Array.isArray(ns) && ns.some((n) => record(n) && n.level === "error"))))) return fail("native-invocation-failed")
  const projectedRows: { rule: string; line: number; source: string }[] = []
  const projectedRuns: unknown[] = []
  const projectedResultRows: unknown[] = []
  const projectedRun: Record<string, unknown> = { ...run, results: projectedResultRows }
  projectedRuns.push(projectedRun)
  let nativeErrors = 0
  for (const row of run.results) {
    // Native review/note is an informational candidate, not a review verdict.
    const review = record(row) && row.kind === "review" && row.level === "note"
    if (!record(row) || (row.kind !== undefined && row.kind !== "fail" && !review) || typeof row.ruleId !== "string" || !options.rules.includes(row.ruleId) || !record(row.message) || typeof row.message.text !== "string" || !Array.isArray(row.locations) || row.locations.length !== 1) return fail("native-row-invalid")
    if (row.level !== undefined && (typeof row.level !== "string" || !["error", "warning", "note"].includes(row.level))) return fail("native-level-invalid")
    const physical = record(row.locations[0]) && record(row.locations[0].physicalLocation) ? row.locations[0].physicalLocation : undefined
    const uri = physical && record(physical.artifactLocation) ? physical.artifactLocation.uri : undefined
    const region = physical && record(physical.region) ? physical.region : undefined
    if (typeof uri !== "string" || !region || typeof region.startLine !== "number" || !Number.isSafeInteger(region.startLine) || region.startLine < 1 || (region.endLine !== undefined && (typeof region.endLine !== "number" || !Number.isSafeInteger(region.endLine) || region.endLine < region.startLine)) || [region.startColumn, region.endColumn].some((n) => n !== undefined && (typeof n !== "number" || !Number.isSafeInteger(n) || n < 1)) || (typeof region.startColumn === "number" && typeof region.endColumn === "number" && (region.endLine ?? region.startLine) === region.startLine && region.endColumn < region.startColumn)) return fail("native-location-invalid")
    const decodedUri = decodeNativeUri(uri, path)
    if (!decodedUri) return fail("native-uri-invalid")
    const file = ReviewNativeFiles.containedPath(options.root, decodedUri)
    const source = file && mappings.get(keys(file))
    if (!source) return fail("native-path-unmapped")
    const opaque = `native-row-${projectedRows.length}`
    const location = row.locations[0]
    if (!record(location) || !record(location.physicalLocation) || !record(location.physicalLocation.artifactLocation)) return fail("native-location-invalid")
    const projectedRow = {
      ...row,
      locations: [{
        ...location,
        physicalLocation: {
          ...location.physicalLocation,
          artifactLocation: { ...location.physicalLocation.artifactLocation, uri: opaque },
        },
      }],
    }
    projectedResultRows.push(projectedRow)
    projectedRows.push({ rule: row.ruleId, line: region.startLine, source })
    if ((row.level ?? "warning") === "error") nativeErrors++
  }
  const projected = { ...data, runs: projectedRuns }
  const parsed = ReviewSarif.parseSarif(JSON.stringify(projected), { pack: options.pack, root: options.root })
  if (parsed.status !== "ok") return fail(parsed.reason)
  if (parsed.results.length !== projectedRows.length || parsed.excluded.length !== 0) return fail("native-result-count-mismatch")
  const results = parsed.results.map((normalized, index) => {
    const entry = projectedRows[index]
    return entry && normalized.rule === entry.rule && normalized.line === entry.line ? { ...normalized, path: entry.source } : undefined
  })
  if (results.some((result) => result === undefined)) return fail("native-normalization-mismatch")
  return { status: "ok", results: results.filter((result): result is ReviewSarif.Raw => result !== undefined), excluded: [], nativeErrors }
}

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
}

function deviceNamespace(value: string) {
  const prefix = value.slice(0, 4).replaceAll("/", "\\")
  return prefix === "\\\\?\\" || prefix === "\\\\.\\"
}

function decodeNativeUri(uri: string, path: ReturnType<typeof ReviewNativeFiles.flavor>) {
  try {
    if (uri.includes("\0") || uri.includes("?") || uri.includes("#")) return undefined
    const fileUri = uri.startsWith("file://")
    if (!fileUri && /^[A-Za-z][A-Za-z0-9+.-]*:/.test(uri) && !(path.sep === "\\" && /^[A-Za-z]:[\\/]/.test(uri))) return undefined
    const encodedPath = fileUri ? uri.slice("file://".length).replace(/^[^/]*?(?=\/|$)/, "") : uri
    if (/%2f/i.test(encodedPath) || (path.sep === "\\" && /%5c/i.test(encodedPath))) return undefined
    if (!fileUri) return decodeURIComponent(uri)
    if (uri.includes("\\")) return undefined
    const rest = uri.slice("file://".length)
    const slash = rest.indexOf("/")
    const authority = slash < 0 ? rest : rest.slice(0, slash)
    const encodedFilePath = slash < 0 ? "" : rest.slice(slash)
    if (/%2f|%5c/i.test(authority)) return undefined
    const host = decodeURIComponent(authority)
    if (host && host.toLowerCase() !== "localhost" && path.sep !== "\\") return undefined
    if (/%2f/i.test(encodedFilePath) || (path.sep === "\\" && /%5c/i.test(encodedFilePath))) return undefined
    const decodedPath = decodeURIComponent(encodedFilePath)
    const nativePath = host && host.toLowerCase() !== "localhost"
      ? `\\\\${host}${decodedPath.replaceAll("/", "\\")}`
      : path.sep === "\\"
        ? decodedPath.replace(/^\/[A-Za-z]:/, (drive) => drive.slice(1)).replaceAll("/", "\\")
        : decodedPath
    if (nativePath.split(path.sep === "\\" ? /[\\/]/ : /\//).includes("..")) return undefined
    return nativePath
  } catch {
    return undefined
  }
}
