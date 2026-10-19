import { expect } from "bun:test"
import { Effect, Exit } from "effect"
import { ToolSafety } from "@orchestra/core/tool-safety"
import { Research } from "@orchestra/schema/research"
import { LogicalTask } from "@/maestro/logical-task"
import { ClaudeCodeTools } from "@/claude-code/tools"
import { ClaudeHostHooks } from "@/claude-code/host/hooks"
import { DelegationTerminalFixture } from "./delegation-terminal-fixture"
import { ResearchTerminalFixture } from "./research-terminal-fixture"

// Unit/service evidence only. Direct delegated lifecycle tests cannot establish current native Jimmy admission.
const it = DelegationTerminalFixture.it
const secret = "Synthetic refused sentinel: sk-proj-" + "fixturecredential".repeat(3)
const safeDiagnostic = "HOLD: native diagnostic refused by ToolSafety inspection"

it.instance("unit parent retains deadline/control acknowledgement, exact author/card and admitted qualifications", () => Effect.gen(function* () {
  const fixture = yield* DelegationTerminalFixture.setup()
  yield* fixture.timed(Effect.gen(function* () {
    const dispatch = yield* fixture.admit()
    const retained = yield* DelegationTerminalFixture.retain(fixture, dispatch)
    const author = yield* fixture.author(dispatch, retained.text)
    const original = yield* fixture.sessions.messages({ sessionID: dispatch.child })
    const logical = yield* LogicalTask.read(dispatch.child)
    yield* fixture.advance("300 seconds")
    const other = yield* fixture.admit("other-child")
    yield* fixture.advance("300 seconds")
    yield* fixture.controlSettled(dispatch.child)
    const report = yield* fixture.delegation.settle(DelegationTerminalFixture.post(dispatch.callID, dispatch.taskID, retained.text))
    if (!report) throw new Error("Expected explicit interrupted research report")
    const part = yield* fixture.part(dispatch.callID)
    if (part?.state.status !== "completed") throw new Error("Expected completed return with interrupted research metadata")
    expect(part.id).toBe(dispatch.part.id)
    expect(part.callID).toBe(dispatch.callID)
    expect(part.state.output).toBe(report)
    expect(report).toContain("Orchestra research interrupted: budget_exhausted:")
    expect(report).toContain("SDK stop control does not establish physical completion")
    expect(report).toContain("Inquiry check: pass")
    expect(report).toContain("Retained finding qualifications")
    expect(report).toContain(JSON.stringify(retained.finding))
    expect(report).toContain(JSON.stringify(retained.text))
    expect(part.state.metadata.researchControl).toMatchObject({ version: 1, source: "claude-code-host-research",
      dispatchCallID: dispatch.callID, executionSessionID: dispatch.child, seat: "jimmy", admission: "closed", deadlineActive: false,
      exhaustionReason: expect.stringContaining("deadline exhausted"), nativeJoin: { status: "joined", taskID: dispatch.taskID },
      nativeStop: { status: "acknowledged", evidence: "sdk-control-status", physicalCompletion: "unobserved" } })
    expect(part.state.metadata.researchControl.nativeBudget).toEqual({
      tier: "quick",
      deadlineSeconds: Research.Tiers.quick.deadlineSeconds,
      tools: { limit: Research.Tiers.quick.toolCalls, admission: "pre-execution" },
      retainedBytes: { limit: Research.Tiers.quick.capturedBytes, admission: "pre-retention" },
      provider: { accounting: "observed-sdk-response-ids", limit: Research.Tiers.quick.providerCalls, maxTurns: Research.Tiers.deep.providerCalls,
        bound: "native-agentic-api-round-trips", physicalPreProviderAdmission: "unavailable", hiddenWork: "unmeasured" },
    })
    expect(part.state.metadata.workResult).toMatchObject({ terminal: { reason: "interrupted", hostDetail: expect.stringContaining("deadline") },
      referencesChecked: true, outcome: "done", card: { parsed: true },
      discovery: { schema: "jimmy-card-v2", sufficiency: "answered", claims: [{ ref: retained.claim }], documentRefs: [retained.document.ref],
        check: { verdict: "pass" } },
      documents: [retained.document], qualifications: { records: [retained.finding], complete: true } })
    expect(part.state.metadata.delivery).toBeUndefined()
    expect(yield* fixture.sessions.messages({ sessionID: dispatch.child })).toEqual(original)
    expect(original.find((message) => message.info.id === author.id)?.parts.flatMap((part) => part.type === "text" ? [part.text] : []))
      .toEqual([retained.text])
    expect(yield* LogicalTask.read(dispatch.child)).toEqual(logical)
    expect(yield* retained.records.view(retained.binding, { action: "record", ref: retained.claim })).toEqual(retained.finding)
    expect(yield* retained.records.view(retained.binding, { action: "source", ref: retained.source.ref })).toMatchObject({
      text: "Declared: release 1 enabled mode works.\nContrary: disabled mode rejects requests." })
    if (!retained.source.derivedFrom) throw new Error("Expected original received-byte provenance")
    expect(yield* retained.records.view(retained.binding, { action: "source", ref: retained.source.derivedFrom })).toMatchObject({
      text: "Declared: release 1 enabled mode works.\nContrary: disabled mode rejects requests.\n" })
    const parent = yield* fixture.sessions.messages({ sessionID: fixture.parent.id })
    yield* Effect.all([
      fixture.delegation.settle(DelegationTerminalFixture.post(dispatch.callID, dispatch.taskID, "late replacement")),
      fixture.delegation.fail(DelegationTerminalFixture.failure(dispatch.callID)),
      fixture.delegation.dispatch(dispatch.hook, { sessionID: fixture.parent.id, seat: "maestro" }),
    ], { concurrency: "unbounded" })
    expect(yield* fixture.sessions.messages({ sessionID: fixture.parent.id })).toEqual(parent)
    expect(yield* fixture.sessions.messages({ sessionID: dispatch.child })).toEqual(original)
    expect(fixture.stopped).toEqual([dispatch.taskID])
    expect(fixture.parentControl).toEqual({ interrupts: 0, closes: 0 })
    expect(yield* fixture.research.execute(fixture.parent.id, Effect.succeed("parent live"))).toBe("parent live")
    expect(yield* fixture.research.status(other.child)).toMatchObject({ closed: false, deadlineActive: true })
    expect(fixture.research.signal(other.child)?.aborted).toBe(false)
  }))
}), 30_000)

