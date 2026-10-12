import { expect } from "bun:test"
import type { SDKAssistantMessage, SDKUserMessage } from "@anthropic-ai/claude-agent-sdk"
import type { SessionV1 } from "@orchestra/core/v1/session"
import { LayerNode } from "@orchestra/core/effect/layer-node"
import { Database } from "@orchestra/core/database/database"
import { CrossSpawnSpawner } from "@orchestra/core/cross-spawn-spawner"
import { filesystem } from "@orchestra/core/effect/app-node-platform"
import { LocationServiceMap } from "@orchestra/core/location-services"
import { ModelV2 } from "@orchestra/core/model"
import { ProviderV2 } from "@orchestra/core/provider"
import { SessionProjector } from "@orchestra/core/session/projector"
import { Effect } from "effect"
import { Agent } from "@/agent/agent"
import { ClaudeHostMemory } from "@/claude-code/host/memory"
import { ClaudeHostMirror } from "@/claude-code/host/mirror"
import { Archive } from "@/continuity/archive"
import { RuntimeFlags } from "@/effect/runtime-flags"
import { SessionRevert } from "@/session/revert"
import { MessageID, PartID, type SessionID } from "@/session/schema"
import { Session } from "@/session/session"
import { SessionStatus } from "@/session/status"
import { Todo } from "@/session/todo"
import { Snapshot } from "@/snapshot"
import { TestAppNodeBuilder } from "../../fixture/app-node-builder"
import { TestInstance } from "../../fixture/fixture"
import { testEffect } from "../../lib/effect"

// Real Session, revert, fork, mirror, Todo and compact readers. SDK result frames are inputs, not a mocked producer.
const it = testEffect(TestAppNodeBuilder.build(LayerNode.group([
  filesystem, CrossSpawnSpawner.node, LocationServiceMap.node, Session.node, SessionProjector.node,
  SessionRevert.node, Snapshot.node, SessionStatus.node, Todo.node, Agent.node, Archive.node, Database.node,
]), [[RuntimeFlags.node, RuntimeFlags.layer({})]]))
const subject = "A-survives-完整🙂\n" + "complete subject ".repeat(80)
const base = { session_id: "native-todos", parent_tool_use_id: null }
const assistant = (content: SDKAssistantMessage["message"]["content"]): SDKAssistantMessage => ({
  ...base, uuid: crypto.randomUUID(), type: "assistant", message: {
    id: `api-${crypto.randomUUID()}`, model: "claude-test", role: "assistant", type: "message", container: null, context_management: null,
    stop_reason: "tool_use", stop_sequence: null,
    usage: { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0,
      cache_creation: null, server_tool_use: null, service_tier: null }, content,
  },
})
const result = (id: string, structured: unknown, failed = false): SDKUserMessage => ({
  ...base, uuid: crypto.randomUUID(), type: "user", tool_use_result: structured,
  message: { role: "user", content: [{ type: "tool_result", tool_use_id: id,
    content: typeof structured === "string" ? structured : "native result", is_error: failed }] },
})

const setup = Effect.fnUntraced(function* () {
  const instance = yield* TestInstance
  const sessions = yield* Session.Service
  const snapshot = yield* Snapshot.Service
  const todo = yield* Todo.Service
  const status = yield* SessionStatus.Service
  const agents = yield* Agent.Service
  const agent = yield* agents.get("maestro")
  const chat = yield* sessions.create({ title: "Retained native tasks" })
  const user = Effect.fnUntraced(function* (sessionID: SessionID) {
    const info = yield* sessions.updateMessage({ id: MessageID.ascending(), sessionID, role: "user", agent: "maestro",
      model: { providerID: ProviderV2.ID.make("anthropic"), modelID: ModelV2.ID.make("claude-test") }, time: { created: Date.now() } })
    yield* sessions.updatePart({ id: PartID.ascending(), sessionID, messageID: info.id, type: "text", text: "native task turn" })
    return info
  })
  // No shared maps: every call builds a cold mirror over the actual persisted history.
  const make = (owner: SessionV1.User) => ClaudeHostMirror.create({ sessionID: owner.sessionID, user: owner, agent,
    path: { cwd: instance.directory, root: instance.directory }, sessions, snapshot, todo, status })
  const native = Effect.fnUntraced(function* (mirror: ClaudeHostMirror.Mirror, name: string,
    args: Record<string, unknown>, structured: unknown, failed = false) {
    const id = crypto.randomUUID()
    yield* mirror.on(assistant([{ type: "tool_use", id, name, input: args }]))
    yield* mirror.on(result(id, structured, failed))
    const part = mirror.tool(id)
    if (!part || part.state.status !== "completed" && part.state.status !== "error") throw new Error("Missing native tool result")
    return part
  })
  const memory = (sessionID: SessionID) => ClaudeHostMemory.read({ sessionID, pending: [], grants: [] })
  return { sessions, todo, chat, user, make, native, memory }
})

