import { expect, test } from "bun:test"
import { randomBytes } from "node:crypto"
import path from "node:path"
import { existsSync, readFileSync } from "node:fs"
import { CredentialCipher } from "@orchestra/core/credential/cipher"
import { Database } from "@orchestra/core/database/database"
import { FabricRecord } from "@orchestra/schema/fabric-record"
import { eq } from "drizzle-orm"
import { Effect, Exit } from "effect"
import { FabricRecords } from "../src/record"
import { FabricRecordTable } from "../src/record/sql"
import { fixtures, owner, request } from "./fixture/context"
import { layers, refusal, rows, setup } from "./fixture/record"

const cases = fixtures()

test("PR01 real encrypted storage roundtrips with exact CAS and no plaintext row", () => {
  const f = cases.box()
  return Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const s = yield* setup(f.root)
        const ref = yield* request(s.operators, s.records.put(s.write))
        expect(ref).toEqual({ id: s.write.id, kind: "draft", revision: 1 })
        const saved = yield* rows
        expect(saved).toHaveLength(1)
        expect(saved[0].sealed?.startsWith(CredentialCipher.PREFIX)).toBe(true)
        expect(JSON.stringify(saved)).not.toContain(s.write.payload)
        expect(saved[0].bytes).toBe(Buffer.byteLength(saved[0].sealed!))
        expect(yield* request(s.operators, s.records.get({ context: s.context, record: ref }))).toEqual({
          record: ref,
          payload: s.write.payload,
        })
        const second = yield* request(s.operators, s.records.put({ ...s.write, expected: 1, payload: "updated" }))
        expect(second.revision).toBe(2)
        yield* refusal(request(s.operators, s.records.get({ context: s.context, record: ref })), "conflict")
        yield* refusal(request(s.operators, s.records.put({ ...s.write, expected: 1 })), "conflict")
        expect((yield* request(s.operators, s.records.get({ context: s.context, record: second }))).payload).toBe(
          "updated",
        )
      }),
    ).pipe(Effect.provide(layers(f.filename))),
  )
})

test("PR02 authenticated envelope rejects every substituted binding, future format and stale ciphertext", () => {
  const f = cases.box()
  return Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const s = yield* setup(f.root)
        const db = yield* Database.Service
        const cipher = yield* CredentialCipher.Service
        const ref = yield* request(s.operators, s.records.put(s.write))
        const original = (yield* rows)[0]
        const envelope = JSON.parse(cipher.open(original.sealed!)!)
        // The positive control above reads through the same real cipher and SQLite row.
        for (const [key, value] of Object.entries({
          domain: "wrong-domain",
          version: 2,
          storageID: "wrong-store",
          principal: "wrong-owner",
          contextID: "wrong-context",
          contextGeneration: 2,
          recordID: FabricRecord.ID.create(),
          kind: "composition",
          revision: 2,
        })) {
          const sealed = cipher.seal(JSON.stringify({ ...envelope, [key]: value }))
          yield* db.db
            .update(FabricRecordTable)
            .set({ sealed, bytes: Buffer.byteLength(sealed) })
            .where(eq(FabricRecordTable.id, ref.id))
          yield* refusal(request(s.operators, s.records.get({ context: s.context, record: ref })), "unavailable")
          expect((yield* rows)[0].sealed).toBe(sealed)
        }
        yield* db.db
          .update(FabricRecordTable)
          .set({ sealed: original.sealed, bytes: original.bytes })
          .where(eq(FabricRecordTable.id, ref.id))
        const current = yield* request(s.operators, s.records.put({ ...s.write, expected: 1, payload: "new-revision" }))
        yield* db.db
          .update(FabricRecordTable)
          .set({ sealed: original.sealed, bytes: original.bytes })
          .where(eq(FabricRecordTable.id, ref.id))
        yield* refusal(request(s.operators, s.records.get({ context: s.context, record: current })), "unavailable")
        yield* refusal(request(s.operators, s.records.put({ ...s.write, expected: 2 })), "unavailable")
      }),
    ).pipe(Effect.provide(layers(f.filename))),
  )
})

