import { expect, test } from "bun:test"
import { randomUUID } from "node:crypto"
import { mkdir, readdir, readFile, realpath, stat, symlink } from "node:fs/promises"
import path from "node:path"
import { isDeepStrictEqual } from "node:util"
import { CapabilityOperator } from "@orchestra/core/capability/operator/index"
import { CapabilityRequest } from "@orchestra/core/capability/operator/request"
import { CapabilityRequestTable } from "@orchestra/core/capability/sql"
import { Database } from "@orchestra/core/database/database"
import { Project } from "@orchestra/core/project"
import { FabricContext } from "@orchestra/schema/fabric-context"
import { AbsolutePath } from "@orchestra/schema/schema"
import { Effect, Option, Schema } from "effect"
import { FabricContexts } from "../src/context"
import { FabricContextTable } from "../src/context/sql"
import { failure, fixtures, layer, owner, request } from "./fixture/context"

const cases = fixtures()

test("FCT01", async () => {
  const sample = cases.box()
  await Effect.runPromise(Effect.scoped(Effect.gen(function* () {
    const database = yield* Database.Service
    const operators = yield* owner()
    const contexts = yield* FabricContexts.make({ operators, root: sample.root })
    expect(yield* database.db.select().from(FabricContextTable)).toEqual([])
    expect(yield* request(operators, contexts.list({}))).toEqual({ items: [] })
    expect(yield* database.db.select().from(FabricContextTable)).toEqual([])
    expect(yield* Effect.promise(() => readdir(sample.root))).toEqual([])

    const first = yield* request(operators, contexts.create({}), randomUUID())
    const second = yield* request(operators, contexts.create({}), randomUUID())
    expect(first.context.id).not.toBe(second.context.id)
    const root = yield* Effect.promise(() => realpath(sample.root))
    expect((yield* Effect.promise(() => stat(root))).mode & 0o777).toBe(0o700)
    const rows = yield* database.db.select().from(FabricContextTable)
    expect(rows.length).toBe(2)
    expect(new Set(rows.map((row) => row.id)).size).toBe(2)
    expect(rows.every((row) => row.state === "active")).toBe(true)
    expect((yield* Effect.promise(() => readdir(root))).sort())
      .toEqual([first.context.id, second.context.id].sort())
    yield* Effect.forEach([first, second], (info) => Effect.gen(function* () {
      expect(Schema.is(FabricContext.Ref)(info.context)).toBe(true)
      expect(info.context.generation).toBe(1)
      expect(info.location.workspaceID).toBeUndefined()
      expect(Object.hasOwn(info.location, "workspaceID")).toBe(false)
      expect(info.location.project.id).toBe(Project.ID.global)
      expect(info.location.directory).toBe(AbsolutePath.make(path.join(root, info.context.id)))
      expect(yield* Effect.promise(() => realpath(info.location.directory))).toBe(info.location.directory)
      expect((yield* Effect.promise(() => stat(info.location.directory))).isDirectory()).toBe(true)
      expect((yield* Effect.promise(() => stat(info.location.directory))).mode & 0o777).toBe(0o700)
      expect((yield* Effect.promise(() => stat(path.join(info.location.directory, ".orchestra-fabric-context")))).isFile()).toBe(true)
      const row = rows.find((row) => row.id === info.context.id)
      expect(row !== undefined && row.root === root && row.directory === info.location.directory &&
        row.generation === 1 && row.state === "active" && row.project_id === info.location.project.id &&
        row.project_directory === info.location.project.directory).toBe(true)
      if (!row) throw new Error("Expected the matching context reservation")
      const markerPath = path.join(info.location.directory, ".orchestra-fabric-context")
      expect((yield* Effect.promise(() => stat(markerPath))).mode & 0o777).toBe(0o600)
      const json = Schema.decodeUnknownOption(Schema.UnknownFromJsonString)(
        yield* Effect.promise(() => readFile(markerPath, "utf8")),
      )
      expect(Option.isSome(json)).toBe(true)
      if (Option.isNone(json)) throw new Error("Expected a JSON context marker")
      const marker = Schema.decodeUnknownOption(Schema.Struct({
        id: FabricContext.ID, nonce: Schema.NonEmptyString,
      }).annotate({ parseOptions: { onExcessProperty: "error" } }))(json.value)
      expect(Option.isSome(marker)).toBe(true)
      if (Option.isNone(marker)) throw new Error("Expected a closed context marker")
      expect(isDeepStrictEqual(marker.value, { id: info.context.id, nonce: row.preparation_nonce })).toBe(true)
      expect(yield* request(operators, contexts.resolve(info.context))).toEqual(info)
    }))
  })).pipe(Effect.provide(layer(sample.filename))))
  const alias = cases.box()
  const parent = path.join(alias.directory, "real-parent")
  const linked = path.join(alias.directory, "linked-parent")
  await mkdir(parent)
  await symlink(parent, linked, "dir")
  await Effect.runPromise(Effect.scoped(Effect.gen(function* () {
    const database = yield* Database.Service
    const operators = yield* owner()
    const contexts = yield* FabricContexts.make({ operators, root: AbsolutePath.make(path.join(linked, "contexts")), maxContexts: 1 })
    const info = yield* request(operators, contexts.create({}))
    const canonical = AbsolutePath.make(yield* Effect.promise(() => realpath(path.join(parent, "contexts"))))
    const row = yield* database.db.select().from(FabricContextTable).get()
    if (!row) throw new Error("Expected the actual canonical-root context row")
    expect(row.root).toBe(canonical)
    expect(row.directory).toBe(AbsolutePath.make(path.join(canonical, info.context.id)))
    expect(info.location.directory).toBe(row.directory)
    const fresh = yield* FabricContexts.make({ operators, root: canonical, maxContexts: 1 })
    expect(yield* request(operators, fresh.list({}))).toEqual({ items: [info.context] })
    expect(yield* request(operators, fresh.resolve(info.context))).toEqual(info)
    yield* failure(request(operators, fresh.create({})), "limit")
    expect((yield* database.db.select().from(FabricContextTable)).length).toBe(1)
  })).pipe(Effect.provide(layer(alias.filename))))
})

