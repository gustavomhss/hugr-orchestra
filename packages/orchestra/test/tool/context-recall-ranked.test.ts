import { describe, expect, test } from "bun:test"
import { FSUtil } from "@orchestra/core/fs-util"
import { LayerNode } from "@orchestra/core/effect/layer-node"
import { Effect, Layer, Schema } from "effect"
import { Archive } from "@/continuity/archive"
import { MessageID } from "@/session/schema"
import { Parameters } from "@/tool/context-recall"
import { ContextRecallArchive } from "@/tool/context-recall-archive"
import { fixture, instrument, tool, user } from "../continuity/archive-fixture"
import { testEffect } from "../lib/effect"

const it = testEffect(LayerNode.compile(FSUtil.node))
const Page = Schema.Struct({
  status: Schema.String,
  order: Schema.String,
  offset_unit: Schema.String,
  offset: Schema.Int,
  total: Schema.Int,
  retained: Schema.Int,
  complete: Schema.Boolean,
  next_offset: Schema.optional(Schema.Int),
  continuation: Schema.optional(Schema.Union([ContextRecallArchive.Search, ContextRecallArchive.List])),
  references: Schema.Array(
    Schema.Struct({
      id: Schema.String,
      first: Schema.String,
      last: Schema.String,
      title: Schema.String,
      score: Schema.optional(Schema.Number),
      field: Schema.String,
      snippet: Schema.String,
      snippet_offset: Schema.Int,
    }),
  ),
})
const page = Schema.decodeUnknownSync(Page)

function recall(
  f: Effect.Success<ReturnType<typeof fixture>>,
  params: Schema.Schema.Type<
    typeof ContextRecallArchive.Search | typeof ContextRecallArchive.List | typeof ContextRecallArchive.Lookup
  >,
) {
  return ContextRecallArchive.recall(f.archive, params, f.sessionID).pipe(
    Effect.tap((output) =>
      Effect.sync(() => {
        expect(Buffer.byteLength(JSON.stringify(output), "utf8")).toBeLessThanOrEqual(8000)
      }),
    ),
  )
}

