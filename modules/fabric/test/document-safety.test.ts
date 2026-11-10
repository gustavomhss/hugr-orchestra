import { expect, test } from "bun:test"
import { Database } from "@orchestra/core/database/database"
import { FabricRecord } from "@orchestra/schema/fabric-record"
import { Effect } from "effect"
import { FabricDocuments } from "../src/document"
import { FabricRecordTable } from "../src/record/sql"
import { fixtures, request } from "./fixture/context"
import { layers, refusal, rows, setup } from "./fixture/record"

const cases = fixtures()
const week = 7 * 24 * 60 * 60 * 1000

test("DOC06 a protected but unknown/future policy header cannot publish content or be swept as expired", () => {
  const f = cases.box()
  return Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const s = yield* setup(f.root)
        const documents = yield* FabricDocuments.make({ operators: s.operators, root: f.root, now: () => 1000 })
        const record = yield* request(s.operators, documents.put(s.write))
        expect((yield* request(s.operators, documents.get({ context: s.context, record }))).payload).toBe(
          s.write.payload,
        )
        const invalid = {
          ...s.write,
          expected: record.revision,
          metadata: JSON.stringify({
            format: "fabric-studio.document",
            version: 2,
            createdAt: 1000,
            updatedAt: 1000,
            expiresAt: 0,
          }),
        }
        const changed = yield* request(s.operators, s.records.put(invalid))
        const before = yield* rows
        yield* refusal(request(s.operators, documents.get({ context: s.context, record: changed })), "unavailable")
        const report = yield* request(
          s.operators,
          documents.sweep({ context: s.context, kind: "draft", confirm: true }),
        )
        expect(report.complete).toBe(false)
        expect(report.items).toHaveLength(1)
        expect(report.items[0].status).toBe("failed")
        if (report.items[0].status !== "failed") throw new Error("Unknown retention policy cannot be removed")
        expect(report.items[0].problem.code).toBe("unavailable")
        expect(yield* rows).toEqual(before)
      }),
    ).pipe(Effect.provide(layers(f.filename))),
  )
})

test("DOC07 sweep stops with an authentication refusal after actual revocation, never a successful report", () => {
  const f = cases.box()
  return Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const s = yield* setup(f.root)
        const db = yield* Database.Service
        const clock = { now: 1000 }
        const operators = {
          ...s.operators,
          require: (target: Parameters<typeof s.operators.require>[0]) =>
            Effect.gen(function* () {
              if (target.action === "fabric.record.delete") {
                const existing = yield* db.db.select().from(FabricRecordTable).pipe(Effect.orDie)
                if (existing.some((row) => row.deleted)) yield* s.operators.revoke(s.operators.configured)
              }
              return yield* s.operators.require(target)
            }),
        }
        const documents = yield* FabricDocuments.make({ operators, root: f.root, now: () => clock.now })
        yield* Effect.forEach([0, 1, 2], () =>
          request(operators, documents.put({ ...s.write, id: FabricRecord.ID.create() })),
        )
        clock.now += week
        yield* refusal(
          request(operators, documents.sweep({ context: s.context, kind: "draft", confirm: true })),
          "authentication_required",
        )
        expect((yield* rows).filter((row) => row.deleted)).toHaveLength(1)
        expect((yield* rows).filter((row) => !row.deleted && row.sealed !== null)).toHaveLength(2)
      }),
    ).pipe(Effect.provide(layers(f.filename))),
  )
})

test("DOC08 a live restricted authority receives an honest partial cleanup report without disclosing denied content", () => {
  const f = cases.box()
  return Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const s = yield* setup(f.root)
        const clock = { now: 1000 }
        const documents = yield* FabricDocuments.make({ operators: s.operators, root: f.root, now: () => clock.now })
        const saved = yield* Effect.forEach([0, 1, 2], () =>
          request(s.operators, documents.put({ ...s.write, id: FabricRecord.ID.create() })),
        )
        const ordered = saved.toSorted((a, b) => a.id.localeCompare(b.id))
        const scoped = yield* request(
          s.operators,
          s.operators.issue({
            origin: "sdk",
            scope: {
              placements: "instance",
              actions: ["*"],
              resources: [
                { kind: "fabric.context", id: s.context.id },
                ...[ordered[0], ordered[2]].map((record) => ({ kind: "fabric.record", id: record.id })),
              ],
            },
          }),
        )
        clock.now += week
        const report = yield* s.operators.withRequest(
          scoped.authority,
          { requestID: crypto.randomUUID() },
          documents.sweep({ context: s.context, kind: "draft", confirm: true }),
        )
        expect(report.complete).toBe(false)
        expect(report.items.filter((item) => item.status === "removed")).toHaveLength(2)
        expect(report.items.filter((item) => item.status === "failed")).toHaveLength(1)
        const denied = report.items.find((item) => item.status === "failed")
        expect(denied?.record.id).toBe(ordered[1].id)
        if (denied?.status !== "failed") throw new Error("Expected explicit denied-item receipt")
        expect(denied.problem.code).toBe("target_denied")
        expect(JSON.stringify(report)).not.toContain(s.write.payload)
        expect((yield* rows).filter((row) => !row.deleted).map((row) => row.id)).toEqual([ordered[1].id])
      }),
    ).pipe(Effect.provide(layers(f.filename))),
  )
})
