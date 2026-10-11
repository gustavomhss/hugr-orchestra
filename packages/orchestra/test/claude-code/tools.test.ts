import { expect } from "bun:test"
import { Effect, Schema } from "effect"
import { Client } from "@modelcontextprotocol/sdk/client/index.js"
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js"
import { ClaudeCodeTools } from "@/claude-code/tools"
import { ToolJsonSchema } from "@/tool/json-schema"
import { ToolRegistry } from "@/tool/registry"
import { Session } from "@/session/session"
import { MessageID, PartID } from "@/session/schema"
import type { SessionV1 } from "@orchestra/core/v1/session"
import { testEffect } from "../lib/effect"
import { makeHttp } from "../session/prompt.fixture"

const it = testEffect(makeHttp())

it.instance("MCP bridge advertises actual host schemas and executes real recall/compact with host permissions", () => Effect.gen(function* () {
  const sessions = yield* Session.Service
  const registry = yield* ToolRegistry.Service
  const chat = yield* sessions.create({ title: "Actual SDK tools" })
  const messageID = MessageID.ascending()
  const defs = (yield* registry.all()).filter((def) => ClaudeCodeTools.IDS.includes(def.id))
  const context = yield* Effect.context<never>()
  const asks: unknown[] = []
  const completed: SessionV1.ToolPart[] = []
  const server = ClaudeCodeTools.server({ defs, run: (effect) => Effect.runPromiseWith(context)(effect),
    claim: (tool) => Effect.succeed({ id: PartID.ascending(), sessionID: chat.id, messageID, type: "tool", tool, callID: tool,
      state: { status: "running", input: {}, time: { start: 1 } } }),
    complete: (part) => Effect.sync(() => { completed.push(part) }),
    context: (part) => ({ sessionID: chat.id, messageID, agent: "build", callID: part.callID, abort: AbortSignal.any([]), messages: [],
      extra: { claudeCode: true, canRecall: true }, metadata: () => Effect.void,
      ask: (request) => Effect.sync(() => { asks.push(request) }) }),
  })
  const client = new Client({ name: "fixture", version: "1" })
  const transports = InMemoryTransport.createLinkedPair()
  yield* Effect.addFinalizer(() => Effect.promise(() => client.close()))
  yield* Effect.promise(async () => { await server.instance.connect(transports[0]); await client.connect(transports[1]) })
  const listed = yield* Effect.promise(() => client.listTools())
  expect(listed.tools.map((tool) => tool.name).toSorted()).toEqual(ClaudeCodeTools.IDS.toSorted())
  for (const def of defs) {
    const tool = listed.tools.find((item) => item.name === def.id)
    const schema = ToolJsonSchema.fromTool(def)
    const union = Array.isArray(schema.anyOf) ? schema.anyOf : undefined
    // A union is advertised as one object holding every variant's fields; any other schema exactly as the host has it.
    if (!union) expect<unknown>(tool?.inputSchema).toEqual({ type: "object", ...schema })
    if (union) {
      expect(tool?.inputSchema).not.toHaveProperty("anyOf")
      for (const variant of union)
        for (const key of Object.keys(typeof variant === "object" && variant.properties ? variant.properties : {}))
          expect(tool?.inputSchema.properties).toHaveProperty(key)
    }
    expect(tool?._meta).toEqual({ "anthropic/alwaysLoad": true })
  }
  // context_recall is a closed union: the flattened path is exercised.
  expect(Array.isArray(ToolJsonSchema.fromTool(defs.find((def) => def.id === "context_recall")!).anyOf)).toBe(true)
  const recall = yield* Effect.promise(() => client.callTool({ name: "context_recall", arguments: { archive_list: true } }))
  const text = Schema.decodeUnknownSync(Schema.Struct({ content: Schema.Array(Schema.Struct({ type: Schema.String, text: Schema.String })) }))(recall)
  expect(text.content[0].text).toContain('"references":[]')
  expect(asks).toEqual([{ permission: "context_recall", patterns: [chat.id], always: [chat.id], metadata: {} }])
  const compact = yield* Effect.promise(() => client.callTool({ name: "context_compact", arguments: {} }))
  expect(asks.at(-1)).toEqual({ permission: "context_compact", patterns: [chat.id], always: [chat.id], metadata: {} })
  expect(JSON.stringify(compact)).toContain("next SDK resume")
  expect(completed.map((part) => [part.tool, part.state.status])).toEqual([["context_recall", "completed"], ["context_compact", "completed"]])
  const invalid = yield* Effect.promise(() => client.callTool({ name: "context_recall", arguments: { archive_list: true, query: "mixed modes" } }))
  expect(invalid.isError).toBe(true)
}), 60_000)

it.instance("an unlisted MCP tool cannot claim or execute even when its definition exists", () => Effect.gen(function* () {
  const sessions = yield* Session.Service
  const chat = yield* sessions.create({ title: "Forged SDK tool call" })
  const messageID = MessageID.ascending()
  const context = yield* Effect.context<never>()
  const claims: string[] = []
  const executions: string[] = []
  const completed: SessionV1.ToolPart[] = []
  const server = ClaudeCodeTools.server({
    defs: ["read", "bash"].map((id) => ({ id, description: id, parameters: Schema.Struct({}),
      execute: () => Effect.sync(() => { executions.push(id); return { title: id, output: id, metadata: {} } }),
    })),
    run: (effect) => Effect.runPromiseWith(context)(effect),
    claim: (tool) => Effect.sync(() => {
      claims.push(tool)
      return { id: PartID.ascending(), sessionID: chat.id, messageID, type: "tool" as const, tool, callID: tool,
        state: { status: "running" as const, input: {}, time: { start: 1 } } }
    }),
    context: (part) => ({ sessionID: chat.id, messageID, agent: "build", callID: part.callID, abort: AbortSignal.any([]),
      messages: [], metadata: () => Effect.void, ask: () => Effect.void }),
    complete: (part) => Effect.sync(() => { completed.push(part) }),
  })
  const client = new Client({ name: "forged-call", version: "1" })
  const transports = InMemoryTransport.createLinkedPair()
  yield* Effect.addFinalizer(() => Effect.promise(() => client.close()))
  yield* Effect.promise(async () => { await server.instance.connect(transports[0]); await client.connect(transports[1]) })
  expect((yield* Effect.promise(() => client.listTools())).tools.map((tool) => tool.name)).toEqual(["read"])
  const forged = yield* Effect.promise(() => client.callTool({ name: "bash", arguments: {} }))
  expect(forged.isError).toBe(true)
  expect(forged.content).toEqual([{ type: "text", text: "Orchestra tool bash is not available." }])
  expect(claims).toEqual([])
  expect(executions).toEqual([])
  expect(completed).toEqual([])
  const allowed = yield* Effect.promise(() => client.callTool({ name: "read", arguments: {} }))
  expect(allowed.isError).not.toBe(true)
  expect(claims).toEqual(["read"])
  expect(executions).toEqual(["read"])
  expect(completed.map((part) => part.state.status)).toEqual(["completed"])
}), 60_000)
