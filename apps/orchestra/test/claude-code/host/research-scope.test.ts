import { expect } from "bun:test"
import { Context, Effect, Layer, Option, Schema } from "effect"
import type { HookJSONOutput, Query } from "@anthropic-ai/claude-agent-sdk"
import { Client } from "@modelcontextprotocol/sdk/client/index.js"
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js"
import { ResearchRecords } from "@orchestra/core/research/records"
import { Research } from "@orchestra/schema/research"
import { ClaudeCodeSDK } from "@/claude-code/sdk"
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
  const retained: { finding?: typeof Research.FindingRecord.Type; final?: string; post?: HookJSONOutput } = {}
  const frame = ClaudeEngineFixture.frame
  const finding = {
    action: "finding", proposition: "Support is conditional", nature: "hypothesis",
    conditions: ["release 1 only", "enabled mode only"], evidence: [], contrary: [], reason: "No runtime observation",
  } as const
  scripts.push(async function* (input, params) {
    const first = await input[Symbol.asyncIterator]().next()
    if (first.done) throw new Error("Host did not submit its admitted prompt")
    yield { type: "system", subtype: "init", model: "claude-haiku-4-5-20251001", ...frame }
    const pre = params.options?.hooks?.PreToolUse?.[0].hooks[0]
    const post = params.options?.hooks?.PostToolUse?.[0].hooks[0]
    if (!pre || !post) throw new Error("Host did not wire research callbacks")
    const base = { session_id: frame.session_id, transcript_path: "/tmp/scripted-research-scope", cwd: fixture.chat.directory }
    const signal = new AbortController().signal
    const task = { subagent_type: "orchestra:jimmy", description: "Investigate conditions",
      prompt: "Find the applicability conditions.", run_in_background: false }
    yield { type: "assistant", ...frame, uuid: "scope-agent-frame", message: { id: "msg_scope_agent", content: [
      { type: "tool_use", id: "scope-agent", name: "Agent", input: task },
    ], stop_reason: "tool_use", usage: {} } }
    expect(await pre({ ...base, hook_event_name: "PreToolUse", tool_name: "Agent", tool_use_id: "scope-agent", tool_input: task },
      "scope-agent", { signal })).toMatchObject({ hookSpecificOutput: { permissionDecision: "allow" } })
    yield { type: "system", subtype: "task_started", task_id: "scope-task", tool_use_id: "scope-agent",
      description: task.description, subagent_type: task.subagent_type, is_backgrounded: false, task_type: "local_agent", ...frame }
    yield { type: "assistant", ...frame, parent_tool_use_id: "scope-agent", uuid: "scope-record-frame",
      message: { id: "msg_scope_record", content: [
        { type: "tool_use", id: "scope-record", name: "mcp__orchestra__research_record", input: finding },
      ], stop_reason: "tool_use", usage: {} } }
    const admitted = await pre({ ...base, hook_event_name: "PreToolUse", agent_id: "scope-task", agent_type: "orchestra:jimmy",
      tool_name: "mcp__orchestra__research_record", tool_use_id: "scope-record", tool_input: finding }, "scope-record", { signal })
    expect(admitted).toMatchObject({ hookSpecificOutput: { permissionDecision: "allow" } })
    const accepted = "hookSpecificOutput" in admitted && admitted.hookSpecificOutput?.hookEventName === "PreToolUse"
      ? admitted.hookSpecificOutput.updatedInput : undefined
    if (!accepted) throw new Error("Missing research dispatch receipt")
    const server = params.options?.mcpServers?.orchestra
    if (!server || server.type !== "sdk") throw new Error("Missing host-owned MCP server")
    const transports = InMemoryTransport.createLinkedPair()
    await server.instance.connect(transports[0])
    await client.connect(transports[1])
    // Positive control: registry's private service really stores a nonempty qualified finding.
    const result = Schema.decodeUnknownSync(Schema.Struct({
      isError: Schema.optional(Schema.Boolean),
      content: Schema.Array(Schema.Struct({ type: Schema.Literal("text"), text: Schema.String })),
    }))(await client.callTool({ name: "research_record", arguments: accepted }))
    expect(result.isError).toBeUndefined()
    const stored = Schema.decodeUnknownSync(Schema.fromJsonString(Schema.Struct({ record: Research.FindingRecord })))(result.content[0].text)
    retained.finding = stored.record
    expect(stored.record).toMatchObject({ nature: finding.nature, conditions: finding.conditions, reason: finding.reason })
    const card: Research.Card = {
      answer: finding.proposition, profile: "understand", depth: "quick", sufficiency: "partial",
      findingRefs: [{ id: stored.record.id, revision: stored.record.revision }], evidenceRefs: [], documentRefs: [],
      coverage: { examined: [], excluded: ["runtime"], failures: [] }, limitations: [finding.reason], nextActions: [],
    }
    retained.final = `${card.answer}\n\n\u0060\u0060\u0060jimmy-result\n${JSON.stringify(card)}\n\u0060\u0060\u0060`
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
  // but DiscoveryResult cannot find the service and never reaches this real corpus read.
  expect(scopes.filter((scope) => scope.sessionID === children[0].id && scope.action === "corpus").map((scope) => scope.present)).toEqual([true])
  expect(scopes.filter((scope) => scope.sessionID === children[0].id && scope.action === "record").map((scope) => scope.present)).toEqual([true])
  const part = (yield* fixture.sessions.messages({ sessionID: fixture.chat.id })).flatMap((message) => message.parts)
    .find((part) => part.type === "tool" && part.callID === "scope-agent")
  if (part?.type !== "tool" || part.state.status !== "completed" || !retained.finding || !retained.final)
    throw new Error("Missing completed qualified research handoff")
  expect(part.state.metadata.workResult).toMatchObject({
    schema: "discovery-work-result-v1", referencesChecked: true, card: { parsed: true },
    qualifications: { records: [retained.finding], complete: true, omitted: 0, total: 1 },
  })
  expect(part.state.output).toContain("Retained finding qualifications")
  expect(part.state.output).toContain(JSON.stringify(finding.conditions))
  expect(part.state.output).toEndWith(retained.final)
  expect(retained.post).toMatchObject({ hookSpecificOutput: {
    hookEventName: "PostToolUse", updatedToolOutput: part.state.output, additionalContext: part.state.output,
  } })
}), 60_000)
