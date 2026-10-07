import type { SessionV1 } from "@orchestra/core/v1/session"
import { Token } from "@/util/token"

/** Assistant steps, with everything after them, whose tool output always stays verbatim. */
export const TAIL_STEPS = 5

/** Failed output keeps this many leading lines verbatim; errors are high-value evidence. */
export const ERROR_LINES = 20

// Planning state, recovered detail and delegation returns are what the model needs next; never hide them.
const PROTECTED = new Set(["skill", "todowrite", "todoread", "context_recall", "task", "maestro_request_review"])

// Tool arguments that identify a call well enough to re-run or recover it.
export const KEY_ARGS = ["filePath", "path", "command", "pattern", "url", "query", "include", "description"]

// What one inline file (an image, a PDF page) costs a model request; its base64 length says nothing about it.
export const ATTACHMENT_TOKENS = 1_600

const INLINE = /^(data:[^,]*,)?[A-Za-z0-9+/=\r\n]+$/

/** Token estimate of a request value; each inline base64 file counts ATTACHMENT_TOKENS. */
export function estimate(value: unknown) {
  let files = 0
  const text = JSON.stringify(value, (_key, item) => {
    if (typeof item !== "string" || item.length < 4 * ATTACHMENT_TOKENS || !INLINE.test(item)) return item
    files++
    return ""
  })
  return Token.estimate(text ?? "") + files * ATTACHMENT_TOKENS
}

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
  const input = part.state.input ?? {}
  const args = KEY_ARGS.flatMap((key) => {
    const value = (input as Record<string, unknown>)[key]
    if (typeof value !== "string" || !value.trim()) return []
    const text = value.trim().replace(/\s+/g, " ")
    return [`${key}=${text.length > 160 ? `${text.slice(0, 160)}…` : text}`]
  })
  return [part.tool, ...args].join(" ")
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