test("FCT02", async () => {
  const sample = cases.box()
  await Effect.runPromise(Effect.scoped(Effect.gen(function* () {
    const database = yield* Database.Service
    const operators = yield* owner()
    const contexts = yield* FabricContexts.make({ operators, root: sample.root })
    const created = yield* request(operators, contexts.create({}))
    expect(yield* request(operators, contexts.resolve(created.context))).toEqual(created)
    const rows = yield* database.db.select().from(FabricContextTable)
    const entries = (yield* Effect.promise(() => readdir(sample.root))).sort()
    const receipts = yield* database.db.select().from(CapabilityRequestTable)
    expect(rows.length).toBe(1)
    expect(entries).toEqual([created.context.id])
    const unchanged = Effect.gen(function* () {
      expect(JSON.stringify(yield* database.db.select().from(FabricContextTable)) === JSON.stringify(rows)).toBe(true)
      expect(isDeepStrictEqual(yield* database.db.select().from(CapabilityRequestTable), receipts)).toBe(true)
      expect((yield* Effect.promise(() => readdir(sample.root))).sort()).toEqual(entries)
    })

    yield* failure(contexts.create({}), "invocation_binding_missing")
    yield* unchanged
    yield* failure(contexts.list({}), "invocation_binding_missing")
    yield* unchanged
    yield* failure(contexts.preparing({}), "invocation_binding_missing")
    yield* unchanged
    yield* failure(contexts.resolve(created.context), "invocation_binding_missing")
    yield* unchanged
    yield* failure(contexts.remove(created.context), "invocation_binding_missing")
    yield* unchanged
    const other = yield* owner()
    yield* failure(other.withRequest(other.configured, {
      requestID: randomUUID(), idempotencyKey: randomUUID(),
    }, contexts.create({})), "invocation_binding_mismatch")
    yield* unchanged
    const issued = yield* operators.issue({ origin: "sdk" })
    yield* operators.revoke(issued.authority)
    yield* failure(operators.withRequest(issued.authority, {
      requestID: randomUUID(), idempotencyKey: randomUUID(),
    }, contexts.create({})), "authentication_required")
    yield* unchanged
    const restricted = yield* CapabilityOperator.make({
      principal: "context-operator", scope: { placements: "instance", actions: ["fabric.context.list"] },
    })
    const limited = yield* FabricContexts.make({ operators: restricted, root: sample.root })
    yield* failure(request(restricted, limited.create({})), "target_denied")
    yield* unchanged
    const createOnly = yield* CapabilityOperator.make({
      principal: "context-operator", scope: { placements: "instance", actions: ["fabric.context.create"] },
    })
    const excluded = yield* FabricContexts.make({ operators: createOnly, root: sample.root })
    yield* failure(request(createOnly, excluded.list({})), "target_denied")
    yield* unchanged
    yield* failure(request(createOnly, excluded.preparing({})), "target_denied")
    yield* unchanged
    yield* failure(request(createOnly, excluded.resolve(created.context)), "target_denied")
    yield* unchanged
    yield* failure(request(createOnly, excluded.remove(created.context)), "target_denied")
    yield* unchanged

    const project = yield* Project.Service
    const root = AbsolutePath.make(yield* Effect.promise(() => realpath(sample.root)))
    const observed = yield* project.resolve(root)
    const rootPlacement = { projectID: observed.id, location: { directory: root } }
    const concretePlacement = {
      projectID: created.location.project.id, location: { directory: created.location.directory },
    }
    yield* Effect.forEach([[rootPlacement], [concretePlacement]], (placements) => Effect.gen(function* () {
      const readOnly = yield* CapabilityOperator.make({
        principal: "context-operator", scope: { placements, actions: ["fabric.context.read"] },
      })
      const guarded = yield* FabricContexts.make({ operators: readOnly, root: sample.root })
      yield* failure(request(readOnly, guarded.resolve(created.context)), "target_denied")
      yield* unchanged
    }))
    const combined = yield* CapabilityOperator.make({
      principal: "context-operator",
      scope: { placements: [rootPlacement, concretePlacement], actions: ["fabric.context.read"] },
    })
    const allowed = yield* FabricContexts.make({ operators: combined, root: sample.root })
    expect(yield* request(combined, allowed.resolve(created.context))).toEqual(created)
    yield* unchanged
    expect(yield* request(operators, contexts.resolve(created.context))).toEqual(created)
    const unrelated = AbsolutePath.make(path.join(sample.directory, "unrelated-control-root"))
    yield* Effect.promise(() => mkdir(unrelated))
    const unrelatedProject = yield* project.resolve(unrelated)
    expect(unrelatedProject.id).toBe(Project.ID.global)
    expect(unrelatedProject.id).toBe(observed.id)
    const wrongPlacement = yield* CapabilityOperator.make({ principal: "context-operator", scope: {
      actions: ["fabric.context.create"], placements: [{ projectID: unrelatedProject.id, location: { directory: unrelated } }],
    } })
    const excludedPlacement = yield* FabricContexts.make({ operators: wrongPlacement, root: sample.root })
    yield* failure(request(wrongPlacement, excludedPlacement.create({})), "target_denied")
    yield* unchanged
    const wrongReader = yield* CapabilityOperator.make({ principal: "context-operator", scope: {
      actions: ["fabric.context.list"], placements: [{ projectID: unrelatedProject.id, location: { directory: unrelated } }],
    } })
    const excludedReader = yield* FabricContexts.make({ operators: wrongReader, root: sample.root })
    yield* failure(request(wrongReader, excludedReader.list({})), "target_denied")
    yield* unchanged
    yield* failure(request(wrongReader, excludedReader.preparing({})), "target_denied")
    yield* unchanged
    const wrongRemover = yield* CapabilityOperator.make({ principal: "context-operator", scope: {
      actions: ["fabric.context.delete"], placements: [{ projectID: unrelatedProject.id, location: { directory: unrelated } }],
    } })
    const excludedRemover = yield* FabricContexts.make({ operators: wrongRemover, root: sample.root })
    yield* failure(request(wrongRemover, excludedRemover.remove(created.context)), "target_denied")
    yield* unchanged
    const rootReader = yield* CapabilityOperator.make({ principal: "context-operator", scope: {
      actions: ["fabric.context.list"], placements: [rootPlacement],
    } })
    const listed = yield* FabricContexts.make({ operators: rootReader, root: sample.root })
    expect(yield* request(rootReader, listed.list({}))).toEqual({ items: [created.context] })
    yield* unchanged
    expect(yield* request(rootReader, listed.preparing({}))).toEqual({ items: [] })
    yield* unchanged
    const rootCreator = yield* CapabilityOperator.make({ principal: "context-operator", scope: {
      actions: ["fabric.context.create"], placements: [rootPlacement],
    } })
    const scoped = yield* FabricContexts.make({ operators: rootCreator, root: sample.root })
    const admitted = yield* request(rootCreator, scoped.create({}))
    expect(admitted.context.id).not.toBe(created.context.id)
    expect(admitted.location.directory).toBe(AbsolutePath.make(path.join(root, admitted.context.id)))
    expect(yield* request(operators, contexts.resolve(admitted.context))).toEqual(admitted)
    expect((yield* database.db.select().from(FabricContextTable)).length).toBe(rows.length + 1)
    const admittedRows = yield* database.db.select().from(FabricContextTable)
    const rootRemover = yield* CapabilityOperator.make({ principal: "context-operator", scope: {
      actions: ["fabric.context.delete"], placements: [rootPlacement],
    } })
    const removable = yield* FabricContexts.make({ operators: rootRemover, root: sample.root })
    expect(yield* request(rootRemover, removable.remove(admitted.context)))
      .toEqual({ id: admitted.context.id, generation: 2 })
    const removedRows = yield* database.db.select().from(FabricContextTable)
    expect(removedRows.length).toBe(admittedRows.length)
    expect(isDeepStrictEqual(removedRows.find((row) => row.id === created.context.id), rows[0])).toBe(true)
    const removed = removedRows.find((row) => row.id === admitted.context.id)
    if (!removed) throw new Error("Expected the scoped removal tombstone")
    expect(removed.generation).toBe(2)
    expect(removed.state).toBe("deleted")
    expect((yield* Effect.promise(() => readdir(sample.root))).sort())
      .toEqual([created.context.id, admitted.context.id].sort())
    expect(yield* request(operators, contexts.resolve(created.context))).toEqual(created)
  })).pipe(Effect.provide(layer(sample.filename))))
})

