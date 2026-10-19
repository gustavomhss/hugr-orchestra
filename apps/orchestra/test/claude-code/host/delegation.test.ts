import { afterEach, describe, expect } from "bun:test"
import { CrossSpawnSpawner } from "@orchestra/core/cross-spawn-spawner"
import { Database } from "@orchestra/core/database/database"
import { filesystem } from "@orchestra/core/effect/app-node-platform"
import { LayerNode } from "@orchestra/core/effect/layer-node"
import { ModelV2 } from "@orchestra/core/model"
import { ProviderV2 } from "@orchestra/core/provider"
import { SessionProjector } from "@orchestra/core/session/projector"
import { SessionSubagentModels } from "@orchestra/core/session/subagent-models"
import { ToolSafety } from "@orchestra/core/tool-safety"
import type { SessionV1 } from "@orchestra/core/v1/session"
import { SessionMessage } from "@orchestra/schema/session-message"
import { UpstreamAttribution } from "@orchestra/schema/upstream-attribution"
import type { HookCallbackMatcher, HookInput, HookJSONOutput, SDKTaskNotificationMessage } from "@anthropic-ai/claude-agent-sdk"
import { Cause, Effect, Exit, Schema } from "effect"
import { ClaudeHostGate } from "@/claude-code/host/gate"
import { ClaudeHostHooks } from "@/claude-code/host/hooks"
import { ClaudeHostJoin } from "@orchestra/engine-claude-code/host/join"
import { ClaudeHostMcp } from "@/claude-code/host/mcp"
import { ClaudeHostMirror } from "@/claude-code/host/mirror"
import { Agent } from "@/agent/agent"
import { BackgroundJob } from "@/background/job"
import { Config } from "@/config/config"
import { Archive } from "@/continuity/archive"
import { RuntimeFlags } from "@/effect/runtime-flags"
import { EventV2Bridge } from "@/event-v2-bridge"
import { LogicalTask } from "@/maestro/logical-task"
import { UpstreamProvenance } from "@/maestro/upstream-provenance"
import { UpstreamResult } from "@orchestra/maestro/upstream-result"
import { WriteRoots } from "@/maestro/write-roots"
import { MessageID, PartID } from "@/session/schema"
import { Session } from "@/session/session"
import { SessionStatus } from "@/session/status"
import { Snapshot } from "@/snapshot"
import { Todo } from "@/session/todo"
import { TestAppNodeBuilder } from "../../fixture/app-node-builder"
import { disposeAllInstances } from "../../fixture/fixture"
import { testEffect } from "../../lib/effect"
import { DelegationFixture } from "./delegation-fixture"

// Delegation records written from recorded hook payloads and stream frames (spikes S3, S12, S13): what the hooks write
// must be exactly what the contract V2 observer accepts, and a failed join must leave nothing it would accept.

afterEach(async () => {
  await disposeAllInstances()
})

const it = testEffect(TestAppNodeBuilder.build(
  LayerNode.group([filesystem, CrossSpawnSpawner.node, Agent.node, BackgroundJob.node, Session.node, SessionProjector.node, SessionSubagentModels.node,
    EventV2Bridge.node, Database.node, Config.node, Todo.node, Archive.node, Snapshot.node, SessionStatus.node]),
  [[RuntimeFlags.node, RuntimeFlags.layer({})]],
))

const ref = { providerID: ProviderV2.ID.make("anthropic"), modelID: ModelV2.ID.make("claude-test") }
const card: UpstreamResult.Card = { outcome: "done", artifacts: [{ kind: "plan", path: "proposal.md" }], blockers: [], risks: [], nextActions: [] }
const final = "Proposal written.\n\n```upstream-result\n" + JSON.stringify(card) + "\n```"
const base = { session_id: "cc-session", transcript_path: "/tmp/transcript.jsonl", cwd: "/tmp" }
const signal = new AbortController().signal

type Hooks = Partial<Record<string, HookCallbackMatcher[]>>
const fire = (hooks: Hooks, input: HookInput): Promise<HookJSONOutput> =>
  hooks[input.hook_event_name]![0].hooks[0](input, "a0f4c1de-unrelated-uuid", { signal })

const decision = (output: HookJSONOutput) =>
  "hookSpecificOutput" in output && output.hookSpecificOutput?.hookEventName === "PreToolUse" ? output.hookSpecificOutput : undefined