for (const mode of ["revert", "fork"] as const)
  for (const last of ["surviving", "empty-list", "deleted", "missing-get"] as const)
    for (const start of last === "surviving" || last === "empty-list"
      ? ["TaskCreate", "TaskUpdate", "TaskList", "TaskGet"] : ["TaskCreate"])
    it.instance(`${mode}: ${start} before C preserves ${last} native tasks and cold compact context`, () =>
      Effect.gen(function* () {
        const f = yield* setup()
        const u1 = yield* f.user(f.chat.id)
        const first = f.make(u1)
        yield* f.native(first, "TaskCreate", { subject, description: "Keep every character", activeForm: "Reading 完整🙂" },
          { task: { id: "native-A-17", subject } })
        yield* f.native(first, "TaskUpdate", { taskId: "native-A-17", status: "in_progress" },
          { success: true, taskId: "native-A-17", updatedFields: ["status"], statusChange: { from: "pending", to: "in_progress" } })
        if (last === "empty-list") yield* f.native(first, "TaskList", {}, { tasks: [] })
        if (last === "deleted") yield* f.native(first, "TaskUpdate", { taskId: "native-A-17", status: "deleted" },
          { success: true, taskId: "native-A-17", updatedFields: ["status"] })
        if (last === "missing-get") yield* f.native(first, "TaskGet", { taskId: "native-A-17" }, { task: null })
        yield* first.finish(0)
        const u2 = yield* f.user(f.chat.id)
        const later = f.make(u2)
        yield* f.native(later, "TaskCreate", { subject: "B-EXCLUDED", description: "After U2" },
          { task: { id: "native-B-29", subject: "B-EXCLUDED" } })
        yield* later.finish(0)
        expect((yield* f.sessions.get(f.chat.id)).metadata?.claudeCode?.todoTasks).toMatchObject({
          "native-B-29": { content: "B-EXCLUDED", status: "pending" },
        })
        expect(yield* f.memory(f.chat.id)).toContain("B-EXCLUDED")
        const revert = yield* SessionRevert.Service
        const target = mode === "fork"
          ? yield* f.sessions.fork({ sessionID: f.chat.id, messageID: u2.id })
          : yield* revert.revert({ sessionID: f.chat.id, messageID: u2.id })
        // Check the real reader while the revert is still pending; cleanup then physically removes its suffix.
        const before = yield* f.memory(target.id)
        expect(before ?? "").not.toContain("B-EXCLUDED")
        if (last === "surviving") expect(before).toContain("A-survives-完整🙂")
        if (last !== "surviving") expect(before ?? "").not.toContain("A-survives-完整🙂")
        if (mode === "revert") yield* revert.cleanup(target)
        // Lifecycle metadata still carries B; the producer must ignore it even after the active cut clears.
        expect((yield* f.sessions.get(target.id)).metadata?.claudeCode?.todoTasks).toHaveProperty("native-B-29")
        const cold = f.make(yield* f.user(target.id))
        if (start === "TaskUpdate") yield* f.native(cold, start, { taskId: "native-A-17" },
          { success: true, taskId: "native-A-17", updatedFields: [] })
        if (start === "TaskList") yield* f.native(cold, start, {}, { tasks: last === "surviving"
          ? [{ id: "native-A-17", subject, status: "in_progress", blockedBy: [] }] : [] })
        if (start === "TaskGet") yield* f.native(cold, start, { taskId: "native-A-17" }, { task: last === "surviving"
          ? { id: "native-A-17", subject, status: "in_progress", description: "", blocks: [], blockedBy: [] } : null })
        if (start !== "TaskCreate") {
          expect((yield* f.sessions.get(target.id)).metadata?.claudeCode?.todoTasks).not.toHaveProperty("native-B-29")
          expect((yield* f.memory(target.id)) ?? "").not.toContain("B-EXCLUDED")
        }
        const created = yield* f.native(cold, "TaskCreate", { subject: "C-POST-CUT", description: "Fresh native receipt" },
          { task: { id: "native-C-43", subject: "C-POST-CUT" } })
        const kept = last === "surviving"
          ? [{ content: subject, status: "in_progress", priority: "medium", activeForm: "Reading 完整🙂" }] : []
        expect(yield* f.todo.get(target.id)).toEqual([...kept.map((task) => ({ content: task.content, status: task.status, priority: task.priority })),
          { content: "C-POST-CUT", status: "pending", priority: "medium" }])
        if (created.state.status !== "completed") throw new Error("TaskCreate did not complete")
        expect(created.state.metadata.todos).toEqual([...kept, { content: "C-POST-CUT", status: "pending", priority: "medium" }])
        expect(created.state.metadata.claudeCodeTodo).toMatchObject({ schema: "native-task-snapshot-v1", name: "TaskCreate",
          result: { task: { id: "native-C-43", subject: "C-POST-CUT" } }, tasks: [
            ...(last === "surviving" ? [{ id: "native-A-17", subject, status: "in_progress", activeForm: "Reading 完整🙂" }] : []),
            { id: "native-C-43", subject: "C-POST-CUT", status: "pending" },
          ] })
        const saved = (yield* f.sessions.get(target.id)).metadata?.claudeCode?.todoTasks
        expect(saved).not.toHaveProperty("native-B-29")
        expect(saved).toHaveProperty("native-C-43")
        if (last === "surviving") expect(saved).toHaveProperty("native-A-17")
        if (last !== "surviving") expect(saved).not.toHaveProperty("native-A-17")
        const context = yield* f.memory(target.id)
        expect(context).toContain("C-POST-CUT")
        expect(context).not.toContain("B-EXCLUDED")
        if (last === "surviving") expect(context).toContain(JSON.stringify(subject))
        yield* cold.finish(0)
        // A second cold producer must address the actual surviving native ID, not a subject-derived ID.
        if (last === "surviving") {
          const next = f.make(yield* f.user(target.id))
          yield* f.native(next, "TaskUpdate", { taskId: "native-A-17", subject: `${subject} renamed`, status: "pending" },
            { success: true, taskId: "native-A-17", updatedFields: ["subject", "status"] })
          expect((yield* f.sessions.get(target.id)).metadata?.claudeCode?.todoTasks).toMatchObject({
            "native-A-17": { content: `${subject} renamed`, status: "pending" }, "native-C-43": { content: "C-POST-CUT" },
          })
          expect(yield* f.memory(target.id)).not.toContain("B-EXCLUDED")
          yield* next.finish(0)
        }
        if (mode === "fork") expect((yield* f.sessions.get(f.chat.id)).metadata?.claudeCode?.todoTasks)
          .toHaveProperty("native-B-29")
      }))

