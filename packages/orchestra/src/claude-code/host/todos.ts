export * as ClaudeHostTodos from "./todos"

import { Effect, Schema } from "effect"
import type { SessionV1 } from "@orchestra/core/v1/session"
import type { Session } from "@/session/session"
import type { PartID, SessionID } from "@/session/schema"
import { ClaudeCodeTranscript } from "../transcript"
import { ClaudeHostBoundary } from "./boundary"

export const TOOLS = ["TaskCreate", "TaskUpdate", "TaskGet", "TaskList"]

const Task = Schema.Struct({ id: Schema.String, subject: Schema.String, status: Schema.String,
  activeForm: Schema.optional(Schema.String) })
const Snapshot = Schema.Struct({ schema: Schema.Literal("native-task-snapshot-v1"), order: Schema.Number,
  name: Schema.Literals(["TaskCreate", "TaskUpdate", "TaskGet", "TaskList"]),
  args: Schema.Record(Schema.String, Schema.Unknown), result: Schema.Record(Schema.String, Schema.Unknown),
  tasks: Schema.Array(Task) })
const Unavailable = Schema.Struct({ schema: Schema.Literal("native-task-unavailable-v1"), order: Schema.Number,
  name: Schema.Literals(["TaskCreate", "TaskUpdate", "TaskGet", "TaskList"]),
  reason: Schema.Literals(["NATIVE_TODO_STRUCTURED_RESULT_MISSING", "NATIVE_TODO_RESULT_UNCORRELATED",
    "NATIVE_TODO_STRUCTURED_RESULT_INVALID", "NATIVE_TODO_PRIOR_RECEIPT_UNAVAILABLE"]),
  locator: Schema.Struct({ sessionID: Schema.String, messageID: Schema.String, partID: Schema.String, callID: Schema.String }) })
const Receipt = Schema.Union([Snapshot, Unavailable])

export class InvalidNativeTodoReceipt extends Error {
  override readonly name = "InvalidNativeTodoReceipt"
}

/** One causal selector for readers and producers; transcript call position is not result order. */
export function latest(view: ClaudeHostBoundary.Retained) {
  const receipts = view.history.flatMap((message) => message.parts).flatMap((part) => {
    if (part.type !== "tool" || part.state.status !== "completed" ||
      part.tool !== "todowrite" && !TOOLS.includes(part.tool)) return []
    if (part.state.metadata.claudeCodeTodo === undefined) {
      if (typeof part.metadata?.claudeCodeTool === "string" && TOOLS.includes(part.metadata.claudeCodeTool) || TOOLS.includes(part.tool))
        throw new InvalidNativeTodoReceipt(`NATIVE_TODO_RECEIPT_UNAVAILABLE ${JSON.stringify(locator(part))}`)
      return []
    }
    const saved = Schema.decodeUnknownOption(Receipt)(part.state.metadata.claudeCodeTodo)
    if (saved._tag === "None") throw new InvalidNativeTodoReceipt("NATIVE_TODO_RECEIPT_INVALID")
    if (part.metadata?.providerExecuted !== true || part.metadata?.claudeCodeTool !== saved.value.name)
      throw new InvalidNativeTodoReceipt("NATIVE_TODO_RECEIPT_OWNER_MISMATCH")
    if (!Number.isSafeInteger(saved.value.order) || saved.value.order <= 0)
      throw new InvalidNativeTodoReceipt("NATIVE_TODO_ORDER_UNPROVABLE")
    const snapshot = saved.value
    if (snapshot.schema === "native-task-unavailable-v1" && (snapshot.locator.callID !== part.callID ||
      snapshot.locator.sessionID === part.sessionID && (snapshot.locator.messageID !== part.messageID || snapshot.locator.partID !== part.id) ||
      snapshot.locator.sessionID !== part.sessionID && !ClaudeHostBoundary.origins(view, part.messageID).some((origin) =>
        origin.sessionID === snapshot.locator.sessionID && origin.messageID === snapshot.locator.messageID)))
      throw new InvalidNativeTodoReceipt("NATIVE_TODO_RECEIPT_OWNER_MISMATCH")
    return [{ part, snapshot: saved.value }]
  }).sort((a, b) => a.snapshot.order - b.snapshot.order)
  const orders = new Set<number>()
  const tasks = new Map<string, typeof Task.Type>()
  const state: { available: boolean; coverage: "retained-receipts" | "observed-tasks" | "task-list";
    historical?: { status: "historical"; locator: ReturnType<typeof locator>; snapshot: typeof Snapshot.Type } } = {
    available: true, coverage: "retained-receipts",
  }
  receipts.forEach((receipt) => {
    const snapshot = receipt.snapshot
    if (orders.has(snapshot.order)) throw new InvalidNativeTodoReceipt("NATIVE_TODO_ORDER_CONFLICT")
    orders.add(snapshot.order)
    if (snapshot.schema === "native-task-unavailable-v1") {
      state.available = false
      tasks.clear()
      return
    }
    if (!state.available && snapshot.name !== "TaskList" && snapshot.name !== "TaskGet")
      throw new InvalidNativeTodoReceipt("NATIVE_TODO_RECOVERY_UNPROVABLE")
    if (!apply(tasks, snapshot.name, snapshot.args, snapshot.result))
      throw new InvalidNativeTodoReceipt("NATIVE_TODO_RECEIPT_FAILED")
    const expected = [...tasks.values()]
    if (expected.length !== snapshot.tasks.length || expected.some((task, index) => {
      const saved = snapshot.tasks[index]
      return task.id !== saved.id || task.subject !== saved.subject || task.status !== saved.status || task.activeForm !== saved.activeForm
    })) throw new InvalidNativeTodoReceipt("NATIVE_TODO_SNAPSHOT_CONFLICT")
    state.coverage = snapshot.name === "TaskList" ? "task-list" : !state.available ? "observed-tasks" : state.coverage
    state.available = true
    state.historical = { status: "historical", locator: locator(receipt.part), snapshot }
  })
  const receipt = receipts.at(-1)
  if (!receipt) return
  if (receipt.snapshot.schema === "native-task-unavailable-v1") return { status: "unavailable" as const,
    order: receipt.snapshot.order, part: receipt.part, locator: locator(receipt.part), unavailable: receipt.snapshot, historical: state.historical }
  return { status: "known" as const, order: receipt.snapshot.order, part: receipt.part, snapshot: receipt.snapshot,
    locator: locator(receipt.part), coverage: state.coverage, todos: project(receipt.snapshot.tasks) }
}