it.instance("unit SDK stop failure keeps the named control error and author; it cannot certify physical completion", () => Effect.gen(function* () {
  const fixture = yield* DelegationTerminalFixture.setup({ stop: () => Promise.reject(new Error("unit SDK stop rejected")) })
  yield* fixture.timed(Effect.gen(function* () {
    const dispatch = yield* fixture.admit()
    const bytes = "Partial café\r\n  conditions still apply\n"
    yield* fixture.advance("600 seconds")
    yield* fixture.controlSettled(dispatch.child)
    const report = yield* fixture.delegation.settle(DelegationTerminalFixture.post(dispatch.callID, dispatch.taskID, bytes))
    const part = yield* fixture.part(dispatch.callID)
    if (part?.state.status !== "completed") throw new Error("Expected retained interrupted return")
    expect(part.state.metadata.researchControl).toMatchObject({ admission: "closed", exhaustionReason: expect.stringContaining("deadline"),
      nativeStop: { status: "failed", physicalCompletion: "unobserved", error: { name: "ClaudeHostResearch.NativeStopError",
        reason: "request_failed", message: expect.stringContaining("NATIVE_RESEARCH_STOP_REQUEST_FAILED") } } })
    expect(part.state.metadata.workResult).toMatchObject({ terminal: { reason: "interrupted" } })
    expect(report).toContain("Orchestra research interrupted")
    const author = (yield* fixture.sessions.messages({ sessionID: dispatch.child })).findLast((message) => message.info.role === "assistant")
    expect(author?.parts.flatMap((part) => part.type === "text" ? [part.text] : [])).toEqual([bytes])
    expect(fixture.parentControl).toEqual({ interrupts: 0, closes: 0 })
  }))
}), 30_000)

