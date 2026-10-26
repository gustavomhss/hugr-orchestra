export * as ContinuityAliasV2 from "./alias"

import type { SessionMessage } from "@orchestra/core/session"

export const ALIAS = /^[uat][1-9][0-9]*$/

/**
 * One aliased source: `uN` user text, `aN` assistant text, `tN` tool call. Aliases are a pure function of the full
 * stored Session history, so every reader numbers the same source the same way.
 */
export type Source = {
  readonly alias: string
  readonly messageID: SessionMessage.ID
  /** The tool call ID of a `tN` source and of a `question` answer. */
  readonly partID?: string
  readonly text: string
}

export function aliases(history: readonly SessionMessage.Message[]): Source[] {
  const count = { u: 0, a: 0, t: 0 }
  const next = (kind: "u" | "a" | "t") => `${kind}${++count[kind]}`
  return history.flatMap((message): Source[] => {
    if (message.type === "user")
      return message.text.trim() ? [{ alias: next("u"), messageID: message.id, text: message.text.trim() }] : []
    if (message.type !== "assistant") return []
    const text = message.content
      .flatMap((part) => (part.type === "text" && part.text.trim() ? [part.text.trim()] : []))
      .join("\n\n")
    return [
      ...(text ? [{ alias: next("a"), messageID: message.id, text }] : []),
      ...message.content.flatMap((part) => {
        if (part.type !== "tool") return []
        const call = { alias: next("t"), messageID: message.id, partID: part.id, text: "" }
        const answer = answers(part)
        return answer ? [call, { alias: next("u"), messageID: message.id, partID: part.id, text: answer }] : [call]
      }),
    ]
  })
}

/** The human's answers to a `question` tool call. */
function answers(part: SessionMessage.AssistantTool) {
  if (part.name !== "question" || part.state.status !== "completed") return ""
  const value = part.state.structured.answers
  if (!Array.isArray(value)) return ""
  return value
    .flatMap((answer) => (Array.isArray(answer) && answer.length ? [answer.join(", ")] : []))
    .join("\n")
}
