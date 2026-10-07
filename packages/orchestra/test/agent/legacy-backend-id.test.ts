import { afterEach, describe, expect } from "bun:test"
import { LayerNode } from "@orchestra/core/effect/layer-node"
import { SessionV1 } from "@orchestra/core/v1/session"
import { Effect } from "effect"
import { Agent } from "../../src/agent/agent"
import { Auth } from "../../src/auth"
import { Config } from "../../src/config/config"
import { RuntimeFlags } from "../../src/effect/runtime-flags"
import { EventV2Bridge } from "../../src/event-v2-bridge"
import { Plugin } from "../../src/plugin"
import { Provider } from "../../src/provider/provider"
import { Session } from "../../src/session/session"
import { Skill } from "../../src/skill"
import { BACKEND_DEFAULT_LABEL, LEGACY_BACKEND_ID } from "../../src/maestro/roster"
import { disposeAllInstances } from "../fixture/fixture"
import { testEffect } from "../lib/effect"

// Data and config written before the backend seat got its stable id name it by its former id, which is derived here
// from the default label and never spelled.

const it = testEffect(
  LayerNode.compile(
    LayerNode.group([
      Agent.node,
      Plugin.node,
      Provider.node,
      Auth.node,
      Config.node,
      Skill.node,
      Session.node,
      RuntimeFlags.node,
      EventV2Bridge.node,
    ]),
    [[RuntimeFlags.node, RuntimeFlags.layer({})]],
  ),
)

afterEach(async () => {
  await disposeAllInstances()
})

// Resolves agent state while recording configuration errors published on the Session error channel.
const resolve = Effect.fn("LegacyBackendIdTest.resolve")(function* () {
  const events = yield* EventV2Bridge.Service
  const agents = yield* Agent.Service
  const errors: unknown[] = []
  yield* events.listen((event) => {
    if (event.type !== SessionV1.Event.Error.type) return Effect.void
    const error = (event.data as typeof SessionV1.Event.Error.data.Type).error
    if (error && "message" in error.data) errors.push(error.data.message)
    return Effect.void
  })
  return { backend: yield* agents.get("backend"), list: yield* agents.list(), errors }
})

describe("legacy backend id", () => {
  it.instance("a stored Session and message agent naming the former id resolve to the backend seat", () =>
    Effect.gen(function* () {
      const sessions = yield* Session.Service
      const agents = yield* Agent.Service
      const stored = yield* sessions.create({ title: "before the rename", agent: LEGACY_BACKEND_ID })
      expect(stored.agent).toBe(LEGACY_BACKEND_ID)
      const agent = yield* agents.get(stored.agent ?? "")
      expect(agent).toMatchObject({ id: "backend", name: BACKEND_DEFAULT_LABEL, native: true })
      expect(agent).toBe(yield* agents.get("backend"))
      // Only the exact former id is an alias; the display label still never identifies an agent.
      expect(yield* agents.get(BACKEND_DEFAULT_LABEL)).toBeUndefined()
      expect((yield* agents.list()).filter((item) => item.id === LEGACY_BACKEND_ID)).toEqual([])
    }),
  )

  it.instance(
    "the former config key configures the backend seat with a deprecation warning",
    () =>
      Effect.gen(function* () {
        const result = yield* resolve()
        expect(result.backend).toMatchObject({
          id: "backend",
          name: "Pikachu",
          model: { providerID: "openai", modelID: "gpt-5" },
          variant: "high",
          temperature: 0.2,
          native: true,
        })
        expect(result.list.filter((agent) => agent.id === LEGACY_BACKEND_ID)).toEqual([])
        expect(result.errors).toEqual([
          `Deprecated configuration agent.${LEGACY_BACKEND_ID}: rename it to agent.backend.`,
        ])
      }),
    {
      config: {
        agent: {
          [LEGACY_BACKEND_ID]: { name: "Pikachu", model: "openai/gpt-5", variant: "high", temperature: 0.2 },
        },
      },
    },
  )

  it.instance(
    "an invalid label under the former key is reported under that key",
    () =>
      Effect.gen(function* () {
        const result = yield* resolve()
        expect(result.backend.name).toBe(BACKEND_DEFAULT_LABEL)
        expect(result.errors).toHaveLength(2)
        expect(result.errors[1]).toStartWith(`Invalid configuration agent.${LEGACY_BACKEND_ID}.name: label `)
      }),
    { config: { agent: { [LEGACY_BACKEND_ID]: { name: "MAESTRO" } } } },
  )

  it.instance(
    "agent.backend wins over the former key and the warning says so",
    () =>
      Effect.gen(function* () {
        const result = yield* resolve()
        expect(result.backend).toMatchObject({ id: "backend", name: "Raichu", temperature: 0.7 })
        expect(result.backend.model).toBeUndefined()
        expect(result.errors).toEqual([
          `Deprecated configuration agent.${LEGACY_BACKEND_ID} is ignored: agent.backend is also set and takes precedence.`,
        ])
      }),
    {
      config: {
        agent: {
          [LEGACY_BACKEND_ID]: { name: "Pikachu", model: "openai/gpt-5", temperature: 0.2 },
          backend: { name: "Raichu", temperature: 0.7 },
        },
      },
    },
  )
})