for (const interrupted of [false, true])
  it.instance(`unit Agent ${interrupted ? "interruption" : "failure"} persists without output, author or invented native identity`, () => Effect.gen(function* () {
    const fixture = yield* DelegationTerminalFixture.setup({ pendingJoin: true })
    const dispatch = yield* fixture.admit()
    const before = yield* fixture.sessions.messages({ sessionID: dispatch.child })
    const failed = DelegationTerminalFixture.failure(dispatch.callID, interrupted)
    const contexts = yield* Effect.all([fixture.delegation.fail(failed), fixture.delegation.fail(failed)], { concurrency: "unbounded" })
    const part = yield* fixture.part(dispatch.callID)
    if (part?.state.status !== "error") throw new Error("Expected failed Agent part")
    expect(part.id).toBe(dispatch.part.id)
    expect(part.tool).toBe("Agent")
    expect(part.state.error).toBe(`${interrupted ? "CLAUDE_CODE_AGENT_INTERRUPTED" : "CLAUDE_CODE_AGENT_FAILED"}: ${failed.error}`)
    expect(part.state.metadata).toMatchObject({ parentSessionId: fixture.parent.id, sessionId: dispatch.child, background: false,
      terminal: { reason: interrupted ? "interrupted" : "failed", hostDetail: failed.error },
      nativeError: { name: "CLAUDE_CODE_AGENT_FAILURE", message: failed.error, interrupted },
      researchControl: { admission: "closed", nativeJoin: { status: "pending" }, nativeStop: { status: "not_requested" } } })
    expect(JSON.stringify(part.state)).not.toContain("FORGED")
    expect(part.state.metadata?.claudeCodeDispatch).toBeUndefined()
    expect(part.state.metadata?.workResult).toBeUndefined()
    expect(part.state.metadata?.delivery).toBeUndefined()
    expect(part.state.metadata?.researchControl.nativeJoin.taskID).toBeUndefined()
    expect(contexts.filter((context) => context !== undefined)).toHaveLength(1)
    expect(contexts.find((context) => context !== undefined)).toContain("no authored result or delivery")
    const parent = yield* fixture.sessions.messages({ sessionID: fixture.parent.id })
    yield* Effect.all([fixture.delegation.fail(failed), fixture.delegation.fail(failed),
      fixture.delegation.settle(DelegationTerminalFixture.post(dispatch.callID, "invented-late-id", "invented-late-output")),
    ], { concurrency: "unbounded" })
    expect(yield* fixture.sessions.messages({ sessionID: dispatch.child })).toEqual(before)
    expect(yield* fixture.sessions.messages({ sessionID: fixture.parent.id })).toEqual(parent)
    expect(fixture.join.get(dispatch.callID)?.taskID).toBeUndefined()
    expect(fixture.delegation.summaries()).toMatchObject([{ settled: true }])
    expect(yield* fixture.delegation.fail(DelegationTerminalFixture.failure("unadmitted"))).toBeUndefined()
    expect(fixture.parentControl).toEqual({ interrupts: 0, closes: 0 })
    expect(yield* fixture.research.execute(fixture.parent.id, Effect.succeed("parent live"))).toBe("parent live")
  }), 30_000)

