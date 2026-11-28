export * as ReviewProbeRuntime from "./probe-runtime"

import path from "path"
import { mkdtemp, rm } from "fs/promises"
import { Effect } from "effect"
import { Reference } from "effect/Context"
import { ToolSafetySandbox } from "../tool-safety-sandbox"
import { ResearchProcess } from "../research-toolkit/process"
import { ProbeRun } from "../research-toolkit/probe/run"
import { ProbeRunners } from "../research-toolkit/probe/runners"
import { Probe } from "../research-toolkit/probe/types"
import { denied } from "../research-toolkit/probe/assets"
import type { ReviewScratch } from "./scratch-copy"

/** IO boundary used to hold a real cleanup while testing the host permit's release order. */
export const Cleanup = Reference<(directory: string) => Promise<void>>("@orchestra/ReviewProbeRuntime/Cleanup", {
  defaultValue: () => (directory) => rm(directory, { recursive: true, force: true }),
})

export type Status = "pass" | "fail" | "not-run"
export type Context = {
  readonly head: ReviewScratch.Snapshot
  readonly base?: ReviewScratch.Snapshot
  readonly timeoutSeconds: number
}
export type Result = { readonly status: Status; readonly reason?: string; readonly steps: ReadonlyArray<Step> }

export type Step = {
  readonly label: string
  readonly status: Status
  readonly reason?: string
  readonly exitCode?: number
  readonly argv: ReadonlyArray<string>
  readonly stdout: string
  readonly stderr: string
}

/** One closed runner in a copy, confined: no network, writes only to the confine's own scratch. */
export const step = Effect.fnUntraced(function* (label: Step["label"], copy: ReviewScratch.Snapshot, runner: Probe.ProbeInput["runner"], context: Context, race = false) {
  // A fresh directory per run for the runner's script and version checks; the copy itself stays as taken.
  const cleanup = yield* Cleanup
  const scratch = yield* Effect.promise(() => mkdtemp(path.join(copy.scratch, "probe-")))
  const env = ResearchProcess.environment()
  return yield* Effect.gen(function* () {
    const plan = yield* ProbeRunners.plan({ runner, snapshot: copy, scratch, heapMiB: Probe.Limits.heapMiB, env, race })
    const launch = yield* ToolSafetySandbox.confine({ command: plan.argv[0], args: plan.argv.slice(1), cwd: plan.cwd, env: { ...env, ...plan.env }, write: [] })
      .pipe(Effect.mapError((error) => denied(`sandbox-unavailable: ${error.reason}`)))
    const outcome = yield* ResearchProcess.run({
      command: launch.command, args: launch.args, cwd: plan.cwd,
      env: Object.fromEntries(Object.entries(launch.env).filter((entry): entry is [string, string] => entry[1] !== undefined)),
      timeoutMs: context.timeoutSeconds * 1000, maxBytes: Probe.Limits.outputBytes, maxRssBytes: Probe.Limits.rssBytes,
    })
    const stdout = outcome.stdout.data.toString("utf8")
    const stderr = outcome.stderr.data.toString("utf8")
    const argv = plan.argv.map((arg) => arg.split(copy.scratch).join("<scratch>"))
    const settled = verdict(outcome, `${stdout}\n${stderr}`)
    return { label, ...settled, exitCode: outcome.exitCode ?? undefined, argv, stdout, stderr } satisfies Step
  }).pipe(
    // A missing toolchain or runner, a path outside the copy, or no jail: the probe could not run.
    Effect.catchTag("Probe.Error", (error) => Effect.succeed(notRun(error.reason, label))),
    Effect.ensuring(Effect.promise(() => cleanup(scratch))),
  )
})

export function verdict(outcome: ResearchProcess.Outcome, text: string): { status: Status; reason?: string } {
  if (outcome.timedOut) return { status: "not-run", reason: "timeout" }
  if (outcome.memoryExceeded) return { status: "not-run", reason: "memory-exceeded" }
  if (outcome.overflow) return { status: "not-run", reason: "output-cap" }
  if (outcome.failure !== undefined) return { status: "not-run", reason: `process-failed: ${outcome.failure}` }
  // R2: a repository that refuses local tests leaves fail-before/pass-after unavailable, never a failure.
  if (text.includes(ProbeRun.GUARD)) return { status: "not-run", reason: `repo-guard: ${ProbeRun.GUARD}` }
  return { status: outcome.exitCode === 0 ? "pass" : "fail" }
}

export function notRun(reason: string, label: Step["label"] = "head"): Step {
  return { label, status: "not-run", reason, argv: [], stdout: "", stderr: "" }
}
