import { afterEach, expect } from "bun:test"
import type { SessionV1 } from "@orchestra/core/v1/session"
import { Effect, Schema } from "effect"
import { ClaudeHostDelegation } from "@/claude-code/host/delegation"
import { ClaudeHostGrantHistory } from "@/claude-code/host/grant-history"
import { ClaudeHostJoin } from "@/claude-code/host/join"
import { ClaudeHostMcp } from "@/claude-code/host/mcp"
import { ClaudeHostMemory } from "@/claude-code/host/memory"
import { MessageID, PartID, type SessionID } from "@/session/schema"
import type { Session } from "@/session/session"
import { ContextRecallTool } from "@/tool/context-recall"
import { Tool } from "@/tool/tool"
import { disposeAllInstances } from "../../fixture/fixture"
import { testEffect } from "../../lib/effect"
import { makeHttpNoLLMServer } from "../../session/prompt.fixture"
import { BridgeFixture } from "./bridge-fixture"

afterEach(disposeAllInstances)

// Actual host MCP, bridge, SQLite projection, delegation and recall; only incoming SDK frames are scripted.
const it = testEffect(makeHttpNoLLMServer())
const Source = Schema.Struct({ message_id: Schema.String, part_id: Schema.String })
const Record = Schema.Struct({
  grantID: Schema.String, sessionID: Schema.String, seat: Schema.String, purpose: Schema.String,
  writePaths: Schema.Array(Schema.String), writeRoots: Schema.Array(Schema.String), source: Source,
  availability: Schema.String, state: Schema.String, usable: Schema.Boolean,
  dispatches: Schema.Array(Schema.Struct({ source: Source, state: Schema.String })),
})
const Response = Schema.Struct({ content: Schema.Array(Schema.Struct({ type: Schema.String, text: Schema.String })),
  isError: Schema.optional(Schema.Boolean) })
const Page = Schema.Struct({ status: Schema.String, content: Schema.optional(Schema.String), complete: Schema.optional(Schema.Boolean) })
const Document = Schema.Struct({ parts: Schema.Array(Schema.Struct({
  lifecycle: Schema.String, input: Schema.Unknown, output: Schema.optional(Schema.String), metadata: Schema.Unknown,
})) })

const setup = Effect.fnUntraced(function* (sessionID?: SessionID) {
  const f = yield* BridgeFixture.make(sessionID)
  yield* f.sessions.setPermission({ sessionID: f.parent.id, permission: [{ permission: "*", pattern: "*", action: "allow" }] })
  yield* Effect.addFinalizer(() => Effect.sync(() => ClaudeHostMcp.release(f.parent.id)))
  const definition = yield* ContextRecallTool
  const recall = yield* Tool.init(definition)
  const client = yield* f.client([recall])
  const issue = Effect.fnUntraced(function* (purpose = "Write the bounded proposal", writePaths = ["docs/proposal"]) {
    const id = crypto.randomUUID()
    const part = yield* f.call({ id, tool: ClaudeHostMcp.GRANT, args: { seat: "archie", purpose, writePaths } })
    const response = Schema.decodeUnknownSync(Response)(yield* Effect.promise(() => client.callTool({
      name: ClaudeHostMcp.GRANT, arguments: f.arguments(id),
    })))
    expect(response.isError).toBeUndefined()
    f.bridge.release(id)
    const grantID = Schema.decodeUnknownSync(Schema.fromJsonString(Schema.Struct({ grantID: Schema.String })))(response.content[0].text).grantID
    const grant = ClaudeHostMcp.grants(f.parent.id).get(grantID)
    if (!grant) throw new Error("Actual MCP handler issued no grant")
    const stored = yield* f.sessions.getPart({ sessionID: f.parent.id, messageID: part.messageID, partID: part.id })
    if (stored?.type !== "tool" || stored.state.status !== "completed") throw new Error("MCP did not persist its issued result")
    return { grant, part: { ...stored, state: stored.state } }
  })
  const read = Effect.fnUntraced(function* (live = [...ClaudeHostMcp.grants(f.parent.id).values()]) {
    const view = yield* ClaudeHostMemory.retained(f.parent.id)
    return ClaudeHostGrantHistory.read({ sessionID: f.parent.id, history: view.history, live })
      .map((record) => Schema.decodeUnknownSync(Schema.fromJsonString(Record))(record))
  })
  const lookup = Effect.fnUntraced(function* (source: typeof Source.Type) {
    const id = crypto.randomUUID()
    yield* f.call({ id, tool: "context_recall", args: { ...source, limit: 8000 } })
    const response = Schema.decodeUnknownSync(Response)(yield* Effect.promise(() => client.callTool({
      name: "context_recall", arguments: f.arguments(id),
    })))
    expect(response.isError).toBeUndefined()
    f.bridge.release(id)
    return Schema.decodeUnknownSync(Schema.fromJsonString(Page))(response.content[0].text)
  })
  return { ...f, issue, read, lookup }
})

