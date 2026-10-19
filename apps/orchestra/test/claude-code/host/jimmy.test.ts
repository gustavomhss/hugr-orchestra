import { expect } from "bun:test"
import { Cause, Deferred, Effect, Exit, Fiber, Schema } from "effect"
import { TestClock } from "effect/testing"
import type { SDKAssistantMessage } from "@anthropic-ai/claude-agent-sdk"
import path from "node:path"
import { Research } from "@orchestra/schema/research"
import { ResearchBinding } from "@orchestra/core/research/binding"
import { ResearchRecords } from "@orchestra/core/research/records"
import { LogicalTask } from "@/maestro/logical-task"
import { ResearchExecution } from "@/research/allowance"
import { ClaudeHostPlugin } from "@/claude-code/host/plugin"
import type { Tool } from "@/tool/tool"
import { BridgeFixture } from "./bridge-fixture"
import { ClaudeResearchFixture } from "./jimmy-fixture"

ClaudeResearchFixture.it.instance("native Agent binds actual Task and denies ungranted tools before quota charging", () => Effect.gen(function* () {
  const fixture = yield* ClaudeResearchFixture.setup()
  const dispatch = yield* fixture.nativeDispatch()
  expect(dispatch.output).toMatchObject({ hookSpecificOutput: { permissionDecision: "allow" } })
  expect(yield* LogicalTask.read(dispatch.child)).toMatchObject({ memberID: "jimmy", authoritySessionID: fixture.parent.id,
    executionSessionID: dispatch.child })
  expect(yield* ResearchBinding.resolve(dispatch.child, fixture.parent.projectID)).toMatchObject({ memberID: "jimmy" })
  for (const name of ["Bash", "Write", "Edit", "WebFetch", "LSP", "Agent", "mcp__orchestra__process", "mcp__orchestra__edit"])
    expect(yield* dispatch.pre(name, `denied-${name}`)).toMatchObject({ hookSpecificOutput: { permissionDecision: "deny" } })
  expect(yield* dispatch.pre("Skill", "wrong-skill", { skill: "orchestra:backend-implement" }))
    .toMatchObject({ hookSpecificOutput: { permissionDecision: "deny" } })
  expect(yield* ClaudeResearchFixture.charges(dispatch.child)).toEqual([])
  expect(yield* dispatch.pre("mcp__orchestra__research_view", "admitted-view", { action: "corpus" }))
    .toMatchObject({ hookSpecificOutput: { permissionDecision: "allow" } })
  expect(yield* ClaudeResearchFixture.charges(dispatch.child)).toMatchObject([{ kind: "tool", dispatchCallID: dispatch.callID, amount: 1 }])
}), 30_000)

ClaudeResearchFixture.it.instance("native unique correlated response IDs charge observed units only; parent and duplicate blocks do not", () => Effect.gen(function* () {
  const fixture = yield* ClaudeResearchFixture.setup()
  const dispatch = yield* fixture.nativeDispatch()
  const frame = (id: string, parent = dispatch.callID): SDKAssistantMessage => ({ type: "assistant", parent_tool_use_id: parent,
    session_id: ClaudeResearchFixture.base.session_id, uuid: crypto.randomUUID(), message: { id, type: "message",
      role: "assistant", model: "claude-test", content: [{ type: "text", text: "Researching", citations: null }],
      container: null, context_management: null, stop_reason: "end_turn", stop_sequence: null,
      usage: { input_tokens: 1, output_tokens: 1, cache_creation: null, cache_creation_input_tokens: 0,
        cache_read_input_tokens: 0, server_tool_use: null, service_tier: null } } })
  yield* fixture.research.observe(fixture.join, frame("parent-turn", "unrelated"))
  yield* fixture.research.observe(fixture.join, frame("turn-0"))
  yield* fixture.research.observe(fixture.join, frame("turn-0"))
  expect((yield* ClaudeResearchFixture.charges(dispatch.child)).filter((entry) => entry.kind === "provider")).toHaveLength(1)
  yield* Effect.forEach(Array.from({ length: 23 }, (_, index) => index + 1), (index) =>
    fixture.research.observe(fixture.join, frame(`turn-${index}`)))
  expect(yield* dispatch.pre("mcp__orchestra__research_view", "provider-held", { action: "corpus" }))
    .toMatchObject({ hookSpecificOutput: { permissionDecision: "deny" }, continue: false,
      stopReason: expect.stringContaining("budget_exhausted") })
  expect(yield* dispatch.pre("Read", "denied-retry", { file_path: "conditions.txt" }))
    .toMatchObject({ continue: false, stopReason: expect.stringContaining("budget_exhausted") })
  expect(yield* dispatch.post("mcp__orchestra__research_view", "in-flight-at-cap"))
    .toMatchObject({ continue: false, stopReason: expect.stringContaining("budget_exhausted") })
  yield* dispatch.settle()
  yield* fixture.research.observe(fixture.join, frame("final-text"))
  expect((yield* ClaudeResearchFixture.charges(dispatch.child)).filter((entry) => entry.kind === "provider")).toHaveLength(24)
  // These are observed IDs, not admission of hidden physical requests or maintenance.
  expect(yield* fixture.research.status(dispatch.child)).toMatchObject({ closed: true, deadlineActive: false })
}), 30_000)

