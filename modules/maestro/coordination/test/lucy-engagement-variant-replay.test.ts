import { expect, test } from "bun:test"
import fs from "node:fs/promises"
import path from "node:path"
import { eq } from "drizzle-orm"
import { Effect, Schema } from "effect"
import { CapabilityArtifacts } from "@orchestra/core/capability/artifact/index"
import { Database } from "@orchestra/core/database/database"
import { AppNodeBuilder } from "@orchestra/core/effect/app-node-builder"
import { FSUtil } from "@orchestra/core/fs-util"
import { Global } from "@orchestra/core/global"
import { SessionSchema } from "@orchestra/core/session"
import { SessionInputTable, SessionTable } from "@orchestra/core/session/sql"
import { expectSpawn } from "@orchestra/core/test/fixture/omni-expect"
import { run, sourcePath, type Ctx, type Fixture } from "./fixture/lucy-engagement"
import { blobRoot, cache, canonical, codeStream, decoded, digest, manifest, nativeCode, reader,
  readAll, receipt, ReceiptV1, ReceiptV2, refused, request, type Report } from "./fixture/lucy-engagement-artifacts"
import { StateV1, StateV2, StateV3 } from "./fixture/lucy-variant-schema"
import { fullSearch, nativeSearches, nativeSearchResult, variantScript } from "./fixture/lucy-variants"

const strict = { onExcessProperty: "error" } as const

