export * as ReviewProbeMutants from "./probe-mutants"

import path from "path"
import { constants } from "fs"
import { lstat, mkdtemp, open, realpath, rm } from "fs/promises"
import { Context, Effect, Option, Schema } from "effect"
import { ToolSafetySandbox } from "../tool-safety-sandbox"
import { ResearchProcess } from "../research-toolkit/process"
import { Probe } from "../research-toolkit/probe/types"
import { denied } from "../research-toolkit/probe/assets"
import { ReviewProbeRuntime } from "./probe-runtime"
import { ReviewProbeTargets } from "./probe-targets"
import { ReviewScratch } from "./scratch-copy"
import { ReviewMutantsReport } from "./probe-mutants-report"

export const Binary = Context.Reference<string | undefined>("@orchestra/ReviewProbeMutants/Binary", {
  defaultValue: () => Bun.which("cargo-mutants") ?? undefined,
})
export const VERSION = "27.1.0"
export type RunContext = ReviewProbeRuntime.Context & { readonly hunks: ReadonlyArray<ReviewScratch.Hunk> }

type Ready = { readonly binary: string; readonly cargo: string; readonly lines: ReadonlySet<number>; readonly diff: string }
type Row = { readonly line: number; readonly text: string }

export const run = Effect.fn("ReviewProbeMutants.run")(function* (input: ReviewProbeTargets.Mutants, context: RunContext) {
  const ready = yield* prepare(input, context)
  if ("status" in ready) return ready
  const dir = yield* Effect.promise(() => mkdtemp(path.join(context.head.scratch, "probe-")))
  return yield* drive(input, ready, dir, context).pipe(
    Effect.catchTag("Probe.Error", (error) => Effect.succeed(stopped(error.reason))),
    Effect.ensuring(Effect.promise(() => rm(dir, { recursive: true, force: true }))),
  )
}, Effect.scoped)

const prepare = Effect.fnUntraced(function* (input: ReviewProbeTargets.Mutants, context: RunContext) {
  if (process.platform !== "linux" || process.arch !== "x64") {
    const { ReviewTypeAware } = yield* Effect.promise(() => import("./type-aware"))
    return stopped(ReviewTypeAware.UNQUALIFIED)
  }
  if (Option.isNone(Schema.decodeUnknownOption(ReviewProbeTargets.Mutants)(input)) || input.endLine < input.startLine) return stopped("invalid-target")
  if (unsafe(input.path)) return stopped("unsafe-path")
  const physical = yield* ReviewScratch.resolve(context.head, input.path).pipe(Effect.catchTag("Probe.Error", (error) => Effect.succeed(error)))
  if (typeof physical !== "string") return stopped(physical.reason)
  const lock = yield* Effect.promise(() => lstat(path.join(context.head.root, "Cargo.lock")).catch(() => undefined))
  if (!lock?.isFile()) return stopped("cargo-lockfile-missing")
  const binary = yield* Binary
  const physicalBinary = binary === undefined ? undefined : yield* Effect.promise(() => realpath(binary).catch(() => undefined))
  const binStat = physicalBinary === undefined ? undefined : yield* Effect.promise(() => lstat(physicalBinary).catch(() => undefined))
  if (physicalBinary === undefined || !binStat?.isFile()) return stopped("binary-missing")
  const cargo = Bun.which("cargo")
  if (!cargo) return stopped("cargo-missing")
  const selected = changedRows(input, context.hunks)
  if (selected === "mismatch") return stopped("source-mismatch")
  if (selected.length === 0) return stopped("no-changed-lines")
  const source = Bun.file(physical)
  if (source.size > 16 * 1024 * 1024) return stopped("source-budget")
  const text = yield* Effect.promise(() => source.text().catch(() => undefined))
  const lines = text?.split("\n")
  if (text === undefined || selected.some((row) => lines?.[row.line - 1] !== row.text)) return stopped("source-mismatch")
  return { binary: physicalBinary, cargo, lines: new Set(selected.map((row) => row.line)), diff: renderDiff(input.path, selected) } satisfies Ready
})

