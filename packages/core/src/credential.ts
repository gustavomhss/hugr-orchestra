export * as Credential from "./credential"

import { closeSync, existsSync, openSync, readSync } from "fs"
import { resolve } from "path"
import { pathToFileURL } from "url"
import { and, asc, eq, isNotNull } from "drizzle-orm"
import { Cause, Context, Effect, Layer, Option, Schema } from "effect"
import { EffectDrizzleSqlite } from "@orchestra/effect-drizzle-sqlite"
import { layer } from "#sqlite"
import { Credential } from "@orchestra/schema/credential"
import { Integration } from "@orchestra/schema/integration"
import { Database } from "./database/database"
import { makeGlobalNode } from "./effect/app-node"
import { Flag } from "./flag/flag"
import { CredentialTable } from "./credential/sql"

export const ID = Credential.ID
export type ID = Credential.ID

export const OAuth = Credential.OAuth
export type OAuth = Credential.OAuth

export const Key = Credential.Key
export type Key = Credential.Key

export const Value = Credential.Value
export type Value = Credential.Value

export class Info extends Schema.Class<Info>("Credential.Info")({
  id: ID,
  integrationID: Integration.ID,
  label: Schema.String,
  value: Value,
}) {}

/**
 * The credential is read from the release database, which this build never
 * writes and never refreshes: refreshing could rotate the installed app's
 * refresh token out from under it.
 */
export class InheritedError extends Schema.TaggedErrorClass<InheritedError>()("Credential.InheritedError", {
  credentialID: ID,
  source: Schema.String,
  reason: Schema.Literals(["readonly", "refresh"]),
}) {
  override get message() {
    if (this.reason === "refresh")
      return `Credential ${this.credentialID} is inherited from the installed app (${this.source}) and needs a refresh, which this build never performs. Use the installed app to refresh it, or log in separately in this build. Set ORCHESTRA_INHERIT_CREDENTIALS=0 to stop inheriting credentials.`
    return `Credential ${this.credentialID} is inherited read-only from the installed app (${this.source}). Remove it from the installed app, or set ORCHESTRA_INHERIT_CREDENTIALS=0 to stop inheriting credentials.`
  }
}

export interface Interface {
  /**
   * Reads fall back to the release database when this build uses another one:
   * per integration, credentials in the active database win; otherwise the
   * release database's newest credential for that integration is visible.
   */
  /** Returns every stored credential. */
  readonly all: () => Effect.Effect<Info[]>
  /** Returns stored credentials belonging to one integration. */
  readonly list: (integrationID: Integration.ID) => Effect.Effect<Info[]>
  /** Returns one stored credential by ID. */
  readonly get: (id: ID) => Effect.Effect<Info | undefined>
  /** Returns the release database a visible credential is inherited from, if any. */
  readonly inheritedFrom: (id: ID) => Effect.Effect<string | undefined>
  /** Stores a credential for an integration and returns the new record. */
  readonly create: (input: {
    readonly integrationID: Integration.ID
    readonly value: Value
    readonly label?: string
  }) => Effect.Effect<Info>
  /** Updates the label or secret value of a stored credential. Inherited credentials are read-only. */
  readonly update: (id: ID, updates: Partial<Pick<Info, "label" | "value">>) => Effect.Effect<void, InheritedError>
  /** Atomically replaces exactly the expected value; never inserts or changes a label. */
  readonly replaceValueIf: (id: ID, expected: Value, next: Value) => Effect.Effect<boolean, InheritedError>
  /** Removes a stored credential. Inherited credentials cannot be removed from this build. */
  readonly remove: (id: ID) => Effect.Effect<void, InheritedError>
}

export class Service extends Context.Service<Service, Interface>()("@orchestra/v2/Credential") {}

/**
 * Returns the release database to inherit credentials from, or undefined when
 * this build must stay isolated.
 */
export function inheritedPath(active = Database.path(), release = Database.releasePath()) {
  const flag = Flag.ORCHESTRA_INHERIT_CREDENTIALS
  if (flag === false) return
  if (active === ":memory:" && flag !== true) return
  if (active !== ":memory:" && resolve(active) === resolve(release)) return
  return release
}

