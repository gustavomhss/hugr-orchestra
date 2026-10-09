import { describe, expect } from "bun:test"
import { Cause, Effect, Exit, Schema } from "effect"
import { LayerNode } from "@orchestra/core/effect/layer-node"
import { FSUtil } from "@orchestra/core/fs-util"
import { ModelV2 } from "@orchestra/core/model"
import { ProviderV2 } from "@orchestra/core/provider"
import { MaestroArsenal } from "@orchestra/core/tool/maestro-arsenal"
import { Agent } from "@/agent/agent"
import { Config } from "@/config/config"
import { RuntimeFlags } from "@/effect/runtime-flags"
import { Permission } from "@/permission"
import { Session } from "@/session/session"
import { MessageID } from "@/session/schema"
import { Skill } from "@/skill"
import { MaestroArsenalTools } from "@/tool/maestro-arsenal"
import { ToolRegistry } from "@/tool/registry"
import { Tool } from "@/tool/tool"
import { Truncate } from "@/tool/truncate"
import { TestAppNodeBuilder } from "../fixture/app-node-builder"
import { testEffect } from "../lib/effect"

const it = testEffect(
  TestAppNodeBuilder.build(
    LayerNode.group([
      ToolRegistry.node,
      FSUtil.node,
      Config.node,
      Agent.node,
      Skill.node,
      Permission.node,
      Session.node,
      Truncate.node,
    ]),
    [[RuntimeFlags.node, RuntimeFlags.layer({ pure: true, disableDefaultPlugins: true, disableExternalSkills: true })]],
  ),
)

const model = { providerID: ProviderV2.ID.opencode, modelID: ModelV2.ID.make("test") }
const arsenalIDs = Object.values(MaestroArsenal.names).toSorted()
const plan = {
  items: [{ id: "AC-1", test: "The native upstream authoring call uses the real host." }],
  wps: [{ id: "WP-1", covers: ["AC-1"] }],
}
const CatalogPage = Schema.fromJsonString(
  Schema.Struct({
    capabilities: Schema.Array(Schema.Struct({ name: Schema.String, effects: Schema.Array(Schema.String) })),
    total: Schema.Number,
    offset: Schema.Number,
    next: Schema.NullOr(Schema.Number),
  }),
)
const ExecutionResult = Schema.fromJsonString(
  Schema.Struct({ content: Schema.Array(Schema.Struct({ type: Schema.Literal("text"), text: Schema.String })) }),
)

