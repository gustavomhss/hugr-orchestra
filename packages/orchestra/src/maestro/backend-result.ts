export * as BackendResult from "./backend-result"

import { Option, Schema } from "effect"
import type { SessionV1 } from "@orchestra/core/v1/session"
import type { ToolSafety } from "@orchestra/core/tool-safety"
import type { RecordRef } from "@orchestra/atlas-boundary/native-memory"
import { AtlasMemory } from "./atlas-memory"
import type { ArsenalCompletion } from "./arsenal-completion"
import { Seats, type Seat } from "./seats"

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

// F4 cl.30: each Atlas Memory call of the execution Session with its own F3 outcome, keyed by tool call.
export type Memory = {
  reads: { outcome: AtlasMemory.Receipt["outcome"]; callID: string; refs?: RecordRef[] }[]
  writes: { outcome: AtlasMemory.Receipt["outcome"]; callID: string; receiptRef?: RecordRef }[]
}

export type WorkerEvidence = {
  changes: { index: number; evidence: "bound" | "unbound"; callIDs: string[] }[]
  checks: { index: number; evidence: "bound" | "unbound"; callIDs: string[] }[]
}

export type WorkResult = {
  schema: string
  // Host fact: the logical task (F2.11), never the child Session ID. Absent when no binding exists.
  taskId?: string
  memberId?: string
  executionSessionId?: string
  authoritySessionId?: string
  mode: "delegated" | "delegated-armed"
  acceptance: { state: "pending" }
  verification: {
    state: ArsenalCompletion.Facts["state"]
    receipt?: ArsenalCompletion.Verified
    hostReason?: { reason: string; detail?: string }
    deltaReason?: { reason: string; detail?: string }
  }
  hostChecks?: ArsenalCompletion.Capture
  delta?: ArsenalCompletion.Facts["delta"]
  card: { parsed: boolean; messageID?: string }
  outcome?: Card["outcome"]
  changes: Card["changes"]
  checks: Card["checks"]
  blockers: Card["blockers"]
  risks: Card["risks"]
  nextActions: Card["nextActions"]
  terminal: Terminal
  memory: Memory
  // F4 cl.16 / F4-CH: host binding of worker claims, separate from verification and acceptance.
  workerEvidence?: WorkerEvidence
  // Host fact set by the Task path: the write roots enforced for the child, worktree-relative; empty is read-only.
  writeRoots?: string[]
  // Host fact: whether the child's shell commands ran inside the write jail. `unenforced` means at least one ran
  // without it (no sandbox on this host yet); `shellSandbox.reason` says why.
  shellWrites?: ToolSafety.ShellFact["shellWrites"]
  shellSandbox?: ToolSafety.ShellFact["shellSandbox"]
}

/**
 * Assemble `backend-work-result-v1` from the child's final message. Worker fields come only from a strictly decoded
 * card; a missing, duplicated or invalid card leaves them empty. Host failure or interruption overrides the card,
 * and the card can only lower `ended` to `blocked` (F4 cl.11). Memory outcomes come from the receipts in `session`
 * (the execution Session's stored history) and the final message, and never touch any other field (F4 cl.30).
 */
export function assemble(message: SessionV1.WithParts, session: readonly SessionV1.WithParts[] = [], seat: Seat = Seats.all.backend): WorkResult {
  const text = message.parts.findLast((part) => part.type === "text")
  const card = text?.type === "text" ? parse(text.text, seat.returnCard) : undefined
  const host = terminal(message)
  return {
    schema: requireSchema(seat),
    mode: "delegated",
    acceptance: { state: "pending" },
    verification: { state: "not-host-verified" },
    card: { parsed: card !== undefined, messageID: message.info.id },
    ...(card ? { outcome: card.outcome } : {}),
    changes: card?.changes ?? [],
    checks: card?.checks ?? [],
    blockers: card?.blockers ?? [],
    risks: card?.risks ?? [],
    nextActions: card?.nextActions ?? [],
    terminal: { reason: host === "ended" && card?.outcome === "blocked" ? "blocked" : host },
    memory: seat.atlasMemory ? memory([...session.filter((stored) => stored.info.id !== message.info.id), message]) : { reads: [], writes: [] },
  }
}

/**
 * The work result for a Task the host ended before or instead of the child's final message (F4 cl.6): cancellation,
 * a failed or dead child, a background start, or a replay without a completed child message. Worker fields come only
 * from the child's last assistant message, when there is one; nothing is fabricated.
 */
export function hostEnded(input: {
  message?: SessionV1.WithParts
  session?: readonly SessionV1.WithParts[]
  reason: "failed" | "interrupted" | "running"
  detail: string
}, seat: Seat = Seats.all.backend): WorkResult {
  const base = input.message
    ? assemble(input.message, input.session, seat)
    : {
        schema: requireSchema(seat),
        mode: "delegated" as const,
        acceptance: { state: "pending" as const },
        verification: { state: "not-host-verified" as const },
        card: { parsed: false },
        changes: [],
        checks: [],
        blockers: [],
        risks: [],
        nextActions: [],
        memory: seat.atlasMemory ? memory(input.session ?? []) : { reads: [], writes: [] },
      }
  return { ...base, terminal: { reason: input.reason, hostDetail: input.detail } }
}

// Receipts are host-written by the Atlas Memory tools into their tool part's result metadata (F3 cl.24). A refused,
// unavailable or uncertain write is reported as such, never as remembered.
export function memory(messages: readonly SessionV1.WithParts[]): Memory {
  const receipts = messages
    .flatMap((message) => message.parts)
    .flatMap((part) => {
      if (part.type !== "tool") return []
      const receipt: unknown =
        ("metadata" in part.state ? part.state.metadata?.[AtlasMemory.RECEIPT_KEY] : undefined) ??
        part.metadata?.[AtlasMemory.RECEIPT_KEY]
      return isReceipt(receipt) ? [{ callID: part.callID, receipt }] : []
    })
  return {
    reads: receipts
      .filter((item) => item.receipt.op === "recall")
      .map((item) => ({
        outcome: item.receipt.outcome,
        callID: item.callID,
        ...(item.receipt.refs ? { refs: [...item.receipt.refs] } : {}),
      })),
    writes: receipts
      .filter((item) => item.receipt.op === "emit")
      .map((item) => ({
        outcome: item.receipt.outcome,
        callID: item.callID,
        ...(item.receipt.ref ? { receiptRef: item.receipt.ref } : {}),
      })),
  }
}

function isReceipt(value: unknown): value is AtlasMemory.Receipt {
  return (
    typeof value === "object" &&
    value !== null &&
    "schema" in value &&
    value.schema === "atlas-memory-receipt-v1" &&
    "op" in value &&
    (value.op === "recall" || value.op === "emit") &&
    "outcome" in value &&
    typeof value.outcome === "string"
  )
}

function parse(text: string, tag: string): Card | undefined {
  if (text.split("```" + tag).length !== 2) return
  // Definition validation restricts tags to lowercase words and hyphens, so interpolation cannot change the regex.
  const block = new RegExp("```" + tag + "[ \\t]*\\r?\\n([\\s\\S]*?)\\r?\\n```").exec(text)?.[1]
  if (block === undefined) return
  return Option.getOrUndefined(
    Option.flatMap(decodeJson(block), (json) => decodeCard(json, { onExcessProperty: "error" })),
  )
}

function requireSchema(seat: Seat) {
  if (!seat.workResult) throw new Error(`Seat has no work-result contract: ${seat.id}`)
  return seat.workResult
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