const drive = Effect.fnUntraced(function* (input: ReviewProbeTargets.Mutants, ready: Ready, dir: string, context: RunContext) {
  const deadline = Date.now() + context.timeoutSeconds * 1000
  const diffPath = path.join(dir, "changed.diff")
  const out = path.join(dir, "out")
  yield* Effect.promise(() => Bun.write(diffPath, ready.diff))
  const versionArgv = [ready.binary, "mutants", "--version"]
  const version = yield* launch(versionArgv, ready, dir, context, deadline, ready.diff)
  const steps = [version]
  if (version.status !== "pass" || version.stdout.trim() !== `cargo-mutants ${VERSION}`)
    return stopped(version.status === "not-run" ? version.reason ?? "process-failed" : "version-mismatch", version.status === "pass" ? [{ ...version, status: "not-run", reason: "version-mismatch" }] : steps)
  const listArgv = closed(ready.binary, context.head.root, diffPath, out, context.timeoutSeconds, true)
  const list = yield* launch(listArgv, ready, dir, context, deadline, "")
  const listedSteps = [...steps, list]
  if (list.status === "not-run") return stopped(list.reason ?? "process-failed", listedSteps)
  // cargo-mutants exits successfully before JSON output when the diff intersects no mutants.
  if (list.exitCode === 0 && list.stdout.trim() === "") return stopped("no-mutants", listedSteps)
  const listed = Schema.decodeUnknownOption(Schema.UnknownFromJsonString)(list.stdout.trim()).pipe(
    Option.flatMap((value) => Schema.decodeUnknownOption(ReviewMutantsReport.List)(value, { onExcessProperty: "ignore" })),
  )
  if (Option.isNone(listed) || list.exitCode !== 0) return stopped("invalid-report", listedSteps)
  if (listed.value.length > 64) return stopped("mutant-budget", listedSteps)
  if (listed.value.length === 0) return stopped("no-mutants", listedSteps)
  if (!listedOk(listed.value, input.path, ready.lines)) return stopped("invalid-report", listedSteps)
  const runArgv = closed(ready.binary, context.head.root, diffPath, out, context.timeoutSeconds, false)
  const mutants = yield* launch(runArgv, ready, dir, context, deadline, "")
  const ran = [...listedSteps, mutants]
  if (mutants.status === "not-run") return stopped(mutants.reason ?? "process-failed", ran)
  const owned = yield* Effect.uninterruptible(Effect.promise(() => readOwned(dir, path.join(out, "mutants.out", "outcomes.json"))))
  const parsed = ReviewMutantsReport.parse(owned ?? "", listed.value, mutants.exitCode ?? -1)
  const stdout = parsed.report === undefined ? mutants.stdout : `${mutants.stdout}\n${JSON.stringify({ kind: "mutants-report", report: parsed.report })}`
  const settled = { ...mutants, status: parsed.status, reason: parsed.reason, stdout }
  return { status: parsed.status, reason: parsed.reason, steps: [...listedSteps, settled] }
})

const launch = Effect.fnUntraced(function* (argv: ReadonlyArray<string>, ready: Ready, dir: string, context: RunContext, deadline: number, stderrPrefix: string) {
  const left = deadline - Date.now()
  if (left <= 0) return step(argv[1] === "mutants" && argv[2] === "--version" ? "version" : argv.at(-1) === "--json" ? "list" : "mutants", "not-run", argv, "", stderrPrefix, "timeout")
  const launchEnv = childEnv(ready.cargo, dir)
  const confined = yield* ToolSafetySandbox.confine({ command: argv[0], args: argv.slice(1), cwd: dir, env: launchEnv, write: [dir] }).pipe(Effect.mapError((error) => denied(`sandbox-unavailable: ${error.reason}`)))
  const outcome = yield* ResearchProcess.run({
    command: confined.command,
    args: confined.args,
    cwd: dir,
    env: launched(confined.env, ready.cargo, dir),
    timeoutMs: left,
    maxBytes: Probe.Limits.outputBytes,
    maxRssBytes: Probe.Limits.rssBytes,
  })
  const stdout = outcome.stdout.data.toString("utf8")
  const stderr = `${stderrPrefix}${outcome.stderr.data.toString("utf8")}`
  const guard = ReviewProbeRuntime.verdict(outcome, `${stdout}\n${stderr}`)
  const label = argv[2] === "--version" ? "version" : argv.at(-1) === "--json" ? "list" : "mutants"
  return step(label, guard.status, argv, stdout, stderr, guard.reason, outcome.exitCode ?? undefined)
})

function listedOk(listed: ReviewMutantsReport.Listed, file: string, lines: ReadonlySet<number>) {
  const names = new Set<string>()
  return listed.every((row) => {
    if (names.has(row.name) || row.file !== file || !overlaps(row.span, lines)) return false
    names.add(row.name)
    return true
  })
}

function overlaps(span: ReviewMutantsReport.Listed[number]["span"], lines: ReadonlySet<number>) {
  const end = span.end.column === 1 ? span.end.line - 1 : span.end.line
  return [...lines].some((line) => span.start.line <= line && line <= end)
}