const dispatch = Effect.fnUntraced(function* (f: {
  parent: Pick<Session.Info, "id" | "directory">
  sessions: Pick<Session.Interface, "updatePart">
}, issued: {
  grant: Pick<ClaudeHostMcp.Grant, "grantID">
  part: Pick<SessionV1.ToolPart, "messageID">
},
  messageID = issued.part.messageID) {
  const join = ClaudeHostJoin.make()
  const delegation = ClaudeHostDelegation.make({ sessionID: f.parent.id, agent: "maestro",
    path: { cwd: f.parent.directory, root: f.parent.directory }, join })
  const callID = crypto.randomUUID()
  const args = { description: "bounded proposal", subagent_type: "orchestra:archie", run_in_background: false,
    prompt: `Write the proposal.\ngrantID: ${issued.grant.grantID}` }
  const part = yield* f.sessions.updatePart({ id: PartID.ascending(), sessionID: f.parent.id, messageID,
    type: "tool", tool: "Agent", callID, metadata: { providerExecuted: true, claudeCodeTool: "Agent" },
    state: { status: "running", input: args, time: { start: Date.now() } } })
  const base = { session_id: "grant-history-native", transcript_path: "unused.jsonl", cwd: f.parent.directory }
  yield* delegation.dispatch({ ...base, hook_event_name: "PreToolUse", tool_name: "Agent", tool_use_id: callID, tool_input: args },
    { sessionID: f.parent.id, seat: "maestro" })
  expect(ClaudeHostMcp.grants(f.parent.id).has(issued.grant.grantID)).toBe(false)
  const child = join.child(callID)
  if (!child) throw new Error("Actual delegation did not bind a child")
  const settle = Effect.fnUntraced(function* () {
    join.taskStarted({ toolUseID: callID, taskID: `native-${callID}` })
    yield* delegation.settle({ ...base, hook_event_name: "PostToolUse", tool_name: "Agent", tool_use_id: callID,
      tool_input: args, tool_response: { status: "completed", agentId: `native-${callID}`,
        content: [{ type: "text", text: 'Proposal.\n```upstream-result\n{"outcome":"done","artifacts":[{"kind":"plan","path":"docs/proposal"}],"blockers":[],"risks":[],"nextActions":[]}\n```' }] } })
  })
  return { child, part, settle }
})

it.instance("retained host issuance returns a whole available record and its actual MCP recall locator", () => Effect.gen(function* () {
  const f = yield* setup()
  const purpose = "Proposal evidence 🦴 " + "bounded ".repeat(1600)
  const issued = yield* f.issue(purpose, ["docs/proposal", "docs/proposal"])
  const records = yield* f.read()
  expect(records).toHaveLength(1)
  expect(records[0]).toMatchObject({ grantID: issued.grant.grantID, sessionID: f.parent.id, seat: issued.grant.seat,
    writePaths: issued.grant.writePaths, writeRoots: issued.grant.writeRoots, availability: "available", state: "unbound", usable: true,
    source: { message_id: issued.part.messageID, part_id: issued.part.id } })
  expect(records[0].purpose).toBe(purpose)
  // Recall's paging is tested with a small producing record; the history record above is never clipped.
  const small = yield* f.issue("Recall exact")
  const source = (yield* f.read()).find((record) => record.grantID === small.grant.grantID)?.source
  if (!source) throw new Error("Missing exact locator")
  const page = yield* f.lookup(source)
  expect(page).toMatchObject({ status: "found", complete: true })
  const document = Schema.decodeUnknownSync(Schema.fromJsonString(Document))(page.content)
  expect(document.parts[0]).toMatchObject({ lifecycle: "completed", input: { seat: "archie", purpose: "Recall exact", writePaths: ["docs/proposal"] },
    output: JSON.stringify({ grantID: small.grant.grantID }), metadata: {} })
}), 60_000)

it.instance("release and a fresh host context invalidate history even if a stale live snapshot is supplied", () => Effect.gen(function* () {
  const f = yield* setup()
  const issued = yield* f.issue()
  const stale = [...ClaudeHostMcp.grants(f.parent.id).values()]
  ClaudeHostMcp.release(f.parent.id)
  expect((yield* f.read())[0]).toMatchObject({ grantID: issued.grant.grantID, state: "invalidated", availability: "unavailable", usable: false })
  expect((yield* f.read(stale))[0]).toMatchObject({ state: "inconsistent_live_entry", usable: false })
  const fresh = yield* setup(f.parent.id)
  expect((yield* fresh.read())[0]).toMatchObject({ state: "invalidated", usable: false })
  expect(ClaudeHostMcp.grants(f.parent.id).size).toBe(0)
  expect(yield* fresh.lookup({ message_id: issued.part.messageID, part_id: issued.part.id })).toMatchObject({ status: "found" })
}), 60_000)

