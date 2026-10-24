export * as ContinuityMaskingV2 from "./masking"

import { Message, ToolResultPart, type ToolCallPart, type ToolContent } from "@orchestra/llm"
import { Token } from "@orchestra/core/util/token"
import { ATTACHMENT_TOKENS, ERROR_LINES, PROTECTED, TAIL_STEPS, describe } from "../masking-rules"
import { ContinuityArchive } from "./archive"

/** Masked tool call IDs mapped to the archive reference holding the full output. */
export type Masks = ReadonlyMap<string, string>

export type Candidate = {
  /** The assistant message that made the call: the archive chunk's source. */
  readonly messageID: string
  readonly call: ToolCallPart
  readonly result: ToolResultPart
  readonly saved: number
}

/**
 * Tool results older than the last TAIL_STEPS assistant steps that are not protected and not yet masked, with the
 * tokens masking them would free. Steps, not user turns: one long autonomous turn is masked too.
 */
export function candidates(messages: readonly Message[], masks: Masks) {
  const steps = messages.flatMap((message, index) => (message.role === "assistant" ? [index] : []))
  if (steps.length < TAIL_STEPS) return []
  return before(messages, steps[steps.length - TAIL_STEPS], masks)
}

/** The last resort at the hard limit: every maskable result except those of the latest message. */
export function urgent(messages: readonly Message[], masks: Masks) {
  return before(messages, messages.length - 1, masks)
}

/** Replace masked results in copies of the messages; the stored history is never changed. */
export function apply(messages: readonly Message[], masks: Masks): readonly Message[] {
  if (masks.size === 0) return messages
  const calls = callsOf(messages)
  return messages.map((message) => {
    if (!message.content.some((part) => part.type === "tool-result" && masks.has(part.id))) return message
    return Message.make({
      id: message.id,
      role: message.role,
      metadata: message.metadata,
      native: message.native,
      content: message.content.map((part) => {
        const reference = part.type === "tool-result" ? masks.get(part.id) : undefined
        const call = part.type === "tool-result" ? calls.get(part.id)?.call : undefined
        if (part.type !== "tool-result" || reference === undefined || !call) return part
        return ToolResultPart.make({
          id: part.id,
          name: part.name,
          result: stub(call, part, reference),
          resultType: part.result.type === "error" ? "error" : "text",
          providerExecuted: part.providerExecuted,
          providerMetadata: part.providerMetadata,
        })
      }),
    })
  })
}

/** The text that replaces a masked tool result in the model request. */
export function stub(call: ToolCallPart, result: ToolResultPart, reference: string) {
  const text = output(result)
  const tokens = Token.estimate(text)
  const lines = text.split("\n")
  const failure = failed(result)
  const status = failure ? "failed" : "completed"
  const recall = `full output: context_recall {"reference":"${reference}"}`
  const signature = describe(call.name, call.input)
  if (!failure) return `[masked tool result: ${signature} → ${status}, ~${tokens} tokens; ${recall}]`
  // Errors are high-value evidence: their head stays verbatim.
  if (lines.length <= ERROR_LINES) return text
  return (
    `${lines.slice(0, ERROR_LINES).join("\n")}\n[masked ${lines.length - ERROR_LINES} more lines: ` +
    `${signature} → ${status}, ~${tokens} tokens; ${recall}]`
  )
}

/** The archive chunks holding one candidate's full call and output. */
export function chunks(sessionID: string, candidate: Candidate) {
  const text = [
    `## assistant message ${candidate.messageID}`,
    `Session: ${sessionID}`,
    `### Tool ${JSON.stringify(candidate.call.name)} — ${candidate.call.id}`,
    `Call: ${JSON.stringify(candidate.call.id)}; status: ${failed(candidate.result) ? "error" : "completed"}`,
    `Input:\n${ContinuityArchive.fenced(JSON.stringify(candidate.call.input ?? null, null, 2), "json")}`,
    `Captured output:\n${ContinuityArchive.fenced(output(candidate.result))}`,
  ].join("\n\n")
  return ContinuityArchive.chunks(sessionID, candidate.messageID, "assistant", text)
}

/** A tool result as the model reads it: text verbatim, JSON serialized, attachments named. */
export function output(result: ToolResultPart) {
  if (result.result.type === "content")
    return result.result.value
      .map((item: ToolContent) => (item.type === "text" ? item.text : `[Attached ${item.mime}${item.name ? `: ${item.name}` : ""}]`))
      .join("\n")
  const value = result.result.value
  return typeof value === "string" ? value : (JSON.stringify(value) ?? "")
}

function failed(result: ToolResultPart) {
  if (result.result.type === "error") return true
  const value = result.result.value
  if (!value || typeof value !== "object" || Array.isArray(value)) return false
  const exit = (value as Record<string, unknown>).exit ?? (value as Record<string, unknown>).exitCode
  return typeof exit === "number" && exit !== 0
}

function callsOf(messages: readonly Message[]) {
  return new Map(
    messages.flatMap((message) => {
      const messageID = message.id
      if (message.role !== "assistant" || messageID === undefined) return []
      return message.content.flatMap((part) => (part.type === "tool-call" ? [[part.id, { call: part, messageID }] as const] : []))
    }),
  )
}

function before(messages: readonly Message[], cutoff: number, masks: Masks): Candidate[] {
  const calls = callsOf(messages)
  return messages.slice(0, cutoff).flatMap((message) =>
    message.content.flatMap((part) => {
      // A provider-executed result is replayed to its own provider as recorded; never rewrite it.
      if (part.type !== "tool-result" || part.providerExecuted || PROTECTED.has(part.name) || masks.has(part.id))
        return []
      const found = calls.get(part.id)
      if (!found || !/^msg/.test(found.messageID)) return []
      const files = part.result.type === "content" ? part.result.value.filter((item: ToolContent) => item.type === "file").length : 0
      // The stub drops attachments too: an old screenshot is often the largest thing in the request.
      const saved =
        Token.estimate(output(part)) - Token.estimate(stub(found.call, part, "x".repeat(64))) + files * ATTACHMENT_TOKENS
      return saved > 0 ? [{ messageID: found.messageID, call: found.call, result: part, saved }] : []
    }),
  )
}
