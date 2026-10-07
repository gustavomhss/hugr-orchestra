// Requires the actual assembled @orchestra/maestro-arsenal package. Never mock its validator/handlers.
import { expect } from "bun:test"
import { Effect, Schema } from "effect"
import { realpath } from "node:fs/promises"
import { FSUtil } from "@orchestra/core/fs-util"
import { Global } from "@orchestra/core/global"
import { Location } from "@orchestra/core/location"
import { MaestroArsenal } from "@orchestra/core/tool/maestro-arsenal"
import { ToolRegistry } from "@orchestra/core/tool/registry"
import { testEffect } from "./lib/effect"
import { executeTool, settleTool, toolIdentity } from "./lib/tool"
import { hostLayer, maestro, sessionID, setup } from "./maestro-arsenal.test"

const it = testEffect(hostLayer)
const call = (name: string, input: unknown) => ({
  sessionID,
  agent: maestro,
  assistantMessageID: toolIdentity.assistantMessageID,
  call: { type: "tool-call" as const, id: `call-${name}`, name, input },
})

it.live("native managed root keeps OS identity when the assembled SDK re-resolves profile paths", () =>
  Effect.gen(function* () {
    const fs = yield* FSUtil.Service
    const location = yield* Location.Service
    const binding = {
      directory: yield* Effect.promise(() => realpath(location.directory)),
      projectID: `${location.project.id}_canonical_profile`,
      stateDirectory: yield* MaestroArsenal.prepareState(Global.Path.data, location.project.id),
    }
    expect(binding.stateDirectory).toBe(yield* Effect.promise(() => realpath(binding.stateDirectory)))
    expect(yield* MaestroArsenal.makeProfileLoader(fs, binding)()).toBeUndefined()
  }),
)

it.live("Arsenal package conformance: bounded metadata and selected schema come from the actual registry", () =>
  Effect.gen(function* () {
    const { Arsenal } = yield* Effect.promise(() => import("@orchestra/maestro-arsenal"))
    const agents = yield* setup([{ action: "*", resource: "*", effect: "allow" }])
    yield* MaestroArsenal.registerScoped({
      nativeMaestro: (id) => agents.get(id).pipe(Effect.map((agent) => agent?.id === maestro)),
    })
    const registry = yield* ToolRegistry.Service
    const catalog = yield* settleTool(registry, call(MaestroArsenal.names.catalog, { limit: 2 }))
    const page = Schema.decodeUnknownSync(Schema.UnknownFromJsonString)(catalog.output?.structured)
    const descriptors = yield* Effect.promise(() => Arsenal.list())
    expect(page).toMatchObject({
      total: descriptors.length,
      capabilities: descriptors
        .slice(0, 2)
        .map((descriptor) => ({ name: descriptor.name, effects: descriptor.effects })),
    })
    expect(JSON.stringify(page)).not.toContain("inputSchema")
    expect(
      yield* executeTool(registry, call(MaestroArsenal.names.execute, { name: "profile", arguments: {} })),
    ).toMatchObject({
      type: "error",
      value:
        'Describe this Arsenal capability in the current Session and agent before executing it: call maestro_arsenal_describe with name "profile" first, then pass arguments that match its inputSchema.',
    })
    expect(yield* executeTool(registry, call(MaestroArsenal.names.describe, { name: "no-such-capability" }))).toEqual({
      type: "error",
      value: "Unknown Arsenal capability; use an exact name from maestro_arsenal_catalog.",
    })
    const descriptor = yield* Effect.promise(() => Arsenal.describe("profile"))
    const result = yield* settleTool(registry, call(MaestroArsenal.names.describe, { name: "profile" }))
    expect(Schema.decodeUnknownSync(Schema.UnknownFromJsonString)(result.output?.structured)).toEqual(descriptor)
    // The backend's own validator reports the code and the offending argument path, never host state.
    expect(
      yield* executeTool(
        registry,
        call(MaestroArsenal.names.execute, {
          name: "profile",
          arguments: { action: "set", patch: { scrutiny: "invalid" } },
        }),
      ),
    ).toEqual({
      type: "error",
      value:
        "Arsenal capability failed (invalid_arguments): invalid arguments for profile: args.patch.scrutiny: value outside enum. Fix the arguments to match the inputSchema from maestro_arsenal_describe; no successful outcome was recorded.",
    })
  }),
)

it.live("Arsenal package conformance: real edit denial prevents profile persistence; allow control creates state", () =>
  Effect.gen(function* () {
    const { Arsenal } = yield* Effect.promise(() => import("@orchestra/maestro-arsenal"))
    expect(yield* Effect.promise(() => Arsenal.describe("profile"))).toBeDefined()
    const agents = yield* setup([
      { action: "*", resource: "*", effect: "allow" },
      { action: "edit", resource: "*", effect: "deny" },
    ])
    yield* MaestroArsenal.registerScoped({
      nativeMaestro: (id) => agents.get(id).pipe(Effect.map((agent) => agent?.id === maestro)),
    })
    const registry = yield* ToolRegistry.Service
    const filesystem = yield* FSUtil.Service
    const location = yield* Location.Service
    const global = yield* Global.Service
    const directory = MaestroArsenal.stateDirectory(global.data, location.project.id)
    const description = yield* settleTool(registry, call(MaestroArsenal.names.describe, { name: "profile" }))
    expect(description.output?.structured).toBeString()
    expect(yield* filesystem.readDirectory(directory)).toEqual([])
    const input = { name: "profile", arguments: { action: "set", patch: { scrutiny: "strict" } } }
    expect(yield* executeTool(registry, call(MaestroArsenal.names.execute, input))).toMatchObject({ type: "error" })
    expect(yield* filesystem.readDirectory(directory)).toEqual([])
    yield* agents.transform((editor) =>
      editor.update(maestro, (agent) => {
        agent.permissions = [{ action: "*", resource: "*", effect: "allow" }]
      }),
    )
    expect(yield* executeTool(registry, call(MaestroArsenal.names.execute, input))).toMatchObject({ type: "text" })
    expect((yield* filesystem.readDirectory(directory)).length).toBeGreaterThan(0)
  }),
)

it.live(
  "Arsenal package conformance: swallowed process denial remains failure; model observations cannot replace host binding",
  () =>
    Effect.gen(function* () {
      const { Arsenal } = yield* Effect.promise(() => import("@orchestra/maestro-arsenal"))
      expect(yield* Effect.promise(() => Arsenal.describe("repo-hygiene-check"))).toBeDefined()
      const agents = yield* setup([
        { action: "*", resource: "*", effect: "allow" },
        { action: "bash", resource: "*", effect: "deny" },
      ])
      yield* MaestroArsenal.registerScoped({
        nativeMaestro: (id) => agents.get(id).pipe(Effect.map((agent) => agent?.id === maestro)),
      })
      const registry = yield* ToolRegistry.Service
      yield* settleTool(registry, call(MaestroArsenal.names.describe, { name: "repo-hygiene-check" }))
      expect(
        yield* executeTool(registry, call(MaestroArsenal.names.execute, { name: "repo-hygiene-check", arguments: {} })),
      ).toEqual({ type: "error", value: "Arsenal permission denied." })
      yield* settleTool(registry, call(MaestroArsenal.names.describe, { name: "governance" }))
      expect(
        yield* executeTool(
          registry,
          call(MaestroArsenal.names.execute, {
            name: "governance",
            arguments: { operation: "status", observations: { complete: true, usage: [], actions: [] } },
          }),
        ),
      ).toEqual({
        type: "error",
        value: "Arsenal governance requires actual host Session observations; this host has no observation binding.",
      })
    }),
)