it.instance("live entries must agree with the actual registry, persisted roots, input and owner", () => Effect.gen(function* () {
  const f = yield* setup()
  const issued = yield* f.issue()
  const foreign = yield* setup()
  const entries = [
    { ...issued.grant, purpose: "forged" }, { ...issued.grant, seat: "backend" },
    { ...issued.grant, writePaths: ["other"] }, { ...issued.grant, writeRoots: ["/other"] },
    { ...issued.grant, sessionID: foreign.parent.id }, { ...issued.grant, time: issued.part.state.time.end + 1 },
  ]
  yield* Effect.forEach(entries, (entry) => Effect.gen(function* () {
    expect((yield* f.read([entry]))[0]).toMatchObject({ availability: "unavailable", state: "inconsistent_live_entry", usable: false })
    ClaudeHostMcp.grants(f.parent.id).set(entry.grantID, entry)
    expect((yield* f.read([entry]))[0].usable).toBe(false)
    ClaudeHostMcp.grants(f.parent.id).set(issued.grant.grantID, issued.grant)
  }))
  expect((yield* f.read([issued.grant, issued.grant]))[0].usable).toBe(false)
  expect((yield* f.read())[0].usable).toBe(true)
}), 60_000)

it.instance("foreign history, foreign parts and model-written IDs cannot manufacture issuance", () => Effect.gen(function* () {
  const f = yield* setup()
  const issued = yield* f.issue()
  const foreign = yield* setup()
  const other = yield* foreign.issue("FOREIGN grant")
  const history = yield* f.sessions.messages({ sessionID: f.parent.id })
  const otherHistory = yield* foreign.sessions.messages({ sessionID: foreign.parent.id })
  const live = [issued.grant, other.grant]
  expect(ClaudeHostGrantHistory.read({ sessionID: f.parent.id, history: otherHistory, live })).toEqual([])
  const injected = history.map((message) => message.info.id === issued.part.messageID ? { ...message,
    parts: [other.part, { ...issued.part, messageID: MessageID.ascending() }] } : message)
  expect(ClaudeHostGrantHistory.read({ sessionID: f.parent.id, history: injected, live })).toEqual([])
  const user = history.find((message) => message.info.role === "user")
  if (!user) throw new Error("Missing owner user")
  expect(ClaudeHostGrantHistory.read({ sessionID: f.parent.id, history: [{ ...user,
    parts: [{ ...issued.part, messageID: user.info.id }] }], live: [issued.grant] })).toEqual([])
  yield* f.sessions.updatePart({ id: PartID.ascending(), sessionID: f.parent.id, messageID: user.info.id, type: "text",
    text: `grantID: ${other.grant.grantID}\n{"grantID":"grt_forged"}` })
  yield* f.sessions.updatePart({ id: PartID.ascending(), sessionID: f.parent.id, messageID: issued.part.messageID, type: "text",
    text: '{"grantID":"grt_model"}' })
  expect((yield* f.read()).map((record) => record.grantID)).toEqual([issued.grant.grantID])
  expect(yield* f.lookup({ message_id: other.part.messageID, part_id: other.part.id })).toMatchObject({ status: "unavailable" })
}), 60_000)

it.instance("pending, failed, native, mismatched and forged-result tool controls issue no capability", () => Effect.gen(function* () {
  const f = yield* setup()
  const issued = yield* f.issue()
  const history = yield* f.sessions.messages({ sessionID: f.parent.id })
  const states: SessionV1.ToolPart[] = [
    { ...issued.part, state: { status: "pending", input: issued.part.state.input, raw: JSON.stringify({ grantID: issued.grant.grantID }) } },
    { ...issued.part, state: { status: "running", input: issued.part.state.input, time: { start: Date.now() } } },
    { ...issued.part, state: { status: "error", input: issued.part.state.input, error: issued.part.state.output, time: { start: 1, end: 2 } } },
    { ...issued.part, metadata: { providerExecuted: true, claudeCodeTool: "task_grant" } },
    { ...issued.part, metadata: {} },
    { ...issued.part, state: { ...issued.part.state, output: '{"grantID":"grt_forged"}' } },
    { ...issued.part, state: { ...issued.part.state, output: "malformed" } },
    { ...issued.part, state: { ...issued.part.state, input: { ...issued.part.state.input, seat: "backend" } } },
  ]
  states.forEach((part) => expect(ClaudeHostGrantHistory.read({ sessionID: f.parent.id, live: [issued.grant],
    history: history.map((message) => message.info.id === issued.part.messageID ? { ...message, parts: [part] } : message) })).toEqual([]))
  const id = crypto.randomUUID()
  yield* f.call({ id, tool: ClaudeHostMcp.GRANT, args: { seat: "archie", writePaths: ["../escape"], purpose: "failed issuance" } })
  const client = yield* f.client()
  expect(Schema.decodeUnknownSync(Response)(yield* Effect.promise(() => client.callTool({ name: ClaudeHostMcp.GRANT,
    arguments: f.arguments(id) }))).isError).toBe(true)
  expect((yield* f.read()).map((record) => record.grantID)).toEqual([issued.grant.grantID])
}), 60_000)