/** Rebuild from retained native receipts, never from the uncut session aggregate or ID-less UI todos. */
export const update = Effect.fn("ClaudeHostTodos.update")(function* (input: {
  sessionID: SessionID
  sessions: Session.Interface
  name: string
  args: Record<string, unknown>
  result: unknown
  part: SessionV1.ToolPart
  /** Completed native parts in this same SDK result frame, awaiting their own receipt writes. */
  pending?: readonly PartID[]
  reason?: typeof Unavailable.Type["reason"]
  /** Main-session writes use the host's serialized metadata merge, shared with prompt admission and SDK receipts. */
  state?: (patch: Record<string, unknown>) => Effect.Effect<void>
}) {
  if (!TOOLS.includes(input.name)) return
  if (input.part.sessionID !== input.sessionID || input.part.state.status !== "completed" ||
    input.part.metadata?.providerExecuted !== true || input.part.metadata?.claudeCodeTool !== input.name)
    throw new InvalidNativeTodoReceipt("NATIVE_TODO_RECEIPT_OWNER_MISMATCH")
  if (!input.reason && input.name === "TaskUpdate" && ClaudeCodeTranscript.record(input.result) &&
    typeof input.args.taskId === "string" && input.result.taskId === input.args.taskId && (input.result.success === false || input.result.error)) return
  const session = yield* input.sessions.get(input.sessionID).pipe(Effect.orDie)
  const history = yield* input.sessions.messages({ sessionID: input.sessionID }).pipe(Effect.orDie)
  const view = ClaudeHostBoundary.retained(session, history)
  // The mirror has already persisted these completions, but has not written their individual receipts yet.
  const previous = latest({ ...view, history: view.history.map((message) => ({ ...message, parts: message.parts.filter((part) =>
    !(part.type === "tool" && part.state.status === "completed" && part.state.metadata.claudeCodeTodo === undefined &&
      (input.pending ?? [input.part.id]).includes(part.id))) })) })
  const tasks = new Map((previous?.status === "known" ? previous.snapshot.tasks : []).map((task) => [task.id, task] as const))
  const order = (previous?.order ?? 0) + 1
  if (!Number.isSafeInteger(order)) throw new InvalidNativeTodoReceipt("NATIVE_TODO_ORDER_UNPROVABLE")
  const reason = input.reason ?? (input.result === undefined || input.result === null
    ? "NATIVE_TODO_STRUCTURED_RESULT_MISSING" : !ClaudeCodeTranscript.record(input.result) || !apply(tasks, input.name, input.args, input.result)
      ? "NATIVE_TODO_STRUCTURED_RESULT_INVALID" : previous?.status === "unavailable" && input.name !== "TaskList" && input.name !== "TaskGet"
        ? "NATIVE_TODO_PRIOR_RECEIPT_UNAVAILABLE" : undefined)
  if (reason) return { status: "unavailable" as const, todos: [], receipt: {
    schema: "native-task-unavailable-v1", order, name: input.name, reason, locator: locator(input.part),
  } }
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
  return { status: "known" as const, todos, receipt: snapshot }
})

function locator(part: SessionV1.ToolPart) {
  return { sessionID: part.sessionID, messageID: part.messageID, partID: part.id, callID: part.callID }
}

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
    if (!task || name === "TaskCreate" && task.subject !== args.subject || name === "TaskGet" && task.id !== args.taskId) return false
    tasks.set(task.id, { ...task,
      ...(name === "TaskCreate" && typeof args.activeForm === "string" ? { activeForm: args.activeForm } : {}) })
    return true
  }
  if (name !== "TaskUpdate" || result.success !== true || typeof result.taskId !== "string" ||
    !result.taskId || result.taskId !== args.taskId || !Array.isArray(result.updatedFields)) return false
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
