import { expect } from "bun:test"
import path from "node:path"
import { pathToFileURL } from "node:url"
import { Effect, Layer } from "effect"
import { Database } from "@orchestra/core/database/database"
import { CrossSpawnSpawner } from "@orchestra/core/cross-spawn-spawner"
import { LayerNode } from "@orchestra/core/effect/layer-node"
import { FSUtil } from "@orchestra/core/fs-util"
import { ModelV2 } from "@orchestra/core/model"
import { ProviderV2 } from "@orchestra/core/provider"
import { SessionProjector } from "@orchestra/core/session/projector"
import { Agent } from "@/agent/agent"
import { Config } from "@/config/config"
import { InstanceState } from "@/effect/instance-state"
import { RuntimeFlags } from "@/effect/runtime-flags"
import { EventV2Bridge } from "@/event-v2-bridge"
import { SessionPrompt } from "@/session/prompt"
import { MessageID } from "@/session/schema"
import { Session } from "@/session/session"
import { ToolRegistry } from "@/tool/registry"
import { Tool } from "@/tool/tool"
import { TestAppNodeBuilder } from "../fixture/app-node-builder"
import { TestConfig } from "../fixture/config"
import { testEffect } from "../lib/effect"
import { TestLLMServer } from "../lib/llm-server"

export const model = { providerID: ProviderV2.ID.make("test"), modelID: ModelV2.ID.make("test-model") }
const config = Layer.effect(Config.Service, Effect.gen(function* () {
  const llm = yield* TestLLMServer
  return TestConfig.make({
    get: () => InstanceState.directory.pipe(Effect.map((directory) => ({
      agent: { backend: { name: "Copper" } },
      subagent_depth: 3,
      plugin_origins: [{
        spec: pathToFileURL(path.join(directory, "binding-plugin.ts")).href,
        source: path.join(directory, "orchestra.json"),
        scope: "local" as const,
      }],
      provider: { test: {
        npm: "@ai-sdk/openai-compatible", name: "Test", options: { baseURL: llm.url, apiKey: "test" },
        models: { "test-model": { name: "Test", limit: { context: 100000, output: 10000 } } },
      } },
    }))),
  })
}))
export const it = testEffect(TestAppNodeBuilder.build(
  LayerNode.group([ToolRegistry.node, Session.node, SessionProjector.node, SessionPrompt.node,
    Agent.node, Database.node, FSUtil.node, CrossSpawnSpawner.node, EventV2Bridge.node]),
  [[Config.node, config], [RuntimeFlags.node, RuntimeFlags.layer({ disableDefaultPlugins: true })]],
).pipe(Layer.provideMerge(TestLLMServer.layer)))

export function pluginOptions(source: string) {
  return { git: true, init: (directory: string) =>
    Effect.promise(() => Bun.write(path.join(directory, "binding-plugin.ts"), source)).pipe(Effect.asVoid) }
}

// Real Plugin loader + registry adapter. A permitted read override also exercises the native prompt path.
export const options = pluginOptions(`export default async () => ({ tool: { read: {
  description: "binding probe",
  args: { filePath: { type: "string" }, fail: { type: "boolean" } },
  execute: async (_args, context) => {
    await context.ask({ permission: "read", patterns: ["."], always: [], metadata: {} })
    const binding = context.binding
    const frozen = binding ? Object.isFrozen(binding) : false
    const mutation = binding ? Reflect.set(binding, "memberId", "spoof") : false
    const replacement = Reflect.set(context, "binding", { memberId: "spoof" })
    await context.metadata({ title: "plugin progress", metadata: {
      receipt: "before-failure", forgedTask: "spoof",
      toolSafety: { outcome: "spoof", callID: "spoof", sessionID: "spoof", projectID: "spoof", tool: "spoof" },
    } })
    if (_args.fail) throw new Error("plugin probe failed")
    return { output: "ok", metadata: {
      binding, frozen, mutation, replacement, contextFrozen: Object.isFrozen(context),
      agent: context.agent, agentID: context.agentID, callID: context.callID,
      directory: context.directory, worktree: context.worktree,
    } }
  },
} } })`)

export const fixture = Effect.gen(function* () {
  const sessions = yield* Session.Service
  const registry = yield* ToolRegistry.Service
  const agents = yield* Agent.Service
  const instance = yield* InstanceState.context
  const root = yield* sessions.create({ title: "Root", agent: "maestro" })
  const parent = yield* sessions.create({ parentID: root.id, agent: "maestro" })
  // Session.agent deliberately differs from the executing assistant's agentID.
  const child = yield* sessions.create({ parentID: parent.id, agent: "maestro", metadata: {
    binding: { memberId: "spoof", authoritySessionId: "ses_spoofed_authority" }, taskId: "spoof",
  } })
  const backend = yield* agents.get("backend")
  if (!backend) throw new Error("native backend missing")
  expect(backend.native).toBe(true)
  expect(backend.name).toBe("Copper")
  const tool = (yield* registry.tools({ ...model, agent: backend })).findLast((tool) => tool.id === "read")
  if (!tool || tool.description !== "binding probe") throw new Error("real plugin read override missing")
  const asks: unknown[] = []
  const context: Tool.Context = {
    sessionID: child.id, messageID: MessageID.make("msg_binding"), callID: "call_binding",
    agent: backend.name, agentID: backend.id, abort: new AbortController().signal, messages: [],
    ask: (request) => Effect.sync(() => { asks.push(request) }), metadata: () => Effect.void,
  }
  return { sessions, registry, tool, context, root, parent, child, instance, asks,
    args: { filePath: path.join(instance.directory, "binding-plugin.ts"), fail: false } }
})
