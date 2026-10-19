import { expect } from "bun:test"
import { Context, Effect, Layer, Option, Schema } from "effect"
import path from "node:path"
import type { HookJSONOutput, Query } from "@anthropic-ai/claude-agent-sdk"
import { Client } from "@modelcontextprotocol/sdk/client/index.js"
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js"
import { ResearchRecords } from "@orchestra/core/research/records"
import { Research } from "@orchestra/schema/research"
import { ClaudeCodeSDK } from "@orchestra/engine-claude-code/sdk"
import { ClaudeHost } from "@/claude-code/host/session"
import { ClaudeEngineFixture } from "../engine-fixture"
import { testEffect } from "../../lib/effect"
import { makeHttp } from "../../session/prompt.fixture"

const scripts: ClaudeEngineFixture.Script[] = []
const scopes: { sessionID: string; action: Research.ViewInput["action"]; present: boolean }[] = []

// Observe the caller of the real ledger service, without adding it to public fixture outputs.
// Keep its production dependencies: only the constructor's returned view method is decorated.
const records = {
  ...ResearchRecords.node,
  implementation: Layer.effect(ResearchRecords.Service, Effect.gen(function* () {
    const real = yield* ResearchRecords.Service.pipe(Effect.provide(ResearchRecords.layer))
    return ResearchRecords.Service.of({
      ...real,
      view: (binding, input) => Effect.gen(function* () {
        const service = yield* Effect.serviceOption(ResearchRecords.Service)
        scopes.push({ sessionID: binding.executionSessionID, action: input.action, present: Option.isSome(service) })
        return yield* real.view(binding, input)
      }),
    })
  })),
}

// The SDK transport is scripted; host launch, LayerNode resolution, hooks, MCP and records remain real.
const sdk = Layer.mock(ClaudeCodeSDK.Service, {
  query: (params) => {
    const script = scripts.shift()
    if (!script || typeof params.prompt === "string") throw new Error("Expected one streaming SDK script")
    const frames = script(params.prompt, params)
    return Object.assign(frames, {
      close: () => { void frames.return(undefined) },
      interrupt: async () => undefined,
      stopTask: async () => { throw new Error("Unexpected research stop in bounded scope test") },
      accountInfo: async () => ({ subscriptionType: "Claude Max", apiProvider: "firstParty" }),
      getContextUsage: async () => ({ totalTokens: 10, maxTokens: 200_000, percentage: 0 }),
    }) as unknown as Query
  },
})

const it = testEffect(makeHttp({ realSummary: true, replacements: [
  [ClaudeCodeSDK.node, sdk],
  [ResearchRecords.node, records],
] }))