describe("V1 upstream Arsenal discovery and binding", () => {
  it.instance("offers only the three Arsenal IDs under actual exact native grants", () =>
    Effect.gen(function* () {
      const agents = yield* Agent.Service
      const registry = yield* ToolRegistry.Service
      const upstream = yield* agents.get("walt")
      requireUpstreamGrants(upstream)
      const ids = (yield* registry.tools({ ...model, agent: upstream })).map((tool) => tool.id)
      expect(ids.filter((id) => id.startsWith("maestro_")).toSorted()).toEqual(arsenalIDs)
      expect(ids.filter((id) => id.startsWith("atlas_memory_"))).toEqual([])

      // Positive controls show these tools exist and the registry can expose them to their existing owners.
      const maestro = yield* agents.get("maestro")
      const conductor = (yield* registry.tools({ ...model, agent: maestro })).map((tool) => tool.id)
      expect(conductor.filter((id) => arsenalIDs.some((name) => name === id)).toSorted()).toEqual(arsenalIDs)
      expect(conductor).toContain("maestro_grant_authorization")
      const backend = yield* agents.get("backend")
      const memory = (yield* registry.tools({ ...model, agent: backend })).map((tool) => tool.id)
      expect(memory).toContain("atlas_memory_recall")
      expect(memory).toContain("atlas_memory_emit")
      expect(memory.filter((id) => arsenalIDs.some((name) => name === id))).toEqual([])
    }),
  )

  it.instance("retains native and Session permission filtering for upstream discovery", () =>
    Effect.gen(function* () {
      const agents = yield* Agent.Service
      const registry = yield* ToolRegistry.Service
      const upstream = yield* agents.get("walt")
      requireUpstreamGrants(upstream)
      const offered = yield* registry.tools({ ...model, agent: upstream })
      expect(offered.filter((tool) => arsenalIDs.some((id) => id === tool.id))).toHaveLength(3)
      const denied = Permission.fromConfig(Object.fromEntries(arsenalIDs.map((id) => [id, "deny" as const])))
      const sessionDenied = yield* registry.tools({ ...model, agent: upstream, permission: denied })
      expect(sessionDenied.map((tool) => tool.id).filter((id) => arsenalIDs.some((name) => name === id))).toEqual([])
      const nativeDenied = yield* registry.tools({
        ...model,
        agent: { ...upstream, permission: Permission.merge(upstream.permission, denied) },
        permission: Permission.fromConfig({ "*": "allow" }),
      })
      expect(nativeDenied.map((tool) => tool.id).filter((id) => arsenalIDs.some((name) => name === id))).toEqual([])
    }),
  )

  it.instance(
    "rejects wrong seats, custom labels and native:false metadata despite general allowance",
    () =>
      Effect.gen(function* () {
        const agents = yield* Agent.Service
        const registry = yield* ToolRegistry.Service
        const upstream = yield* agents.get("walt")
        const maestro = yield* agents.get("maestro")
        expect(upstream.id).toBe("walt")
        expect(upstream.native).toBe(true)
        expect(maestro.native).toBe(true)
        expect(
          (yield* registry.tools({ ...model, agent: maestro })).some(
            (tool) => tool.id === MaestroArsenal.names.catalog,
          ),
        ).toBe(true)
        const wrong = yield* Effect.forEach(["general", "impostor", "conductor-impostor"], (id) => agents.get(id))
        expect(wrong[1].name).toBe("walt")
        expect(wrong[1].native).toBe(false)
        expect(wrong[2].name).toBe("maestro")
        expect(wrong[2].native).toBe(false)
        yield* Effect.forEach(
          [...wrong, { ...upstream, native: false }, { ...upstream, native: undefined }, { ...maestro, native: false }],
          (agent) =>
            Effect.gen(function* () {
              const tools = yield* registry.tools({
                ...model,
                agent,
                permission: Permission.fromConfig({ "*": "allow" }),
              })
              expect(tools.map((tool) => tool.id).filter((id) => arsenalIDs.some((name) => name === id))).toEqual([])
            }),
        )
      }),
    {
      config: {
        permission: { "*": "allow" },
        agent: { impostor: { name: "walt" }, "conductor-impostor": { name: "maestro" } },
      },
    },
  )

  it.instance("catalogs the pure subset and executes plan-check through the actual V1 host", () =>
    Effect.gen(function* () {
      const host = yield* nativeHost("walt")
      requireUpstreamGrants(host.agent)
      // Display labels cannot be authority; only the actual Agent.Service lookup by agentID attests this caller.
      const context = { ...host.context, agent: "stale upstream display label" }
      const first = Schema.decodeUnknownSync(CatalogPage)((yield* host.catalog.execute({ limit: 10 }, context)).output)
      const second = Schema.decodeUnknownSync(CatalogPage)(
        (yield* host.catalog.execute({ offset: 10, limit: 10 }, context)).output,
      )
      expect(first.total).toBe(MaestroArsenal.UPSTREAM_AUTHORING_OPERATIONS.length)
      expect(first.next).toBe(10)
      expect(second.total).toBe(first.total)
      expect(second.next).toBeNull()
      const capabilities = [...first.capabilities, ...second.capabilities]
      expect(capabilities.map((item) => item.name).toSorted()).toEqual(
        [...MaestroArsenal.UPSTREAM_AUTHORING_OPERATIONS].toSorted(),
      )
      expect(capabilities.every((item) => item.effects.length === 0)).toBe(true)

      expectFailure(
        yield* host.execute.execute({ name: "plan-check", arguments: plan }, context).pipe(Effect.exit),
        "Describe this Arsenal capability in the current Session and agent",
      )
      const descriptor = yield* host.describe.execute({ name: "plan-check" }, context)
      const { Arsenal } = yield* Effect.promise(() => import("@orchestra/maestro-arsenal"))
      expect(Schema.decodeUnknownSync(Schema.UnknownFromJsonString)(descriptor.output)).toEqual(
        yield* Effect.promise(() => Arsenal.describe("plan-check")),
      )
      expect(descriptor.metadata.truncated).toBe(false)
      const result = yield* host.execute.execute({ name: "plan-check", arguments: plan }, context)
      const content = Schema.decodeUnknownSync(ExecutionResult)(result.output).content
      expect(Schema.decodeUnknownSync(Schema.UnknownFromJsonString)(content[0].text)).toMatchObject({
        ok: true,
        ownership: { "AC-1": ["WP-1"] },
      })
      expect(result.metadata.truncated).toBe(false)
      expect(host.asks).toEqual([
        { permission: MaestroArsenal.names.catalog, patterns: ["*"] },
        { permission: MaestroArsenal.names.catalog, patterns: ["*"] },
        { permission: MaestroArsenal.names.execute, patterns: ["plan-check"] },
        { permission: MaestroArsenal.names.describe, patterns: ["plan-check"] },
        { permission: MaestroArsenal.names.execute, patterns: ["plan-check"] },
      ])
    }),
  )

  it.instance(
    "denies an ungranted operation after general allowance through real host permissions",
    () =>
      Effect.gen(function* () {
        const host = yield* nativeHost("walt", Permission.fromConfig({ "*": "allow" }))
        requireUpstreamGrants(host.agent)
        yield* host.describe.execute({ name: "plan-check" }, host.context)
        yield* host.execute.execute({ name: "plan-check", arguments: plan }, host.context)
        expectFailure(
          yield* host.describe.execute({ name: "profile" }, host.context).pipe(Effect.exit),
          "PermissionDeniedError",
        )
        expectFailure(
          yield* host.execute
            .execute({ name: "profile", arguments: { action: "get" } }, host.context)
            .pipe(Effect.exit),
          "PermissionDeniedError",
        )
        expect(host.asks.slice(-2)).toEqual([
          { permission: MaestroArsenal.names.describe, patterns: ["profile"] },
          { permission: MaestroArsenal.names.execute, patterns: ["profile"] },
        ])
        const permission = yield* Permission.Service
        expect(yield* permission.list()).toEqual([])
      }),
    { config: { permission: { "*": "allow" } } },
  )

  it.instance(
    "rejects display-name impersonation on all three actual V1 host surfaces before permission checks",
    () =>
      Effect.gen(function* () {
        yield* Effect.forEach(["general", "impostor", "conductor-impostor"], (id) =>
          Effect.gen(function* () {
            const host = yield* nativeHost(id)
            const context = { ...host.context, agent: "walt" }
            expectFailure(
              yield* host.catalog.execute({}, context).pipe(Effect.exit),
              "requires native Maestro identity",
            )
            expectFailure(
              yield* host.describe.execute({ name: "plan-check" }, context).pipe(Effect.exit),
              "requires native Maestro identity",
            )
            expectFailure(
              yield* host.execute.execute({ name: "plan-check", arguments: plan }, context).pipe(Effect.exit),
              "requires native Maestro identity",
            )
            expect(host.asks).toEqual([])
          }),
        )
      }),
    {
      config: {
        permission: { "*": "allow" },
        agent: { impostor: { name: "walt" }, "conductor-impostor": { name: "maestro" } },
      },
    },
  )

  it.instance(
    "upstream direct calls without a stable host agentID cannot acquire authority from a label",
    () =>
      Effect.gen(function* () {
        const host = yield* nativeHost("impostor")
        expect(host.agent).toMatchObject({ id: "impostor", name: "walt", native: false })
        const context = { ...host.context, agent: "walt", agentID: undefined }
        expectFailure(yield* host.catalog.execute({}, context).pipe(Effect.exit), "requires native Maestro identity")
        expectFailure(
          yield* host.describe.execute({ name: "plan-check" }, context).pipe(Effect.exit),
          "requires native Maestro identity",
        )
        expectFailure(
          yield* host.execute.execute({ name: "plan-check", arguments: plan }, context).pipe(Effect.exit),
          "requires native Maestro identity",
        )
        expect(host.asks).toEqual([])
      }),
    { config: { permission: { "*": "allow" }, agent: { impostor: { name: "walt" } } } },
  )
})

