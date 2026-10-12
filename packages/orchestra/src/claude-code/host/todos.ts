export * as ClaudeHostTodos from "./todos"

import { Effect, Schema } from "effect"
import type { Session } from "@/session/session"
import type { SessionID } from "@/session/schema"
import { ClaudeCodeTranscript } from "../transcript"
import { ClaudeHostBoundary } from "./boundary"

export const TOOLS = ["TaskCreate", "TaskUpdate", "TaskGet", "TaskList"]

const Task = Schema.Struct({ id: Schema.String, subject: Schema.String, status: Schema.String,
  activeForm: Schema.optional(Schema.String) })
const Snapshot = Schema.Struct({ schema: Schema.Literal("native-task-snapshot-v1"), order: Schema.Number,
  name: Schema.Literals(["TaskCreate", "TaskUpdate", "TaskGet", "TaskList"]),
  args: Schema.Record(Schema.String, Schema.Unknown), result: Schema.Record(Schema.String, Schema.Unknown),
  tasks: Schema.Array(Task) })

export class InvalidNativeTodoReceipt extends Error {
  override readonly name = "InvalidNativeTodoReceipt"
}

/** One causal selector for readers and producers; transcript call position is not result order. */
export function latest(view: ClaudeHostBoundary.Retained) {
  const receipts = view.history.flatMap((message) => message.parts).flatMap((part) => {
    if (part.type !== "tool" || part.state.status !== "completed" ||
      part.tool !== "todowrite" && !TOOLS.includes(part.tool) || part.state.metadata.claudeCodeTodo === undefined) return []
    const saved = Schema.decodeUnknownOption(Snapshot)(part.state.metadata.claudeCodeTodo)
    if (saved._tag === "None") throw new InvalidNativeTodoReceipt("NATIVE_TODO_RECEIPT_INVALID")
    if (part.metadata?.providerExecuted !== true || part.metadata?.claudeCodeTool !== saved.value.name)
      throw new InvalidNativeTodoReceipt("NATIVE_TODO_RECEIPT_OWNER_MISMATCH")
    if (!Number.isSafeInteger(saved.value.order) || saved.value.order <= 0)
      throw new InvalidNativeTodoReceipt("NATIVE_TODO_ORDER_UNPROVABLE")
    return [{ part, snapshot: saved.value }]
  }).sort((a, b) => a.snapshot.order - b.snapshot.order)
  const orders = new Set<number>()
  const tasks = new Map<string, typeof Task.Type>()
  receipts.forEach((receipt) => {
    if (orders.has(receipt.snapshot.order)) throw new InvalidNativeTodoReceipt("NATIVE_TODO_ORDER_CONFLICT")
    orders.add(receipt.snapshot.order)
    if (!apply(tasks, receipt.snapshot.name, receipt.snapshot.args, receipt.snapshot.result))
      throw new InvalidNativeTodoReceipt("NATIVE_TODO_RECEIPT_FAILED")
    const expected = [...tasks.values()]
    if (expected.length !== receipt.snapshot.tasks.length || expected.some((task, index) => {
      const saved = receipt.snapshot.tasks[index]
      return task.id !== saved.id || task.subject !== saved.subject || task.status !== saved.status || task.activeForm !== saved.activeForm
    })) throw new InvalidNativeTodoReceipt("NATIVE_TODO_SNAPSHOT_CONFLICT")
  })
  const receipt = receipts.at(-1)
  return receipt ? { ...receipt, todos: project(receipt.snapshot.tasks) } : undefined
}

