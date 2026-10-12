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
  const evidence = ClaudeHostBoundary.retained(session, history).history.flatMap((message) => message.parts)
    .flatMap((part) => {
      if (part.type !== "tool" || part.state.status !== "completed" ||
        part.tool !== "todowrite" && !TOOLS.includes(part.tool)) return []
      const saved = Schema.decodeUnknownOption(Snapshot)(part.state.metadata.claudeCodeTodo)
      return saved._tag === "Some" && part.metadata?.providerExecuted === true &&
        part.metadata?.claudeCodeTool === saved.value.name && Number.isSafeInteger(saved.value.order) && saved.value.order > 0
        ? [saved.value] : []
    }).sort((a, b) => a.order - b.order)
  const tasks = new Map<string, typeof Task.Type>()
  // Replay results rather than snapshots: an aggregate is never proof of an individual native task.
  evidence.forEach((saved) => apply(tasks, saved.name, saved.args, saved.result))
  if (!apply(tasks, input.name, input.args, input.result)) return
  const snapshot = { schema: "native-task-snapshot-v1", order: (evidence.at(-1)?.order ?? 0) + 1,
    name: input.name, args: input.args, result: input.result, tasks: [...tasks.values()] }
  const saved = [...tasks.values()].map((task) => [task.id, {
    content: task.subject, status: task.status, priority: "medium",
    ...(task.activeForm !== undefined ? { activeForm: task.activeForm } : {}),
  }] as const)
  if (input.state) yield* input.state({ todoTasks: Object.fromEntries(saved) })
  if (!input.state) {
    // Child mirrors have no parent host writer. Preserve unrelated child metadata.
    const latest = yield* input.sessions.get(input.sessionID).pipe(Effect.orDie)
    yield* input.sessions.setMetadata({ sessionID: input.sessionID, metadata: { ...latest.metadata,
      claudeCode: { ...latest.metadata?.claudeCode, todoTasks: Object.fromEntries(saved) } } })
  }
  return { todos: saved.map((entry) => entry[1]), snapshot }
})

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