ClaudeResearchFixture.it.instance("native tools remain available without response observations; parent receives the host card and qualifications", () => Effect.gen(function* () {
  const fixture = yield* ClaudeResearchFixture.setup()
  const dispatch = yield* fixture.nativeDispatch()
  yield* Effect.promise(() => Bun.write(path.join(fixture.parent.directory, "conditions.txt"), "Support holds in release 1 with enabled mode.\n"))
  // Each call is admitted by the real PreToolUse hook, then runs the registry tool under the dispatch's allowance.
  const step = (name: string, args: unknown, toolUseID: string) => Effect.gen(function* () {
    expect(yield* dispatch.pre(`mcp__orchestra__${name}`, toolUseID, args)).toMatchObject({ hookSpecificOutput: { permissionDecision: "allow" } })
    return yield* dispatch.run(name, args, toolUseID)
  })
  const source = Schema.decodeUnknownSync(Research.SourceReceipt)(
    (yield* step("research_capture", { kind: "file", path: "conditions.txt" }, "capture")).metadata.researchSource)
  const opened = Schema.decodeUnknownSync(Schema.Struct({ subquestions: Schema.Array(Research.RecordRef) }))((yield* step("inquiry",
    { action: "open", question: "When does support hold?", subquestions: ["Which conditions apply"], profile: "understand" }, "open")).metadata.inquiry)
  const conditions = ["release 1 only", "enabled mode only"]
  const claim = Schema.decodeUnknownSync(Schema.Struct({ claim: Research.RecordRef }))((yield* step("inquiry", { action: "claim",
    subquestion: opened.subquestions[0], proposition: "Support is conditional", nature: "extraction", conditions,
    evidence: [{ source: source.ref, quote: "release 1 with enabled mode" }] }, "claim")).metadata.inquiry).claim
  expect((yield* step("inquiry", { action: "check" }, "check")).output).toContain("\"verdict\":\"pass\"")
  yield* step("inquiry", { action: "close", sufficiency: "answered", answer: "Support is conditional.",
    limitations: ["No runtime observation"] }, "close")
  const final = "Support is conditional."
  const output = yield* fixture.fire({ ...ClaudeResearchFixture.base, hook_event_name: "PostToolUse", tool_name: "Agent",
    tool_use_id: dispatch.callID, tool_input: {}, tool_response: { status: "completed", agentId: dispatch.taskID,
      content: [{ type: "text", text: final }] } })
  expect(output).toMatchObject({ hookSpecificOutput: { hookEventName: "PostToolUse",
    additionalContext: expect.stringContaining("Retained finding qualifications") } })
  const part = fixture.mirrored.get(dispatch.callID)
  if (part?.state.status !== "completed") throw new Error("Expected settled Agent part")
  expect(part.state.metadata.workResult).toMatchObject({ referencesChecked: true, outcome: "done", card: { parsed: true },
    discovery: { schema: "jimmy-card-v2", answer: final, sufficiency: "answered", limitations: ["No runtime observation"],
      claims: [{ ref: claim, conditions }], check: { verdict: "pass" } },
    qualifications: { records: [{ id: claim.id, revision: claim.revision, conditions }], complete: true, omitted: 0, total: 1 } })
  expect(part.state.output).toStartWith("Inquiry check: pass; rules ")
  expect(part.state.output).toContain(JSON.stringify(conditions))
  expect(part.state.output).toContain(`Card answer (answered; host-assembled`)
  expect(part.state.output).toEndWith(`Quoted raw child text (authored data):\n> ${JSON.stringify(final)}`)
  const author = (yield* fixture.sessions.messages({ sessionID: dispatch.child })).findLast((message) => message.info.role === "assistant")
  expect(author?.parts.flatMap((part) => part.type === "text" ? [part.text] : [])).toEqual([final])
  expect((yield* ClaudeResearchFixture.charges(dispatch.child)).filter((entry) => entry.kind === "provider")).toEqual([])
  expect(yield* fixture.research.status(dispatch.child)).toMatchObject({ closed: true, deadlineActive: false })
}), 30_000)

