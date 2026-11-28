import { expect, test } from "bun:test"
import { eq } from "drizzle-orm"
import { Effect, Schema } from "effect"
import { AgentV2 } from "@orchestra/core/agent"
import { ModelV2 } from "@orchestra/core/model"
import { ModelExecutionOptions } from "@orchestra/core/model-execution-options"
import { SessionSchema } from "@orchestra/core/session"
import { SessionInputTable, SessionTable } from "@orchestra/core/session/sql"
import { expectSpawn } from "@orchestra/core/test/fixture/omni-expect"
import { ReviewEngagementStoreV2 } from "../src/v2/tools/review-engagement-store"
import { ReviewEngagementPolicyV2 } from "../src/v2/workflow/review-engagement-policy"
import { reply, run, sourcePath, sourceText, text, type Controls, type Ctx } from "./fixture/lucy-engagement"
import { decoded, reader, receipt, refused, request } from "./fixture/lucy-engagement-artifacts"
import { StateV1 } from "./fixture/lucy-variant-schema"

const quoted: Controls = { stream: (log, modelRequest) => text(reply(log, modelRequest, { quote: true })) }
const Admission = Schema.Struct({
  schema: Schema.String, model: Schema.optional(ModelV2.Ref), state: Schema.String, output: Schema.String,
  children: Schema.Array(Schema.Struct({ id: SessionSchema.ID, key: Schema.String, role: Schema.String })),
})

const saved = (host: Ctx, sessionID: SessionSchema.ID) => Effect.gen(function* () {
  const row = yield* host.db.select().from(SessionTable).where(eq(SessionTable.id, sessionID)).get().pipe(Effect.orDie)
  const value = row?.metadata?.lucyEngagementV1
  if (!row || value === null || typeof value !== "object" || Array.isArray(value))
    return yield* Effect.die("completed native admission is missing")
  const raw = Object.fromEntries(Object.entries(value))
  return { row, raw, value: Schema.decodeUnknownSync(Admission)(raw) }
})

const owned = (host: Ctx, sessionID: SessionSchema.ID, expected: ModelV2.Ref) => Effect.gen(function* () {
  const record = yield* saved(host, sessionID)
  expect(record.value.schema).toBe("review-engagement-state-v3")
  expect(record.value.state).toBe("terminal")
  expect(record.value.children.map((child) => child.role)).toContain("lead")
  expect(record.value.children.map((child) => child.role)).toContain("lens")
  expect(record.value.children.map((child) => child.role)).toContain("verifier")
  for (const child of record.value.children) {
    const native = yield* host.sessions.get(child.id)
    const row = yield* host.db.select().from(SessionTable).where(eq(SessionTable.id, child.id)).get().pipe(Effect.orDie)
    expect(native.model).toEqual(expected)
    expect(row?.model).toEqual(expected)
    expect(Object.hasOwn(native.model ?? {}, "variant")).toBe(Object.hasOwn(expected, "variant"))
    expect((yield* host.sessions.context(child.id)).length).toBeGreaterThan(0)
  }
  // The native propagation above already works. The lossy admission projection is the regression.
  expect(record.value.model).toEqual(expected)
  expect(Object.hasOwn(record.value.model ?? {}, "variant")).toBe(Object.hasOwn(expected, "variant"))
  return record
})