describe("context_recall ranked archive", () => {
  test("closed public modes accept search controls and reject foreign capabilities and invalid identifiers", () => {
    const decode = Schema.decodeUnknownSync(Parameters)
    for (const match of [undefined, "literal", "terms"] as const) {
      const input = {
        archive_query: "x".repeat(256),
        match,
        offset: 0,
        limit: 20,
        role: "user" as const,
        from_message: MessageID.make("msg_start"),
        through_message: MessageID.make("msg_end"),
      }
      expect(decode(input)).toEqual(input)
    }
    expect(decode({ archive_query: "", match: "terms" })).toEqual({ archive_query: "", match: "terms" })
    for (const input of [
      { archive_query: "x".repeat(257) },
      { archive_query: "x", match: "semantic" },
      { archive_query: "x", role: "tool" },
      { archive_query: "x", limit: 21 },
      ...[-1, 0.5, "0", Number.MAX_SAFE_INTEGER + 1].map((offset) => ({ archive_query: "x", offset })),
      ...["msg", "msg_bad\n", "msg_/tmp/a", "/tmp/a", "https://example.test/a"].flatMap((id) => [
        { archive_query: "x", from_message: id },
        { archive_query: "x", through_message: id },
      ]),
      ...["sessionID", "session_id", "path", "filePath", "url", "command"].map((key) => ({
        archive_query: "x",
        match: "terms",
        [key]: "/foreign",
      })),
      { archive_query: "x", archive_list: true },
      { reference: "a".repeat(64), match: "terms" },
      { archive_list: true, role: "assistant" },
    ])
      expect(() => decode(input)).toThrow()
  })

  it.live("finds separated terms missed by literal; ranks phrase, proximity and newest source deterministically", () =>
    Effect.gen(function* () {
      const f = yield* fixture()
      const chunks = yield* f.archive.publish({
        sessionID: f.sessionID,
        messages: [
          user(f.sessionID, "30far", `recovery ${"gap ".repeat(30)}evidence`),
          user(f.sessionID, "10phrase", "recovery evidence"),
          user(f.sessionID, "50partial", "recoveries evidence"),
          user(f.sessionID, "20near", "recovery nearby evidence"),
          user(f.sessionID, "40phrase", "recovery evidence"),
        ],
      })
      const literal = page(yield* recall(f, { archive_query: "recovery evidence" }))
      expect(literal).toMatchObject({ total: 2, complete: true, order: "first_message_ascending" })
      expect(literal.references.map((ref) => ref.first)).toEqual(["msg_10phrase", "msg_40phrase"])
      const params = { archive_query: "recovery evidence", match: "terms", limit: 2 } as const
      const first = page(yield* recall(f, params))
      expect(first).toMatchObject({
        total: 4,
        retained: 5,
        complete: false,
        next_offset: 2,
        offset_unit: "ranked_references",
        order: "score_descending_source_descending_id_ascending",
      })
      expect(first.continuation).toEqual({ ...params, offset: 2 })
      expect(first.references.map((ref) => ref.first)).toEqual(["msg_40phrase", "msg_10phrase"])
      const second = page(yield* recall(f, { ...params, offset: 2 }))
      expect(second.references.map((ref) => ref.first)).toEqual(["msg_20near", "msg_30far"])
      expect(second).toMatchObject({ total: 4, complete: true, offset: 2 })
      expect(second.next_offset).toBeUndefined()
      expect(first.references[1].score).toBeGreaterThan(second.references[0].score ?? Infinity)
      expect(second.references[0].score).toBeGreaterThan(second.references[1].score ?? Infinity)
      expect(page(yield* recall(f, params))).toEqual(first)
      for (const ref of [...first.references, ...second.references]) {
        const original = chunks.find((chunk) => chunk.id === ref.id)
        expect(original).toBeDefined()
        if (!original) throw new Error("ranked reference missing from published archive")
        expect(ref.snippet).toBe(original.markdown.slice(ref.snippet_offset, ref.snippet_offset + 300))
      }
    }),
  )

  it.live("matches exact source IDs, ranks title terms, and breaks equal-source ties by archive ID", () =>
    Effect.gen(function* () {
      const f = yield* fixture()
      const chunks = yield* f.archive.publish({
        sessionID: f.sessionID,
        messages: [
          user(f.sessionID, "source", "filler ".repeat(12000)),
          user(f.sessionID, "source_extra", "different observation"),
          user(f.sessionID, "z_echo", "quoted msg_source"),
        ],
      })
      const originals = chunks.filter((chunk) => chunk.first === "msg_source")
      expect(originals.length).toBeGreaterThan(1)
      const hits = page(yield* recall(f, { archive_query: "msg_source", match: "terms", limit: 20 }))
      expect(hits.total).toBe(originals.length + 1)
      expect(hits.references.slice(0, originals.length).map((ref) => ref.id)).toEqual(
        originals.map((ref) => ref.id).toSorted(),
      )
      expect(hits.references.at(-1)?.first).toBe("msg_z_echo")
      expect(hits.references[0].score).toBeGreaterThan(hits.references.at(-1)?.score ?? Infinity)
      expect(page(yield* recall(f, { archive_query: "msg_sourc", match: "terms" }))).toMatchObject({
        total: 0,
        complete: true,
      })
    }),
  )

  it.live("phrase beats title terms; title evidence beats proximity; reversed phrase is not exact", () =>
    Effect.gen(function* () {
      const f = yield* fixture()
      yield* f.archive.publish({
        sessionID: f.sessionID,
        messages: [
          user(f.sessionID, "priority", `${"filler ".repeat(50)}receipt`),
          user(f.sessionID, "phrase", "msg_priority receipt"),
          user(f.sessionID, "z_reverse", "receipt msg_priority"),
          user(f.sessionID, "zz_near", "msg_priority nearby receipt"),
        ],
      })
      const result = page(yield* recall(f, { archive_query: "msg_priority receipt", match: "terms" }))
      expect(result.references.map((ref) => ref.first)).toEqual([
        "msg_phrase",
        "msg_priority",
        "msg_z_reverse",
        "msg_zz_near",
      ])
      expect(result.references[0].score).toBeGreaterThan(result.references[1].score ?? Infinity)
      expect(result.references[1].score).toBeGreaterThan(result.references[2].score ?? Infinity)
      expect(result.references[2].score).toBeGreaterThan(result.references[3].score ?? Infinity)
    }),
  )

  it.live("normalizes case, accents and non-ASCII words while preserving original snippet offsets", () =>
    Effect.gen(function* () {
      const f = yield* fixture()
      const [chunk] = yield* f.archive.publish({
        sessionID: f.sessionID,
        messages: [user(f.sessionID, "unicode", "préface 😀 Café\nSAO cafe\u0301 ação Ελληνικά 東京 [ZX.*]")],
      })
      for (const archive_query of ["CAFE ação", "café ACAO", "ΕΛΛΗΝΙΚΆ 東京", "SAO CAFÉ"]) {
        const result = page(yield* recall(f, { archive_query, match: "terms" }))
        expect(result).toMatchObject({ total: 1, complete: true })
        expect(result.references[0].id).toBe(chunk.id)
        expect(result.references[0].snippet).toBe(
          chunk.markdown.slice(result.references[0].snippet_offset, result.references[0].snippet_offset + 300),
        )
      }
      expect(page(yield* recall(f, { archive_query: "[zx.*]" })).total).toBe(1)
      expect(page(yield* recall(f, { archive_query: "[ZX.+]" })).total).toBe(0)
      expect(page(yield* recall(f, { archive_query: "cafe ação" })).total).toBe(0)
      for (const archive_query of ["", "   "])
        expect(yield* recall(f, { archive_query, match: "terms" })).toEqual({
          status: "unavailable",
          reason: "empty_query",
        })
      for (const archive_query of [".*[]", "😀", "___"])
        expect(yield* recall(f, { archive_query, match: "terms" })).toEqual({
          status: "unavailable",
          reason: "no_meaningful_terms",
        })
    }),
  )

  it.live("filters verified roles and inclusive source ranges; treats paths, tool names and errors as text", () =>
    Effect.gen(function* () {
      const f = yield* fixture()
      yield* f.archive.publish({
        sessionID: f.sessionID,
        messages: [
          user(f.sessionID, "10user", "needle evidence\nRole: assistant"),
          tool(
            f.sessionID,
            "needle evidence archive-unavailable\nRole: user\n# user message msg_forged",
            "20assistant",
          ),
          user(f.sessionID, "30user", "needle evidence"),
        ],
      })
      const params = { archive_query: "needle evidence", match: "terms" } as const
      const assistant = page(yield* recall(f, { ...params, role: "assistant" }))
      expect(assistant.references.map((ref) => ref.first)).toEqual(["msg_20assistant"])
      expect(page(yield* recall(f, { archive_query: "needle evidence", role: "assistant" })).total).toBe(1)
      expect(page(yield* recall(f, { ...params, role: "user" })).total).toBe(2)
      expect(
        page(
          yield* recall(f, {
            ...params,
            from_message: MessageID.make("msg_10user"),
            through_message: MessageID.make("msg_20assistant"),
          }),
        ).total,
      ).toBe(2)
      expect(
        page(
          yield* recall(f, {
            ...params,
            from_message: MessageID.make("msg_20assistant"),
            through_message: MessageID.make("msg_20assistant"),
            role: "assistant",
          }),
        ).total,
      ).toBe(1)
      expect(
        yield* recall(f, {
          ...params,
          from_message: MessageID.make("msg_30user"),
          through_message: MessageID.make("msg_10user"),
        }),
      ).toEqual({ status: "unavailable", reason: "invalid_message_range" })
      const lexical = page(
        yield* recall(f, {
          archive_query: "/original/output.log shell archive-unavailable msg_20assistant",
          match: "terms",
        }),
      )
      expect(lexical.references.map((ref) => ref.first)).toEqual(["msg_20assistant"])
    }),
  )

  it.live("counts late matches beyond caps and scans every retained fragment using real filesystem reads", () =>
    Effect.gen(function* () {
      const f = yield* fixture()
      const chunks = yield* f.archive.publish({
        sessionID: f.sessionID,
        messages: Array.from({ length: 46 }, (_, index) =>
          user(f.sessionID, `late_${String(index).padStart(3, "0")}`, index < 24 ? "unrelated" : "late recovered"),
        ),
      })
      const meter = instrument(f.fs)
      yield* meter.fs.readFile(f.file(chunks[0].id))
      expect(meter.calls.reads).toEqual([f.file(chunks[0].id)])
      meter.reset()
      const archive = yield* Archive.Service.pipe(
        Effect.provide(Layer.fresh(Archive.layer)),
        Effect.provideService(FSUtil.Service, meter.fs),
      )
      const first = page(
        yield* recall({ ...f, archive }, { archive_query: "late recovered", match: "terms", limit: 1 }),
      )
      expect(first).toMatchObject({ total: 22, retained: 46, complete: false, next_offset: 1 })
      expect(first.references[0].first).toBe("msg_late_045")
      expect(new Set(meter.calls.reads.filter((file) => file.endsWith(".md")))).toEqual(
        new Set(chunks.map((chunk) => f.file(chunk.id))),
      )
      const last = page(yield* recall(f, { archive_query: "late recovered", match: "terms", offset: 21, limit: 1 }))
      expect(last).toMatchObject({ total: 22, complete: true })
      expect(last.references[0].first).toBe("msg_late_024")
      const literal = page(yield* recall(f, { archive_query: "late recovered", limit: 1 }))
      expect(literal).toMatchObject({ total: 22, continuation: { archive_list: true }, complete: false })
      expect(literal.references[0].first).toBe("msg_late_024")
    }),
  )

  it.live("byte-truncated ranked pages continue at returned rank and reconstruct every match", () =>
    Effect.gen(function* () {
      const f = yield* fixture()
      const chunks = yield* f.archive.publish({
        sessionID: f.sessionID,
        messages: Array.from({ length: 20 }, (_, index) =>
          user(f.sessionID, `bytes_${String(index).padStart(2, "0")}`, `needle receipt ${'😀"\\\n'.repeat(300)}`),
        ),
      })
      const params = { archive_query: "needle receipt", match: "terms", limit: 20 } as const
      const first = page(yield* recall(f, params))
      expect(first.references.length).toBeGreaterThan(0)
      expect(first.references.length).toBeLessThan(20)
      expect(first.next_offset).toBe(first.references.length)
      const collected: string[] = []
      let current = first
      while (true) {
        expect(current.total).toBe(20)
        collected.push(...current.references.map((ref) => ref.id))
        expect(collected.length).toBeLessThanOrEqual(20)
        if (current.complete) break
        expect(current.next_offset).toBe(current.offset + current.references.length)
        expect(current.next_offset).toBeGreaterThan(current.offset)
        expect(current.continuation).toEqual({ ...params, offset: current.next_offset })
        current = page(yield* recall(f, { ...params, offset: current.next_offset }))
      }
      expect(current.next_offset).toBeUndefined()
      expect(collected).toEqual(chunks.toReversed().map((chunk) => chunk.id))
    }),
  )

  it.live("reports honest offsets and oversized metadata without allocating by arbitrary offset", () =>
    Effect.gen(function* () {
      const f = yield* fixture()
      yield* f.archive.publish({ sessionID: f.sessionID, messages: [user(f.sessionID, "offset", "offset receipt")] })
      const params = { archive_query: "offset receipt", match: "terms" } as const
      expect(page(yield* recall(f, params)).total).toBe(1)
      expect(page(yield* recall(f, { ...params, offset: 1 }))).toMatchObject({
        complete: true,
        references: [],
        offset: 1,
      })
      for (const offset of [2, Number.MAX_SAFE_INTEGER])
        expect(yield* recall(f, { ...params, offset })).toEqual({
          status: "unavailable",
          reason: "offset_out_of_range",
          total: 1,
        })
      const huge = yield* fixture()
      yield* huge.archive.publish({
        sessionID: huge.sessionID,
        messages: [user(huge.sessionID, "z".repeat(4100), "huge receipt")],
      })
      expect(yield* recall(huge, { archive_query: "huge receipt", match: "terms" })).toEqual({
        status: "unavailable",
        reason: "metadata_too_large",
      })
    }),
  )

  it.live("fails closed on late corruption and missing data even after page cap or role exclusion", () =>
    Effect.gen(function* () {
      const f = yield* fixture()
      const chunks = yield* f.archive.publish({
        sessionID: f.sessionID,
        messages: Array.from({ length: 24 }, (_, index) =>
          user(f.sessionID, `integrity_${String(index).padStart(2, "0")}`, "integrity receipt"),
        ),
      })
      const late = chunks[chunks.length - 1]
      expect(page(yield* recall(f, { archive_query: "integrity receipt", match: "terms", limit: 1 })).total).toBe(24)
      yield* f.fs.writeFileString(f.file(late.id), late.markdown.replace("integrity receipt", "tampered! receipt"))
      for (const params of [
        { archive_query: "integrity receipt", limit: 1 },
        { archive_query: "integrity receipt", match: "terms", limit: 1 },
        { archive_query: "absent", match: "terms", role: "assistant" },
        { archive_query: "integrity receipt", match: "terms", offset: Number.MAX_SAFE_INTEGER },
      ] as const)
        expect(yield* recall(f, params)).toEqual({ status: "unavailable", reason: "archive-corrupt-hash" })
      expect(yield* recall(f, { reference: chunks[0].id, limit: 1 })).toMatchObject({ status: "found" })
      expect(page(yield* recall(f, { archive_list: true, limit: 1 })).total).toBe(24)
      yield* f.fs.remove(f.file(late.id))
      expect(yield* recall(f, { archive_query: "integrity receipt", match: "terms", limit: 1 })).toEqual({
        status: "unavailable",
        reason: "archive-unavailable",
      })
    }),
  )

  it.live("keeps session namespace and rejects forged descriptors, foreign envelopes and external links", () =>
    Effect.gen(function* () {
      const own = yield* fixture()
      const foreign = yield* fixture()
      const [local] = yield* own.archive.publish({
        sessionID: own.sessionID,
        messages: [user(own.sessionID, "own", "owned receipt")],
      })
      const [other] = yield* foreign.archive.publish({
        sessionID: foreign.sessionID,
        messages: [user(foreign.sessionID, "other", "foreign secret")],
      })
      expect(page(yield* recall(foreign, { archive_query: "foreign secret", match: "terms" })).total).toBe(1)
      expect(page(yield* recall(own, { archive_query: "foreign secret", match: "terms" }))).toMatchObject({
        total: 0,
        references: [],
      })
      expect(yield* recall(own, { reference: other.id })).toEqual({
        status: "unavailable",
        source: { reference: other.id },
        reason: "missing",
      })
      yield* own.fs.writeFileString(own.file(other.id), other.markdown)
      expect(page(yield* recall(own, { archive_query: "foreign secret", match: "terms" })).total).toBe(0)
      const index = yield* own.fs.readFileString(own.index)
      const refs = yield* own.archive.list(own.sessionID)
      for (const reference of [
        { ...refs[0], title: "invented title" },
        { ...refs[0], first: MessageID.make("msg_fake"), last: MessageID.make("msg_fake") },
      ]) {
        yield* own.fs.writeFileString(
          own.index,
          JSON.stringify({ version: 1, sessionID: own.sessionID, references: [reference] }),
        )
        expect(yield* recall(own, { archive_query: "owned", match: "terms" })).toEqual({
          status: "unavailable",
          reason: "archive-corrupt-content",
        })
      }
      const { markdown, ...descriptor } = other
      yield* own.fs.writeFileString(
        own.index,
        JSON.stringify({ version: 1, sessionID: own.sessionID, references: [...refs, descriptor] }),
      )
      expect(yield* recall(own, { archive_query: "owned", match: "terms" })).toEqual({
        status: "unavailable",
        reason: "archive-corrupt-content",
      })
      yield* own.fs.writeFileString(
        own.index,
        JSON.stringify({ version: 1, sessionID: foreign.sessionID, references: refs }),
      )
      expect(yield* recall(own, { archive_query: "owned", match: "terms" })).toEqual({
        status: "unavailable",
        reason: "archive-corrupt-index",
      })
      yield* own.fs.writeFileString(own.index, index)
      yield* own.fs.remove(own.file(local.id))
      yield* own.fs.symlink(foreign.file(other.id), own.file(local.id))
      expect(yield* recall(own, { archive_query: "owned", match: "terms" })).toEqual({
        status: "unavailable",
        reason: "archive-unsafe-path",
      })
    }),
  )

  it.live("preserves literal ascending order, escaped text, reference UTF-16 pages and list offsets", () =>
    Effect.gen(function* () {
      const f = yield* fixture()
      const chunks = yield* f.archive.publish({
        sessionID: f.sessionID,
        messages: [
          user(f.sessionID, "03", "[ZX.*] 😀"),
          user(f.sessionID, "01", "[ZX.*] 😀"),
          user(f.sessionID, "02", "[ZX.*] 😀"),
        ],
      })
      const literal = page(yield* recall(f, { archive_query: "[zx.*]", limit: 1 }))
      expect(literal).toMatchObject({
        total: 3,
        order: "first_message_ascending",
        continuation: { archive_list: true },
      })
      expect(literal.references[0].first).toBe("msg_01")
      const next = page(yield* recall(f, { archive_query: "[zx.*]", match: "literal", offset: 1, limit: 1 }))
      expect(next).toMatchObject({ total: 3, offset: 1, next_offset: 2 })
      expect(next.references[0].first).toBe("msg_02")
      expect(next.references[0].score).toBeUndefined()
      const listed = page(yield* recall(f, { archive_list: true, offset: 1, limit: 1 }))
      expect(listed).toMatchObject({ total: 3, offset: 1, next_offset: 2 })
      expect(listed.references[0].id).toBe(next.references[0].id)
      const index = chunks[0].markdown.indexOf("😀")
      expect(index).toBeGreaterThan(0)
      const left = yield* recall(f, { reference: chunks[0].id, offset: index, limit: 1 })
      const right = yield* recall(f, { reference: chunks[0].id, offset: index + 1, limit: 1 })
      expect(left).toMatchObject({ status: "found", offset_unit: "utf16_code_units", next_offset: index + 1 })
      expect(String(left.content) + String(right.content)).toBe("😀")
    }),
  )
})
