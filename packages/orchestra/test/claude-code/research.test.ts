import { expect } from "bun:test"
import path from "node:path"
import { Client } from "@modelcontextprotocol/sdk/client/index.js"
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js"
import { Cause, Effect, Exit, Layer, Schema } from "effect"
import { eq } from "drizzle-orm"
import { Database } from "@orchestra/core/database/database"
import { EventV2 } from "@orchestra/core/event"
import { EventTable } from "@orchestra/core/event/sql"
import { ModelV2 } from "@orchestra/core/model"
import { ProviderV2 } from "@orchestra/core/provider"
import { ResearchEvent } from "@orchestra/schema/research-event"
import { Agent } from "@/agent/agent"
import { ClaudeCodeSDK } from "@/claude-code/sdk"
import { LogicalTask } from "@/maestro/logical-task"
import { ResearchExecution } from "@/research/allowance"
import { NativeResearchTask } from "../research/fixtures/native-task"
import { testEffect } from "../lib/effect"

// A scripted Claude Code: each query records its options and plays the next script, which reaches Orchestra's tools
// through the in-process MCP server the engine hands the SDK, as Claude Code does.
type Options = {
  tools?: string[]
  maxTurns?: number
  settings?: { autoCompactEnabled?: boolean }
  systemPrompt: { append?: string }
  mcpServers: Record<string, { instance: { connect: (transport: InMemoryTransport) => Promise<void> } }>
}
type Script = (options: Options) => AsyncGenerator<unknown>
const queries: Options[] = []
const scripts: Script[] = []
const sdk = Layer.succeed(ClaudeCodeSDK.Service, ClaudeCodeSDK.Service.of({
  query: ((params: { options: Options }) => {
    queries.push(params.options)
    return scripts.shift()!(params.options)
  }) as never,
}))
const it = testEffect(NativeResearchTask.make([[ClaudeCodeSDK.node, sdk]]))
const engine = { agent: { jimmy: { engine: "claude-code", model: "anthropic/claude-opus-5-5" } } }

const frame = { parent_tool_use_id: null, uuid: "u", session_id: "sdk-jimmy" }
const init = { type: "system", subtype: "init", ...frame }
const assistant = (id: string, content: unknown[], stop: string) =>
  ({ type: "assistant", message: { id, content, stop_reason: stop, usage: { input_tokens: 5, output_tokens: 2 } }, ...frame })
const connect = async (options: Options) => {
  const client = new Client({ name: "claude-code", version: "1.0.0" })
  const [local, remote] = InMemoryTransport.createLinkedPair()
  await Promise.all([client.connect(local), options.mcpServers.orchestra.instance.connect(remote)])
  return client
}
const charges = Effect.fn("ClaudeCodeResearchTest.charges")(function* (sessionID: string) {
  const database = yield* Database.Service
  const rows = yield* database.db.select().from(EventTable).where(eq(EventTable.aggregate_id, sessionID)).all().pipe(Effect.orDie)
  return rows.filter((row) => row.type === EventV2.versionedType(ResearchEvent.AllowanceCharged.type, 1))
    .map((row) => Schema.decodeUnknownSync(ResearchEvent.AllowanceCharged.data)(row.data))
})