it.instance("native result replay preserves empty lists, failed receipts and session isolation", () =>
  Effect.gen(function* () {
    const f = yield* setup()
    const root = f.make(yield* f.user(f.chat.id))
    yield* f.native(root, "TaskCreate", { subject: "Root", description: "" }, { task: { id: "same-ID", subject: "Root" } })
    const child = yield* f.sessions.create({ parentID: f.chat.id, title: "Child" })
    const mirror = f.make(yield* f.user(child.id))
    yield* f.native(mirror, "TaskCreate", { subject: "Child", description: "" }, { task: { id: "same-ID", subject: "Child" } })
    yield* f.native(mirror, "TaskUpdate", { taskId: "same-ID", status: "completed" },
      { success: false, taskId: "same-ID", updatedFields: [], error: "not changed" })
    yield* f.native(mirror, "TaskUpdate", { taskId: "same-ID", subject: "Unacknowledged" },
      { success: true, taskId: "same-ID", updatedFields: [] })
    const failed = yield* f.native(mirror, "TaskList", {}, { tasks: [] }, true)
    if (failed.state.status !== "error") throw new Error("Failed native TaskList did not retain its error")
    expect(failed.state.metadata?.claudeCodeTodo).toBeUndefined()
    expect(yield* f.todo.get(child.id)).toEqual([{ content: "Child", status: "pending", priority: "medium" }])
    yield* f.native(mirror, "TaskList", {}, { tasks: [] })
    yield* mirror.finish(0)
    const cold = f.make(yield* f.user(child.id))
    yield* f.native(cold, "TaskCreate", { subject: "Fresh child", description: "" }, { task: { id: "new-ID", subject: "Fresh child" } })
    expect(yield* f.todo.get(child.id)).toEqual([{ content: "Fresh child", status: "pending", priority: "medium" }])
    expect(yield* f.todo.get(f.chat.id)).toEqual([{ content: "Root", status: "pending", priority: "medium" }])
    yield* root.finish(0)
    yield* cold.finish(0)
  }))

