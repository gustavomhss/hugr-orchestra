import { expect, test } from "bun:test"
import { randomUUID } from "node:crypto"
import { CredentialCipher } from "@orchestra/core/credential/cipher"
import { Database } from "@orchestra/core/database/database"
import { FabricRecord } from "@orchestra/schema/fabric-record"
import { eq } from "drizzle-orm"
import { Effect } from "effect"
import { FabricContexts } from "../src/context"
import { FabricContextTable } from "../src/context/sql"
import { FabricRecords } from "../src/record"
import { FabricRecordTable } from "../src/record/sql"
import { fixtures, owner, request } from "./fixture/context"
import { layers, refusal, rows, setup } from "./fixture/record"

const cases = fixtures()

test("PR03 owner/context/store/current grant are checked before actual decrypt", () => {
  const f = cases.box()
  return Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const s = yield* setup(f.root)
        const cipher = yield* CredentialCipher.Service
        const seen = { opens: 0 }
        const counted = {
          seal: cipher.seal,
          open: (text: string) => {
            seen.opens++
            return cipher.open(text)
          },
        }
        const records = yield* FabricRecords.make({ operators: s.operators, root: f.root }).pipe(
          Effect.provideService(CredentialCipher.Service, counted),
        )
        const record = yield* request(s.operators, records.put(s.write))
        yield* request(s.operators, records.get({ context: s.context, record }))
        expect(seen.opens).toBe(1) // Positive control: observer sees the real primitive.
        const stranger = yield* owner("other-record-owner")
        const foreign = yield* FabricRecords.make({ operators: stranger, root: f.root }).pipe(
          Effect.provideService(CredentialCipher.Service, counted),
        )
        yield* refusal(request(stranger, foreign.get({ context: s.context, record })), "denied")
        const other = (yield* request(s.operators, s.contexts.create({}))).context
        yield* refusal(request(s.operators, records.get({ context: other, record })), "denied")
        const child = yield* request(
          s.operators,
          s.operators.issue({ origin: "sdk", scope: { placements: "instance", actions: ["fabric.context.read"] } }),
        )
        yield* refusal(
          s.operators.withRequest(
            child.authority,
            { requestID: randomUUID() },
            records.get({ context: s.context, record }),
          ),
          "target_denied",
        )
        const delegated = yield* request(s.operators, s.operators.issue({ origin: "sdk" }))
        yield* s.operators.revoke(delegated.authority)
        yield* refusal(
          s.operators.withRequest(
            delegated.authority,
            { requestID: randomUUID() },
            records.get({ context: s.context, record }),
          ),
          "authentication_required",
        )
        const db = yield* Database.Service
        const original = (yield* rows)[0]
        yield* db.db
          .update(FabricRecordTable)
          .set({ storage_id: "copied-store" })
          .where(eq(FabricRecordTable.id, record.id))
        yield* refusal(request(s.operators, records.get({ context: s.context, record })), "denied")
        yield* db.db
          .update(FabricRecordTable)
          .set({ storage_id: original.storage_id })
          .where(eq(FabricRecordTable.id, record.id))
        yield* request(s.operators, s.contexts.remove(s.context))
        yield* refusal(request(s.operators, records.get({ context: s.context, record })), "expired")
        expect(seen.opens).toBe(1)
        expect((yield* rows)[0].sealed).toBe(original.sealed)
      }),
    ).pipe(Effect.provide(layers(f.filename))),
  )
})

