export * as ContinuityMasking from "./masking"

import type { SessionV1 } from "./compat/core-v1-session"
import { Token } from "@orchestra/core/util/token"
import { ATTACHMENT_TOKENS, ERROR_LINES, PROTECTED, TAIL_STEPS, describe } from "./masking-rules"

export { ATTACHMENT_TOKENS, ERROR_LINES, KEY_ARGS, TAIL_STEPS, estimate } from "./masking-rules"

/** Masked tool part IDs mapped to the archive reference holding the full output. */
export type Masks = ReadonlyMap<string, string>

export type CompletedTool = SessionV1.ToolPart & { state: SessionV1.ToolStateCompleted }

export function completed(part: SessionV1.Part): part is CompletedTool {
  return part.type === "tool" && part.state.status === "completed"
}

export function failed(part: CompletedTool) {
  const exit = part.state.metadata?.exit
  return typeof exit === "number" && exit !== 0
}

export function signature(part: SessionV1.ToolPart) {
  return describe(part.tool, part.state.input)
}

/** The text that replaces a masked tool result in the model request. */
export function stub(part: CompletedTool, reference: string) {
  const output = part.state.output
  const tokens = Token.estimate(output)
  const lines = output.split("\n")
  const status = failed(part) ? `exit ${String(part.state.metadata?.exit)}` : "completed"
  const recall = `full output: context_recall {"reference":"${reference}"}`
  if (!failed(part)) return `[masked tool result: ${signature(part)} → ${status}, ~${tokens} tokens; ${recall}]`
  if (lines.length <= ERROR_LINES) return output
  return `${lines.slice(0, ERROR_LINES).join("\n")}\n[masked ${lines.length - ERROR_LINES} more lines: ` +
    `${signature(part)} → ${status}, ~${tokens} tokens; ${recall}]`
}

/**
 * Completed tool results older than the last TAIL_STEPS assistant steps that are not protected
 * and not yet masked, with the tokens masking them would free. Steps, not user turns: one long
 * autonomous turn is pruned too once maintenance runs.
 */
export function candidates(messages: SessionV1.WithParts[], masks: Masks) {
  let steps = 0
  for (let index = messages.length - 1; index >= 0; index--) {
    if (messages[index].info.role !== "assistant") continue
    if (++steps === TAIL_STEPS) return before(messages, index, masks)
  }
  return []
}

/** The last resort at the hard limit: every maskable result except those of the latest message. */
export function urgent(messages: SessionV1.WithParts[], masks: Masks) {
  return before(messages, messages.length - 1, masks)
}

function before(messages: SessionV1.WithParts[], cutoff: number, masks: Masks) {
  return messages.slice(0, cutoff).flatMap((message) => message.parts.flatMap((part) => {
    if (!completed(part) || PROTECTED.has(part.tool) || masks.has(part.id)) return []
    // The stub drops attachments too: an old screenshot is often the largest thing in the request.
    const saved = Token.estimate(part.state.output) - Token.estimate(stub(part, "x".repeat(64))) +
      (part.state.attachments?.length ?? 0) * ATTACHMENT_TOKENS
    return saved > 0 ? [{ messageID: message.info.id, part, saved }] : []
  }))
}

/** Replace masked results in copies of the messages; stored history is never changed. */
export function apply(messages: SessionV1.WithParts[], masks: Masks): SessionV1.WithParts[] {
  if (!masks.size) return messages
  return messages.map((message) => {
    if (!message.parts.some((part) => masks.has(part.id))) return message
    return {
      ...message,
      parts: message.parts.map((part) => {
        const reference = masks.get(part.id)
        if (reference === undefined || !completed(part)) return part
        // `read` skips nested rules that an earlier read in this view lists in `loaded`. The stub drops the
        // reminder that carried them, so the masked copy must not list them as shown.
        return { ...part, state: { ...part.state, output: stub(part, reference), attachments: [],
          metadata: part.tool === "read" ? { ...part.state.metadata, loaded: [] } : part.state.metadata } }
      }),
    }
  })
}