test("a real variant receipt rejects inconsistent journal, seed, counts and native attempt after canonical bytes are republished", () => {
  expectSpawn(import.meta.path)
  return Effect.runPromise(run((root) => {
    const provider = variantScript()
    return root.open((host) => Effect.gen(function* () {
      const input = request("variant-semantic-replay")
      const output = yield* host.invoke(input)
      const report = decoded(output)
      expect(report.status).toBe("completed")
      expect(report.report?.findings).toHaveLength(1)
      expect(report.citations.some((item) => item.path === sourcePath && item.startLine === 1)).toBe(true)
      const original = yield* receipt(host, report)
      expect(original.value.schema, "new completed requests need the variants receipt, not an unchanged legacy receipt").toBe("review-engagement-evidence-v2")
      if (original.value.schema !== "review-engagement-evidence-v2") return yield* Effect.die("new variants receipt missing")
      expect(original.value.variants.stop).toBe("no-new-matches")
      expect(original.value.variants.generations).toHaveLength(1)
      expect(provider.proposals).toHaveLength(1)
      const generation = original.value.variants.generations[0]
      if (!generation || generation.search.status !== "accepted") return yield* Effect.die("accepted original search missing")
      expect(generation.search.counts).toEqual({ matches: 0, confirmed: 0, noise: 0, questions: 0, notExamined: 0 })
      expect(generation.attempts).toHaveLength(1)
      const attempt = generation.attempts[0]
      if (!attempt) return yield* Effect.die("actual native attempt missing")
      const actual = yield* nativeSearches(host, attempt.sessionID)
      expect(actual).toHaveLength(1)
      if (!actual[0]) return yield* Effect.die("actual native search missing")
      expect(attempt.assistantMessageID).toBe(actual[0].assistantMessageID)
      expect(attempt.toolCallID).toBe(actual[0].toolCallID)
      expect(nativeSearchResult(actual[0]).result.matches.map((match) => [match.path, match.line])).toEqual([[sourcePath, 1]])
      const held = yield* saved(host, report.sessionID)
      expect(held.raw.schema).toBe("review-engagement-state-v3")
      const state = Schema.decodeUnknownSync(StateV3)(held.raw, strict)
      expect(state.variants.phase).toBe("closed")
      expect(state.variants.reservations).toHaveLength(1)
      const reservation = state.variants.reservations[0]
      if (!reservation || reservation.status !== "settled") return yield* Effect.die("settled reservation missing")
      expect(reservation.settlement.sha256).toBe(digest(canonical(generation)))
      expect(reservation.settlement.counts).toEqual(generation.search.counts)
      const before = yield* host.db.select().from(SessionInputTable).all().pipe(Effect.orDie)
      const calls = root.requests.length
      const restore = host.db.update(SessionTable).set({ metadata: held.row.metadata })
        .where(eq(SessionTable.id, report.sessionID)).run().pipe(Effect.orDie)

      const changedHash = reservation.settlement.sha256 === "0".repeat(64) ? "1".repeat(64) : "0".repeat(64)
      const wrongJournal = Schema.decodeUnknownSync(StateV3)({ ...state, variants: { ...state.variants,
        reservations: [{ ...reservation, settlement: { ...reservation.settlement, sha256: changedHash } }],
      } }, strict)
      yield* rejectMetadata(host, input, report, { ...held.row.metadata, lucyEngagementV1: wrongJournal }).pipe(Effect.ensuring(restore))
      expect((yield* host.invoke(input)).text).toBe(output.text)

      const foreignReply = original.value.variants.replies.find((reply) => reply.role === "verifier")
      if (!foreignReply) return yield* Effect.die("actual initial verifier reply missing")
      expect(foreignReply.sessionID).not.toBe(attempt.sessionID)
      const mutations = [
        { label: "counts", variants: { ...original.value.variants, generations: [{ ...generation,
          search: { ...generation.search, counts: { ...generation.search.counts, matches: 1 } },
        }] } },
        { label: "seed", variants: { ...original.value.variants, seeds: original.value.variants.seeds.map((seed, index) => index === 0
          ? { ...seed, finding: { ...seed.finding, trigger: seed.finding.trigger + " FORGED-SEED" } } : seed) } },
        { label: "native attempt", variants: { ...original.value.variants, generations: [{ ...generation,
          attempts: [{ ...attempt, assistantMessageID: foreignReply.assistantMessageID }],
        }] } },
      ]
      for (const mutation of mutations) {
        const changed = Schema.decodeUnknownSync(ReceiptV2)({ ...original.value, variants: mutation.variants }, strict)
        const updated = changed.variants.generations[0]
        if (!updated || updated.search.status !== "accepted") return yield* Effect.die("mutation lost the accepted search shape")
        const body = Buffer.from(canonical(changed))
        const reference = yield* publish(root, host, body)
        expect(reference.receiptID, mutation.label).not.toBe(original.index.receiptID)
        // Keep the outer hash and durable settlement self-consistent: refusal must inspect the underlying proof.
        const altered = Schema.decodeUnknownSync(StateV3)({ ...state,
          evidence: { policy: "required-completed-v1", ...reference },
          variants: { ...state.variants, reservations: [{ ...reservation, settlement: {
            sha256: digest(canonical(updated)), decision: updated.decision, counts: updated.search.counts,
          } }] },
        }, strict)
        yield* rejectMetadata(host, input, report, { ...held.row.metadata, lucyEngagementV1: altered }).pipe(Effect.ensuring(restore))
        expect((yield* host.invoke(input)).text, mutation.label).toBe(output.text)
        const replayed = yield* receipt(host, report)
        expect(replayed.index).toEqual(original.index)
        expect(replayed.bytes).toEqual(original.bytes)
        expect([...replayed.bodies]).toEqual([...original.bodies])
        expect(root.requests.length).toBe(calls)
        expect(yield* host.db.select().from(SessionInputTable).all().pipe(Effect.orDie)).toEqual(before)
      }
      expect(canonical((yield* saved(host, report.sessionID)).row.metadata)).toBe(canonical(held.row.metadata))
      expect((yield* host.execution.active).size).toBe(0)
    }), { stream: provider.stream })
  }))
}, 150_000)

