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

export function hashOwner(owner: string) {
  return createHash("sha256").update(owner).digest("hex")
}

export function adoptRows(db: Db) {
  return Effect.gen(function* () {
    yield* collapse(db, InboxRowTable, (row) => `${row.source}\0${row.external_id}`, (row) =>
      and(eq(InboxRowTable.owner, row.owner), eq(InboxRowTable.source, row.source), eq(InboxRowTable.external_id, row.external_id)),
    )
    yield* collapse(db, InboxDraftTable, (row) => row.list_id, (row) =>
      and(eq(InboxDraftTable.owner, row.owner), eq(InboxDraftTable.list_id, row.list_id)),
    )
    yield* collapse(db, InboxEgressTable, (row) => row.id, (row) =>
      and(eq(InboxEgressTable.owner, row.owner), eq(InboxEgressTable.id, row.id)),
    )
    yield* collapse(db, InboxAccountTable, (row) => row.source, (row) =>
      and(eq(InboxAccountTable.owner, row.owner), eq(InboxAccountTable.source, row.source)),
    )
    yield* collapse(db, InboxFeedTable, (row) => row.id, (row) =>
      and(eq(InboxFeedTable.owner, row.owner), eq(InboxFeedTable.id, row.id)),
    )
    yield* collapse(db, InboxCalendarTable, (row) => `${row.generation}\0${row.calendar}`, (row) =>
      and(
        eq(InboxCalendarTable.owner, row.owner),
        eq(InboxCalendarTable.generation, row.generation),
        eq(InboxCalendarTable.calendar, row.calendar),
      ),
    )
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
  db: Db,
  table: { owner: typeof InboxRowTable.owner },
  key: (row: T) => string,
  where: (row: T) => ReturnType<typeof and>,
) {
  return Effect.gen(function* () {
    const rows = (yield* db.select().from(table as never).all().pipe(Effect.orDie)) as T[]
    const seen = new Set(rows.filter((row) => row.owner === installOwner).map(key))
    for (const row of rows) {
      if (row.owner === installOwner) continue
      if (seen.has(key(row))) {
        yield* db.delete(table as never).where(where(row)).run().pipe(Effect.orDie)
        continue
      }
      yield* db
        .update(table as never)
        .set({ owner: installOwner })
        .where(where(row))
        .run()
        .pipe(Effect.orDie)
      seen.add(key(row))
    }
  })
}

function withOwner(value: Credential.Value, owner: string): Credential.Value {
  if (!("metadata" in value) || !value.metadata || typeof value.metadata !== "object") return value
  return { ...value, metadata: { ...value.metadata, owner } }
}

// Hashed project slots move to the installation slot. The unhashed legacy id is left alone.
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
