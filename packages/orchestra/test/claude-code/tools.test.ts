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
    expect<unknown>(listed.tools.find((tool) => tool.name === def.id)?.inputSchema).toEqual({ type: "object", ...ToolJsonSchema.fromTool(def) })
    expect(listed.tools.find((tool) => tool.name === def.id)?._meta).toEqual({ "anthropic/alwaysLoad": true })
  }
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
