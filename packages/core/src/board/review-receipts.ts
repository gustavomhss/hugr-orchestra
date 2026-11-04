export * as BoardReviewReceipts from "./review-receipts"

import { and, eq, inArray, sql } from "drizzle-orm"
import { Effect } from "effect"
import { MaestroEvent } from "@orchestra/schema/maestro-event"
import type { Database } from "../database/database"
import { EventV2 } from "../event"
import { EventTable } from "../event/sql"
import type { BoardRecord } from "./record"
import { BoardNoteTable } from "./sql"

// K12: the receipts linked to a card through `bno_review_<validation>_<stage>`. The newest receipt of a stage is open
// when it is FIX_FIRST or REJECT. A note with no receipt is not a refusal.

export type Receipt = {
  readonly id: string
  readonly seq: number
  readonly validationRecordID: string
  readonly stage: string
  readonly verdict: "APPROVE" | "FIX_FIRST" | "REJECT"
  readonly method: string
  readonly findings: ReadonlyArray<{
    readonly path: string
    readonly line: number
    readonly message: string
    readonly severity?: string
    readonly status?: string
  }>
}

export type Linked = ReturnType<typeof links>[number]
export type Held = { readonly link: Linked; readonly receipt: Receipt }
export type Review = BoardRecord.PrRecord["evidence"]["reviews"][number]

const PREFIX = "bno_review_"

export function links(noteIDs: ReadonlyArray<string>) {
  return noteIDs.flatMap((id) => {
    if (!id.startsWith(PREFIX)) return []
    const rest = id.slice(PREFIX.length)
    const stage = rest.endsWith("_plan") ? "plan" : rest.endsWith("_code") ? "code" : undefined
    if (!stage) return []
    const validation = rest.slice(0, -(stage.length + 1))
    return validation ? [{ validation, stage }] : []
  })
}

export function newest(linked: ReadonlyArray<Linked>, receipts: ReadonlyArray<Receipt>): Held[] {
  return linked.flatMap((link) => {
    const receipt = receipts
      .filter((item) => item.validationRecordID === link.validation && item.stage === link.stage)
      .toSorted((left, right) => right.seq - left.seq)[0]
    return receipt ? [{ link, receipt }] : []
  })
}

export function refusal(items: ReadonlyArray<Held>) {
  const held = items.filter((item) => item.receipt.verdict !== "APPROVE")
  if (held.length === 0) return undefined
  return `ReviewOpen: ${held.map((item) => `${item.link.stage} ${item.receipt.verdict} (${item.receipt.id})`).join(", ")}`
}

export function toReview(item: Held): Review {
  const counts = { P0: 0, P1: 0, P2: 0, P3: 0 }
  for (const finding of item.receipt.findings) {
    if (finding.severity === "P0" || finding.severity === "P1" || finding.severity === "P2" || finding.severity === "P3")
      counts[finding.severity] += 1
  }
  return {
    kind: item.link.stage,
    verdict: item.receipt.verdict,
    findings: item.receipt.findings.map((finding) => ({
      at: `${finding.path}:${finding.line}`,
      text: finding.message,
      ...(finding.status === "resolved" || finding.status === "dismissed" ? { closed: finding.status } : {}),
    })),
    id: item.receipt.id,
    stage: item.link.stage,
    method: item.receipt.method,
    counts,
    open: item.receipt.verdict !== "APPROVE",
  }
}

const receiptOf = (id: string, seq: number, data: Record<string, unknown>): Receipt | undefined => {
  if (typeof data.validationRecordID !== "string") return undefined
  if (data.verdict !== "APPROVE" && data.verdict !== "FIX_FIRST" && data.verdict !== "REJECT") return undefined
  const findings = Array.isArray(data.findings)
    ? data.findings.flatMap((finding) => {
        if (!finding || typeof finding !== "object") return []
        const row = finding as Record<string, unknown>
        if (typeof row.path !== "string" || typeof row.line !== "number" || typeof row.message !== "string") return []
        return [{
          path: row.path,
          line: row.line,
          message: row.message,
          ...(typeof row.severity === "string" ? { severity: row.severity } : {}),
          ...(typeof row.status === "string" ? { status: row.status } : {}),
        }]
      })
    : []
  return {
    id,
    seq,
    validationRecordID: data.validationRecordID,
    stage: typeof data.stage === "string" ? data.stage : "plan",
    verdict: data.verdict,
    method: typeof data.reviewMethodVersion === "string" ? data.reviewMethodVersion : "",
    findings,
  }
}

type Tx = Pick<Database.Interface["db"], "select">

/** Receipts whose validation the card's review notes name. */
export const forIssue = Effect.fn("BoardReviewReceipts.forIssue")(function* (tx: Tx, issueID: string) {
  const notes = yield* tx.select({ id: BoardNoteTable.id }).from(BoardNoteTable).where(eq(BoardNoteTable.issue_id, issueID)).all()
  const linked = links(notes.map((note) => note.id))
  if (linked.length === 0) return []
  const rows = yield* tx
    .select({ id: EventTable.id, seq: EventTable.seq, data: EventTable.data })
    .from(EventTable)
    .where(and(
      eq(EventTable.type, EventV2.versionedType(MaestroEvent.Review.Received.type, 2)),
      inArray(sql`json_extract(${EventTable.data}, '$.validationRecordID')`, linked.map((link) => link.validation)),
    ))
    .all()
  return newest(linked, rows.flatMap((row) => {
    const receipt = receiptOf(row.id, row.seq, row.data)
    return receipt ? [receipt] : []
  }))
})
