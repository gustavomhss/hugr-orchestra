import { describe, expect } from "bun:test"
import { Cause, Effect, Exit, Layer, Schema } from "effect"
import { and, eq, sql } from "drizzle-orm"
import path from "node:path"
import { Research } from "@orchestra/schema/research"
import { SessionV1 } from "@orchestra/schema/session-v1"
import { Database } from "@orchestra/core/database/database"
import { EventV2 } from "@orchestra/core/event"
import { EventTable } from "@orchestra/core/event/sql"
import { ResearchRecords } from "@orchestra/core/research/records"
import { ResearchArtifacts } from "@orchestra/core/research/artifacts"
import { MessageTable } from "@orchestra/core/session/sql"
import { callFrame, researchFixture } from "./research-binding.test"
import { testEffect } from "./lib/effect"

const it = testEffect(Layer.empty)
const finding = {
  action: "finding", proposition: "Works only under stated condition", nature: "inference", conditions: ["Only version 1"], evidence: [], contrary: [],
} satisfies Research.RecordInput

describe("research durable records", () => {
  it.live("request preflight refuses unsettled/conflicting retries and returns only a settled historical source", () => researchFixture((fixture) =>
    Effect.gen(function* () {
      const records = yield* ResearchRecords.Service
      const hash = "a".repeat(64)
      expect(yield* callFrame(fixture.binding, fixture.context, records.beginAcquisition(fixture.binding, fixture.context, hash))).toBeUndefined()
      expect((yield* callFrame(fixture.binding, fixture.context, records.beginAcquisition(fixture.binding, fixture.context, hash)).pipe(Effect.flip)).code).toBe("publication_uncertain")
      expect((yield* callFrame(fixture.binding, fixture.context, records.beginAcquisition(fixture.binding, fixture.context, "b".repeat(64))).pipe(Effect.flip)).code).toBe("conflict")
      const captured = yield* callFrame(fixture.binding, fixture.context, records.capture(fixture.binding, fixture.context, {
        origin: { kind: "file", uri: "historical.txt" }, representation: "text", mediaType: "text/plain", content: "historical", complete: true,
      }))
      const settled = yield* callFrame(fixture.binding, fixture.context, records.attempt(fixture.binding, fixture.context, {
        outcome: "captured", stage: "representation", reason: "complete", source: captured.ref, returned: true,
      }))
      expect(yield* callFrame(fixture.binding, fixture.context, records.beginAcquisition(fixture.binding, fixture.context, hash))).toEqual(settled)
      const failed = yield* fixture.call()
      yield* callFrame(fixture.binding, failed, records.beginAcquisition(fixture.binding, failed, hash))
      yield* callFrame(fixture.binding, failed, records.attempt(fixture.binding, failed, {
        outcome: "unavailable", stage: "acquisition", reason: "http_status", returned: false,
      }))
      expect((yield* callFrame(fixture.binding, failed, records.beginAcquisition(fixture.binding, failed, hash)).pipe(Effect.flip)).code).toBe("source_unavailable")
    }),
  ))

  it.live("acquisition outcomes replay durably and remain distinct from admitted corpus bytes", () => researchFixture((fixture) =>
    Effect.gen(function* () {
      const records = yield* ResearchRecords.Service
      const failed = { outcome: "unavailable", stage: "acquisition", reason: "http_status" } as const
      const first = yield* callFrame(fixture.binding, fixture.context, records.attempt(fixture.binding, fixture.context, failed))
      expect(yield* callFrame(fixture.binding, fixture.context, records.attempt(fixture.binding, fixture.context, failed))).toEqual(first)
      expect((yield* callFrame(fixture.binding, fixture.context, records.attempt(fixture.binding, fixture.context, {
        ...failed, outcome: "captured",
      })).pipe(Effect.flip)).code).toBe("conflict")
      const attempts = yield* records.view(fixture.binding, { action: "attempts" })
      expect("attempts" in attempts && attempts.attempts).toEqual([first])
      expect(yield* records.view(fixture.binding, { action: "corpus" })).toEqual({ sources: [], records: [], documents: [], complete: true, total: 0 })
      const context = yield* fixture.call()
      const partial = yield* callFrame(fixture.binding, context, records.capture(fixture.binding, context, {
        origin: { kind: "file", uri: "slice.txt" }, representation: "text", mediaType: "text/plain", content: "one retained line",
        complete: false, observed: { byteStart: 10, lineStart: 4, lineEnd: 4 },
      }))
      expect((yield* records.view(fixture.binding, { action: "source", ref: partial.ref }))).toMatchObject({ text: "one retained line", complete: false })
      expect(yield* records.view(fixture.binding, { action: "corpus" })).toMatchObject({ sources: [partial], complete: true, total: 1 })
    }),
  ))

  it.live("snapshot compaction preserves corpus and source; a fresh native process reads exact persisted refs", () => researchFixture((fixture) =>
    Effect.gen(function* () {
      const records = yield* ResearchRecords.Service
      const database = yield* Database.Service
      const events = yield* EventV2.Service
      const source = yield* callFrame(fixture.binding, fixture.context, records.capture(fixture.binding, fixture.context, {
        origin: { kind: "file", uri: "restart.txt", revision: "v1" }, representation: "text", mediaType: "text/plain", content: "retained contrary", complete: true,
      }))
      const found = yield* callFrame(fixture.binding, fixture.context, records.record(fixture.binding, fixture.context, {
        ...finding, contrary: [{ source: source.ref, locator: { kind: "quote", exact: "retained contrary" } }],
      }))
      if (!found.record) throw new Error("Expected retained finding")
      const ref = { id: found.record.id, revision: 1 }
      const row = yield* database.db.select().from(MessageTable).where(sql`${MessageTable.id} = ${fixture.context.assistantMessageID}`).get().pipe(Effect.orDie)
      if (!row) throw new Error("Expected real assistant projection")
      const assistant = Schema.decodeUnknownSync(SessionV1.Assistant)(row.data)
      yield* events.publish(SessionV1.Event.MessageUpdated, { sessionID: fixture.binding.executionSessionID, info: assistant })
      yield* events.publish(SessionV1.Event.MessageUpdated, { sessionID: fixture.binding.executionSessionID, info: { ...assistant, time: { created: 1, completed: 2 } } })
      expect((yield* EventV2.compactSnapshotEvents(database.db)).removed).toBe(1)
      expect(yield* records.view(fixture.binding, { action: "record", ref })).toEqual(found.record)
      const script = `
        import { Effect, Schema } from "effect"
        import { Research } from "@orchestra/schema/research"
        import { Database } from "@orchestra/core/database/database"
        import { Global } from "@orchestra/core/global"
        import { EventV2 } from "@orchestra/core/event"
        import { AppNodeBuilder } from "@orchestra/core/effect/app-node-builder"
        import { LayerNode } from "@orchestra/core/effect/layer-node"
        import { ResearchRecords } from "@orchestra/core/research/records"
        import { ResearchArtifacts } from "@orchestra/core/research/artifacts"
        const binding = Schema.decodeUnknownSync(Schema.fromJsonString(Research.Binding))(process.env.RESEARCH_BINDING)
        const ref = Schema.decodeUnknownSync(Schema.fromJsonString(Research.RecordRef))(process.env.RESEARCH_RECORD)
        const source = Schema.decodeUnknownSync(Schema.fromJsonString(Research.SourceRef))(process.env.RESEARCH_SOURCE)
        const layer = AppNodeBuilder.build(LayerNode.group([ResearchRecords.node, ResearchArtifacts.node, Database.node, Global.node, EventV2.node]), [
          [Database.node, Database.layerFromPath(process.env.RESEARCH_DATABASE)],
          [Global.node, Global.layerWith({ data: process.env.RESEARCH_DATA })],
        ])
        const result = await Effect.runPromise(Effect.scoped(Effect.gen(function* () {
          const records = yield* ResearchRecords.Service
          const artifacts = yield* ResearchArtifacts.Service
          return { record: yield* records.view(binding, { action: "record", ref }), source: yield* artifacts.read(binding, source.artifact) }
        }).pipe(Effect.provide(layer))))
        process.stdout.write(JSON.stringify(result))
      `
      const child = yield* Effect.acquireRelease(Effect.sync(() => Bun.spawn([process.execPath, "-e", script], {
        cwd: path.dirname(import.meta.dir), stdout: "pipe", stderr: "pipe",
        env: { ...process.env, ORCHESTRA_DB: path.join(fixture.root, "native.db"),
          RESEARCH_BINDING: JSON.stringify(fixture.binding), RESEARCH_RECORD: JSON.stringify(ref),
          RESEARCH_SOURCE: JSON.stringify(source.ref), RESEARCH_DATABASE: path.join(fixture.root, "native.db"), RESEARCH_DATA: fixture.root },
      })), (child) => Effect.promise(async () => {
        if (child.exitCode === null) child.kill()
        await child.exited
      }))
      const stdout = yield* Effect.promise(() => new Response(child.stdout).text())
      const stderr = yield* Effect.promise(() => new Response(child.stderr).text())
      const status = yield* Effect.promise(() => child.exited)
      expect({ status, stderr }).toEqual({ status: 0, stderr: "" })
      const reopened = Schema.decodeUnknownSync(Schema.fromJsonString(Schema.Struct({ record: Research.Record, source: Research.ArtifactPage })))(stdout)
      expect(reopened.record).toEqual(found.record)
      expect(reopened.source.text).toBe("retained contrary")
      expect(reopened.source.receipt).toEqual(source)
    }),
  ))

  it.live("local message persist:false cannot disable research persistence; canonical identical replay returns actual receipt", () => researchFixture((fixture) =>
    Effect.gen(function* () {
      const records = yield* ResearchRecords.Service
      const events = yield* EventV2.Service
      const database = yield* Database.Service
      const local = yield* events.publish(SessionV1.Event.MessageRemoved, { sessionID: fixture.binding.executionSessionID, messageID: SessionV1.MessageID.ascending() }, { persist: false })
      expect(local.durable).toBeUndefined()
      const first = yield* callFrame(fixture.binding, fixture.context, records.record(fixture.binding, fixture.context, finding))
      const second = yield* callFrame(fixture.binding, fixture.context, records.record(fixture.binding, fixture.context, {
        contrary: [], evidence: [], conditions: ["Only version 1"], nature: "inference", proposition: finding.proposition, action: "finding",
      }))
      expect(second).toEqual(first)
      expect(first.record?.revision).toBe(1)
      if (!first.record) throw new Error("Expected admitted record")
      const rows = yield* database.db.select().from(EventTable).where(and(
        eq(EventTable.aggregate_id, fixture.binding.executionSessionID), eq(EventTable.type, "research.record.committed.1"),
      )).all().pipe(Effect.orDie)
      expect(rows).toHaveLength(1)
      expect(String(rows[0].id)).toBe(first.receipt.eventID)
      expect((yield* callFrame(fixture.binding, fixture.context, records.record(fixture.binding, fixture.context, { ...finding, proposition: "Conflicting reuse" })).pipe(Effect.flip)).code).toBe("conflict")
      const restored = yield* records.view(fixture.binding, { action: "record", ref: { id: first.record.id, revision: first.record.revision } })
      expect(restored).toEqual(first.record)
    }),
  ))

  it.live("two writers cannot publish same next revision; historical wording and exact relations survive", () => researchFixture((fixture) =>
    Effect.gen(function* () {
      const records = yield* ResearchRecords.Service
      const original = yield* callFrame(fixture.binding, fixture.context, records.record(fixture.binding, fixture.context, finding))
      if (original.record?.kind !== "finding") throw new Error("Expected admitted finding")
      const ref = { id: original.record.id, revision: original.record.revision }
      const update: Research.RecordInput = { ...finding, id: original.record.id, baseRevision: 1, reason: "Observed narrower scope", proposition: "Only version 1, feature enabled" }
      const contexts = yield* Effect.all([fixture.call(), fixture.call()])
      const outcomes = yield* Effect.all(contexts.map((context) => callFrame(fixture.binding, context, records.record(fixture.binding, context, update)).pipe(Effect.exit)), { concurrency: "unbounded" })
      expect(outcomes.filter(Exit.isSuccess)).toHaveLength(1)
      const failures = outcomes.filter(Exit.isFailure)
      expect(failures).toHaveLength(1)
      expect(failures[0].cause.reasons.some((reason) => {
        const error = Cause.isFailReason(reason) ? reason.error : Cause.isDieReason(reason) ? reason.defect : undefined
        return error instanceof Research.Error && error.code === "conflict"
      })).toBe(true)
      expect(yield* records.view(fixture.binding, { action: "record", ref })).toEqual(original.record)
      const revised = yield* records.view(fixture.binding, { action: "record", ref: { id: original.record.id, revision: 2 } })
      expect(revised).toMatchObject({ revision: 2, proposition: "Only version 1, feature enabled", reason: "Observed narrower scope" })
      const context = yield* fixture.call()
      const relation = yield* callFrame(fixture.binding, context, records.record(fixture.binding, context, {
        action: "relation", from: ref, to: { id: original.record.id, revision: 2 }, relation: "related", reason: "Historical narrowing",
      }))
      expect(relation.record).toMatchObject({ from: original.receipt.ref, to: { id: original.record.id, revision: 2 } })
      const missing = yield* fixture.call()
      expect((yield* callFrame(fixture.binding, missing, records.record(fixture.binding, missing, {
        action: "relation", from: ref, to: { id: Research.FindingID.create(), revision: 1 }, relation: "supports", reason: "Must not invent endpoint",
      })).pipe(Effect.flip)).code).toBe("reference_invalid")
    }),
  ))

  it.live("quotes detect overlapping ambiguity; exact qualifiers and line/JSON locators resolve only admitted bytes", () => researchFixture((fixture) =>
    Effect.gen(function* () {
      const records = yield* ResearchRecords.Service
      const source = yield* callFrame(fixture.binding, fixture.context, records.capture(fixture.binding, fixture.context, {
        origin: { kind: "file", uri: "quotes.txt", revision: "observed" }, representation: "text", mediaType: "text/plain", content: "aaa\nonly version 1\n", complete: true,
      }))
      const ambiguous = yield* fixture.call()
      expect((yield* callFrame(fixture.binding, ambiguous, records.record(fixture.binding, ambiguous, {
        ...finding, evidence: [{ source: source.ref, locator: { kind: "quote", exact: "aa" } }],
      })).pipe(Effect.flip)).code).toBe("locator_ambiguous")
      const valid = yield* fixture.call()
      const admitted = yield* callFrame(fixture.binding, valid, records.record(fixture.binding, valid, {
        ...finding, evidence: [{ source: source.ref, locator: { kind: "quote", exact: "aa", suffix: "a\n" } }, { source: source.ref, locator: { kind: "lines", start: 2, end: 2 } }],
      }))
      expect(admitted.record?.kind).toBe("finding")
      const wrong = yield* fixture.call()
      expect((yield* callFrame(fixture.binding, wrong, records.record(fixture.binding, wrong, {
        ...finding, evidence: [{ source: { ...source.ref, digest: "0".repeat(64) }, locator: { kind: "lines", start: 1, end: 1 } }],
      })).pipe(Effect.flip)).code).toBe("reference_invalid")
      const jsonContext = yield* fixture.call()
      const json = yield* callFrame(fixture.binding, jsonContext, records.capture(fixture.binding, jsonContext, {
        origin: { kind: "tool-output", uri: `native:${jsonContext.toolCallID}` }, representation: "structured-json", mediaType: "application/json", content: '{"a/b":{"~key":false}}', complete: true,
      }))
      const located = yield* fixture.call()
      expect((yield* callFrame(fixture.binding, located, records.record(fixture.binding, located, {
        ...finding, evidence: [{ source: json.ref, locator: { kind: "json", pointer: "/a~1b/~0key" } }],
      }))).record?.kind).toBe("finding")
      const missing = yield* fixture.call()
      expect((yield* callFrame(fixture.binding, missing, records.record(fixture.binding, missing, {
        ...finding, evidence: [{ source: json.ref, locator: { kind: "json", pointer: "/a~1b/missing" } }],
      })).pipe(Effect.flip)).code).toBe("reference_invalid")
    }),
  ))

  it.live("document keeps exact Markdown/body receipt; parser rejects unknown live citations and ignores fenced examples", () => researchFixture((fixture) =>
    Effect.gen(function* () {
      const records = yield* ResearchRecords.Service
      const artifacts = yield* ResearchArtifacts.Service
      const source = yield* callFrame(fixture.binding, fixture.context, records.capture(fixture.binding, fixture.context, {
        origin: { kind: "url", uri: "https://fixture.invalid/official-v1" }, representation: "text", mediaType: "text/plain", content: "Only version 1.", complete: true,
      }))
      const document = {
        genre: "answer", title: "Bounded answer", body: "Works only in version 1 [official](research:official).\n\n```md\n[example](research:unknown)\n```",
        findingRefs: [], citations: { official: { source: source.ref, locator: { kind: "quote", exact: "Only version 1." } } },
      } satisfies Research.DocumentInput
      const context = yield* fixture.call()
      const published = yield* callFrame(fixture.binding, context, records.record(fixture.binding, context, { action: "document", document }))
      if (!published.document) throw new Error("Expected native document receipt")
      const page = yield* artifacts.read(fixture.binding, published.document.artifact)
      expect(page.text).toBe(document.body)
      expect(page.receipt).toEqual(published.document)
      expect(published.document.bytes).toBe(Buffer.byteLength(document.body))
      expect(yield* callFrame(fixture.binding, context, records.record(fixture.binding, context, { action: "document", document }))).toEqual(published)
      const bad = yield* fixture.call()
      expect((yield* callFrame(fixture.binding, bad, records.record(fixture.binding, bad, {
        action: "document", document: { ...document, body: "Unknown [source](research:missing)." },
      })).pipe(Effect.flip)).code).toBe("reference_invalid")
      const table = yield* fixture.call()
      expect((yield* callFrame(fixture.binding, table, records.record(fixture.binding, table, {
        action: "document", document: { ...document, body: "| Claim | Evidence |\n|---|---|\n| bound | [wrong](research:missing) |" },
      })).pipe(Effect.flip)).code).toBe("reference_invalid")
    }),
  ))

  it.live("UTF-8 field/document/event caps reject before invocation or file/event effects", () => researchFixture((fixture) =>
    Effect.gen(function* () {
      const records = yield* ResearchRecords.Service
      const database = yield* Database.Service
      const before = yield* database.db.select().from(EventTable).where(eq(EventTable.aggregate_id, fixture.binding.executionSessionID)).all().pipe(Effect.orDie)
      expect((yield* records.record(fixture.binding, fixture.context, { ...finding, proposition: "😀".repeat(2049) }).pipe(Effect.flip)).code).toBe("over_cap")
      expect((yield* records.record(fixture.binding, fixture.context, { action: "document", document: {
        genre: "answer", title: "Too big", body: "😀".repeat(65537), findingRefs: [], citations: {},
      } }).pipe(Effect.flip)).code).toBe("over_cap")
      expect((yield* records.record(fixture.binding, fixture.context, { ...finding, conditions: Array.from({ length: 32 }, () => "x".repeat(4096)) }).pipe(Effect.flip)).code).toBe("over_cap")
      const after = yield* database.db.select().from(EventTable).where(eq(EventTable.aggregate_id, fixture.binding.executionSessionID)).all().pipe(Effect.orDie)
      expect(after.map((row) => row.id)).toEqual(before.map((row) => row.id))
      // Positive control proves this native writer admits an in-bound mutation through the same fixtures.
      const accepted = yield* callFrame(fixture.binding, fixture.context, records.record(fixture.binding, fixture.context, finding))
      expect(accepted.record?.kind).toBe("finding")
    }),
  ))
})
