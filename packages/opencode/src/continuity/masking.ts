import type { SessionV1 } from "@opencode-ai/core/v1/session"
import { Token } from "@/util/token"

/** User turns, with everything after them, that always stay verbatim. */
export const TAIL_TURNS = 5

/** Failed output keeps this many leading lines verbatim; errors are high-value evidence. */
export const ERROR_LINES = 20

// Planning state and recovered detail are what the model needs next; never hide them.
const PROTECTED = new Set(["skill", "todowrite", "todoread", "context_recall"])

// Tool arguments that identify a call well enough to re-run or recover it.
const KEY_ARGS = ["filePath", "path", "command", "pattern", "url", "query", "include", "description"]

/** Masked tool part IDs mapped to the archive reference holding the full output. */
export type Masks = ReadonlyMap<string, string>

type CompletedTool = SessionV1.ToolPart & { state: SessionV1.ToolStateCompleted }

function completed(part: SessionV1.Part): part is CompletedTool {
  return part.type === "tool" && part.state.status === "completed"
}

function failed(part: CompletedTool) {
  const exit = part.state.metadata?.exit
  return typeof exit === "number" && exit !== 0
}

function signature(part: CompletedTool) {
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
 * Completed tool results older than the last TAIL_TURNS user turns that are not protected
 * and not yet masked, with the tokens masking them would free.
 */
export function candidates(messages: SessionV1.WithParts[], masks: Masks) {
  let turns = 0
  let cutoff = 0
  for (let index = messages.length - 1; index >= 0; index--) {
    if (messages[index].info.role !== "user") continue
    turns++
    if (turns === TAIL_TURNS) {
      cutoff = index
      break
    }
  }
  if (turns < TAIL_TURNS) return []
  return messages.slice(0, cutoff).flatMap((message) => message.parts.flatMap((part) => {
    if (!completed(part) || PROTECTED.has(part.tool) || masks.has(part.id)) return []
    const saved = Token.estimate(part.state.output) - Token.estimate(stub(part, "x".repeat(64)))
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
        return { ...part, state: { ...part.state, output: stub(part, reference), attachments: [] } }
      }),
    }
  })
}
