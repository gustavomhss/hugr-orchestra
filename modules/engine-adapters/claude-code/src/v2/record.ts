export * as ClaudeCodeRecord from "./record"

import { ClaudeCodeTranscript } from "../transcript"

/** Claude Code's own subagent tool: Orchestra's seats are its subagents, and each call passes the `task` permission. */
export const SUBAGENT_TOOLS = new Set(["Agent", "Task"])
// Claude Code's task list tools, which took over from TodoWrite. They fill the todo panel as Orchestra's todo tool does.
export const TASK_LIST_TOOLS = new Set(["TaskCreate", "TaskUpdate"])
export type ChecklistItem = { id: string; content: string; status: string }
export type Checklist = { items: ChecklistItem[]; changed: boolean }

/**
 * A built-in call as the Session records it: Orchestra's tool name and argument names, so the app shows the same
 * widget it shows for Orchestra's own tool. Only the record changes; Claude Code ran the call as it asked for it.
 */
export function shown<Seat extends string>(tool: string, raw: unknown, seats: Readonly<Record<string, { readonly seat: Seat }>>) {
  const input = (typeof raw === "object" && raw !== null ? raw : {}) as Record<string, unknown>
  const file = input.file_path ?? input.notebook_path
  if (tool === "Bash") return { name: "bash", input: { command: input.command, description: input.description } }
  if (tool === "Read") return { name: "read", input: { filePath: file, offset: input.offset, limit: input.limit } }
  if (tool === "Write") return { name: "write", input: { filePath: file, content: input.content } }
  if (tool === "Edit")
    return { name: "edit", input: { filePath: file, oldString: input.old_string, newString: input.new_string, replaceAll: input.replace_all } }
  if (tool === "MultiEdit" || tool === "NotebookEdit") return { name: "edit", input: { filePath: file } }
  if (tool === "Glob") return { name: "glob", input: { pattern: input.pattern, path: input.path } }
  if (tool === "Grep") return { name: "grep", input: { pattern: input.pattern, path: input.path, include: input.glob } }
  if (tool === "WebFetch") return { name: "webfetch", input: { url: input.url, prompt: input.prompt } }
  if (tool === "WebSearch") return { name: "websearch", input: { query: input.query } }
  if (tool === "TodoWrite") return { name: "todowrite", input: { todos: input.todos }, todos: input.todos }
  if (tool === "Skill") return { name: "skill", input: { name: input.skill } }
  if (!SUBAGENT_TOOLS.has(tool)) return { name: tool, input: raw }
  const type = typeof input.subagent_type === "string" ? input.subagent_type : ""
  return {
    name: "task",
    input: { description: input.description, prompt: input.prompt, subagent_type: seats[type]?.seat ?? type, background: input.run_in_background },
    task: {
      seat: seats[type]?.seat,
      title: typeof input.description === "string" ? input.description : "",
      prompt: typeof input.prompt === "string" ? input.prompt : "",
      background: input.run_in_background === true,
    },
  }
}

/**
 * Applies a TaskCreate or TaskUpdate call to the task list and returns the list as Orchestra's todo tool would write
 * it. A created entry has no id until the call's result names it (`assign`).
 */
export function checklist(id: string, tool: string, raw: unknown, list: Checklist, created: Map<string, ChecklistItem>) {
  const input = ClaudeCodeTranscript.record(raw) ? raw : {}
  if (tool === "TaskCreate") {
    const item = { id: "", content: typeof input.subject === "string" ? input.subject : "", status: "pending" }
    list.items.push(item)
    created.set(id, item)
  }
  const target = tool === "TaskUpdate" ? list.items.find((item) => item.id === String(input.taskId)) : undefined
  if (target && input.status === "deleted") list.items.splice(list.items.indexOf(target), 1)
  if (target && typeof input.status === "string" && input.status !== "deleted") target.status = input.status
  if (target && typeof input.subject === "string") target.content = input.subject
  list.changed = true
  return list.items.map((item) => ({ content: item.content, status: item.status }))
}

/** Gives a created entry the id Claude Code assigned it, or drops it when the call failed. */
export function assign(item: ChecklistItem, failed: boolean, result: unknown, list: Checklist) {
  const task = ClaudeCodeTranscript.record(result) && ClaudeCodeTranscript.record(result.task) ? result.task : undefined
  const id = task && typeof task.id === "string" ? task.id : undefined
  // A failed call drops its entry; an id Claude Code hands out again (a list it started over) drops the stale one.
  list.items = list.items.filter((entry) => (entry === item ? !failed : id === undefined || entry.id !== id))
  if (id) item.id = id
  list.changed = true
}

/** The task list kept in host state. */
export function items(value: unknown): ChecklistItem[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((item) =>
    ClaudeCodeTranscript.record(item) && typeof item.id === "string" && typeof item.content === "string" && typeof item.status === "string"
      ? [{ id: item.id, content: item.content, status: item.status }]
      : [],
  )
}
