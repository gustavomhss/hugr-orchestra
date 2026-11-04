export * as BoardReviewReceipts from "./review-receipts"

import { and, asc, eq, inArray, sql } from "drizzle-orm"
import { Effect, Option, Schema } from "effect"
import { Board } from "@orchestra/schema/board"
import { MaestroEvent } from "@orchestra/schema/maestro-event"
import type { Database } from "../database/database"
import { EventV2 } from "../event"
import { EventTable } from "../event/sql"
import type { BoardRecord } from "./record"
import { BoardNoteTable } from "./sql"

// K12: host request-note order selects the newest completed validation of each stage. Only receipts within the same
// validation/stage use aggregate-local sequence; an unanswered request does not clear an earlier refusal.

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
  return linked.reduce<Held[]>((items, link) => {
    const receipt = receipts
      .filter((item) => item.validationRecordID === link.validation && item.stage === link.stage)
      .toSorted((left, right) => right.seq - left.seq)[0]
    return receipt ? [...items.filter((item) => item.link.stage !== link.stage), { link, receipt }] : items
  }, [])
}

export function refusal(items: ReadonlyArray<Held>) {
  const held = items.filter((item) => item.receipt.verdict !== "APPROVE")
  if (held.length === 0) return undefined
  return `ReviewOpen: ${held.map((item) => `${item.link.stage} ${item.receipt.verdict} (${item.receipt.id})`).join(", ")}`
}

export function toReview(item: Held): Review {
  const counts = { P0: 0, P1: 0, P2: 0, P3: 0 }
  for (const finding of item.receipt.findings) {
    const severity = finding.severity ?? "P1"
    if (severity === "P0" || severity === "P1" || severity === "P2" || severity === "P3") counts[severity] += 1
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

const V1 = EventV2.versionedType(MaestroEvent.Review.Received.type, 1)
const V2 = EventV2.versionedType(MaestroEvent.Review.ReceivedV2.type, 2)
const decodeV1 = Schema.decodeUnknownOption(MaestroEvent.Review.Received.data)
const decodeV2 = Schema.decodeUnknownOption(MaestroEvent.Review.ReceivedV2.data)

const receiptOf = (id: string, seq: number, type: string, data: unknown): Receipt | undefined => {
  const decoded = type === V2
    ? decodeV2(data)
    : type === V1
      ? decodeV1(data).pipe(Option.map((legacy) => ({ ...legacy, stage: "plan" as const })))
      : Option.none()
  if (Option.isNone(decoded)) return undefined
  return {
    id,
    seq,
    validationRecordID: decoded.value.validationRecordID,
    stage: decoded.value.stage ?? "plan",
    verdict: decoded.value.verdict,
    method: decoded.value.reviewMethodVersion,
    findings: decoded.value.findings,
  }
}

type Tx = Pick<Database.Interface["db"], "select">

/** Receipts whose validation the card's review notes name. */
export const forIssue = Effect.fn("BoardReviewReceipts.forIssue")(function* (tx: Tx, issueID: Board.IssueID) {
  const notes = yield* tx
    .select({ id: BoardNoteTable.id })
    .from(BoardNoteTable)
    .where(and(eq(BoardNoteTable.issue_id, issueID), eq(BoardNoteTable.author, "maestro"), eq(BoardNoteTable.kind, "review")))
    .orderBy(asc(BoardNoteTable.time_created), sql`${BoardNoteTable}.rowid`)
    .all()
  const linked = links(notes.map((note) => note.id))
  if (linked.length === 0) return []
  const rows = yield* tx
    .select({ id: EventTable.id, seq: EventTable.seq, type: EventTable.type, data: EventTable.data })
    .from(EventTable)
    .where(and(
      inArray(EventTable.type, [V1, V2]),
      inArray(sql`json_extract(${EventTable.data}, '$.validationRecordID')`, linked.map((link) => link.validation)),
    ))
    .all()
  return newest(linked, rows.flatMap((row) => {
    const receipt = receiptOf(row.id, row.seq, row.type, row.data)
    return receipt ? [receipt] : []
  }))
})