// HOST's side, simulated: the parent Session with Maestro's turn, the mirrored Agent part, the mirror's part API and
// the stream frames fed into the join. Every check passes in the policy, so these tests see delegation alone; the
// policy records who each call ran as.
const host = Effect.fn("ClaudeHostDelegationTest.host")(function* () {
  const sessions = yield* Session.Service
  const context = yield* Effect.context<never>()
  const parent = yield* sessions.create({ agent: "maestro", title: "maestro" })
  const user = yield* sessions.updateMessage({ id: MessageID.ascending(), role: "user", sessionID: parent.id, agent: "maestro",
    model: ref, time: { created: Date.now() } } satisfies SessionV1.User)
  const message = yield* sessions.updateMessage({ id: MessageID.ascending(), role: "assistant", sessionID: parent.id, parentID: user.id,
    agent: "maestro", mode: "maestro", modelID: ref.modelID, providerID: ref.providerID, path: { cwd: parent.directory, root: parent.directory },
    cost: 0, tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } }, time: { created: Date.now() } } satisfies SessionV1.Assistant)
  const mirrored = new Map<string, SessionV1.ToolPart>()
  yield* sessions.setMetadata({ sessionID: parent.id, metadata: {
    ...parent.metadata, claudeCode: { ...parent.metadata?.claudeCode, sessionId: base.session_id },
  } })
  const authors = new Map<string, MessageID>()
  const actors: ClaudeHostGate.Actor[] = []
  const join = ClaudeHostJoin.make()
  const abort = new AbortController()
  const policy: ClaudeHostGate.Ports = {
    granted: { maestro: ["task"], archie: [], patty: [] },
    hold: () => Effect.void,
    safety: (actor) => Effect.sync(() => { actors.push(actor) }),
    arsenal: () => Effect.void,
    ask: () => Effect.void,
    confine: () => Effect.succeed(undefined),
    release: () => Effect.void,
    close: Effect.void,
  }
  const hooks = ClaudeHostHooks.create({
    sessionID: parent.id, directory: parent.directory, worktree: parent.directory, agent: "maestro", abort, join,
    granted: policy.granted, policy,
    run: <A, R>(effect: Effect.Effect<A, unknown, R>) => Effect.runPromiseWith(context)(effect as unknown as Effect.Effect<A, unknown>),
    parts: {
      tool: (callID) => mirrored.get(callID),
      author: (callID) => authors.get(callID),
      complete: (part) => sessions.updatePart(part).pipe(Effect.tap(() => Effect.sync(() => { mirrored.set(part.callID, part) })), Effect.asVoid),
    },
  })
  yield* Effect.addFinalizer(() => Effect.sync(() => abort.abort()))
  // The mirror's part for one Agent tool_use block, as the stream shows it before any hook runs.
  const call = (toolUseID: string, input: Record<string, unknown>) => Effect.gen(function* () {
    const part = yield* sessions.updatePart({ id: PartID.ascending(), sessionID: parent.id, messageID: message.id, type: "tool", callID: toolUseID,
      tool: "Agent", state: { status: "running", input, time: { start: Date.now() } }, metadata: { providerExecuted: true, claudeCodeTool: "Agent" } })
    mirrored.set(toolUseID, part)
    return part
  })
  const grant = (writePaths: string[]) => DelegationFixture.grant({ sessions, sessionID: parent.id,
    messageID: message.id, directory: parent.directory, writePaths })
  const finish = () => sessions.updateMessage({ ...message, finish: "tool-calls", time: { ...message.time, completed: Date.now() } })
  const part = (toolUseID: string) => sessions.messages({ sessionID: parent.id }).pipe(Effect.map((history) => history.flatMap((item) => item.parts)
    .find((item): item is SessionV1.ToolPart => item.type === "tool" && item.callID === toolUseID)))
  return { parent, user, message, hooks, join, actors, call, grant, finish, part, sessions, authors }
})

const agentInput = (grantID: string | undefined, extra: Record<string, unknown> = {}) => ({
  description: "author the proposal", subagent_type: "orchestra:archie", run_in_background: false,
  prompt: ["Write the proposal for the bounded brief.", ...(grantID ? [`grantID: ${grantID}`] : [])].join("\n"), ...extra,
})

