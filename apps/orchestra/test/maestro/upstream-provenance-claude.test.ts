import { describe, expect } from "bun:test"
import path from "node:path"
import { UpstreamAttribution } from "@orchestra/schema/upstream-attribution"
import { Effect, Schema } from "effect"
import { omit } from "remeda"
import { WriteRoots } from "@/maestro/write-roots"
import { UpstreamProvenance } from "@/maestro/upstream-provenance"
import { Session } from "@/session/session"
// Reuse the retained/native fixture and its scoped test layer; Bun registers the imported suite once.
import { card, fenced, it, refusal, seed, upstreamMemberID } from "./upstream-provenance.test"

// Mirror a host-witnessed Claude Code Agent call onto the seeded dispatch part and bind the child's write-root grant.
const claudeSeed = Effect.fn("UpstreamProvenanceClaudeTest.claudeSeed")(function* (options?: {
  tool?: string
  subagentType?: string
  providerExecuted?: boolean
  background?: boolean
  childRoots?: string[]
  dispatch?: (dispatch: Record<string, unknown>) => Record<string, unknown>
}) {
  const fixture = yield* seed()
  const sessions = yield* Session.Service
  const roots = [path.join(fixture.child.directory, "docs", "proposal")]
  yield* sessions.setPermission({ sessionID: fixture.child.id, permission: [
    ...(fixture.child.permission ?? []),
    { permission: WriteRoots.PERMISSION, pattern: "*", action: "deny" },
    ...(options?.childRoots ?? roots).map((pattern) => ({ permission: WriteRoots.PERMISSION, pattern, action: "allow" as const })),
  ] })
  const tool = options?.tool ?? "Agent"
  const claudeCodeDispatch = {
    executor: "claude-code-host", toolName: tool, toolUseID: fixture.task.callID, agentID: "agent-archie-1", grantID: "grant-archie-1",
    subagentType: "orchestra:archie", seat: "archie", writeRoots: roots, background: options?.background === true,
  }
  yield* sessions.updatePart({ ...fixture.task, tool, metadata: { providerExecuted: options?.providerExecuted ?? true }, state: {
    ...fixture.task.state,
    input: { ...fixture.task.state.input, subagent_type: options?.subagentType ?? "orchestra:archie" },
    metadata: { ...fixture.task.state.metadata, ...(options?.background ? { background: true } : {}),
      claudeCodeDispatch: options?.dispatch ? options.dispatch(claudeCodeDispatch) : claudeCodeDispatch },
  } })
  return { ...fixture, claudeCodeDispatch, input: { ...fixture.input, dispatchKind: "claude-code-agent" as const } }
})