test("FCT03", async () => {
  const sample = cases.box()
  const other = cases.box()
  await Effect.runPromise(Effect.scoped(Effect.gen(function* () {
    const database = yield* Database.Service
    const operators = yield* owner()
    const contexts = yield* FabricContexts.make({ operators, root: sample.root })
    const key = randomUUID()
    const created = yield* request(operators, contexts.create({}), key)
    const row = yield* database.db.select().from(FabricContextTable).get()
    if (!row) throw new Error("Expected the real context reservation")
    expect(row.id).toBe(created.context.id)
    expect(row.storage_id === database.storageID).toBe(true)
    expect(row.principal === "context-operator").toBe(true)
    expect(row.preparation_nonce.length > 0).toBe(true)
    const markerPath = path.join(created.location.directory, ".orchestra-fabric-context")
    const marker = yield* Effect.promise(() => readFile(markerPath, "utf8"))
    const entries = yield* Effect.promise(() => readdir(created.location.directory))

    const stranger = yield* owner("other-context-operator")
    const foreign = yield* FabricContexts.make({ operators: stranger, root: sample.root })
    expect(yield* request(stranger, foreign.list({}))).toEqual({ items: [] })
    const known = yield* failure(request(stranger, foreign.resolve(created.context)), "denied")
    const absent = yield* failure(request(stranger, foreign.resolve({
      id: FabricContext.ID.create(), generation: 1,
    })), "denied")
    expect(known).toBeInstanceOf(FabricContext.Failure)
    expect(absent).toBeInstanceOf(FabricContext.Failure)
    if (!(known instanceof FabricContext.Failure) || !(absent instanceof FabricContext.Failure))
      throw new Error("Expected indistinguishable canonical context refusals")
    const knownWire = Schema.encodeSync(FabricContext.Failure)(known)
    const absentWire = Schema.encodeSync(FabricContext.Failure)(absent)
    expect(Object.keys(knownWire).sort()).toEqual(["_tag", "code", "message"])
    expect(Object.keys(absentWire).sort()).toEqual(["_tag", "code", "message"])
    expect(knownWire.message === absentWire.message).toBe(true)
    expect(isDeepStrictEqual(knownWire, absentWire)).toBe(true)
    yield* Effect.scoped(Effect.gen(function* () {
      const second = yield* Database.Service
      expect(second.storageID !== undefined && second.storageID !== database.storageID).toBe(true)
      yield* second.db.insert(FabricContextTable).values(row).run()
      const samePrincipal = yield* owner()
      const copied = yield* FabricContexts.make({ operators: samePrincipal, root: sample.root, maxContexts: 1 })
      expect(yield* request(samePrincipal, copied.list({}))).toEqual({ items: [] })
      yield* failure(request(samePrincipal, copied.resolve(created.context)), "denied")
      yield* failure(request(samePrincipal, copied.remove(created.context)), "denied")
      expect(isDeepStrictEqual(yield* second.db.select().from(FabricContextTable), [row])).toBe(true)
      expect(yield* Effect.promise(() => readdir(sample.root))).toEqual([created.context.id])
      expect(yield* Effect.promise(() => readdir(created.location.directory))).toEqual(entries)
      expect(yield* Effect.promise(() => readFile(markerPath, "utf8"))).toBe(marker)
      expect((yield* Effect.promise(() => stat(created.location.directory))).isDirectory()).toBe(true)
      const legitimate = yield* request(samePrincipal, copied.create({}))
      expect(legitimate.context.id).not.toBe(created.context.id)
      expect(yield* request(samePrincipal, copied.resolve(legitimate.context))).toEqual(legitimate)
      expect(yield* request(samePrincipal, copied.list({}))).toEqual({ items: [legitimate.context] })
      const copiedRows = yield* second.db.select().from(FabricContextTable)
      expect(copiedRows.length).toBe(2)
      const current = copiedRows.find((item) => item.id === legitimate.context.id)
      if (!current) throw new Error("Expected a reservation in the current store")
      expect(current.storage_id === second.storageID).toBe(true)
      expect(current.state).toBe("active")
      expect(current.directory).toBe(legitimate.location.directory)
      expect(isDeepStrictEqual(copiedRows.find((item) => item.id === row.id), row)).toBe(true)
      yield* failure(request(samePrincipal, copied.resolve(created.context)), "denied")
    })).pipe(Effect.provide(layer(other.filename)))
    const relocated = yield* FabricContexts.make({ operators, root: other.root })
    expect(yield* request(operators, relocated.list({}))).toEqual({ items: [] })
    yield* failure(request(operators, relocated.resolve(created.context)), "denied")
    yield* failure(request(operators, relocated.remove(created.context)), "denied")
    expect(isDeepStrictEqual(yield* database.db.select().from(FabricContextTable), [row])).toBe(true)
    expect(yield* Effect.promise(() => readdir(created.location.directory))).toEqual(entries)
    expect(yield* Effect.promise(() => readFile(markerPath, "utf8"))).toBe(marker)
    expect((yield* Effect.promise(() => stat(created.location.directory))).isDirectory()).toBe(true)
    const resolved = yield* request(operators, contexts.resolve(created.context))
    expect(resolved).toEqual(created)
    yield* failure(request(operators, contexts.resolve({
      id: created.context.id, generation: created.context.generation + 1,
    })), "expired")
    yield* failure(request(operators, contexts.remove({
      id: created.context.id, generation: created.context.generation + 1,
    })), "expired")
    expect(isDeepStrictEqual(yield* database.db.select().from(FabricContextTable), [row])).toBe(true)
    expect(yield* request(operators, contexts.resolve(created.context))).toEqual(created)

    const wire = Schema.encodeSync(FabricContext.Info)(resolved)
    expect(Object.keys(wire).sort()).toEqual(["context", "location"])
    expect(Object.keys(wire.context).sort()).toEqual(["generation", "id"])
    expect(Object.keys(wire.location).sort()).toEqual(["directory", "project"])
    expect(Object.keys(wire.location.project).sort()).toEqual(["directory", "id"])
    expect(wire).toEqual({ context: created.context, location: {
      directory: created.location.directory, project: created.location.project,
    } })
    const json = JSON.stringify(wire)
    expect([row.preparation_nonce, row.storage_id, row.principal, key].some((value) => json.includes(value))).toBe(false)
    const tombstone = yield* request(operators, contexts.remove(created.context))
    expect(tombstone).toEqual({ id: created.context.id, generation: created.context.generation + 1 })
    yield* failure(request(operators, contexts.resolve(created.context)), "expired")
    yield* failure(request(operators, contexts.resolve(tombstone)), "expired")
  })).pipe(Effect.provide(layer(sample.filename))))
})