it.instance("unit background launch failure cannot fabricate delivery or later publish a stop candidate", () => Effect.gen(function* () {
  const fixture = yield* DelegationTerminalFixture.setup()
  const dispatch = yield* fixture.admit("background", "patty", true)
  yield* fixture.delegation.settle({ ...DelegationTerminalFixture.post(dispatch.callID, dispatch.taskID, ""),
    tool_response: { status: "async_launched", agentId: dispatch.taskID, description: "Unit review", prompt: "Review.", outputFile: "/tmp/unit" } })
  fixture.delegation.stop(dispatch.taskID, "unpublished background candidate")
  const before = yield* fixture.sessions.messages({ sessionID: dispatch.child })
  yield* fixture.delegation.fail(DelegationTerminalFixture.failure(dispatch.callID))
  const part = yield* fixture.part(dispatch.callID)
  if (part?.state.status !== "error") throw new Error("Expected failed background Agent part")
  expect(part.state.metadata).toMatchObject({ background: true, sessionId: dispatch.child, terminal: { reason: "failed" } })
  expect(part.state.metadata?.delivery).toBeUndefined()
  expect(part.state.metadata?.claudeCodeDispatch).toBeUndefined()
  yield* fixture.delegation.notify({ type: "system", subtype: "task_notification", task_id: dispatch.taskID, tool_use_id: dispatch.callID,
    status: "completed", output_file: "/tmp/unit", summary: "Late completion", uuid: crypto.randomUUID(), session_id: "unit-host" })
  expect(yield* fixture.part(dispatch.callID)).toEqual(part)
  expect(yield* fixture.sessions.messages({ sessionID: dispatch.child })).toEqual(before)
  expect(fixture.parentControl).toEqual({ interrupts: 0, closes: 0 })
}), 30_000)

it.instance("unit failed Agent callback retains deadline acknowledgement without publishing a SubagentStop candidate", () => Effect.gen(function* () {
  const fixture = yield* DelegationTerminalFixture.setup()
  yield* fixture.timed(Effect.gen(function* () {
    const dispatch = yield* fixture.admit()
    fixture.delegation.stop(dispatch.taskID, "unpublished final candidate")
    const before = yield* fixture.sessions.messages({ sessionID: dispatch.child })
    yield* fixture.advance("600 seconds")
    yield* fixture.controlSettled(dispatch.child)
    yield* fixture.delegation.fail(DelegationTerminalFixture.failure(dispatch.callID, true))
    const part = yield* fixture.part(dispatch.callID)
    if (part?.state.status !== "error") throw new Error("Expected interrupted Agent part")
    expect(part.state.metadata?.researchControl).toMatchObject({ exhaustionReason: expect.stringContaining("deadline"),
      nativeJoin: { taskID: dispatch.taskID }, nativeStop: { status: "acknowledged", physicalCompletion: "unobserved" } })
    expect(part.state.metadata?.delivery).toBeUndefined()
    expect(yield* fixture.sessions.messages({ sessionID: dispatch.child })).toEqual(before)
    expect(fixture.stopped).toEqual([dispatch.taskID])
  }))
}), 30_000)

