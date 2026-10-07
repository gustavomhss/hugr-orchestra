import { Effect, Fiber, Ref, Scope } from "effect"
import { AppNodeBuilder } from "@opencode-ai/core/effect/app-node-builder"
import { AppProcess } from "@opencode-ai/core/process"
import { GlobalBus } from "@/bus/global"
import { defaultConfig, loop, makeState, type ReportEvent, type SchedulerConfig } from "./scheduler"
import { clearLatestReport, setLatestReport } from "./report-state"
import { scan } from "./scan"

export const EventType = "janitor.report" as const

let janitorUsers = 0
let janitorFiber: ReturnType<typeof Effect.runFork> | undefined

export function enabled(env: Record<string, string | undefined>) {
  return env.OPENCODE_JANITOR !== "0"
}

export function configFromEnv(env: Record<string, string | undefined>): SchedulerConfig {
  const base = defaultConfig()
  const raw = Number(env.OPENCODE_JANITOR_INTERVAL_MIN)
  if (!Number.isFinite(raw)) return base
  return { ...base, intervalMinutes: raw }
}

function emit(event: ReportEvent) {
  return Effect.sync(() => {
    setLatestReport(event.report)
    GlobalBus.emit("event", {
      directory: "global",
      payload: { type: EventType, properties: event },
    })
  })
}

export const startJanitorLoop = Effect.fn("Janitor.start")(function* (
  scope: Scope.Scope,
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
  janitorFiber = yield* loop(scan(), config, ref, emit).pipe(
    Effect.provide(AppNodeBuilder.build(AppProcess.node)),
    Effect.forkDetach,
  )
})
