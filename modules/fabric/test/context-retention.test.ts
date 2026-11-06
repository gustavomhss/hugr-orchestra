import { expect, test } from "bun:test"
import { readdir, stat } from "node:fs/promises"
import { isDeepStrictEqual } from "node:util"
import { CapabilityRequestTable } from "@orchestra/core/capability/sql"
import { Database } from "@orchestra/core/database/database"
import { Effect } from "effect"
import { FabricContexts } from "../src/context"
import { FabricContextTable } from "../src/context/sql"
import { failure, fixtures, layer, owner, request } from "./fixture/context"

const cases = fixtures()

test("FCT15 context quota churn preserves old durable mutation receipts", () => {
  const fixture = cases.box()
  return Effect.runPromise(Effect.scoped(Effect.gen(function* () {
    const database = yield* Database.Service
    const operators = yield* owner()
    const contexts = yield* FabricContexts.make({ operators, root: fixture.root, maxContexts: 1 })
    const original = yield* request(operators, contexts.create({}), "retention-create-0")
    const tombstone = yield* request(operators, contexts.remove(original.context), "retention-remove-0")
    const first = yield* database.db.select().from(CapabilityRequestTable)
    expect(first).toHaveLength(2)
    yield* Effect.forEach(Array.from({ length: 32 }, (_, index) => index + 1), (index) => Effect.gen(function* () {
      const info = yield* request(operators, contexts.create({}), `retention-create-${index}`)
      expect(yield* request(operators, contexts.remove(info.context), `retention-remove-${index}`))
        .toEqual({ id: info.context.id, generation: 2 })
    }), { concurrency: 1 })
    const receipts = yield* database.db.select().from(CapabilityRequestTable)
    expect(receipts).toHaveLength(66)
    expect(first.every((old) => receipts.some((row) => isDeepStrictEqual(row, old)))).toBe(true)
    const rows = yield* database.db.select().from(FabricContextTable)
    expect(rows).toHaveLength(33)
    expect(rows.every((row) => row.state === "deleted" && row.generation === 2)).toBe(true)
    expect(yield* request(operators, contexts.remove(original.context), "retention-remove-0")).toEqual(tombstone)
    yield* failure(request(operators, contexts.create({}), "retention-create-0"), "expired")
    expect(yield* database.db.select().from(CapabilityRequestTable)).toEqual(receipts)
    expect(yield* database.db.select().from(FabricContextTable)).toEqual(rows)
    expect((yield* Effect.promise(() => stat(original.location.directory))).isDirectory()).toBe(true)
    expect((yield* Effect.promise(() => readdir(fixture.root))).sort()).toEqual(rows.map((row) => row.id).sort())
    const next = yield* request(operators, contexts.create({}), "retention-create-33")
    expect(yield* request(operators, contexts.resolve(next.context))).toEqual(next)
    const after = yield* database.db.select().from(CapabilityRequestTable)
    expect(after).toHaveLength(67)
    expect(receipts.every((old) => after.some((row) => isDeepStrictEqual(row, old)))).toBe(true)
  })).pipe(Effect.provide(layer(fixture.filename))))
}, 90000)