it.instance("unit ToolSafety refusal precedes exhausted author publication and preserves its exact sanitization", () => Effect.gen(function* () {
  const fixture = yield* DelegationTerminalFixture.setup()
  yield* fixture.timed(Effect.gen(function* () {
    const dispatch = yield* fixture.admit()
    const author = yield* fixture.author(dispatch, secret)
    yield* fixture.advance("600 seconds")
    yield* fixture.controlSettled(dispatch.child)
    const hook = DelegationTerminalFixture.post(dispatch.callID, dispatch.taskID, secret)
    const inspected = yield* Effect.exit(ToolSafety.inspect(hook.tool_response))
    if (!Exit.isFailure(inspected)) throw new Error("Expected real ToolSafety refusal")
    const context = yield* fixture.delegation.settle(hook, ClaudeCodeTools.failure(inspected.cause))
    const part = yield* fixture.part(dispatch.callID)
    if (part?.state.status !== "completed") throw new Error("Expected sanitized Agent part")
    expect(part.state.output).toBe("HOLD: Agent output refused by ToolSafety inspection")
    expect(part.state.metadata.hold).toBe(part.state.output)
    expect(part.state.metadata.researchControl).toMatchObject({ admission: "closed", deadlineActive: false,
      exhaustionCode: "budget_exhausted", exhaustionReason: expect.stringContaining("deadline"),
      nativeJoin: { status: "joined", taskID: dispatch.taskID }, nativeStop: { status: "acknowledged", physicalCompletion: "unobserved" } })
    expect(part.state.metadata.terminal).toMatchObject({ reason: "interrupted", hostDetail: expect.stringContaining("deadline") })
    expect(part.state.metadata.workResult).toBeUndefined()
    expect(part.state.metadata.claudeCodeDispatch).toBeUndefined()
    expect(part.state.metadata.delivery).toBeUndefined()
    expect(context).toContain("recorded no attributed result")
    const child = yield* fixture.sessions.messages({ sessionID: dispatch.child })
    expect(child.find((message) => message.info.id === author.id)?.parts.flatMap((part) => part.type === "text" ? [part.text] : []))
      .toEqual([part.state.output])
    expect(JSON.stringify([yield* fixture.sessions.messages({ sessionID: fixture.parent.id }), child, context])).not.toContain(secret)
    expect(yield* fixture.delegation.settle(hook, ClaudeCodeTools.failure(inspected.cause))).toBeUndefined()
    expect(yield* fixture.sessions.messages({ sessionID: dispatch.child })).toEqual(child)
    expect(yield* fixture.part(dispatch.callID)).toEqual(part)
    expect(yield* fixture.research.stopReason(dispatch.child)).toContain("deadline")
    expect(fixture.parentControl).toEqual({ interrupts: 0, closes: 0 })
  }))
}), 30_000)

it.instance("unit secret-bearing SDK failure retains only a fixed diagnostic and real research closure", () => Effect.gen(function* () {
  const fixture = yield* DelegationTerminalFixture.setup()
  const dispatch = yield* fixture.admit()
  expect(Exit.isFailure(yield* Effect.exit(ToolSafety.inspect(secret)))).toBe(true)
  const child = yield* fixture.sessions.messages({ sessionID: dispatch.child })
  const context = yield* fixture.delegation.fail({ ...DelegationTerminalFixture.failure(dispatch.callID), error: secret })
  const part = yield* fixture.part(dispatch.callID)
  if (part?.state.status !== "error") throw new Error("Expected sanitized failure")
  expect(part.state.error).toBe(`CLAUDE_CODE_AGENT_FAILED: ${safeDiagnostic}`)
  expect(part.state.metadata).toMatchObject({ terminal: { reason: "failed", hostDetail: safeDiagnostic },
    nativeError: { message: safeDiagnostic }, researchControl: { admission: "closed", nativeJoin: { taskID: dispatch.taskID } } })
  expect(context).toContain(safeDiagnostic)
  const hook = DelegationTerminalFixture.post(dispatch.callID, dispatch.taskID, secret)
  const inspected = yield* Effect.exit(ToolSafety.inspect(hook.tool_response))
  if (!Exit.isFailure(inspected)) throw new Error("Expected real ToolSafety refusal")
  expect(yield* fixture.delegation.settle(hook, ClaudeCodeTools.failure(inspected.cause))).toBeUndefined()
  expect(yield* fixture.part(dispatch.callID)).toEqual(part)
  expect(yield* fixture.sessions.messages({ sessionID: dispatch.child })).toEqual(child)
  expect(JSON.stringify([yield* fixture.sessions.messages({ sessionID: fixture.parent.id }), child, context])).not.toContain(secret)
}), 30_000)

