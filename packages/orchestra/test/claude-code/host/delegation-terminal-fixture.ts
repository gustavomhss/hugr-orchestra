export * as DelegationTerminalFixture from "./delegation-terminal-fixture"

import { Effect, Schema } from "effect"
import type { HookInput, PostToolUseHookInput, PostToolUseFailureHookInput, PreToolUseHookInput } from "@anthropic-ai/claude-agent-sdk"
import type { SessionV1 } from "@orchestra/core/v1/session"
import { ResearchBinding } from "@orchestra/core/research/binding"
import { ResearchRecords } from "@orchestra/core/research/records"
import { Research } from "@orchestra/schema/research"
import { Agent } from "@/agent/agent"
import { ClaudeHostDelegation } from "@/claude-code/host/delegation"
import { ClaudeHostHooks } from "@/claude-code/host/hooks"
import { Permission } from "@/permission"
import { MessageID, PartID } from "@/session/schema"
import { ToolRegistry } from "@/tool/registry"
import type { Tool } from "@/tool/tool"
import { ClaudeResearchFixture } from "./jimmy-fixture"
import { ResearchTerminalFixture } from "./research-terminal-fixture"

export const it = ClaudeResearchFixture.it
const base = ClaudeResearchFixture.base

// Unit/service evidence: direct exported lifecycle admission with real Sessions/LogicalTasks/history.
// Scripted SDK declaration shapes supply terminal observations, never a current native Jimmy dispatch proof.
export const setup = Effect.fn("DelegationTerminalFixture.setup")(function* (
  options?: Parameters<typeof ResearchTerminalFixture.setup>[0] & { exhaustion?: string },
) {
  const fixture = yield* ResearchTerminalFixture.setup(options)
  const sessions = fixture.sessions
  const user = yield* sessions.updateMessage({ id: MessageID.ascending(), sessionID: fixture.parent.id, role: "user", agent: "maestro",
    model: ClaudeResearchFixture.ref, time: { created: Date.now() } } satisfies SessionV1.User)
  const assistant = yield* sessions.updateMessage({ id: MessageID.ascending(), sessionID: fixture.parent.id, role: "assistant",
    parentID: user.id, agent: "maestro", mode: "maestro", ...ClaudeResearchFixture.ref,
    path: { cwd: fixture.parent.directory, root: fixture.parent.directory }, cost: 0,
    tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } }, time: { created: Date.now() } } satisfies SessionV1.Assistant)
  const mirrored = new Map<string, SessionV1.ToolPart>()
  const authors = new Map<string, MessageID>()
  const research = { ...fixture.research, ...(options?.exhaustion ? { stopReason: () => Effect.succeed(options.exhaustion) } : {}) }
  const parts = {
    tool: (callID: string) => mirrored.get(callID), author: (callID: string) => authors.get(callID),
    complete: (part: SessionV1.ToolPart) => sessions.updatePart(part).pipe(Effect.tap(() => Effect.sync(() => mirrored.set(part.callID, part))), Effect.asVoid),
  }
  const delegation = ClaudeHostDelegation.make({ sessionID: fixture.parent.id, agent: "maestro", path: assistant.path,
    join: fixture.join, research, parts })
  const context = yield* Effect.context<never>()
  const abort = new AbortController()
  yield* Effect.addFinalizer(() => Effect.sync(() => abort.abort()))
  const hooks = ClaudeHostHooks.create({ sessionID: fixture.parent.id, agent: "maestro", directory: fixture.parent.directory,
    worktree: fixture.parent.directory, join: fixture.join, parts, research, abort, granted: { maestro: ["task"] },
    run: <A, R>(effect: Effect.Effect<A, unknown, R>) => Effect.runPromiseWith(context)(effect as Effect.Effect<A, unknown>),
    policy: { granted: { maestro: ["task"] }, hold: () => Effect.void, safety: () => Effect.void, arsenal: () => Effect.void,
      ask: () => Effect.void, confine: () => Effect.succeed(undefined), release: () => Effect.void, close: Effect.void },
  })
  const fire = (hook: HookInput) => Effect.promise(() => hooks[hook.hook_event_name]![0].hooks[0](hook, undefined, { signal: abort.signal }))
  const admit = Effect.fn("DelegationTerminalFixture.admit")(function* (callID = "service-agent", seat = "jimmy", background = false) {
    const args = { subagent_type: `orchestra:${seat}`, description: "Unit delegated research", prompt: "Keep applicability conditions.",
      run_in_background: background }
    const part = yield* sessions.updatePart({ id: PartID.ascending(), sessionID: fixture.parent.id, messageID: assistant.id, type: "tool",
      tool: "Agent", callID, state: { status: "running", input: args, time: { start: Date.now() } } })
    mirrored.set(callID, part)
    const hook = { ...base, hook_event_name: "PreToolUse", tool_name: "Agent", tool_use_id: callID, tool_input: args } satisfies PreToolUseHookInput
    yield* delegation.dispatch(hook, { sessionID: fixture.parent.id, seat: "maestro" })
    const child = delegation.child(callID)
    if (!child) throw new Error("Expected directly admitted service child")
    const taskID = `unit-task-${callID}`
    if (!options?.pendingJoin) fixture.join.taskStarted({ toolUseID: callID, taskID })
    if (seat === "jimmy") yield* fixture.research.enter(child, callID)
    return { callID, child, taskID, part, hook }
  })
  const part = (callID: string) => sessions.messages({ sessionID: fixture.parent.id }).pipe(Effect.map((history) =>
    history.flatMap((message) => message.parts).find((part): part is SessionV1.ToolPart => part.type === "tool" && part.callID === callID)))
  const author = Effect.fn("DelegationTerminalFixture.author")(function* (dispatch: Effect.Success<ReturnType<typeof admit>>, text: string) {
    const prompt = (yield* sessions.messages({ sessionID: dispatch.child })).find((message) => message.info.role === "user")
    if (!prompt) throw new Error("Expected admitted prompt")
    const message = yield* sessions.updateMessage({ ...assistant, id: MessageID.ascending(), sessionID: dispatch.child, parentID: prompt.info.id,
      agent: "jimmy", mode: "jimmy", finish: "stop", time: { created: Date.now(), completed: Date.now() } })
    yield* sessions.updatePart({ id: PartID.ascending(), sessionID: dispatch.child, messageID: message.id, type: "text", text })
    authors.set(dispatch.callID, message.id)
    return message
  })
  // A real non-research hook admission exercises withholding without bypassing native Jimmy HOLD.
  const hookAdmit = Effect.fn("DelegationTerminalFixture.hookAdmit")(function* (callID = "hook-agent") {
    const args = { subagent_type: "orchestra:patty", description: "Unit hook review", prompt: "Review.", run_in_background: false }
    yield* sessions.updatePart({ id: PartID.ascending(), sessionID: fixture.parent.id, messageID: assistant.id, type: "tool",
      tool: "Agent", callID, state: { status: "running", input: args, time: { start: Date.now() } } }).pipe(
      Effect.tap((part) => Effect.sync(() => mirrored.set(callID, part))))
    const output = yield* fire({ ...base, hook_event_name: "PreToolUse", tool_name: "Agent", tool_use_id: callID, tool_input: args })
    const child = fixture.join.child(callID)
    if (!child) throw new Error(`Expected non-research hook admission: ${JSON.stringify(output)}`)
    const taskID = `unit-task-${callID}`
    fixture.join.taskStarted({ toolUseID: callID, taskID })
    return { callID, child, taskID }
  })
  return { ...fixture, admit, delegation, part, assistant, author, fire, hookAdmit }
})