it.instance("a native research dispatch runs on Claude Code with only its Orchestra tools, charged, and reports to the parent", () =>
  Effect.gen(function* () {
    queries.length = 0
    scripts.length = 0
    const fixture = yield* NativeResearchTask.setup(engine)
    yield* Effect.addFinalizer(() => fixture.sessions.remove(fixture.parent.id).pipe(Effect.orDie))
    yield* fixture.fs.writeFileString(path.join(fixture.instance.directory, "evidence.txt"), "Only version 1.\n")
    const seen: { tools: string[]; read: string[]; error?: boolean } = { tools: [], read: [] }
    scripts.push(async function* (options) {
      const client = await connect(options)
      seen.tools = (await client.listTools()).tools.map((tool) => tool.name)
      yield init
      yield assistant("msg_read", [{ type: "tool_use", id: "toolu_read", name: "mcp__orchestra__read", input: { filePath: "evidence.txt" } }], "tool_use")
      const read = await client.callTool({ name: "read", arguments: { filePath: "evidence.txt" } })
      const content = Array.isArray(read.content) ? read.content : []
      seen.read = content.flatMap((item) => item.type === "text" ? [item.text] : [])
      seen.error = read.isError === true
      yield { type: "user", message: { role: "user", content: [{ type: "tool_result", tool_use_id: "toolu_read", content }] }, ...frame }
      yield assistant("msg_answer", [{ type: "text", text: "Engine answer: only version 1 applies." }], "end_turn")
      yield { type: "result", subtype: "success", total_cost_usd: 0.02, ...frame }
      await client.close()
    })
    const called = yield* fixture.call({ description: "Engine discovery", prompt: "Which version applies?", subagent_type: "jimmy" }, "engine-discovery")
    if (Exit.isFailure(called.exit)) throw new Error(Cause.pretty(called.exit.cause))

    // Claude Code's own tools and compaction are off; the turn bound is the dispatch's provider allowance.
    expect(queries).toHaveLength(1)
    expect(queries[0].tools).toEqual([])
    expect(queries[0].maxTurns).toBe(24)
    expect(queries[0].settings).toEqual({ autoCompactEnabled: false })
    expect(queries[0].systemPrompt.append).toContain("jimmy-research")
    expect(seen.tools).toEqual(expect.arrayContaining(["read", "research_capture", "research_record", "research_view", "atlas_context"]))
    for (const name of ["bash", "edit", "write", "task", "apply_patch"]) expect(seen.tools).not.toContain(name)

    // The read ran through the registry: captured as retained source and charged to the dispatch.
    expect(seen.error).toBe(false)
    expect(seen.read.join("\n")).toContain("Retained source evidence")
    const [child] = yield* fixture.sessions.children(fixture.parent.id)
    const ledger = yield* charges(child.id)
    expect(ledger.every((entry) => entry.dispatchCallID === "engine-discovery")).toBe(true)
    expect(ledger.filter((entry) => entry.kind === "provider")).toHaveLength(2)
    expect(ledger.filter((entry) => entry.kind === "tool").map((entry) => entry.operation))
      .toEqual([expect.stringMatching(/:toolu_read:read$/)])
    expect(ledger.some((entry) => entry.kind === "bytes")).toBe(true)
    const history = yield* fixture.sessions.messages({ sessionID: child.id })
    expect(history.flatMap((message) => message.parts)).toContainEqual(expect.objectContaining({ type: "tool", tool: "read",
      callID: "toolu_read", state: expect.objectContaining({ status: "completed" }) }))

    // The parent receives Jimmy's final text as on Orchestra's loop.
    expect(called.exit.value.output).toContain("Engine answer: only version 1 applies.")
  }), { git: true }, 120_000)

it.instance("the dispatch allowance bounds Claude Code's model turns and its exhaustion is named", () =>
  Effect.gen(function* () {
    queries.length = 0
    scripts.length = 0
    const fixture = yield* NativeResearchTask.setup(engine)
    yield* Effect.addFinalizer(() => fixture.sessions.remove(fixture.parent.id).pipe(Effect.orDie))
    const execution = yield* ResearchExecution.Service
    const agents = yield* Agent.Service
    const jimmy = yield* agents.get("jimmy")
    if (!jimmy) throw new Error("Jimmy is unavailable")
    const child = yield* fixture.sessions.create({ title: "discovery", agent: "jimmy", parentID: fixture.parent.id })
    yield* LogicalTask.ensure({ executionSessionID: child.id, authoritySessionID: fixture.parent.id,
      projectID: child.projectID, memberID: "jimmy", source: "host" })
    const dispatch = (id: string, spent: number) => execution.enter(child.id, id, Effect.gen(function* () {
      for (let call = 0; call < spent; call++) yield* execution.provider({ sessionID: child.id, agent: jimmy }, Effect.void)
      return yield* fixture.prompt.prompt({ sessionID: child.id, agent: "jimmy",
        model: { providerID: ProviderV2.ID.make("anthropic"), modelID: ModelV2.ID.make("claude-opus-5-5") },
        parts: [{ type: "text", text: `Investigate ${id}` }] })
    }))
    const exhausted = (result: { info: { role: string } & { error?: { data?: unknown } } }) =>
      expect(result.info.error?.data).toMatchObject({ message: expect.stringContaining("Research provider allowance exhausted (24/24)") })

    // One call left: the second model message would be the 25th provider call.
    scripts.push(async function* () {
      yield init
      yield assistant("msg_last", [{ type: "text", text: "last allowed call" }], "tool_use")
      yield assistant("msg_over", [{ type: "text", text: "one call too many" }], "end_turn")
      yield { type: "result", subtype: "success", ...frame }
    })
    exhausted(yield* dispatch("over-bound", 23))
    expect(queries[0].maxTurns).toBe(1)
    expect((yield* charges(child.id)).filter((entry) => entry.dispatchCallID === "over-bound")).toHaveLength(24)

    // Claude Code stopping at the bound reports the same exhaustion.
    scripts.push(async function* () {
      yield init
      yield assistant("msg_bound", [{ type: "text", text: "bounded call" }], "tool_use")
      yield { type: "result", subtype: "error_max_turns", errors: [], ...frame }
    })
    exhausted(yield* dispatch("at-bound", 23))
    expect(queries[1].maxTurns).toBe(1)

    // Nothing left: no Claude Code process starts.
    exhausted(yield* dispatch("spent", 24))
    expect(queries).toHaveLength(2)
    expect(scripts).toHaveLength(0)
  }), { git: true }, 120_000)
