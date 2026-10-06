export * as GateCheck from "./check"

import { mkdir, rmdir, stat } from "node:fs/promises"
import path from "node:path"
import { Effect, Schema } from "effect"
import type { RelayArm } from "@opencode-ai/schema/relay-arm"
import type { RelaySprint } from "@opencode-ai/schema/relay-sprint"
import type { GateShell } from "./shell"
import { GateControl } from "./control"
import type { JudgeConfig } from "../judge/config"

// `relay-gate check` (WP3): the dry "Check now" and the hook verify precondition. It grades the selected WP's
// checklist and never charges retries, advances or records a verdict.

export class Busy extends Schema.TaggedErrorClass<Busy>()("GateCheck.Busy", { lock: Schema.String }) {}

export interface Input {
  readonly sprint: RelaySprint.Sprint
  readonly workdir: string
  // A named position (exact ID first, then the suffix after the first dot) overrides `counter`.
  readonly position?: string
  // Absent: the state directory's `counter` file, else 0.
  readonly counter?: number
  // An explicit "" suppresses any fallback and makes diff controls unavailable. Absent: the state directory's
  // `base_ref` file, else none.
  readonly baseRef?: string
  readonly params: Readonly<Record<string, string>>
  // A state directory whose `.run.lock` is held for the check; omitted for a document dry check.
  readonly stateDir?: string
}

export const check = (
  input: Input,
): Effect.Effect<
  RelayArm.CheckOutcome,
  Busy | GateControl.PlanError,
  GateShell.Service | GateShell.Git | JudgeConfig.Service
> =>
  Effect.gen(function* () {
    // Checked before the lock, like the CLI's argument validation.
    const workdir = yield* Effect.promise(() => stat(input.workdir).catch(() => undefined))
    if (!workdir?.isDirectory())
      return yield* new GateControl.PlanError({ message: `relay-gate: workdir not found: ${input.workdir}` })
    const stateDir = input.stateDir
    if (stateDir === undefined) return yield* evaluate(input)
    // One evaluation at a time per state directory; a held lock is reported, never queued.
    const lock = path.join(stateDir, ".run.lock")
    return yield* Effect.acquireUseRelease(
      Effect.promise(() => mkdir(stateDir, { recursive: true })).pipe(
        Effect.andThen(Effect.tryPromise({ try: () => mkdir(lock), catch: () => new Busy({ lock }) })),
      ),
      () => evaluate(input),
      () => Effect.promise(() => rmdir(lock).catch(() => undefined)),
    )
  })

const evaluate = (input: Input) =>
  Effect.gen(function* () {
    const plan = input.sprint.work_packages
    const position = input.position
    if (position !== undefined) {
      const named = locate(plan, position)
      if (named === undefined) return { outcome: "error" as const, error: "unknown-position" as const, position }
      return yield* grade(input, named)
    }
    const counter = yield* current(input)
    // Already complete; a named position deliberately bypasses this observation.
    if (counter >= plan.length) return { outcome: "complete" as const, i: counter }
    return yield* grade(input, counter)
  })

const grade = (input: Input, i: number) =>
  Effect.gen(function* () {
    const wp = input.sprint.work_packages[i]!
    const id = GateControl.text(wp.id)
    if (!id)
      return yield* new GateControl.PlanError({ message: "relay-gate: WP id must be a nonempty NUL-free string" })
    const macro = GateControl.text(wp.macro)
    if (macro === undefined)
      return yield* new GateControl.PlanError({ message: "relay-gate: WP macro must be a NUL-free string or null" })
    const baseRef = input.baseRef ?? (yield* stateFile(input.stateDir, "base_ref", ""))
    const result = yield* GateControl.run(
      { sprint: input.sprint, index: i, workdir: input.workdir, baseRef, params: input.params, hostCheck: "fail" },
      () => Effect.void,
    )
    // The CLI joins the IDs with "; ", loses trailing LF to `$(…)` and splits again, and so does this.
    const fails = GateControl.fails(result.failing).replace(/^; /, "")
    return {
      outcome: "check" as const,
      i,
      wp: id,
      failing: fails === "" ? [] : fails.split("; "),
      ...(macro ? { macro } : {}),
    }
  })

// The shared resolver: the whole ID first, then the suffix after the first dot.
function locate(plan: ReadonlyArray<RelaySprint.WorkPackage>, position: string) {
  const ids = plan.map((wp) => wp.id)
  const whole = ids.indexOf(position)
  if (whole !== -1) return whole
  const suffix = ids.indexOf(position.slice(position.indexOf(".") + 1))
  return suffix === -1 ? undefined : suffix
}

// A negative or non-integer counter is a plan error (PARITY-EXCEPTIONS WP3-6).
const current = (input: Input) =>
  Effect.gen(function* () {
    const value = input.counter === undefined ? yield* stateFile(input.stateDir, "counter", "0") : String(input.counter)
    if (!/^\s*\d+\s*$/.test(value))
      return yield* new GateControl.PlanError({ message: `relay-gate: counter is not a nonnegative integer: ${value}` })
    return Number(value)
  })

// `$(cat <state>/<name> 2>/dev/null || echo <fallback>)`.
function stateFile(stateDir: string | undefined, name: string, fallback: string) {
  if (stateDir === undefined) return Effect.succeed(fallback)
  return Effect.promise(() =>
    Bun.file(path.join(stateDir, name))
      .text()
      .then(
        (value) => value.replace(/\n+$/, ""),
        () => fallback,
      ),
  )
}
