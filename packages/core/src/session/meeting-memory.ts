export * as MeetingMemory from "./meeting-memory"

import { and, asc, eq, gt, inArray, or, sql, type AnyColumn, type SQL } from "drizzle-orm"
import { Effect } from "effect"
import { Meeting } from "@orchestra/schema/meeting"
import type { Database } from "../database/database"
import { Identifier } from "../util/identifier"
import { MeetingTable } from "./meeting.sql"
import { MeetingItemTable, MeetingPersonTable, MeetingProposalTable } from "./meeting-memory.sql"

// The reads and writes behind the meeting card. Failures are plain error reasons; SessionMeeting wraps them.
type Db = Database.Interface["db"]
type MeetingRow = typeof MeetingTable.$inferSelect
type ItemRow = typeof MeetingItemTable.$inferSelect
type PersonRow = typeof MeetingPersonTable.$inferSelect

const LIST_LIMIT = 50
const LIST_MAX = 200
const OPEN = new Set<Meeting.CommitmentState>(["proposed", "accepted", "overdue"])

// Each item id's newest revision. Older revisions stay as history.
export const latest = (db: Db, where: SQL | undefined) =>
  db
    .select()
    .from(MeetingItemTable)
    .where(
      and(
        where,
        sql`${MeetingItemTable.revision} = (select max(r.revision) from meeting_item r where r.id = ${MeetingItemTable.id})`,
      ),
    )
    .orderBy(asc(MeetingItemTable.created_at), asc(MeetingItemTable.id))
    .all()
    .pipe(Effect.orDie)

export const peopleMap = (db: Db) =>
  db
    .select()
    .from(MeetingPersonTable)
    .all()
    .pipe(
      Effect.orDie,
      Effect.map((rows) => new Map(rows.map((row) => [row.id, row]))),
    )

// A merged person resolves to the person it was merged into. The step bound stops a corrupt cycle.
const canonical = (people: Map<string, PersonRow>, id: string) => {
  const step = (current: string, left: number): string => {
    const next = people.get(current)?.merged_into
    return next && left > 0 ? step(next, left - 1) : current
  }
  return step(id, 16)
}

const person = (people: Map<string, PersonRow>, id: string) => {
  const target = canonical(people, id)
  return { id: target, name: people.get(target)?.name ?? target }
}

const asserterOf = (people: Map<string, PersonRow>, code: string): Meeting.CardItem["asserter"] =>
  code === "me"
    ? "me"
    : code.startsWith("unknown:")
      ? { unknown: Number(code.slice("unknown:".length)) }
      : person(people, code)

const cardItemOf = (people: Map<string, PersonRow>, row: ItemRow, status: Meeting.CardItem["status"]) => ({
  id: row.id,
  text: row.text,
  asserter: asserterOf(people, row.asserter),
  quote: row.quote,
  startMs: row.start_ms ?? undefined,
  status,
  sentToMaestro: row.sent_to_maestro,
})

export const commitmentOf = (people: Map<string, PersonRow>, row: ItemRow, status: Meeting.CardItem["status"]) => ({
  ...cardItemOf(people, row, status),
  owner: row.owner === null || row.owner === "me" ? ("me" as const) : person(people, row.owner),
  counterparty:
    row.counterparty === null
      ? undefined
      : row.counterparty === "me"
        ? ("me" as const)
        : person(people, row.counterparty),
  due: row.due ?? undefined,
  state: row.state ?? ("proposed" as const),
})

export const card = Effect.fn("MeetingMemory.card")(function* (db: Db, meeting: MeetingRow) {
  const people = yield* peopleMap(db)
  const rows = yield* latest(db, eq(MeetingItemTable.meeting_id, meeting.id))
  const proposals = yield* db
    .select()
    .from(MeetingProposalTable)
    .where(eq(MeetingProposalTable.meeting_id, meeting.id))
    .all()
    .pipe(Effect.orDie)
  // A dismissed item stays in memory but leaves the card.
  const shown = rows.flatMap((row) => (row.status === "dismissed" ? [] : [{ row, status: row.status }]))
  const items = (kind: ItemRow["kind"]) => shown.filter((item) => item.row.kind === kind)
  return {
    status: meeting.card_status,
    error: meeting.card_error ?? undefined,
    summary: meeting.card_summary,
    decisions: items("decision").map((item) => cardItemOf(people, item.row, item.status)),
    commitments: items("commitment").map((item) => commitmentOf(people, item.row, item.status)),
    questions: items("question").map((item) => cardItemOf(people, item.row, item.status)),
    suggestions: items("suggestion").map((item) => ({
      ...cardItemOf(people, item.row, item.status),
      for: item.row.for ?? ("owner" as const),
    })),
    newPeople: proposals
      .filter((proposal) => proposal.verdict === null)
      .map((proposal) => ({
        proposalID: proposal.id,
        name: proposal.name,
        mergeWith: proposal.merge_with ? person(people, proposal.merge_with) : undefined,
      })),
  } satisfies Meeting.Card
})