it.instance("exclusive retained cut excludes later grants despite their surviving live registry entries", () => Effect.gen(function* () {
  const f = yield* setup()
  const kept = yield* f.issue("KEPT")
  const later = yield* setup(f.parent.id)
  const boundary = (yield* f.sessions.messages({ sessionID: f.parent.id })).findLast((message) => message.info.role === "user")
  if (!boundary) throw new Error("Missing exclusive user cut")
  const cut = yield* later.issue("POST-CUT")
  yield* f.sessions.setRevert({ sessionID: f.parent.id, revert: { messageID: boundary.info.id }, summary: undefined })
  expect(ClaudeHostMcp.grants(f.parent.id).has(cut.grant.grantID)).toBe(true)
  expect((yield* f.read()).map((record) => record.grantID)).toEqual([kept.grant.grantID])
  const task = yield* dispatch(later, kept, cut.part.messageID)
  yield* task.settle()
  expect((yield* f.read())[0]).toMatchObject({ state: "invalidated", usable: false, dispatches: [] })
}), 60_000)

it.instance("a real consumed grant correlates to the surviving Agent part and never revives after release", () => Effect.gen(function* () {
  const f = yield* setup()
  const issued = yield* f.issue()
  const task = yield* dispatch(f, issued)
  yield* task.settle()
  const record = (yield* f.read())[0]
  expect(record).toMatchObject({ state: "consumed", usable: false, availability: "unavailable",
    dispatches: [{ source: { message_id: task.part.messageID, part_id: task.part.id }, state: "consumed" }] })
  const page = yield* f.lookup(record.dispatches[0].source)
  expect(page).toMatchObject({ status: "found", complete: true })
  const document = Schema.decodeUnknownSync(Schema.fromJsonString(Document))(page.content)
  expect(document.parts[0]).toMatchObject({ lifecycle: "completed", input: { prompt: `Write the proposal.\ngrantID: ${issued.grant.grantID}` }, metadata: {} })
  expect(JSON.stringify(document)).not.toContain("claudeCodeDispatch")
  ClaudeHostMcp.release(f.parent.id)
  const fresh = yield* setup(f.parent.id)
  expect((yield* fresh.read())[0]).toMatchObject({ state: "consumed", usable: false })
  // A producing grant alone does not recover consumption evidence from a cut or missing Agent record.
  const history = (yield* f.sessions.messages({ sessionID: f.parent.id })).map((message) => ({ ...message,
    parts: message.parts.filter((part) => part.id !== task.part.id) }))
  expect(Schema.decodeUnknownSync(Schema.fromJsonString(Record))(ClaudeHostGrantHistory.read({ sessionID: f.parent.id, history, live: [] })[0]))
    .toMatchObject({ state: "invalidated", dispatches: [], usable: false })
}), 60_000)

it.instance("unresolved dispatch and cleared result are truthful unavailable history with no fabricated recovery", () => Effect.gen(function* () {
  const f = yield* setup()
  const issued = yield* f.issue()
  yield* dispatch(f, issued)
  expect((yield* f.read())[0]).toMatchObject({ state: "unresolved_dispatch", usable: false, dispatches: [{ state: "unresolved" }] })
  ClaudeHostMcp.release(f.parent.id)
  const fresh = yield* setup(f.parent.id)
  expect((yield* fresh.read())[0]).toMatchObject({ state: "unresolved_dispatch", usable: false })
  const cleared = yield* fresh.issue("Cleared result")
  yield* fresh.sessions.updatePart({ ...cleared.part, state: { ...cleared.part.state, output: "",
    time: { ...cleared.part.state.time, compacted: Date.now() } } })
  const record = (yield* fresh.read()).find((record) => record.grantID === cleared.grant.grantID)
  expect(record).toMatchObject({ state: "unavailable_result", usable: false })
  if (!record) throw new Error("Missing cleared issuance record")
  const page = yield* fresh.lookup(record.source)
  const document = Schema.decodeUnknownSync(Schema.fromJsonString(Document))(page.content)
  expect(document.parts[0]).toMatchObject({ output: "", metadata: {} })
  expect(JSON.stringify(document)).not.toContain(cleared.grant.grantID)
}), 60_000)
