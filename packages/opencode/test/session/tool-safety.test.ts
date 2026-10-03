import { expect } from "bun:test"
import { Effect } from "effect"
import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { FSUtil } from "@opencode-ai/core/fs-util"
import { CrossSpawnSpawner } from "@opencode-ai/core/cross-spawn-spawner"
import { ToolSafety } from "@opencode-ai/core/tool-safety"
import { SessionTools } from "@/session/tools"
import { testEffect } from "../lib/effect"
import { tmpdirScoped } from "../fixture/fixture"
import { Client } from "@modelcontextprotocol/sdk/client/index.js"
import { Server } from "@modelcontextprotocol/sdk/server/index.js"
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js"
import { CallToolRequestSchema } from "@modelcontextprotocol/sdk/types.js"

const it = testEffect(LayerNode.compile(LayerNode.group([ToolSafety.node, FSUtil.node, CrossSpawnSpawner.node])))

it.live("V1 execution interceptor blocks before real MCP handler writes; near match runs", () =>
  Effect.gen(function* () {
    const tmp = yield* tmpdirScoped()
    const fs = yield* FSUtil.Service
    const safety = yield* ToolSafety.Service
    const transport = InMemoryTransport.createLinkedPair()
    const server = new Server({ name: "safety-fixture", version: "1" }, { capabilities: { tools: {} } })
    const client = new Client({ name: "safety-test", version: "1" })
    yield* Effect.addFinalizer(() => Effect.promise(() => client.close()))
    yield* Effect.addFinalizer(() => Effect.promise(() => server.close()))
    server.setRequestHandler(CallToolRequestSchema, async (request) => {
      await Bun.write(`${tmp}/effect`, String(request.params.arguments?.command))
      return { content: [{ type: "text", text: "executed" }] }
    })
    yield* Effect.promise(() => server.connect(transport[0]))
    yield* Effect.promise(() => client.connect(transport[1]))
    const observations: ToolSafety.Observation[] = []
    const execute = (command: string) => SessionTools.intercept(safety, {
      tool: "fixture_execute", args: { command }, sessionID: "ses_safety", callID: "call_safety",
      directory: tmp, projectID: "project",
    }, Effect.promise(() => client.callTool({ name: "execute", arguments: { command } })),
    (observation) => Effect.sync(() => { observations.push(observation) }), () => false)
    expect((yield* Effect.flip(execute("git commit --no-verify"))).reason).toBe("known-gate-bypass")
    expect(yield* fs.exists(`${tmp}/effect`)).toBe(false)
    yield* execute("git status --short")
    expect(yield* fs.readFileString(`${tmp}/effect`)).toBe("git status --short")
    expect(observations.map((item) => item.outcome)).toEqual(["held", "started", "success"])
  }),
)

it.live("V1 interceptor withholds recognized secret result and marks error envelopes as failure", () =>
  Effect.gen(function* () {
    const safety = yield* ToolSafety.Service
    const observations: ToolSafety.Observation[] = []
    const observe = (observation: ToolSafety.Observation) => Effect.sync(() => { observations.push(observation) })
    const input = { tool: "fixture", args: {}, sessionID: "ses_safety", callID: "call_safety" }
    const secret = "gh" + "p_" + "x".repeat(40)
    expect((yield* Effect.flip(SessionTools.intercept(safety, input,
      Effect.succeed({ content: [{ type: "text", text: secret }] }), observe, () => false))).reason).toBe("recognized-secret-output")
    yield* SessionTools.intercept(safety, input, Effect.succeed({ isError: true, content: [] }), observe, () => false)
    expect(observations.map((item) => item.outcome)).toEqual(["started", "held", "started", "failure"])
    expect(JSON.stringify(observations)).not.toContain(secret)
  }),
)
