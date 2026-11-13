export * as ReviewTypeAware from "./type-aware"

import path from "path"
import { lstat, mkdir, writeFile } from "fs/promises"
import { Effect } from "effect"
import { BackendToolkit } from "../backend-toolkit"
import oxlint from "../backend-toolkit/packs/oxlint"
import tsgolint from "../backend-toolkit/packs/tsgolint"
import { FSUtil } from "../fs-util"
import { Probe } from "../research-toolkit/probe/types"
import { ResearchProcess } from "../research-toolkit/process"
import { ReviewCatalog } from "../review/catalog"
import { ReviewNativeSarif } from "./native-sarif"
import { ReviewSarif } from "./sarif"
import { ReviewBuildLane } from "./build-lane"
import type { ReviewAnalyze } from "./analyze"

// One closed argv. The host names both binaries. --type-aware is the switch the oxlint 1.91.0 source
// documents. --fix is never passed. OXLINT_TSGOLINT_PATH is the pinned binary, so the walk up to PATH
// in try_find_tsgolint_executable does not run.

export const RULE = "typescript(no-floating-promises)"
export const DENY = "typescript/no-floating-promises"
export const UNQUALIFIED = "native-runtime-unqualified"
const TEMPLATE = "oxlint-type-aware"
const TIMEOUT_MS = 10 * 60_000
const CAP = 40
const SOURCE = new Set([".ts", ".tsx", ".mts", ".cts", ".js", ".jsx", ".mjs", ".cjs"])

type Confine = ReviewAnalyze.Confine

export function argv(executable: string, config: string, files: readonly string[]) {
  return [
    executable, "--config", config, "--disable-nested-config", "--no-ignore", "--allow", "all",
    "--deny", DENY, "--type-aware", "--format", "sarif", "--", ...files,
  ]
}

export const run = Effect.fn("ReviewTypeAware.run")(function* (
  pack: ReviewAnalyze.Pack,
  context: ReviewAnalyze.RunContext,
  confine: Confine,
) {
  if (pack.template !== TEMPLATE) return refused(pack, "not-built")
  if (context.input.lane !== "build") return refused(pack, `lane: build is above ${context.input.lane}`)
  if (!context.input.trusted) return refused(pack, "build lane off (D6)")
  if (pack.status === "dropped") return refused(pack, "dropped")
  const base = yield* context.base
  if ("failed" in base) return refused(pack, base.failed)
  if (yield* ReviewBuildLane.citesTypecheckCi(base.snapshot.root)) return refused(pack, ReviewBuildLane.TYPECHECK_CI)
  const head = yield* context.head
  if ("failed" in head) return refused(pack, head.failed)
  const files = yield* Effect.promise(() => candidates(context.input.changed, head.snapshot.root))
  if (!files.ok) return refused(pack, files.reason)
  const binaries = yield* locate()
  if (!binaries.ok) return refused(pack, binaries.reason)
  const config = path.join(head.snapshot.scratch, "oxlint-type-aware.json")
  yield* Effect.promise(() => mkdir(head.snapshot.scratch, { recursive: true }))
  yield* Effect.promise(() => writeFile(config, JSON.stringify({
    plugins: ["typescript"],
    rules: { [DENY]: "error" },
  }), { mode: 0o600 }))
  const command = argv(binaries.oxlint, config, files.absolute)
  if (command.some((arg) => arg === "--fix" || arg.startsWith("--fix"))) return refused(pack, "not-built")
  const ran = yield* confine({
    argv: command,
    cwd: head.snapshot.root,
    write: [head.snapshot.root],
    env: environment(head.snapshot.root, binaries.tsgolint),
    timeoutMs: TIMEOUT_MS,
    maxBytes: Probe.Limits.outputBytes,
    tailBytes: Probe.Limits.outputBytes,
  })
  if ("denied" in ran) return refused(pack, ran.denied, true)
  const stdout = ran.outcome.stdout.data.toString("utf8")
  const uri = yield* context.write("raw/oxlint-type-aware.sarif", stdout)
  const settled = settle(ran.outcome, head.snapshot.root, files.relative)
  if (settled.status !== "ok") return finished(pack, settled.status, true, settled.reason, uri)
  const bound = ReviewSarif.bind(settled.results, lookup(context.catalog), (file, line, endLine) =>
    (context.input.changed[file] ?? []).some((range) => line <= range.end && (endLine ?? line) >= range.start))
  if ("failed" in bound) return finished(pack, "acquisition-error", true, bound.failed, uri)
  const status = bound.items.length > 0 ? "fail" : "pass"
  const reason = files.skipped > 0 ? `opened ${files.opened} of ${files.opened + files.skipped}` : undefined
  return { checks: [check(pack, status, true, reason, uri)], head: bound.items, base: [] }
})

const locate = Effect.fnUntraced(function* () {
  if (process.platform !== "linux" || process.arch !== "x64") return { ok: false as const, reason: UNQUALIFIED }
  const target = yield* BackendToolkit.Target
  if ("target" in target && target.target !== "linux-x64") return { ok: false as const, reason: UNQUALIFIED }
  const manifest = { oxlint, tsgolint }
  const ready = (id: "oxlint" | "tsgolint") => BackendToolkit.ensure<string>(id).pipe(
    Effect.provideService(BackendToolkit.Manifest, manifest),
    Effect.map((installed) => installed.executable),
    Effect.catch((error) => Effect.succeed(error)),
  )
  const oxlintPath = yield* ready("oxlint")
  if (typeof oxlintPath !== "string") return { ok: false as const, reason: `oxlint absent: ${cause(oxlintPath)}` }
  const tsgolintPath = yield* ready("tsgolint")
  if (typeof tsgolintPath !== "string") return { ok: false as const, reason: `tsgolint absent: ${cause(tsgolintPath)}` }
  return { ok: true as const, oxlint: oxlintPath, tsgolint: tsgolintPath }
})