function changedRows(input: ReviewProbeTargets.Mutants, hunks: ReadonlyArray<ReviewScratch.Hunk>): Row[] | "mismatch" {
  const rows: Row[] = []
  for (const hunk of hunks) {
    if (hunk.path !== input.path) continue
    if (!Number.isSafeInteger(hunk.line) || hunk.line < 1) return "mismatch"
    for (let index = 0; index < hunk.current.length; index++) {
      const line = hunk.line + index
      if (line < input.startLine || line > input.endLine || hunk.original[index] === hunk.current[index]) continue
      rows.push({ line, text: hunk.current[index] })
    }
  }
  return rows
}

function renderDiff(file: string, rows: ReadonlyArray<Row>) {
  const parts = ["--- /dev/null", `+++ b/${file}`]
  let index = 0
  while (index < rows.length) {
    const start = rows[index].line
    const body: string[] = []
    while (index < rows.length && rows[index].line === start + body.length) {
      body.push(`+${rows[index].text}`)
      index++
    }
    parts.push(`@@ -0,0 +${start},${body.length} @@`, ...body)
  }
  return `${parts.join("\n")}\n`
}

function closed(binary: string, root: string, diff: string, out: string, seconds: number, list: boolean) {
  const argv = [binary, "mutants", "--no-config", "--dir", root, "--in-diff", diff, "--output", out, "--no-shuffle", "--timeout", String(seconds), "--build-timeout", String(seconds), "--cargo-arg=--offline", "--cargo-arg=--locked"]
  return list ? [...argv, "--list", "--json"] : argv
}

function childEnv(cargo: string, dir: string) {
  const env = ResearchProcess.environment()
  for (const key of Object.keys(env)) if (key.startsWith("CARGO_MUTANTS_") || key === "RUSTC_WRAPPER" || key === "CARGO" || key === "RUSTFLAGS") delete env[key]
  return { ...env, CARGO: cargo, CARGO_NET_OFFLINE: "true", CARGO_INCREMENTAL: "0", CARGO_TARGET_DIR: path.join(dir, "target") }
}

function launched(env: NodeJS.ProcessEnv, cargo: string, dir: string) {
  const next: Record<string, string> = {}
  for (const [key, value] of Object.entries(env)) {
    if (value === undefined || key.startsWith("CARGO_MUTANTS_") || key === "RUSTC_WRAPPER" || key === "RUSTFLAGS" || key === "CARGO") continue
    next[key] = value
  }
  next.CARGO = cargo
  next.CARGO_NET_OFFLINE = "true"
  next.CARGO_INCREMENTAL = "0"
  next.CARGO_TARGET_DIR = path.join(dir, "target")
  return next
}

async function readOwned(root: string, file: string) {
  const top = await realpath(root).catch(() => undefined)
  if (top === undefined) return undefined
  let cursor = file
  while (cursor === top || cursor.startsWith(`${top}${path.sep}`)) {
    const stat = await lstat(cursor).catch(() => undefined)
    if (!stat || stat.isSymbolicLink()) return undefined
    if (cursor === top) break
    cursor = path.dirname(cursor)
  }
  const stat = await lstat(file).catch(() => undefined)
  if (!stat?.isFile() || stat.size > Probe.Limits.outputBytes) return undefined
  const physical = await realpath(file).catch(() => undefined)
  if (physical === undefined || !physical.startsWith(`${top}${path.sep}`)) return undefined
  const handle = await open(physical, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0) | (constants.O_NONBLOCK ?? 0)).catch(() => undefined)
  if (!handle) return undefined
  return (async () => {
    const before = await handle.stat()
    if (!before.isFile() || before.ino !== stat.ino || before.dev !== stat.dev || before.size !== stat.size) return undefined
    const buffer = Buffer.alloc(before.size + 1)
    const read = await handle.read(buffer, 0, buffer.byteLength, 0)
    const after = await handle.stat()
    if (read.bytesRead !== before.size || after.size !== before.size || await realpath(file) !== physical) return undefined
    return buffer.subarray(0, read.bytesRead).toString("utf8")
  })().catch(() => undefined).finally(() => handle.close())
}

function unsafe(file: string) {
  if (path.isAbsolute(file) || path.win32.isAbsolute(file) || /^[A-Za-z]:/.test(file) || file.includes("\\") || /[\0\r\n]/.test(file) || !file.endsWith(".rs")) return true
  return file.split("/").some((part) => part === "" || part === "." || part === ".." || part === ".git" || part === "node_modules" || part === "vendor")
}

function step(label: string, status: ReviewProbeRuntime.Status, argv: ReadonlyArray<string>, stdout: string, stderr: string, reason?: string, exitCode?: number): ReviewProbeRuntime.Step {
  return { label, status, reason, exitCode, argv, stdout, stderr }
}

function stopped(reason: string, steps: ReadonlyArray<ReviewProbeRuntime.Step> = []): ReviewProbeRuntime.Result {
  return { status: "not-run", reason, steps }
}
