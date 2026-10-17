import { expect } from "bun:test"
import fs from "node:fs/promises"
import path from "node:path"
import { Effect, Schema } from "effect"
import { Client } from "@modelcontextprotocol/sdk/client/index.js"
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js"
import { ClaudeHostMcp } from "@/claude-code/host/mcp"
import { ToolRegistry } from "@/tool/registry"
import { Session } from "@/session/session"
import type { Tool } from "@/tool/tool"
import { TestInstance } from "../../fixture/fixture"
import { testEffect } from "../../lib/effect"
import { makeHttp } from "../../session/prompt.fixture"
import { BridgeFixture } from "./bridge-fixture"

const it = testEffect(makeHttp())

// Claude Code's built-in tools, lowercased, and the Orchestra ids that duplicate them.
const DUPLICATES = ["bash", "read", "write", "edit", "apply_patch", "grep", "glob", "webfetch", "websearch", "task", "todowrite",
  "question", "skill", "lsp", "agent", "notebookedit", "askuserquestion"]

const Text = Schema.Struct({ content: Schema.Array(Schema.Struct({ type: Schema.String, text: Schema.String })), isError: Schema.optional(Schema.Boolean) })

const connect = Effect.fnUntraced(function* (server: ReturnType<typeof ClaudeHostMcp.server>) {
  const client = new Client({ name: "host-fixture", version: "1" })
  const transports = InMemoryTransport.createLinkedPair()
  yield* Effect.addFinalizer(() => Effect.promise(() => client.close()))
  yield* Effect.promise(async () => { await server.instance.connect(transports[0]); await client.connect(transports[1]) })
  return client
})

function fake(id: string): Tool.Def {
  return { id, description: id, parameters: Schema.Struct({}), execute: () => Effect.succeed({ title: id, output: id, metadata: {} }) }
}

// `task` is the one served duplicate: a Relay workflow dispatch needs Orchestra's own Task (the gate holds any other use).
it.instance("the orchestra server lists no Claude Code built-in duplicate but the workflow task", () => Effect.gen(function* () {
  const sessions = yield* Session.Service
  const registry = yield* ToolRegistry.Service
  const chat = yield* sessions.create({ title: "Host MCP listing" })
  const all = yield* registry.all()
  // Positive controls: the registry holds both built-in duplicates and additive tools.
  expect(all.map((def) => def.id)).toEqual(expect.arrayContaining(["bash", "read", "task", "context_recall", "context_compact", "maestro_record_review"]))
  const served = ClaudeHostMcp.exposed(all).map((def) => def.id)
  expect(served).toEqual(expect.arrayContaining(["context_recall", "maestro_record_review", "maestro_request_review", "atlas_memory_recall"]))
  expect(served.filter((id) => DUPLICATES.includes(id.toLowerCase()))).toEqual([ClaudeHostMcp.WORKFLOW_TASK])
  expect(served).not.toContain("context_compact")
  expect(served).not.toContain("invalid")

  const client = yield* connect(ClaudeHostMcp.server({ sessionID: chat.id, directory: "/", worktree: "/", agent: "maestro",
    abort: new AbortController(), tools: [...all, fake("dock_click"), fake("research_capture"), fake("process")] }))
  const listed = (yield* Effect.promise(() => client.listTools())).tools.map((tool) => tool.name)
  expect(listed).toEqual(expect.arrayContaining(["context_recall", "dock_click", "research_capture", "process", ClaudeHostMcp.GRANT]))
  expect(listed.filter((name) => DUPLICATES.includes(name.toLowerCase()))).toEqual([ClaudeHostMcp.WORKFLOW_TASK])
  expect(listed).not.toContain("context_compact")
  expect(new Set(listed).size).toBe(listed.length)
}), 60_000)

it.instance("direct server keeps the first duplicate definition for both listing and execution and owns task_grant", () => Effect.gen(function* () {
  const fixture = yield* BridgeFixture.make()
  const first: Tool.Def = { ...fake("fixture_duplicate"), description: "First definition",
    parameters: Schema.Struct({ value: Schema.String }),
    execute: (args) => Effect.succeed({ title: "First", output: JSON.stringify(args), metadata: {} }) }
  const later: Tool.Def = { ...fake(first.id), description: "Later definition", parameters: Schema.Struct({ later: Schema.Number }) }
  const client = yield* fixture.client([first, later, fake(ClaudeHostMcp.GRANT), fake("bash"), fake("context_compact")])
  const listed = (yield* Effect.promise(() => client.listTools())).tools
  expect(listed.map((tool) => tool.name)).toEqual([first.id, ClaudeHostMcp.GRANT])
  expect(listed[0]).toMatchObject({ description: first.description, inputSchema: { required: ["value"], properties: { value: { type: "string" } } } })
  expect(listed[1].inputSchema).toMatchObject({ required: ["seat", "writePaths", "purpose"] })
  const args = { value: "accepted first definition" }
  yield* fixture.call({ id: "first-definition", tool: first.id, args })
  const result = Schema.decodeUnknownSync(Text)(yield* Effect.promise(() => client.callTool({ name: first.id,
    arguments: fixture.arguments("first-definition") })))
  expect(result.isError).toBeUndefined()
  expect(result.content[0].text).toBe(JSON.stringify(args))
}), 60_000)

