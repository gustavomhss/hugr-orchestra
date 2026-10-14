import { expect } from "bun:test"
import { Effect } from "effect"
import { ClaudeHostMemory } from "@/claude-code/host/memory"
import { ClaudeHostTodos } from "@/claude-code/host/todos"
import { it, setup, assistant, result } from "./todo-fixture"

it.instance("legacy aggregate and plain output cannot invent native task identity", () => Effect.gen(function* () {
  const f = yield* setup()
  yield* f.sessions.setMetadata({ sessionID: f.chat.id, metadata: { claudeCode: { todoTasks: {
    guessed: { content: "UNPROVEN", status: "pending", priority: "medium" },
  } } } })
  yield* f.todo.update({ sessionID: f.chat.id, todos: [{ content: "UNPROVEN-TABLE", status: "pending", priority: "medium" }] })
  const mirror = f.make(yield* f.user(f.chat.id))
  yield* f.native(mirror, "TaskCreate", { subject: "MODEL-TEXT-ONLY", description: "" }, "Task #guessed created")
  expect(yield* f.memory(f.chat.id)).toContain('"status":"unavailable"')
  yield* f.native(mirror, "TaskGet", { taskId: "real-ID" },
    { task: { id: "real-ID", subject: "TRUSTED-GET", status: "in_progress", description: "", blocks: [], blockedBy: [] } })
  expect(yield* f.todo.get(f.chat.id)).toEqual([{ content: "TRUSTED-GET", status: "in_progress", priority: "medium" }])
  expect((yield* f.sessions.get(f.chat.id)).metadata?.claudeCode?.todoTasks).toEqual({
    "real-ID": { content: "TRUSTED-GET", status: "in_progress", priority: "medium" },
  })
  const recovered = ClaudeHostTodos.latest(yield* ClaudeHostMemory.retained(f.chat.id))
  if (recovered?.status !== "known") throw new Error("TaskGet did not restore known native state")
  expect(recovered.coverage).toBe("observed-tasks")
  expect(yield* f.memory(f.chat.id)).toContain("observed task IDs only")
  yield* mirror.finish(0)
}))

for (const prior of ["native", "ordinary", "none"] as const)
  it.instance(`${prior} evidence cannot become current across a successful native completion without its result`, () => Effect.gen(function* () {
    const f = yield* setup()
    const mirror = f.make(yield* f.user(f.chat.id))
    if (prior === "native") yield* f.native(mirror, "TaskCreate", { subject: "PENDING-A", description: "" },
      { task: { id: "native-A", subject: "PENDING-A" } })
    if (prior === "ordinary") yield* f.native(mirror, "TodoWrite", { todos: [{ content: "PENDING-A", status: "pending" }] },
      { newTodos: [{ content: "PENDING-A", status: "pending" }] })
    if (prior !== "none") expect(yield* f.memory(f.chat.id)).toContain("PENDING-A")
    const completed = yield* f.native(mirror, "TaskUpdate", { taskId: "native-A", status: "completed" }, undefined)
    if (completed.state.status !== "completed") throw new Error("Missing successful native completion")
    const unavailable = ClaudeHostTodos.latest(yield* ClaudeHostMemory.retained(f.chat.id))
    if (unavailable?.status !== "unavailable") throw new Error("Missing explicit unavailable native state")
    const locator = { sessionID: completed.sessionID, messageID: completed.messageID, partID: completed.id, callID: completed.callID }
    expect(completed.state.metadata.claudeCodeTodo).toEqual({ schema: "native-task-unavailable-v1",
      order: prior === "native" ? 2 : 1, name: "TaskUpdate", reason: "NATIVE_TODO_STRUCTURED_RESULT_MISSING", locator })
    expect(unavailable.locator).toEqual(locator)
    if (prior === "native") expect(unavailable.historical).toMatchObject({ status: "historical",
      snapshot: { tasks: [{ id: "native-A", subject: "PENDING-A", status: "pending" }] } })
    const context = yield* f.memory(f.chat.id)
    expect(context).toContain('"status":"unavailable"')
    expect(context).toContain("NATIVE_TODO_STRUCTURED_RESULT_MISSING")
    expect(context).toContain(completed.messageID)
    expect(context).toContain(completed.id)
    expect(context).not.toContain("PENDING-A")
    expect(yield* f.todo.get(f.chat.id)).toEqual([])
    yield* mirror.finish(0)
    const cold = f.make(yield* f.user(f.chat.id))
    const partial = yield* f.native(cold, "TaskCreate", { subject: "FRESH-C", description: "" },
      { task: { id: "native-C", subject: "FRESH-C" } })
    if (partial.state.status !== "completed") throw new Error("Missing successful incremental result")
    expect(partial.state.metadata.claudeCodeTodo).toMatchObject({ reason: "NATIVE_TODO_PRIOR_RECEIPT_UNAVAILABLE" })
    expect(yield* f.memory(f.chat.id)).not.toContain("FRESH-C")
    yield* f.native(cold, "TaskList", {}, { tasks: [
      { id: "native-A", subject: "PENDING-A", status: "completed", blockedBy: [] },
      { id: "native-C", subject: "FRESH-C", status: "pending", blockedBy: [] },
    ] })
    const recovered = ClaudeHostTodos.latest(yield* ClaudeHostMemory.retained(f.chat.id))
    if (recovered?.status !== "known") throw new Error("Correlated TaskList did not restore native state")
    expect(recovered.coverage).toBe("task-list")
    expect(recovered.snapshot.tasks).toEqual([
      { id: "native-A", subject: "PENDING-A", status: "completed" }, { id: "native-C", subject: "FRESH-C", status: "pending" },
    ])
    expect(yield* f.memory(f.chat.id)).toContain("FRESH-C")
    expect(yield* f.memory(f.chat.id)).not.toContain('"status":"unavailable"')
    expect(yield* f.memory(f.chat.id)).not.toContain("PENDING-A")
    yield* cold.finish(0)
  }))

