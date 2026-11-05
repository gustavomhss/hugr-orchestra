import { expect, test } from "bun:test"
import { randomUUID } from "node:crypto"
import { readdir, readFile, realpath, stat } from "node:fs/promises"
import path from "node:path"
import { CapabilityOperator } from "@orchestra/core/capability/operator/index"
import { CapabilityRequest } from "@orchestra/core/capability/operator/request"
import { CapabilityRequestTable } from "@orchestra/core/capability/sql"
import { Database } from "@orchestra/core/database/database"
import { Project } from "@orchestra/core/project"
import { FabricContext } from "@orchestra/schema/fabric-context"
import { AbsolutePath } from "@orchestra/schema/schema"
import { Effect, Schema } from "effect"
import { FabricContexts } from "../src/context"
import { FabricContextTable } from "../src/context/sql"
import { box, failure, layer, owner, request } from "./fixture/context"

test("FCT01", async () => {
  const sample = box()
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
      expect((yield* Effect.promise(() => stat(path.join(info.location.directory, ".orchestra-fabric-context")))).isFile()).toBe(true)
      const row = rows.find((row) => row.id === info.context.id)
      expect(row !== undefined && row.root === root && row.directory === info.location.directory &&
        row.generation === 1 && row.state === "active" && row.project_id === info.location.project.id &&
        row.project_directory === info.location.project.directory).toBe(true)
      expect(yield* request(operators, contexts.resolve(info.context))).toEqual(info)
    }))
  })).pipe(Effect.provide(layer(sample.filename))))
})

test("FCT02", async () => {
  const sample = box()
  await Effect.runPromise(Effect.scoped(Effect.gen(function* () {
    const database = yield* Database.Service
    const operators = yield* owner()
    const contexts = yield* FabricContexts.make({ operators, root: sample.root })
    const created = yield* request(operators, contexts.create({}))
    expect(yield* request(operators, contexts.resolve(created.context))).toEqual(created)
    const rows = yield* database.db.select().from(FabricContextTable)
    const entries = (yield* Effect.promise(() => readdir(sample.root))).sort()
    expect(rows.length).toBe(1)
    expect(entries).toEqual([created.context.id])
    const unchanged = Effect.gen(function* () {
      expect(JSON.stringify(yield* database.db.select().from(FabricContextTable)) === JSON.stringify(rows)).toBe(true)
      expect((yield* Effect.promise(() => readdir(sample.root))).sort()).toEqual(entries)
    })

    yield* failure(contexts.create({}), "invocation_binding_missing")
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
  })).pipe(Effect.provide(layer(sample.filename))))
})

test("FCT03", async () => {
  const sample = box()
  const other = box()
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

    const stranger = yield* owner("other-context-operator")
    const foreign = yield* FabricContexts.make({ operators: stranger, root: sample.root })
    expect(yield* request(stranger, foreign.list({}))).toEqual({ items: [] })
    yield* failure(request(stranger, foreign.resolve(created.context)), "denied")
    yield* Effect.scoped(Effect.gen(function* () {
      const second = yield* Database.Service
      expect(second.storageID !== undefined && second.storageID !== database.storageID).toBe(true)
      yield* second.db.insert(FabricContextTable).values(row).run()
      const samePrincipal = yield* owner()
      const copied = yield* FabricContexts.make({ operators: samePrincipal, root: sample.root })
      expect(yield* request(samePrincipal, copied.list({}))).toEqual({ items: [] })
      yield* failure(request(samePrincipal, copied.resolve(created.context)), "denied")
    })).pipe(Effect.provide(layer(other.filename)))
    const relocated = yield* FabricContexts.make({ operators, root: other.root })
    expect(yield* request(operators, relocated.list({}))).toEqual({ items: [] })
    yield* failure(request(operators, relocated.resolve(created.context)), "denied")
    const resolved = yield* request(operators, contexts.resolve(created.context))
    expect(resolved).toEqual(created)
    yield* failure(request(operators, contexts.resolve({
      id: created.context.id, generation: created.context.generation + 1,
    })), "expired")

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
  const sample = box()
  const key = randomUUID()
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
    expect((yield* database.db.select().from(CapabilityRequestTable)).length).toBe(1)
    expect(yield* Effect.promise(() => readdir(sample.root))).toEqual([results[0].context.id])
    expect(yield* Effect.promise(() => readdir(results[0].location.directory))).toEqual([".orchestra-fabric-context"])
    const marker = yield* Effect.promise(() => readFile(path.join(results[0].location.directory, ".orchestra-fabric-context"), "utf8"))
    expect(rows[0].preparation_nonce.length > 0 && marker.includes(rows[0].preparation_nonce) &&
      marker.includes(results[0].context.id)).toBe(true)
    return { info: results[0], marker }
  })).pipe(Effect.provide(layer(sample.filename))))
  const created = initial.info

  // The first scope is closed: replay must survive a fresh SQL client, factory and domain.
  await Effect.runPromise(Effect.scoped(Effect.gen(function* () {
    const database = yield* Database.Service
    const operators = yield* owner()
    const contexts = yield* FabricContexts.make({ operators, root: sample.root })
    expect(yield* request(operators, contexts.create({}), key)).toEqual(created)
    const rows = yield* database.db.select().from(FabricContextTable)
    expect(rows.length).toBe(1)
    expect(rows[0].id).toBe(created.context.id)
    expect(rows[0].state).toBe("active")
    expect((yield* database.db.select().from(CapabilityRequestTable)).length).toBe(1)
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
  })).pipe(Effect.provide(layer(sample.filename))))
})