// Positive tests depend on the sibling Core contract and the lead's real roster integration, never fixture grants.
function requireUpstreamGrants(agent: Agent.Info) {
  expect(agent.id).toBe("walt")
  expect(agent.native).toBe(true)
  if (!Array.isArray(MaestroArsenal.UPSTREAM_AUTHORING_OPERATIONS))
    throw new Error("DEPENDENCY_MISSING: Core MaestroArsenal.UPSTREAM_AUTHORING_OPERATIONS")
  if (Permission.evaluate(MaestroArsenal.names.catalog, "*", agent.permission).action !== "allow")
    throw new Error("DEPENDENCY_MISSING: real walt roster maestro_arsenal_catalog grant")
  expect(MaestroArsenal.UPSTREAM_AUTHORING_OPERATIONS).toHaveLength(13)
  ;[MaestroArsenal.names.describe, MaestroArsenal.names.execute].forEach((permission) => {
    const grants = agent.permission.filter((rule) => rule.permission === permission && rule.action === "allow")
    if (grants.length === 0) throw new Error(`DEPENDENCY_MISSING: real walt roster ${permission} operation grants`)
    expect(grants.map((rule) => rule.pattern).toSorted()).toEqual(
      [...MaestroArsenal.UPSTREAM_AUTHORING_OPERATIONS].toSorted(),
    )
    expect(Permission.evaluate(permission, "profile", agent.permission).action).toBe("deny")
  })
}