for (const variant of [undefined, "default"] as const) {
  test(`new engagement preserves ${variant === undefined ? "absent variant" : "literal default"} through native ownership and reopened replay`, () => {
    expectSpawn(import.meta.path)
    return Effect.runPromise(run((root) => Effect.gen(function* () {
      const input = Schema.decodeUnknownSync(ReviewEngagementPolicyV2.Input)(request(`model-${variant ?? "absent"}`, "diligence"))
      const original = yield* root.open((host) => Effect.gen(function* () {
        if (!host.parent.model) return yield* Effect.die("fixture parent has no model")
        const expected = { id: host.parent.model.id, providerID: host.parent.model.providerID,
          ...(variant === undefined ? {} : { variant: ModelV2.VariantID.make(variant) }) }
        yield* host.sessions.switchModel({ sessionID: host.parent.id, model: expected })
        const parent = yield* host.sessions.get(host.parent.id)
        expect(parent.model).toEqual(expected)
        expect(Object.hasOwn(parent.model ?? {}, "variant")).toBe(variant !== undefined)

        // This calls the real selector; the fixture's fixed runner model is not a model-resolution proof.
        const catalog = ModelV2.Info.make({ ...ModelV2.Info.empty(expected.providerID, expected.id),
          request: { headers: {}, body: {}, variant: "preferred" }, variants: [
            { id: ModelV2.VariantID.make("preferred"), headers: { "x-selection": "preferred" }, body: {} },
            { id: ModelV2.VariantID.make("default"), headers: { "x-selection": "literal-default" }, body: {} },
          ] })
        const selected = yield* ModelExecutionOptions.selectVariant(catalog, parent.model?.variant)
        expect(selected.variant?.id).toBe(ModelV2.VariantID.make(variant ?? "preferred"))
        expect(selected.model.request.headers["x-selection"]).toBe(variant === undefined ? "preferred" : "literal-default")
        const unavailable = yield* ModelExecutionOptions.selectVariant({ ...catalog,
          variants: catalog.variants.filter((entry) => entry.id !== "default") }, ModelV2.VariantID.make("default"))
          .pipe(Effect.match({ onSuccess: () => undefined, onFailure: (error) => error }))
        expect(unavailable).toBeInstanceOf(ModelExecutionOptions.VariantUnavailableError)
        expect(unavailable?.variant).toBe(ModelV2.VariantID.make("default"))

        const identity = ReviewEngagementStoreV2.identity(parent, input)
        const lead = yield* host.sessions.create({ id: identity.leadID, parentID: parent.id,
          agent: AgentV2.ID.make("lucy"), model: expected, location: parent.location })
        expect(lead.model).toEqual(expected)
        expect(yield* host.sessions.context(lead.id)).toEqual([])
        const output = yield* host.invoke(input)
        const report = decoded(output)
        expect(report.status).toBe("completed")
        expect(report.sessionID).toBe(lead.id)
        expect(report.source?.commit).toBe(root.head)
        expect(report.source?.files.map((file) => file.path)).toEqual([sourcePath])
        expect(report.budget.deadlineAt - report.budget.startedAt).toBe(5 * 60_000)
        expect(report.report?.findings).toHaveLength(1)
        expect(report.citations.some((citation) => citation.text === sourceText.trimEnd())).toBe(true)
        const evidence = yield* receipt(host, report)
        expect(root.requests.length).toBeGreaterThan(0)
        const record = yield* owned(host, report.sessionID, expected)
        expect(record.value.output).toBe(output.text)
        return { output, report, evidence, expected, metadata: record.row.metadata, calls: root.requests.length }
      }), quoted)

      let captureCalls = 0
      yield* root.open((host) => Effect.gen(function* () {
        const changed = { ...original.expected, variant: ModelV2.VariantID.make("later-selection") }
        yield* host.sessions.switchModel({ sessionID: host.parent.id, model: changed })
        expect((yield* host.sessions.get(host.parent.id)).model).toEqual(changed)
        const inputs = yield* host.db.select().from(SessionInputTable).all().pipe(Effect.orDie)
        const sessions = yield* host.db.select({ id: SessionTable.id }).from(SessionTable).all().pipe(Effect.orDie)
        const before = captureCalls
        const replay = yield* host.invoke(input)
        expect(replay.text).toBe(original.output.text)
        expect(decoded(replay)).toEqual(original.report)
        const evidence = yield* receipt(host, original.report)
        expect(evidence.index).toEqual(original.evidence.index)
        expect(evidence.bytes).toEqual(original.evidence.bytes)
        expect(evidence.bodies).toEqual(original.evidence.bodies)
        expect(root.requests.length).toBe(original.calls)
        expect(captureCalls).toBe(before)
        expect(yield* host.db.select().from(SessionInputTable).all().pipe(Effect.orDie)).toEqual(inputs)
        expect(yield* host.db.select({ id: SessionTable.id }).from(SessionTable).all().pipe(Effect.orDie)).toEqual(sessions)
        expect((yield* owned(host, original.report.sessionID, original.expected)).row.metadata).toEqual(original.metadata)
      }), { ...quoted, onGit: () => { captureCalls++ } })
    })))
  }, 150_000)

  test(`a pristine deterministic lead cannot substitute ${variant === undefined ? "literal default for absence" : "absence for literal default"}`, () => {
    expectSpawn(import.meta.path)
    return Effect.runPromise(run((root) => {
      let gitCalls = 0
      return root.open((host) => Effect.gen(function* () {
        if (!host.parent.model) return yield* Effect.die("fixture parent has no model")
        const base = { id: host.parent.model.id, providerID: host.parent.model.providerID }
        const expected = { ...base, ...(variant === undefined ? {} : { variant: ModelV2.VariantID.make(variant) }) }
        yield* host.sessions.switchModel({ sessionID: host.parent.id, model: expected })
        const parent = yield* host.sessions.get(host.parent.id)
        const input = Schema.decodeUnknownSync(ReviewEngagementPolicyV2.Input)(request(`collision-${variant ?? "absent"}`, "diligence"))
        const identity = ReviewEngagementStoreV2.identity(parent, input)
        const wrong = { ...base, ...(variant === undefined ? { variant: ModelV2.VariantID.make("default") } : {}) }
        const lead = yield* host.sessions.create({ id: identity.leadID, parentID: parent.id,
          agent: AgentV2.ID.make("lucy"), model: wrong, location: parent.location })
        expect(lead).toMatchObject({ id: identity.leadID, parentID: parent.id, projectID: parent.projectID,
          agent: "lucy", location: parent.location, model: wrong })
        expect(lead.model).not.toEqual(expected)
        expect(yield* host.sessions.context(lead.id)).toEqual([])
        expect(yield* host.db.select().from(SessionInputTable).all().pipe(Effect.orDie)).toEqual([])
        expect((yield* host.db.select().from(SessionTable).where(eq(SessionTable.id, lead.id)).get().pipe(Effect.orDie))
          ?.metadata?.lucyEngagementV1).toBeUndefined()
        expect(root.requests).toEqual([])
        const before = gitCalls
        refused(yield* host.invoke(input), "engagement-record-invalid")
        expect(gitCalls).toBe(before)
        expect(root.requests).toEqual([])
        expect(yield* host.sessions.context(lead.id)).toEqual([])
        expect(yield* host.db.select().from(SessionInputTable).all().pipe(Effect.orDie)).toEqual([])
        expect((yield* host.db.select().from(SessionTable).where(eq(SessionTable.id, lead.id)).get().pipe(Effect.orDie))
          ?.metadata?.lucyEngagementV1).toBeUndefined()
        expect((yield* host.sessions.get(lead.id)).model).toEqual(wrong)
      }), { ...quoted, onGit: () => { gitCalls++ } })
    }))
  }, 150_000)
}

