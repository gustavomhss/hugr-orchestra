import { afterEach, expect } from "bun:test"
import type { HookJSONOutput } from "@anthropic-ai/claude-agent-sdk"
import { Effect } from "effect"
import { ClaudeHostMemory } from "@/claude-code/host/memory"
import { ClaudeHostMirror } from "@/claude-code/host/mirror"
import { ClaudeHostTodos } from "@/claude-code/host/todos"
import { PartID } from "@/session/schema"
import { disposeAllInstances } from "../../fixture/fixture"
import { CompactionFixture } from "./compaction-fixture"

afterEach(disposeAllInstances)

function memory(output: HookJSONOutput) {
  if (!("hookSpecificOutput" in output) || output.hookSpecificOutput?.hookEventName !== "SessionStart")
    return undefined
  return output.hookSpecificOutput.additionalContext
}

CompactionFixture.it.instance("an empty native receipt overrides later ordinary and side todos across a cold reopen", () =>
  Effect.gen(function* () {
    const f = yield* CompactionFixture.make()
    if (!f.assistant) throw new Error("Missing native todo fixture")
    yield* f.todos.update({ sessionID: f.chat.id, todos: [{ content: "SIDE-TODO-FUTURE", status: "pending", priority: "high" }] })
    const subject = `${"native subject ".repeat(500)}NATIVE-TODO-KEPT 🦴\r\nexact trailing blanks  `
    const kept = yield* f.taskList([{ id: "EXACT-NATIVE-ID", subject, status: "pending" }])
    expect(ClaudeHostTodos.latest(yield* ClaudeHostMemory.retained(f.chat.id))).toMatchObject({ status: "known", order: 1,
      part: { id: kept.id }, snapshot: { tasks: [{ id: "EXACT-NATIVE-ID", subject, status: "pending" }] } })
    const native = memory(yield* f.compact())
    expect(native).toContain(JSON.stringify(subject))
    expect(native).not.toContain("SIDE-TODO-FUTURE")
    yield* f.sessions.updatePart({ id: PartID.ascending(), sessionID: f.chat.id, messageID: f.assistant.id,
      type: "tool", tool: "todowrite", callID: "empty-task-snapshot", state: { status: "completed", input: {}, output: "cleared",
        title: "Todos", metadata: { todos: [] }, time: { start: 3, end: 4 } } })
    expect(memory(yield* f.compact())).toBe(native)
    const empty = yield* f.taskList([])
    const later = yield* f.nextUser()
    const after = yield* f.nextAssistant(later)
    // A later ordinary snapshot and aggregate cannot resurrect state cleared by the native receipt.
    yield* f.sessions.updatePart({ id: PartID.ascending(), sessionID: f.chat.id, messageID: after.id,
      type: "tool", tool: "todowrite", callID: "ordinary-resurrection", state: { status: "completed", input: {}, output: "saved",
        title: "Todos", metadata: { todos: [{ content: "ORDINARY-RESURRECTION", status: "pending", priority: "high" }] },
        time: { start: after.time.created, end: after.time.completed ?? after.time.created } } })
    yield* f.todos.update({ sessionID: f.chat.id, todos: [{ content: "SIDE-RESURRECTION", status: "pending", priority: "high" }] })
    expect(ClaudeHostTodos.latest(yield* ClaudeHostMemory.retained(f.chat.id))).toMatchObject({ status: "known", order: 2,
      part: { id: empty.id }, snapshot: { name: "TaskList", result: { tasks: [] }, tasks: [] }, todos: [] })
    expect(yield* f.compact()).toEqual({})
    const reopened = yield* CompactionFixture.make({ sessionID: f.chat.id })
    expect(yield* reopened.compact()).toEqual({})
  }))