const pre = (toolUseID: string, tool_input: unknown, agent?: { agent_id: string; agent_type: string }, tool_name = "Agent") =>
  ({ ...base, ...agent, hook_event_name: "PreToolUse", tool_name, tool_input, tool_use_id: toolUseID }) satisfies HookInput

const output = (agentId: string, text: string) => ({
  status: "completed", agentId, agentType: "orchestra:archie", content: [{ type: "text", text }], prompt: "p",
  totalToolUseCount: 1, totalDurationMs: 10, totalTokens: 10,
  usage: { input_tokens: 1, output_tokens: 1, cache_creation_input_tokens: null, cache_read_input_tokens: null, server_tool_use: null,
    service_tier: null, cache_creation: null },
})

const post = (toolUseID: string, tool_response: unknown, tool_name = "Agent") =>
  ({ ...base, hook_event_name: "PostToolUse", tool_name, tool_input: {}, tool_response, tool_use_id: toolUseID }) satisfies HookInput

describe("Claude Code Agent dispatch records", () => {
  it.instance("a joined foreground archie dispatch records exactly what the contract V2 observer accepts", () => Effect.gen(function* () {
    const fixture = yield* host()
    const grantID = yield* fixture.grant(["docs/proposal"])
    yield* fixture.call("toolu_01", agentInput(grantID))
    const dispatched = yield* Effect.promise(() => fire(fixture.hooks, pre("toolu_01", agentInput(grantID))))
    expect(decision(dispatched)?.permissionDecision).toBe("allow")
    const child = fixture.join.child("toolu_01")
    if (!child) throw new Error("expected a child Session bound at PreToolUse[Agent]")
    // The binding and the grant exist before Claude Code starts the subagent.
    const logical = yield* LogicalTask.read(child)
    expect(logical).toMatchObject({ memberID: "archie", executionSessionID: child, authoritySessionID: fixture.parent.id })
    expect(ClaudeHostMcp.grants(fixture.parent.id).has(grantID)).toBe(false)

    fixture.join.taskStarted({ toolUseID: "toolu_01", taskID: "a5e1c0ffee" })
    // The child's own call is the child's, under the child Session and its seat.
    yield* Effect.promise(() => fire(fixture.hooks, pre("toolu_c1", { file_path: "/x" }, { agent_id: "a5e1c0ffee", agent_type: "orchestra:archie" }, "Write")))
    expect(fixture.actors.at(-1)).toEqual({ sessionID: child, seat: "archie", agentID: "a5e1c0ffee" })
    yield* Effect.promise(() => fire(fixture.hooks, { ...base, hook_event_name: "SubagentStop", stop_hook_active: false, agent_id: "a5e1c0ffee",
      agent_type: "orchestra:archie", agent_transcript_path: "/tmp/agent.jsonl", last_assistant_message: final }))
    const settled = yield* Effect.promise(() => fire(fixture.hooks, post("toolu_01", output("a5e1c0ffee", final))))
    yield* fixture.finish()

    const recorded = yield* fixture.part("toolu_01")
    if (recorded?.state.status !== "completed") throw new Error("expected the completed Agent part")
    expect(recorded.tool).toBe("Agent")
    // Maestro reads the host's attribution first, then the child's final text; the part records what Maestro read.
    const handed = recorded.state.output
    const split = handed.indexOf("\n\n")
    expect(handed.slice(split + 2)).toBe(final)
    expect(settled).toEqual({ hookSpecificOutput: { hookEventName: "PostToolUse", additionalContext: handed, updatedToolOutput: handed } })
    const attribution = JSON.parse(handed.slice(handed.indexOf("{"), split))
    expect(recorded.metadata?.providerExecuted).toBe(true)
    // The mirror resolves the child Session from the part's own metadata.
    expect(recorded.metadata?.sessionId).toBe(child)
    const session = yield* fixture.sessions.get(child)
    expect(recorded.state.metadata).toMatchObject({ parentSessionId: fixture.parent.id, sessionId: child, background: false })
    expect(recorded.state.metadata.claudeCodeDispatch).toEqual({ executor: "claude-code-host", toolName: "Agent", toolUseID: "toolu_01",
      agentID: "a5e1c0ffee", grantID, subagentType: "orchestra:archie", seat: "archie", writeRoots: WriteRoots.read(session.permission),
      background: false })
    // Never a synthetic task part: the only dispatch part is Claude Code's own.
    const parts = (yield* fixture.sessions.messages({ sessionID: fixture.parent.id })).flatMap((item) => item.parts)
    expect(parts.filter((item) => item.type === "tool" && item.tool === "task")).toEqual([])
    // The author is the subagent's byte-complete final text.
    const author = (yield* fixture.sessions.messages({ sessionID: child })).findLast((item) => item.info.role === "assistant")
    if (author?.info.role !== "assistant") throw new Error("expected the author message")
    expect(author.info.agent).toBe("archie")
    expect(author.parts.flatMap((item) => item.type === "text" ? [item.text] : [])).toEqual([final])
    // No mirrored child turn exists here, so the host recorded the author and says so on every text part.
    expect(author.parts.flatMap((item) => item.type === "text" ? [item.metadata] : []))
      .toEqual([{ source: "claude-code-agent-output", agentID: "a5e1c0ffee" }])

    expect(attribution).toEqual({ parentMessageID: fixture.message.id, parentCallID: "toolu_01", authorSessionID: child,
      authorMessageID: author.info.id, logicalTaskID: logical!.taskId, dispatchKind: "claude-code-agent" })
    // What Maestro is handed is exactly what the provenance check accepts.
    const observed = yield* UpstreamProvenance.observe({ projectID: fixture.parent.projectID, parentSessionID: fixture.parent.id,
      ...attribution })
    expect(Schema.decodeUnknownSync(UpstreamAttribution.Any)(observed)).toEqual(observed)
    expect(observed).toMatchObject({ schema: "maestro-upstream-attribution-v2", dispatch: { kind: "claude-code-agent", tool: "Agent",
      subagentType: "orchestra:archie", executor: "claude-code-host", agentID: "a5e1c0ffee", grantID } })
  }))

  it.instance("a subagent id that disagrees with task_started HOLDs the dispatch and leaves nothing to attribute", () => Effect.gen(function* () {
    const fixture = yield* host()
    const grantID = yield* fixture.grant(["docs/proposal"])
    yield* fixture.call("toolu_02", agentInput(grantID))
    yield* Effect.promise(() => fire(fixture.hooks, pre("toolu_02", agentInput(grantID))))
    fixture.join.taskStarted({ toolUseID: "toolu_02", taskID: "aaaa1111" })
    const settled = yield* Effect.promise(() => fire(fixture.hooks, post("toolu_02", output("bbbb2222", final))))
    expect(JSON.stringify(settled)).toContain("HOLD: the subagent ids disagree")
    yield* fixture.finish()
    const recorded = yield* fixture.part("toolu_02")
    if (recorded?.state.status !== "completed") throw new Error("expected the completed Agent part")
    expect(recorded.state.metadata.claudeCodeDispatch).toBeUndefined()
    expect(recorded.state.metadata.workResult).toBeUndefined()
    expect(String(recorded.state.metadata.hold)).toContain("HOLD")
    const child = fixture.join.child("toolu_02")!
    const logical = yield* LogicalTask.read(child)
    const exit = yield* Effect.exit(UpstreamProvenance.observe({ projectID: fixture.parent.projectID, parentSessionID: fixture.parent.id,
      parentMessageID: SessionMessage.ID.make(fixture.message.id), parentCallID: "toolu_02", authorSessionID: child,
      authorMessageID: SessionMessage.ID.make(MessageID.ascending()), logicalTaskID: logical!.taskId, dispatchKind: "claude-code-agent" }))
    expect(Exit.isFailure(exit)).toBe(true)
    if (Exit.isFailure(exit)) expect((Cause.squash(exit.cause) as UpstreamProvenance.Denied).code).toBe("UPSTREAM_ATTRIBUTION_PARENT_MISMATCH")
  }))

  it.instance("ToolSafety refusal sanitizes only the joined final author and preserves repeated benign history", () => Effect.gen(function* () {
    const fixture = yield* host()
    const input = agentInput(yield* fixture.grant(["docs/proposal"]))
    const mirrored = yield* fixture.call("toolu_rejected", input)
    yield* Effect.promise(() => fire(fixture.hooks, pre("toolu_rejected", input)))
    fixture.join.taskStarted({ toolUseID: "toolu_rejected", taskID: "task-rejected" })
    const child = fixture.join.child("toolu_rejected")!
    const rejected = "Rejected sentinel: sk-proj-" + "fixturecredential".repeat(3)
    expect(Exit.isFailure(yield* Effect.exit(ToolSafety.inspect(output("task-rejected", rejected))))).toBe(true)
    // A frame can arrive before PostToolUse inspection; retain it using the actual Session service first.
    yield* fixture.sessions.updatePart({ ...mirrored, state: { status: "completed", input, output: rejected, title: "native Agent",
      metadata: {}, time: { start: Date.now(), end: Date.now() } } })
    const prompt = (yield* fixture.sessions.messages({ sessionID: child })).find((item) => item.info.role === "user")!
    const benign = "Earlier evidence: café\r\n  exact spacing\n"
    const earlier = yield* fixture.sessions.updateMessage({ ...fixture.message, id: MessageID.ascending(), sessionID: child,
      parentID: prompt.info.id, agent: "archie", mode: "archie", finish: "stop", time: { created: Date.now(), completed: Date.now() } })
    yield* fixture.sessions.updatePart({ id: PartID.ascending(), sessionID: child, messageID: earlier.id, type: "text", text: benign })
    yield* fixture.sessions.updatePart({ id: PartID.ascending(), sessionID: child, messageID: earlier.id, type: "text", text: benign })
    const evidence = yield* fixture.sessions.updatePart({ id: PartID.ascending(), sessionID: child, messageID: earlier.id, type: "tool",
      callID: "earlier-read", tool: "Read", state: { status: "completed", input: { file_path: "evidence.md" }, output: benign,
        title: "evidence", metadata: { providerExecuted: true }, time: { start: 1, end: 2 } } })
    const retained = (yield* fixture.sessions.messages({ sessionID: child })).find((item) => item.info.id === earlier.id)!
    const author = yield* fixture.sessions.updateMessage({ ...fixture.message, id: MessageID.ascending(), sessionID: child,
      parentID: prompt.info.id, agent: "archie", mode: "archie", finish: "stop", time: { created: Date.now(), completed: Date.now() } })
    yield* fixture.sessions.updatePart({ id: PartID.ascending(), sessionID: child, messageID: author.id, type: "text", text: rejected,
      metadata: { source: "claude-code-stream", agentID: "task-rejected" } })
    yield* fixture.sessions.updatePart({ id: PartID.ascending(), sessionID: child, messageID: author.id, type: "text", text: benign })
    fixture.authors.set("toolu_rejected", author.id)
    const response = { ...output("task-rejected", rejected), content: [{ type: "text", text: rejected }, { type: "text", text: benign }] }
    const result = yield* Effect.promise(() => fire(fixture.hooks, post("toolu_rejected", response)))
    expect(JSON.stringify(result)).toContain("HOLD")
    const recorded = yield* fixture.part("toolu_rejected")
    if (recorded?.state.status !== "completed") throw new Error("expected a sanitized completed Agent part")
    const sanitized = recorded.state.output
    expect(sanitized).toBe("HOLD: Agent output refused by ToolSafety inspection")
    expect(recorded.state.metadata.hold).toBe(sanitized)
    expect(recorded.state.metadata.claudeCodeDispatch).toBeUndefined()
    expect(recorded.state.metadata.workResult).toBeUndefined()
    expect(recorded.metadata).toMatchObject({ providerExecuted: true, claudeCodeTool: "Agent", sessionId: child })
    const history = yield* fixture.sessions.messages({ sessionID: child })
    expect(history.find((item) => item.info.id === earlier.id)).toEqual(retained)
    expect(history.flatMap((item) => item.parts).find((part) => part.id === evidence.id)).toEqual(evidence)
    expect(history.find((item) => item.info.id === author.id)?.parts.every((part) => part.type !== "text" || part.text === sanitized)).toBe(true)
    expect(JSON.stringify([recorded, history])).not.toContain(rejected)
    const text = history.flatMap((item) => item.parts).find((part) => part.type === "text" && part.messageID === author.id)
    expect(text?.type === "text" && text.text).toBe(recorded.state.output)
    expect(text?.type === "text" ? text.metadata : undefined).toEqual({ source: "claude-code-stream", agentID: "task-rejected" })
    expect((yield* fixture.sessions.messages({ sessionID: fixture.parent.id })).flatMap((item) => item.parts)
      .filter((part) => part.type === "tool" && part.tool === "task")).toEqual([])
    yield* fixture.finish()
    const logical = yield* LogicalTask.read(child)
    const denied = yield* Effect.exit(UpstreamProvenance.observe({ projectID: fixture.parent.projectID, parentSessionID: fixture.parent.id,
      parentMessageID: SessionMessage.ID.make(fixture.message.id), parentCallID: "toolu_rejected", authorSessionID: child,
      authorMessageID: SessionMessage.ID.make(author.id), logicalTaskID: logical!.taskId, dispatchKind: "claude-code-agent" }))
    expect(Exit.isFailure(denied)).toBe(true)
    if (Exit.isFailure(denied)) expect((Cause.squash(denied.cause) as UpstreamProvenance.Denied).code).toBe("UPSTREAM_ATTRIBUTION_PARENT_MISMATCH")
  }))

  it.instance("refusal without a mirrored final author never selects earlier evidence by identical bytes", () => Effect.gen(function* () {
    const fixture = yield* host()
    const input = agentInput(yield* fixture.grant(["docs/proposal"]))
    yield* fixture.call("no-final", input)
    yield* Effect.promise(() => fire(fixture.hooks, pre("no-final", input)))
    fixture.join.taskStarted({ toolUseID: "no-final", taskID: "task-no-final" })
    const child = fixture.join.child("no-final")!
    const prompt = (yield* fixture.sessions.messages({ sessionID: child }))[0].info
    const earlier = yield* fixture.sessions.updateMessage({ ...fixture.message, id: MessageID.ascending(), sessionID: child,
      parentID: prompt.id, agent: "archie", mode: "archie", finish: "tool-calls", time: { created: 1, completed: 2 } })
    const bytes = "Earlier evidence café\r\n  repeated exact bytes\n"
    yield* fixture.sessions.updatePart({ id: PartID.ascending(), sessionID: child, messageID: earlier.id, type: "text", text: bytes })
    const before = yield* fixture.sessions.messages({ sessionID: child })
    // ToolSafety may reject non-text response fields even when returned text repeats benign historical evidence.
    yield* Effect.promise(() => fire(fixture.hooks, post("no-final", { ...output("task-no-final", bytes),
      prompt: "sk-proj-" + "fixturecredential".repeat(3) })))
    expect(yield* fixture.sessions.messages({ sessionID: child })).toEqual(before)
    const part = yield* fixture.part("no-final")
    expect(part?.state.status === "completed" && part.state.metadata.hold).toBe("HOLD: Agent output refused by ToolSafety inspection")
  }))

  it.instance("a run Claude Code never reported a task_started for HOLDs, and its unjoined calls are denied", () => Effect.gen(function* () {
    const fixture = yield* host()
    const grantID = yield* fixture.grant(["docs/proposal"])
    yield* fixture.call("toolu_03", agentInput(grantID))
    yield* Effect.promise(() => fire(fixture.hooks, pre("toolu_03", agentInput(grantID))))
    const unjoined = yield* Effect.promise(() => fire(fixture.hooks, pre("toolu_c3", { file_path: "/x" }, { agent_id: "cafe0003", agent_type: "orchestra:archie" }, "Write")))
    expect(decision(unjoined)?.permissionDecision).toBe("deny")
    expect(decision(unjoined)?.permissionDecisionReason).toContain("not joined")
    const settled = yield* Effect.promise(() => fire(fixture.hooks, post("toolu_03", output("cafe0003", final))))
    expect(JSON.stringify(settled)).toContain("no task_started")
  }))

  it.instance("a write-roots seat without a bound grant is denied before any child exists", () => Effect.gen(function* () {
    const fixture = yield* host()
    const denied = yield* Effect.promise(() => fire(fixture.hooks, pre("toolu_04", agentInput(undefined))))
    expect(decision(denied)?.permissionDecision).toBe("deny")
    expect(decision(denied)?.permissionDecisionReason).toContain("mcp__orchestra__task_grant")
    const forged = yield* Effect.promise(() => fire(fixture.hooks, pre("toolu_05", agentInput("grt_notissued"))))
    expect(decision(forged)?.permissionDecisionReason).toContain("not an unused archie grant")
    expect(yield* fixture.sessions.children(fixture.parent.id)).toEqual([])
    expect(fixture.join.get("toolu_04")).toBeUndefined()
  }))

  it.instance("a proposal seat is refused in the background, Claude Code's default, and keeps its grant", () => Effect.gen(function* () {
    const fixture = yield* host()
    const grantID = yield* fixture.grant(["docs/proposal"])
    for (const [index, input] of [agentInput(grantID, { run_in_background: true }), { ...agentInput(grantID), run_in_background: undefined }].entries()) {
      const call = pre(`toolu_06_${index}`, input)
      const denied = yield* Effect.promise(() => fire(fixture.hooks, call))
      expect(decision(denied)?.permissionDecision).toBe("deny")
      expect(decision(denied)?.permissionDecisionReason).toContain("run_in_background: false")
      expect(yield* Effect.promise(() => fire(fixture.hooks, call))).toEqual(denied)
      const conflict = yield* Effect.promise(() => fire(fixture.hooks, pre(call.tool_use_id, agentInput(grantID))))
      expect(decision(conflict)?.permissionDecisionReason).toBe(`HOLD: conflicting reuse of ${call.tool_use_id}`)
    }
    expect(ClaudeHostMcp.grants(fixture.parent.id).has(grantID)).toBe(true)
    expect(yield* fixture.sessions.children(fixture.parent.id)).toEqual([])
    const foreground = pre("toolu_06_foreground", agentInput(grantID))
    yield* fixture.call(foreground.tool_use_id, agentInput(grantID))
    expect(decision(yield* Effect.promise(() => fire(fixture.hooks, foreground)))?.permissionDecision).toBe("allow")
    expect(ClaudeHostMcp.grants(fixture.parent.id).has(grantID)).toBe(false)
    expect(decision(yield* Effect.promise(() => fire(fixture.hooks, foreground)))?.permissionDecision).toBe("allow")
    expect(yield* fixture.sessions.children(fixture.parent.id)).toHaveLength(1)
  }))

  it.instance("a background seat is delivered from task_notification only, once", () => Effect.gen(function* () {
    const fixture = yield* host()
    const input = { description: "check the plan", subagent_type: "orchestra:patty", prompt: "Review it.", run_in_background: true }
    yield* fixture.call("toolu_07", input)
    expect(decision(yield* Effect.promise(() => fire(fixture.hooks, pre("toolu_07", input))))?.permissionDecision).toBe("allow")
    fixture.join.taskStarted({ toolUseID: "toolu_07", taskID: "beef0007" })
    yield* Effect.promise(() => fire(fixture.hooks, post("toolu_07", { status: "async_launched", agentId: "beef0007", description: "check the plan",
      prompt: "Review it.", outputFile: "/tmp/out" })))
    yield* Effect.promise(() => fire(fixture.hooks, { ...base, hook_event_name: "SubagentStop", stop_hook_active: false, agent_id: "beef0007",
      agent_type: "orchestra:patty", agent_transcript_path: "/tmp/agent.jsonl", last_assistant_message: "Looks right." }))
    const launched = yield* fixture.part("toolu_07")
    if (launched?.state.status !== "completed") throw new Error("expected the launched Agent part")
    expect(launched.state.metadata.background).toBe(true)
    // SubagentStop is not a delivery.
    expect(launched.state.metadata.delivery).toBeUndefined()
    const notice = { type: "system", subtype: "task_notification", task_id: "beef0007", tool_use_id: "toolu_07", status: "completed",
      output_file: "/tmp/out", summary: "Looks right.", uuid: "00000000-0000-4000-8000-000000000007", session_id: "cc-session" } as SDKTaskNotificationMessage
    fixture.join.taskNotification(notice)
    fixture.join.taskNotification({ ...notice, summary: "repeated" })
    const delivered = yield* Effect.gen(function* () {
      for (let round = 0; round < 100; round++) {
        const current = yield* fixture.part("toolu_07")
        if (current?.state.status === "completed" && current.state.metadata.delivery) return current.state.metadata.delivery
        yield* Effect.sleep("20 millis")
      }
      return undefined
    })
    expect(delivered).toEqual({ source: "claude-code-task-notification", taskID: "beef0007", status: "completed", summary: "Looks right.",
      outputFile: "/tmp/out" })
  }))
})

