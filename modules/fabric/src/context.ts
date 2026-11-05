export * as FabricContexts from "./context"

import type { CapabilityOperatorContract } from "@orchestra/core/capability/operator/contract"
import { CapabilityRequest } from "@orchestra/core/capability/operator/request"
import { Database } from "@orchestra/core/database/database"
import { Project } from "@orchestra/core/project"
import { Capability } from "@orchestra/schema/capability"
import { FabricContext } from "@orchestra/schema/fabric-context"
import { Location } from "@orchestra/schema/location"
import { AbsolutePath } from "@orchestra/schema/schema"
import { and, asc, count, eq, gt, or } from "drizzle-orm"
import { EffectDrizzleQueryError } from "drizzle-orm/effect-core/errors"
import { Effect, Option, Schema } from "effect"
import { SqlError } from "effect/unstable/sql/SqlError"
import { randomBytes } from "node:crypto"
import path from "node:path"
import type { FabricContextsContract } from "./context-contract"
import { FabricContextDirectory } from "./context-directory"
import { FabricContextTable } from "./context/sql"

type Row = typeof FabricContextTable.$inferSelect
type Transaction = Parameters<Parameters<Database.Interface["db"]["transaction"]>[0]>[0]

export const make: FabricContextsContract.Factory = (options) => {
  const operators = Object.freeze({ ...options.operators })
  const root = options.root
  const maxContexts = options.maxContexts ?? 64
  return Effect.gen(function* () {
    if (!Number.isSafeInteger(maxContexts) || maxContexts < 1 || maxContexts > 64)
      return yield* failure("invalid-input")
    const database = yield* Database.Service
    const project = yield* Project.Service
    const storageID = database.storageID ?? ""
    if (!storageID) return yield* failure("unavailable")
    const directory = yield* FabricContextDirectory.make(root)
    const rootProject = yield* project.resolve(directory.root)
    const placement = { projectID: rootProject.id, location: { directory: directory.root } }
    const requests = yield* CapabilityRequest.make({ operators })

    function partition(binding: CapabilityOperatorContract.Binding) {
      return and(eq(FabricContextTable.principal, binding.principal), eq(FabricContextTable.storage_id, storageID),
        eq(FabricContextTable.root, directory.root))
    }

    function owned(tx: Pick<Transaction, "select">,
      binding: CapabilityOperatorContract.Binding, id: FabricContext.ID) {
      return Effect.gen(function* () {
        const row = yield* tx.select().from(FabricContextTable).where(and(partition(binding), eq(FabricContextTable.id, id))).get()
        if (!row) return yield* failure("denied")
        return row
      })
    }

    function page(supplied: FabricContext.Query, state: "active" | "preparing") {
      const input = Schema.decodeUnknownOption(FabricContext.Query)(supplied)
      return storageErrors(Effect.gen(function* () {
        if (Option.isNone(input)) return yield* failure("invalid-input")
        const target = { action: "fabric.context.list", placement }
        const binding = yield* operators.require(target)
        const limit = input.value.limit ?? 16
        const rows = yield* database.db.select({ id: FabricContextTable.id, generation: FabricContextTable.generation })
          .from(FabricContextTable).where(and(partition(binding), eq(FabricContextTable.state, state),
            input.value.after === undefined ? undefined : gt(FabricContextTable.id, input.value.after)))
          .orderBy(asc(FabricContextTable.id)).limit(limit + 1).all()
        yield* operators.validate(binding, target)
        const items = rows.slice(0, limit)
        const result = Schema.decodeUnknownOption(FabricContext.Page)({ items,
          ...(rows.length > limit ? { after: items[items.length - 1]!.id } : {}) })
        if (Option.isNone(result)) return yield* failure("unavailable")
        return result.value
      }))
    }

    // Project discovery and marker observation must remain outside every SQL callback.
    function observe(row: Row) {
      return Effect.gen(function* () {
        if (row.directory !== AbsolutePath.make(path.join(directory.root, row.id)) || !row.preparation_nonce)
          return yield* failure("unavailable")
        const actual = yield* directory.observe({ id: row.id, nonce: row.preparation_nonce })
        if (actual !== row.directory) return yield* failure("unavailable")
        const resolved = yield* project.resolve(actual)
        const checked = yield* directory.observe({ id: row.id, nonce: row.preparation_nonce })
        if (checked !== actual) return yield* failure("unavailable")
        return new Location.Info({ directory: actual, project: { id: resolved.id, directory: resolved.directory } })
      })
    }

    function active(row: Row, ref: FabricContext.Ref, binding: CapabilityOperatorContract.Binding,
      target: CapabilityOperatorContract.Target, concrete: boolean) {
      return Effect.gen(function* () {
        if (!live(row, ref)) return yield* failure("expired")
        if (row.state !== "active") return yield* failure("unavailable")
        yield* operators.validate(binding, target)
        const location = yield* observe(row)
        const child = { ...target, placement: { projectID: location.project.id, location: { directory: location.directory } } }
        if (concrete) {
          const current = yield* operators.require(child)
          if (current !== binding) return yield* mismatch()
          yield* operators.validate(binding, child)
        }
        const current = yield* owned(database.db, binding, ref.id)
        if (!live(current, ref)) return yield* failure("expired")
        if (current.state !== "active" || current.preparation_nonce !== row.preparation_nonce ||
          !matches(current, location) || !matches(row, location)) return yield* failure("unavailable")
        yield* operators.validate(binding, target)
        if (concrete) yield* operators.validate(binding, child)
        return { context: ref, location }
      })
    }

    const create: FabricContextsContract.Interface["create"] = (supplied) => {
      const input = Schema.decodeUnknownOption(FabricContext.Create)(supplied)
      return storageErrors(Effect.gen(function* () {
        if (Option.isNone(input)) return yield* failure("invalid-input")
        const target = { action: "fabric.context.create", placement }
        const binding = yield* operators.require(target)
        const receipt = yield* requests.commit(target, {}, (tx) => Effect.gen(function* () {
          // This count belongs to the same immediate writer as the reservation and receipt.
          const used = yield* tx.select({ count: count() }).from(FabricContextTable).where(and(partition(binding),
            or(eq(FabricContextTable.state, "preparing"), eq(FabricContextTable.state, "active")))).get()
          if (!used || used.count >= maxContexts) return yield* failure("limit")
          const id = FabricContext.ID.create()
          const now = Date.now()
          yield* tx.insert(FabricContextTable).values({ id, generation: 1, state: "preparing", storage_id: storageID,
            principal: binding.principal, root: directory.root, directory: AbsolutePath.make(path.join(directory.root, id)),
            preparation_nonce: randomBytes(32).toString("hex"), time_created: now, time_updated: now }).run()
          return { id, generation: 1 }
        }))
        const decoded = Schema.decodeUnknownOption(FabricContext.Ref)(receipt.data)
        if (Option.isNone(decoded)) return yield* failure("unavailable")
        const ref = decoded.value
        yield* operators.validate(binding, target)
        const row = yield* owned(database.db, binding, ref.id)
        if (!live(row, ref)) return yield* failure("expired")
        // A durable replay of an active context is observation only, never preparation/repair.
        if (row.state === "active") return yield* active(row, ref, binding, target, false)
        if (row.state !== "preparing" || row.directory !== AbsolutePath.make(path.join(directory.root, ref.id)) ||
          !row.preparation_nonce) return yield* failure("unavailable")
        yield* operators.validate(binding, target)
        const prepared = yield* directory.prepare({ id: ref.id, nonce: row.preparation_nonce })
        if (prepared !== row.directory) return yield* failure("unavailable")
        const location = yield* observe(row)
        yield* operators.validate(binding, target)
        const published = yield* database.db.transaction((tx) => Effect.gen(function* () {
          const currentBinding = yield* operators.require(target)
          if (currentBinding !== binding) return yield* mismatch()
          yield* operators.validate(binding, target)
          const current = yield* owned(tx, binding, ref.id)
          if (!live(current, ref)) return yield* failure("expired")
          if (current.directory !== row.directory || current.preparation_nonce !== row.preparation_nonce ||
            location.directory !== AbsolutePath.make(path.join(directory.root, ref.id))) return yield* failure("unavailable")
          if (current.state === "active") {
            if (!matches(current, location)) return yield* failure("unavailable")
            yield* operators.validate(binding, target)
            return current
          }
          if (current.state !== "preparing" || current.project_id !== null || current.project_directory !== null)
            return yield* failure("unavailable")
          yield* operators.validate(binding, target)
          const updated = yield* tx.update(FabricContextTable).set({ state: "active", project_id: location.project.id,
            project_directory: location.project.directory, time_updated: Date.now() })
            .where(and(partition(binding), eq(FabricContextTable.id, ref.id), eq(FabricContextTable.generation, ref.generation),
              eq(FabricContextTable.state, "preparing"), eq(FabricContextTable.directory, row.directory),
              eq(FabricContextTable.preparation_nonce, row.preparation_nonce))).returning().get()
          if (!updated) return yield* failure("expired")
          yield* operators.validate(binding, target)
          return updated
        }), { behavior: "immediate" })
        return yield* active(published, ref, binding, target, false)
      }))
    }

    const resolve: FabricContextsContract.Interface["resolve"] = (supplied) => {
      const input = Schema.decodeUnknownOption(FabricContext.Ref)(supplied)
      return storageErrors(Effect.gen(function* () {
        if (Option.isNone(input)) return yield* failure("invalid-input")
        const target = { action: "fabric.context.read", placement, resource: { kind: "fabric.context", id: input.value.id } }
        const binding = yield* operators.require(target)
        const row = yield* owned(database.db, binding, input.value.id)
        return yield* active(row, input.value, binding, target, true)
      }))
    }

    const remove: FabricContextsContract.Interface["remove"] = (supplied) => {
      const input = Schema.decodeUnknownOption(FabricContext.Ref)(supplied)
      return storageErrors(Effect.gen(function* () {
        if (Option.isNone(input)) return yield* failure("invalid-input")
        const ref = input.value
        const target = { action: "fabric.context.delete", placement, resource: { kind: "fabric.context", id: ref.id } }
        const binding = yield* operators.require(target)
        // Neither removal nor its replay opens a context directory, even when it is damaged.
        const receipt = yield* requests.commit(target, { id: ref.id, generation: ref.generation }, (tx) => Effect.gen(function* () {
          const row = yield* owned(tx, binding, ref.id)
          if (!live(row, ref)) return yield* failure("expired")
          if (!Number.isSafeInteger(row.generation + 1)) return yield* failure("unavailable")
          const tombstone = { id: ref.id, generation: row.generation + 1 }
          const updated = yield* tx.update(FabricContextTable).set({ state: "deleted", generation: tombstone.generation,
            time_updated: Date.now() }).where(and(partition(binding), eq(FabricContextTable.id, ref.id),
              eq(FabricContextTable.generation, ref.generation), eq(FabricContextTable.state, row.state))).returning().get()
          if (!updated) return yield* failure("expired")
          return tombstone
        }), (tx) => owned(tx, binding, ref.id).pipe(Effect.asVoid))
        const result = Schema.decodeUnknownOption(FabricContext.Ref)(receipt.data)
        if (Option.isNone(result)) return yield* failure("unavailable")
        yield* operators.validate(binding, target)
        return result.value
      }))
    }

    return Object.freeze({ list: (input) => page(input, "active"), preparing: (input) => page(input, "preparing"),
      create, resolve, remove }) satisfies FabricContextsContract.Interface
  })
}

function live(row: Row, ref: FabricContext.Ref) {
  return row.generation === ref.generation && (row.state === "active" || row.state === "preparing")
}

function matches(row: Row, location: Location.Info) {
  return row.directory === location.directory && row.project_id === location.project.id &&
    row.project_directory === location.project.directory
}

function storageErrors<A, R>(effect: Effect.Effect<A,
  FabricContextsContract.Error | SqlError | EffectDrizzleQueryError, R>) {
  // Map only typed SQL errors. Defects and interruptions remain in their original cause channels.
  return Effect.mapError(effect, (error) => error instanceof SqlError || error instanceof EffectDrizzleQueryError
    ? failure("unavailable") : error)
}

function mismatch() {
  return new Capability.Failure({ code: "invocation_binding_mismatch", message: "Capability invocation binding does not match" })
}

function failure(code: FabricContext.Failure["code"]) {
  return new FabricContext.Failure({ code, message: code === "invalid-input" ? "Fabric context input is invalid" :
    code === "denied" ? "Fabric context access is denied" : code === "expired" ? "Fabric context reference has expired" :
    code === "limit" ? "Fabric context limit is reached" : "Fabric context is unavailable" })
}
