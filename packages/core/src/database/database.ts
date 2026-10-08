export * as Database from "./database"

import { EffectDrizzleSqlite } from "@orchestra/effect-drizzle-sqlite"
import { layer as sqliteLayer } from "#sqlite"
import { Context, Effect, Layer, Option } from "effect"
import { SqlClient } from "effect/unstable/sql/SqlClient"
import { createHash, randomUUID } from "crypto"
import { Global } from "../global"
import { Flag } from "../flag/flag"
import { isAbsolute, join, resolve } from "path"
import { DatabaseMigration } from "./migration"
import { InstallationChannel } from "../installation/version"
import { makeGlobalNode } from "../effect/app-node"

const makeDatabase = EffectDrizzleSqlite.makeWithDefaults()
type DatabaseShape = Effect.Success<typeof makeDatabase>

export interface Interface {
  db: DatabaseShape
  /** Stable store namespace; in-memory databases intentionally receive independent identities. */
  storageID?: string
  /** Captures this database's actual SQL client's ambient transaction key. */
  inTransaction?: Effect.Effect<boolean>
}

const Filename = Context.Reference<string>("@orchestra/Database/Filename", { defaultValue: () => path() })

export class Service extends Context.Service<Service, Interface>()("@orchestra/v2/storage/Database") {}

const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const db = yield* makeDatabase
    const client = yield* SqlClient

    yield* db.run("PRAGMA journal_mode = WAL")
    yield* db.run("PRAGMA synchronous = NORMAL")
    yield* db.run("PRAGMA busy_timeout = 5000")
    yield* db.run("PRAGMA cache_size = -64000")
    yield* db.run("PRAGMA foreign_keys = ON")
    yield* db.run("PRAGMA wal_checkpoint(PASSIVE)")
    yield* DatabaseMigration.apply(db)

    const filename = yield* Filename
    return { db, inTransaction: Effect.serviceOption(client.transactionService).pipe(Effect.map(Option.isSome)),
      storageID: filename === ":memory:" ? randomUUID()
      : createHash("sha256").update(resolve(filename)).digest("hex") }
  }).pipe(Effect.orDie),
)

export function layerFromPath(filename: string) {
  return layer.pipe(Layer.provide(sqliteLayer({ filename })), Layer.provide(Layer.succeed(Filename, filename)))
}

export function path() {
  if (Flag.ORCHESTRA_DB) {
    if (Flag.ORCHESTRA_DB === ":memory:" || isAbsolute(Flag.ORCHESTRA_DB)) return Flag.ORCHESTRA_DB
    return join(Global.Path.data, Flag.ORCHESTRA_DB)
  }
  if (
    ["latest", "beta", "prod"].includes(InstallationChannel) ||
    process.env.ORCHESTRA_DISABLE_CHANNEL_DB === "1" ||
    process.env.ORCHESTRA_DISABLE_CHANNEL_DB === "true"
  )
    return releasePath()
  return join(Global.Path.data, `orchestra-${InstallationChannel.replace(/[^a-zA-Z0-9._-]/g, "-")}.db`)
}

/** The database used by release channels (the installed app). */
export function releasePath() {
  return join(Global.Path.data, "orchestra.db")
}

export const node = makeGlobalNode({ service: Service, layer: layerFromPath(path()), deps: [] })
