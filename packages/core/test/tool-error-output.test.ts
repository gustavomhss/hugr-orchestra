import { expect } from "bun:test"
import { join } from "node:path"
import { AgentV2 } from "@orchestra/core/agent"
import { Config } from "@orchestra/core/config"
import { ConfigToolOutput } from "@orchestra/core/config/tool-output"
import { AppNodeBuilder } from "@orchestra/core/effect/app-node-builder"
import { LayerNode } from "@orchestra/core/effect/layer-node"
import { EventV2 } from "@orchestra/core/event"
import { FSUtil } from "@orchestra/core/fs-util"
import { Global } from "@orchestra/core/global"
import { Location } from "@orchestra/core/location"
import { SessionMessage } from "@orchestra/core/session/message"
import { SessionSchema } from "@orchestra/core/session/schema"
import { ToolRegistry } from "@orchestra/core/tool/registry"
import { Tool } from "@orchestra/core/tool/tool"
import { ToolOutputStore } from "@orchestra/core/tool-output-store"
import { Cause, Effect, Exit, Layer, Schema, type Scope } from "effect"
import { CapabilityPolicyFixture } from "./fixture/capability-policy"
import { tmpdir } from "./fixture/tmpdir"
import { testEffect } from "./lib/effect"

const it = testEffect(Layer.empty)

function withRegistry<A, E>(body: (registry: ToolRegistry.Interface, fs: FSUtil.Interface,
  configure: (bytes: number, lines: number) => void) => Effect.Effect<A, E, Scope.Scope>) {
  return Effect.acquireUseRelease(Effect.promise(() => tmpdir()), (tmp) => {
    const limits = { max_bytes: 512, max_lines: 3 }
    const layer = AppNodeBuilder.build(LayerNode.group([ToolRegistry.nativeNode, EventV2.node, Location.node,
      Global.node, FSUtil.node, ToolOutputStore.node]), [
      [Global.node, Global.layerWith({ data: join(tmp.path, "data"), home: tmp.path })],
      [Location.node, Layer.succeed(Location.Service, Location.Service.of(CapabilityPolicyFixture.placement))],
      [Config.node, Layer.succeed(Config.Service, Config.Service.of({ entries: () => Effect.succeed([
        new Config.Document({ type: "document", info: { tool_output: new ConfigToolOutput.Info({ ...limits }) } }),
      ]) }))],
    ])
    return Effect.gen(function* () {
      const registry = yield* ToolRegistry.Service
      const fs = yield* FSUtil.Service
      return yield* body(registry, fs, (bytes, lines) => { limits.max_bytes = bytes; limits.max_lines = lines })
    }).pipe(Effect.provide(layer))
  }, (tmp) => Effect.promise(() => tmp[Symbol.asyncDispose]()))
}

const context = { sessionID: SessionSchema.ID.make("ses_failure_budget"), agent: AgentV2.ID.make("test"),
  assistantMessageID: SessionMessage.ID.make("msg_failure_budget") }

it.live("canonical failure text respects dynamic byte and line limits and retains complete UTF-8 evidence", () =>
  withRegistry((registry, fs, configure) => Effect.gen(function* () {
    const message = "🙂 failure line\n".repeat(2000)
    yield* registry.register({ failure: Tool.make({ description: "Failure budget fixture", input: Schema.Struct({}),
      output: Schema.String, execute: () => Effect.fail(new Tool.Failure({ message })) }) })
    const materialization = yield* registry.materialize()
    yield* Effect.forEach([[512, 3], [1024, 7]], ([bytes, lines]) => Effect.gen(function* () {
      configure(bytes, lines)
      const settled = yield* materialization.settle({ ...context,
        call: { type: "tool-call", id: `failure-${bytes}`, name: "failure", input: {} } })
      expect(settled.result.type).toBe("error")
      expect(typeof settled.result.value).toBe("string")
      expect(Buffer.byteLength(String(settled.result.value))).toBeLessThanOrEqual(bytes)
      expect(String(settled.result.value).split("\n").length).toBeLessThanOrEqual(lines)
      expect(String(settled.result.value)).not.toContain("�")
      expect(settled.outputPaths).toHaveLength(1)
      const path = settled.outputPaths?.[0]
      if (!path) throw new Error("Failure evidence path missing")
      expect(yield* fs.readFileString(path)).toBe(message)
    }))
  })))

it.live("mixed tool failures retain unrelated defects and interruption instead of projecting a successful error settlement", () =>
  withRegistry((registry) => Effect.gen(function* () {
    const failure = new Tool.Failure({ message: "Expected leaf failure" })
    const sentinel = new Error("Unrelated leaf defect")
    const cause = Cause.combine(Cause.fail(failure), Cause.die(sentinel))
    yield* registry.register({ mixed: Tool.make({ description: "Mixed cause fixture", input: Schema.Struct({}),
      output: Schema.String, execute: () => Effect.failCause(cause) }),
      interrupted: Tool.make({ description: "Interrupted mixed cause fixture", input: Schema.Struct({}),
        output: Schema.String, execute: () => Effect.failCause(Cause.combine(Cause.fail(failure), Cause.interrupt(123))) }) })
    const materialization = yield* registry.materialize()
    const exit = yield* materialization.settle({ ...context,
      call: { type: "tool-call", id: "mixed", name: "mixed", input: {} } }).pipe(Effect.exit)
    expect(Exit.isFailure(exit)).toBe(true)
    if (!Exit.isFailure(exit)) return
    expect(exit.cause.reasons.flatMap((reason) => reason._tag === "Die" ? [reason.defect] : [])).toContain(sentinel)
    expect(exit.cause.reasons.some((reason) => reason._tag === "Die" && reason.defect === failure)).toBe(true)
    const interrupted = yield* materialization.settle({ ...context,
      call: { type: "tool-call", id: "interrupted", name: "interrupted", input: {} } }).pipe(Effect.exit)
    expect(Exit.isFailure(interrupted) && Cause.hasInterrupts(interrupted.cause)).toBe(true)
  })))