it.instance("unit secret-bearing native stop failure is sanitized before control retention and report context", () => Effect.gen(function* () {
  const fixture = yield* DelegationTerminalFixture.setup({ stop: () => Promise.reject(new Error(secret)) })
  yield* fixture.timed(Effect.gen(function* () {
    const dispatch = yield* fixture.admit()
    yield* fixture.advance("600 seconds")
    const state = yield* fixture.controlSettled(dispatch.child)
    if (state.nativeStop.status !== "failed") throw new Error("Expected SDK stop rejection")
    expect(Exit.isFailure(yield* Effect.exit(ToolSafety.inspect(state.nativeStop.error.message)))).toBe(true)
    const context = yield* fixture.delegation.settle(DelegationTerminalFixture.post(dispatch.callID, dispatch.taskID, "Qualified safe partial report."))
    const part = yield* fixture.part(dispatch.callID)
    if (part?.state.status !== "completed") throw new Error("Expected retained interrupted report")
    expect(part.state.metadata.researchControl).toMatchObject({ admission: "closed", exhaustionCode: "budget_exhausted",
      dispatchCallID: dispatch.callID, executionSessionID: dispatch.child, nativeJoin: { taskID: dispatch.taskID },
      nativeStop: { status: "failed", physicalCompletion: "unobserved", error: { name: "ClaudeHostResearch.NativeStopError",
        reason: "request_failed", message: safeDiagnostic } } })
    expect(context).toContain("SDK stop control does not establish physical completion")
    expect(JSON.stringify([yield* fixture.sessions.messages({ sessionID: fixture.parent.id }),
      yield* fixture.sessions.messages({ sessionID: dispatch.child }), context])).not.toContain(secret)
  }))
}), 30_000)

it.instance("unit untrusted exhaustion text keeps the budget code while sanitizing parent report and context", () => Effect.gen(function* () {
  const fixture = yield* DelegationTerminalFixture.setup({ exhaustion: `budget_exhausted: ${secret}` })
  const dispatch = yield* fixture.admit()
  const context = yield* fixture.delegation.settle(DelegationTerminalFixture.post(dispatch.callID, dispatch.taskID, "Safe authored conditions."))
  const part = yield* fixture.part(dispatch.callID)
  if (part?.state.status !== "completed") throw new Error("Expected sanitized interrupted report")
  expect(part.state.metadata.researchControl).toMatchObject({ admission: "closed", exhaustionCode: "budget_exhausted",
    exhaustionReason: safeDiagnostic, dispatchCallID: dispatch.callID, executionSessionID: dispatch.child })
  expect(part.state.metadata.workResult.terminal).toEqual({ reason: "interrupted", hostDetail: safeDiagnostic })
  expect(context).toContain(`Orchestra research interrupted: ${safeDiagnostic}`)
  expect(JSON.stringify([yield* fixture.sessions.messages({ sessionID: fixture.parent.id }),
    yield* fixture.sessions.messages({ sessionID: dispatch.child }), context])).not.toContain(secret)
}), 30_000)

for (const outcome of ["failure", "completed"] as const)
  it.instance(`unit real hooks withhold a refused retry after ${outcome} without changing terminal parent or child`, () => Effect.gen(function* () {
    const fixture = yield* DelegationTerminalFixture.setup()
    const dispatch = yield* fixture.hookAdmit()
    const context = yield* fixture.fire(outcome === "failure"
      ? { ...DelegationTerminalFixture.failure(dispatch.callID), error: secret }
      : DelegationTerminalFixture.post(dispatch.callID, dispatch.taskID, "Accepted non-research report.", "patty"))
    const part = yield* fixture.part(dispatch.callID)
    expect(part?.state.status).toBe(outcome === "failure" ? "error" : "completed")
    if (outcome === "failure") {
      if (part?.state.status !== "error") throw new Error("Expected sanitized hook failure")
      expect(JSON.stringify(context)).toContain(safeDiagnostic)
      expect(part.state.metadata).toMatchObject({ terminal: { hostDetail: safeDiagnostic }, nativeError: { message: safeDiagnostic } })
    }
    const parent = yield* fixture.sessions.messages({ sessionID: fixture.parent.id })
    const child = yield* fixture.sessions.messages({ sessionID: dispatch.child })
    const hook = DelegationTerminalFixture.post(dispatch.callID, dispatch.taskID, secret, "patty")
    expect(Exit.isFailure(yield* Effect.exit(ToolSafety.inspect(hook.tool_response)))).toBe(true)
    const output = yield* fixture.fire(hook)
    if (!("hookSpecificOutput" in output) || output.hookSpecificOutput?.hookEventName !== "PostToolUse")
      throw new Error("Expected real hook withholding")
    expect(output.hookSpecificOutput.updatedToolOutput).toContain("Orchestra withheld this output:")
    expect(output.hookSpecificOutput.additionalContext).toBeUndefined()
    yield* fixture.fire({ ...DelegationTerminalFixture.failure(dispatch.callID), error: secret })
    expect(yield* fixture.sessions.messages({ sessionID: fixture.parent.id })).toEqual(parent)
    expect(yield* fixture.sessions.messages({ sessionID: dispatch.child })).toEqual(child)
    expect(fixture.join.get(dispatch.callID)?.hold).toBeUndefined()
    expect(JSON.stringify([parent, child, context, output])).not.toContain(secret)
    expect(fixture.parentControl).toEqual({ interrupts: 0, closes: 0 })
  }), 30_000)

