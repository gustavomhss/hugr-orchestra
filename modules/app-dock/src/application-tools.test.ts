import { describe, expect, test } from "bun:test"
import { Effect, Layer } from "effect"
import { AgentV2 } from "@orchestra/core/agent"
import { AppNodeBuilder } from "@orchestra/core/effect/app-node-builder"
import { LayerNode } from "@orchestra/core/effect/layer-node"
import { PermissionV2 } from "@orchestra/core/permission"
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

  test("scopes the Linux workspace tools to the linux subagent, as V1 does", () => {
    const agents = new Map([["build", { ...AgentV2.Info.empty(AgentV2.ID.make("build")), permissions: [] }]]) as Map<
      string,
      Parameters<Parameters<AgentV2.Draft["update"]>[1]>[0]
    >
    AppDockTools.scope({
      list: () => [...agents.values()],
      get: (id) => agents.get(id),
      default: () => undefined,
      remove: (id) => void agents.delete(id),
      update: (id, fn) => {
        const agent = agents.get(id) ?? { ...AgentV2.Info.empty(id), permissions: [] }
        agents.set(id, agent)
        fn(agent)
      },
    })
    // A tool is hidden from an agent when its last rule for the tool name denies every resource.
    const visible = (agent: string, tool: string) => PermissionV2.evaluate(tool, "*", agents.get(agent)!.permissions).effect !== "deny"
    expect(["ui_look", "linux_exec", "dock_find", "dock_action"].map((tool) => visible("build", tool))).toEqual([false, false, false, false])
    expect(visible("build", "dock_read")).toBe(true)
    expect(["ui_look", "linux_exec", "todowrite"].map((tool) => visible("linux", tool))).toEqual([true, true, true])
    expect(visible("linux", "dock_read")).toBe(false)
    expect(agents.get("linux")?.mode).toBe("subagent")
  })

  test("the linux agent keeps the owner's dock rule as configured, and allows dock when none is set", () => {
    // config-agent pushes the owner's global permissions onto every agent before the scope runs.
    const cases = [
      { global: [{ action: "dock", resource: "*", effect: "ask" as const }], effect: "ask" },
      { global: [], effect: "allow" },
    ]
    for (const { global, effect } of cases) {
      const agents = new Map([["linux", { ...AgentV2.Info.empty(AgentV2.ID.make("linux")), permissions: [...global] }]]) as Map<
        string,
        Parameters<Parameters<AgentV2.Draft["update"]>[1]>[0]
      >
      AppDockTools.scope({
        list: () => [...agents.values()],
        get: (id) => agents.get(id),
        default: () => undefined,
        remove: (id) => void agents.delete(id),
        update: (id, fn) => {
          const agent = agents.get(id) ?? { ...AgentV2.Info.empty(id), permissions: [] }
          agents.set(id, agent)
          fn(agent)
        },
      })
      expect(PermissionV2.evaluate("dock", "wait", agents.get("linux")!.permissions).effect).toBe(effect)
      expect(PermissionV2.evaluate("linux", "exec", agents.get("linux")!.permissions).effect).toBe("allow")
    }
  })
})

