export * as CapabilityConnectionSetupSqlFixture from "./capability-connection-setup-sql"

import { EffectDrizzleSqlite } from "@orchestra/effect-drizzle-sqlite"
import { randomUUID } from "node:crypto"
import { Effect, Exit, Layer, Option, Tracer } from "effect"
import { SqlClient } from "effect/unstable/sql/SqlClient"
import { Database } from "../../src/database/database"
import { DatabaseMigration } from "../../src/database/migration"
import { AppNodeBuilder } from "../../src/effect/app-node-builder"
import { LayerNode } from "../../src/effect/layer-node"
import { EventV2 } from "../../src/event"

// Database.layerFromPath hides its SQL client and Drizzle reserve has no span. Assemble the actual
// adapter/factory/migrations explicitly, adding only a span around the unchanged acquisition effect.
const sql = Layer.effect(SqlClient, Effect.gen(function* () {
  const client = yield* SqlClient
  return Object.assign(client, { reserve: client.reserve.pipe(Effect.withSpan("setup-test.sql.reserve")) })
})).pipe(Layer.provideMerge(Layer.unwrap(Effect.promise(async () => {
  const { layer } = await import("../../src/database/sqlite.bun")
  return layer({ filename: ":memory:" })
}))))
const database = Layer.effect(Database.Service, Effect.gen(function* () {
  const db = yield* EffectDrizzleSqlite.makeWithDefaults()
  const client = yield* SqlClient
  yield* db.run("PRAGMA foreign_keys = ON")
  yield* DatabaseMigration.apply(db)
  return { db, storageID: randomUUID(), inTransaction: Effect.serviceOption(client.transactionService).pipe(Effect.map(Option.isSome)) }
})).pipe(Layer.provide(sql))

export const layer = AppNodeBuilder.build(LayerNode.group([Database.node, EventV2.node]), [[Database.node, database]])

/** Counts real SQL attempts, including rolled-back ones. Callers must run an authorized INSERT control. */
export function trace(delegate?: Tracer.Tracer, onReserve?: () => void) {
  const credentialAttempts: string[] = []
  const reservations: { completed: boolean }[] = []
  const tracer = Tracer.make({ span: (options) => {
    const span = delegate ? delegate.span(options) : new Tracer.NativeSpan(options)
    const attribute = span.attribute.bind(span)
    const end = span.end.bind(span)
    const reservation = options.name === "setup-test.sql.reserve" ? { completed: false } : undefined
    if (reservation) {
      reservations.push(reservation)
      onReserve?.()
    }
    return Object.assign(span, {
      attribute(key: string, value: unknown) {
        if (key === "db.query.text" && typeof value === "string" && value.toLowerCase().startsWith('insert into "credential" '))
          credentialAttempts.push(value)
        attribute(key, value)
      },
      end(time: bigint, exit: Exit.Exit<unknown, unknown>) {
        if (reservation && Exit.isSuccess(exit)) reservation.completed = true
        end(time, exit)
      },
    })
  } })
  return { credentialAttempts, reservations, tracer }
}
