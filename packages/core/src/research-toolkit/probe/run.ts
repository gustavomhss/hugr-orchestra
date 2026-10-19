export * as ProbeRun from "./run"

import os from "os"
import path from "path"
import { mkdtemp, realpath, rm } from "fs/promises"
import { Duration, Effect, Option, Semaphore } from "effect"
import { Flag } from "../../flag/flag"
import { ToolSafetySandbox } from "../../tool-safety-sandbox"
import { ResearchProcess } from "../process"
import { Probe } from "./types"
import { ProbeError, denied } from "./assets"
import { ProbeRunners } from "./runners"
import { ProbeSnapshot } from "./snapshot"
import { ProbeTypecheck } from "./typecheck"

export { ProbeError } from "./assets"

// J4: one probe = a fresh snapshot in scratch, one closed runner, run inside ToolSafetySandbox.confine (no network,
// writes only to the confine's own scratch) through AppProcess/omni, with the result condensed for the model.

export type Context = {
  readonly worktree: string
  readonly executionSessionID: string
  readonly dispatchID: string
  /** What remains of the dispatch's probe allowance in seconds (J1.10); the probe never runs longer. */
  readonly remainingSeconds: number
  /** Adds --noUnusedLocals --noUnusedParameters to a typecheck (T-P3). */
  readonly unused?: boolean
  readonly heapMiB?: number
  readonly rssBytes?: number
  readonly queueSeconds?: number
}

/** The receipt URI the caller retains the result under (J4.9). */
export const uri = (executionSessionID: string, probeID: string) => `probe:${executionSessionID}/${probeID}`

/** The line script/test-guard.ts prints when a repository refuses local tests (J4.8). */
export const GUARD = "Local test runs are disabled in this repository"

const DIAGNOSTICS = 200

export const run = Effect.fn("Probe.run")(function* (input: Probe.ProbeInput, context: Context) {
  if (process.platform !== "darwin" && process.platform !== "linux")
    return yield* new ProbeError({ code: "probe_unsupported_platform", reason: process.platform })
  const seconds = Math.min(input.timeoutSeconds ?? context.remainingSeconds, context.remainingSeconds)
  if (!(seconds > 0)) return yield* denied("allowance-exhausted")
  yield* slot(context.dispatchID, context.queueSeconds ?? Probe.Limits.queueSeconds)
  const probeID = Bun.randomUUIDv7()
  const scratch = yield* Effect.acquireRelease(
    Effect.promise(() => mkdtemp(path.join(os.tmpdir(), "orchestra-probe-")).then((made) => realpath(made))),
    (directory) => Effect.promise(() => rm(directory, { recursive: true, force: true })),
  )
  const snapshot = yield* ProbeSnapshot.create({ worktree: context.worktree, snapshot: input.snapshot, scratch, maxBytes: Probe.Limits.scratchBytes })
  const env = ResearchProcess.environment()
  const plan = yield* ProbeRunners.plan({ runner: input.runner, snapshot, scratch, heapMiB: context.heapMiB ?? Probe.Limits.heapMiB, unused: context.unused, env })
  const launch = yield* ToolSafetySandbox.confine({ command: plan.argv[0], args: plan.argv.slice(1), cwd: plan.cwd, env: { ...env, ...plan.env }, write: [] }).pipe(
    Effect.mapError((error) => error.reason.startsWith("sandbox-platform-unsupported")
      ? new ProbeError({ code: "probe_unsupported_platform", reason: error.reason })
      : denied(`jail-unavailable: ${error.reason}`)))
  const outcome = yield* ResearchProcess.run({
    command: launch.command, args: launch.args, cwd: plan.cwd,
    env: Object.fromEntries(Object.entries(launch.env).filter((entry): entry is [string, string] => entry[1] !== undefined)),
    timeoutMs: seconds * 1000, maxBytes: Probe.Limits.outputBytes, maxRssBytes: context.rssBytes ?? Probe.Limits.rssBytes,
  })
  const stdout = outcome.stdout.data.toString("utf8")
  const stderr = outcome.stderr.data.toString("utf8")
  const diagnostics = plan.kind === "typecheck" ? ProbeTypecheck.parse(stdout, plan.cwd, snapshot) : undefined
  const shown = diagnostics?.slice(0, DIAGNOSTICS)
  const hidden = (diagnostics?.length ?? 0) - (shown?.length ?? 0)
  return {
    probeID,
    snapshot: { kind: snapshot.kind, revision: snapshot.revision, dirtyDigest: snapshot.dirtyDigest, files: snapshot.files },
    runner: { kind: plan.kind, binary: plan.binary, version: plan.version, argv: plan.argv },
    verdict: verdict(input.expect, outcome, `${stdout}\n${stderr}`, diagnostics),
    exitCode: outcome.exitCode,
    durationMs: outcome.durationMs,
    memoryCap: memoryCap(),
    // A typecheck's diagnostic lines are already structured: its tail leads with their causes and keeps only the rest.
    stdout: stream(outcome.stdout, diagnostics ? (line) => !ProbeTypecheck.structured(line) : undefined, [
      ...(diagnostics ? ProbeTypecheck.causes(diagnostics) : []),
      ...(hidden > 0 ? [`${hidden} more diagnostics not listed`] : []),
      ...(outcome.failure ? [outcome.failure] : []),
    ]),
    stderr: stream(outcome.stderr),
    diagnostics: shown,
    expect: input.expect,
  } satisfies Probe.ProbeResult
}, Effect.scoped)