for (const version of ["v1", "v2"] as const) {
  test(`constructed strict delivered-format state-${version} replays immutable diligence bytes and real producer bodies without variants`, () => {
    expectSpawn(import.meta.path)
    return Effect.runPromise(run((root) => Effect.gen(function* () {
      const input = request(`variant-legacy-${version}`, "diligence")
      const provider = codeStream({ calls: [{ name: "code_search", input: fullSearch() }] })
      const original = yield* root.open((host) => Effect.gen(function* () {
        const output = yield* host.invoke(input)
        const report = decoded(output)
        expect(report.status).toBe("completed")
        expect(report.report?.profile).toBe("diligence")
        expect(report.report?.findings).toHaveLength(1)
        const native = yield* nativeCode(host, report.sessionID)
        expect(native).toHaveLength(1)
        expect(native[0]).toMatchObject({ name: "code_search", status: "completed" })
        expect(native[0]?.providerExecuted).not.toBe(true)
        const evidence = yield* receipt(host, report)
        expect(evidence.value.artifacts.some((item) => item.kind === "code-result")).toBe(true)
        expect(evidence.value.artifacts.some((item) => item.kind === "analysis-result")).toBe(true)
        expect(evidence.value.artifacts.some((item) => item.kind === "citation")).toBe(true)
        if (evidence.value.schema === "review-engagement-evidence-v2") {
          expect(evidence.value.variants.limit).toBe(0)
          expect(evidence.value.variants.stop).toBe("not-applicable")
          expect(evidence.value.variants.generations).toEqual([])
        }
        const legacyReceipt = Schema.decodeUnknownSync(ReceiptV1)(legacyBody(evidence.value), strict)
        expect(Object.hasOwn(legacyReceipt, "variants")).toBe(false)
        const body = Buffer.from(canonical(legacyReceipt))
        const reference = yield* publish(root, host, body)
        expect(reference.receiptID).toBe(digest(body))
        const held = yield* saved(host, report.sessionID)
        const { schema, variants, ...common } = held.raw
        expect(schema === "review-engagement-state-v2" || schema === "review-engagement-state-v3").toBe(true)
        if (schema === "review-engagement-state-v3") expect(variants).toBeDefined()
        const deliveredV2 = Schema.decodeUnknownSync(StateV2)({ ...common, schema: "review-engagement-state-v2",
          evidence: { policy: "required-completed-v1", ...reference },
        }, strict)
        expect(deliveredV2.output).toBe(output.text)
        expect(Object.hasOwn(deliveredV2, "variants")).toBe(false)
        const legacy = historicalState(deliveredV2, version)
        expect(legacy.output).toBe(output.text)
        expect(legacy.source).toEqual(deliveredV2.source)
        expect(legacy.source).toBeDefined()
        expect(legacy.budget).toEqual(deliveredV2.budget)
        expect(legacy.children).toEqual(deliveredV2.children)
        const metadata = { ...held.row.metadata, variantLegacyFixture: { keep: true }, lucyEngagementV1: legacy }
        yield* host.db.update(SessionTable).set({ metadata }).where(eq(SessionTable.id, report.sessionID)).run().pipe(Effect.orDie)
        // This is newly constructed historical-format data, not a claim that an old executable produced it.
        const frozen = { metadata: canonical(metadata), report: output.text, receipt: body,
          operations: canonical(legacyReceipt.operations), source: canonical(legacy.source), model: canonical(legacy.model ?? null) }
        const index = version === "v2" ? (yield* manifest(host, report.reportID)).value : undefined
        const pages = index ? canonical((yield* readAll(host, index, index.manifest)).pages) : undefined
        if (index) {
          expect(index.receiptID).toBe(reference.receiptID)
          const verified = yield* receipt(host, report)
          expect(verified.value.schema).toBe("review-engagement-evidence-v1")
          expect(verified.bytes).toEqual(frozen.receipt)
          expect([...verified.bodies]).toEqual([...evidence.bodies])
        } else {
          const unavailable = yield* host.call(reader, { op: "manifest", reportID: report.reportID })
          refused(unavailable, "engagement-evidence-unavailable")
          expect(unavailable.text).toContain("legacy-record")
        }
        return { report, frozen, index, pages, bodies: evidence.bodies, calls: root.requests.length, temporary: cache(host, input) }
      }), { stream: provider.stream })
      yield* Effect.promise(async () => {
        await fs.rm(original.temporary, { recursive: true, force: true })
        await fs.writeFile(path.join(root.directory, sourcePath), 'export const sharedValue = "AFTER-LEGACY-FREEZE"\n')
      })
      yield* root.git("add", "--", sourcePath)
      yield* root.git("commit", "-q", "-m", `move-after-constructed-${version}`)
      expect(yield* root.git("rev-parse", "HEAD")).not.toBe(original.report.source?.commit)
      let gitCalls = 0
      yield* root.open((host) => Effect.gen(function* () {
        const before = gitCalls
        const admitted = yield* host.db.select().from(SessionInputTable).all().pipe(Effect.orDie)
        const replayed = yield* host.invoke(input)
        expect(replayed.text).toBe(original.frozen.report)
        const report = decoded(replayed)
        expect(report).toEqual(original.report)
        const current = yield* saved(host, report.sessionID)
        expect(canonical(current.row.metadata)).toBe(original.frozen.metadata)
        expect(current.raw.schema).toBe(`review-engagement-state-${version}`)
        expect(Object.hasOwn(current.raw, "variants")).toBe(false)
        const checked = version === "v1" ? Schema.decodeUnknownSync(StateV1)(current.raw, strict) : Schema.decodeUnknownSync(StateV2)(current.raw, strict)
        expect(canonical(checked.source)).toBe(original.frozen.source)
        expect(canonical(checked.model ?? null)).toBe(original.frozen.model)
        if (version === "v2") {
          if (!original.index) return yield* Effect.die("frozen legacy index missing")
          const evidence = yield* receipt(host, report)
          expect(evidence.value.schema).toBe("review-engagement-evidence-v1")
          expect(evidence.bytes).toEqual(original.frozen.receipt)
          expect(evidence.index).toEqual(original.index)
          expect(canonical((yield* readAll(host, evidence.index, evidence.index.manifest)).pages)).toBe(original.pages)
          expect(canonical(evidence.value.operations)).toBe(original.frozen.operations)
          expect([...evidence.bodies]).toEqual([...original.bodies])
        } else {
          const unavailable = yield* host.call(reader, { op: "manifest", reportID: report.reportID })
          refused(unavailable, "engagement-evidence-unavailable")
          expect(unavailable.text).toContain("legacy-record")
          expect(Object.hasOwn(current.raw, "evidence")).toBe(false)
        }
        expect(root.requests.length).toBe(original.calls)
        expect(gitCalls).toBe(before)
        expect((yield* host.execution.active).size).toBe(0)
        expect(yield* host.db.select().from(SessionInputTable).all().pipe(Effect.orDie)).toEqual(admitted)
        expect(yield* Effect.promise(() => fs.stat(original.temporary).then(() => true, () => false))).toBe(false)
      }), { stream: provider.stream, onGit: () => { gitCalls++ } })
    })))
  }, 150_000)
}