// "answers" counts the seat's answers, which the meeting record does not store yet, so it is 0.
export const summaries = Effect.fn("MeetingMemory.summaries")(function* (db: Db, meetings: MeetingRow[]) {
  if (meetings.length === 0) return []
  const people = yield* peopleMap(db)
  const rows = yield* latest(
    db,
    inArray(
      MeetingItemTable.meeting_id,
      meetings.map((meeting) => meeting.id),
    ),
  )
  return meetings.map((meeting): Meeting.Summary => {
    const items = rows.filter((row) => row.meeting_id === meeting.id && row.status !== "dismissed")
    const commitments = items.filter((row) => row.kind === "commitment")
    const ids = new Set(
      items
        .flatMap((row) => [row.asserter, row.owner, row.counterparty])
        .flatMap((code) => (code && code !== "me" && !code.startsWith("unknown:") ? [canonical(people, code)] : [])),
    )
    return {
      id: meeting.id,
      title: meeting.title,
      startedAt: meeting.time_started,
      endedAt: meeting.time_ended ?? undefined,
      people: [...ids].map((id) => person(people, id)),
      retention: meeting.retention,
      consent: meeting.consent,
      counts: {
        decisions: items.filter((row) => row.kind === "decision").length,
        commitments: commitments.length,
        openCommitments: commitments.filter((row) => OPEN.has(row.state ?? "proposed")).length,
        answers: 0,
      },
    }
  })
})

// Plain LIKE over titles and item text. Meeting ids sort newest first, so the cursor is the last id of the page.
export const list = Effect.fn("MeetingMemory.list")(function* (db: Db, input: Meeting.ListQuery) {
  const people = yield* peopleMap(db)
  const wanted = input.person?.toLowerCase()
  const matched = new Set(
    wanted === undefined
      ? []
      : [...people.values()]
          .filter(
            (row) =>
              row.id === input.person || [row.name, ...row.aliases].some((name) => name.toLowerCase().includes(wanted)),
          )
          .map((row) => canonical(people, row.id)),
  )
  const ids = [...people.keys()].filter((id) => matched.has(canonical(people, id)))
  if (wanted !== undefined && ids.length === 0) return { items: [], next: undefined }
  const limit = Math.min(input.limit ?? LIST_LIMIT, LIST_MAX)
  const rows = yield* db
    .select()
    .from(MeetingTable)
    .where(
      and(
        input.before ? gt(MeetingTable.id, input.before) : undefined,
        input.query
          ? or(
              contains(MeetingTable.title, input.query),
              sql`exists (select 1 from meeting_item where meeting_id = ${MeetingTable.id} and ${contains(MeetingItemTable.text, input.query)})`,
            )
          : undefined,
        wanted === undefined
          ? undefined
          : sql`exists (select 1 from meeting_item where meeting_id = ${MeetingTable.id} and (${inArray(MeetingItemTable.asserter, ids)} or ${inArray(MeetingItemTable.owner, ids)} or ${inArray(MeetingItemTable.counterparty, ids)}))`,
      ),
    )
    .orderBy(asc(MeetingTable.id))
    .limit(limit + 1)
    .all()
    .pipe(Effect.orDie)
  const page = rows.slice(0, limit)
  return { items: yield* summaries(db, page), next: rows.length > limit ? page.at(-1)?.id : undefined }
})

const contains = (column: AnyColumn, query: string) =>
  sql`${column} like ${`%${query.replace(/[\\%_]/g, "\\$&")}%`} escape '\\'`
