import { afterEach, describe, expect } from "bun:test"
import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { SessionV1 } from "@opencode-ai/core/v1/session"
import { Effect } from "effect"
import { Agent } from "../../src/agent/agent"
import { Auth } from "../../src/auth"
import { Config } from "../../src/config/config"
import { RuntimeFlags } from "../../src/effect/runtime-flags"
import { EventV2Bridge } from "../../src/event-v2-bridge"
import { Permission } from "../../src/permission"
import { Plugin } from "../../src/plugin"
import { Provider } from "../../src/provider/provider"
import { Skill } from "../../src/skill"
import { BACKEND_DEFAULT_LABEL, backendSkills } from "../../src/maestro/roster"
import { disposeAllInstances } from "../fixture/fixture"
import { testEffect } from "../lib/effect"

// F1.2-F1.3, F1-D1, F1-D2: a native seat's label is presentation only and resolves once from config or env.

const nodes = [
  Agent.node,
  Plugin.node,
  Provider.node,
  Auth.node,
  Config.node,
  Skill.node,
  RuntimeFlags.node,
  EventV2Bridge.node,
] as const
const it = testEffect(LayerNode.compile(LayerNode.group([...nodes]), [[RuntimeFlags.node, RuntimeFlags.layer({})]]))
const withEnv = (backendName: string) =>
  testEffect(LayerNode.compile(LayerNode.group([...nodes]), [[RuntimeFlags.node, RuntimeFlags.layer({ backendName })]]))

afterEach(async () => {
  await disposeAllInstances()
})

// Resolves agent state while recording configuration errors published on the existing Session error channel.
const resolve = Effect.fn("NativeSeatLabelTest.resolve")(function* (id: string) {
  const events = yield* EventV2Bridge.Service
  const agents = yield* Agent.Service
  const errors: { name: string; message: unknown }[] = []
  yield* events.listen((event) => {
    if (event.type !== SessionV1.Event.Error.type) return Effect.void
    const error = (event.data as typeof SessionV1.Event.Error.data.Type).error
    if (error) errors.push({ name: error.name, message: "message" in error.data ? error.data.message : undefined })
    return Effect.void
  })
  const agent = yield* agents.get(id)
  const list = yield* agents.list()
  return { agent, list, errors }
})

const allowedSkills = (agent: Agent.Info) =>
  backendSkills.names.filter((name) => Permission.evaluate("skill", name, agent.permission).action === "allow")

describe("native seat label", () => {
  it.instance("defaults to the roster display name", () =>
    Effect.gen(function* () {
      const result = yield* resolve("backend")
      expect(result.agent).toMatchObject({ id: "backend", name: BACKEND_DEFAULT_LABEL, mode: "all", native: true })
      expect(result.errors).toEqual([])
    }),
  )

  it.instance(
    "config name renames the seat and keeps its identity, permissions and skills",
    () =>
      Effect.gen(function* () {
        const result = yield* resolve("backend")
        expect(result.agent).toMatchObject({ id: "backend", name: "Pikachu", mode: "all", native: true })
        expect(result.agent.prompt).toStartWith("You are the backend implementation specialist")
        expect(result.agent.prompt).not.toContain("Pikachu")
        expect(allowedSkills(result.agent)).toEqual([...backendSkills.names])
        expect(Permission.evaluate("task", "*", result.agent.permission).action).toBe("deny")
        expect(Permission.evaluate("edit", "src/a.go", result.agent.permission).action).toBe("allow")
        expect(result.list.filter((agent) => agent.id === "backend").map((agent) => agent.name)).toEqual(["Pikachu"])
        expect(yield* Agent.Service.use((service) => service.get("Pikachu"))).toBeUndefined()
        expect(yield* Agent.Service.use((service) => service.get(BACKEND_DEFAULT_LABEL))).toBeUndefined()
        expect(result.errors).toEqual([])
      }),
    { config: { agent: { backend: { name: "  Pikachu  " } } } },
  )

  it.instance(
    "Maestro's name is fixed: a configured name is ignored with a warning",
    () =>
      Effect.gen(function* () {
        const result = yield* resolve("maestro")
        expect(result.agent).toMatchObject({ id: "maestro", name: "maestro" })
        expect(result.errors).toEqual([
          { name: "UnknownError", message: "Configuration agent.maestro.name is ignored: Maestro's name is fixed." },
        ])
      }),
    { config: { agent: { maestro: { name: "Boss" } } } },
  )

  it.instance(
    "the mechanism is generic for every native seat and renders the charter label",
    () =>
      Effect.gen(function* () {
        const result = yield* resolve("patty")
        expect(result.agent).toMatchObject({ id: "patty", name: "Mãe", mode: "subagent", native: true })
        expect(result.agent.prompt).toStartWith("You are Mãe, frontend execution specialist.")
        expect(result.agent.description).toBe("Mãe native team specialist.")
        const lucy = yield* Agent.Service.use((service) => service.get("lucy"))
        expect(lucy.prompt).toStartWith("You are Lucy, cold code reviewer.")
      }),
    { config: { agent: { patty: { name: "Mãe" } } } },
  )

  withEnv("Pikachu").instance(
    "HUGR_BACKEND_NAME overrides the config label for the backend seat only",
    () =>
      Effect.gen(function* () {
        const result = yield* resolve("backend")
        expect(result.agent).toMatchObject({ id: "backend", name: "Pikachu" })
        const patty = yield* Agent.Service.use((service) => service.get("patty"))
        expect(patty.name).toBe("Patty")
        expect(result.errors).toEqual([])
      }),
    { config: { agent: { backend: { name: "Raichu" } } } },
  )

  for (const [name, label] of [
    ["empty", "   "],
    ["too long", "x".repeat(41)],
    ["multi-line", "Pika\nchu"],
    ["a control character", "Pika\u0007chu"],
    ["another seat's label", "lucy"],
    ["another agent's id", "Explore"],
    ["a custom agent's label", "reviewer bot"],
    ["a reserved id", "MAESTRO"],
    ["a reserved id that is not registered", "Title"],
  ] as const) {
    it.instance(
      `rejects ${name} and keeps the default label with a configuration error`,
      () =>
        Effect.gen(function* () {
          const result = yield* resolve("backend")
          expect(result.agent).toMatchObject({ id: "backend", name: BACKEND_DEFAULT_LABEL, mode: "all" })
          expect(result.errors).toHaveLength(1)
          expect(result.errors[0]?.name).toBe("UnknownError")
          expect(result.errors[0]?.message).toStartWith("Invalid configuration agent.backend.name: label ")
        }),
      { config: { agent: { backend: { name: label }, custom: { name: "Reviewer Bot" } } } },
    )
  }

  withEnv(" ").instance("rejects an invalid HUGR_BACKEND_NAME without failing startup", () =>
    Effect.gen(function* () {
      const result = yield* resolve("backend")
      expect(result.agent.name).toBe(BACKEND_DEFAULT_LABEL)
      expect(result.errors).toEqual([
        { name: "UnknownError", message: `Invalid configuration HUGR_BACKEND_NAME: label empty. Using "${BACKEND_DEFAULT_LABEL}".` },
      ])
    }),
  )

  it.instance(
    "accepts 40 characters and the seat's own id",
    () =>
      Effect.gen(function* () {
        const result = yield* resolve("backend")
        expect(result.agent.name).toBe("x".repeat(40))
        expect((yield* Agent.Service.use((service) => service.get("rosie"))).name).toBe("ROSIE")
        expect(result.errors).toEqual([])
      }),
    { config: { agent: { backend: { name: "x".repeat(40) }, rosie: { name: "ROSIE" } } } },
  )
})
