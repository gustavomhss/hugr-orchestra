import { expect, test } from "bun:test"
import { CredentialCipher } from "@orchestra/core/credential/cipher"
import { Database } from "@orchestra/core/database/database"
import { FabricRecord } from "@orchestra/schema/fabric-record"
import { eq } from "drizzle-orm"
import { Effect } from "effect"
import { FabricRecords } from "../src/record"
import { FabricRecordTable } from "../src/record/sql"
import { fixtures, request } from "./fixture/context"
import { layers, refusal, rows, setup } from "./fixture/record"

const cases = fixtures()

test("PR02 copying ciphertext between actual rows or contexts never yields source plaintext", () => {
  const f = cases.box()
  return Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const s = yield* setup(f.root)
        const db = yield* Database.Service
        const first = yield* request(s.operators, s.records.put(s.write))
        const otherContext = (yield* request(s.operators, s.contexts.create({}))).context
        const second = yield* request(
          s.operators,
          s.records.put({ ...s.write, id: FabricRecord.ID.create(), payload: "second" }),
        )
        const third = yield* request(
          s.operators,
          s.records.put({ ...s.write, context: otherContext, id: FabricRecord.ID.create(), payload: "third" }),
        )
        const source = (yield* rows).find((row) => row.id === first.id)!
        expect((yield* request(s.operators, s.records.get({ context: s.context, record: first }))).payload).toBe(
          s.write.payload,
        )
        for (const selection of [
          { context: s.context, record: second },
          { context: otherContext, record: third },
        ]) {
          yield* db.db
            .update(FabricRecordTable)
            .set({ sealed: source.sealed, bytes: source.bytes })
            .where(eq(FabricRecordTable.id, selection.record.id))
          yield* refusal(request(s.operators, s.records.get(selection)), "unavailable")
          yield* refusal(request(s.operators, s.records.remove(selection)), "unavailable")
        }
      }),
    ).pipe(Effect.provide(layers(f.filename))),
  )
})

test("PR03 revocation after decrypt still suppresses plaintext publication", () => {
  const f = cases.box()
  return Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const s = yield* setup(f.root)
        const cipher = yield* CredentialCipher.Service
        const probe = { armed: false, opens: 0 }
        const records = yield* FabricRecords.make({ operators: s.operators, root: f.root }).pipe(
          Effect.provideService(CredentialCipher.Service, {
            seal: cipher.seal,
            open: (text) => {
              const plain = cipher.open(text)
              probe.opens++
              if (probe.armed) Effect.runSync(s.operators.revoke(s.operators.configured))
              return plain
            },
          }),
        )
        const record = yield* request(s.operators, records.put(s.write))
        expect((yield* request(s.operators, records.get({ context: s.context, record }))).payload).toBe(s.write.payload)
        const before = yield* rows
        probe.armed = true
        yield* refusal(request(s.operators, records.get({ context: s.context, record })), "authentication_required")
        expect(probe.opens).toBe(2)
        expect(yield* rows).toEqual(before)
      }),
    ).pipe(Effect.provide(layers(f.filename))),
  )
})

test("PR03 authority lost after sealing rolls back the record rather than committing ciphertext", () => {
  const f = cases.box()
  return Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const s = yield* setup(f.root)
        const cipher = yield* CredentialCipher.Service
        const probe = { armed: false, seals: 0 }
        const records = yield* FabricRecords.make({ operators: s.operators, root: f.root }).pipe(
          Effect.provideService(CredentialCipher.Service, {
            open: cipher.open,
            seal: (plain) => {
              const sealed = cipher.seal(plain)
              probe.seals++
              if (probe.armed) Effect.runSync(s.operators.revoke(s.operators.configured))
              return sealed
            },
          }),
        )
        yield* request(s.operators, records.put(s.write))
        const before = yield* rows
        probe.armed = true
        yield* refusal(
          request(s.operators, records.put({ ...s.write, expected: 1, payload: "not-committed" })),
          "authentication_required",
        )
        expect(probe.seals).toBe(2)
        expect(yield* rows).toEqual(before)
      }),
    ).pipe(Effect.provide(layers(f.filename))),
  )
})