it.instance("native receipts replay in completion order rather than parallel call declaration order", () => Effect.gen(function* () {
  const f = yield* setup()
  const mirror = f.make(yield* f.user(f.chat.id))
  yield* mirror.on(assistant([
    { type: "tool_use", id: "list-first", name: "TaskList", input: {} },
    { type: "tool_use", id: "create-second", name: "TaskCreate", input: { subject: "CLEARED", description: "" } },
  ]))
  yield* mirror.on(result("create-second", { task: { id: "cleared-ID", subject: "CLEARED" } }))
  yield* mirror.on(result("list-first", { tasks: [] }))
  expect(yield* f.todo.get(f.chat.id)).toEqual([])
  yield* mirror.finish(0)
  const cold = f.make(yield* f.user(f.chat.id))
  yield* f.native(cold, "TaskCreate", { subject: "LATEST", description: "" }, { task: { id: "latest-ID", subject: "LATEST" } })
  expect(yield* f.todo.get(f.chat.id)).toEqual([{ content: "LATEST", status: "pending", priority: "medium" }])
  expect((yield* f.sessions.get(f.chat.id)).metadata?.claudeCode?.todoTasks).not.toHaveProperty("cleared-ID")
  yield* cold.finish(0)
}))

it.instance("legacy aggregate and plain output cannot invent native task identity", () => Effect.gen(function* () {
  const f = yield* setup()
  yield* f.sessions.setMetadata({ sessionID: f.chat.id, metadata: { claudeCode: { todoTasks: {
    guessed: { content: "UNPROVEN", status: "pending", priority: "medium" },
  } } } })
  const mirror = f.make(yield* f.user(f.chat.id))
  yield* f.native(mirror, "TaskCreate", { subject: "MODEL-TEXT-ONLY", description: "" }, "Task #guessed created")
  yield* f.native(mirror, "TaskGet", { taskId: "real-ID" },
    { task: { id: "real-ID", subject: "TRUSTED-GET", status: "in_progress", description: "", blocks: [], blockedBy: [] } })
  expect(yield* f.todo.get(f.chat.id)).toEqual([{ content: "TRUSTED-GET", status: "in_progress", priority: "medium" }])
  expect((yield* f.sessions.get(f.chat.id)).metadata?.claudeCode?.todoTasks).toEqual({
    "real-ID": { content: "TRUSTED-GET", status: "in_progress", priority: "medium" },
  })
  yield* mirror.finish(0)
}))