const nativeHost = Effect.fn("UpstreamArsenalTest.nativeHost")(function* (
  id: string,
  earlier: ReturnType<typeof Permission.fromConfig> = [],
) {
  const agents = yield* Agent.Service
  const sessions = yield* Session.Service
  const permission = yield* Permission.Service
  const agent = yield* agents.get(id)
  if (!agent) throw new Error(`Actual agent missing: ${id}`)
  const session = yield* sessions.create({ title: "upstream Arsenal binding", agent: id })
  yield* MaestroArsenalTools.prepare
  const native = yield* MaestroArsenalTools.tools
  const asks: Array<{ permission: string; patterns: string[] }> = []
  const context: Tool.Context = {
    sessionID: session.id,
    messageID: MessageID.ascending(),
    agent: agent.name,
    agentID: agent.id ?? id,
    callID: "upstream-arsenal-binding",
    abort: new AbortController().signal,
    messages: [],
    metadata: () => sessions.get(session.id).pipe(Effect.asVoid, Effect.orDie),
    ask: (request) =>
      Effect.sync(() => {
        asks.push({ permission: request.permission, patterns: [...request.patterns] })
      }).pipe(
        Effect.andThen(
          permission.ask({
            ...request,
            sessionID: session.id,
            ruleset: Permission.merge(earlier, agent.permission),
          }),
        ),
        Effect.orDie,
      ),
  }
  return {
    agent,
    context,
    asks,
    catalog: yield* Tool.init(native[0]),
    describe: yield* Tool.init(native[1]),
    execute: yield* Tool.init(native[2]),
  }
})

function expectFailure(result: Exit.Exit<unknown, unknown>, message: string) {
  expect(result._tag).toBe("Failure")
  if (result._tag !== "Failure") throw new Error(`Expected failure: ${message}`)
  expect(Cause.pretty(result.cause)).toContain(message)
}