it.instance("host captures private ResearchRecords for qualified research handoff through SDK callbacks", () => Effect.gen(function* () {
  scripts.length = 0
  scopes.length = 0
  const fixture = yield* ClaudeEngineFixture.setup()
  const host = yield* ClaudeHost.Service
  yield* Effect.addFinalizer(() => host.release(fixture.chat.id))
  // Public exposure would let launch's caller context hide a missing direct host dependency.
  expect(Option.isNone(yield* Effect.serviceOption(ResearchRecords.Service))).toBe(true)
  const client = new Client({ name: "research-scope-sdk", version: "1" })
  yield* Effect.addFinalizer(() => Effect.promise(() => client.close()))
  const retained: { claim?: Research.RecordRef; final?: string; post?: HookJSONOutput } = {}
  const frame = ClaudeEngineFixture.frame
  const conditions = ["release 1 only", "enabled mode only"]
  yield* Effect.promise(() => Bun.write(path.join(fixture.chat.directory, "conditions.txt"), "Support holds in release 1 with enabled mode.\n"))
  scripts.push(async function* (input, params) {
    const first = await input[Symbol.asyncIterator]().next()
    if (first.done) throw new Error("Host did not submit its admitted prompt")
    yield { type: "system", subtype: "init", model: "claude-haiku-4-5-20251001", ...frame }
    const pre = params.options?.hooks?.PreToolUse?.[0].hooks[0]
    const post = params.options?.hooks?.PostToolUse?.[0].hooks[0]
    if (!pre || !post) throw new Error("Host did not wire research callbacks")
    const base = { session_id: frame.session_id, transcript_path: "/tmp/scripted-research-scope", cwd: fixture.chat.directory }
    const signal = new AbortController().signal
    const task = { subagent_type: "orchestra:jimmy-quick", description: "Investigate conditions",
      prompt: "Find the applicability conditions.", run_in_background: false }
    yield { type: "assistant", ...frame, uuid: "scope-agent-frame", message: { id: "msg_scope_agent", content: [
      { type: "tool_use", id: "scope-agent", name: "Agent", input: task },
    ], stop_reason: "tool_use", usage: {} } }
    expect(await pre({ ...base, hook_event_name: "PreToolUse", tool_name: "Agent", tool_use_id: "scope-agent", tool_input: task },
      "scope-agent", { signal })).toMatchObject({ hookSpecificOutput: { permissionDecision: "allow" } })
    yield { type: "system", subtype: "task_started", task_id: "scope-task", tool_use_id: "scope-agent",
      description: task.description, subagent_type: task.subagent_type, is_backgrounded: false, task_type: "local_agent", ...frame }
    const server = params.options?.mcpServers?.orchestra
    if (!server || server.type !== "sdk") throw new Error("Missing host-owned MCP server")
    const transports = InMemoryTransport.createLinkedPair()
    await server.instance.connect(transports[0])
    await client.connect(transports[1])
    // The seat's tool_use frame, then the real PreToolUse admission, MCP call and PostToolUse of mcp__orchestra__<name>.
    const use = (toolUseID: string, name: string, args: Record<string, unknown>) => ({ type: "assistant" as const, ...frame,
      parent_tool_use_id: "scope-agent", uuid: `${toolUseID}-frame`, message: { id: `msg_${toolUseID}`, content: [
        { type: "tool_use", id: toolUseID, name: `mcp__orchestra__${name}`, input: args },
      ], stop_reason: "tool_use", usage: {} } })
    const call = async (toolUseID: string, name: string, args: Record<string, unknown>) => {
      const admitted = await pre({ ...base, hook_event_name: "PreToolUse", agent_id: "scope-task", agent_type: "orchestra:jimmy-quick",
        tool_name: `mcp__orchestra__${name}`, tool_use_id: toolUseID, tool_input: args }, toolUseID, { signal })
      expect(admitted).toMatchObject({ hookSpecificOutput: { permissionDecision: "allow" } })
      const accepted = "hookSpecificOutput" in admitted && admitted.hookSpecificOutput?.hookEventName === "PreToolUse"
        ? admitted.hookSpecificOutput.updatedInput : undefined
      if (!accepted) throw new Error("Missing research dispatch receipt")
      const result = Schema.decodeUnknownSync(Schema.Struct({
        isError: Schema.optional(Schema.Boolean),
        content: Schema.Array(Schema.Struct({ type: Schema.Literal("text"), text: Schema.String })),
      }))(await client.callTool({ name, arguments: accepted }))
      expect(result.isError).toBeUndefined()
      await post({ ...base, hook_event_name: "PostToolUse", agent_id: "scope-task", tool_name: `mcp__orchestra__${name}`,
        tool_use_id: toolUseID, tool_input: args, tool_response: result.content[0].text }, toolUseID, { signal })
      // An inquiry reply is its first line; the rest is the inquiry snapshot.
      return Schema.decodeUnknownSync(Schema.UnknownFromJsonString)(result.content[0].text.split("\n")[0])
    }
    const capture = { kind: "file", path: "conditions.txt" }
    yield use("scope-capture", "research_capture", capture)
    const source = Schema.decodeUnknownSync(Captured)(await call("scope-capture", "research_capture", capture))
    const open = { action: "open", question: "When does support hold?", subquestions: ["Which conditions apply"], profile: "understand" }
    yield use("scope-open", "inquiry", open)
    const opened = Schema.decodeUnknownSync(Schema.Struct({ subquestions: Schema.Array(Research.RecordRef) }))(await call("scope-open", "inquiry", open))
    // Positive control: the registry's private service really stores a nonempty qualified claim.
    const claim = { action: "claim", subquestion: opened.subquestions[0], proposition: "Support is conditional", nature: "extraction",
      conditions, evidence: [{ source: source.ref, quote: "release 1 with enabled mode" }] }
    yield use("scope-record", "inquiry", claim)
    retained.claim = Schema.decodeUnknownSync(Schema.Struct({ claim: Research.RecordRef }))(await call("scope-record", "inquiry", claim)).claim
    yield use("scope-check", "inquiry", { action: "check" })
    expect(await call("scope-check", "inquiry", { action: "check" })).toMatchObject({ check: { verdict: "pass" } })
    const close = { action: "close", sufficiency: "partial", answer: "Support is conditional.", limitations: ["No runtime observation"] }
    yield use("scope-close", "inquiry", close)
    expect(await call("scope-close", "inquiry", close)).toEqual({ closed: "partial", check: "pass" })
    retained.final = "Support is conditional."
    retained.post = await post({ ...base, hook_event_name: "PostToolUse", tool_name: "Agent", tool_use_id: "scope-agent",
      tool_input: task, tool_response: { status: "completed", agentId: "scope-task", content: [{ type: "text", text: retained.final }] } },
      "scope-agent", { signal })
    await client.close()
    yield { type: "assistant", ...frame, uuid: "scope-answer-frame", message: { id: "msg_scope_answer",
      content: [{ type: "text", text: "Qualified research handed back" }], stop_reason: "end_turn", usage: {} } }
    yield { type: "result", subtype: "success", is_error: false, stop_reason: "end_turn", total_cost_usd: 0, ...frame }
    for await (const _ of input) {}
  })
  const admitted = yield* fixture.prompt.prompt({ sessionID: fixture.chat.id, ...ClaudeEngineFixture.say("Investigate conditions"), noReply: true })
  if (admitted.info.role !== "user") throw new Error("Missing admitted user")
  // Do not repair the callback scope with a service supplied by the turn caller.
  yield* host.turn({ sessionID: fixture.chat.id, user: admitted.info }).pipe(
    Effect.updateContext((context: Context.Context<never>) => Context.omit(ResearchRecords.Service)(context)),
  )
  const children = yield* fixture.sessions.children(fixture.chat.id)
  expect(children).toHaveLength(1)
  // Restoring all host Records-fix hunks to the prior composition leaves registry execution working,
  // but DiscoveryResult cannot find the service and never reaches its real corpus read, the last of these five:
  // research_capture, inquiry check, inquiry close (its check, then its card's documents), DiscoveryResult.assemble.
  expect(scopes.filter((scope) => scope.sessionID === children[0].id && scope.action === "corpus").map((scope) => scope.present))
    .toEqual([true, true, true, true, true])
  expect(scopes.filter((scope) => scope.sessionID === children[0].id && scope.action === "record").map((scope) => scope.present)).toEqual([true])
  const part = (yield* fixture.sessions.messages({ sessionID: fixture.chat.id })).flatMap((message) => message.parts)
    .find((part) => part.type === "tool" && part.callID === "scope-agent")
  if (part?.type !== "tool" || part.state.status !== "completed" || !retained.claim || !retained.final)
    throw new Error("Missing completed qualified research handoff")
  expect(part.state.metadata.workResult).toMatchObject({
    schema: "discovery-work-result-v1", referencesChecked: true, card: { parsed: true },
    discovery: { schema: "jimmy-card-v2", sufficiency: "partial", answer: retained.final, check: { verdict: "pass" } },
    qualifications: { records: [{ kind: "finding", id: retained.claim.id, revision: retained.claim.revision, conditions }],
      complete: true, omitted: 0, total: 1 },
  })
  // A partial card is never promoted to done.
  expect(part.state.metadata.workResult.outcome).toBeUndefined()
  expect(part.state.output).toStartWith("Inquiry check: pass")
  expect(part.state.output).toContain("Retained finding qualifications")
  expect(part.state.output).toContain(JSON.stringify(conditions))
  expect(part.state.output).toEndWith(`Quoted raw child text (authored data):\n> ${JSON.stringify(retained.final)}`)
  expect(retained.post).toMatchObject({ hookSpecificOutput: {
    hookEventName: "PostToolUse", updatedToolOutput: part.state.output, additionalContext: part.state.output,
  } })
}), 60_000)

// The capture reply is the receipt JSON; only its identity is needed here.
const Captured = Schema.Struct({ ref: Research.SourceRef, binding: Research.Binding })
