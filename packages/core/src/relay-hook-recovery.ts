export * as RelayHookRecovery from "./relay-hook-recovery"

import { and, asc, eq, gt, isNull } from "drizzle-orm"
import { Context, Effect, Layer } from "effect"
import { versionedType } from "@orchestra/schema/event"
import { RelayHook } from "@orchestra/schema/relay-hook"
import { Database } from "./database/database"
import { makeLocationNode } from "./effect/app-node"
import { EventTable } from "./event/sql"
import { Location } from "./location"
import { Relay } from "./relay"
import { RelayHookShipper } from "./relay-hook-shipper"
import { SessionTable } from "./session/sql"

export interface Result {
  readonly scope: "implicit-local" | "unsupported-workspace"
  // Attempts include already-receipted and invalid decisions, never imply receipt success.
  readonly attemptedSessions: number
  // Observable DB/ship/record failures. The existing shipper absorbs ledger-read failures internally.
  readonly errors: number
}
export interface Interface {
  readonly recover: () => Effect.Effect<Result>
}
export class Service extends Context.Service<Service, Interface>()("@orchestra/RelayHookRecovery") {}

const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const database = yield* Database.Service
    const relay = yield* Relay.Service
    const location = yield* Location.Service
    return Service.of({
      recover: Effect.fn("RelayHookRecovery.recover")(function* (): Effect.fn.Return<Result> {
        if (location.workspaceID !== undefined)
          return { scope: "unsupported-workspace", attemptedSessions: 0, errors: 0 }
        const result = { scope: "implicit-local" as const, attemptedSessions: 0, errors: 0 }
        const failed = (cause: unknown) =>
          Effect.sync(() => result.errors++).pipe(
            Effect.andThen(Effect.logWarning("Relay hook recovery failed", { cause, directory: location.directory })),
            Effect.asVoid,
          )
        // Observe record errors before the shipper absorbs them, without replacing its locking or dedup.
        const recording = Relay.Service.of({
          ...relay,
          record: (installID, body) => relay.record(installID, body).pipe(Effect.tapCause(failed)),
        })
        let cursor: typeof SessionTable.$inferSelect.id | undefined
        while (true) {
          const rows = yield* database.db
            .selectDistinct({ id: SessionTable.id })
            .from(SessionTable)
            .innerJoin(EventTable, eq(SessionTable.id, EventTable.aggregate_id))
            .where(
              and(
                eq(EventTable.type, versionedType(RelayHook.Decided.type, 1)),
                eq(SessionTable.project_id, location.project.id),
                eq(SessionTable.directory, location.directory),
                isNull(SessionTable.workspace_id),
                cursor === undefined ? undefined : gt(SessionTable.id, cursor),
              ),
            )
            .orderBy(asc(SessionTable.id))
            .limit(64)
            .all()
            .pipe(Effect.catchCause((cause) => failed(cause).pipe(Effect.as([]))))
          if (rows.length === 0) return result
          yield* Effect.forEach(
            rows,
            (row) =>
              Effect.gen(function* () {
                result.attemptedSessions++
                yield* RelayHookShipper.ship({ relay: recording, db: database.db, sessionID: row.id }).pipe(
                  Effect.catchCause(failed),
                )
                yield* Effect.yieldNow
              }),
            { discard: true },
          )
          cursor = rows[rows.length - 1]?.id
          if (rows.length < 64) return result
        }
      }),
    })
  }),
)

export const node = makeLocationNode({ service: Service, layer, deps: [Database.node, Relay.node, Location.node] })
