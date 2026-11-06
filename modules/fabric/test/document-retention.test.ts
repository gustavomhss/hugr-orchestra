import { expect, test } from "bun:test"
import { FabricRecord } from "@orchestra/schema/fabric-record"
import { Effect } from "effect"
import { FabricDocuments } from "../src/document"
import { fixtures, request } from "./fixture/context"
import { layers, refusal, rows, setup } from "./fixture/record"

const cases = fixtures()
const week = 7 * 24 * 60 * 60 * 1000

test("DOC01 protected draft content is readable before, never at/after its seven-day deadline", () => {
  const f = cases.box()
  return Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const s = yield* setup(f.root)
        const clock = { now: 1000 }
        const documents = yield* FabricDocuments.make({ operators: s.operators, root: f.root, now: () => clock.now })
        const record = yield* request(s.operators, documents.put(s.write))
        const selection = { context: s.context, record }
        expect((yield* request(s.operators, documents.get(selection))).payload).toBe(s.write.payload)
        expect(JSON.stringify(yield* rows)).not.toContain(s.write.payload)
        clock.now += week - 1
        const last = yield* request(s.operators, documents.get(selection))
        expect(last.expiresAt).toBe(1000 + week)
        expect(last.updatedAt).toBe(1000)
        clock.now++
        yield* refusal(request(s.operators, documents.get(selection)), "expired")
        const page = yield* request(s.operators, documents.inspect({ context: s.context, kind: "draft" }))
        expect(page.items).toHaveLength(1)
        expect(page.items[0]).toMatchObject({ expired: true, record, expiresAt: 1000 + week })
        expect(JSON.stringify(page)).not.toContain(s.write.payload)
        yield* refusal(
          request(s.operators, documents.sweep({ context: s.context, kind: "draft", confirm: false })),
          "denied",
        )
        expect((yield* rows)[0].sealed).not.toBeNull()
        const cleared = yield* request(
          s.operators,
          documents.sweep({ context: s.context, kind: "draft", confirm: true }),
        )
        expect(cleared.complete).toBe(true)
        expect(cleared.items).toEqual([{ record: { ...record, revision: 2 }, status: "removed" }])
        expect((yield* rows)[0]).toMatchObject({ sealed: null, bytes: 0, deleted: true })
      }),
    ).pipe(Effect.provide(layers(f.filename))),
  )
})

test("DOC02 only explicit draft edits renew inactivity; composition has no automatic expiry", () => {
  const f = cases.box()
  return Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const s = yield* setup(f.root)
        const clock = { now: 1000 }
        const documents = yield* FabricDocuments.make({ operators: s.operators, root: f.root, now: () => clock.now })
        const first = yield* request(s.operators, documents.put(s.write))
        const composition = yield* request(
          s.operators,
          documents.put({ ...s.write, id: FabricRecord.ID.create(), kind: "composition" }),
        )
        clock.now += week - 10
        const edited = yield* request(
          s.operators,
          documents.put({ ...s.write, expected: first.revision, payload: "explicit-edit" }),
        )
        const expiry = clock.now + week
        yield* refusal(request(s.operators, documents.put({ ...s.write, expected: first.revision })), "conflict")
        clock.now = expiry - 1
        expect((yield* request(s.operators, documents.get({ context: s.context, record: edited }))).expiresAt).toBe(
          expiry,
        )
        clock.now = expiry
        yield* refusal(request(s.operators, documents.get({ context: s.context, record: edited })), "expired")
        const saved = yield* request(s.operators, documents.get({ context: s.context, record: composition }))
        expect(saved.payload).toBe(s.write.payload)
        expect(saved.expiresAt).toBeNull()
        yield* refusal(
          request(s.operators, documents.remove({ context: s.context, record: composition, confirm: false })),
          "denied",
        )
        yield* request(s.operators, documents.remove({ context: s.context, record: composition, confirm: true }))
        expect((yield* rows).find((row) => row.id === composition.id)?.deleted).toBe(true)
      }),
    ).pipe(Effect.provide(layers(f.filename))),
  )
})

