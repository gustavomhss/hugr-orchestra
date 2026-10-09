import { describe, expect } from "bun:test"
import { DateTime, Effect, Exit, Layer, Schema } from "effect"
import { eq } from "drizzle-orm"
import { Database } from "../src/database/database"
import { AppNodeBuilder } from "../src/effect/app-node-builder"
import { LayerNode } from "../src/effect/layer-node"
import { EventV2 } from "../src/event"
import { ModelV2 } from "../src/model"
import { ProviderV2 } from "../src/provider"
import { SessionEvent } from "../src/session/event"
import { SessionMessage } from "../src/session/message"
import { SessionMessageUpdater } from "../src/session/message-updater"
import { SessionSchema } from "../src/session/schema"
import { SessionProjector } from "../src/session/projector"
import { PartTable, SessionTable } from "../src/session/sql"
import { SessionV1 } from "../src/v1/session"
import { Project } from "../src/project"
import { ProjectTable } from "../src/project/sql"
import { AbsolutePath } from "../src/schema"
import { testEffect } from "./lib/effect"

// Prepared source cases, not executed. These exercise the actual receipt helpers and production updater.
const it = testEffect(Layer.empty)
const sessionID = SessionSchema.ID.make("ses_authority")
const messageID = SessionMessage.ID.make("msg_authority")
const input = { subagent_type: "walt", task_id: "tsk_proposal", prompt: "Return the proposal" }
const owner = { sessionID, messageID, callID: "task-call", tool: "task", input }
const workResult = {
  schema: "upstream-work-result-v1",
  taskId: "tsk_proposal",
  card: { parsed: true, messageID: "msg_returned" },
  author: { memberId: "walt", executionSessionID: "ses_child", messageID: "msg_returned" },
  outcome: "done",
  terminal: { reason: "ended" },
}
const receipt = {
  parentMessageID: messageID,
  parentCallID: "task-call",
  workResult,
  deliveryMessageID: "msg_notice",
  deliveryPartID: "prt_notice",
}
const metadata = { parentSessionId: sessionID, sessionId: "ses_child", background: true, workResult, upstreamSettlement: receipt }
const timestamp = DateTime.makeUnsafe(1)

function fixture() {
  const state: SessionMessageUpdater.MemoryState = { messages: [SessionMessage.Assistant.make({
    id: messageID,
    type: "assistant",
    agent: "maestro",
    model: { id: ModelV2.ID.make("model"), providerID: ProviderV2.ID.make("provider") },
    content: [SessionMessage.AssistantTool.make({
      type: "tool", id: "task-call", name: "task", time: { created: timestamp },
      state: SessionMessage.ToolStateRunning.make({ status: "running", input,
        structured: { metadata: { parentSessionId: sessionID, sessionId: "ses_child", background: true } }, content: [] }),
    })],
    time: { created: timestamp },
  })] }
  return { state, adapter: SessionMessageUpdater.memory(state) }
}

function tool(state: SessionMessageUpdater.MemoryState) {
  const message = state.messages[0]
  if (message?.type !== "assistant") throw new Error("Missing owned assistant")
  const call = message.content[0]
  if (call?.type !== "tool" || !("structured" in call.state)) throw new Error("Missing owned Task")
  return { ...call, state: call.state }
}

const progress = (value: Record<string, unknown>) => SessionEvent.Tool.Progress.make({
  id: EventV2.ID.make("evt_progress"), type: SessionEvent.Tool.Progress.type,
  data: { sessionID, assistantMessageID: messageID, callID: "task-call", timestamp, structured: value, content: [] },
})

const dbIt = testEffect(AppNodeBuilder.build(LayerNode.group([Database.node, EventV2.node, SessionProjector.node])))
dbIt.effect("legacy durable projector preserves receipt, original input and terminal state against late metadata", () => Effect.gen(function* () {
  const database = yield* Database.Service
  const events = yield* EventV2.Service
  yield* database.db.insert(ProjectTable).values({ id: Project.ID.global, worktree: AbsolutePath.make("/project"), sandboxes: [] }).run()
  yield* database.db.insert(SessionTable).values({ id: sessionID, project_id: Project.ID.global, slug: "upstream",
    directory: "/project", title: "upstream", version: "test" }).run()
  yield* events.publish(SessionV1.Event.MessageUpdated, { sessionID, info: SessionV1.Assistant.make({
    id: SessionV1.MessageID.make(messageID), sessionID, role: "assistant", agent: "maestro", mode: "maestro",
    parentID: SessionV1.MessageID.make("msg_user"), modelID: ModelV2.ID.make("model"), providerID: ProviderV2.ID.make("provider"),
    path: { cwd: "/project", root: "/project" }, time: { created: 1 }, cost: 0,
    tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
  }) })
  const part = SessionV1.ToolPart.make({ id: SessionV1.PartID.make("prt_original"),
    sessionID, messageID: SessionV1.MessageID.make(messageID), type: "tool", tool: "task", callID: "task-call",
    state: { status: "completed", input, output: "Background task started", title: "upstream",
      metadata, time: { start: 1, end: 1 } },
  })
  yield* events.publish(SessionV1.Event.PartUpdated, { sessionID, time: 1, part }, { persist: true })
  yield* events.publish(SessionV1.Event.PartUpdated, { sessionID, time: 1,
    part: { ...part, state: { status: "running", input: { ...input, prompt: "late mutated prompt" },
      metadata: { workResult: { terminal: { reason: "running" } } }, time: { start: 1 } } },
  }, { persist: true })
  const row = yield* database.db.select().from(PartTable).where(eq(PartTable.id, part.id)).get()
  if (!row) throw new Error("Missing durable original Task part")
  const current = Schema.decodeUnknownSync(SessionV1.Part)({ ...row.data, id: row.id,
    messageID: row.message_id, sessionID: row.session_id })
  if (current.type !== "tool" || !("metadata" in current.state)) throw new Error("Missing durable Task metadata")
  expect(current.state.status).toBe("completed")
  expect(current.state.input).toEqual(input)
  expect(current.state.metadata).toMatchObject({ upstreamSettlement: receipt, workResult, sessionId: "ses_child" })
  const conflict = yield* events.publish(SessionV1.Event.PartUpdated, { sessionID, time: 1,
    part: { ...part, callID: "another-dispatch" } }, { persist: true }).pipe(Effect.exit)
  expect(Exit.isFailure(conflict)).toBe(true)
}))
const success = (value: Record<string, unknown>) => SessionEvent.Tool.Success.make({
  id: EventV2.ID.make("evt_success"), type: SessionEvent.Tool.Success.type,
  data: { sessionID, assistantMessageID: messageID, callID: "task-call", timestamp, structured: value,
    content: [{ type: "text", text: "Background task started" }], provider: { executed: false } },
})

