import { expect } from "bun:test"
import { and, eq, sql } from "drizzle-orm"
import { Cause, Effect, Exit, Schema } from "effect"
import { Database } from "@orchestra/core/database/database"
import { EventV2 } from "@orchestra/core/event"
import { EventTable } from "@orchestra/core/event/sql"
import { MaestroEvent } from "@orchestra/schema/maestro-event"
import { LogicalTask } from "@/maestro/logical-task"
import { SessionAuthority } from "@/maestro/session-authority"
import { MessageID, SessionID } from "@/session/schema"
import { SessionPrompt } from "@/session/prompt"
import { TestLLMServer } from "../lib/llm-server"
import { fixture, it, model, options } from "./plugin-binding.fixture"

const dispatch = Effect.gen(function* () {
  const f = yield* fixture
  const prompt = yield* SessionPrompt.Service
  const llm = yield* TestLLMServer
  const user = yield* f.sessions.updateMessage({ id: MessageID.ascending(), sessionID: f.child.id,
    role: "user", agent: "maestro", model, time: { created: Date.now() } })
  const assistant = yield* f.sessions.updateMessage({
    id: MessageID.ascending(), role: "assistant", sessionID: f.child.id, parentID: user.id,
    agent: "maestro", mode: "maestro", path: { cwd: f.child.directory, root: f.instance.worktree },
    modelID: model.modelID, providerID: model.providerID, cost: 0, time: { created: Date.now() },
    tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
  })
  yield* llm.tool("read", f.args)
  yield* llm.text("nested work done")
  const named = yield* f.registry.named()
  const result = yield* named.task.execute({ description: "Nested backend work", subagent_type: "backend",
    prompt: "Run the read probe once.", model: "test/test-model" }, {
    ...f.context, messageID: assistant.id, agent: "maestro", agentID: "maestro", callID: "call_task_dispatch",
    extra: { promptOps: { prompt: prompt.prompt, cancel: prompt.cancel, resolvePromptParts: prompt.resolvePromptParts } },
  })
  const execution = yield* f.sessions.get(Schema.decodeUnknownSync(SessionID)(result.metadata.sessionId))
  const binding = yield* LogicalTask.read(execution.id)
  if (!binding) throw new Error("Task producer left no durable logical binding")
  const messages = yield* f.sessions.messages({ sessionID: execution.id })
  const part = messages.flatMap((message) => message.parts)
    .find((part) => part.type === "tool" && part.tool === "read" && part.state.status === "completed")
  if (!part || part.type !== "tool" || part.state.status !== "completed") throw new Error("plugin consumer never ran")
  return { f, execution, binding, pluginMetadata: part.state.metadata }
})

it.instance("real nested Task producer and plugin consumer share root authority and ancestry", () =>
  Effect.gen(function* () {
    const d = yield* dispatch
    expect(d.execution.parentID).toBe(d.f.child.id)
    expect(d.binding.authoritySessionID).toBe(d.f.root.id)
    expect(d.pluginMetadata.binding).toMatchObject({ authoritySessionId: d.f.root.id,
      executionSessionId: d.execution.id, taskId: d.binding.taskId, memberId: "backend" })
    expect(d.pluginMetadata.binding.resumeRef).toBeUndefined()
    const authority = yield* SessionAuthority.make(d.f.sessions.get)(d.execution.id, d.execution.projectID)
    expect(authority.ancestry).toEqual([d.execution.id, d.f.child.id, d.f.parent.id, d.f.root.id])
    expect(authority.rootID).toBe(d.f.root.id)
  }), options, 60000,
)

const historical = Effect.gen(function* () {
  const d = yield* dispatch
  const database = yield* Database.Service
  const row = yield* database.db.select().from(EventTable).where(and(
    eq(EventTable.type, EventV2.versionedType(MaestroEvent.Task.Bound.type, 1)),
    sql`json_extract(${EventTable.data}, '$.executionSessionID') = ${d.execution.id}`,
  )).get().pipe(Effect.orDie)
  if (!row) throw new Error("Task event missing")
  // Model an existing pre-fix row; production reconciliation must neither rewrite nor republish it.
  const data = { ...d.binding, authoritySessionID: d.f.child.id }
  yield* database.db.update(EventTable).set({ data }).where(eq(EventTable.id, row.id)).run().pipe(Effect.orDie)
  return { ...d, database, row: { ...row, data } }
})

it.instance("exact legacy immediate-parent binding normalizes without changing event or task identity", () =>
  Effect.gen(function* () {
    const d = yield* historical
    const normalized = { ...d.row.data, authoritySessionID: d.f.root.id }
    expect(yield* LogicalTask.read(d.execution.id)).toEqual(normalized)
    expect(yield* LogicalTask.ensure(d.row.data)).toEqual(normalized)
    expect(yield* LogicalTask.ensure(normalized)).toEqual(normalized)
    const consumer = yield* d.f.tool.execute(d.f.args, { ...d.f.context, sessionID: d.execution.id })
    expect(consumer.metadata.binding).toMatchObject({ authoritySessionId: d.f.root.id, taskId: d.binding.taskId })
    for (const input of [
      { ...normalized, authoritySessionID: d.f.parent.id }, { ...normalized, memberID: "general" },
      { ...normalized, projectID: "foreign" }, { ...normalized, source: "dispatch" as const },
      { ...normalized, taskId: "tsk_other" },
    ]) {
      const exit = yield* LogicalTask.ensure(input).pipe(Effect.exit)
      expect(Exit.isFailure(exit)).toBe(true)
      if (!Exit.isFailure(exit)) throw new Error("conflicting legacy retry admitted")
      expect(Cause.pretty(exit.cause)).toContain("task-binding-mismatch")
    }
    const rows = yield* d.database.db.select().from(EventTable).where(and(
      eq(EventTable.type, EventV2.versionedType(MaestroEvent.Task.Bound.type, 1)),
      sql`json_extract(${EventTable.data}, '$.executionSessionID') = ${d.execution.id}`,
    )).all().pipe(Effect.orDie)
    expect(rows).toEqual([d.row])
  }), options, 60000,
)

it.instance("legacy compatibility refuses arbitrary stored ancestor authority", () =>
  Effect.gen(function* () {
    const d = yield* historical
    yield* d.database.db.update(EventTable).set({ data: { ...d.row.data, authoritySessionID: d.f.parent.id } })
      .where(eq(EventTable.id, d.row.id)).run().pipe(Effect.orDie)
    const exit = yield* LogicalTask.read(d.execution.id).pipe(Effect.exit)
    expect(Exit.isFailure(exit)).toBe(true)
    if (!Exit.isFailure(exit)) throw new Error("arbitrary ancestor accepted")
    expect(Cause.pretty(exit.cause)).toContain("task-authority-mismatch")
  }), options, 60000,
)