test("DOC03 evidence requires opt-in and editing cannot silently renew its original retention", () => {
  const f = cases.box()
  return Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const s = yield* setup(f.root)
        const clock = { now: 1000 }
        const documents = yield* FabricDocuments.make({ operators: s.operators, root: f.root, now: () => clock.now })
        const input = { ...s.write, kind: "evidence" as const }
        yield* refusal(request(s.operators, documents.put(input)), "denied")
        expect(yield* rows).toEqual([])
        const record = yield* request(s.operators, documents.put({ ...input, consent: true }))
        clock.now += week - 1
        const edited = yield* request(
          s.operators,
          documents.put({ ...input, expected: record.revision, consent: true, payload: "edited-proof" }),
        )
        const data = yield* request(s.operators, documents.get({ context: s.context, record: edited }))
        expect(data.expiresAt).toBe(1000 + week)
        clock.now++
        yield* refusal(request(s.operators, documents.get({ context: s.context, record: edited })), "expired")
      }),
    ).pipe(Effect.provide(layers(f.filename))),
  )
})

test("DOC04 bounded inspection/sweep paginate real records and never clear retained content", () => {
  const f = cases.box()
  return Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const s = yield* setup(f.root)
        const clock = { now: 1000 }
        const documents = yield* FabricDocuments.make({ operators: s.operators, root: f.root, now: () => clock.now })
        const expired = yield* Effect.forEach([0, 1, 2], () =>
          request(s.operators, documents.put({ ...s.write, id: FabricRecord.ID.create() })),
        )
        clock.now += week
        const retained = yield* request(
          s.operators,
          documents.put({ ...s.write, id: FabricRecord.ID.create(), payload: "keep-live" }),
        )
        const seen: string[] = []
        const cursor = { after: undefined as FabricRecord.ID | undefined }
        do {
          const page = yield* request(
            s.operators,
            documents.sweep({
              context: s.context,
              kind: "draft",
              limit: 2,
              ...(cursor.after ? { after: cursor.after } : {}),
              confirm: true,
            }),
          )
          expect(page.complete).toBe(true)
          expect(page.items.length).toBeLessThanOrEqual(2)
          page.items.forEach((item) => seen.push(item.record.id))
          cursor.after = page.after
        } while (cursor.after)
        expect(seen.sort()).toEqual([...expired.map((ref) => ref.id), retained.id].sort())
        const remaining = yield* request(s.operators, documents.inspect({ context: s.context, kind: "draft" }))
        expect(remaining.items.map((item) => item.record)).toEqual([retained])
        expect((yield* request(s.operators, documents.get({ context: s.context, record: retained }))).payload).toBe(
          "keep-live",
        )
        expect((yield* rows).filter((row) => row.deleted)).toHaveLength(3)
      }),
    ).pipe(Effect.provide(layers(f.filename))),
  )
})

test("DOC05 backward/invalid host time and deleted context do not restore retention or authority", () => {
  const f = cases.box()
  return Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const s = yield* setup(f.root)
        const clock = { now: 1000 }
        const documents = yield* FabricDocuments.make({ operators: s.operators, root: f.root, now: () => clock.now })
        const record = yield* request(s.operators, documents.put(s.write))
        clock.now = 999
        yield* refusal(request(s.operators, documents.get({ context: s.context, record })), "unavailable")
        clock.now = NaN
        yield* refusal(request(s.operators, documents.put({ ...s.write, expected: record.revision })), "unavailable")
        clock.now = 1000
        const before = yield* rows
        yield* request(s.operators, s.contexts.remove(s.context))
        yield* refusal(request(s.operators, documents.inspect({ context: s.context, kind: "draft" })), "expired")
        yield* refusal(
          request(s.operators, documents.sweep({ context: s.context, kind: "draft", confirm: true })),
          "expired",
        )
        expect(yield* rows).toEqual(before)
      }),
    ).pipe(Effect.provide(layers(f.filename))),
  )
})