it.instance("task_grant validates like Task, round-trips to the per-session grant map, and is named back from a prompt", () => Effect.gen(function* () {
  const sessions = yield* Session.Service
  const instance = yield* TestInstance
  const chat = yield* sessions.create({ title: "Host grants" })
  const fixture = yield* BridgeFixture.make(chat.id)
  const client = yield* fixture.client()
  const call = (args: Record<string, unknown>) => Effect.gen(function* () {
    const id = crypto.randomUUID()
    yield* fixture.call({ id, tool: ClaudeHostMcp.GRANT, args })
    const result = yield* Effect.promise(() => client.callTool({ name: ClaudeHostMcp.GRANT, arguments: fixture.arguments(id) }))
    fixture.bridge.release(id)
    return Schema.decodeUnknownSync(Text)(result)
  })

  const granted = yield* call({ seat: "archie", writePaths: ["docs/plan", "docs/plan"], purpose: "Write the migration proposal" })
  expect(granted.isError).toBeUndefined()
  const grantID = Schema.decodeUnknownSync(Schema.fromJsonString(Schema.Struct({ grantID: Schema.String })))(granted.content[0].text).grantID
  expect(grantID).toStartWith("grt_")
  const root = yield* Effect.promise(() => fs.realpath(instance.directory))
  expect(ClaudeHostMcp.grants(chat.id).get(grantID)).toMatchObject({
    grantID, sessionID: chat.id, seat: "archie", writePaths: ["docs/plan", "docs/plan"],
    writeRoots: [path.join(root, "docs", "plan")], purpose: "Write the migration proposal",
  })
  expect(ClaudeHostMcp.referenced(`Write the proposal.\ngrantID: ${grantID}\n`)).toBe(grantID)
  expect(ClaudeHostMcp.referenced(`grantID: ${grantID} and more`)).toBeUndefined()

  // An empty grant is a read-only dispatch.
  const empty = yield* call({ seat: "backend", writePaths: [], purpose: "Read only" })
  const emptyID = Schema.decodeUnknownSync(Schema.fromJsonString(Schema.Struct({ grantID: Schema.String })))(empty.content[0].text).grantID
  expect(ClaudeHostMcp.grants(chat.id).get(emptyID)?.writeRoots).toEqual([])

  for (const [args, reason] of [
    [{ seat: "lucy", writePaths: ["docs"], purpose: "x" }, "takes no write-root grant"],
    [{ seat: "nobody", writePaths: ["docs"], purpose: "x" }, "unknown seat"],
    [{ seat: "backend", writePaths: [path.join(root, "src")], purpose: "x" }, "write-path-absolute"],
    [{ seat: "backend", writePaths: ["../outside"], purpose: "x" }, "write-path-escape"],
    [{ seat: "backend", purpose: "x" }, ""],
  ] as const) {
    const refused = yield* call(args)
    expect(refused.isError).toBe(true)
    expect(refused.content[0].text).toContain(reason)
  }
  expect(ClaudeHostMcp.grants(chat.id).size).toBe(2)
  // Grants are per session.
  expect(ClaudeHostMcp.grants("ses_other").size).toBe(0)
  ClaudeHostMcp.release(chat.id)
  expect(ClaudeHostMcp.grants(chat.id).size).toBe(0)
}), 60_000)

it.instance("without the host bridge every call fails closed and issues no grant", () => Effect.gen(function* () {
  const sessions = yield* Session.Service
  const chat = yield* sessions.create({ title: "Detached host server" })
  const client = yield* connect(ClaudeHostMcp.server({ sessionID: chat.id, directory: "/", worktree: "/", agent: "maestro",
    abort: new AbortController() }))
  const result = yield* Effect.promise(() => client.callTool({ name: ClaudeHostMcp.GRANT,
    arguments: { seat: "archie", writePaths: ["docs"], purpose: "x" } }).catch((error: unknown) => ({ isError: true, error })))
  expect(result.isError).toBe(true)
  expect(ClaudeHostMcp.grants(chat.id).size).toBe(0)
}), 60_000)
