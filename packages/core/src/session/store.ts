export * as SessionStore from "./store"
// The scope the store keeps, importable beside it from `@orchestra/core/session/store`.
export { SessionScope } from "./scope"

import { asc, eq, sql } from "drizzle-orm"
import { Context, Effect, Layer, Schema, Semaphore } from "effect"
import { ProviderMetadata } from "@orchestra/schema/llm"
import type { Permission } from "@orchestra/schema/permission"
import { Database } from "../database/database"
import { makeGlobalNode } from "../effect/app-node"
import { SessionHistory } from "./history"
import { MessageDecodeError } from "./error"
import { SessionMessage } from "./message"
import { SessionSchema } from "./schema"
import { SessionScope } from "./scope"
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
  /**
   * Pending or running tools on assistant rows hidden by the latest compaction.
   * Selects the message id, call id, and provider fields only. Not tool output or other message types.
   */
  readonly unsettledHiddenTools: (sessionID: SessionSchema.ID) => Effect.Effect<ReadonlyArray<UnsettledHiddenTool>>
  readonly message: (
    messageID: SessionMessage.ID,
  ) => Effect.Effect<{ readonly sessionID: SessionSchema.ID; readonly message: SessionMessage.Message } | undefined>
  /** The Session's own permission rules as V2 rules; empty for none or an unknown Session. */
  readonly permissions: (sessionID: SessionSchema.ID) => Effect.Effect<Permission.Ruleset>
  /** The Session's scope and its use so far; undefined for an unscoped or unknown Session. */
  readonly scope: (sessionID: SessionSchema.ID) => Effect.Effect<SessionScope.State | undefined>
  /** Writes the scope of a Session that has none, once, before its first prompt. */
  readonly narrow: (sessionID: SessionSchema.ID, scope: SessionScope.Scope) => Effect.Effect<void, SessionScope.WriteError>
  /**
   * Decides a skill load or tool call against the Session's scope and records the outcome: the use when admitted, the
   * deviation when refused. Admits everything for an unscoped Session.
   */
  readonly charge: (sessionID: SessionSchema.ID, request: SessionScope.Request) => Effect.Effect<SessionScope.Decision>
}

export class Service extends Context.Service<Service, Interface>()("@orchestra/v2/SessionStore") {}

export interface UnsettledHiddenTool {
  readonly assistantMessageID: SessionMessage.ID
  readonly callID: string
  readonly provider: {
    readonly executed: boolean
    readonly metadata?: ProviderMetadata
  }
}

// json_extract yields SQLite's 0/1 for a JSON boolean, and text for an object.
const hiddenProvider = (row: { readonly executed: unknown; readonly metadata: unknown }) =>
  Effect.gen(function* () {
    if (row.metadata === null || row.metadata === undefined)
      return { executed: row.executed === true || row.executed === 1 }
    const json = typeof row.metadata === "string"
      ? yield* Schema.decodeUnknownEffect(Schema.UnknownFromJsonString)(row.metadata)
      : row.metadata
    const metadata = yield* Schema.decodeUnknownEffect(ProviderMetadata)(json)
    return { executed: row.executed === true || row.executed === 1, metadata }
  }).pipe(Effect.orDie)

