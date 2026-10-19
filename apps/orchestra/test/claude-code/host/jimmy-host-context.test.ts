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

  yield* Effect.promise(() => Bun.write(path.join(instance.directory, "conditions.txt"), "Support holds in release 1 with enabled mode.\n"))
  const returned: {
    source: typeof Captured.Type
    claim: Research.RecordRef
    text: string
    handoff: HookJSONOutput
  }[] = []
  const frame = ClaudeEngineFixture.frame
  const callID = "toolu_jimmy_context"
  const taskID = "native-jimmy-context"
  const conditions = ["release 1 only", "enabled mode only"]
  ClaudeEngineFixture.state.scripts.push(async function* (input, params) {
    await input[Symbol.asyncIterator]().next()
    yield { type: "system", subtype: "init", model: "claude-haiku-4-5-20251001", ...frame }
    const pre = params.options?.hooks?.PreToolUse?.[0].hooks[0]
    const post = params.options?.hooks?.PostToolUse?.[0].hooks[0]
    if (!pre || !post) throw new Error("Missing default host tool hooks")
    const base = { session_id: frame.session_id, transcript_path: "/tmp/scripted-transcript", cwd: params.options?.cwd ?? "/tmp" }
    const signal = params.options?.abortController?.signal ?? new AbortController().signal
    const dispatch = { subagent_type: "orchestra:jimmy-quick", description: "Investigate conditions",
      prompt: "Find the applicability conditions.", run_in_background: false }
    yield { type: "assistant", ...frame, uuid: "dispatch-frame", message: { id: "msg_jimmy_dispatch", content: [
      { type: "tool_use", id: callID, name: "Agent", input: dispatch },
    ], stop_reason: "tool_use", usage: {} } }
    expect(await pre({ ...base, hook_event_name: "PreToolUse", tool_name: "Agent", tool_use_id: callID, tool_input: dispatch },
      callID, { signal })).toMatchObject({ hookSpecificOutput: { permissionDecision: "allow" } })
    yield { type: "system", subtype: "task_started", task_id: taskID, tool_use_id: callID, description: dispatch.description,
      subagent_type: dispatch.subagent_type, is_backgrounded: false, task_type: "local_agent", ...frame }
    const server = params.options?.mcpServers?.orchestra
    if (!server || server.type !== "sdk") throw new Error("Missing default host MCP server")
    const client = new Client({ name: "scripted-jimmy-sdk", version: "1" })
    const transports = InMemoryTransport.createLinkedPair()
    await server.instance.connect(transports[0])
    await client.connect(transports[1])
    // The seat's tool_use frame, then the real PreToolUse admission, MCP call and PostToolUse of mcp__orchestra__<name>.
    const use = (toolUseID: string, name: string, args: Record<string, unknown>) => ({ type: "assistant" as const, ...frame,
      parent_tool_use_id: callID, uuid: `${toolUseID}-frame`, message: { id: `msg_${toolUseID}`, content: [
        { type: "tool_use", id: toolUseID, name: `mcp__orchestra__${name}`, input: args },
      ], stop_reason: "tool_use", usage: {} } })
    const call = async (toolUseID: string, name: string, args: Record<string, unknown>) => {
      const admitted = await pre({ ...base, hook_event_name: "PreToolUse", agent_id: taskID, agent_type: dispatch.subagent_type,
        tool_name: `mcp__orchestra__${name}`, tool_use_id: toolUseID, tool_input: args }, toolUseID, { signal })
      expect(admitted).toMatchObject({ hookSpecificOutput: { permissionDecision: "allow" } })
      const accepted = "hookSpecificOutput" in admitted && admitted.hookSpecificOutput?.hookEventName === "PreToolUse"
        ? admitted.hookSpecificOutput.updatedInput : undefined
      if (!accepted) throw new Error("Missing host MCP dispatch receipt")
      const output = Schema.decodeUnknownSync(Schema.Struct({ isError: Schema.optional(Schema.Boolean),
        content: Schema.Array(Schema.Struct({ type: Schema.Literal("text"), text: Schema.String })) }))(
        await client.callTool({ name, arguments: accepted }))
      expect(output.isError).toBeUndefined()
      expect(await post({ ...base, hook_event_name: "PostToolUse", agent_id: taskID, tool_name: `mcp__orchestra__${name}`,
        tool_use_id: toolUseID, tool_input: args, tool_response: output.content[0].text }, toolUseID, { signal })).toEqual({})
      // An inquiry reply is its first line; the rest is the inquiry snapshot.
      return Schema.decodeUnknownSync(Schema.UnknownFromJsonString)(output.content[0].text.split("\n")[0])
    }
    const capture = { kind: "file", path: "conditions.txt" }
    yield use("jimmy-context-capture", "research_capture", capture)
    const source = Schema.decodeUnknownSync(Captured)(await call("jimmy-context-capture", "research_capture", capture))
    const open = { action: "open", question: "When does support hold?", subquestions: ["Which conditions apply"], profile: "understand" }
    yield use("jimmy-context-open", "inquiry", open)
    const opened = Schema.decodeUnknownSync(Schema.Struct({ subquestions: Schema.Array(Research.RecordRef) }))(
      await call("jimmy-context-open", "inquiry", open))
    const claim = { action: "claim", subquestion: opened.subquestions[0], proposition: "Support is conditional", nature: "extraction",
      conditions, evidence: [{ source: source.ref, quote: "release 1 with enabled mode" }] }
    yield use("jimmy-context-finding", "inquiry", claim)
    const claimed = Schema.decodeUnknownSync(Schema.Struct({ claim: Research.RecordRef }))(await call("jimmy-context-finding", "inquiry", claim))
    yield use("jimmy-context-check", "inquiry", { action: "check" })
    expect(await call("jimmy-context-check", "inquiry", { action: "check" })).toMatchObject({ check: { verdict: "pass" } })
    const close = { action: "close", sufficiency: "answered", answer: "Support is conditional.", limitations: ["No runtime observation"] }
    yield use("jimmy-context-close", "inquiry", close)
    expect(await call("jimmy-context-close", "inquiry", close)).toEqual({ closed: "answered", check: "pass" })
    await client.close()
    const text = "Support is conditional."
    const handoff = await post({ ...base, hook_event_name: "PostToolUse", tool_name: "Agent", tool_use_id: callID,
      tool_input: dispatch, tool_response: { status: "completed", agentId: taskID, content: [{ type: "text", text }] } }, callID, { signal })
    returned.push({ source, claim: claimed.claim, text, handoff })
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
  expect(result.source.binding).toEqual(binding)
  expect(binding.taskId).toBe(logical.taskId)
  const history = yield* sessions.messages({ sessionID: child.id })
  const recorded = history.flatMap((message) => message.parts).find((part) => part.type === "tool" && part.callID === "jimmy-context-finding")
  expect(recorded?.type === "tool" && recorded.state.status === "completed" && recorded.state.metadata.inquiry)
    .toEqual({ claim: result.claim })
  const author = history.findLast((message) => message.info.role === "assistant")
  expect(author?.parts.flatMap((part) => part.type === "text" ? [part.text] : [])).toEqual([result.text])
  const part = (yield* sessions.messages({ sessionID: parent.id })).flatMap((message) => message.parts)
    .find((part) => part.type === "tool" && part.callID === callID)
  if (part?.type !== "tool" || part.state.status !== "completed") throw new Error("Missing settled parent Agent part")
  // Removing the host's four ResearchRecords hunks must reach this assertion with a parsed, real own-Task card.
  const qualified = { records: [{ kind: "finding", id: result.claim.id, revision: result.claim.revision,
    proposition: "Support is conditional", conditions }], complete: true, omitted: 0, total: 1 }
  expect(part.state.metadata.workResult).toMatchObject({ schema: "discovery-work-result-v1", referencesChecked: true, outcome: "done",
    card: { parsed: true, messageID: author?.info.id },
    discovery: { schema: "jimmy-card-v2", answer: result.text, sufficiency: "answered", depth: "quick", check: { verdict: "pass" },
      claims: [{ ref: result.claim, conditions }] },
    taskId: logical.taskId, memberId: "jimmy", executionSessionId: child.id, authoritySessionId: parent.id,
    qualifications: qualified })
  // The capture retains the received bytes and their line projection; the claim cites the projection.
  expect(Schema.decodeUnknownSync(Research.CardV2)(part.state.metadata.workResult.discovery).sources.shown.map((source) => source.ref)).toContainEqual(result.source.ref)
  expect(part.state.output).toStartWith("Inquiry check: pass; rules ")
  const lines = part.state.output.split("\n")
  const packet = lines.findIndex((line) => line.startsWith("Retained finding qualifications"))
  expect(packet).toBeGreaterThan(0)
  expect(lines[packet + 1]).toStartWith("> ")
  expect(Schema.decodeUnknownSync(Schema.UnknownFromJsonString)(lines[packet + 1].slice(2))).toMatchObject(qualified)
  expect(part.state.output).toContain(JSON.stringify(conditions))
  expect(part.state.output).toEndWith(`Quoted raw child text (authored data):\n> ${JSON.stringify(result.text)}`)
  expect(result.handoff).toMatchObject({ hookSpecificOutput: { hookEventName: "PostToolUse",
    additionalContext: part.state.output, updatedToolOutput: part.state.output } })
  expect(ClaudeEngineFixture.state.queries).toHaveLength(1)
  expect(ClaudeEngineFixture.state.apiCalls).toBe(0)
  yield* host.release(parent.id)
}), 60_000)

// The capture reply is the receipt JSON; only its identity is needed here.
const Captured = Schema.Struct({ ref: Research.SourceRef, binding: Research.Binding })