test("PR03 current context is rechecked inside SQL after external resolution, before decrypt", () => {
  const f = cases.box()
  return Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const s = yield* setup(f.root)
        const cipher = yield* CredentialCipher.Service
        const db = yield* Database.Service
        const seen = { opens: 0, armed: false }
        // Boundary instrument delegates every authority decision to the real runtime.
        const operators = {
          ...s.operators,
          require: (target: Parameters<typeof s.operators.require>[0]) =>
            Effect.gen(function* () {
              const binding = yield* s.operators.require(target)
              if (seen.armed && target.action === "fabric.record.read") {
                seen.armed = false
                yield* db.db
                  .update(FabricContextTable)
                  .set({ state: "deleted", generation: 2 })
                  .where(eq(FabricContextTable.id, s.context.id))
                  .pipe(Effect.orDie)
              }
              return binding
            }),
        }
        const records = yield* FabricRecords.make({ operators, root: f.root }).pipe(
          Effect.provideService(CredentialCipher.Service, {
            seal: cipher.seal,
            open: (text) => {
              seen.opens++
              return cipher.open(text)
            },
          }),
        )
        const record = yield* request(operators, records.put(s.write))
        yield* request(operators, records.get({ context: s.context, record }))
        expect(seen.opens).toBe(1)
        seen.armed = true
        yield* refusal(request(operators, records.get({ context: s.context, record })), "expired")
        expect(seen.opens).toBe(1)
      }),
    ).pipe(Effect.provide(layers(f.filename))),
  )
})

test("PR10 ambient transaction refuses before any context resolution or cipher", () => {
  const f = cases.box()
  return Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const s = yield* setup(f.root)
        const db = yield* Database.Service
        const records = yield* FabricRecords.make({ operators: s.operators, root: f.root })
        yield* db.db.transaction(() => refusal(request(s.operators, records.put(s.write)), "unavailable"), {
          behavior: "immediate",
        })
        expect(yield* rows).toEqual([])
        // Outside the ambient transaction the same implementation must actually work.
        expect((yield* request(s.operators, records.put(s.write))).revision).toBe(1)
      }),
    ).pipe(Effect.provide(layers(f.filename))),
  )
})

test("PR06 finite UTF-8, ciphertext and cardinality budgets reject without discarding active data", () => {
  const f = cases.box()
  return Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const s = yield* setup(f.root, { payloadBytes: 4, records: 1 })
        const record = yield* request(s.operators, s.records.put({ ...s.write, payload: "😀" }))
        const original = yield* rows
        yield* refusal(request(s.operators, s.records.put({ ...s.write, expected: 1, payload: "😀x" })), "limit")
        yield* refusal(
          request(s.operators, s.records.put({ ...s.write, id: FabricRecord.ID.create(), payload: "a" })),
          "limit",
        )
        expect(yield* rows).toEqual(original)
        const bytes = original[0].bytes
        const exact = yield* FabricRecords.make({
          operators: s.operators,
          root: f.root,
          limits: { contextBytes: bytes, storeBytes: bytes },
        })
        expect((yield* request(s.operators, exact.put({ ...s.write, expected: 1, payload: "😀" }))).revision).toBe(2)
        const current = yield* rows
        const short = yield* FabricRecords.make({
          operators: s.operators,
          root: f.root,
          limits: { contextBytes: bytes - 1 },
        })
        yield* refusal(request(s.operators, short.put({ ...s.write, expected: 2, payload: "😀" })), "limit")
        expect(yield* rows).toEqual(current)
        const otherContext = (yield* request(s.operators, s.contexts.create({}))).context
        const global = yield* FabricRecords.make({
          operators: s.operators,
          root: f.root,
          limits: { storeBytes: bytes },
        })
        yield* refusal(
          request(
            s.operators,
            global.put({ ...s.write, context: otherContext, id: FabricRecord.ID.create(), payload: "a" }),
          ),
          "limit",
        )
        yield* request(s.operators, s.records.remove({ context: s.context, record: { ...record, revision: 2 } }))
        yield* refusal(
          request(s.operators, s.records.put({ ...s.write, id: FabricRecord.ID.create(), payload: "a" })),
          "limit",
        )
        for (const limits of [{ records: 100001 }, { payloadBytes: 262145 }, { storeBytes: 0 }, { contextBytes: NaN }])
          yield* refusal(FabricRecords.make({ operators: s.operators, root: f.root, limits }), "invalid-input")
      }),
    ).pipe(Effect.provide(layers(f.filename))),
  )
})
