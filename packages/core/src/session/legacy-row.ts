export * as SessionLegacyRow from "./legacy-row"

import { eq } from "drizzle-orm"
import { Effect } from "effect"
import { Database } from "../database/database"
import { EventV2 } from "../event"
import { ModelV2 } from "../model"
import { ProviderV2 } from "../provider"
import { Event, MessageID, PartID, type SessionInfo } from "@orchestra/schema/session-v1"
import { SessionSchema } from "./schema"
import { SessionTable } from "./sql"

// Rename and delete reuse the shared `session.updated` / `session.deleted` events and their projector, so V1 and V2
// read one Session row. Both events carry the whole V1 Session, rebuilt here from the stored row.

/** Returns false only when the Session is missing. */
export const rename = Effect.fn("SessionLegacyRow.rename")(function* (
  db: Database.Interface["db"],
  events: EventV2.Interface,
  input: { readonly sessionID: SessionSchema.ID; readonly title: string },
) {
  const row = yield* db.select().from(SessionTable).where(eq(SessionTable.id, input.sessionID)).get().pipe(Effect.orDie)
  if (!row) return false
  const info = toInfo(row)
  yield* events.publish(Event.Updated, {
    sessionID: input.sessionID,
    info: { ...info, title: input.title, time: { ...info.time, updated: Date.now() } },
  })
  return true
})

/** Deletes the Session and its children. Messages, parts and inputs cascade with the row. Returns false when missing. */
export const remove: (
  db: Database.Interface["db"],
  events: EventV2.Interface,
  sessionID: SessionSchema.ID,
) => Effect.Effect<boolean> = Effect.fn("SessionLegacyRow.remove")(function* (db, events, sessionID) {
  const row = yield* db.select().from(SessionTable).where(eq(SessionTable.id, sessionID)).get().pipe(Effect.orDie)
  if (!row) return false
  const children = yield* db
    .select({ id: SessionTable.id })
    .from(SessionTable)
    .where(eq(SessionTable.parent_id, sessionID))
    .all()
    .pipe(Effect.orDie)
  yield* Effect.forEach(children, (child) => remove(db, events, child.id), { discard: true })
  yield* events.publish(Event.Deleted, { sessionID, info: toInfo(row) })
  yield* events.remove(sessionID)
  return true
})

export function toInfo(row: typeof SessionTable.$inferSelect): SessionInfo {
  return {
    id: row.id,
    slug: row.slug,
    projectID: row.project_id,
    workspaceID: row.workspace_id ?? undefined,
    directory: row.directory,
    path: row.path ?? undefined,
    parentID: row.parent_id ?? undefined,
    title: row.title,
    agent: row.agent ?? undefined,
    model: row.model
      ? { id: ModelV2.ID.make(row.model.id), providerID: ProviderV2.ID.make(row.model.providerID), variant: row.model.variant }
      : undefined,
    version: row.version,
    summary:
      row.summary_additions !== null || row.summary_deletions !== null || row.summary_files !== null
        ? {
            additions: row.summary_additions ?? 0,
            deletions: row.summary_deletions ?? 0,
            files: row.summary_files ?? 0,
            diffs: row.summary_diffs ?? undefined,
          }
        : undefined,
    cost: row.cost,
    tokens: {
      input: row.tokens_input,
      output: row.tokens_output,
      reasoning: row.tokens_reasoning,
      cache: { read: row.tokens_cache_read, write: row.tokens_cache_write },
    },
    metadata: row.metadata ?? undefined,
    revert: row.revert
      ? {
          messageID: MessageID.make(row.revert.messageID),
          partID: row.revert.partID ? PartID.make(row.revert.partID) : undefined,
          snapshot: row.revert.snapshot,
          diff: row.revert.diff,
        }
      : undefined,
    permission: row.permission ? [...row.permission] : undefined,
    time: {
      created: row.time_created,
      updated: row.time_updated,
      compacting: row.time_compacting ?? undefined,
      archived: row.time_archived ?? undefined,
    },
  }
}