const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const { db } = yield* Database.Service
    const decodeMessage = Schema.decodeUnknownEffect(SessionMessage.Message)
    const decodeScope = Schema.decodeUnknownEffect(SessionScope.Scope)
    const decodeState = Schema.decodeUnknownEffect(SessionScope.State)
    // Scope uses are read-modify-writes of one metadata key; concurrent tool calls of a turn must not lose a count.
    const scopeWrites = Semaphore.makeUnsafe(1)
    // A stored scope that does not decode is a defect: reading it as no scope would widen the Session's grant.
    const readScope = Effect.fnUntraced(function* (sessionID: SessionSchema.ID) {
      const row = yield* db
        .select({ metadata: SessionTable.metadata })
        .from(SessionTable)
        .where(eq(SessionTable.id, sessionID))
        .get()
        .pipe(Effect.orDie)
      const stored = row?.metadata?.[SessionScope.KEY]
      return { found: row !== undefined, state: stored === undefined ? undefined : yield* decodeState(stored).pipe(Effect.orDie) }
    })
    // Writes only this key in SQL, so an execution host's own read-modify-write of its key cannot lose a count.
    const writeScope = (sessionID: SessionSchema.ID, state: SessionScope.State) =>
      db
        .update(SessionTable)
        .set({
          metadata: sql`json_set(coalesce(${SessionTable.metadata}, '{}'), ${`$.${SessionScope.KEY}`}, json(${JSON.stringify(state)}))`,
        })
        .where(eq(SessionTable.id, sessionID))
        .run()
        .pipe(Effect.orDie, Effect.asVoid)

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
      unsettledHiddenTools: Effect.fn("SessionStore.unsettledHiddenTools")(function* (sessionID) {
        // session_message_session_type_seq_idx is (session_id, type, seq). Hidden means seq before the latest compaction.
        const rows = yield* db
          .all<{
            assistantMessageID: string
            callID: unknown
            executed: unknown
            metadata: unknown
          }>(sql`SELECT ${SessionMessageTable.id} AS assistantMessageID,
              json_extract(part.value, '$.id') AS callID,
              json_extract(part.value, '$.provider.executed') AS executed,
              json_extract(part.value, '$.provider.metadata') AS metadata
            FROM ${SessionMessageTable} INDEXED BY session_message_session_type_seq_idx
            INNER JOIN json_each(${SessionMessageTable.data}, '$.content') AS part
            WHERE ${SessionMessageTable.session_id} = ${sessionID}
              AND ${SessionMessageTable.type} = 'assistant'
              AND ${SessionMessageTable.seq} < (
                SELECT compaction.seq FROM ${SessionMessageTable} AS compaction INDEXED BY session_message_session_type_seq_idx
                WHERE compaction.session_id = ${sessionID} AND compaction.type = 'compaction'
                ORDER BY compaction.seq DESC
                LIMIT 1
              )
              AND json_extract(part.value, '$.type') = 'tool'
              AND json_extract(part.value, '$.state.status') IN ('pending', 'running')`)
          .pipe(Effect.orDie)
        return yield* Effect.forEach(rows, (row) =>
          Effect.gen(function* () {
            if (typeof row.callID !== "string") return yield* Effect.die("hidden tool call id is not text")
            return {
              assistantMessageID: SessionMessage.ID.make(row.assistantMessageID),
              callID: row.callID,
              provider: yield* hiddenProvider(row),
            }
          }),
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
      scope: Effect.fn("SessionStore.scope")(function* (sessionID) {
        return (yield* readScope(sessionID)).state
      }),
      narrow: Effect.fn("SessionStore.narrow")(function* (sessionID, scope) {
        const decoded = yield* decodeScope(scope).pipe(
          Effect.mapError(() => new SessionScope.WriteError({ sessionID, reason: "invalid-scope" })),
        )
        yield* scopeWrites.withPermit(
          Effect.gen(function* () {
            const current = yield* readScope(sessionID)
            if (!current.found) return yield* new SessionScope.WriteError({ sessionID, reason: "missing-session" })
            if (current.state) return yield* new SessionScope.WriteError({ sessionID, reason: "already-scoped" })
            yield* writeScope(sessionID, SessionScope.initial(decoded))
          }),
        )
      }),
      charge: Effect.fn("SessionStore.charge")(function* (sessionID, request) {
        return yield* scopeWrites.withPermit(
          Effect.gen(function* () {
            const current = yield* readScope(sessionID)
            if (!current.state) return { admitted: true } as const
            const deviation = SessionScope.decide(current.state, request)
            yield* writeScope(
              sessionID,
              deviation
                ? { ...current.state, deviations: [...current.state.deviations, deviation] }
                : SessionScope.admit(current.state, request),
            )
            return deviation ? ({ admitted: false, deviation } as const) : ({ admitted: true } as const)
          }),
        )
      }),
    })
  }),
)

export const node = makeGlobalNode({ service: Service, layer, deps: [Database.node] })