describe("compaction hooks", () => {
  it.instance("SessionStart(compact) restores retained producers and reports exact live grant ownership", () => Effect.gen(function* () {
    const fixture = yield* host()
    const todos = yield* Todo.Service
    const agents = yield* Agent.Service
    const snapshot = yield* Snapshot.Service
    const status = yield* SessionStatus.Service
    const mirror = ClaudeHostMirror.create({ sessionID: fixture.parent.id, user: fixture.user,
      agent: yield* agents.get("maestro"), path: { cwd: fixture.parent.directory, root: fixture.parent.directory },
      sessions: fixture.sessions, snapshot, todo: todos, status })
    yield* mirror.on({ type: "assistant", parent_tool_use_id: null, uuid: crypto.randomUUID(), session_id: base.session_id,
      message: { id: "todo-producer", model: ref.modelID, role: "assistant", type: "message", container: null,
        context_management: null, stop_reason: "tool_use", stop_sequence: null,
        usage: { input_tokens: 1, output_tokens: 1, cache_creation_input_tokens: null, cache_read_input_tokens: null,
          cache_creation: null, server_tool_use: null, service_tier: null },
        content: [{ type: "tool_use", id: "todo-producer", name: "TodoWrite", input: { todos: [{ content: "land the adapter",
          status: "in_progress", activeForm: "landing the adapter" }] } }] } })
    yield* mirror.on({ type: "user", parent_tool_use_id: null, uuid: crypto.randomUUID(), session_id: base.session_id,
      message: { role: "user", content: [{ type: "tool_result", tool_use_id: "todo-producer", content: "updated" }] },
      tool_use_result: { oldTodos: [], newTodos: [{ content: "land the adapter", status: "in_progress", activeForm: "landing the adapter" }] } })
    const grantID = yield* fixture.grant(["docs/proposal"])
    yield* fixture.call("toolu_08", agentInput(grantID))
    yield* Effect.promise(() => fire(fixture.hooks, pre("toolu_08", agentInput(grantID))))
    const spare = yield* fixture.grant(["docs/other"])
    const result = yield* Effect.promise(() => fire(fixture.hooks, { ...base, hook_event_name: "SessionStart", source: "compact" }))
    if (!("hookSpecificOutput" in result) || result.hookSpecificOutput?.hookEventName !== "SessionStart") throw new Error("expected context")
    const text = result.hookSpecificOutput.additionalContext ?? ""
    const logical = yield* LogicalTask.read(fixture.join.child("toolu_08")!)
    expect(text).toContain(logical!.taskId)
    expect(text).toContain("toolu_08")
    expect(text).toContain(spare)
    expect(text).toContain('"content":"land the adapter","status":"in_progress"')
    expect(text).toContain('"state":"unbound","usable":true')
    ClaudeHostMcp.release(fixture.parent.id)
    const reset = yield* Effect.promise(() => fire(fixture.hooks, { ...base, hook_event_name: "SessionStart", source: "compact" }))
    if (!("hookSpecificOutput" in reset) || reset.hookSpecificOutput?.hookEventName !== "SessionStart") throw new Error("expected invalidated grant context")
    expect(reset.hookSpecificOutput.additionalContext).toContain(spare)
    expect(reset.hookSpecificOutput.additionalContext).toContain('"state":"invalidated","usable":false')
  }))

  it.instance("SessionStart(compact) with nothing durable to restore adds nothing", () => Effect.gen(function* () {
    const fixture = yield* host()
    expect(yield* Effect.promise(() => fire(fixture.hooks, { ...base, hook_event_name: "SessionStart", source: "compact" }))).toEqual({})
  }))

  it.instance("PostCompact archives Claude Code's summary where context_recall finds it", () => Effect.gen(function* () {
    const fixture = yield* host()
    yield* Effect.promise(() => fire(fixture.hooks, { ...base, hook_event_name: "PostCompact", trigger: "auto", compact_summary: "We chose plan B." }))
    const archive = yield* Archive.Service
    const references = yield* archive.list(fixture.parent.id)
    expect(references.length).toBeGreaterThan(0)
    const chunk = yield* archive.read({ sessionID: fixture.parent.id, id: references[0].id })
    expect(chunk?.markdown).toContain("We chose plan B.")
  }))
})