export const layerFrom = (release: string | undefined) =>
  Layer.effect(
    Service,
    Effect.gen(function* () {
      const { db } = yield* Database.Service
      const decode = Schema.decodeUnknownSync(Value)
      const stored = (row: typeof CredentialTable.$inferSelect) => {
        if (!row.integration_id) return
        return new Info({
          id: row.id,
          integrationID: row.integration_id,
          label: row.label,
          value: decode(row.value),
        })
      }
      const own = Effect.fnUntraced(function* (integrationID?: Integration.ID) {
        return (yield* db
          .select()
          .from(CredentialTable)
          .where(integrationID ? eq(CredentialTable.integration_id, integrationID) : undefined)
          .orderBy(asc(CredentialTable.time_created))
          .all()
          .pipe(Effect.orDie)).flatMap((row) => {
          const credential = stored(row)
          return credential ? [credential] : []
        })
      })
      // The release database's newest credential for every integration the
      // active database has no credential for.
      const inherited = Effect.fnUntraced(function* (saved: readonly Info[]) {
        if (!release) return []
        const covered = new Set(saved.map((credential) => credential.integrationID))
        const rows = (yield* readRelease(release)).filter((credential) => !covered.has(credential.integrationID))
        return Array.from(Map.groupBy(rows, (credential) => credential.integrationID).values()).flatMap((group) =>
          group.slice(-1),
        )
      })
      const find = Effect.fnUntraced(function* (id: ID) {
        const row = yield* db.select().from(CredentialTable).where(eq(CredentialTable.id, id)).get().pipe(Effect.orDie)
        if (row) return { credential: stored(row), inherited: false }
        return { credential: (yield* inherited(yield* own())).find((item) => item.id === id), inherited: true }
      })

      return Service.of({
        all: Effect.fn("Credential.all")(function* () {
          const saved = yield* own()
          return [...saved, ...(yield* inherited(saved))]
        }),
        list: Effect.fn("Credential.list")(function* (integrationID) {
          const saved = yield* own(integrationID)
          if (saved.length > 0) return saved
          return (yield* inherited(saved)).filter((credential) => credential.integrationID === integrationID)
        }),
        get: Effect.fn("Credential.get")(function* (id) {
          return (yield* find(id)).credential
        }),
        inheritedFrom: Effect.fn("Credential.inheritedFrom")(function* (id) {
          const match = yield* find(id)
          return match.inherited && match.credential ? release : undefined
        }),
        create: Effect.fn("Credential.create")(function* (input) {
          const credential = new Info({
            id: ID.create(),
            integrationID: input.integrationID,
            label: input.label ?? "default",
            value: input.value,
          })
          yield* db
            .insert(CredentialTable)
            .values({
              id: credential.id,
              integration_id: credential.integrationID,
              label: credential.label,
              value: credential.value,
            })
            .run()
            .pipe(Effect.orDie)
          return credential
        }),
        update: Effect.fn("Credential.update")(function* (id, updates) {
          if (!updates.label && !updates.value) return
          const match = yield* find(id)
          if (match.inherited && match.credential && release) {
            return yield* new InheritedError({ credentialID: id, source: release, reason: "readonly" })
          }
          yield* db
            .update(CredentialTable)
            .set({ label: updates.label, value: updates.value })
            .where(eq(CredentialTable.id, id))
            .run()
            .pipe(Effect.orDie)
        }),
        replaceValueIf: Effect.fn("Credential.replaceValueIf")(function* (id, expected, next) {
          const match = yield* find(id)
          if (match.inherited && match.credential && release) {
            return yield* new InheritedError({ credentialID: id, source: release, reason: "readonly" })
          }
          // eq binds through the column's Drizzle JSON encoder, exactly like set.
          // Different serialization is a conservative miss, never a lost update.
          return (yield* db.update(CredentialTable).set({ value: next })
            .where(and(eq(CredentialTable.id, id), eq(CredentialTable.value, expected)))
            .returning({ id: CredentialTable.id }).get().pipe(Effect.orDie)) !== undefined
        }),
        remove: Effect.fn("Credential.remove")(function* (id) {
          const match = yield* find(id)
          if (match.inherited && match.credential && release) {
            return yield* new InheritedError({ credentialID: id, source: release, reason: "readonly" })
          }
          yield* db.delete(CredentialTable).where(eq(CredentialTable.id, id)).run().pipe(Effect.orDie)
        }),
      })
    }),
  )

export const node = makeGlobalNode({ service: Service, layer: layerFrom(inheritedPath()), deps: [Database.node] })

/**
 * Reads credentials from the release database without ever writing it: the
 * file is opened read-only and is neither migrated nor configured. A missing,
 * locked, or incompatible database yields no credentials. Errors are logged
 * without values because decode failures can echo secret material.
 */
function readRelease(filename: string) {
  return walWithoutLog(filename).pipe(
    // A WAL database whose -wal file is absent keeps every committed page in
    // the main file, so it is read immutable. A plain read-only open would
    // fail on the macOS system SQLite Bun uses, and on Linux it creates -wal
    // and -shm next to the release database. Rollback-journal databases never
    // take this path: immutable reads skip locking, and a locked database
    // must be skipped instead.
    Effect.flatMap((immutable) => query(immutable ? `${pathToFileURL(filename).href}?immutable=1` : filename)),
    Effect.catchCause((cause) =>
      Effect.logDebug("release credentials unavailable", { path: filename, reason: String(Cause.squash(cause)) }).pipe(
        Effect.as([]),
      ),
    ),
  )
}

function query(filename: string) {
  return Effect.gen(function* () {
    const release = yield* EffectDrizzleSqlite.makeWithDefaults()
    const rows = yield* release
      .select({
        id: CredentialTable.id,
        integrationID: CredentialTable.integration_id,
        label: CredentialTable.label,
        value: CredentialTable.value,
      })
      .from(CredentialTable)
      .where(isNotNull(CredentialTable.integration_id))
      .orderBy(asc(CredentialTable.time_created))
      .all()
    const decoded = rows.map((row) => Schema.decodeUnknownOption(Info)(row))
    const skipped = decoded.filter(Option.isNone).length
    if (skipped > 0) yield* Effect.logDebug("skipped undecodable release credentials", { path: filename, skipped })
    return decoded.flatMap((row) => (Option.isSome(row) ? [row.value] : []))
  }).pipe(Effect.provide(layer({ filename, readonly: true, readwrite: false, create: false, disableWAL: true })))
}

function walWithoutLog(filename: string) {
  return Effect.try({
    try: () => {
      if (existsSync(`${filename}-wal`)) return false
      const header = Buffer.alloc(20)
      const fd = openSync(filename, "r")
      readSync(fd, header, 0, header.length, 0)
      closeSync(fd)
      // Header bytes 18 and 19 hold the file format versions; 2 means WAL.
      return header[18] === 2 && header[19] === 2
    },
    catch: () => false,
  }).pipe(Effect.orElseSucceed(() => false))
}