test("PR04 competing writes have exactly one CAS winner and stale delete cannot erase it", () => {
  const f = cases.box()
  return Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const s = yield* setup(f.root)
        const ref = yield* request(s.operators, s.records.put(s.write))
        const results = yield* Effect.all(
          ["left", "right"].map((payload) =>
            request(s.operators, s.records.put({ ...s.write, expected: ref.revision, payload })).pipe(Effect.exit),
          ),
          { concurrency: 2 },
        )
        expect(results.filter(Exit.isSuccess)).toHaveLength(1)
        expect(results.filter(Exit.isFailure)).toHaveLength(1)
        const rejected = results.find(Exit.isFailure)!
        yield* refusal(Effect.failCause(rejected.cause), "conflict")
        yield* refusal(request(s.operators, s.records.remove({ context: s.context, record: ref })), "conflict")
        expect((yield* rows)[0].revision).toBe(2)
      }),
    ).pipe(Effect.provide(layers(f.filename))),
  )
})

test("PR05 wrong key, plaintext and corrupt envelopes cannot be overwritten or deleted; original bytes recover", () => {
  const f = cases.box()
  return Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const s = yield* setup(f.root)
        const db = yield* Database.Service
        const ref = yield* request(s.operators, s.records.put(s.write))
        const original = (yield* rows)[0]
        for (const sealed of [
          s.write.payload,
          "enc:v1:broken",
          CredentialCipher.seal(s.write.payload, randomBytes(32)),
        ]) {
          yield* db.db
            .update(FabricRecordTable)
            .set({ sealed, bytes: Buffer.byteLength(sealed) })
            .where(eq(FabricRecordTable.id, ref.id))
          for (const effect of [
            s.records.get({ context: s.context, record: ref }).pipe(Effect.asVoid),
            s.records.put({ ...s.write, expected: 1 }).pipe(Effect.asVoid),
            s.records.remove({ context: s.context, record: ref }).pipe(Effect.asVoid),
          ])
            yield* refusal(request(s.operators, effect), "unavailable")
          expect((yield* rows)[0].sealed).toBe(sealed)
          expect((yield* rows)[0].revision).toBe(1)
        }
        yield* db.db
          .update(FabricRecordTable)
          .set({ sealed: original.sealed, bytes: original.bytes })
          .where(eq(FabricRecordTable.id, ref.id))
        expect((yield* request(s.operators, s.records.get({ context: s.context, record: ref }))).payload).toBe(
          s.write.payload,
        )
      }),
    ).pipe(Effect.provide(layers(f.filename))),
  )
})

test("PR07 removal clears sensitive bytes but keeps a non-reusable revision tombstone", () => {
  const f = cases.box()
  return Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const s = yield* setup(f.root)
        const ref = yield* request(s.operators, s.records.put(s.write))
        expect(yield* request(s.operators, s.records.remove({ context: s.context, record: ref }))).toEqual({
          ...ref,
          revision: 2,
        })
        expect((yield* rows)[0]).toMatchObject({ sealed: null, bytes: 0, deleted: true, revision: 2 })
        yield* refusal(request(s.operators, s.records.get({ context: s.context, record: ref })), "expired")
        yield* refusal(request(s.operators, s.records.put(s.write)), "expired")
        yield* refusal(request(s.operators, s.records.put({ ...s.write, expected: 2 })), "expired")
        expect(yield* rows).toHaveLength(1)
      }),
    ).pipe(Effect.provide(layers(f.filename))),
  )
})

test("PR08 actual Fabric table survives reopen and refuses replacement key without modifying stored bytes", async () => {
  const f = cases.box()
  const stored = await Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const s = yield* setup(f.root)
        const record = yield* request(s.operators, s.records.put(s.write))
        return { context: s.context, record, payload: s.write.payload }
      }),
    ).pipe(Effect.provide(layers(f.filename))),
  )
  const before = readFileSync(f.filename)
  const missing = path.join(f.directory, "missing-key")
  await expect(CredentialCipher.refuseNewKey(missing, { databaseFiles: [f.filename], authFiles: [] })).rejects.toThrow(
    "missing",
  )
  expect(existsSync(missing)).toBe(false)
  expect(readFileSync(f.filename)).toEqual(before)
  await Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const operators = yield* owner()
        const records = yield* FabricRecords.make({ operators, root: f.root })
        expect(yield* request(operators, records.get({ context: stored.context, record: stored.record }))).toEqual({
          record: stored.record,
          payload: stored.payload,
        })
      }),
    ).pipe(Effect.provide(layers(f.filename))),
  )
})
