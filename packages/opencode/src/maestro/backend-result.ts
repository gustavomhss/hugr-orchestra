export * as BackendResult from "./backend-result"

import { Option, Schema } from "effect"
import type { SessionV1 } from "@opencode-ai/core/v1/session"

// The worker-claim card the backend specialist ends its final message with (charter draft v2, F4 cl.5 as amended by F4-CH).
// Closed at every level: excess properties fail the decode.
const Card = Schema.Struct({
  outcome: Schema.Literals(["done", "blocked"]),
  changes: Schema.Array(
    Schema.Struct({
      path: Schema.String,
      change: Schema.Literals(["created", "modified", "deleted"]),
    }),
  ),
  checks: Schema.Array(
    Schema.Struct({
      checkId: Schema.String,
      command: Schema.String,
      cwd: Schema.String,
      status: Schema.Literals(["pass", "fail", "skip", "missing", "acquisition-error"]),
      exitCode: Schema.optional(Schema.Int),
    }),
  ),
  blockers: Schema.Array(
    Schema.Struct({
      kind: Schema.Literals(["packet", "permission", "safety-hold", "tool", "atlas", "check-unavailable"]),
      reason: Schema.String,
      code: Schema.optional(Schema.String),
      ref: Schema.optional(Schema.String),
    }),
  ),
  risks: Schema.Array(Schema.String),
  nextActions: Schema.Array(Schema.String),
})
export type Card = Schema.Schema.Type<typeof Card>

const decodeJson = Schema.decodeUnknownOption(Schema.UnknownFromJsonString)
const decodeCard = Schema.decodeUnknownOption(Card)

type Terminal = {
  reason: "ended" | "blocked" | "failed" | "interrupted" | "running"
  // Verbatim host reason when the host, not the child's final message, ended the Task (F4 `terminal.hostDetail`).
  hostDetail?: string
}

export type WorkResult = {
  schema: "backend-work-result-v1"
  card: { parsed: boolean; messageID?: string }
  outcome?: Card["outcome"]
  changes: Card["changes"]
  checks: Card["checks"]
  blockers: Card["blockers"]
  risks: Card["risks"]
  nextActions: Card["nextActions"]
  terminal: Terminal
  // Host fact set by the Task path: the write roots enforced for the child, worktree-relative; empty is read-only.
  writeRoots?: string[]
}

/**
 * Assemble `backend-work-result-v1` from the child's final message. Worker fields come only from a strictly decoded
 * card; a missing, duplicated or invalid card leaves them empty. Host failure or interruption overrides the card,
 * and the card can only lower `ended` to `blocked` (F4 cl.11).
 */
export function assemble(message: SessionV1.WithParts): WorkResult {
  const text = message.parts.findLast((part) => part.type === "text")
  const card = text?.type === "text" ? parse(text.text) : undefined
  const host = terminal(message)
  return {
    schema: "backend-work-result-v1",
    card: { parsed: card !== undefined, messageID: message.info.id },
    ...(card ? { outcome: card.outcome } : {}),
    changes: card?.changes ?? [],
    checks: card?.checks ?? [],
    blockers: card?.blockers ?? [],
    risks: card?.risks ?? [],
    nextActions: card?.nextActions ?? [],
    terminal: { reason: host === "ended" && card?.outcome === "blocked" ? "blocked" : host },
  }
}

/**
 * The work result for a Task the host ended before or instead of the child's final message (F4 cl.6): cancellation,
 * a failed or dead child, a background start, or a replay without a completed child message. Worker fields come only
 * from the child's last assistant message, when there is one; nothing is fabricated.
 */
export function hostEnded(input: {
  message?: SessionV1.WithParts
  reason: "failed" | "interrupted" | "running"
  detail: string
}): WorkResult {
  const base = input.message
    ? assemble(input.message)
    : {
        schema: "backend-work-result-v1" as const,
        card: { parsed: false },
        changes: [],
        checks: [],
        blockers: [],
        risks: [],
        nextActions: [],
      }
  return { ...base, terminal: { reason: input.reason, hostDetail: input.detail } }
}

function parse(text: string): Card | undefined {
  if (text.split("```backend-result").length !== 2) return
  const block = /```backend-result[ \t]*\r?\n([\s\S]*?)\r?\n```/.exec(text)?.[1]
  if (block === undefined) return
  return Option.getOrUndefined(
    Option.flatMap(decodeJson(block), (json) => decodeCard(json, { onExcessProperty: "error" })),
  )
}

// The Task finish predicate (task.ts): errors fail the Task; a missing or tool-call finish never reached a terminal.
function terminal(message: SessionV1.WithParts) {
  if (message.info.role !== "assistant") return "interrupted" as const
  if (message.info.error) return "failed" as const
  const tools = message.parts.flatMap((part) => (part.type === "tool" ? [part.state.status] : []))
  if (tools.includes("error")) return "failed" as const
  if (
    !message.info.finish ||
    ["tool-calls", "unknown"].includes(message.info.finish) ||
    tools.some((status) => status !== "completed")
  )
    return "interrupted" as const
  return "ended" as const
}