test("FCT04", async () => {
  const sample = cases.box()
  const key = randomUUID()
  const removalKey = randomUUID()
  const initial = await Effect.runPromise(Effect.scoped(Effect.gen(function* () {
    const database = yield* Database.Service
    const operators = yield* owner()
    const contexts = yield* FabricContexts.make({ operators, root: sample.root })
    const results = yield* Effect.all([
      request(operators, contexts.create({}), key), request(operators, contexts.create({}), key),
    ], { concurrency: "unbounded" })
    expect(results[0]).toEqual(results[1])
    const rows = yield* database.db.select().from(FabricContextTable)
    expect(rows.length).toBe(1)
    expect(rows[0].id).toBe(results[0].context.id)
    expect(rows[0].generation).toBe(1)
    expect(rows[0].state).toBe("active")
    const receipts = yield* database.db.select().from(CapabilityRequestTable)
    expect(receipts.length).toBe(1)
    expectContextReceipts(receipts, rows[0], [{ action: "fabric.context.create", context: results[0].context }])
    expect(yield* Effect.promise(() => readdir(sample.root))).toEqual([results[0].context.id])
    expect(yield* Effect.promise(() => readdir(results[0].location.directory))).toEqual([".orchestra-fabric-context"])
    const marker = yield* Effect.promise(() => readFile(path.join(results[0].location.directory, ".orchestra-fabric-context"), "utf8"))
    expect(rows[0].preparation_nonce.length > 0 && marker.includes(rows[0].preparation_nonce) &&
      marker.includes(results[0].context.id)).toBe(true)
    return { info: results[0], marker }
  })).pipe(Effect.provide(layer(sample.filename))))
  const created = initial.info

  // The first scope is closed: replay must survive a fresh SQL client, factory and domain.
  const deleted = await Effect.runPromise(Effect.scoped(Effect.gen(function* () {
    const database = yield* Database.Service
    const operators = yield* owner()
    const contexts = yield* FabricContexts.make({ operators, root: sample.root })
    expect(yield* request(operators, contexts.create({}), key)).toEqual(created)
    const rows = yield* database.db.select().from(FabricContextTable)
    expect(rows.length).toBe(1)
    expect(rows[0].id).toBe(created.context.id)
    expect(rows[0].state).toBe("active")
    expect((yield* database.db.select().from(CapabilityRequestTable)).length).toBe(1)
    expect((yield* Effect.promise(() => stat(created.location.directory))).mode & 0o777).toBe(0o700)
    const entries = (yield* Effect.promise(() => readdir(sample.root))).sort()
    expect(entries).toEqual([created.context.id])
    const markerPath = path.join(created.location.directory, ".orchestra-fabric-context")
    const marker = yield* Effect.promise(() => readFile(markerPath, "utf8"))
    expect(marker === initial.marker).toBe(true)
    yield* failure(request(operators, contexts.create({}), null), "unsupported_operation")
    expect(JSON.stringify(yield* database.db.select().from(FabricContextTable)) === JSON.stringify(rows)).toBe(true)
    expect((yield* Effect.promise(() => readdir(sample.root))).sort()).toEqual(entries)
    expect((yield* Effect.promise(() => readFile(markerPath, "utf8"))) === marker).toBe(true)

    const project = yield* Project.Service
    const root = AbsolutePath.make(yield* Effect.promise(() => realpath(sample.root)))
    const observed = yield* project.resolve(root)
    const ledger = yield* CapabilityRequest.make({ operators })
    const conflictKey = randomUUID()
    const seeded = yield* request(operators, ledger.commit({
      action: "fabric.context.list", placement: { projectID: observed.id, location: { directory: root } },
      resource: { kind: "fabric.context", id: created.context.id },
    }, { purpose: "context-admission-conflict" }, () => Effect.succeed({ seeded: true })), conflictKey)
    expect(seeded.reused).toBe(false)
    expect(seeded.data).toEqual({ seeded: true })
    expect((yield* database.db.select().from(CapabilityRequestTable)).length).toBe(2)
    yield* failure(request(operators, contexts.create({}), conflictKey), "outcome_unknown")
    expect(JSON.stringify(yield* database.db.select().from(FabricContextTable)) === JSON.stringify(rows)).toBe(true)
    expect((yield* Effect.promise(() => readdir(sample.root))).sort()).toEqual(entries)
    expect(yield* Effect.promise(() => readdir(created.location.directory))).toEqual([".orchestra-fabric-context"])
    expect((yield* Effect.promise(() => readFile(markerPath, "utf8"))) === marker).toBe(true)
    yield* failure(request(operators, contexts.remove(created.context), null), "unsupported_operation")
    expect(JSON.stringify(yield* database.db.select().from(FabricContextTable)) === JSON.stringify(rows)).toBe(true)
    expect((yield* Effect.promise(() => readdir(sample.root))).sort()).toEqual(entries)
    expect((yield* Effect.promise(() => readFile(markerPath, "utf8"))) === marker).toBe(true)
    expect((yield* database.db.select().from(CapabilityRequestTable)).length).toBe(2)
    expectContextReceipts(yield* database.db.select().from(CapabilityRequestTable), rows[0], [
      { action: "fabric.context.create", context: created.context },
    ])

    const tombstone = yield* request(operators, contexts.remove(created.context), removalKey)
    expect(tombstone).toEqual({ id: created.context.id, generation: 2 })
    const tombstones = yield* database.db.select().from(FabricContextTable)
    expect(tombstones.length).toBe(1)
    expect(tombstones[0].id).toBe(created.context.id)
    expect(tombstones[0].generation).toBe(2)
    expect(tombstones[0].state).toBe("deleted")
    const receipts = yield* database.db.select().from(CapabilityRequestTable)
    expect(receipts.length).toBe(3)
    expectContextReceipts(receipts, tombstones[0], [
      { action: "fabric.context.create", context: created.context },
      { action: "fabric.context.delete", context: tombstone },
    ])
    expect((yield* Effect.promise(() => readdir(sample.root))).sort()).toEqual(entries)
    expect((yield* Effect.promise(() => stat(created.location.directory))).isDirectory()).toBe(true)
    expect((yield* Effect.promise(() => readFile(markerPath, "utf8"))) === marker).toBe(true)
    return { tombstone, rows: tombstones, receipts, entries, marker }
  })).pipe(Effect.provide(layer(sample.filename))))

  // No operator, domain or SQL client from either earlier scope survives this replay.
  await Effect.runPromise(Effect.scoped(Effect.gen(function* () {
    const database = yield* Database.Service
    const operators = yield* owner()
    const contexts = yield* FabricContexts.make({ operators, root: sample.root })
    expect(yield* request(operators, contexts.remove(created.context), removalKey)).toEqual(deleted.tombstone)
    const rows = yield* database.db.select().from(FabricContextTable)
    expect(rows.length).toBe(1)
    expect(rows[0].id).toBe(created.context.id)
    expect(rows[0].generation).toBe(2)
    expect(rows[0].state).toBe("deleted")
    expect(isDeepStrictEqual(rows, deleted.rows)).toBe(true)
    const receipts = yield* database.db.select().from(CapabilityRequestTable)
    expect(receipts.length).toBe(3)
    expect(isDeepStrictEqual(receipts, deleted.receipts)).toBe(true)
    expectContextReceipts(receipts, rows[0], [
      { action: "fabric.context.create", context: created.context },
      { action: "fabric.context.delete", context: deleted.tombstone },
    ])
    expect((yield* Effect.promise(() => readdir(sample.root))).sort()).toEqual(deleted.entries)
    expect((yield* Effect.promise(() => stat(created.location.directory))).isDirectory()).toBe(true)
    expect(yield* Effect.promise(() => readdir(created.location.directory))).toEqual([".orchestra-fabric-context"])
    expect((yield* Effect.promise(() => readFile(
      path.join(created.location.directory, ".orchestra-fabric-context"), "utf8",
    ))) === deleted.marker).toBe(true)
  })).pipe(Effect.provide(layer(sample.filename))))
})

function expectContextReceipts(receipts: readonly (typeof CapabilityRequestTable.$inferSelect)[],
  row: typeof FabricContextTable.$inferSelect,
  expected: readonly { action: "fabric.context.create" | "fabric.context.delete"; context: FabricContext.Ref }[]) {
  const outcomes = receipts.filter((receipt) => receipt.action === "fabric.context.create" || receipt.action === "fabric.context.delete")
  expect(outcomes.length).toBe(expected.length)
  expected.forEach((item) => {
    const receipt = outcomes.find((receipt) => receipt.action === item.action)
    if (!receipt) throw new Error("Expected the actual context mutation receipt")
    // Drizzle already decodes this JSON column; only its outcome must be a closed Ref.
    const ref = Schema.decodeUnknownSync(FabricContext.Ref)(receipt.result)
    expect(Object.keys(ref).sort()).toEqual(["generation", "id"])
    expect(receipt.result).toEqual(item.context)
    const json = JSON.stringify(receipt.result)
    expect([row.preparation_nonce, row.storage_id, row.root, row.directory, row.principal]
      .some((value) => json.includes(value))).toBe(false)
  })
}
