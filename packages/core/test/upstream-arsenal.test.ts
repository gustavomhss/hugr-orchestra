import { describe, expect } from "bun:test"
import { Effect, Schema } from "effect"
import { AgentV2 } from "@orchestra/core/agent"
import { FSUtil } from "@orchestra/core/fs-util"
import { Global } from "@orchestra/core/global"
import { Location } from "@orchestra/core/location"
import { PermissionV2 } from "@orchestra/core/permission"
import { MaestroArsenal, UPSTREAM_AUTHORING_OPERATIONS } from "@orchestra/core/tool/maestro-arsenal"
import { ToolRegistry } from "@orchestra/core/tool/registry"
import { Tool } from "@orchestra/core/tool/tool"
import { ToolOutputStore } from "@orchestra/core/tool-output-store"
import { UpstreamArsenal } from "../src/tool/upstream-arsenal"
import { upstreamDriftProof } from "./fixture/upstream-arsenal-proof"
import { testEffect } from "./lib/effect"
import { executeTool, settleTool, toolIdentity } from "./lib/tool"
import { hostLayer, sessionID, setup } from "./maestro-arsenal.test"

const it = testEffect(hostLayer)
const archie = AgentV2.ID.make("archie")
const context = { sessionID, agent: archie }
const args = {
  wps: [
    { id: "first", writes: ["src/shared.ts"] },
    { id: "second", writes: ["src/shared.ts"] },
  ],
}
const decode = Schema.decodeUnknownSync(Schema.UnknownFromJsonString)
const textResult = Schema.decodeUnknownSync(
  Schema.fromJsonString(Schema.Struct({ content: Schema.Array(Schema.Struct({ text: Schema.String })) })),
)
const catalog = Schema.decodeUnknownSync(
  Schema.fromJsonString(
    Schema.Struct({
      capabilities: Schema.Array(Schema.Struct({ name: Schema.String, effects: Schema.Array(Schema.String) })),
      total: Schema.Int,
      offset: Schema.Int,
      next: Schema.NullOr(Schema.Int),
    }),
  ),
)

const setupUpstream = Effect.fn("UpstreamArsenalTest.setup")(function* () {
  const agents = yield* setup([{ action: "*", resource: "*", effect: "allow" }])
  yield* agents.transform((editor) =>
    editor.update(archie, (agent) => {
      agent.permissions = [{ action: "*", resource: "*", effect: "allow" }]
    }),
  )
  return agents
})

const boundHost = Effect.fn("UpstreamArsenalTest.host")(function* () {
  const location = yield* Location.Service
  const global = yield* Global.Service
  const fs = yield* FSUtil.Service
  const permission = yield* PermissionV2.Service
  const outputs = yield* ToolOutputStore.Service
  const binding = {
    directory: String(location.directory),
    stateDirectory: MaestroArsenal.stateDirectory(global.data, location.project.id),
    projectID: String(location.project.id),
    ask: (action: string, resources: readonly string[]) =>
      permission
        .assert({
          action,
          resources,
          sessionID,
          agent: archie,
          source: { type: "tool", messageID: toolIdentity.assistantMessageID, callID: "upstream" },
        })
        .pipe(Effect.mapError(() => new Tool.Failure({ message: "Arsenal permission denied." }))),
  }
  return {
    ...binding,
    nativeMaestro: false,
    nativeUpstream: true,
    outputBudget: outputs.limits,
    authorize: (input: MaestroArsenal.Authorization) => MaestroArsenal.authorize(fs, binding, input),
  }
})

const call = (name: string, input: unknown, agent = archie) => ({
  sessionID,
  ...toolIdentity,
  agent,
  call: { type: "tool-call" as const, id: `upstream-${name}`, name, input },
})