for (const outcome of ["completed", "failed", "query-close"] as const)
  ClaudeResearchFixture.it.instance(`native ${outcome} closes tool admission before timer cleanup`, () => Effect.gen(function* () {
    const fixture = yield* ClaudeResearchFixture.setup()
    const dispatch = yield* fixture.nativeDispatch()
    yield* TestClock.adjust("599 seconds")
    if (outcome === "completed") yield* dispatch.settle()
    if (outcome === "failed") yield* fixture.fire({ ...ClaudeResearchFixture.base, hook_event_name: "PostToolUseFailure",
      tool_name: "Agent", tool_use_id: dispatch.callID, tool_input: {}, error: "Agent failed" })
    if (outcome === "query-close") yield* fixture.research.close
    yield* TestClock.adjust("601 seconds")
    expect(yield* fixture.research.stopReason(dispatch.child)).toBeUndefined()
    expect(fixture.research.signal(dispatch.child)?.aborted).toBe(true)
    expect(yield* fixture.research.status(dispatch.child)).toMatchObject({ closed: true, deadlineActive: false })
    const late = yield* Effect.exit(dispatch.run("research_view", { action: "corpus" }, "after-terminal"))
    expect(Exit.isFailure(late)).toBe(true)
    if (Exit.isFailure(late)) expect(Cause.squash(late.cause)).toMatchObject({ _tag: "ClaudeHostResearch.TerminalClosed" })
  }).pipe(Effect.provide(TestClock.layer())), 30_000)

ClaudeResearchFixture.it.instance("native hook tool debits deduplicate registry execution, stop at 64, and preserve captured bytes", () => Effect.gen(function* () {
  const fixture = yield* ClaudeResearchFixture.setup()
  const dispatch = yield* fixture.nativeDispatch()
  const text = "Only release 1 under enabled mode."
  yield* Effect.promise(() => Bun.write(path.join(fixture.parent.directory, "conditions.txt"), text))
  expect(yield* dispatch.pre("mcp__orchestra__research_capture", "capture", { kind: "file", path: "conditions.txt" }))
    .toMatchObject({ hookSpecificOutput: { permissionDecision: "allow" } })
  const captured = yield* dispatch.run("research_capture", { kind: "file", path: "conditions.txt" }, "capture")
  const receipt = Schema.decodeUnknownSync(Research.SourceReceipt)(captured.metadata.researchSource)
  const charged = yield* ClaudeResearchFixture.charges(dispatch.child)
  expect(charged.filter((entry) => entry.kind === "tool")).toHaveLength(1)
  expect(charged.filter((entry) => entry.kind === "bytes").reduce((sum, entry) => sum + entry.amount, 0))
    .toBeGreaterThanOrEqual(Buffer.byteLength(text))
  yield* Effect.forEach(Array.from({ length: 63 }, (_, index) => index), (index) => Effect.gen(function* () {
    expect(yield* dispatch.pre("mcp__orchestra__research_view", `view-${index}`, { action: "corpus" }))
      .toMatchObject({ hookSpecificOutput: { permissionDecision: "allow" } })
  }))
  expect(yield* dispatch.pre("mcp__orchestra__research_view", "view-over-cap", { action: "corpus" }))
    .toMatchObject({ hookSpecificOutput: { permissionDecision: "deny" }, continue: false,
      stopReason: expect.stringContaining("budget_exhausted") })
  expect((yield* ClaudeResearchFixture.charges(dispatch.child)).filter((entry) => entry.kind === "tool")).toHaveLength(64)
  const records = yield* ResearchRecords.Service
  expect(yield* records.view(receipt.binding, { action: "source", ref: receipt.ref })).toMatchObject({ text })
  const second = yield* fixture.nativeDispatch("second-native-dispatch")
  yield* second.run("research_view", { action: "corpus" }, "fresh")
  expect(yield* ClaudeResearchFixture.charges(second.child)).toMatchObject([{ kind: "tool", amount: 1 }])
}), 30_000)

