import { expect, test } from "bun:test"
import { FabricContext } from "@orchestra/schema/fabric-context"
import { CredentialCipher } from "@orchestra/core/credential/cipher"
import { FabricRecord } from "@orchestra/schema/fabric-record"
import { Effect, Option, Schema } from "effect"
import { FabricRecords } from "../src/record"
import { fixtures, request } from "./fixture/context"
import { layers, refusal, rows, setup } from "./fixture/record"

const cases = fixtures()

test("PR01 Core entry exposes the exact existing cipher namespace, not a substitute", async () => {
  const entry = await import("@orchestra/core/credential")
  expect(entry.CredentialCipher).toBe(CredentialCipher)
})

test("PR01 canonical record codecs reject foreign IDs, unknown fields and unsafe revisions", () => {
  const id = FabricRecord.ID.create()
  const ref = { id, kind: "composition" as const, revision: 1 }
  const decode = Schema.decodeUnknownOption(FabricRecord.Ref)
  expect(decode(ref)).toEqual(Option.some(ref))
  for (const invalid of [
    { ...ref, id: FabricContext.ID.create() },
    { ...ref, revision: 0 },
    { ...ref, kind: "rows" },
    { ...ref, bearer: "not-authority" },
  ])
    expect(Option.isNone(decode(invalid))).toBe(true)
})

test("PR06 invalid inputs are typed refusals and never mutate storage", () => {
  const f = cases.box()
  return Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const s = yield* setup(f.root)
        for (const input of [
          { ...s.write, expected: -1 },
          { ...s.write, expected: Number.MAX_SAFE_INTEGER + 1 },
          { ...s.write, extra: "rejected" },
          { ...s.write, payload: 42 },
        ]) {
          // Deliberately cross the runtime boundary with invalid values, not a second implementation of its codec.
          yield* refusal(request(s.operators, s.records.put(input as typeof s.write)), "invalid-input")
        }
        expect(yield* rows).toEqual([])
        const record = yield* request(s.operators, s.records.put(s.write))
        yield* refusal(
          request(
            s.operators,
            s.records.get({ context: s.context, record: { ...record, revision: Number.MAX_SAFE_INTEGER + 1 } }),
          ),
          "invalid-input",
        )
        expect(yield* rows).toHaveLength(1)
        yield* refusal(
          FabricRecords.make({ operators: s.operators, root: f.root, limits: { payloadBytes: undefined } }),
          "invalid-input",
        )
      }),
    ).pipe(Effect.provide(layers(f.filename))),
  )
})