function saved(host: Ctx, sessionID: SessionSchema.ID) {
  return Effect.gen(function* () {
    const row = yield* host.db.select().from(SessionTable).where(eq(SessionTable.id, sessionID)).get().pipe(Effect.orDie)
    const raw = row?.metadata?.lucyEngagementV1
    if (!row || !raw || typeof raw !== "object" || Array.isArray(raw)) return yield* Effect.die("native engagement record missing")
    return { row, raw: Object.fromEntries(Object.entries(raw)) }
  })
}

function publish(root: Fixture, host: Ctx, bytes: Uint8Array) {
  return Effect.gen(function* () {
    const storage = yield* CapabilityArtifacts.storage({ root: blobRoot(root, host), boundedBytes: 16 * 1024 * 1024, quota: 64 * 1024 * 1024 }).pipe(
      Effect.provideService(Database.Service, host.database), Effect.provideService(Global.Service, root.global), Effect.orDie,
    )
    const receiptID = yield* storage.blobs.publish(bytes, "application/json").pipe(Effect.orDie)
    return { receiptID, bytes: bytes.byteLength }
  }).pipe(Effect.provide(AppNodeBuilder.build(FSUtil.node)))
}

function rejectMetadata(host: Ctx, input: unknown, report: Report, metadata: (typeof SessionTable.$inferSelect)["metadata"]) {
  return Effect.gen(function* () {
    yield* host.db.update(SessionTable).set({ metadata }).where(eq(SessionTable.id, report.sessionID)).run().pipe(Effect.orDie)
    refused(yield* host.call(reader, { op: "manifest", reportID: report.reportID }), "engagement-evidence-corrupt")
    refused(yield* host.invoke(input), "engagement-evidence-corrupt")
    expect(canonical((yield* saved(host, report.sessionID)).row.metadata)).toBe(canonical(metadata))
  })
}

function legacyBody(value: ReceiptV1 | ReceiptV2) {
  if (value.schema === "review-engagement-evidence-v1") return value
  const { variants, ...common } = value
  expect(variants.generations).toEqual([])
  return { ...common, schema: "review-engagement-evidence-v1" }
}

function historicalState(value: StateV2, version: "v1" | "v2") {
  if (version === "v2") return value
  const { evidence, ...common } = value
  expect(evidence?.receiptID).toBeDefined()
  return Schema.decodeUnknownSync(StateV1)({ ...common, schema: "review-engagement-state-v1",
    ...(value.model && value.model.variant === undefined ? { model: { ...value.model, variant: "default" } } : {}),
  }, strict)
}