/**
 * Omni enforces the RSS cap over the whole tree, a jail's workload included: under srt (linux) bubblewrap's
 * `--new-session` takes it out of omni's session, and omni counts it as the jail's descendant. The legacy spawner
 * bounds only the runner's heap (J4.7).
 */
export function memoryCap(): Probe.ProbeResult["memoryCap"] {
  return Flag.ORCHESTRA_EXPERIMENTAL_OMNI_SPAWNER !== "off" ? "rss" : "heap-only"
}

function verdict(expect: Probe.ProbeInput["expect"], outcome: ResearchProcess.Outcome, text: string, diagnostics?: ReadonlyArray<ProbeTypecheck.Diagnostic>): Probe.Verdict {
  if (outcome.timedOut) return "timeout"
  if (outcome.memoryExceeded) return "memory_exceeded"
  if (outcome.failure !== undefined || outcome.overflow) return "error"
  if (text.includes(GUARD)) return "blocked_by_repo_guard"
  if (!expect) return outcome.exitCode === 0 ? "passed" : "failed"
  const code = (value: string) => value.replace(/^TS/i, "")
  const met = (expect.exitCode === undefined || expect.exitCode === outcome.exitCode) &&
    (expect.stdoutIncludes === undefined || outcome.stdout.data.toString("utf8").includes(expect.stdoutIncludes)) &&
    (expect.stderrIncludes === undefined || outcome.stderr.data.toString("utf8").includes(expect.stderrIncludes)) &&
    (expect.diagnosticCode === undefined || (diagnostics ?? []).some((item) => code(item.code) === code(expect.diagnosticCode!)))
  return met ? "reproduced" : "not_reproduced"
}

const ANSI = /\x1b\[[0-9;?]*[ -/]*[@-~]/g

/** A condensed tail: no color codes, repeated lines folded, notes last, at most tailBytes. */
function stream(captured: ResearchProcess.Captured, keep?: (line: string) => boolean, notes: ReadonlyArray<string> = []): Probe.Stream {
  const lines = captured.data.toString("utf8").replace(ANSI, "").split(/\r?\n/).filter((line) => !keep || keep(line))
  const folded = lines.reduce<{ line: string; count: number }[]>((list, line) => {
    const last = list.at(-1)
    if (last && last.line === line) last.count++
    if (!last || last.line !== line) list.push({ line, count: 1 })
    return list
  }, []).map((entry) => (entry.count > 1 ? `${entry.line} (x${entry.count})` : entry.line))
  // The tail keeps the end, so the notes go last where truncation cannot drop them.
  const text = [...folded, ...notes].join("\n").trim()
  const tail = Buffer.from(text).subarray(-Probe.Limits.tailBytes).toString("utf8")
  return { tail, bytes: captured.bytes, truncated: captured.truncated || Buffer.byteLength(text) > Probe.Limits.tailBytes }
}

// J4.12: one probe at a time per dispatch, two per host; a waiter gives up after queueSeconds as busy.
const host = Semaphore.makeUnsafe(Probe.Limits.perHost)
const dispatches = new Map<string, { semaphore: Semaphore.Semaphore; users: number }>()

const slot = Effect.fnUntraced(function* (dispatchID: string, queueSeconds: number) {
  const entry = yield* Effect.acquireRelease(Effect.sync(() => {
    const found = dispatches.get(dispatchID) ?? { semaphore: Semaphore.makeUnsafe(Probe.Limits.perDispatch), users: 0 }
    found.users++
    dispatches.set(dispatchID, found)
    return found
  }), (found) => Effect.sync(() => {
    found.users--
    if (found.users === 0) dispatches.delete(dispatchID)
  }))
  // A permit's release is registered only once it is held; the wait itself stays interruptible.
  const deadline = Date.now() + queueSeconds * 1000
  const take = (semaphore: Semaphore.Semaphore) => Effect.gen(function* () {
    const got = yield* semaphore.take(1).pipe(Effect.timeoutOption(Duration.millis(Math.max(0, deadline - Date.now()))))
    if (Option.isSome(got)) yield* Effect.addFinalizer(() => semaphore.release(1))
    return Option.isSome(got)
  })
  if (!((yield* take(entry.semaphore)) && (yield* take(host)))) return yield* denied("busy")
})
