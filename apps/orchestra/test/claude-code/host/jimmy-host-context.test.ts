import { expect } from "bun:test"
import { Effect, Option, Schema } from "effect"
import path from "node:path"
import type { HookJSONOutput } from "@anthropic-ai/claude-agent-sdk"
import { Client } from "@modelcontextprotocol/sdk/client/index.js"
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js"
import { Research } from "@orchestra/schema/research"
import { ResearchBinding } from "@orchestra/core/research/binding"
import { ResearchRecords } from "@orchestra/core/research/records"
import { ClaudeHost } from "@/claude-code/host/session"
import { LogicalTask } from "@/maestro/logical-task"
import { SessionPrompt } from "@/session/prompt"
import { Session } from "@/session/session"
import { TestInstance } from "../../fixture/fixture"
import { ClaudeEngineFixture } from "../engine-fixture"

// The production host node is composed by makeHttp; only its SDK query boundary is scripted.
// Do not expose ResearchRecords at the fixture root: that would mask the callback-context regression.
ClaudeEngineFixture.it.instance("production host qualifies Jimmy's own retained finding when caller has no ResearchRecords", () => Effect.gen(function* () {
  ClaudeEngineFixture.reset()
  const instance = yield* TestInstance
  // Native Maestro must select Claude Code before Config/Agent instance state first loads.
  yield* Effect.promise(() => Bun.write(path.join(instance.directory, "orchestra.json"), JSON.stringify({
    agent: { maestro: { engine: "claude-code", model: "anthropic/claude-haiku-4-5-20251001" } },
  })))
  const sessions = yield* Session.Service
  const prompt = yield* SessionPrompt.Service
  const host = yield* ClaudeHost.Service
  const parent = yield* sessions.create({ agent: "maestro", title: "Research authority",
    permission: [{ permission: "*", pattern: "*", action: "allow" }] })
  yield* Effect.addFinalizer(() => host.release(parent.id))
  expect(Option.isNone(yield* Effect.serviceOption(ResearchRecords.Service))).toBe(true)

  const returned: {
    record: typeof Research.FindingRecord.Type
    receipt: Research.MutationReceipt
    card: Research.Card
    text: string
    handoff: HookJSONOutput
  }[] = []
  const frame = ClaudeEngineFixture.frame
  const callID = "toolu_jimmy_context"
  const taskID = "native-jimmy-context"
  const finding = { action: "finding", proposition: "Support is conditional", nature: "hypothesis",
    conditions: ["release 1 only", "enabled mode only"], evidence: [], contrary: [], reason: "No runtime observation" }
  ClaudeEngineFixture.state.scripts.push(async function* (input, params) {
    await input[Symbol.asyncIterator]().next()
    yield { type: "system", subtype: "init", model: "claude-haiku-4-5-20251001", ...frame }
    const pre = params.options?.hooks?.PreToolUse?.[0].hooks[0]
    const post = params.options?.hooks?.PostToolUse?.[0].hooks[0]
    if (!pre || !post) throw new Error("Missing default host tool hooks")
    const base = { session_id: frame.session_id, transcript_path: "/tmp/scripted-transcript", cwd: params.options?.cwd ?? "/tmp" }
    const signal = params.options?.abortController?.signal ?? new AbortController().signal
    const dispatch = { subagent_type: "orchestra:jimmy", description: "Investigate conditions",
      prompt: "Find the applicability conditions.", run_in_background: false }
    yield { type: "assistant", ...frame, uuid: "dispatch-frame", message: { id: "msg_jimmy_dispatch", content: [
      { type: "tool_use", id: callID, name: "Agent", input: dispatch },
    ], stop_reason: "tool_use", usage: {} } }
    expect(await pre({ ...base, hook_event_name: "PreToolUse", tool_name: "Agent", tool_use_id: callID, tool_input: dispatch },
      callID, { signal })).toMatchObject({ hookSpecificOutput: { permissionDecision: "allow" } })
    yield { type: "system", subtype: "task_started", task_id: taskID, tool_use_id: callID, description: dispatch.description,
      subagent_type: dispatch.subagent_type, is_backgrounded: false, task_type: "local_agent", ...frame }
    const toolUseID = "jimmy-context-finding"
    yield { type: "assistant", ...frame, parent_tool_use_id: callID, uuid: "finding-frame", message: { id: "msg_jimmy_finding", content: [
      { type: "tool_use", id: toolUseID, name: "mcp__orchestra__research_record", input: finding },
    ], stop_reason: "tool_use", usage: {} } }
    const admitted = await pre({ ...base, hook_event_name: "PreToolUse", agent_id: taskID, agent_type: dispatch.subagent_type,
      tool_name: "mcp__orchestra__research_record", tool_use_id: toolUseID, tool_input: finding }, toolUseID, { signal })
    expect(admitted).toMatchObject({ hookSpecificOutput: { permissionDecision: "allow" } })
    const accepted = "hookSpecificOutput" in admitted && admitted.hookSpecificOutput?.hookEventName === "PreToolUse"
      ? admitted.hookSpecificOutput.updatedInput : undefined
    if (!accepted) throw new Error("Missing host MCP dispatch receipt")
    const server = params.options?.mcpServers?.orchestra
    if (!server || server.type !== "sdk") throw new Error("Missing default host MCP server")
    const client = new Client({ name: "scripted-jimmy-sdk", version: "1" })
    const transports = InMemoryTransport.createLinkedPair()
    await server.instance.connect(transports[0])
    await client.connect(transports[1])
    const result = await client.callTool({ name: "research_record", arguments: accepted }).finally(() => client.close())
    const output = Schema.decodeUnknownSync(Schema.Struct({ isError: Schema.optional(Schema.Boolean),
      content: Schema.Array(Schema.Struct({ type: Schema.Literal("text"), text: Schema.String })) }))(result)
    expect(output.isError).toBeUndefined()
    const retained = Schema.decodeUnknownSync(Schema.Struct({ record: Research.FindingRecord, receipt: Research.MutationReceipt }))(
      Schema.decodeUnknownSync(Schema.UnknownFromJsonString)(output.content[0].text))
    expect(retained.record).toMatchObject({ kind: "finding", proposition: finding.proposition, nature: finding.nature,
      conditions: finding.conditions, evidence: [], contrary: [], reason: finding.reason })
    expect(await post({ ...base, hook_event_name: "PostToolUse", agent_id: taskID,
      tool_name: "mcp__orchestra__research_record", tool_use_id: toolUseID, tool_input: finding, tool_response: output.content[0].text },
      toolUseID, { signal })).toEqual({})
    const card: Research.Card = { answer: "Support is conditional.", profile: "understand", depth: "quick", sufficiency: "partial",
      findingRefs: [{ id: retained.record.id, revision: retained.record.revision }], evidenceRefs: [], documentRefs: [],
      coverage: { examined: [], excluded: ["runtime"], failures: [] }, limitations: ["No runtime observation"], nextActions: [] }
    const text = `Support is conditional.\n\n\u0060\u0060\u0060jimmy-result\n${JSON.stringify(card)}\n\u0060\u0060\u0060`
    const handoff = await post({ ...base, hook_event_name: "PostToolUse", tool_name: "Agent", tool_use_id: callID,
      tool_input: dispatch, tool_response: { status: "completed", agentId: taskID, content: [{ type: "text", text }] } }, callID, { signal })
    returned.push({ ...retained, card, text, handoff })
    yield { type: "user", ...frame, message: { role: "user", content: [
      { type: "tool_result", tool_use_id: callID, content: text },
    ] } }
    yield { type: "assistant", ...frame, uuid: "answer-frame", message: { id: "msg_jimmy_parent_answer", content: [
      { type: "text", text: "Research handoff received" },
    ], stop_reason: "end_turn", usage: {} } }
    yield { type: "result", subtype: "success", is_error: false, stop_reason: "end_turn", total_cost_usd: 0.01, ...frame }
    for await (const _ of input) {}
  })

  const admitted = yield* prompt.prompt({ sessionID: parent.id, agent: "maestro", noReply: true,
    parts: [{ type: "text", text: "Investigate support conditions" }] })
  if (admitted.info.role !== "user") throw new Error("Missing admitted Maestro prompt")
  expect(yield* host.turn({ sessionID: parent.id, user: admitted.info })).toBe(true)
  expect(Option.isNone(yield* Effect.serviceOption(ResearchRecords.Service))).toBe(true)
  expect(returned).toHaveLength(1)
  const result = returned[0]
  const children = yield* sessions.children(parent.id)
  expect(children).toHaveLength(1)
  const child = children[0]
  const logical = yield* LogicalTask.read(child.id)
  if (!logical) throw new Error("Missing actual Jimmy Task binding")
  expect(logical).toMatchObject({ memberID: "jimmy", executionSessionID: child.id, authoritySessionID: parent.id, source: "host" })
  const binding = yield* ResearchBinding.resolve(child.id, parent.projectID)
  expect(result.receipt.binding).toEqual(binding)
  expect(binding.taskId).toBe(logical.taskId)
  const history = yield* sessions.messages({ sessionID: child.id })
  const recorded = history.flatMap((message) => message.parts).find((part) => part.type === "tool" && part.callID === "jimmy-context-finding")
  expect(recorded?.type === "tool" && recorded.state.status === "completed" && recorded.state.metadata.research)
    .toMatchObject({ record: result.record, receipt: result.receipt })
  const author = history.findLast((message) => message.info.role === "assistant")
  expect(author?.parts.flatMap((part) => part.type === "text" ? [part.text] : [])).toEqual([result.text])
  const part = (yield* sessions.messages({ sessionID: parent.id })).flatMap((message) => message.parts)
    .find((part) => part.type === "tool" && part.callID === callID)
  if (part?.type !== "tool" || part.state.status !== "completed") throw new Error("Missing settled parent Agent part")
  // Removing the host's four ResearchRecords hunks must reach this assertion with a parsed, real own-Task card.
  expect(part.state.metadata.workResult).toMatchObject({ schema: "discovery-work-result-v1", referencesChecked: true,
    card: { parsed: true, messageID: author?.info.id }, discovery: result.card,
    taskId: logical.taskId, memberId: "jimmy", executionSessionId: child.id, authoritySessionId: parent.id,
    qualifications: { records: [result.record], complete: true, omitted: 0, total: 1 } })
  expect(part.state.output).toStartWith("Retained finding qualifications")
  const quotation = part.state.output.split("\n")[1]
  expect(quotation).toStartWith("> ")
  expect(Schema.decodeUnknownSync(Schema.UnknownFromJsonString)(quotation.slice(2)))
    .toEqual({ records: [result.record], complete: true, omitted: 0, total: 1 })
  expect(part.state.output).toContain(JSON.stringify(result.record.conditions))
  expect(part.state.output).toEndWith(result.text)
  expect(result.handoff).toMatchObject({ hookSpecificOutput: { hookEventName: "PostToolUse",
    additionalContext: part.state.output, updatedToolOutput: part.state.output } })
  expect(ClaudeEngineFixture.state.queries).toHaveLength(1)
  expect(ClaudeEngineFixture.state.apiCalls).toBe(0)
  yield* host.release(parent.id)
}), 60_000)