function cause(error: unknown) {
  if (error && typeof error === "object" && "reason" in error && typeof error.reason === "string") return error.reason
  if (error && typeof error === "object" && "cause" in error && typeof error.cause === "string") return error.cause
  return "fetch-failed"
}

function lookup(catalog: ReviewCatalog.Catalog): ReviewSarif.Lookup {
  return (pack, rule) => {
    const entry = catalog.rules.find((item) => item.pack === pack && item.rule === rule)
    if (!entry || entry.status === "dropped") return undefined
    const severity = entry.severity["*"]
    if (severity !== "P0" && severity !== "P1" && severity !== "P2" && severity !== "P3") return "severity-unmapped"
    return { class: entry.class, lens: entry.lens, severity, status: entry.status, triage: entry.triage }
  }
}

function environment(root: string, binary: string) {
  const base = ResearchProcess.environment()
  const stripped = Object.fromEntries(Object.entries(base).filter(([key]) => !key.toUpperCase().startsWith("OXLINT_")))
  return {
    ...stripped,
    HOME: root,
    USERPROFILE: root,
    TMPDIR: root,
    TMP: root,
    TEMP: root,
    OXLINT_TSGOLINT_PATH: binary,
  }
}

async function candidates(changed: ReviewAnalyze.RunInput["changed"], root: string) {
  const relative = Object.keys(changed).filter(sourceFile).sort()
  if (relative.length === 0) return { ok: false as const, reason: "no-input" }
  const opened = relative.slice(0, CAP)
  const absolute: string[] = []
  const kept: string[] = []
  for (const file of opened) {
    const resolved = path.resolve(root, file)
    if (!FSUtil.contains(root, resolved)) return { ok: false as const, reason: "path-outside" }
    const info = await lstat(resolved).catch(() => undefined)
    if (!info || info.isSymbolicLink() || !info.isFile()) return { ok: false as const, reason: "type-aware target missing" }
    absolute.push(resolved)
    kept.push(file)
  }
  return { ok: true as const, relative: kept, absolute, opened: kept.length, skipped: relative.length - opened.length }
}

function sourceFile(file: string) {
  if (!SOURCE.has(path.posix.extname(file)) || file.includes("\0") || path.isAbsolute(file)) return false
  return file.split(/[/\\]/).every((part) => part !== "" && part !== "." && part !== "..")
}

function settle(outcome: ResearchProcess.Outcome, root: string, files: readonly string[]) {
  if (outcome.timedOut) return { status: "not-run" as const, reason: "timeout" }
  if (outcome.memoryExceeded) return { status: "not-run" as const, reason: "memory cap" }
  if (outcome.overflow || outcome.stdout.truncated || outcome.stderr.truncated) return { status: "acquisition-error" as const, reason: "output cap" }
  if (outcome.failure !== undefined) return { status: "acquisition-error" as const, reason: outcome.failure }
  if (outcome.exitCode === null) return { status: "acquisition-error" as const, reason: "missing-exit" }
  const stdout = decode(outcome.stdout.data)
  const stderr = decode(outcome.stderr.data)
  if (stdout === undefined || stderr === undefined) return { status: "acquisition-error" as const, reason: "not-utf8" }
  if (stderr.trim() !== "") return { status: "acquisition-error" as const, reason: "stderr" }
  const rewritten = rewrite(stdout)
  if (!rewritten) return { status: "acquisition-error" as const, reason: "native-envelope-invalid" }
  const parsed = ReviewNativeSarif.parse(rewritten, {
    pack: "oxlint-type-aware",
    version: oxlint.version,
    root,
    paths: files.map((file) => ({ file, path: file })),
    rules: [RULE],
  })
  if (parsed.status !== "ok") return parsed
  if ((outcome.exitCode === 0 && parsed.nativeErrors === 0) || (outcome.exitCode === 1 && parsed.nativeErrors > 0)) {
    return { status: "ok" as const, results: parsed.results }
  }
  return { status: "acquisition-error" as const, reason: `exit-${outcome.exitCode}` }
}

function rewrite(stdout: string) {
  try {
    const json = JSON.parse(stdout) as { runs?: { tool?: { driver?: { name?: string } } }[] }
    const driver = json.runs?.[0]?.tool?.driver
    if (!driver || driver.name !== "oxlint") return undefined
    driver.name = "oxlint-type-aware"
    return JSON.stringify(json)
  } catch {
    return undefined
  }
}

function decode(data: Uint8Array) {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(data)
  } catch {
    return undefined
  }
}

function refused(pack: ReviewAnalyze.Pack, reason: string, executed = false) {
  return { checks: [check(pack, "not-run", executed, reason)], head: [], base: [] }
}

function finished(pack: ReviewAnalyze.Pack, status: ReviewAnalyze.Status, workspaceExecuted: boolean, reason?: string, uri?: string) {
  return { checks: [check(pack, status, workspaceExecuted, reason, uri)], head: [], base: [] }
}

function check(pack: ReviewAnalyze.Pack, status: ReviewAnalyze.Status, workspaceExecuted: boolean, reason?: string, uri?: string) {
  return {
    id: pack.id,
    pack: pack.id,
    version: pack.version,
    lane: pack.lane,
    status,
    ...(reason === undefined ? {} : { reason }),
    workspaceExecuted,
    ...(uri === undefined ? {} : { uri }),
  }
}
