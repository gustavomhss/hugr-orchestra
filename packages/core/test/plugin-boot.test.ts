import { expect } from "bun:test"
import { Cause, Effect, Exit } from "effect"
import { AgentV2 } from "@orchestra/core/agent"
import { PluginV2 } from "@orchestra/core/plugin"
import { PluginTestLayer } from "./plugin/fixture"
import { testEffect } from "./lib/effect"

const it = testEffect(PluginTestLayer)

it.effect("boot replays each transform once for the whole boot", () =>
  Effect.gen(function* () {
    const plugins = yield* PluginV2.Service
    const agents = yield* AgentV2.Service
    const runs: string[] = []
    yield* plugins.boot(
      ["boot-a", "boot-b", "boot-c"].map((name) => ({
        id: PluginV2.ID.make(name),
        effect: () =>
          agents
            .transform((draft) => {
              runs.push(name)
              draft.update(AgentV2.ID.make(name), (agent) => {
                agent.description = name
              })
            })
            .pipe(Effect.asVoid),
      })),
    )
    expect(runs).toEqual(["boot-a", "boot-b", "boot-c"])
    expect((yield* agents.get(AgentV2.ID.make("boot-c")))?.description).toBe("boot-c")
  }),
)
;(["effect", "late"] as const).forEach((failure) => {
  it.effect(`boot rolls back a plugin whose ${failure} failure aborts it and keeps earlier plugins usable`, () =>
    Effect.gen(function* () {
      const plugins = yield* PluginV2.Service
      const agents = yield* AgentV2.Service
      const plugin = (name: string, transform: () => void) => ({
        id: PluginV2.ID.make(`${failure}-${name}`),
        effect: () =>
          agents
            .transform((draft) => {
              transform()
              draft.update(AgentV2.ID.make(`${failure}-${name}`), (agent) => {
                agent.description = name
              })
            })
            .pipe(Effect.asVoid),
      })
      const bad = plugin("bad", () => {
        throw new Error("boot-late-boom")
      })
      const exit = yield* plugins
        .boot([
          plugin("good", () => {}),
          failure === "late"
            ? bad
            : { id: bad.id, effect: () => bad.effect().pipe(Effect.andThen(Effect.die("boot-effect-boom"))) },
          plugin("after", () => {}),
        ])
        .pipe(Effect.exit)
      expect(Exit.isFailure(exit)).toBe(true)
      if (Exit.isFailure(exit))
        expect(Cause.pretty(exit.cause)).toContain(failure === "late" ? "boot-late-boom" : "boot-effect-boom")
      expect((yield* agents.get(AgentV2.ID.make(`${failure}-good`)))?.description).toBe("good")
      expect(yield* agents.get(AgentV2.ID.make(`${failure}-bad`))).toBeUndefined()
      expect(yield* agents.get(AgentV2.ID.make(`${failure}-after`))).toBeUndefined()
      expect(Exit.isFailure(yield* plugins.wait(bad.id).pipe(Effect.exit))).toBe(true)
      yield* plugins.wait(PluginV2.ID.make(`${failure}-good`))
    }),
  )
})
