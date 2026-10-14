import { afterEach, expect } from "bun:test"
import { Effect, Exit, Schema } from "effect"
import { ClaudeHostDelegation } from "@/claude-code/host/delegation"
import { ClaudeHostJoin } from "@/claude-code/host/join"
import { ClaudeHostMcp } from "@/claude-code/host/mcp"
import { ClaudeHostMemory } from "@/claude-code/host/memory"
import { ClaudeHost } from "@/claude-code/host/session"
import { PartID, type MessageID, type SessionID } from "@/session/schema"
import { SessionRevert } from "@/session/revert"
import { ContextRecallTool } from "@/tool/context-recall"
import { Tool } from "@/tool/tool"
import { disposeAllInstances } from "../../fixture/fixture"
import { testEffect } from "../../lib/effect"
import { makeHttpNoLLMServer } from "../../session/prompt.fixture"
import { BridgeFixture } from "./bridge-fixture"

afterEach(disposeAllInstances)

// Real host controls and SQLite projection. SDK frames/chain receipts are fixture inputs; no model query runs.
const it = testEffect(makeHttpNoLLMServer())
const Source = Schema.Struct({ message_id: Schema.String, part_id: Schema.String })
const Evidence = Schema.Struct({ input: Schema.Unknown, output: Schema.String, lifecycle: Schema.String,
  host_metadata: Schema.Unknown, recall_fields: Schema.Array(Schema.String), host_metadata_recallable: Schema.Boolean })
const Record = Schema.Struct({ grantID: Schema.String, sessionID: Schema.String, purpose: Schema.String,
  source: Source, availability: Schema.String, state: Schema.String, usable: Schema.Boolean, issuance: Evidence,
  dispatches: Schema.Array(Schema.Struct({ source: Source, state: Schema.String, input: Schema.Unknown,
    output: Schema.optional(Schema.String), host_metadata: Schema.optional(Schema.Unknown),
    recall_fields: Schema.Array(Schema.String), host_metadata_recallable: Schema.Boolean })) })
const Response = Schema.Struct({ content: Schema.Array(Schema.Struct({ type: Schema.String, text: Schema.String })),
  isError: Schema.optional(Schema.Boolean) })
const Page = Schema.Struct({ status: Schema.String, source: Source, content: Schema.optional(Schema.String),
  complete: Schema.optional(Schema.Boolean), extent: Schema.optional(Schema.String), original_extent: Schema.optional(Schema.String) })
const Document = Schema.Struct({ parts: Schema.Array(Schema.Struct({ source: Source, lifecycle: Schema.String,
  input: Schema.Unknown, output: Schema.optional(Schema.String), metadata: Schema.Unknown, availability: Schema.String,
  output_availability: Schema.String, extent: Schema.String, original_extent: Schema.String,
  normal_model_context: Schema.optional(Schema.String) })) })

