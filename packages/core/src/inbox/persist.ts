import { and, eq } from "drizzle-orm"
import { Effect } from "effect"
import { canonical } from "../session/meeting-memory"
import { MeetingItemTable, MeetingPersonTable } from "../session/meeting-memory.sql"
import { Database } from "../database/database"
import { open, type Saved } from "./store"
import { InboxDraftTable, InboxEgressTable, InboxRowTable } from "./sql"
import type { Person } from "./types"

export type Db = Database.Interface["db"]
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0]

export function known(store: ReturnType<typeof open>, id: string) {
  return store.snapshot().rows.some((row) => row.listId === id)
}

export function load(db: Db | Tx, owner: string) {
  return Effect.gen(function* () {
    const rows = yield* db.select().from(InboxRowTable).where(eq(InboxRowTable.owner, owner)).all().pipe(Effect.orDie)
    const drafts = yield* db
      .select()
      .from(InboxDraftTable)
      .where(eq(InboxDraftTable.owner, owner))
      .all()
      .pipe(Effect.orDie)
    const sent = yield* db
      .select()
      .from(InboxEgressTable)
      .where(eq(InboxEgressTable.owner, owner))
      .all()
      .pipe(Effect.orDie)
    const next = rows.reduce((highest, row) => {
      const value = Number(row.list_id.slice("in_".length))
      return Number.isInteger(value) && value >= highest ? value + 1 : highest
    }, 1)
    const saved: Saved = {
      rows: rows.map((row) => ({
        listId: row.list_id,
        source: row.source,
        externalId: row.external_id,
        actor: row.actor,
        snippet: row.snippet,
        ...(row.revision === null ? {} : { revision: row.revision }),
        threadId: row.thread_id,
        reply: row.reply,
        ...(row.deep_link ? { deepLink: row.deep_link } : {}),
        ...(row.person_id ? { personId: row.person_id } : {}),
        ...(row.commitment_id ? { commitmentId: row.commitment_id } : {}),
        open: row.open,
        ...(row.reveal_at !== null ? { revealAt: row.reveal_at } : {}),
      })),
      drafts: drafts.map((row) => ({ id: row.list_id, text: row.text, sent: row.sent })),
      sent: sent.map((row) => ({ text: row.text, threadId: row.thread_id, listId: row.list_id })),
      next,
    }
    return saved
  })
}

export function save(tx: Tx, owner: string, saved: Saved) {
  return Effect.gen(function* () {
    yield* tx.delete(InboxRowTable).where(eq(InboxRowTable.owner, owner)).run()
    yield* tx.delete(InboxDraftTable).where(eq(InboxDraftTable.owner, owner)).run()
    yield* tx.delete(InboxEgressTable).where(eq(InboxEgressTable.owner, owner)).run()
    if (saved.rows.length > 0)
      yield* tx
        .insert(InboxRowTable)
        .values(
          saved.rows.map((row) => ({
            owner,
            source: row.source,
            external_id: row.externalId,
            list_id: row.listId,
            actor: row.actor,
            snippet: row.snippet,
            revision: row.revision ?? null,
            thread_id: row.threadId,
            reply: row.reply,
            deep_link: row.deepLink ?? null,
            person_id: row.personId ?? null,
            commitment_id: row.commitmentId ?? null,
            open: row.open,
            reveal_at: row.revealAt ?? null,
          })),
        )
        .run()
    if (saved.drafts.length > 0)
      yield* tx
        .insert(InboxDraftTable)
        .values(saved.drafts.map((draft) => ({ owner, list_id: draft.id, text: draft.text, sent: draft.sent })))
        .run()
    if (saved.sent.length > 0)
      yield* tx
        .insert(InboxEgressTable)
        .values(
          saved.sent.map((row, index) => ({
            owner,
            id: `eg_${index}`,
            list_id: row.listId,
            text: row.text,
            thread_id: row.threadId,
          })),
        )
        .run()
  }).pipe(Effect.orDie)
}

export function loadPeople(db: Db | Tx) {
  return Effect.gen(function* () {
    const rows = yield* db.select().from(MeetingPersonTable).all().pipe(Effect.orDie)
    const items = yield* db
      .select()
      .from(MeetingItemTable)
      .where(eq(MeetingItemTable.kind, "commitment"))
      .all()
      .pipe(Effect.orDie)
    const people = new Map(rows.map((row) => [row.id, row]))
    const newest = items.reduce((found, item) => {
      const current = found.get(item.id)
      if (!current || item.revision > current.revision) found.set(item.id, item)
      return found
    }, new Map<string, (typeof items)[number]>())
    return addressBook(people, [...newest.values()])
  })
}

function addressBook(
  people: Map<string, typeof MeetingPersonTable.$inferSelect>,
  items: (typeof MeetingItemTable.$inferSelect)[],
): Person[] {
  const openCommitments = new Map(
    items
      .filter((item) => item.state === "proposed" || item.state === "accepted" || item.state === "overdue")
      .flatMap((item) =>
        [item.owner, item.counterparty]
          .filter((id): id is string => id !== null && id !== "me")
          .map((id) => [canonical(people, id), item.id] as const),
      ),
  )
  const grouped = new Map<string, { emails: string[]; handles: string[] }>()
  for (const row of people.values()) {
    const id = canonical(people, row.id)
    const bucket = grouped.get(id) ?? { emails: [], handles: [] }
    for (const name of [row.name, ...row.aliases]) {
      if (name.includes("@")) bucket.emails.push(name)
      else bucket.handles.push(name)
    }
    grouped.set(id, bucket)
  }
  return [...grouped.entries()].map(([id, bucket]) => ({
    id,
    emails: bucket.emails,
    handles: bucket.handles,
    ...(openCommitments.has(id) ? { openCommitmentId: openCommitments.get(id) } : {}),
  }))
}