ClaudeResearchFixture.it.instance("native byte reservation refuses retention beyond 64 MiB with the named budget error", () => Effect.gen(function* () {
  const fixture = yield* ClaudeResearchFixture.setup()
  const dispatch = yield* fixture.nativeDispatch()
  const execution = yield* ResearchExecution.Service
  yield* fixture.research.execute(dispatch.child,
    execution.captureBytes(dispatch.child, "prior-captures", Research.Tiers.quick.capturedBytes - 1, Effect.void))
  yield* Effect.promise(() => Bun.write(path.join(fixture.parent.directory, "over-cap.txt"), "over byte budget"))
  expect(yield* dispatch.pre("mcp__orchestra__research_capture", "over-cap", { kind: "file", path: "over-cap.txt" }))
    .toMatchObject({ hookSpecificOutput: { permissionDecision: "allow" } })
  const exit = yield* Effect.exit(dispatch.run("research_capture", { kind: "file", path: "over-cap.txt" }, "over-cap"))
  expect(Exit.isFailure(exit)).toBe(true)
  if (Exit.isFailure(exit)) expect(Cause.squash(exit.cause)).toMatchObject({ code: "budget_exhausted" })
  expect(yield* dispatch.post("mcp__orchestra__research_capture", "over-cap"))
    .toMatchObject({ continue: false, stopReason: expect.stringContaining("budget_exhausted") })
  expect((yield* ClaudeResearchFixture.charges(dispatch.child)).filter((entry) => entry.kind === "bytes")
    .reduce((total, entry) => total + entry.amount, 0)).toBe(Research.Tiers.quick.capturedBytes - 1)
  const records = yield* ResearchRecords.Service
  const binding = yield* ResearchBinding.resolve(dispatch.child, fixture.parent.projectID)
  expect(yield* records.view(binding, { action: "corpus" })).toMatchObject({ sources: [] })
}), 30_000)

ClaudeResearchFixture.it.instance("plugin and SDK maxTurns follow each tier agent while a dispatch keeps its bound tier limit", () => Effect.gen(function* () {
  const fixture = yield* ClaudeResearchFixture.setup()
  const dispatch = yield* fixture.nativeDispatch()
  const limit = yield* fixture.research.execute(dispatch.child,
    Effect.map(ResearchExecution.Current, (frame) => frame?.allowance.providerLimit))
  expect(limit).toBe(24)
  const input = { seats: [fixture.seat], tools: { jimmy: fixture.tools.map((tool) => tool.id) }, root: path.join(fixture.parent.directory, "plugin") }
  const plugin = yield* Effect.promise(() => ClaudeHostPlugin.build(input))
  expect(yield* Effect.promise(() => Bun.file(path.join(plugin.path, "agents/jimmy-deep.md")).text()))
    .toMatch(/^---\n[^]*\nmaxTurns: 96\n---\n/)
  const sdk = yield* Effect.promise(() => ClaudeHostPlugin.build({ ...input, sdk: { jimmy: {} } }))
  expect(sdk.sdkAgents["orchestra:jimmy-quick"].maxTurns).toBe(Research.Tiers.quick.providerCalls)
  expect(sdk.sdkAgents["orchestra:jimmy-deep"].maxTurns).toBe(Research.Tiers.deep.providerCalls)
  expect(yield* ClaudeResearchFixture.charges(dispatch.child)).toEqual([])
}), 30_000)