describe("private upstream settlement preservation", () => {
  it.effect("generic metadata cannot create a receipt or replace a matching stored receipt", () => Effect.sync(() => {
    expect(SessionMessageUpdater.taskMetadata({}, metadata, owner)).not.toHaveProperty("upstreamSettlement")
    const changed = { ...metadata, sessionId: "ses_another", workResult: { terminal: { reason: "running" } },
      upstreamSettlement: { ...receipt, deliveryMessageID: "msg_forged" }, unrelated: "new progress" }
    const preserved = SessionMessageUpdater.taskMetadata(metadata, changed, owner)
    expect(preserved.upstreamSettlement).toEqual(receipt)
    expect(preserved.workResult).toEqual(workResult)
    expect(preserved.sessionId).toBe("ses_child")
    expect(preserved.unrelated).toBe("new progress")
  }))

  it.effect("malformed, conflicting parent/call/child/logical identity cannot carry a receipt", () => Effect.sync(() => {
    expect(SessionMessageUpdater.upstreamSettlement(metadata, owner)).toEqual(receipt)
    expect(SessionMessageUpdater.upstreamSettlement({ ...metadata, upstreamSettlement: { ...receipt, verified: true } }, owner)).toBeUndefined()
    expect(SessionMessageUpdater.upstreamSettlement(metadata, { ...owner, messageID: "msg_other" })).toBeUndefined()
    expect(SessionMessageUpdater.upstreamSettlement(metadata, { ...owner, callID: "other-call" })).toBeUndefined()
    expect(SessionMessageUpdater.upstreamSettlement({ ...metadata, sessionId: "ses_other" }, owner)).toBeUndefined()
    expect(SessionMessageUpdater.upstreamSettlement(metadata, { ...owner, input: { ...input, task_id: "tsk_other" } })).toBeUndefined()
    expect(SessionMessageUpdater.upstreamSettlement({ ...metadata, upstreamSettlement: { ...receipt,
      workResult: { ...workResult, card: { parsed: true, messageID: "msg_later_identical_bytes" } } } }, owner)).toBeUndefined()
  }))

  it.effect("settle-before-initial-completion survives late stale success and same-tick generic progress", () => Effect.gen(function* () {
    const current = fixture()
    yield* SessionMessageUpdater.update(current.adapter, progress({ metadata }))
    yield* SessionMessageUpdater.update(current.adapter, progress({ metadata: { workResult: { terminal: { reason: "running" } } } }))
    yield* SessionMessageUpdater.update(current.adapter, success({ metadata: { background: true } }))
    const call = tool(current.state)
    expect(call.state.status).toBe("completed")
    expect(call.state.structured.metadata).toMatchObject({ upstreamSettlement: receipt, workResult, sessionId: "ses_child" })
  }))

  it.effect("terminal private progress updates receipt without changing status or original result content", () => Effect.gen(function* () {
    const current = fixture()
    yield* SessionMessageUpdater.update(current.adapter, success({ metadata: { parentSessionId: sessionID, sessionId: "ses_child", background: true } }))
    const before = structuredClone(tool(current.state).state.content)
    yield* SessionMessageUpdater.update(current.adapter, progress({ metadata }))
    yield* SessionMessageUpdater.update(current.adapter, progress({ metadata: { ...metadata,
      upstreamSettlement: { ...receipt, deliveryMessageID: "msg_later" } } }))
    const call = tool(current.state)
    expect(call.state.status).toBe("completed")
    expect(call.state.content).toEqual(before)
    expect(call.state.structured.metadata).toMatchObject({ upstreamSettlement: receipt, workResult })
  }))

  it.effect("initial success cannot grant a provider/caller-supplied receipt", () => Effect.gen(function* () {
    const current = fixture()
    yield* SessionMessageUpdater.update(current.adapter, success({ metadata }))
    expect(tool(current.state).state.structured.metadata).not.toHaveProperty("upstreamSettlement")
  }))
})
