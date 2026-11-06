import { expect, test } from "bun:test"
import { CredentialCipher } from "@orchestra/core/credential"
import { FabricRecord } from "@orchestra/schema/fabric-record"
import { Effect } from "effect"
import { FabricRecords } from "../src/record"
import { fixtures, owner, request } from "./fixture/context"
import { layers, refusal, rows, setup } from "./fixture/record"

const cases = fixtures()

test("PR11 metadata-only pages are bounded, owner/context/kind scoped and never decrypt content", () => {
  const f = cases.box()
  return Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const s = yield* setup(f.root)
        const cipher = yield* CredentialCipher.Service
        const seen = { opens: 0 }
        const records = yield* FabricRecords.make({ operators: s.operators, root: f.root }).pipe(
          Effect.provideService(CredentialCipher.Service, {
            seal: cipher.seal,
            open: (text) => {
              seen.opens++
              return cipher.open(text)
            },
          }),
        )
        const ids = yield* Effect.forEach([0, 1, 2], () =>
          request(s.operators, records.put({ ...s.write, id: FabricRecord.ID.create() })),
        )
        yield* request(s.operators, records.get({ context: s.context, record: ids[0] }))
        expect(seen.opens).toBe(1)
        const other = (yield* request(s.operators, s.contexts.create({}))).context
        yield* request(s.operators, records.put({ ...s.write, context: other, id: FabricRecord.ID.create() }))
        yield* request(s.operators, records.put({ ...s.write, id: FabricRecord.ID.create(), kind: "composition" }))
        const first = yield* request(s.operators, records.list({ context: s.context, kind: "draft", limit: 2 }))
        expect(first.items).toHaveLength(2)
        expect(first.after).toBe(first.items[1].id)
        const last = yield* request(
          s.operators,
          records.list({ context: s.context, kind: "draft", limit: 2, after: first.after }),
        )
        expect(last.items).toHaveLength(1)
        expect(last.after).toBeUndefined()
        expect([...first.items, ...last.items].map((record) => record.id).sort()).toEqual(
          ids.map((record) => record.id).sort(),
        )
        expect(JSON.stringify(first)).not.toContain(s.write.payload)
        expect(seen.opens).toBe(1)
        const stranger = yield* owner("other-record-reader")
        const foreign = yield* FabricRecords.make({ operators: stranger, root: f.root })
        yield* refusal(request(stranger, foreign.list({ context: s.context, kind: "draft" })), "denied")
        yield* refusal(
          request(s.operators, records.list({ context: s.context, kind: "draft", limit: 33 })),
          "invalid-input",
        )
      }),
    ).pipe(Effect.provide(layers(f.filename))),
  )
})

test("PR12 policy header is inside ciphertext and its bounded overhead does not shrink a valid 256 KiB payload", () => {
  const f = cases.box()
  return Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const s = yield* setup(f.root)
        // Worst-case JSON escaping exercises the pre-decode bound as well as actual UTF-8 admission.
        const input = { ...s.write, payload: "\u0000".repeat(256 * 1024), metadata: "\u0000".repeat(4096) }
        const record = yield* request(s.operators, s.records.put(input))
        const actual = yield* request(s.operators, s.records.get({ context: s.context, record }))
        expect(actual.payload).toBe(input.payload)
        expect(actual.metadata).toBe(input.metadata)
        const before = yield* rows
        expect(before[0].bytes).toBe(Buffer.byteLength(before[0].sealed!))
        expect(before[0].sealed).not.toContain("metadata")
        yield* refusal(
          request(s.operators, s.records.put({ ...input, expected: 1, metadata: "ä".repeat(2049) })),
          "limit",
        )
        expect(yield* rows).toEqual(before)
      }),
    ).pipe(Effect.provide(layers(f.filename))),
  )
})
