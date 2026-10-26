export * as SessionStore from "./store"

import { asc, eq } from "drizzle-orm"
import { Context, Effect, Layer, Schema } from "effect"
import type { Permission } from "@orchestra/schema/permission"
import { Database } from "../database/database"
import { makeGlobalNode } from "../effect/app-node"
import { SessionHistory } from "./history"
import { MessageDecodeError } from "./error"
import { SessionMessage } from "./message"
import { SessionSchema } from "./schema"
import { SessionMessageTable, SessionTable } from "./sql"
import { fromRow } from "./info"

export interface Interface {
  readonly get: (sessionID: SessionSchema.ID) => Effect.Effect<SessionSchema.Info | undefined>
  readonly context: (sessionID: SessionSchema.ID) => Effect.Effect<SessionMessage.Message[], MessageDecodeError>
  readonly runnerContext: (
    sessionID: SessionSchema.ID,
    baselineSeq: number,
  ) => Effect.Effect<SessionMessage.Message[], MessageDecodeError>
  /** Every stored message in order with its sequence, including history behind the latest compaction. */
  readonly entries: (
    sessionID: SessionSchema.ID,
  ) => Effect.Effect<ReadonlyArray<{ readonly seq: number; readonly message: SessionMessage.Message }>, MessageDecodeError>
  readonly message: (
    messageID: SessionMessage.ID,
  ) => Effect.Effect<{ readonly sessionID: SessionSchema.ID; readonly message: SessionMessage.Message } | undefined>
  /** The Session's own permission rules as V2 rules; empty for none or an unknown Session. */
  readonly permissions: (sessionID: SessionSchema.ID) => Effect.Effect<Permission.Ruleset>
}

export class Service extends Context.Service<Service, Interface>()("@orchestra/v2/SessionStore") {}

const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const { db } = yield* Database.Service
    const decodeMessage = Schema.decodeUnknownEffect(SessionMessage.Message)

    return Service.of({
      get: Effect.fn("SessionStore.get")(function* (sessionID) {
        const row = yield* db.select().from(SessionTable).where(eq(SessionTable.id, sessionID)).get().pipe(Effect.orDie)
        return row ? fromRow(row) : undefined
      }),
      context: Effect.fn("SessionStore.context")(function* (sessionID) {
        return yield* SessionHistory.load(db, sessionID)
      }),
      runnerContext: Effect.fn("SessionStore.runnerContext")(function* (sessionID, baselineSeq) {
        return yield* SessionHistory.loadForRunner(db, sessionID, baselineSeq)
      }),
      entries: Effect.fn("SessionStore.entries")(function* (sessionID) {
        const rows = yield* db
          .select()
          .from(SessionMessageTable)
          .where(eq(SessionMessageTable.session_id, sessionID))
          .orderBy(asc(SessionMessageTable.seq))
          .all()
          .pipe(Effect.orDie)
        return yield* Effect.forEach(rows, (row) =>
          decodeMessage({ ...row.data, id: row.id, type: row.type }).pipe(
            Effect.map((message) => ({ seq: row.seq, message })),
            Effect.mapError(
              () =>
                new MessageDecodeError({
                  sessionID: SessionSchema.ID.make(row.session_id),
                  messageID: SessionMessage.ID.make(row.id),
                }),
            ),
          ),
        )
      }),
      message: Effect.fn("SessionStore.message")(function* (messageID) {
        const row = yield* db
          .select()
          .from(SessionMessageTable)
          .where(eq(SessionMessageTable.id, messageID))
          .get()
          .pipe(Effect.orDie)
        return row
          ? {
              sessionID: SessionSchema.ID.make(row.session_id),
              message: yield* decodeMessage({ ...row.data, id: row.id, type: row.type }).pipe(Effect.orDie),
            }
          : undefined
      }),
      permissions: Effect.fn("SessionStore.permissions")(function* (sessionID) {
        const row = yield* db
          .select({ permission: SessionTable.permission })
          .from(SessionTable)
          .where(eq(SessionTable.id, sessionID))
          .get()
          .pipe(Effect.orDie)
        // The column keeps legacy rule fields.
        return (row?.permission ?? []).map((rule) => ({
          action: rule.permission,
          resource: rule.pattern,
          effect: rule.action,
        }))
      }),
    })
  }),
)

export const node = makeGlobalNode({ service: Service, layer, deps: [Database.node] })
