import { expect } from "bun:test"
import { Effect } from "effect"
import { ClaudeHostMemory } from "@/claude-code/host/memory"
import { ClaudeHostTodos } from "@/claude-code/host/todos"
import { SessionRevert } from "@/session/revert"
import { it, setup, assistant, result, subject } from "./todo-fixture"

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
        const causal = ClaudeHostTodos.latest(yield* ClaudeHostMemory.retained(target.id))
        if (causal?.status !== "known") throw new Error("Missing current native task snapshot")
        expect(causal?.part.id).toBe(created.id)
        expect(causal?.todos).toEqual(created.state.metadata.todos)
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
  const empty = ClaudeHostTodos.latest(yield* ClaudeHostMemory.retained(f.chat.id))
  if (empty?.status !== "known") throw new Error("Missing current empty native snapshot")
  expect(empty?.part.callID).toBe("list-first")
  expect(empty?.snapshot.order).toBe(2)
  expect(empty?.todos).toEqual([])
  expect(yield* f.memory(f.chat.id)).toBeUndefined()
  yield* mirror.finish(0)
  const cold = f.make(yield* f.user(f.chat.id))
  yield* f.native(cold, "TodoWrite", { todos: [{ content: "EMPTY-MUST-WIN", status: "pending" }] },
    { newTodos: [{ content: "EMPTY-MUST-WIN", status: "pending" }] })
  expect(yield* f.memory(f.chat.id)).toBeUndefined()
  yield* f.native(cold, "TaskCreate", { subject: "LATEST", description: "" }, { task: { id: "latest-ID", subject: "LATEST" } })
  expect(yield* f.todo.get(f.chat.id)).toEqual([{ content: "LATEST", status: "pending", priority: "medium" }])
  expect((yield* f.sessions.get(f.chat.id)).metadata?.claudeCode?.todoTasks).not.toHaveProperty("cleared-ID")
  yield* cold.finish(0)
}))

it.instance("retained A declared before B but completed after B wins causal selection and compact context", () => Effect.gen(function* () {
  const f = yield* setup()
  const mirror = f.make(yield* f.user(f.chat.id))
  yield* mirror.on(assistant([
    { type: "tool_use", id: "A-first", name: "TaskCreate", input: { subject: "PARALLEL-A", description: "" } },
    { type: "tool_use", id: "B-second", name: "TaskCreate", input: { subject: "PARALLEL-B", description: "" } },
  ]))
  yield* mirror.on(result("B-second", { task: { id: "native-B", subject: "PARALLEL-B" } }))
  yield* mirror.on(result("A-first", { task: { id: "native-A", subject: "PARALLEL-A" } }))
  const retained = yield* ClaudeHostMemory.retained(f.chat.id)
  expect(retained.history.flatMap((message) => message.parts).filter((part) => part.type === "tool").map((part) => part.callID))
    .toEqual(["A-first", "B-second"])
  const latest = ClaudeHostTodos.latest(retained)
  if (latest?.status !== "known") throw new Error("Missing current parallel native snapshot")
  expect(latest?.part.callID).toBe("A-first")
  expect(latest?.snapshot.order).toBe(2)
  expect(latest?.snapshot.tasks.map((task) => task.id)).toEqual(["native-B", "native-A"])
  const context = yield* f.memory(f.chat.id)
  expect(context).toContain("PARALLEL-A")
  expect(context).toContain("PARALLEL-B")
  yield* mirror.finish(0)
  const cold = f.make(yield* f.user(f.chat.id))
  yield* f.native(cold, "TodoWrite", { todos: [{ content: "LEGACY-ORDINARY", status: "pending" }] },
    { newTodos: [{ content: "LEGACY-ORDINARY", status: "pending" }] })
  expect(yield* f.memory(f.chat.id)).toEqual(context)
  yield* cold.finish(0)
}))

it.instance("ordinary TodoWrite remains a real compact fallback without native receipts", () => Effect.gen(function* () {
  const f = yield* setup()
  const mirror = f.make(yield* f.user(f.chat.id))
  yield* f.native(mirror, "TodoWrite", { todos: [{ content: "ORDINARY-FALLBACK", status: "pending" }] },
    { newTodos: [{ content: "ORDINARY-FALLBACK", status: "pending" }] })
  expect(ClaudeHostTodos.latest(yield* ClaudeHostMemory.retained(f.chat.id))).toBeUndefined()
  expect(yield* f.memory(f.chat.id)).toContain("ORDINARY-FALLBACK")
  yield* mirror.finish(0)
}))

for (const invalid of ["unknown", "nonintegral", "duplicate", "reversed", "snapshot"] as const)
  it.instance(`retained ${invalid} native receipt evidence fails named in both reader and producer`, () => Effect.gen(function* () {
    const f = yield* setup()
    const mirror = f.make(yield* f.user(f.chat.id))
    const a = yield* f.native(mirror, "TaskCreate", { subject: "CONTROL-A", description: "" },
      { task: { id: "native-A", subject: "CONTROL-A" } })
    const b = yield* f.native(mirror, "TaskCreate", { subject: "CONTROL-B", description: "" },
      { task: { id: "native-B", subject: "CONTROL-B" } })
    if (a.state.status !== "completed" || b.state.status !== "completed") throw new Error("Missing successful native controls")
    expect(yield* f.memory(f.chat.id)).toContain("CONTROL-A")
    const receipt = ClaudeHostTodos.latest(yield* ClaudeHostMemory.retained(f.chat.id))
    if (receipt?.status !== "known") throw new Error("Missing validated native control")
    if (invalid === "reversed") yield* f.sessions.updatePart({ ...a, state: { ...a.state, metadata: {
      ...a.state.metadata, claudeCodeTodo: { ...a.state.metadata.claudeCodeTodo, order: 2 },
    } } })
    yield* f.sessions.updatePart({ ...b, state: { ...b.state, metadata: { ...b.state.metadata, claudeCodeTodo: {
      ...receipt.snapshot,
      ...(invalid === "unknown" ? { order: "unknown" } : invalid === "nonintegral" ? { order: 1.5 }
        : invalid === "duplicate" || invalid === "reversed" ? { order: 1 }
        : { tasks: [{ id: "invented", subject: "CONTROL-B", status: "pending" }] }),
    } } } })
    const code = invalid === "unknown" ? "NATIVE_TODO_RECEIPT_INVALID"
      : invalid === "nonintegral" ? "NATIVE_TODO_ORDER_UNPROVABLE"
      : invalid === "duplicate" ? "NATIVE_TODO_ORDER_CONFLICT" : "NATIVE_TODO_SNAPSHOT_CONFLICT"
    const view = yield* ClaudeHostMemory.retained(f.chat.id)
    expect(() => ClaudeHostTodos.latest(view)).toThrow(code)
    expect(String(yield* f.memory(f.chat.id).pipe(Effect.exit))).toContain(code)
    expect(String(yield* ClaudeHostTodos.update({ sessionID: f.chat.id, sessions: f.sessions, name: "TaskCreate", part: b,
      args: { subject: "NEW", description: "" }, result: { task: { id: "native-new", subject: "NEW" } } }).pipe(Effect.exit)))
      .toContain(code)
    yield* mirror.finish(0)
  }))