const setup = Effect.fnUntraced(function* (sessionID?: SessionID) {
  const f = yield* BridgeFixture.make(sessionID)
  yield* f.sessions.setPermission({ sessionID: f.parent.id, permission: [{ permission: "*", pattern: "*", action: "allow" }] })
  yield* Effect.addFinalizer(() => Effect.sync(() => ClaudeHostMcp.release(f.parent.id)))
  const definition = yield* ContextRecallTool
  const client = yield* f.client([yield* Tool.init(definition)])
  const issue = Effect.fnUntraced(function* (purpose: string) {
    const id = crypto.randomUUID()
    const part = yield* f.call({ id, tool: ClaudeHostMcp.GRANT, args: { seat: "archie", purpose, writePaths: ["docs/proposal"] } })
    const response = Schema.decodeUnknownSync(Response)(yield* Effect.promise(() => client.callTool({
      name: ClaudeHostMcp.GRANT, arguments: f.arguments(id),
    })))
    expect(response.isError).toBeUndefined()
    f.bridge.release(id)
    const grantID = Schema.decodeUnknownSync(Schema.fromJsonString(Schema.Struct({ grantID: Schema.String })))(response.content[0].text).grantID
    const grant = ClaudeHostMcp.grants(f.parent.id).get(grantID)
    if (!grant) throw new Error("Actual MCP handler issued no grant")
    const stored = yield* f.sessions.getPart({ sessionID: f.parent.id, messageID: part.messageID, partID: part.id })
    if (stored?.type !== "tool" || stored.state.status !== "completed") throw new Error("Host bridge did not persist issuance")
    return { grant, part: { ...stored, state: stored.state } }
  })
  const read = Effect.fnUntraced(function* (live = [...ClaudeHostMcp.grants(f.parent.id).values()]) {
    const memory = yield* ClaudeHostMemory.read({ sessionID: f.parent.id, pending: [], grants: live })
    // Decode the exported memory section, so suppression of live entries at cut=true cannot evade these controls.
    const section = memory?.split("## Write grants (retained issuance; exact live ownership or explicit invalidation)\n")[1]
    return section ? section.split("\n\n")[0].split("\n").map((line) => Schema.decodeUnknownSync(Schema.fromJsonString(Record))(line)) : []
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
  return { ...f, client, issue, read, lookup }
})

const cut = Effect.fnUntraced(function* (mode: "revert" | "fork") {
  const host = yield* ClaudeHost.Service // Registers the real Session fork lifecycle owner, without starting a query.
  const original = yield* setup()
  const kept = yield* original.issue("KEPT BEFORE CUT")
  const futureContext = yield* setup(original.parent.id)
  const boundary = (yield* original.sessions.messages({ sessionID: original.parent.id })).findLast((message) => message.info.role === "user")
  if (!boundary) throw new Error("Missing exclusive user cut")
  const future = yield* futureContext.issue("OLD FUTURE GRANT")
  // Script the native receipt only. The retained provenance marker is produced by the real lifecycle owner below.
  yield* original.sessions.setMetadata({ sessionID: original.parent.id, metadata: { claudeCode: {
    sessionId: "post-cut-native", starts: { [boundary.info.id]: "native-before-future" },
  } } })
  const revert = yield* SessionRevert.Service
  const target = mode === "fork"
    ? yield* original.sessions.fork({ sessionID: original.parent.id, messageID: boundary.info.id })
    : yield* revert.revert({ sessionID: original.parent.id, messageID: boundary.info.id })
  if (mode === "revert") {
    const view = yield* ClaudeHostMemory.retained(target.id)
    expect(view.cut).toBe(true)
    expect(ClaudeHostMcp.grants(target.id).get(future.grant.grantID)).toEqual(future.grant)
    expect((yield* original.read()).map((record) => record.grantID)).toEqual([kept.grant.grantID])
    yield* host.reconcileRevert(target)
    yield* revert.cleanup(yield* original.sessions.get(target.id))
  }
  const f = yield* setup(target.id)
  const view = yield* ClaudeHostMemory.retained(target.id)
  expect(view.session.revert).toBeUndefined()
  expect(view.cut).toBe(true)
  expect(view.lineage?.kind).toBe(mode)
  expect(Object.values(view.lineage?.messages ?? {}).flat()).toContainEqual({
    projectID: original.parent.projectID, sessionID: original.parent.id, messageID: kept.part.messageID,
  })
  expect(Object.values(view.lineage?.messages ?? {}).flat().map((origin) => origin.messageID)).not.toContain(future.part.messageID)
  expect(JSON.stringify(view.history)).not.toContain(future.grant.grantID)
  expect(ClaudeHostMcp.grants(original.parent.id).get(future.grant.grantID)).toEqual(future.grant)
  expect((yield* f.read()).map((record) => record.grantID)).toEqual([kept.grant.grantID])
  return { f, original, kept, future }
})

const dispatch = Effect.fnUntraced(function* (f: Effect.Success<ReturnType<typeof setup>>, grantID: string, messageID: MessageID) {
  const join = ClaudeHostJoin.make()
  const delegation = ClaudeHostDelegation.make({ sessionID: f.parent.id, agent: "maestro",
    path: { cwd: f.parent.directory, root: f.parent.directory }, join })
  const callID = crypto.randomUUID()
  const args = { description: "bounded proposal", subagent_type: "orchestra:archie", run_in_background: false,
    prompt: `Write the proposal.\ngrantID: ${grantID}` }
  const part = yield* f.sessions.updatePart({ id: PartID.ascending(), sessionID: f.parent.id, messageID,
    type: "tool", tool: "Agent", callID, metadata: { providerExecuted: true, claudeCodeTool: "Agent" },
    state: { status: "running", input: args, time: { start: Date.now() } } })
  const base = { session_id: "post-cut-native", transcript_path: "unused.jsonl", cwd: f.parent.directory }
  const result = yield* delegation.dispatch({ ...base, hook_event_name: "PreToolUse", tool_name: "Agent", tool_use_id: callID, tool_input: args },
    { sessionID: f.parent.id, seat: "maestro" }).pipe(Effect.exit)
  const settle = Effect.fnUntraced(function* () {
    join.taskStarted({ toolUseID: callID, taskID: `native-${callID}` })
    yield* delegation.settle({ ...base, hook_event_name: "PostToolUse", tool_name: "Agent", tool_use_id: callID,
      tool_input: args, tool_response: { status: "completed", agentId: `native-${callID}`, content: [{ type: "text",
        text: 'Proposal.\n```upstream-result\n{"outcome":"done","artifacts":[{"kind":"plan","path":"docs/proposal"}],"blockers":[],"risks":[],"nextActions":[]}\n```' }] } })
  })
  return { result, child: join.child(callID), part, settle }
})

for (const mode of ["revert", "fork"] as const)
  it.instance(`${mode}: retained provenance excludes old future grant while new post-cut host grant is available and consumable once`, () => Effect.gen(function* () {
    const scenario = yield* cut(mode)
    const f = scenario.f
    const issued = yield* f.issue("NEW POST-CUT GRANT")
    const records = yield* f.read()
    expect(records.map((record) => record.grantID)).toEqual([scenario.kept.grant.grantID, issued.grant.grantID])
    expect(records[0]).toMatchObject({ state: mode === "fork" ? "invalidated" : "unbound", usable: mode !== "fork" })
    expect(records[1]).toMatchObject({ sessionID: f.parent.id, state: "unbound", availability: "available", usable: true,
      source: { message_id: issued.part.messageID, part_id: issued.part.id } })
    expect((yield* ClaudeHostMemory.retained(f.parent.id)).cut).toBe(true)
    expect((yield* ClaudeHostMemory.retained(f.parent.id)).lineage?.messages[issued.part.messageID]).toBeUndefined()
    const task = yield* dispatch(f, issued.grant.grantID, issued.part.messageID)
    expect(Exit.isSuccess(task.result)).toBe(true)
    expect(task.child).toBeDefined()
    expect(ClaudeHostMcp.grants(f.parent.id).has(issued.grant.grantID)).toBe(false)
    yield* task.settle()
    const record = (yield* f.read()).find((record) => record.grantID === issued.grant.grantID)
    if (!record) throw new Error("Missing consumed post-cut record")
    expect(record).toMatchObject({ state: "consumed", availability: "unavailable", usable: false,
      dispatches: [{ source: { message_id: task.part.messageID, part_id: task.part.id }, state: "consumed",
        recall_fields: ["input", "lifecycle", "output"], host_metadata_recallable: false }] })
    const children = yield* f.sessions.children(f.parent.id)
    const retry = yield* dispatch(f, issued.grant.grantID, issued.part.messageID)
    expect(Exit.isFailure(retry.result)).toBe(true)
    expect(String(retry.result)).toContain(`HOLD: ${issued.grant.grantID} is not an unused archie grant of this session.`)
    expect(retry.child).toBeUndefined()
    expect((yield* f.sessions.children(f.parent.id)).map((child) => child.id)).toEqual(children.map((child) => child.id))
    const page = yield* f.lookup(record.dispatches[0].source)
    expect(page).toMatchObject({ status: "found", complete: true, extent: "stored_document", original_extent: "unknown" })
    const document = Schema.decodeUnknownSync(Schema.fromJsonString(Document))(page.content)
    expect(document.parts[0]).toMatchObject({ lifecycle: "completed", input: record.dispatches[0].input,
      output: record.dispatches[0].output, metadata: {}, extent: "stored_record", original_extent: "unknown" })
    expect(record.dispatches[0].host_metadata).toMatchObject({ executor: "claude-code-host", grantID: issued.grant.grantID })
    expect(JSON.stringify(document)).not.toContain("claudeCodeDispatch")
    expect((yield* f.read()).map((record) => record.grantID)).not.toContain(scenario.future.grant.grantID)
  }), 60_000)

it.instance("post-cut availability requires exact supplied snapshot, actual live registry, persisted issuance and Session owner", () => Effect.gen(function* () {
  const f = (yield* cut("revert")).f
  const issued = yield* f.issue("EXACT LIVE OWNER")
  const foreign = yield* setup()
  const entries = [{ ...issued.grant, purpose: "forged" }, { ...issued.grant, seat: "backend" },
    { ...issued.grant, writePaths: ["other"] }, { ...issued.grant, writeRoots: ["/other"] },
    { ...issued.grant, sessionID: foreign.parent.id }, { ...issued.grant, time: issued.part.state.time.end + 1 }]
  yield* Effect.forEach(entries, (entry) => Effect.gen(function* () {
    expect((yield* f.read([entry])).find((record) => record.grantID === issued.grant.grantID))
      .toMatchObject({ state: "inconsistent_live_entry", availability: "unavailable", usable: false })
    ClaudeHostMcp.grants(f.parent.id).set(entry.grantID, entry)
    expect((yield* f.read([entry])).find((record) => record.grantID === issued.grant.grantID)?.usable).toBe(false)
    ClaudeHostMcp.grants(f.parent.id).set(issued.grant.grantID, issued.grant)
  }))
  expect((yield* f.read([issued.grant, issued.grant])).find((record) => record.grantID === issued.grant.grantID)?.usable).toBe(false)
  expect((yield* f.read()).find((record) => record.grantID === issued.grant.grantID))
    .toMatchObject({ state: "unbound", availability: "available", usable: true })
}), 60_000)

it.instance("release and fresh bridge/MCP context invalidate post-cut history without recreating capability", () => Effect.gen(function* () {
  const f = (yield* cut("revert")).f
  const issued = yield* f.issue("RELEASED POST-CUT")
  expect((yield* f.read()).find((record) => record.grantID === issued.grant.grantID)?.usable).toBe(true)
  const stale = [...ClaudeHostMcp.grants(f.parent.id).values()]
  ClaudeHostMcp.release(f.parent.id)
  expect((yield* f.read()).find((record) => record.grantID === issued.grant.grantID))
    .toMatchObject({ state: "invalidated", usable: false })
  expect((yield* f.read(stale)).find((record) => record.grantID === issued.grant.grantID))
    .toMatchObject({ state: "inconsistent_live_entry", usable: false })
  // Model a host restart's empty process-local registry with a fresh real bridge/server, not an app restart.
  const fresh = yield* setup(f.parent.id)
  expect((yield* ClaudeHostMemory.retained(fresh.parent.id)).cut).toBe(true)
  expect((yield* fresh.read()).find((record) => record.grantID === issued.grant.grantID))
    .toMatchObject({ state: "invalidated", usable: false })
  expect(ClaudeHostMcp.grants(fresh.parent.id).size).toBe(0)
  const retry = yield* dispatch(fresh, issued.grant.grantID, issued.part.messageID)
  expect(Exit.isFailure(retry.result)).toBe(true)
  expect(retry.child).toBeUndefined()
  expect(ClaudeHostMcp.grants(fresh.parent.id).size).toBe(0)
  expect(yield* fresh.lookup({ message_id: issued.part.messageID, part_id: issued.part.id })).toMatchObject({ status: "found" })
  expect(ClaudeHostMcp.grants(fresh.parent.id).size).toBe(0)
  const replacement = yield* fresh.issue("EXPLICIT REISSUE")
  expect(replacement.grant.grantID).not.toBe(issued.grant.grantID)
  expect((yield* fresh.read()).find((record) => record.grantID === replacement.grant.grantID)?.usable).toBe(true)
}), 60_000)

it.instance("foreign dispatch receipt, foreign grant and model-written IDs cannot issue post-cut capability", () => Effect.gen(function* () {
  const scenario = yield* cut("revert")
  const f = scenario.f
  const foreign = yield* setup()
  const id = crypto.randomUUID()
  const foreignPart = yield* foreign.call({ id, tool: ClaudeHostMcp.GRANT,
    args: { seat: "archie", purpose: "FOREIGN OWNER", writePaths: ["docs/proposal"] } })
  expect(Schema.decodeUnknownSync(Response)(yield* Effect.promise(() => f.client.callTool({ name: ClaudeHostMcp.GRANT,
    arguments: foreign.arguments(id) }))).isError).toBe(true)
  const other = yield* foreign.issue("FOREIGN GRANT")
  yield* f.sessions.updatePart({ id: PartID.ascending(), sessionID: f.parent.id, messageID: scenario.kept.part.messageID,
    type: "text", text: `grantID: ${other.grant.grantID}\n{"grantID":"grt_model"}` })
  // Persist a native/model tool result through Session; only a completed host MCP producer can issue history.
  yield* f.sessions.updatePart({ ...other.part, id: PartID.ascending(), sessionID: f.parent.id, messageID: scenario.kept.part.messageID,
    metadata: { providerExecuted: true, claudeCodeTool: "task_grant" } })
  expect((yield* f.read([scenario.kept.grant, other.grant])).map((record) => record.grantID)).toEqual([scenario.kept.grant.grantID])
  expect(ClaudeHostMcp.grants(f.parent.id).has(other.grant.grantID)).toBe(false)
  expect(ClaudeHostMcp.grants(f.parent.id).has("grt_model")).toBe(false)
  const denied = yield* dispatch(f, other.grant.grantID, scenario.kept.part.messageID)
  expect(Exit.isFailure(denied.result)).toBe(true)
  expect(denied.child).toBeUndefined()
  expect(yield* f.lookup({ message_id: foreignPart.messageID, part_id: foreignPart.id })).toMatchObject({ status: "unavailable" })
  const issued = yield* f.issue("OWN HOST POSITIVE CONTROL")
  expect((yield* f.read()).find((record) => record.grantID === issued.grant.grantID)?.usable).toBe(true)
}), 60_000)

it.instance("actual post-cut issuance locator recalls input/output with truthful stored extent and excludes host metadata", () => Effect.gen(function* () {
  const f = (yield* cut("fork")).f
  const issued = yield* f.issue("RECALL POST-CUT 🦴")
  const record = (yield* f.read()).find((record) => record.grantID === issued.grant.grantID)
  if (!record) throw new Error("Missing post-cut recall locator")
  expect(record.issuance).toMatchObject({ input: issued.part.state.input, output: issued.part.state.output, lifecycle: "completed",
    host_metadata: { grantID: issued.grant.grantID, seat: "archie", writeRoots: issued.grant.writeRoots },
    recall_fields: ["input", "output", "lifecycle"], host_metadata_recallable: false })
  const page = yield* f.lookup(record.source)
  expect(page).toMatchObject({ status: "found", source: record.source, complete: true,
    extent: "stored_document", original_extent: "unknown" })
  const document = Schema.decodeUnknownSync(Schema.fromJsonString(Document))(page.content)
  expect(document.parts).toHaveLength(1)
  expect(document.parts[0]).toMatchObject({ source: record.source, lifecycle: "completed", input: issued.part.state.input,
    output: issued.part.state.output, metadata: {}, availability: "found", output_availability: "stored",
    extent: "stored_record", original_extent: "unknown" })
  expect(JSON.stringify(document)).not.toContain("writeRoots")
  yield* f.sessions.updatePart({ ...issued.part, state: { ...issued.part.state,
    metadata: { ...issued.part.state.metadata, truncated: true } } })
  const preview = yield* f.lookup(record.source)
  expect(preview.complete).toBe(true)
  expect(Schema.decodeUnknownSync(Schema.fromJsonString(Document))(preview.content).parts[0])
    .toMatchObject({ extent: "stored_preview", original_extent: "truncated", metadata: { truncated: true } })
  yield* f.sessions.updatePart({ ...issued.part, state: { ...issued.part.state, output: "",
    time: { ...issued.part.state.time, compacted: Date.now() } } })
  expect((yield* f.read()).find((record) => record.grantID === issued.grant.grantID))
    .toMatchObject({ state: "unavailable_result", usable: false })
  const cleared = yield* f.lookup(record.source)
  expect(cleared).toMatchObject({ status: "cleared", complete: true })
  expect(Schema.decodeUnknownSync(Schema.fromJsonString(Document))(cleared.content).parts[0])
    .toMatchObject({ output: "", output_availability: "cleared", normal_model_context: "omitted_by_compaction", metadata: {} })
  expect(cleared.content).not.toContain(issued.grant.grantID)
}), 60_000)
