export * as ClaudeHostTodos from "./todos"

import { Effect } from "effect"
import type { Session } from "@/session/session"
import type { SessionID } from "@/session/schema"
import { ClaudeCodeTranscript } from "../transcript"

export const TOOLS = ["TaskCreate", "TaskUpdate", "TaskGet", "TaskList"]

/** Native task IDs survive idle release and server restart in session metadata, separately for each seat's session. */
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
  const result = input.result
  if (result.success === false || result.error) return
  const session = yield* input.sessions.get(input.sessionID).pipe(Effect.orDie)
  const host = session.metadata?.claudeCode ?? {}
  const saved = ClaudeCodeTranscript.record(host.todoTasks) ? host.todoTasks : {}
  const tasks = new Map(Object.entries(saved).flatMap(([id, task]) =>
    ClaudeCodeTranscript.record(task) && typeof task.content === "string" && typeof task.status === "string"
      ? [[id, { content: task.content, status: task.status, priority: "medium",
        ...(typeof task.activeForm === "string" ? { activeForm: task.activeForm } : {}) }] as const] : []))
  const read = (task: unknown) => {
    if (!ClaudeCodeTranscript.record(task) || typeof task.id !== "string" || typeof task.subject !== "string") return
    const previous = tasks.get(task.id)
    tasks.set(task.id, { content: task.subject, status: typeof task.status === "string" ? task.status : previous?.status ?? "pending",
      priority: "medium", ...(previous?.activeForm ? { activeForm: previous.activeForm } : {}) })
    return task.id
  }
  if (input.name === "TaskList" && Array.isArray(result.tasks)) {
    const ids = new Set(result.tasks.map(read).filter((id) => id !== undefined))
    for (const id of tasks.keys()) if (!ids.has(id)) tasks.delete(id)
  }
  if (input.name === "TaskGet") {
    read(result.task)
    if (result.task === null && typeof input.args.taskId === "string") tasks.delete(input.args.taskId)
  }
  if (input.name === "TaskCreate") {
    const id = read(result.task)
    if (id && typeof input.args.activeForm === "string") tasks.set(id, { ...tasks.get(id)!, activeForm: input.args.activeForm })
  }
  if (input.name === "TaskUpdate" && result.success === true && typeof result.taskId === "string") {
    const previous = tasks.get(result.taskId)
    const change = ClaudeCodeTranscript.record(result.statusChange) ? result.statusChange.to : undefined
    const status = typeof change === "string" ? change : input.args.status
    if (status === "deleted") tasks.delete(result.taskId)
    if (previous && status !== "deleted") tasks.set(result.taskId, { ...previous,
      ...(typeof input.args.subject === "string" ? { content: input.args.subject } : {}),
      ...(typeof input.args.activeForm === "string" ? { activeForm: input.args.activeForm } : {}),
      ...(typeof status === "string" ? { status } : {}) })
  }
  if (input.state) yield* input.state({ todoTasks: Object.fromEntries(tasks) })
  if (!input.state) {
    // Child mirrors have no parent host writer. Read again after reconciliation to preserve unrelated child metadata.
    const latest = yield* input.sessions.get(input.sessionID).pipe(Effect.orDie)
    yield* input.sessions.setMetadata({ sessionID: input.sessionID, metadata: { ...latest.metadata,
      claudeCode: { ...latest.metadata?.claudeCode, todoTasks: Object.fromEntries(tasks) } } })
  }
  return [...tasks.values()]
})
