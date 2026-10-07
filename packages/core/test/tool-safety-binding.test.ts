import { expect } from "bun:test"
import path from "path"
import { randomUUID } from "node:crypto"
import { Effect, Layer, Schema, Stream } from "effect"
import { AppNodeBuilder } from "../src/effect/app-node-builder"
import { LayerNode } from "../src/effect/layer-node"
import { EventV2 } from "../src/event"
import { FSUtil } from "../src/fs-util"
import { Location } from "../src/location"
import { AbsolutePath } from "../src/schema"
import { SessionSchema } from "../src/session/schema"
import { Tool } from "../src/tool/tool"
import { ToolRegistry } from "../src/tool/registry"
import { ToolOutputStore } from "../src/tool-output-store"
import { ToolSafety } from "../src/tool-safety"
import { location } from "./fixture/location"
import { tmpdir } from "./fixture/tmpdir"
import { toolIdentity } from "./lib/tool"
import { testEffect } from "./lib/effect"

const it = testEffect(Layer.empty)

it.live("native V2 registry captures actual Location/Event services and durably records bounded outcomes without caller re-provision", () =>
  Effect.gen(function* () {
    const tmp = yield* Effect.acquireRelease(Effect.promise(() => tmpdir()), (tmp) => Effect.promise(() => tmp[Symbol.asyncDispose]()))
    const active = location(Location.Ref.make({ directory: AbsolutePath.make(tmp.path) }))
    const sessionID = SessionSchema.ID.make(`ses_${randomUUID().replaceAll("-", "")}`)
    yield* Effect.gen(function* () {
      const registry = yield* ToolRegistry.Service
      const events = yield* EventV2.Service
      const fs = yield* FSUtil.Service
      yield* fs.makeDirectory(path.join(tmp.path, "owned"))
      yield* registry.register({ write: Tool.make({
        description: "fixture write", input: Schema.Struct({ filePath: Schema.String }), output: Schema.String,
        execute: (args) => fs.writeFileString(path.join(tmp.path, args.filePath), "written").pipe(Effect.as("written"),
          Effect.mapError(() => new Tool.Failure({ message: "fixture write failed" }))),
      }) })
      const materialized = yield* registry.materialize()
      expect((yield* materialized.settle({ sessionID, ...toolIdentity, call: {
        type: "tool-call", name: "write", id: "allowed", input: { filePath: "owned/file" },
      } })).result.type).toBe("text")
      expect((yield* materialized.settle({ sessionID, ...toolIdentity, call: {
        type: "tool-call", name: "write", id: "denied", input: { filePath: "outside" },
      } })).result).toEqual({ type: "error", value: new ToolSafety.Denied({ reason: "write-outside-physical-roots" }).message })
      expect(yield* fs.exists(path.join(tmp.path, "outside"))).toBe(false)
      const evidence = yield* Stream.runCollect(events.durable({ aggregateID: sessionID }).pipe(Stream.take(3))).pipe(Effect.timeout("3 seconds"))
      const decode = Schema.decodeUnknownSync(Schema.Struct({ structured: Schema.Struct({ toolSafety: Schema.Struct({
        directory: Schema.String, projectID: Schema.String, outcome: Schema.String,
      }) }) }))
      const observations = evidence.map((event) => decode(event.data).structured.toolSafety)
      expect(observations.map((observation) => observation.outcome)).toEqual(["started", "success", "held"])
      expect(observations.every((observation) => observation.directory === tmp.path && observation.projectID === active.project.id)).toBe(true)
      yield* registry.register({ output: Tool.make({ description: "fixture output", input: Schema.String, output: Schema.String,
        execute: Effect.succeed,
      }) })
      const output = yield* registry.materialize()
      const bounded = yield* output.settle({ sessionID, ...toolIdentity, call: {
        type: "tool-call", name: "output", id: "overflow", input: "ordinary\n".repeat(10_000),
      } })
      expect(bounded.outputPaths?.length).toBe(1)
      const retained = bounded.outputPaths?.[0]
      if (bounded.result.type !== "text" || !retained) throw new Error("fixture did not engage real bounded storage")
      yield* Effect.addFinalizer(() => fs.remove(retained).pipe(Effect.orDie))
      const value = Schema.decodeUnknownSync(Schema.String)(bounded.result.value)
      expect(value).toContain("Context pressure:")
      expect(Buffer.byteLength(value)).toBeLessThanOrEqual(ToolOutputStore.MAX_BYTES)
      expect(yield* fs.readFileString(retained)).toBe("ordinary\n".repeat(10_000))
    }).pipe(
      Effect.provide(
        AppNodeBuilder.build(LayerNode.group([ToolRegistry.nativeNode, EventV2.node, FSUtil.node]), [
          [Location.node, Layer.succeed(Location.Service, active)], [ToolOutputStore.node, ToolOutputStore.nodeWithoutConfig],
        ]).pipe(Layer.provide(Layer.succeed(ToolSafety.RuntimeProfile, { writeRoots: [path.join(tmp.path, "owned")] }))),
      ),
    )
  }),
)
