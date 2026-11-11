import { createHash } from "node:crypto"
import { and, eq } from "drizzle-orm"
import { Effect } from "effect"
import { IntegrationID } from "@orchestra/schema/integration-id"
import { Credential } from "../credential"
import type { Database } from "../database/database"
import { accountSources } from "./remote"
import {
  InboxAccountTable,
  InboxCalendarTable,
  InboxDraftTable,
  InboxEgressTable,
  InboxFeedTable,
  InboxRowTable,
  InboxSlackTable,
} from "./sql"

// One inbox per installation. Not the open project, and not the user's home directory.
export const installOwner = "install"

type Db = Database.Interface["db"]
type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0]

export function hashOwner(owner: string) {
  return createHash("sha256").update(owner).digest("hex")
}

export function adoptRows(db: Db | Tx) {
  return Effect.gen(function* () {
    const rows = yield* db.select().from(InboxRowTable).all().pipe(Effect.orDie)
    yield* collapse(rows, (row) => `${row.source}\0${row.external_id}`, (row, keep) => {
      const match = and(
        eq(InboxRowTable.owner, row.owner),
        eq(InboxRowTable.source, row.source),
        eq(InboxRowTable.external_id, row.external_id),
      )
      if (keep) return db.update(InboxRowTable).set({ owner: installOwner }).where(match).run().pipe(Effect.orDie)
      return db.delete(InboxRowTable).where(match).run().pipe(Effect.orDie)
    })
    const drafts = yield* db.select().from(InboxDraftTable).all().pipe(Effect.orDie)
    yield* collapse(drafts, (row) => row.list_id, (row, keep) => {
      const match = and(eq(InboxDraftTable.owner, row.owner), eq(InboxDraftTable.list_id, row.list_id))
      if (keep) return db.update(InboxDraftTable).set({ owner: installOwner }).where(match).run().pipe(Effect.orDie)
      return db.delete(InboxDraftTable).where(match).run().pipe(Effect.orDie)
    })
    const sent = yield* db.select().from(InboxEgressTable).all().pipe(Effect.orDie)
    yield* collapse(sent, (row) => row.id, (row, keep) => {
      const match = and(eq(InboxEgressTable.owner, row.owner), eq(InboxEgressTable.id, row.id))
      if (keep) return db.update(InboxEgressTable).set({ owner: installOwner }).where(match).run().pipe(Effect.orDie)
      return db.delete(InboxEgressTable).where(match).run().pipe(Effect.orDie)
    })
    const accounts = yield* db.select().from(InboxAccountTable).all().pipe(Effect.orDie)
    yield* collapse(accounts, (row) => row.source, (row, keep) => {
      const match = and(eq(InboxAccountTable.owner, row.owner), eq(InboxAccountTable.source, row.source))
      if (keep) return db.update(InboxAccountTable).set({ owner: installOwner }).where(match).run().pipe(Effect.orDie)
      return db.delete(InboxAccountTable).where(match).run().pipe(Effect.orDie)
    })
    const feeds = yield* db.select().from(InboxFeedTable).all().pipe(Effect.orDie)
    yield* collapse(feeds, (row) => row.id, (row, keep) => {
      const match = and(eq(InboxFeedTable.owner, row.owner), eq(InboxFeedTable.id, row.id))
      if (keep) return db.update(InboxFeedTable).set({ owner: installOwner }).where(match).run().pipe(Effect.orDie)
      return db.delete(InboxFeedTable).where(match).run().pipe(Effect.orDie)
    })
    const calendars = yield* db.select().from(InboxCalendarTable).all().pipe(Effect.orDie)
    yield* collapse(calendars, (row) => `${row.generation}\0${row.calendar}`, (row, keep) => {
      const match = and(
        eq(InboxCalendarTable.owner, row.owner),
        eq(InboxCalendarTable.generation, row.generation),
        eq(InboxCalendarTable.calendar, row.calendar),
      )
      if (keep) return db.update(InboxCalendarTable).set({ owner: installOwner }).where(match).run().pipe(Effect.orDie)
      return db.delete(InboxCalendarTable).where(match).run().pipe(Effect.orDie)
    })
    const slack = yield* db.select().from(InboxSlackTable).all().pipe(Effect.orDie)
    let kept = slack.some((row) => row.owner === installOwner)
    for (const row of slack) {
      if (row.owner === installOwner) continue
      if (kept) {
        yield* db.delete(InboxSlackTable).where(eq(InboxSlackTable.owner, row.owner)).run().pipe(Effect.orDie)
        continue
      }
      yield* db
        .update(InboxSlackTable)
        .set({ owner: installOwner })
        .where(eq(InboxSlackTable.owner, row.owner))
        .run()
        .pipe(Effect.orDie)
      kept = true
    }
  })
}

function collapse<T extends { owner: string }>(
  rows: readonly T[],
  key: (row: T) => string,
  write: (row: T, keep: boolean) => Effect.Effect<unknown>,
) {
  return Effect.gen(function* () {
    const seen = new Set(rows.filter((row) => row.owner === installOwner).map(key))
    for (const row of rows) {
      if (row.owner === installOwner) continue
      const keep = !seen.has(key(row))
      yield* write(row, keep)
      if (keep) seen.add(key(row))
    }
  })
}

function withOwner(value: Credential.Value, owner: string): Credential.Value {
  if (!("metadata" in value) || !value.metadata || typeof value.metadata !== "object") return value
  return { ...value, metadata: { ...value.metadata, owner } }
}

// A 64-hex project slot moves to the installation slot. An unhashed id, and any other suffix, is left alone.
export function adoptCredentials(credentials: Credential.Interface) {
  return Effect.gen(function* () {
    const rows = yield* credentials.all()
    for (const source of [...accountSources, "slack" as const]) {
      const prefix = `inbox.${source}.`
      const slot = IntegrationID.make(`${prefix}${hashOwner(installOwner)}`)
      const current = rows.find((row) => row.integrationID === slot)
      if (current && !(yield* credentials.inheritedFrom(current.id))) continue
      const legacy = []
      for (const row of rows) {
        if (!row.integrationID.startsWith(prefix) || row.integrationID === slot) continue
        if (!/^[0-9a-f]{64}$/.test(row.integrationID.slice(prefix.length))) continue
        if (yield* credentials.inheritedFrom(row.id)) continue
        legacy.push(row)
      }
      const newest = legacy.at(-1)
      if (!newest) continue
      yield* credentials.create({
        integrationID: slot,
        value: withOwner(newest.value, installOwner),
        label: newest.label,
      })
      for (const row of legacy) yield* credentials.remove(row.id).pipe(Effect.ignore)
    }
  })
}
