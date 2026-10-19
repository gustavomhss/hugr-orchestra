import { describe, expect, test } from "bun:test"
import { Effect, Exit, Scope } from "effect"
import { EventType, configFromEnv, enabled, startJanitorLoop } from "./bootstrap"
import type { ReportEvent } from "./scheduler"

describe("janitor bootstrap", () => {
  test("loads module graph and exposes event type", () => {
    expect(EventType).toBe("janitor.report")
  })

  test("disables via env kill-switch", () => {
    expect(enabled({})).toBe(true)
    expect(enabled({ ORCHESTRA_JANITOR: "0" })).toBe(false)
    expect(enabled({ ORCHESTRA_JANITOR: "1" })).toBe(true)
  })

  test("parses interval minutes with fallback", () => {
    expect(configFromEnv({}).intervalMinutes).toBe(15)
    expect(configFromEnv({ ORCHESTRA_JANITOR_INTERVAL_MIN: "30" }).intervalMinutes).toBe(30)
    expect(configFromEnv({ ORCHESTRA_JANITOR_INTERVAL_MIN: "junk" }).intervalMinutes).toBe(15)
  })

  test("kill-switch starts no loop and never reaches the sink", async () => {
    const events: ReportEvent[] = []
    const sink = (event: ReportEvent) => Effect.sync(() => void events.push(event))
    await Effect.runPromise(
      Effect.gen(function* () {
        const scope = yield* Scope.make()
        yield* startJanitorLoop(scope, sink, { ORCHESTRA_JANITOR: "0" })
        yield* Scope.close(scope, Exit.void)
      }),
    )
    expect(events).toEqual([])
  })
})
