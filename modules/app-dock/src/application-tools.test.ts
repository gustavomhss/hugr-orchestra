import { describe, expect, test } from "bun:test"
import { Effect, Layer } from "effect"
import { AppNodeBuilder } from "@orchestra/core/effect/app-node-builder"
import { LayerNode } from "@orchestra/core/effect/layer-node"
import { ApplicationTools } from "@orchestra/core/tool/application-tools"
import { Tool } from "@orchestra/core/tool/tool"
import { AppDockTools } from "./application-tools"
import { fakePort, type Envelope } from "./app-dock.fixture"

const context = {
  sessionID: "ses_dock",
  agent: "build",
  assistantMessageID: "msg_dock",
  toolCallID: "call_dock",
} as unknown as Tool.Context

describe("AppDockTools", () => {
  test("registers the Dock and Linux workspace tools and runs a call through the transport", async () => {
    const f = fakePort()
    const asked: unknown[] = []
    f.port.postMessage = (message: unknown) => {
      f.sent.push(message)
      const envelope = message as Envelope
      if (envelope.type === "dock.rpc")
        queueMicrotask(() => f.deliver({ type: "dock.rpc.result", id: envelope.id, ok: true, value: { waited: envelope.args.milliseconds } }))
    }
    const tools = AppDockTools.applicationTools(f.port, () =>
      Effect.succeed({ directory: "/repo", ask: async (input) => void asked.push(input) }),
    )

    const entries = await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const registry = yield* ApplicationTools.Service
          yield* registry.register(tools)
          return registry.entries()
        }),
      ).pipe(Effect.provide(AppNodeBuilder.build(LayerNode.group([ApplicationTools.node])) as Layer.Layer<ApplicationTools.Service>)),
    )
    expect([...entries.keys()]).toEqual(expect.arrayContaining(["dock_read", "dock_wait", "ui_look", "linux_exec"]))
    expect(Tool.definition("dock_wait", tools.dock_wait!).inputSchema).toMatchObject({
      type: "object",
      properties: { milliseconds: { type: "number" } },
    })

    const output = await Effect.runPromise(
      Tool.settle(tools.dock_wait!, { type: "tool-call", id: "call_dock", name: "dock_wait", input: { milliseconds: 5 } }, context),
    )
    expect(asked).toEqual([expect.objectContaining({ permission: "dock", patterns: ["wait"] })])
    expect(f.sent).toEqual([expect.objectContaining({ type: "dock.rpc", op: "wait", args: expect.objectContaining({ milliseconds: 5 }) })])
    expect(JSON.stringify(output.content)).toContain("waited")
  })
})