it.instance("unit parent observes after-frame provider exhaustion while a fresh real native dispatch has its own allowance", () => Effect.gen(function* () {
  const fixture = yield* DelegationTerminalFixture.setup()
  const dispatch = yield* fixture.admit()
  yield* Effect.forEach(Array.from({ length: Research.Tiers.quick.providerCalls }, (_, index) => index), (index) =>
    fixture.research.observe(fixture.join, ResearchTerminalFixture.assistant(dispatch.callID, `observed-${index}`)))
  yield* fixture.delegation.settle(DelegationTerminalFixture.post(dispatch.callID, dispatch.taskID, "Observed frames only."))
  const part = yield* fixture.part(dispatch.callID)
  if (part?.state.status !== "completed") throw new Error("Expected interrupted return")
  expect(part.state.metadata.researchControl).toMatchObject({ exhaustionReason: expect.stringContaining("provider allowance exhausted"),
    admission: "closed", nativeStop: { status: "not_requested", physicalCompletion: "unobserved" } })
  const context = yield* Effect.context<never>()
  const abort = new AbortController()
  yield* Effect.addFinalizer(() => Effect.sync(() => abort.abort()))
  const hooks = ClaudeHostHooks.create({ sessionID: fixture.parent.id, directory: fixture.parent.directory, worktree: fixture.parent.directory,
    agent: "maestro", join: fixture.join, abort, research: fixture.research, granted: { maestro: ["task"] },
    run: <A, R>(effect: Effect.Effect<A, unknown, R>) => Effect.runPromiseWith(context)(effect as Effect.Effect<A, unknown>),
    policy: { granted: { maestro: ["task"] }, hold: () => Effect.void, safety: () => Effect.void, arsenal: () => Effect.void,
      ask: () => Effect.void, confine: () => Effect.succeed(undefined), release: () => Effect.void, close: Effect.void },
  })
  const children = yield* fixture.sessions.children(fixture.parent.id)
  const output = yield* Effect.promise(() => hooks.PreToolUse![0].hooks[0]({ ...dispatch.hook, tool_use_id: "native-attempt" },
    undefined, { signal: abort.signal }))
  expect(output).toMatchObject({ hookSpecificOutput: { permissionDecision: "allow" } })
  const next = fixture.join.child("native-attempt")
  if (!next) throw new Error("Expected admitted native child")
  expect((yield* fixture.sessions.children(fixture.parent.id)).map((child) => child.id))
    .toEqual(expect.arrayContaining([...children.map((child) => child.id), next]))
  expect(yield* fixture.research.status(next)).toMatchObject({ closed: false, deadlineActive: true })
  expect(fixture.parentControl).toEqual({ interrupts: 0, closes: 0 })
}), 30_000)
