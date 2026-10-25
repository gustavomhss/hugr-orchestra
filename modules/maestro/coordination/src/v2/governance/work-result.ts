export * as WorkResultV2 from "./work-result"

import path from "path"
import { Option, Schema } from "effect"
import type { SessionMessage } from "@orchestra/core/session/message"
import type { ToolSafety } from "@orchestra/core/tool-safety"
import type { Seat } from "../../seats/seat"
import { MaestroAtlasMemoryTools } from "../tools/atlas-memory"
import { WriteRootsV2 } from "./write-roots"

// V2 port of V1's SeatWork projection (`apps/orchestra/src/maestro/backend-work.ts` with `backend-result.ts`) for a
// foreground reply core Task already found completed. Not ported: worker evidence and owned-tool outcomes, whose V2
// host records (BackendEvidence binding, HuGR outcome metadata) do not exist yet.

// The worker-claim card the backend specialist ends its final message with; V1's `BackendResult.Card`, closed at every
// level so excess properties fail the decode.
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

const decodeJson = Schema.decodeUnknownOption(Schema.UnknownFromJsonString)
const decodeCard = Schema.decodeUnknownOption(Card)

export const KEY = "workResult"

/**
 * The seat's work result from its completed reply: worker fields only from a strictly decoded card, the terminal from
 * the reply (a card can only lower `ended` to `blocked`), memory outcomes from the execution Session's receipts, and
 * the host facts the Task path binds. Acceptance and verification stay pending: settlement never claims either.
 */
export function assemble(input: {
  readonly seat: Seat & { readonly workResult: string }
  readonly reply: SessionMessage.Assistant
  readonly history: ReadonlyArray<SessionMessage.Message>
  readonly executionSessionID: string
  readonly authoritySessionID: string
  readonly taskId?: string
  readonly writeRoots?: ReadonlyArray<string>
  /** The write-jail fact of the child's sandbox-bound shell commands; reported only beside bound write roots. */
  readonly shell?: ToolSafety.ShellFact
}) {
  const text = input.reply.content.findLast((part) => part.type === "text")
  const card = text?.type === "text" ? parse(text.text, input.seat.returnCard) : undefined
  const failed = input.reply.content.some((part) => part.type === "tool" && part.state.status === "error")
  const host = failed ? "failed" : "ended"
  return {
    schema: input.seat.workResult,
    ...(input.taskId ? { taskId: input.taskId } : {}),
    memberId: input.seat.id,
    executionSessionId: input.executionSessionID,
    authoritySessionId: input.authoritySessionID,
    mode: "delegated" as const,
    acceptance: { state: "pending" as const },
    verification: { state: "not-host-verified" as const },
    card: { parsed: card !== undefined, messageID: input.reply.id },
    ...(card ? { outcome: card.outcome } : {}),
    changes: card?.changes ?? [],
    checks: card?.checks ?? [],
    blockers: card?.blockers ?? [],
    risks: card?.risks ?? [],
    nextActions: card?.nextActions ?? [],
    terminal: { reason: host === "ended" && card?.outcome === "blocked" ? ("blocked" as const) : host },
    memory: input.seat.atlasMemory ? memory(input.history) : { reads: [], writes: [] },
    ...(input.writeRoots ? { writeRoots: [...input.writeRoots], ...input.shell } : {}),
  }
}

/**
 * V1's `WriteRoots.effective`: the bound roots ToolSafety enforces for the child, narrowed by the project profile and
 * made relative to the worktree. Undefined when the host bound none; empty means read-only.
 */
export function effective(
  bound: ReadonlyArray<string> | undefined,
  project: ToolSafety.Profile | undefined,
  location: { readonly directory: string; readonly worktree: string },
) {
  if (!bound) return undefined
  return (WriteRootsV2.profile(project, bound, location.directory).writeRoots ?? []).map(
    (root) => path.relative(location.worktree, path.resolve(location.directory, root)).replaceAll("\\", "/") || ".",
  )
}

// Receipts are host-written by the Atlas Memory tools into their tool's structured result. A refused, unavailable or
// uncertain write is reported as such, never as remembered.
function memory(history: ReadonlyArray<SessionMessage.Message>) {
  const receipts = history
    .flatMap((message) => (message.type === "assistant" ? message.content : []))
    .flatMap((part) => {
      if (part.type !== "tool" || part.state.status === "pending") return []
      const receipt = part.state.structured[MaestroAtlasMemoryTools.RECEIPT_KEY]
      return isReceipt(receipt) ? [{ callID: part.id, receipt }] : []
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

function isReceipt(value: unknown): value is MaestroAtlasMemoryTools.Receipt {
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

function parse(text: string, tag: string) {
  if (text.split("```" + tag).length !== 2) return
  // Seat definitions restrict tags to lowercase words and hyphens, so interpolation cannot change the regex.
  const block = new RegExp("```" + tag + "[ \\t]*\\r?\\n([\\s\\S]*?)\\r?\\n```").exec(text)?.[1]
  if (block === undefined) return
  return Option.getOrUndefined(
    Option.flatMap(decodeJson(block), (json) => decodeCard(json, { onExcessProperty: "error" })),
  )
}