test("a completed v2 literal-default admission refuses a lead changed to absent variant and recovers only after exact restoration", () => {
  expectSpawn(import.meta.path)
  return Effect.runPromise(run((root) => root.open((host) => Effect.gen(function* () {
    if (!host.parent.model) return yield* Effect.die("fixture parent has no model")
    const absent = { id: host.parent.model.id, providerID: host.parent.model.providerID }
    const expected = { ...absent, variant: ModelV2.VariantID.make("default") }
    yield* host.sessions.switchModel({ sessionID: host.parent.id, model: expected })
    const input = request("v2-model-corruption", "diligence")
    const output = yield* host.invoke(input)
    const report = decoded(output)
    expect(report.status).toBe("completed")
    const original = yield* receipt(host, report)
    const record = yield* owned(host, report.sessionID, expected)
    const calls = root.requests.length
    yield* Effect.gen(function* () {
      yield* host.sessions.switchModel({ sessionID: report.sessionID, model: absent })
      expect((yield* host.sessions.get(report.sessionID)).model).toEqual(absent)
      expect((yield* saved(host, report.sessionID)).row.metadata).toEqual(record.row.metadata)
      refused(yield* host.invoke(input), "engagement-evidence-corrupt")
      refused(yield* host.call(reader, { op: "manifest", reportID: report.reportID }), "engagement-evidence-corrupt")
      expect(root.requests.length).toBe(calls)
      expect((yield* saved(host, report.sessionID)).row.metadata).toEqual(record.row.metadata)
    }).pipe(Effect.ensuring(host.sessions.switchModel({ sessionID: report.sessionID, model: expected }).pipe(Effect.orDie)))
    expect((yield* host.invoke(input)).text).toBe(output.text)
    const restored = yield* receipt(host, report)
    expect(restored.index).toEqual(original.index)
    expect(restored.bytes).toEqual(original.bytes)
    expect(root.requests.length).toBe(calls)
  }), quoted)))
}, 150_000)

