import { Effect, Fiber, Ref, Scope } from "effect"
import { AppNodeBuilder } from "@orchestra/core/effect/app-node-builder"
import { AppProcess } from "@orchestra/core/process"
import { defaultConfig, loop, makeState, type ReportEvent, type SchedulerConfig } from "./scheduler"
import { clearLatestReport, setLatestReport } from "./report-state"
import { scan } from "./scan"

export const EventType = "janitor.report" as const

export type Sink = (event: ReportEvent) => Effect.Effect<void>

let janitorUsers = 0
let janitorFiber: ReturnType<typeof Effect.runFork> | undefined

export function enabled(env: Record<string, string | undefined>) {
  return env.ORCHESTRA_JANITOR !== "0"
}

export function configFromEnv(env: Record<string, string | undefined>): SchedulerConfig {
  const base = defaultConfig()
  const raw = Number(env.ORCHESTRA_JANITOR_INTERVAL_MIN)
  if (!Number.isFinite(raw)) return base
  return { ...base, intervalMinutes: raw }
}

export const startJanitorLoop = Effect.fn("Janitor.start")(function* (
  scope: Scope.Scope,
  sink: Sink,
  env: Record<string, string | undefined> = process.env,
) {
  if (!enabled(env)) return
  janitorUsers += 1
  yield* Scope.addFinalizer(
    scope,
    Effect.gen(function* () {
      janitorUsers -= 1
      if (janitorUsers !== 0 || !janitorFiber) return
      const fiber = janitorFiber
      janitorFiber = undefined
      yield* Fiber.interrupt(fiber)
      clearLatestReport()
    }),
  )
  if (janitorFiber) return
  const config = configFromEnv(env)
  const ref = yield* Ref.make(makeState())
  const emit = (event: ReportEvent) =>
    Effect.sync(() => setLatestReport(event.report)).pipe(Effect.andThen(sink(event)))
  janitorFiber = yield* loop(scan(), config, ref, emit).pipe(
    Effect.provide(AppNodeBuilder.build(AppProcess.node)),
    Effect.forkDetach,
  )
})