describe("Upstream Arsenal authoring access", () => {
  it.live("exports exactly the frozen authoring IDs, all present and pure in the actual Arsenal registry", () =>
    Effect.gen(function* () {
      const { Arsenal } = yield* Effect.promise(() => import("@orchestra/maestro-arsenal"))
      expect(UPSTREAM_AUTHORING_OPERATIONS).toEqual([
        "anchor-gen",
        "conflict-map",
        "context-packer",
        "contract-freezer",
        "enrich-plan",
        "plan-check",
        "plan-compiler",
        "plan-to-briefs",
        "plan-to-dag",
        "plan-to-gates",
        "plan-to-policy",
        "seam-checker",
        "sliceability",
      ])
      expect(Object.isFrozen(UPSTREAM_AUTHORING_OPERATIONS)).toBe(true)
      expect(MaestroArsenal.UPSTREAM_AUTHORING_OPERATIONS).toBe(UPSTREAM_AUTHORING_OPERATIONS)
      const descriptors = yield* Effect.promise(() => Arsenal.list())
      const selected = yield* Effect.fromResult(UpstreamArsenal.catalog(descriptors))
      expect(selected.map((item) => item.name)).toEqual([...UPSTREAM_AUTHORING_OPERATIONS])
      yield* Effect.forEach(selected, (item) =>
        Effect.gen(function* () {
          expect(item).toEqual(yield* Effect.promise(() => Arsenal.describe(item.name)))
          expect(item.effects).toEqual([])
        }),
      )
      // Positive controls: the real registry has excluded pure and effectful capabilities.
      expect(yield* Effect.promise(() => Arsenal.describe("stub-gen"))).toMatchObject({ effects: [] })
      expect((yield* Effect.promise(() => Arsenal.describe("profile"))).effects.length).toBeGreaterThan(0)
    }),
  )

  it.live("filters the upstream catalog before pagination and effect-group selection", () =>
    Effect.gen(function* () {
      yield* setupUpstream()
      const host = yield* boundHost()
      const handlers = MaestroArsenal.makeHandlers(() => Effect.succeed(host))
      yield* Effect.forEach([1, 5, 10], (limit) =>
        Effect.gen(function* () {
          const pages = yield* Effect.forEach(
            Array.from({ length: Math.ceil(13 / limit) }, (_, page) => page * limit),
            (offset) =>
              Effect.gen(function* () {
                const page = catalog(yield* handlers.catalog({ offset, limit }, context))
                expect(page.total).toBe(13)
                expect(page.offset).toBe(offset)
                expect(page.next).toBe(offset + limit < 13 ? offset + limit : null)
                expect(page.capabilities).toEqual(
                  UPSTREAM_AUTHORING_OPERATIONS.slice(offset, offset + limit).map((name) => ({ name, effects: [] })),
                )
                return page
              }),
          )
          expect(pages.flatMap((page) => page.capabilities.map((item) => item.name))).toEqual([
            ...UPSTREAM_AUTHORING_OPERATIONS,
          ])
        }),
      )
      expect(catalog(yield* handlers.catalog({ group: "pure", offset: 10, limit: 10 }, context))).toMatchObject({
        total: 13,
        next: null,
        capabilities: UPSTREAM_AUTHORING_OPERATIONS.slice(10).map((name) => ({ name, effects: [] })),
      })
      yield* Effect.forEach(["read", "write", "process"] as const, (group) =>
        Effect.gen(function* () {
          expect(catalog(yield* handlers.catalog({ group, limit: 10 }, context))).toEqual({
            capabilities: [],
            total: 0,
            offset: 0,
            next: null,
          })
        }),
      )
      expect(catalog(yield* handlers.catalog({ offset: 13 }, context))).toEqual({
        capabilities: [],
        total: 13,
        offset: 13,
        next: null,
      })
      expect(yield* handlers.catalog({}, context)).not.toContain("inputSchema")
    }),
  )

  it.live("native upstream describes and executes the real authoring operation without native Maestro", () =>
    Effect.gen(function* () {
      const { Arsenal } = yield* Effect.promise(() => import("@orchestra/maestro-arsenal"))
      yield* setupUpstream()
      const host = yield* boundHost()
      expect(host.nativeMaestro).toBe(false)
      const handlers = MaestroArsenal.makeHandlers(() => Effect.succeed(host))
      expect(
        (yield* handlers.execute({ name: "conflict-map", arguments: args }, context).pipe(Effect.flip)).message,
      ).toBe(
        'Describe this Arsenal capability in the current Session and agent before executing it: call maestro_arsenal_describe with name "conflict-map" first, then pass arguments that match its inputSchema.',
      )
      expect(decode(yield* handlers.describe({ name: "conflict-map" }, context))).toEqual(
        yield* Effect.promise(() => Arsenal.describe("conflict-map")),
      )
      expect(
        decode(textResult(yield* handlers.execute({ name: "conflict-map", arguments: args }, context)).content[0].text),
      ).toMatchObject({ parallelSafe: false, pairs: [{ a: "first", b: "second", verdict: "MUTATION_CONFLICT" }] })
    }),
  )

  it.live("denies ungranted describe and execute even with an existing Maestro receipt", () =>
    Effect.gen(function* () {
      const { Arsenal } = yield* Effect.promise(() => import("@orchestra/maestro-arsenal"))
      yield* setupUpstream()
      const host = yield* boundHost()
      const handlers = MaestroArsenal.makeHandlers(() => Effect.succeed(host))
      yield* Effect.forEach(
        ["stub-gen", "plan-to-barrel", "governance", "profile", "repo-mapper", "wave-scheduler"],
        (name) =>
          Effect.gen(function* () {
            host.nativeMaestro = true
            expect(decode(yield* handlers.describe({ name }, context))).toEqual(
              yield* Effect.promise(() => Arsenal.describe(name)),
            )
            host.nativeMaestro = false
            expect((yield* handlers.describe({ name }, context).pipe(Effect.flip)).message).toBe(
              `UPSTREAM_AUTHORING_OPERATION_DENIED: ${name}`,
            )
            expect((yield* handlers.execute({ name, arguments: {} }, context).pipe(Effect.flip)).message).toBe(
              `UPSTREAM_AUTHORING_OPERATION_DENIED: ${name}`,
            )
          }),
      )
    }),
  )

  it.live("execute-only whitelist rejects an excluded pure operation with an exact Maestro receipt", () =>
    Effect.gen(function* () {
      const { Arsenal } = yield* Effect.promise(() => import("@orchestra/maestro-arsenal"))
      yield* setupUpstream()
      const host = yield* boundHost()
      const handlers = MaestroArsenal.makeHandlers(() => Effect.succeed(host))
      const frozen = yield* Effect.promise(() =>
        Arsenal.execute("contract-freezer", {
          id: "execute-only",
          surfaces: [{ name: "test", signature: "test(): void", kind: "function" }],
        }),
      )
      const contract = decode(frozen.content[0].text)
      host.nativeMaestro = true
      yield* handlers.describe({ name: "stub-gen" }, context)
      host.nativeMaestro = false
      // No upstream describe call: execute denial must stand on its own with valid backend arguments.
      expect(
        yield* handlers.execute({ name: "stub-gen", arguments: { contract } }, context).pipe(Effect.result),
      ).toMatchObject({
        _tag: "Failure",
        failure: { message: "UPSTREAM_AUTHORING_OPERATION_DENIED: stub-gen" },
      })
    }),
  )

  it.live("retired upstream ID and revoked host attestation cannot use a receipt", () =>
    Effect.gen(function* () {
      yield* setupUpstream()
      const host = yield* boundHost()
      const handlers = MaestroArsenal.makeHandlers(() => Effect.succeed(host))
      yield* handlers.describe({ name: "conflict-map" }, context)
      const retired = { ...context, agent: AgentV2.ID.make("walt") }
      yield* Effect.forEach([
        handlers.catalog({}, retired),
        handlers.describe({ name: "conflict-map" }, retired),
        handlers.execute({ name: "conflict-map", arguments: args }, retired),
      ], (effect) => Effect.gen(function* () {
        expect((yield* effect.pipe(Effect.flip)).message).toBe("Maestro Arsenal requires native Maestro identity.")
      }))
      host.nativeUpstream = false
      yield* Effect.forEach([context, { ...context, agent: "general" }], (invocation) =>
        Effect.gen(function* () {
          expect((yield* handlers.catalog({}, invocation).pipe(Effect.flip)).message).toBe(
            "Maestro Arsenal requires native Maestro identity.",
          )
          expect((yield* handlers.describe({ name: "conflict-map" }, invocation).pipe(Effect.flip)).message).toBe(
            "Maestro Arsenal requires native Maestro identity.",
          )
          expect(
            (yield* handlers.execute({ name: "conflict-map", arguments: args }, invocation).pipe(Effect.flip)).message,
          ).toBe("Maestro Arsenal requires native Maestro identity.")
        }),
      )
    }),
  )

  it.live("scoped ToolRegistry enforces revoked PermissionV2 for describe and execute after an allowed receipt", () =>
    Effect.gen(function* () {
      const agents = yield* setupUpstream()
      const registry = yield* ToolRegistry.Service
      yield* MaestroArsenal.registerScoped({
        nativeMaestro: () => Effect.succeed(false),
        nativeUpstream: (id) => agents.get(id).pipe(Effect.map((agent) => agent?.id === archie)),
      })
      // Capture the real registry before revocation; catalog filtering cannot hide a missing leaf assertion.
      const materialized = yield* registry.materialize()
      expect(
        decode(
          (yield* materialized.settle(call(MaestroArsenal.names.describe, { name: "conflict-map" }))).output
            ?.structured,
        ),
      ).toMatchObject({ name: "conflict-map", effects: [] })
      expect(
        (yield* materialized.settle(call(MaestroArsenal.names.execute, { name: "conflict-map", arguments: args })))
          .result,
      ).toMatchObject({ type: "text" })
      yield* agents.transform((editor) =>
        editor.update(archie, (agent) => {
          agent.permissions = [{ action: "*", resource: "*", effect: "deny" }]
        }),
      )
      const described = yield* materialized.settle(call(MaestroArsenal.names.describe, { name: "conflict-map" }))
      const executed = yield* materialized.settle(
        call(MaestroArsenal.names.execute, { name: "conflict-map", arguments: args }),
      )
      expect([described.result, executed.result]).toEqual([
        { type: "error", value: "Arsenal permission denied." },
        { type: "error", value: "Arsenal permission denied." },
      ])
    }),
  )

  Array.from(["missing", "nonpure"] as const).forEach((mode) => {
    Array.from(["catalog", "describe", "execute"] as const).forEach((boundary) => {
      it.live(`actual ${boundary} rejects ${mode} package registry drift before backend entry`, () =>
        Effect.promise(() => upstreamDriftProof(mode, boundary)),
      )
    })
  })

  it.live("keeps exact project, directory, Session and agent receipt binding and clears over-budget describe", () =>
    Effect.gen(function* () {
      yield* setupUpstream()
      const host = yield* boundHost()
      const current = { host }
      const handlers = MaestroArsenal.makeHandlers(() => Effect.succeed(current.host))
      yield* handlers.describe({ name: "conflict-map" }, context)
      yield* Effect.forEach(
        [
          { ...host, projectID: `${host.projectID}-other` },
          { ...host, directory: `${host.directory}-other` },
        ],
        (changed) =>
          Effect.gen(function* () {
            current.host = changed
            expect(
              (yield* handlers.execute({ name: "conflict-map", arguments: args }, context).pipe(Effect.flip)).message,
            ).toStartWith("Describe this Arsenal capability")
          }),
      )
      current.host = host
      yield* Effect.forEach(
        [
          { ...context, sessionID: `${sessionID}-other` },
          { ...context, agent: "general" },
        ],
        (changed) =>
          Effect.gen(function* () {
            expect(
              (yield* handlers.execute({ name: "conflict-map", arguments: args }, changed).pipe(Effect.flip)).message,
            ).toStartWith(changed.agent === archie ? "Describe this Arsenal capability" : "Maestro Arsenal requires native Maestro identity.")
          }),
      )
      expect(decode(yield* handlers.execute({ name: "conflict-map", arguments: args }, context))).toHaveProperty(
        "content",
      )
      const budget = host.outputBudget
      host.outputBudget = () => Effect.succeed({ maxLines: 1, maxBytes: 1 })
      expect((yield* handlers.describe({ name: "conflict-map" }, context).pipe(Effect.flip)).message).toBe(
        "DESCRIBE_CONTRACT_OVER_BUDGET",
      )
      host.outputBudget = budget
      expect(
        (yield* handlers.execute({ name: "conflict-map", arguments: args }, context).pipe(Effect.flip)).message,
      ).toStartWith("Describe this Arsenal capability")
    }),
  )

  it.live("requires actual AgentV2 archie and current roster attestation for scoped registration", () =>
    Effect.gen(function* () {
      const agents = yield* setup([{ action: "*", resource: "*", effect: "allow" }])
      const registry = yield* ToolRegistry.Service
      const attested = new Set<AgentV2.ID>([archie, toolIdentity.agent])
      yield* MaestroArsenal.registerScoped({
        nativeMaestro: () => Effect.succeed(false),
        nativeUpstream: (id) => Effect.succeed(attested.has(id)),
      })
      expect(yield* executeTool(registry, call(MaestroArsenal.names.catalog, {}))).toEqual({
        type: "error",
        value: "Maestro Arsenal requires native Maestro identity.",
      })
      yield* agents.transform((editor) => {
        editor.update(archie, (agent) => {
          agent.permissions = [{ action: "*", resource: "*", effect: "allow" }]
        })
        editor.update(toolIdentity.agent, (agent) => {
          agent.permissions = [{ action: "*", resource: "*", effect: "allow" }]
        })
      })
      expect(yield* executeTool(registry, call(MaestroArsenal.names.catalog, {}, toolIdentity.agent))).toEqual({
        type: "error",
        value: "Maestro Arsenal requires native Maestro identity.",
      })
      attested.delete(archie)
      expect(yield* executeTool(registry, call(MaestroArsenal.names.catalog, {}))).toEqual({
        type: "error",
        value: "Maestro Arsenal requires native Maestro identity.",
      })
      attested.add(archie)
      expect(
        catalog((yield* settleTool(registry, call(MaestroArsenal.names.catalog, { limit: 10 }))).output?.structured),
      ).toMatchObject({ total: 13 })
      expect(
        decode(
          (yield* settleTool(registry, call(MaestroArsenal.names.describe, { name: "conflict-map" }))).output
            ?.structured,
        ),
      ).toMatchObject({ name: "conflict-map", effects: [] })
      expect(
        yield* executeTool(registry, call(MaestroArsenal.names.execute, { name: "conflict-map", arguments: args })),
      ).toMatchObject({ type: "text" })
      attested.delete(archie)
      expect(
        yield* executeTool(registry, call(MaestroArsenal.names.execute, { name: "conflict-map", arguments: args })),
      ).toEqual({ type: "error", value: "Maestro Arsenal requires native Maestro identity." })
      yield* MaestroArsenal.registerScoped({ nativeMaestro: () => Effect.succeed(false) })
      expect(yield* executeTool(registry, call(MaestroArsenal.names.catalog, {}))).toEqual({
        type: "error",
        value: "Maestro Arsenal requires native Maestro identity.",
      })
    }),
  )

  it.live("native Maestro retains the full registry surface and pure capabilities outside the whitelist", () =>
    Effect.gen(function* () {
      const { Arsenal } = yield* Effect.promise(() => import("@orchestra/maestro-arsenal"))
      yield* setupUpstream()
      const host = yield* boundHost()
      host.nativeMaestro = true
      host.nativeUpstream = false
      const handlers = MaestroArsenal.makeHandlers(() => Effect.succeed(host))
      const descriptors = yield* Effect.promise(() => Arsenal.list())
      expect(catalog(yield* handlers.catalog({ limit: 10 }, context))).toMatchObject({
        total: descriptors.length,
        capabilities: descriptors.slice(0, 10).map((item) => ({ name: item.name, effects: item.effects })),
      })
      yield* Effect.forEach(["pure", "read", "write", "process"] as const, (group) =>
        Effect.gen(function* () {
          const filtered = descriptors.filter((item) =>
            group === "pure" ? item.effects.length === 0 : item.effects.includes(group),
          )
          expect(catalog(yield* handlers.catalog({ group, limit: 10 }, context))).toMatchObject({
            total: filtered.length,
            capabilities: filtered.slice(0, 10).map((item) => ({ name: item.name, effects: item.effects })),
          })
        }),
      )
      const frozen = yield* Effect.promise(() =>
        Arsenal.execute("contract-freezer", {
          id: "test",
          surfaces: [{ name: "test", signature: "test(): void", kind: "function" }],
        }),
      )
      const contract = decode(frozen.content[0].text)
      yield* handlers.describe({ name: "stub-gen" }, context)
      expect(
        decode(
          textResult(yield* handlers.execute({ name: "stub-gen", arguments: { contract } }, context)).content[0].text,
        ),
      ).toMatchObject({
        lang: "ts",
        count: 1,
        stubs: 'export function test(): void {\n  throw new Error("stub: test");\n}',
      })
      expect((yield* handlers.describe({ name: "missing-operation" }, context).pipe(Effect.flip)).message).toBe(
        "Unknown Arsenal capability; use an exact name from maestro_arsenal_catalog.",
      )
    }),
  )

  it.live("shared upstream descriptor validation fails named on missing descriptors and non-pure drift", () =>
    Effect.gen(function* () {
      const { Arsenal } = yield* Effect.promise(() => import("@orchestra/maestro-arsenal"))
      const descriptors = yield* Effect.promise(() => Arsenal.list())
      yield* Effect.fromResult(UpstreamArsenal.catalog(descriptors))
      yield* Effect.forEach(UPSTREAM_AUTHORING_OPERATIONS, (name) =>
        Effect.gen(function* () {
          const descriptor = yield* Effect.promise(() => Arsenal.describe(name))
          expect((yield* Effect.fromResult(UpstreamArsenal.selected(name, undefined)).pipe(Effect.flip)).message).toBe(
            `UPSTREAM_AUTHORING_DESCRIPTOR_MISSING: ${name}`,
          )
          expect(
            (yield* Effect.fromResult(UpstreamArsenal.catalog(descriptors.filter((item) => item.name !== name))).pipe(
              Effect.flip,
            )).message,
          ).toBe(`UPSTREAM_AUTHORING_DESCRIPTOR_MISSING: ${name}`)
          yield* Effect.forEach(["read", "write", "process"] as const, (effect) =>
            Effect.gen(function* () {
              const changed = { ...descriptor, effects: [effect] }
              expect(
                (yield* Effect.fromResult(UpstreamArsenal.selected(name, changed)).pipe(Effect.flip)).message,
              ).toBe(`UPSTREAM_AUTHORING_DESCRIPTOR_NOT_PURE: ${name}`)
              expect(
                (yield* Effect.fromResult(
                  UpstreamArsenal.catalog(descriptors.map((item) => (item.name === name ? changed : item))),
                ).pipe(Effect.flip)).message,
              ).toBe(`UPSTREAM_AUTHORING_DESCRIPTOR_NOT_PURE: ${name}`)
            }),
          )
        }),
      )
    }),
  )
})