export const post = (callID: string, taskID: string, text: string, seat = "jimmy"): PostToolUseHookInput => ({
  ...base, hook_event_name: "PostToolUse", tool_name: "Agent", tool_use_id: callID, tool_input: {},
  tool_response: { status: "completed", agentId: taskID, agentType: `orchestra:${seat}`, content: [{ type: "text", text }],
    prompt: "Keep applicability conditions.", totalToolUseCount: 0, totalDurationMs: 1, totalTokens: 1,
    usage: { input_tokens: 1, output_tokens: 1, cache_creation_input_tokens: null, cache_read_input_tokens: null,
      server_tool_use: null, service_tier: null, cache_creation: null } },
})

export const failure = (callID: string, interrupted = false): PostToolUseFailureHookInput => ({
  ...base, hook_event_name: "PostToolUseFailure", tool_name: "Agent", tool_use_id: callID,
  tool_input: { researchControl: { exhaustionReason: "FORGED" }, taskID: "FORGED", author: "FORGED" },
  error: "SDK_NATIVE_CHILD_ERROR: unit transport ended", is_interrupt: interrupted,
})

/** Real record retention before terminal closure; no provider or model call. */
export const retain = Effect.fn("DelegationTerminalFixture.retain")(function* (
  fixture: Effect.Success<ReturnType<typeof setup>>,
  dispatch: Effect.Success<ReturnType<Effect.Success<ReturnType<typeof setup>>["admit"]>>,
) {
  const records = yield* ResearchRecords.Service
  const agents = yield* Agent.Service
  const permission = yield* Permission.Service
  const registry = yield* ToolRegistry.Service
  const seat = yield* agents.get("jimmy")
  const tools = yield* registry.tools({ agent: seat, ...ClaudeResearchFixture.ref })
  const binding = yield* ResearchBinding.resolve(dispatch.child, fixture.parent.projectID)
  const prompt = (yield* fixture.sessions.messages({ sessionID: dispatch.child })).find((message) => message.info.role === "user")
  if (!prompt) throw new Error("Expected admitted prompt")
  const recorder = yield* fixture.sessions.updateMessage({ ...fixture.assistant, id: MessageID.ascending(), sessionID: dispatch.child,
    parentID: prompt.info.id, agent: "jimmy", mode: "jimmy", finish: "tool-calls", time: { created: Date.now(), completed: Date.now() } })
  const run = Effect.fn("DelegationTerminalFixture.retainTool")(function* (name: string, args: unknown, callID: string) {
    const tool = tools.find((tool) => tool.id === name)
    if (!tool) throw new Error(`Missing registry tool ${name}`)
    const part = yield* fixture.sessions.updatePart({ id: PartID.ascending(), sessionID: dispatch.child, messageID: recorder.id,
      type: "tool", tool: name, callID, state: { status: "running", input: {}, time: { start: Date.now() } } })
    const result = yield* fixture.research.execute(dispatch.child, tool.execute(args, {
      sessionID: dispatch.child, messageID: recorder.id, callID, agent: seat.name, agentID: "jimmy", permission: seat.permission,
      abort: new AbortController().signal, messages: [], metadata: () => Effect.void,
      ask: (request) => permission.ask({ ...request, sessionID: dispatch.child, tool: { messageID: recorder.id, callID },
        ruleset: seat.permission }).pipe(Effect.orDie),
    } satisfies Tool.Context))
    yield* fixture.sessions.updatePart({ ...part, state: { status: "completed", input: {}, title: result.title, output: result.output,
      metadata: result.metadata, time: { start: Date.now(), end: Date.now() } } })
    return result
  })
  yield* Effect.promise(() => Bun.write(`${fixture.parent.directory}/conditional-source.txt`,
    "Declared: release 1 enabled mode works.\nContrary: disabled mode rejects requests.\n"))
  const source = Schema.decodeUnknownSync(Research.SourceReceipt)((yield* run("research_capture",
    { kind: "file", path: "conditional-source.txt" }, "capture")).metadata.researchSource)
  // The card is the host's, assembled on inquiry close from the claim; the worker's text carries none.
  const opened = Schema.decodeUnknownSync(Schema.Struct({ subquestions: Schema.Array(Research.RecordRef) }))((yield* run("inquiry", {
    action: "open", question: "When does support hold?", subquestions: ["Which conditions apply"], profile: "understand" }, "open")).metadata.inquiry)
  const claim = Schema.decodeUnknownSync(Schema.Struct({ claim: Research.RecordRef }))((yield* run("inquiry", { action: "claim",
    subquestion: opened.subquestions[0], proposition: "Support requires release 1 and enabled mode", nature: "extraction",
    conditions: ["release 1", "enabled mode only"], evidence: [{ source: source.ref, quote: "release 1 enabled mode works" }],
    contrary: [{ source: source.ref, quote: "disabled mode rejects requests" }] }, "finding")).metadata.inquiry).claim
  // Published before the check: any write after it invalidates the check. Close carries it on the card.
  const document = yield* run("research_record", {
    action: "document", document: { genre: "answer", title: "Qualified answer", body: "Enabled release 1 [source](research:declared).",
      findingRefs: [claim], citations: { declared: { source: source.ref, locator: { kind: "quote", exact: "release 1 enabled mode works" } } } },
  }, "document")
  const published = Schema.decodeUnknownSync(Schema.Struct({ document: Research.DocumentReceipt }))(document.metadata.research).document
  yield* run("inquiry", { action: "check" }, "check")
  yield* run("inquiry", { action: "close", sufficiency: "answered", answer: "Support requires enabled release 1.",
    limitations: ["No runtime observation"] }, "close")
  const finding = yield* records.view(binding, { action: "record", ref: claim })
  const text = "café\r\n  Preserve spacing and conditions.\n"
  return { text, claim, finding, source, document: published, binding, records }
})