for (const mode of ["crossed-update", "crossed-get", "batch"] as const)
  it.instance(`${mode} retains unavailable evidence on real native owners without inventing receipt identity`, () => Effect.gen(function* () {
    const f = yield* setup()
    const mirror = f.make(yield* f.user(f.chat.id))
    yield* f.native(mirror, "TaskCreate", { subject: "A-CONTROL", description: "" }, { task: { id: "native-A", subject: "A-CONTROL" } })
    yield* f.native(mirror, "TaskCreate", { subject: "B-CONTROL", description: "" }, { task: { id: "native-B", subject: "B-CONTROL" } })
    expect(yield* f.memory(f.chat.id)).toContain("A-CONTROL")
    if (mode === "crossed-update") yield* f.native(mirror, "TaskUpdate", { taskId: "native-B", status: "completed" },
      { success: true, taskId: "native-A", updatedFields: ["status"] })
    if (mode === "crossed-get") yield* f.native(mirror, "TaskGet", { taskId: "native-B" },
      { task: { id: "native-A", subject: "A-CONTROL", status: "completed" } })
    if (mode === "batch") {
      yield* mirror.on(assistant([
        { type: "tool_use", id: "complete-A", name: "TaskUpdate", input: { taskId: "native-A", status: "completed" } },
        { type: "tool_use", id: "complete-B", name: "TaskUpdate", input: { taskId: "native-B", status: "completed" } },
      ]))
      yield* mirror.on({ ...result("complete-A", { success: true, taskId: "native-A", updatedFields: ["status"] }),
        message: { role: "user", content: [
          { type: "tool_result", tool_use_id: "complete-A", content: "completed", is_error: false },
          { type: "tool_result", tool_use_id: "complete-B", content: "completed", is_error: false },
        ] } })
      for (const callID of ["complete-A", "complete-B"]) {
        const part = mirror.tool(callID)
        if (part?.state.status !== "completed") throw new Error("Missing genuine batched native owner")
        expect(part.state.metadata.claudeCodeTodo).toMatchObject({ schema: "native-task-unavailable-v1",
          reason: "NATIVE_TODO_RESULT_UNCORRELATED", locator: { sessionID: part.sessionID, messageID: part.messageID, partID: part.id, callID } })
        expect(part.state.metadata.claudeCodeTodo).not.toHaveProperty("result")
        expect(part.state.metadata.claudeCodeTodo).not.toHaveProperty("tasks")
      }
    }
    const current = ClaudeHostTodos.latest(yield* ClaudeHostMemory.retained(f.chat.id))
    if (current?.status !== "unavailable") throw new Error("Uncorrelatable receipt was presented as current native state")
    expect(current.order).toBe(mode === "batch" ? 4 : 3)
    expect(current.unavailable.reason).toBe(mode === "batch" ? "NATIVE_TODO_RESULT_UNCORRELATED" : "NATIVE_TODO_STRUCTURED_RESULT_INVALID")
    expect(yield* f.memory(f.chat.id)).toContain('"status":"unavailable"')
    expect(yield* f.memory(f.chat.id)).not.toContain("A-CONTROL")
    expect(yield* f.memory(f.chat.id)).not.toContain("B-CONTROL")
    yield* mirror.finish(0)
  }))