test("historical state-v1 normalized default replays immutable bytes for an absent native variant without acquiring new evidence", () => {
  expectSpawn(import.meta.path)
  return Effect.runPromise(run((root) => Effect.gen(function* () {
    const input = request("legacy-model-default", "diligence")
    const original = yield* root.open((host) => Effect.gen(function* () {
      if (!host.parent.model) return yield* Effect.die("fixture parent has no model")
      expect(Object.hasOwn(host.parent.model, "variant")).toBe(false)
      const output = yield* host.invoke(input)
      const report = decoded(output)
      expect(report.status).toBe("completed")
      yield* receipt(host, report)
      const record = yield* saved(host, report.sessionID)
      expect(Object.hasOwn((yield* host.sessions.get(report.sessionID)).model ?? {}, "variant")).toBe(false)
      const { evidence, variants, ...legacy } = record.raw
      expect(evidence).toBeDefined()
      expect(variants).toBeDefined()
      const legacyState = Schema.decodeUnknownSync(StateV1)({
        ...legacy, schema: "review-engagement-state-v1", model: {
          id: host.parent.model.id, providerID: host.parent.model.providerID, variant: "default",
        },
      }, { onExcessProperty: "error" })
      const metadata = { ...record.row.metadata, legacyModelFixture: { keep: true }, lucyEngagementV1: legacyState }
      yield* host.db.update(SessionTable).set({ metadata }).where(eq(SessionTable.id, report.sessionID)).run().pipe(Effect.orDie)
      expect((yield* saved(host, report.sessionID)).value.output).toBe(output.text)
      return { output, report, metadata, calls: root.requests.length }
    }), quoted)
    let gitCalls = 0
    yield* root.open((host) => Effect.gen(function* () {
      const record = yield* saved(host, original.report.sessionID)
      expect(record.value.schema).toBe("review-engagement-state-v1")
      expect(record.value.model?.variant).toBe(ModelV2.VariantID.make("default"))
      expect(Object.hasOwn((yield* host.sessions.get(original.report.sessionID)).model ?? {}, "variant")).toBe(false)
      const inputs = yield* host.db.select().from(SessionInputTable).all().pipe(Effect.orDie)
      const before = gitCalls
      const replay = yield* host.invoke(input)
      expect(replay.text).toBe(original.output.text)
      expect(decoded(replay)).toEqual(original.report)
      const unavailable = yield* host.call(reader, { op: "manifest", reportID: original.report.reportID })
      refused(unavailable, "engagement-evidence-unavailable")
      expect(unavailable.text).toContain("legacy-record")
      expect(root.requests.length).toBe(original.calls)
      expect(gitCalls).toBe(before)
      expect(yield* host.db.select().from(SessionInputTable).all().pipe(Effect.orDie)).toEqual(inputs)
      expect((yield* saved(host, original.report.sessionID)).row.metadata).toEqual(original.metadata)
    }), { ...quoted, onGit: () => { gitCalls++ } })
  })))
}, 150_000)