CompactionFixture.it.instance("compact native records retain full task fields across cold updates and withhold historical state across a gap", () =>
  Effect.gen(function* () {
    const f = yield* CompactionFixture.make()
    if (!f.assistant) throw new Error("Missing native record producer")
    const author = f.assistant
    const task = { id: "EXACT-NATIVE-ID", subject: "NATIVE-TODO-KEPT 🦴\r\nexact trailing blanks  ", status: "pending" }
    yield* f.taskList([task, { id: "FINISHED-ID", subject: "FINISHED-NATIVE", status: "completed" },
      { id: "CANCELLED-ID", subject: "CANCELLED-NATIVE", status: "cancelled" }])
    expect(memory(yield* f.compact())).toContain("EXACT-NATIVE-ID")
    const reopened = yield* CompactionFixture.make({ sessionID: f.chat.id })
    // Every call invokes the actual stateless producer over durable history, including cold updates and unavailable receipts.
    const record = Effect.fnUntraced(function* (name: "TaskUpdate" | "TaskGet", args: Record<string, unknown>, result: unknown) {
      const part = yield* f.sessions.updatePart({ id: PartID.ascending(), sessionID: f.chat.id, messageID: author.id,
        type: "tool", tool: ClaudeHostMirror.toolName(name), callID: crypto.randomUUID(),
        metadata: { providerExecuted: true, claudeCodeTool: name }, state: { status: "completed", input: args,
          output: "native structured result", title: "Tasks", metadata: {}, time: { start: 1, end: 2 } } })
      const native = yield* ClaudeHostTodos.update({ sessionID: f.chat.id, sessions: f.sessions, name, args, result, part })
      if (!native || part.state.status !== "completed") throw new Error("Missing native producer receipt")
      yield* f.sessions.updatePart({ ...part, state: { ...part.state, input: { ...args, todos: native.todos },
        metadata: { todos: native.todos, claudeCodeTodo: native.receipt } } })
      yield* f.todos.update({ sessionID: f.chat.id, todos: native.todos })
    })
    const activeForm = "Inspecting 🦴\r\nexact trailing blanks  "
    yield* record("TaskUpdate", { taskId: task.id, status: "in_progress", activeForm },
      { success: true, taskId: task.id, updatedFields: ["status", "activeForm"] })
    const before = yield* f.sessions.messages({ sessionID: f.chat.id })
    const known = ClaudeHostTodos.latest(yield* ClaudeHostMemory.retained(f.chat.id))
    if (known?.status !== "known") throw new Error("Missing known native record")
    const text = memory(yield* reopened.compact())
    expect(text).toContain(JSON.stringify({ status: "known", coverage: "task-list", order: known.order,
      locator: known.locator, task: { ...task, status: "in_progress", activeForm } }))
    expect(text?.split("## Todos\n")[1]?.split("\n\n")[0]).toBe(JSON.stringify({ content: task.subject,
      status: "in_progress", priority: "medium", activeForm }))
    expect(text).not.toContain("FINISHED-ID")
    expect(text).not.toContain("CANCELLED-ID")
    expect(memory(yield* f.compact())).toBe(text)
    expect(yield* f.sessions.messages({ sessionID: f.chat.id })).toEqual(before)
    yield* record("TaskGet", { taskId: task.id }, undefined)
    const gap = ClaudeHostTodos.latest(yield* ClaudeHostMemory.retained(f.chat.id))
    expect(gap).toMatchObject({ status: "unavailable", historical: { snapshot: known.snapshot } })
    const withheld = yield* f.sessions.messages({ sessionID: f.chat.id })
    const unavailable = memory(yield* reopened.compact())
    expect(unavailable).toContain("NATIVE_TODO_STRUCTURED_RESULT_MISSING")
    expect(unavailable).not.toContain("Native task records")
    expect(unavailable).not.toContain(task.id)
    expect(unavailable).not.toContain("NATIVE-TODO-KEPT")
    expect(yield* f.sessions.messages({ sessionID: f.chat.id })).toEqual(withheld)
    yield* record("TaskGet", { taskId: task.id }, { task })
    const partial = memory(yield* reopened.compact())
    expect(partial).toContain('"coverage":"observed-tasks"')
    expect(partial).toContain(JSON.stringify(task))
    expect(partial).toContain("remaining task inventory is unproven")
  }))

CompactionFixture.it.instance("legacy native projection refuses explicitly instead of recovering task IDs from an aggregate", () =>
  Effect.gen(function* () {
    const f = yield* CompactionFixture.make()
    if (!f.assistant) throw new Error("Missing native todo fixture")
    yield* f.todos.update({ sessionID: f.chat.id, todos: [{ content: "SIDE-TODO-FUTURE", status: "pending", priority: "high" }] })
    const legacy = yield* f.sessions.updatePart({ id: PartID.ascending(), sessionID: f.chat.id, messageID: f.assistant.id,
      type: "tool", tool: "TaskList", callID: "native-task-list", metadata: { providerExecuted: true, claudeCodeTool: "TaskList" },
      state: { status: "completed", input: {}, output: "native task snapshot", title: "Tasks",
        metadata: { todos: [{ id: "EXACT-NATIVE-ID", content: "NATIVE-TODO-KEPT", status: "pending", priority: "high" }] },
        time: { start: 1, end: 2 } } })
    const before = yield* f.sessions.messages({ sessionID: f.chat.id })
    const output = yield* f.compact()
    expect(output).toMatchObject({ continue: false, stopReason: expect.stringContaining("NATIVE_TODO_RECEIPT_UNAVAILABLE") })
    expect(JSON.stringify(output)).toContain(legacy.messageID)
    expect(JSON.stringify(output)).toContain(legacy.id)
    expect(JSON.stringify(output)).not.toContain("NATIVE-TODO-KEPT")
    expect(JSON.stringify(output)).not.toContain("SIDE-TODO-FUTURE")
    expect(f.ctx.abort.signal.aborted).toBe(true)
    expect(yield* f.sessions.messages({ sessionID: f.chat.id })).toEqual(before)
  }))
