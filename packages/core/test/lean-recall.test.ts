import { describe, expect } from "bun:test"
import { Effect, Layer } from "effect"
import { AppNodeBuilder } from "@orchestra/core/effect/app-node-builder"
import { LayerNode } from "@orchestra/core/effect/layer-node"
import { Global } from "@orchestra/core/global"
import { Location } from "@orchestra/core/location"
import { AbsolutePath } from "@orchestra/core/schema"
import { SessionV2 } from "@orchestra/core/session"
import { LeanRecallTool } from "@orchestra/core/tool/lean-recall"
import { LeanSummary } from "@orchestra/core/tool/lean-summary"
import { ToolRegistry } from "@orchestra/core/tool/registry"
import { ToolOutputStore } from "@orchestra/core/tool-output-store"
import { location } from "./fixture/location"
import { tmpdir } from "./fixture/tmpdir"
import { testEffect } from "./lib/effect"
import { executeTool, toolDefinitions, toolIdentity } from "./lib/tool"

const sessionID = SessionV2.ID.make("ses_lean_recall")
const original = ["first", "second", "third", "fourth"].join("\n")

const withRecall = <A, E>(body: (registry: ToolRegistry.Interface, id: string) => Effect.Effect<A, E>) =>
  Effect.acquireUseRelease(
    Effect.promise(() => tmpdir()),
    (tmp) => {
      const active = location({ directory: AbsolutePath.make(tmp.path) })
      return Effect.gen(function* () {
        const id = yield* Effect.promise(() =>
          LeanSummary.store({ projectID: active.project.id, directory: active.directory }, tmp.path).put(original))
        return yield* body(yield* ToolRegistry.Service, id)
      }).pipe(
        Effect.provide(
          AppNodeBuilder.build(LayerNode.group([ToolRegistry.node, LeanRecallTool.node]), [
            [Location.node, Layer.succeed(Location.Service, Location.Service.of(active))],
            [Global.node, Global.layerWith({ data: tmp.path, state: tmp.path })],
            [ToolOutputStore.node, ToolOutputStore.nodeWithoutConfig],
          ]),
        ),
      )
    },
    (tmp) => Effect.promise(() => tmp[Symbol.asyncDispose]()),
  )

const recall = (input: Record<string, unknown>) => ({
  sessionID,
  ...toolIdentity,
  call: { type: "tool-call" as const, id: "call_recall", name: "lean_recall", input },
})

const it = testEffect(Layer.empty)

describe("lean_recall", () => {
  it.live("returns the stored original byte for byte, a line range, or the expiry notice", () =>
    withRecall((registry, id) =>
      Effect.gen(function* () {
        expect(yield* executeTool(registry, recall({ id }))).toEqual({ type: "text", value: original })
        // The model may paste the whole recovery command.
        expect(yield* executeTool(registry, recall({ id: ` lean recall ${id} `, lines: "2-3" })))
          .toEqual({ type: "text", value: "second\nthird" })
        expect(yield* executeTool(registry, recall({ id, lines: "3-" }))).toEqual({ type: "text", value: "third\nfourth" })
        expect(yield* executeTool(registry, recall({ id: "0".repeat(32) }))).toEqual({ type: "text", value: LeanRecallTool.UNAVAILABLE })
        expect(yield* executeTool(registry, recall({ id: "not-an-id" }))).toMatchObject({ type: "error" })
        expect(yield* executeTool(registry, recall({ id: id.toUpperCase() }))).toMatchObject({ type: "error" })
      }),
    ),
  )

  it.live("is offered while bash, read or webfetch stays enabled", () =>
    withRecall((registry) =>
      Effect.gen(function* () {
        const names = (rules: Parameters<typeof toolDefinitions>[1]) =>
          toolDefinitions(registry, rules).pipe(Effect.map((definitions) => definitions.map((definition) => definition.name)))
        const deny = (action: string) => ({ action, resource: "*", effect: "deny" as const })
        expect(yield* names([])).toEqual(["lean_recall"])
        expect(yield* names([deny("bash"), deny("read")])).toEqual(["lean_recall"])
        expect(yield* names([deny("bash"), deny("read"), deny("webfetch")])).toEqual([])
        expect(yield* names([deny("*")])).toEqual([])
        // A partial (resource-scoped) rule is not a whole-tool denial.
        expect(yield* names([deny("bash"), deny("read"), { action: "webfetch", resource: "https://*", effect: "deny" }])).toEqual(["lean_recall"])
      }),
    ),
  )
})