/** Rebuild from retained native receipts, never from the uncut session aggregate or ID-less UI todos. */
export const update = Effect.fn("ClaudeHostTodos.update")(function* (input: {
  sessionID: SessionID
  sessions: Session.Interface
  name: string
  args: Record<string, unknown>
  result: unknown
  /** Main-session writes use the host's serialized metadata merge, shared with prompt admission and SDK receipts. */
  state?: (patch: Record<string, unknown>) => Effect.Effect<void>
}) {
  if (!TOOLS.includes(input.name) || !ClaudeCodeTranscript.record(input.result)) return
  if (input.result.success === false || input.result.error) return
  const session = yield* input.sessions.get(input.sessionID).pipe(Effect.orDie)
  const history = yield* input.sessions.messages({ sessionID: input.sessionID }).pipe(Effect.orDie)
  const previous = latest(ClaudeHostBoundary.retained(session, history))
  const tasks = new Map((previous?.snapshot.tasks ?? []).map((task) => [task.id, task] as const))
  if (!apply(tasks, input.name, input.args, input.result)) return
  const order = (previous?.snapshot.order ?? 0) + 1
  if (!Number.isSafeInteger(order)) throw new InvalidNativeTodoReceipt("NATIVE_TODO_ORDER_UNPROVABLE")
  const snapshot = { schema: "native-task-snapshot-v1", order,
    name: input.name, args: input.args, result: input.result, tasks: [...tasks.values()] }
  const todos = project(snapshot.tasks)
  const saved = Object.fromEntries(snapshot.tasks.map((task, index) => [task.id, todos[index]]))
  if (input.state) yield* input.state({ todoTasks: saved })
  if (!input.state) {
    // Child mirrors have no parent host writer. Preserve unrelated child metadata.
    const latest = yield* input.sessions.get(input.sessionID).pipe(Effect.orDie)
    yield* input.sessions.setMetadata({ sessionID: input.sessionID, metadata: { ...latest.metadata,
      claudeCode: { ...latest.metadata?.claudeCode, todoTasks: saved } } })
  }
  return { todos, snapshot }
})

function project(tasks: readonly (typeof Task.Type)[]) {
  return tasks.map((task) => ({ content: task.subject, status: task.status, priority: "medium",
    ...(task.activeForm !== undefined ? { activeForm: task.activeForm } : {}) }))
}

/** Only structured native success supplies identity; acknowledged fields supply changes. */
function apply(tasks: Map<string, typeof Task.Type>, name: string, args: Record<string, unknown>, result: Record<string, unknown>) {
  if (result.success === false || result.error) return false
  const read = (value: unknown) => {
    if (!ClaudeCodeTranscript.record(value) || typeof value.id !== "string" || !value.id ||
      typeof value.subject !== "string" || name !== "TaskCreate" && typeof value.status !== "string") return
    const previous = name === "TaskCreate" ? undefined : tasks.get(value.id)
    return { id: value.id, subject: value.subject,
      status: typeof value.status === "string" ? value.status : "pending",
      ...(previous?.activeForm !== undefined ? { activeForm: previous.activeForm } : {}) }
  }
  if (name === "TaskList") {
    if (!Array.isArray(result.tasks)) return false
    const listed = result.tasks.map(read)
    if (listed.some((task) => task === undefined)) return false
    tasks.clear()
    listed.forEach((task) => { if (task) tasks.set(task.id, task) })
    return true
  }
  if (name === "TaskGet" && result.task === null && typeof args.taskId === "string") {
    tasks.delete(args.taskId)
    return true
  }
  if (name === "TaskCreate" || name === "TaskGet") {
    const task = read(result.task)
    if (!task) return false
    tasks.set(task.id, { ...task,
      ...(name === "TaskCreate" && typeof args.activeForm === "string" ? { activeForm: args.activeForm } : {}) })
    return true
  }
  if (name !== "TaskUpdate" || result.success !== true || typeof result.taskId !== "string" ||
    !result.taskId || !Array.isArray(result.updatedFields)) return false
  const previous = tasks.get(result.taskId)
  const change = ClaudeCodeTranscript.record(result.statusChange) ? result.statusChange.to : undefined
  const status = typeof change === "string" ? change : result.updatedFields.includes("status") ? args.status : undefined
  if (status === "deleted") tasks.delete(result.taskId)
  if (previous && status !== "deleted") tasks.set(result.taskId, { ...previous,
    ...(result.updatedFields.includes("subject") && typeof args.subject === "string" ? { subject: args.subject } : {}),
    ...(result.updatedFields.includes("activeForm") && typeof args.activeForm === "string" ? { activeForm: args.activeForm } : {}),
    ...(typeof status === "string" ? { status } : {}) })
  return true
}
