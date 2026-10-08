import type { SessionV1 } from "@opencode-ai/core/v1/session"

/**
 * One aliased source: `uN` user text, `aN` assistant message, `tN` tool call or delegation return.
 * Aliases are a pure function of the full stored session history, so the producer index, the
 * renderer and context_recall always agree.
 */
export type Source = {
  alias: string
  message: SessionV1.WithParts
  /** The tool part (also for `question` answers) or the delegation-return notice part. */
  part?: SessionV1.Part
  time: number
  /** User text, assistant text or the notice text; empty for tool calls. */
  text: string
  /** For a `question` answer, the alias of the question tool call. */
  answers?: string
}

export const ALIAS = /^[uat][1-9][0-9]*$/

/** Marker on text parts that only look like user text. */
export type Marker = { type: "command"; invocation: string } | { type: "task-return"; task_id: string; state: string }

export function marker(part: SessionV1.Part): Marker | undefined {
  const source: unknown = part.type === "text" ? part.metadata?.source : undefined
  if (typeof source !== "object" || source === null) return
  const value = source as Record<string, unknown>
  if (value.type === "command" && typeof value.invocation === "string") return { type: "command", invocation: value.invocation }
  if (value.type === "task-return" && typeof value.task_id === "string")
    return { type: "task-return", task_id: value.task_id, state: typeof value.state === "string" ? value.state : "completed" }
}

/** Marker for a command's expanded template: only the typed invocation counts as user text. */
export function commandSource(command: string, args: string) {
  const invocation = `/${command}${args.trim() ? ` ${args.trim()}` : ""}`
  return { invocation, source: { type: "command", invocation } satisfies Marker }
}

/** What the human typed in a user message: non-synthetic text, and the invocation for a command template. */
export function userText(message: SessionV1.WithParts) {
  if (message.info.role !== "user") return ""
  return message.parts.flatMap((part) => {
    if (part.type !== "text") return []
    const source = marker(part)
    if (source?.type === "command") return [source.invocation]
    if (part.ignored) return []
    if (part.synthetic || source) return []
    return part.text.trim() ? [part.text.trim()] : []
  }).join("\n\n")
}

/** The human's answers to a `question` tool call. */
export function answers(part: SessionV1.Part) {
  if (part.type !== "tool" || part.tool !== "question" || part.state.status !== "completed") return ""
  const value: unknown = part.state.metadata?.answers
  if (!Array.isArray(value)) return ""
  return value.flatMap((answer) => Array.isArray(answer) && answer.length ? [answer.join(", ")] : []).join("\n")
}

/** The child session a delegation tool part started, if any. */
export function child(part: SessionV1.Part) {
  if (part.type !== "tool" || part.state.status === "pending") return
  const meta = part.state.metadata
  const id = part.tool === "task" ? meta?.sessionId : meta?.childSessionID
  return typeof id === "string" && id ? id : undefined
}

export function end(part: SessionV1.ToolPart, fallback: number) {
  const state = part.state
  return state.status === "completed" || state.status === "error" ? state.time.end : state.status === "running" ? state.time.start : fallback
}

export function aliases(history: SessionV1.WithParts[]): Source[] {
  const count = { u: 0, a: 0, t: 0 }
  const next = (kind: "u" | "a" | "t") => `${kind}${++count[kind]}`
  return history.flatMap((message) => {
    const created = message.info.time.created
    if (message.info.role === "user") {
      const notice = message.parts.find((part) => marker(part)?.type === "task-return")
      const text = userText(message)
      return [
        ...(notice?.type === "text" ? [{ alias: next("t"), message, part: notice, time: created, text: notice.text }] : []),
        ...(text || message.parts.some((part) => part.type === "file") ? [{ alias: next("u"), message, time: created, text }] : []),
      ]
    }
    const text = message.parts.flatMap((part) => part.type === "text" && !part.ignored && !part.synthetic && part.text.trim() ? [part.text.trim()] : []).join("\n\n")
    const result: Source[] = text ? [{ alias: next("a"), message, time: created, text }] : []
    for (const part of message.parts) {
      if (part.type !== "tool") continue
      const call: Source = { alias: next("t"), message, part, time: end(part, created), text: "" }
      result.push(call)
      const answer = answers(part)
      if (answer) result.push({ alias: next("u"), message, part, time: end(part, created), text: answer, answers: call.alias })
    }
    return result
  })
}