describe("UpstreamProvenance.observe claude-code-agent", () => {
  it.instance("observes a foreground Claude Code Agent dispatch as V2 and retries exactly", () => Effect.gen(function* () {
    const fixture = yield* claudeSeed()
    const first = yield* UpstreamProvenance.observe(fixture.input)
    expect(first).toEqual({ ...omit(fixture.input, ["dispatchKind"]), schema: "maestro-upstream-attribution-v2", memberID: upstreamMemberID,
      profile: "upstream", dispatch: { kind: "claude-code-agent", tool: "Agent", subagentType: "orchestra:archie", executor: "claude-code-host",
        agentID: "agent-archie-1", grantID: "grant-archie-1" } })
    expect(Schema.decodeUnknownSync(UpstreamAttribution.Any)(first)).toEqual(first)
    expect(yield* UpstreamProvenance.observe(fixture.input)).toEqual(first)
  }))

  it.instance("accepts the older raw Task tool name when the host evidence names it", () => Effect.gen(function* () {
    const fixture = yield* claudeSeed({ tool: "Task" })
    const observed = yield* UpstreamProvenance.observe(fixture.input)
    expect(observed).toMatchObject({ schema: "maestro-upstream-attribution-v2", dispatch: { kind: "claude-code-agent", tool: "Task" } })
  }))

  it.instance("rejects a call that is not a provider-executed Claude Code Agent dispatch to orchestra:archie", () => Effect.gen(function* () {
    yield* Effect.forEach([
      { providerExecuted: false },
      { tool: "task" },
      { tool: "task", dispatch: (dispatch: Record<string, unknown>) => ({ ...dispatch, toolName: "Agent" }) },
      { subagentType: "archie" },
    ], (options) => Effect.gen(function* () {
      const fixture = yield* claudeSeed(options)
      yield* refusal(fixture.input, "UPSTREAM_ATTRIBUTION_PARENT_MISMATCH")
    }))
  }))

  it.instance("rejects host dispatch evidence that is not closed or not bound to this tool use", () => Effect.gen(function* () {
    yield* Effect.forEach([
      (dispatch: Record<string, unknown>) => omit(dispatch, ["grantID"]),
      (dispatch: Record<string, unknown>) => omit(dispatch, ["toolName"]),
      (dispatch: Record<string, unknown>) => ({ ...dispatch, verified: true }),
      (dispatch: Record<string, unknown>) => ({ ...dispatch, toolUseID: "toolu_other" }),
      (dispatch: Record<string, unknown>) => ({ ...dispatch, toolName: "Task" }),
      (dispatch: Record<string, unknown>) => ({ ...dispatch, seat: "walt" }),
      (dispatch: Record<string, unknown>) => ({ ...dispatch, executor: "orchestra" }),
      (dispatch: Record<string, unknown>) => ({ ...dispatch, subagentType: "archie" }),
      (dispatch: Record<string, unknown>) => ({ ...dispatch, agentID: "" }),
    ], (dispatch) => Effect.gen(function* () {
      const fixture = yield* claudeSeed({ dispatch })
      yield* refusal(fixture.input, "UPSTREAM_ATTRIBUTION_PARENT_MISMATCH")
    }))
    const missing = yield* claudeSeed({ dispatch: () => ({}) })
    yield* refusal(missing.input, "UPSTREAM_ATTRIBUTION_PARENT_MISMATCH")
  }))

  it.instance("background Claude Code dispatch requires named foreground HOLD", () => Effect.gen(function* () {
    yield* Effect.forEach([
      { background: true },
      { dispatch: (dispatch: Record<string, unknown>) => ({ ...dispatch, background: true }) },
    ], (options) => Effect.gen(function* () {
      const fixture = yield* claudeSeed(options)
      const error = yield* refusal(fixture.input, "UPSTREAM_ATTRIBUTION_PROPOSAL_UNAVAILABLE")
      expect(error.message).toBe("HOLD: claude-code-agent upstream dispatch must run in the foreground")
    }))
  }))

  it.instance("rejects child write roots that differ from the grant or a non-canonical grant", () => Effect.gen(function* () {
    const sessions = yield* Session.Service
    yield* Effect.forEach([
      { childRoots: ["/elsewhere"] },
      { childRoots: [] },
      { dispatch: (dispatch: Record<string, unknown>) => ({ ...dispatch, writeRoots: [] }) },
      { dispatch: (dispatch: Record<string, unknown>) => ({ ...dispatch, writeRoots: ["docs/proposal"] }) },
    ], (options) => Effect.gen(function* () {
      const fixture = yield* claudeSeed(options)
      yield* refusal(fixture.input, "UPSTREAM_ATTRIBUTION_PARENT_MISMATCH")
    }))
    const unbound = yield* claudeSeed()
    yield* sessions.setPermission({ sessionID: unbound.child.id, permission: [] })
    yield* refusal(unbound.input, "UPSTREAM_ATTRIBUTION_PARENT_MISMATCH")
  }))

  it.instance("keeps logical binding, dispatcher, and card checks of the native path", () => Effect.gen(function* () {
    const sessions = yield* Session.Service
    const foreign = yield* claudeSeed()
    yield* refusal({ ...foreign.input, logicalTaskID: "foreign-logical-task" }, "UPSTREAM_ATTRIBUTION_TASK_MISMATCH")
    const dispatcher = yield* claudeSeed()
    yield* sessions.updateMessage({ ...dispatcher.parentMessage, agent: "general" })
    yield* refusal(dispatcher.input, "UPSTREAM_ATTRIBUTION_PARENT_MISMATCH")
    const blocked = yield* claudeSeed()
    yield* sessions.updatePart({ ...blocked.text, text: fenced({ ...card, blockers: [{ kind: "context", reason: "Owner decision missing" }] }) })
    yield* refusal(blocked.input, "UPSTREAM_ATTRIBUTION_PROPOSAL_UNAVAILABLE")
  }))

  it.instance("dispatch kinds never cross: each path refuses the other's evidence", () => Effect.gen(function* () {
    const native = yield* seed()
    expect((yield* UpstreamProvenance.observe(native.input)).schema).toBe("maestro-upstream-attribution-v1")
    yield* refusal({ ...native.input, dispatchKind: "claude-code-agent" }, "UPSTREAM_ATTRIBUTION_PARENT_MISMATCH")
    const claude = yield* claudeSeed()
    yield* refusal({ ...claude.input, dispatchKind: "orchestra-task" }, "UPSTREAM_ATTRIBUTION_PARENT_MISMATCH")
    yield* refusal(omit(claude.input, ["dispatchKind"]), "UPSTREAM_ATTRIBUTION_PARENT_MISMATCH")
  }))
})