ClaudeResearchFixture.it.instance("native dispatch timer closes admission and aborts MCP at 600 seconds without stopping parent or sibling", () => Effect.gen(function* () {
  const fixture = yield* ClaudeResearchFixture.setup()
  const dispatch = yield* fixture.nativeDispatch()
  const transport = yield* BridgeFixture.make(fixture.parent.id, fixture.research)
  const entered = yield* Deferred.make<AbortSignal>()
  const closed = yield* Deferred.make<void>()
  const pending: Tool.Def = { id: "research_view", description: "Held research service call", parameters: Schema.Struct({}),
    execute: (_args, context) => Deferred.succeed(entered, context.abort).pipe(Effect.andThen(Effect.never),
      Effect.ensuring(Deferred.succeed(closed, undefined))) }
  expect(yield* dispatch.pre("mcp__orchestra__research_view", "held-call", {}))
    .toMatchObject({ hookSpecificOutput: { permissionDecision: "allow" } })
  const part = yield* transport.call({ id: "held-call", tool: "research_view", args: {}, sessionID: dispatch.child, seat: "jimmy" })
  yield* transport.bridge.claim("research_view", transport.arguments("held-call"), new AbortController().signal)
  const context = yield* transport.bridge.context(part)
  const running = yield* transport.bridge.execute(pending, {}, context).pipe(Effect.exit, Effect.forkScoped)
  const signal = yield* Deferred.await(entered)
  yield* TestClock.adjust("599 seconds")
  expect(signal.aborted).toBe(false)
  expect(yield* fixture.research.stopReason(dispatch.child)).toBeUndefined()
  const other = yield* fixture.nativeDispatch("other-native-dispatch")
  yield* fixture.research.enter(dispatch.child, dispatch.callID)
  yield* TestClock.adjust("1 second")
  expect(signal.aborted).toBe(true)
  expect(fixture.abort.signal.aborted).toBe(false)
  expect(transport.ctx.abort.signal.aborted).toBe(false)
  yield* Deferred.await(closed)
  expect(Exit.isFailure(yield* Fiber.join(running))).toBe(true)
  expect(yield* fixture.research.stopReason(dispatch.child)).toContain("deadline")
  expect(yield* dispatch.pre("Read", "after-deadline"))
    .toMatchObject({ continue: false, stopReason: expect.stringContaining("deadline"),
      hookSpecificOutput: { permissionDecision: "deny" } })
  const late = yield* Effect.exit(fixture.research.tool(dispatch.child, "late-call", "mcp__orchestra__research_view"))
  expect(Exit.isFailure(late)).toBe(true)
  if (Exit.isFailure(late)) expect(Cause.squash(late.cause)).toMatchObject({
    _tag: "ClaudeHostResearch.TerminalClosed", message: expect.stringContaining("RESEARCH_TERMINAL_CLOSED"),
  })
  yield* other.run("research_view", { action: "corpus" }, "other-call")
  expect(fixture.research.signal(other.child)?.aborted).toBe(false)
  // Scripted join identity does not supply an SDK control port or prove physical task completion.
}).pipe(Effect.provide(TestClock.layer())), 30_000)

for (const outcome of ["settle", "close"] as const)
  ClaudeResearchFixture.it.instance(`service ${outcome} closes admission and aborts its signal without native provider execution`, () => Effect.gen(function* () {
    const fixture = yield* ClaudeResearchFixture.setup()
    const dispatch = yield* fixture.serviceDispatch()
    expect(fixture.research.signal(dispatch.child)).toBeInstanceOf(AbortSignal)
    yield* TestClock.adjust("599 seconds")
    if (outcome === "settle") yield* fixture.research.settle(dispatch.child)
    if (outcome === "close") yield* fixture.research.close
    yield* TestClock.adjust("601 seconds")
    expect(yield* fixture.research.stopReason(dispatch.child)).toBeUndefined()
    expect(fixture.research.signal(dispatch.child)?.aborted).toBe(true)
    expect(yield* fixture.research.status(dispatch.child)).toMatchObject({ closed: true, deadlineActive: false })
    const late = yield* Effect.exit(fixture.research.tool(dispatch.child, "after-terminal", "research_view"))
    expect(Exit.isFailure(late)).toBe(true)
    if (Exit.isFailure(late)) expect(Cause.squash(late.cause)).toMatchObject({ _tag: "ClaudeHostResearch.TerminalClosed" })
  }).pipe(Effect.provide(TestClock.layer())), 30_000)
