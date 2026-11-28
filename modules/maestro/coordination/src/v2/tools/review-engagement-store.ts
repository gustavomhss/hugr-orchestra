export * as ReviewEngagementStoreV2 from "./review-engagement-store"

import { and, eq, sql } from "drizzle-orm"
import { Clock, Effect, Schema } from "effect"
import type { Database } from "@orchestra/core/database/database"
import { SessionSchema } from "@orchestra/core/session"
import { SessionScope } from "@orchestra/core/session/scope"
import { MessageTable, PartTable, SessionContextEpochTable, SessionInputTable, SessionMessageTable, SessionTable } from "@orchestra/core/session/sql"
import { Tool } from "@orchestra/core/tool/tool"
import type { ReviewEngagementEvidenceV2 } from "../workflow/review-engagement-evidence"
import { ReviewEngagementPolicyV2 } from "../workflow/review-engagement-policy"
import { ReviewEngagementReportV2 } from "../workflow/review-engagement-report"
import { ReviewEngagementArtifactsV2 } from "../workflow/review-engagement-artifacts"
import { ReviewVariantSchemaV2 } from "../workflow/review-variant-schema"
import { ReviewFixSchemaV2 } from "../workflow/review-fix-schema"
import { ReviewFixAuthorityV2 } from "../workflow/review-fix-authority"

const KEY = "lucyEngagementV1"
const strict = { onExcessProperty: "error" } as const
const Digest = Schema.String.check(Schema.isPattern(/^[0-9a-f]{64}$/))
const Model = Schema.Struct({ id: Schema.NonEmptyString, providerID: Schema.NonEmptyString, variant: Schema.optional(Schema.NonEmptyString) })
const IdentitySchema = Schema.Struct({
  key: Digest, leadID: SessionSchema.ID, parentID: SessionSchema.ID, projectID: Schema.NonEmptyString,
  location: Schema.Struct({ directory: Schema.NonEmptyString, workspaceID: Schema.optional(Schema.NonEmptyString) }),
  requestID: Schema.NonEmptyString, inputHash: Digest,
})
export type Identity = typeof IdentitySchema.Type
const ChildSchema = Schema.Struct({ id: SessionSchema.ID, key: Schema.NonEmptyString, role: Schema.Literals(["lead", "lens", "verifier"]) })
export type Child = typeof ChildSchema.Type
const recordFields = {
  identity: IdentitySchema,
  input: ReviewEngagementPolicyV2.Input, owner: Schema.NonEmptyString, model: Schema.optional(Model),
  budget: ReviewEngagementReportV2.Budget, source: Schema.optional(ReviewEngagementReportV2.Source),
  children: Schema.Array(ChildSchema), state: Schema.Literals(["running", "terminal"]), output: Schema.optional(Schema.String),
}
const StateV1 = Schema.Struct({ schema: Schema.Literal("review-engagement-state-v1"), ...recordFields })
const StateV2 = Schema.Struct({ schema: Schema.Literal("review-engagement-state-v2"), ...recordFields,
  evidence: Schema.optional(ReviewEngagementArtifactsV2.EvidenceState) })
const StateV3 = Schema.Struct({ schema: Schema.Literal("review-engagement-state-v3"), ...recordFields,
  evidence: Schema.optional(ReviewEngagementArtifactsV2.EvidenceState), variants: ReviewVariantSchemaV2.VariantJournal })
const StateV4 = Schema.Struct({ schema: Schema.Literal("review-engagement-state-v4"), ...recordFields,
  evidence: ReviewEngagementArtifactsV2.EvidenceState, fix: ReviewFixSchemaV2.FixState })
const StoredRecord = Schema.Union([StateV1, StateV2, StateV3, StateV4])
type Common = Omit<typeof StateV1.Type, "state" | "output"> | Omit<typeof StateV2.Type, "state" | "output"> |
  Omit<typeof StateV3.Type, "state" | "output">
export type Running = Common & { readonly state: "running" }
export type Terminal = Common & { readonly state: "terminal"; readonly terminal: ReviewEngagementReportV2.Stored }
export type Record = Running | Terminal
export type Ticket = { readonly identity: Identity; readonly owner: string }
export type Outcome = { readonly status: "completed"; readonly result: ReviewEngagementReportV2.Stored; readonly evidence: ReviewEngagementArtifactsV2.Sealed } |
  { readonly status: ReviewEngagementReportV2.Stopped; readonly reason?: string }
type FixCommon = Omit<typeof StateV4.Type, "state" | "output">
export type FixRunning = FixCommon & { readonly state: "running" }
export type FixTerminal = FixCommon & { readonly state: "terminal"; readonly terminal: ReviewFixSchemaV2.Stored }
export type FixRecord = FixRunning | FixTerminal
export type FixOutcome = { readonly status: "completed"; readonly result: ReviewFixSchemaV2.Stored; readonly evidence: ReviewFixSchemaV2.Sealed } |
  { readonly status: ReviewEngagementReportV2.Stopped; readonly reason?: string;
    readonly notExamined?: ReviewFixSchemaV2.FixResult["notExamined"] }
export type Interface = {
  readonly read: (identity: Identity) => Effect.Effect<Record | undefined, Tool.Failure>
  readonly lookup: (parent: SessionSchema.Info, reportID: string) => Effect.Effect<Terminal | undefined, Tool.Failure>
  readonly admit: (identity: Identity, input: ReviewEngagementPolicyV2.Input, owner: string,
    model?: SessionSchema.Info["model"]) => Effect.Effect<Record, Tool.Failure>
  readonly capture: (ticket: Ticket, source: ReviewEngagementEvidenceV2.Prepared) => Effect.Effect<Record, Tool.Failure>
  readonly own: (ticket: Ticket, child: Child) => Effect.Effect<Record, Tool.Failure>
  readonly reserveVariant: (ticket: Ticket, input: { readonly seed: ReviewVariantSchemaV2.SeedRef }) => Effect.Effect<Record, Tool.Failure>
  readonly settleVariant: (ticket: Ticket, input: { readonly generation: ReviewVariantSchemaV2.GenerationRecord }) => Effect.Effect<Record, Tool.Failure>
  readonly closeVariants: (ticket: Ticket, input: { readonly stop: ReviewVariantSchemaV2.VariantStop }) => Effect.Effect<Record, Tool.Failure>
  readonly finish: (ticket: Ticket, outcome: Outcome) => Effect.Effect<Terminal, Tool.Failure>
  readonly readFix: (id: Identity) => Effect.Effect<FixRecord | undefined, Tool.Failure>
  readonly expireFix: (id: Identity) => Effect.Effect<FixRecord | undefined, Tool.Failure>
  readonly lookupFix: (parent: SessionSchema.Info, reportID: string) => Effect.Effect<FixTerminal | undefined, Tool.Failure>
  readonly admitFix: (identity: Identity, input: ReviewEngagementPolicyV2.Input, owner: string,
    model?: SessionSchema.Info["model"]) => Effect.Effect<FixRecord, Tool.Failure>
  readonly bindFixPrior: (ticket: Ticket, prior: ReviewFixSchemaV2.PriorBinding) => Effect.Effect<FixRecord, Tool.Failure>
  readonly captureFix: (ticket: Ticket, source: ReviewEngagementReportV2.Source) => Effect.Effect<FixRecord, Tool.Failure>
  readonly ownFix: (ticket: Ticket, child: Child) => Effect.Effect<FixRecord, Tool.Failure>
  readonly finishFix: (ticket: Ticket, outcome: FixOutcome) => Effect.Effect<FixTerminal, Tool.Failure>
}
type Sql = Pick<Database.Interface["db"], "select" | "update">
type Row = typeof SessionTable.$inferSelect
type Placement = { readonly project_id: string; readonly directory: string; readonly workspace_id: string | null }
type AdmissionRow = Placement & Pick<Row, "id" | "parent_id" | "agent" | "model" | "metadata">

const same = (left: unknown, right: unknown) => ReviewEngagementReportV2.canonical(left) === ReviewEngagementReportV2.canonical(right)
const failure = (reason: string, detail: string) => new Tool.Failure({ message: `${reason}: ${detail}`, metadata: { reason } })
const invalid = (detail: string) => failure("engagement-record-invalid", detail)
const corrupt = (detail: string) => failure("engagement-evidence-corrupt", detail)

export function identity(parent: Pick<Identity, "projectID" | "location"> & { readonly id: SessionSchema.ID }, input: ReviewEngagementPolicyV2.Input): Identity {
  const location = { directory: parent.location.directory,
    ...(parent.location.workspaceID === undefined ? {} : { workspaceID: parent.location.workspaceID }) }
  const namespace = { domain: "review-engagement-namespace-v1", parentID: parent.id,
    projectID: parent.projectID, location, requestID: input.requestID }
  const key = ReviewEngagementReportV2.digest(namespace)
  return { key, leadID: SessionSchema.ID.make(`ses_lucy_engagement_${ReviewEngagementReportV2.digest({ key, role: "lead" })}`),
    parentID: parent.id, projectID: parent.projectID, location, requestID: input.requestID,
    inputHash: ReviewEngagementReportV2.digest(input) }
}

export function priorAuthority(view: Terminal): unknown {
  return { ...common(view), state: "terminal", output: view.terminal.text }
}

export function readPriorAuthority(value: unknown): Effect.Effect<Terminal, Tool.Failure> {
  return Effect.gen(function* () {
    const data = yield* Effect.try({ try: () => Schema.decodeUnknownSync(Schema.Union([StateV2, StateV3]))(value, strict),
      catch: (error) => invalid(String(error)) })
    const expected = identity({ id: data.identity.parentID, projectID: data.identity.projectID,
      location: data.identity.location }, data.input)
    if (!same(expected, data.identity)) return yield* invalid("prior authority namespace is inconsistent")
    const row: AdmissionRow = { id: data.identity.leadID, parent_id: data.identity.parentID, agent: "lucy",
      project_id: data.identity.projectID, directory: data.identity.location.directory,
      workspace_id: data.identity.location.workspaceID ?? null, model: data.model ?? null, metadata: { [KEY]: value } }
    const record = yield* decode(row, data.identity)
    if (!record || record.state !== "terminal" || record.terminal.value.status !== "completed")
      return yield* invalid("prior authority is not a completed ordinary record")
    return record
  })
}

/** Native Session.create runs before admit, outside these deliberately short SQL transactions. */
export function make(database: Database.Interface): Interface {
  const atomic = <A>(run: (tx: Sql) => Effect.Effect<A, Tool.Failure>) =>
    database.db.transaction(run, { behavior: "immediate" }).pipe(
      Effect.catch((error) => error instanceof Tool.Failure ? Effect.fail(error) : Effect.die(error)),
    )
  const owned = (tx: Sql, ticket: Ticket) => Effect.gen(function* () {
    const row = yield* load(tx, ticket.identity.leadID)
    if (!row) return yield* invalid("lead Session is unavailable")
    const record = yield* decode(row, ticket.identity)
    if (!record) return yield* invalid("request was not admitted")
    if (record.owner !== ticket.owner) return yield* failure("engagement-owner-lost", "request owner changed")
    return record
  })
  const ownedFix = (tx: Sql, ticket: Ticket) => Effect.gen(function* () {
    const row = yield* load(tx, ticket.identity.leadID)
    if (!row) return yield* invalid("lead Session is unavailable")
    const record = yield* decodeFix(row, ticket.identity)
    if (!record) return yield* invalid("fix request was not admitted")
    if (record.owner !== ticket.owner) return yield* failure("engagement-owner-lost", "request owner changed")
    return record
  })
  const stop = (tx: Sql, record: Running, status: ReviewEngagementReportV2.Stopped, reason?: string) => {
    const terminal: Terminal = { ...record, state: "terminal", terminal: ReviewEngagementReportV2.terminal({ ...context(record),
      ...(record.schema !== "review-engagement-state-v1" ? { notExamined: [{ item: "engagement:evidence-publication",
        reason: status === "expired" ? "time-box" : status === "cancelled" ? "cancelled" : "failure" }] } : {}) }, status, reason) }
    return write(tx, terminal, record).pipe(Effect.as(terminal))
  }
  return {
    read: (id) => Effect.gen(function* () {
      const row = yield* load(database.db, id.leadID)
      return row ? yield* decode(row, id) : undefined
    }),
    readFix: (id) => Effect.gen(function* () {
      const row = yield* load(database.db, id.leadID)
      return row ? yield* decodeFix(row, id) : undefined
    }),
    expireFix: (id) => atomic((tx) => Effect.gen(function* () {
      const row = yield* load(tx, id.leadID)
      if (!row) return undefined
      const record = yield* decodeFix(row, id)
      if (!record || record.state === "terminal" || (yield* Clock.currentTimeMillis) < record.budget.deadlineAt) return record
      return yield* stopFix(tx, record, "expired")
    })),
    lookup: (parent, reportID) => Effect.gen(function* () {
      // SQL restricts the authoritative placement before any report ID or JSON record is inspected.
      const rows = yield* database.db.select().from(SessionTable).where(and(eq(SessionTable.parent_id, parent.id),
        eq(SessionTable.project_id, parent.projectID), eq(SessionTable.directory, parent.location.directory), eq(SessionTable.agent, "lucy"),
        parent.location.workspaceID === undefined ? sql`${SessionTable.workspace_id} IS NULL` : eq(SessionTable.workspace_id, parent.location.workspaceID),
      )).all().pipe(Effect.orDie)
      let found: Terminal | undefined
      for (const row of rows) {
        if (!metadataObject(row.metadata)) continue
        const value = row.metadata?.[KEY]
        if (typeof value !== "object" || value === null || !("output" in value) || typeof value.output !== "string") continue
        const output = value.output
        const selected = yield* Effect.try({ try: () => Schema.decodeUnknownSync(Schema.Struct({ reportID: Digest }))(JSON.parse(output)),
          catch: () => undefined }).pipe(Effect.catch(() => Effect.succeed(undefined)))
        if (selected?.reportID !== reportID) continue
        if (typeof value === "object" && value !== null && "schema" in value && value.schema === "review-engagement-state-v4") continue
        const data = yield* Effect.try({ try: () => Schema.decodeUnknownSync(StoredRecord)(value, strict),
          catch: (error) => storedFailure(value, invalid(String(error))) })
        const record = yield* decode(row, identity(parent, data.input))
        if (!record || record.state !== "terminal" || record.terminal.value.reportID !== reportID || found)
          return yield* invalid("report lookup identity differs")
        found = record
      }
      return found
    }),
    lookupFix: (parent, reportID) => Effect.gen(function* () {
      const rows = yield* lookupRows(database.db, parent)
      let found: FixTerminal | undefined
      for (const row of rows) {
        const value = row.metadata?.[KEY]
        if (typeof value !== "object" || value === null || !("schema" in value) || value.schema !== "review-engagement-state-v4") continue
        if (!("input" in value)) return yield* invalid("fix record has no accepted input")
        const input = yield* Effect.try({ try: () => Schema.decodeUnknownSync(ReviewEngagementPolicyV2.Input)(value.input, strict),
          catch: (error) => invalid(String(error)) })
        const record = yield* decodeFix(row, identity(parent, input))
        if (!record || record.state !== "terminal" || record.terminal.value.reportID !== reportID) continue
        if (found)
          return yield* invalid("fix report lookup identity differs")
        found = record
      }
      return found
    }),
    admit: (id, input, owner, requestedModel) => atomic((tx) => Effect.gen(function* () {
      const parent = yield* load(tx, id.parentID)
      const lead = yield* load(tx, id.leadID)
      if (!lead) return yield* invalid("lead Session is unavailable")
      const existing = yield* decode(lead, id)
      if (existing) return existing
      if (!parent || !placed(parent, id) || !same(normalizeModel(parent.model), normalizeModel(requestedModel)))
        return yield* invalid("parent admission identity changed")
      if (input.profile === "compliance" || input.fixReview !== undefined || !owner ||
        input.requestID !== id.requestID || ReviewEngagementReportV2.digest(input) !== id.inputHash)
        return yield* invalid("invalid admission input")
      yield* verifySession(lead, id, id.parentID, normalizeModel(requestedModel))
      yield* pristine(tx, lead)
      // This clock read happens after BEGIN IMMEDIATE and before any captured-source acquisition.
      const now = yield* Clock.currentTimeMillis
      const budget = ReviewEngagementPolicyV2.createBudget(input, now)
      const model = normalizeModel(requestedModel)
      const record: Running = { schema: "review-engagement-state-v3", evidence: { policy: "required-completed-v1" },
        variants: { policy: "audit-variants-v1", limit: input.profile === "audit" ? 3 : 0, reservations: [], phase: "open" },
        identity: id, input, owner, ...(model ? { model } : {}),
        budget: { startedAt: budget.startedAt, deadlineAt: budget.deadlineAt },
        children: [{ id: id.leadID, key: "lead", role: "lead" }], state: "running" }
      yield* write(tx, record)
      return record
    })),
    admitFix: (id, input, owner, requestedModel) => atomic((tx) => Effect.gen(function* () {
      const parent = yield* load(tx, id.parentID)
      const lead = yield* load(tx, id.leadID)
      if (!lead) return yield* invalid("lead Session is unavailable")
      const existing = yield* decodeFix(lead, id)
      if (existing) return existing
      if (!parent || !placed(parent, id) || !same(normalizeModel(parent.model), normalizeModel(requestedModel)))
        return yield* invalid("parent admission identity changed")
      if (input.profile === "compliance" || input.fixReview === undefined || !owner || input.requestID !== id.requestID ||
        ReviewEngagementReportV2.digest(input) !== id.inputHash)
        return yield* invalid("invalid fix admission input")
      yield* verifySession(lead, id, id.parentID, normalizeModel(requestedModel))
      yield* pristine(tx, lead)
      const now = yield* Clock.currentTimeMillis
      const budget = ReviewEngagementPolicyV2.createBudget(input, now)
      const model = normalizeModel(requestedModel)
      const record: FixRunning = { schema: "review-engagement-state-v4", evidence: { policy: "required-completed-v1" },
        fix: { policy: "fix-review-v1" }, identity: id, input, owner, ...(model ? { model } : {}),
        budget: { startedAt: budget.startedAt, deadlineAt: budget.deadlineAt },
        children: [{ id: id.leadID, key: "lead", role: "lead" }], state: "running" }
      yield* write(tx, record)
      return record
    })),
    capture: (ticket, source) => atomic((tx) => Effect.gen(function* () {
      const record = yield* owned(tx, ticket)
      if (record.state === "terminal") return record
      if ((yield* Clock.currentTimeMillis) >= record.budget.deadlineAt) return yield* stop(tx, record, "expired")
      yield* Effect.try({ try: () => {
        Schema.decodeUnknownSync(ReviewEngagementReportV2.Source)(source, strict)
        validateCapture(record.input, source)
      }, catch: (error) => invalid(String(error)) })
      if (record.source) {
        if (!same(record.source, source)) return yield* invalid("captured source cannot change")
        return record
      }
      const captured: Running = { ...record, source }
      yield* write(tx, captured, record)
      return captured
    })),
    own: (ticket, child) => atomic((tx) => Effect.gen(function* () {
      const record = yield* owned(tx, ticket)
      if (record.state === "terminal") return record
      if ((yield* Clock.currentTimeMillis) >= record.budget.deadlineAt) return yield* stop(tx, record, "expired")
      const previous = record.children.find((entry) => entry.key === child.key || entry.id === child.id)
      if (previous && !same(previous, child)) return yield* invalid("child identity conflict")
      if (child.role === "lead" && (child.id !== record.identity.leadID || child.key !== "lead") ||
        child.role !== "lead" && (child.id === record.identity.leadID || child.key === "lead"))
        return yield* invalid("child role conflict")
      const row = yield* load(tx, child.id)
      if (!row) return yield* invalid("owned child Session is unavailable")
      yield* verifySession(row, record.identity, child.role === "lead" ? record.identity.parentID : record.identity.leadID, record.model)
      if (previous) return record
      if (record.schema === "review-engagement-state-v3" && child.key.startsWith("variant:")) {
        if (child.role === "lead") return yield* corrupt("variant child cannot be the lead")
        const pending = record.variants.reservations.at(-1)
        if (!pending || pending.status !== "reserved" || record.variants.phase !== "open" ||
          !(child.role === "lens" && child.key === pending.proposalKey || child.role === "verifier" &&
            child.key.startsWith(`variant:${pending.ordinal}:verify:`) && child.key.length > `variant:${pending.ordinal}:verify:`.length) ||
          child.id !== ReviewVariantSchemaV2.childID(record.identity.key, child.key, child.role))
          return yield* corrupt("variant child has no matching pending reservation")
      }
      yield* pristine(tx, row)
      const next: Running = { ...record, children: [...record.children, child] }
      yield* write(tx, next, record)
      return next
    })),
    reserveVariant: (ticket, input) => atomic((tx) => Effect.gen(function* () {
      const record = yield* owned(tx, ticket)
      if (record.state === "terminal") return record
      const now = yield* Clock.currentTimeMillis
      if (now >= record.budget.deadlineAt) return yield* stop(tx, record, "expired")
      if (record.schema !== "review-engagement-state-v3" || !record.source || record.variants.phase !== "open")
        return yield* corrupt("variant reservation is not open on a captured versioned request")
      const seed = yield* Effect.try({ try: () => Schema.decodeUnknownSync(ReviewVariantSchemaV2.SeedRef)(input.seed, strict),
        catch: () => corrupt("variant seed identity is invalid") })
      const last = record.variants.reservations.at(-1)
      if (last?.status === "reserved") {
        if (!same(last.seed, seed)) return yield* corrupt("pending variant reservation was reused with another seed")
        return record
      }
      if (record.variants.reservations.length >= record.variants.limit || last &&
        (last.settlement.decision.type !== "continue" || !same(last.settlement.decision.nextSeed, seed)))
        return yield* corrupt("variant reservation does not continue the preceding generation")
      const ordinal = yield* Effect.try({ try: () => Schema.decodeUnknownSync(ReviewVariantSchemaV2.Ordinal)(record.variants.reservations.length + 1),
        catch: () => corrupt("variant generation limit exceeded") })
      const reservation: ReviewVariantSchemaV2.Reservation = {
        generationID: ReviewVariantSchemaV2.generationID({ namespace: record.identity.key, inputHash: record.identity.inputHash,
          sourceSha256: record.source.sha256, ordinal, seedID: seed.seedID }),
        ordinal, sourceSha256: record.source.sha256, seed, reservedAt: now,
        proposalKey: `variant:${ordinal}:proposal`, status: "reserved",
      }
      const next: Extract<Running, { readonly schema: "review-engagement-state-v3" }> = {
        ...record, variants: { ...record.variants, reservations: [...record.variants.reservations, reservation] },
      }
      yield* Effect.try({ try: () => validateJournal(next), catch: (error) => error instanceof Tool.Failure ? error : corrupt(String(error)) })
      yield* write(tx, next, record)
      return next
    })),
    settleVariant: (ticket, input) => atomic((tx) => Effect.gen(function* () {
      const record = yield* owned(tx, ticket)
      if (record.state === "terminal") return record
      if ((yield* Clock.currentTimeMillis) >= record.budget.deadlineAt) return yield* stop(tx, record, "expired")
      if (record.schema !== "review-engagement-state-v3") return yield* corrupt("legacy request cannot settle variants")
      const generation = yield* Effect.try({ try: () => Schema.decodeUnknownSync(ReviewVariantSchemaV2.GenerationRecord)(input.generation, strict),
        catch: () => corrupt("variant settlement is malformed") })
      const previous = record.variants.reservations[generation.ordinal - 1]
      if (!previous || !same(reservationIdentity(previous), reservationIdentity(generation)))
        return yield* corrupt("variant settlement does not belong to its reservation")
      const settled: ReviewVariantSchemaV2.Reservation = { ...reservationIdentity(generation), status: "settled",
        settlement: { sha256: ReviewVariantSchemaV2.digest(generation), decision: generation.decision,
          ...(generation.search.status === "accepted" ? { counts: generation.search.counts } : {}) } }
      if (previous.status === "settled") {
        if (!same(previous, settled)) return yield* corrupt("settled generation cannot change")
        return record
      }
      if (record.variants.phase !== "open" || generation.ordinal !== record.variants.reservations.length)
        return yield* corrupt("variant settlement is not the pending generation")
      if (generation.search.status === "accepted" && !same(generation.search.counts, ReviewVariantSchemaV2.countMatches(generation.search.matches)))
        return yield* corrupt("variant settlement counts differ from its dispositions")
      if (generation.search.status === "rejected" && !same(generation.decision, { type: "stop", reason: generation.search.reason,
        ...(generation.search.detail === undefined ? {} : { detail: generation.search.detail }) }))
        return yield* corrupt("rejected witness has a different settlement decision")
      const next: Extract<Running, { readonly schema: "review-engagement-state-v3" }> = { ...record,
        variants: { ...record.variants, reservations: record.variants.reservations.map((entry) => entry.ordinal === generation.ordinal ? settled : entry) } }
      yield* Effect.try({ try: () => validateJournal(next), catch: (error) => error instanceof Tool.Failure ? error : corrupt(String(error)) })
      yield* write(tx, next, record)
      return next
    })),
    closeVariants: (ticket, input) => atomic((tx) => Effect.gen(function* () {
      const record = yield* owned(tx, ticket)
      if (record.state === "terminal") return record
      if ((yield* Clock.currentTimeMillis) >= record.budget.deadlineAt) return yield* stop(tx, record, "expired")
      if (record.schema !== "review-engagement-state-v3") return yield* corrupt("legacy request cannot close variants")
      const reason = yield* Effect.try({ try: () => Schema.decodeUnknownSync(ReviewVariantSchemaV2.VariantStop)(input.stop),
        catch: () => corrupt("variant stop is invalid") })
      if (record.variants.phase === "closed") {
        if (record.variants.stop !== reason) return yield* corrupt("closed variant journal cannot change")
        return record
      }
      const next: Extract<Running, { readonly schema: "review-engagement-state-v3" }> = {
        ...record, variants: { ...record.variants, phase: "closed", stop: reason },
      }
      yield* Effect.try({ try: () => validateJournal(next), catch: (error) => error instanceof Tool.Failure ? error : corrupt(String(error)) })
      yield* write(tx, next, record)
      return next
    })),
    finish: (ticket, outcome) => atomic((tx) => Effect.gen(function* () {
      const record = yield* owned(tx, ticket)
      if (record.state === "terminal") return record
      // Publication checks time under the same lock as the owner/status transition.
      const now = yield* Clock.currentTimeMillis
      if (now >= record.budget.deadlineAt) return yield* stop(tx, record, "expired")
      if (outcome.status !== "completed") return yield* stop(tx, record, outcome.status, outcome.reason)
      const result = yield* ReviewEngagementReportV2.read(outcome.result.text)
      if (result.value.status !== "completed") return yield* invalid("completion contains no completed report")
      yield* matchesResult(record, result)
      const evidence = yield* Effect.try({ try: () => {
        if (record.schema === "review-engagement-state-v3") {
          validateJournal(record, true)
          return ReviewEngagementArtifactsV2.assertBinding(outcome.evidence, result, record.variants)
        }
        return ReviewEngagementArtifactsV2.assertBinding(outcome.evidence, result)
      },
        catch: (error) => error instanceof Tool.Failure ? error : invalid(String(error)) })
      // Validation can suspend; the original deadline is checked again immediately before publication under this lock.
      if ((yield* Clock.currentTimeMillis) >= record.budget.deadlineAt) return yield* stop(tx, record, "expired")
      const terminal: Terminal = { ...record, ...(record.schema !== "review-engagement-state-v1" ? { evidence } : {}), state: "terminal", terminal: result }
      yield* write(tx, terminal, record)
      return terminal
    })),
    bindFixPrior: (ticket, prior) => atomic((tx) => Effect.gen(function* () {
      const record = yield* ownedFix(tx, ticket)
      if (record.state === "terminal") return record
      if ((yield* Clock.currentTimeMillis) >= record.budget.deadlineAt) return yield* stopFix(tx, record, "expired")
      if (!record.input.fixReview || prior.reportID !== record.input.fixReview.reportID ||
        !same(prior.findings.map((finding) => finding.findingID), record.input.fixReview.findingIDs))
        return yield* invalid("fix prior differs from accepted selection")
      yield* Effect.try({ try: () => ReviewFixAuthorityV2.assertPrior(prior), catch: (error) => invalid(String(error)) })
      if (record.fix.prior) {
        if (!same(record.fix.prior, prior)) return yield* invalid("bound fix prior cannot change")
        return record
      }
      const next: FixRunning = { ...record, fix: { ...record.fix, prior } }
      yield* write(tx, next, record)
      return next
    })),
    captureFix: (ticket, source) => atomic((tx) => Effect.gen(function* () {
      const record = yield* ownedFix(tx, ticket)
      if (record.state === "terminal") return record
      if ((yield* Clock.currentTimeMillis) >= record.budget.deadlineAt) return yield* stopFix(tx, record, "expired")
      const prior = record.fix.prior
      if (!prior) return yield* invalid("fix source cannot be captured before the prior is bound")
      yield* Effect.try({ try: () => {
        Schema.decodeUnknownSync(ReviewEngagementReportV2.Source)(source, strict)
        validateCapture(record.input, source)
        if (!same(source.files.map((file) => file.path), prior.requiredFiles))
          throw new Error("fix source differs from the exact bound file projection")
      }, catch: (error) => invalid(String(error)) })
      if (record.source) {
        if (!same(record.source, source)) return yield* invalid("captured fix source cannot change")
        return record
      }
      const next: FixRunning = { ...record, source }
      yield* write(tx, next, record)
      return next
    })),
    ownFix: (ticket, child) => atomic((tx) => Effect.gen(function* () {
      const record = yield* ownedFix(tx, ticket)
      if (record.state === "terminal") return record
      if ((yield* Clock.currentTimeMillis) >= record.budget.deadlineAt) return yield* stopFix(tx, record, "expired")
      if (!record.fix.prior || !record.source) return yield* invalid("fix child cannot be owned before prior and source are bound")
      const previous = record.children.find((entry) => entry.key === child.key || entry.id === child.id)
      if (previous && !same(previous, child)) return yield* invalid("fix child identity conflict")
      if (child.role === "lead" && (child.id !== record.identity.leadID || child.key !== "lead") ||
        child.role !== "lead" && (child.id === record.identity.leadID || child.key === "lead"))
        return yield* invalid("fix child role conflict")
      const row = yield* load(tx, child.id)
      if (!row) return yield* invalid("owned fix child Session is unavailable")
      yield* verifySession(row, record.identity, child.role === "lead" ? record.identity.parentID : record.identity.leadID, record.model)
      if (previous) return record
      yield* pristine(tx, row)
      const next: FixRunning = { ...record, children: [...record.children, child] }
      yield* write(tx, next, record)
      return next
    })),
    finishFix: (ticket, outcome) => atomic((tx) => Effect.gen(function* () {
      const record = yield* ownedFix(tx, ticket)
      if (record.state === "terminal") return record
      if ((yield* Clock.currentTimeMillis) >= record.budget.deadlineAt) return yield* stopFix(tx, record, "expired")
      if (outcome.status !== "completed") return yield* stopFix(tx, record, outcome.status, outcome.reason, outcome.notExamined)
      if (!record.fix.prior || !record.source) return yield* invalid("fix completion has no bound prior or source")
      const result = yield* Effect.try({ try: () => ReviewFixAuthorityV2.parse(outcome.result.text), catch: (error) => invalid(String(error)) })
      if (!same(result, outcome.result) || result.value.status !== "completed" || result.value.reportID !== outcome.result.value.reportID ||
        result.value.inputHash !== record.identity.inputHash || result.value.requestID !== record.input.requestID ||
        result.value.sessionID !== record.identity.leadID || !same(result.value.budget, record.budget) ||
        !same(result.value.prior, record.fix.prior) || !same(result.value.source, record.source))
        return yield* invalid("fix result does not match durable admission")
      const evidence = yield* Effect.try({ try: () => ReviewFixAuthorityV2.assertSeal(outcome.evidence, result, record),
        catch: (error) => error instanceof Tool.Failure ? error : invalid(String(error)) })
      if ((yield* Clock.currentTimeMillis) >= record.budget.deadlineAt) return yield* stopFix(tx, record, "expired")
      const terminal: FixTerminal = { ...record, evidence, state: "terminal", terminal: result }
      yield* write(tx, terminal, record)
      return terminal
    })),
  }
}

const load = (db: Pick<Sql, "select">, id: SessionSchema.ID) => Effect.gen(function* () {
  const row = yield* db.select().from(SessionTable).where(eq(SessionTable.id, id)).get().pipe(Effect.orDie)
  if (row && !metadataObject(row.metadata)) return yield* invalid("Session metadata is not an object")
  return row
})

function metadataObject(value: unknown) {
  return value === null || typeof value === "object" && value !== null && !Array.isArray(value) &&
    (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null)
}

function decode(row: AdmissionRow, expected: Identity): Effect.Effect<Record | undefined, Tool.Failure> {
  return Effect.gen(function* () {
    if (!placed(row, expected) || row.id !== expected.leadID || row.parent_id !== expected.parentID || row.agent !== "lucy")
      return yield* invalid("lead Session identity mismatch")
    const value = row.metadata?.[KEY]
    if (value === undefined) return undefined
    const data = yield* Effect.try({
      try: () => Schema.decodeUnknownSync(StoredRecord)(value, strict), catch: (error) => invalid(String(error)),
    })
    if (data.schema === "review-engagement-state-v4")
      return yield* failure("engagement-request-conflict", "request ID already owns a fix review")
    if (data.identity.inputHash !== expected.inputHash)
      return yield* failure("engagement-request-conflict", "request ID already owns a different accepted input")
    const legacy = data.schema === "review-engagement-state-v1"
    if (!same(data.identity, expected) || ReviewEngagementReportV2.digest(data.input) !== expected.inputHash ||
      data.input.requestID !== expected.requestID || data.input.profile === "compliance" || data.input.fixReview !== undefined ||
      !same(normalizeModel(row.model, legacy), normalizeModel(data.model, legacy)) ||
      data.budget.deadlineAt - data.budget.startedAt !== data.input.timeBoxMinutes * 60_000 ||
      !Number.isSafeInteger(data.budget.startedAt) || !Number.isSafeInteger(data.budget.deadlineAt) ||
      new Set(data.children.map((child) => child.id)).size !== data.children.length ||
      new Set(data.children.map((child) => child.key)).size !== data.children.length ||
      !data.children.some((child) => child.id === expected.leadID && child.key === "lead" && child.role === "lead"))
      return yield* invalid("durable admission identity mismatch")
    const source = data.source
    if (source) yield* Effect.try({ try: () => validateCapture(data.input, source), catch: (error) => invalid(String(error)) })
    const { state, output, ...common } = data
    if (data.schema === "review-engagement-state-v3") yield* Effect.try({ try: () => validateJournal(data),
      catch: (error) => error instanceof Tool.Failure ? error : invalid(String(error)) })
    const evidence = data.schema === "review-engagement-state-v1" ? undefined : data.evidence
    if (data.schema !== "review-engagement-state-v1" && evidence === undefined)
      return yield* failure("engagement-evidence-missing", "versioned record has no required evidence policy or reference")
    if (evidence !== undefined &&
      ((evidence.receiptID === undefined) !== (evidence.bytes === undefined)))
      return yield* invalid("evidence reference is incomplete")
    if (state === "running") {
      if (output !== undefined) return yield* invalid("unfinished record has terminal bytes")
      if (evidence !== undefined && evidence.receiptID !== undefined)
        return yield* invalid("unfinished record has a published evidence receipt")
      return { ...common, state }
    }
    if (output === undefined) return yield* invalid("terminal bytes are missing")
    const terminal = yield* ReviewEngagementReportV2.read(output)
    if (legacy && terminal.value.report?.findings.some((finding) => finding.evidence.kind === "probe"))
      return yield* invalid("legacy report cannot retain scoped probe evidence")
    yield* matchesResult(common, terminal)
    if (data.schema === "review-engagement-state-v3" && terminal.value.status === "completed")
      yield* Effect.try({ try: () => validateJournal(data, true), catch: (error) => error instanceof Tool.Failure ? error : invalid(String(error)) })
    if (data.schema !== "review-engagement-state-v1" && terminal.value.status !== "completed") {
      if (evidence !== undefined && evidence.receiptID !== undefined) return yield* invalid("stopped record has a published evidence receipt")
      const reason = terminal.value.status === "expired" ? "time-box" : terminal.value.status === "cancelled" ? "cancelled" : "failure"
      if (!terminal.value.notExamined.some((gap) => gap.item === "engagement:evidence-publication" && gap.reason === reason))
        return yield* invalid("stopped evidence publication coverage is missing")
    }
    return { ...common, state, terminal }
  }).pipe(Effect.mapError((error) => storedFailure(row.metadata?.[KEY], error)))
}

function decodeFix(row: Row, expected: Identity): Effect.Effect<FixRecord | undefined, Tool.Failure> {
  return Effect.gen(function* () {
    if (!placed(row, expected) || row.id !== expected.leadID || row.parent_id !== expected.parentID || row.agent !== "lucy")
      return yield* invalid("fix lead Session identity mismatch")
    const raw = row.metadata?.[KEY]
    if (raw === undefined) return undefined
    if (typeof raw !== "object" || raw === null || !("schema" in raw) || raw.schema !== "review-engagement-state-v4")
      return yield* failure("engagement-request-conflict", "request ID is not a fix review")
    const data = yield* Effect.try({ try: () => Schema.decodeUnknownSync(StateV4)(raw, strict),
      catch: (error) => invalid(String(error)) })
    if (data.identity.inputHash !== expected.inputHash)
      return yield* failure("engagement-request-conflict", "request ID already owns a different accepted input")
    if (!same(data.identity, expected) || ReviewEngagementReportV2.digest(data.input) !== expected.inputHash ||
      data.input.requestID !== expected.requestID || data.input.profile === "compliance" || data.input.fixReview === undefined ||
      !same(normalizeModel(row.model), normalizeModel(data.model)) ||
      data.budget.deadlineAt - data.budget.startedAt !== data.input.timeBoxMinutes * 60_000 ||
      !Number.isSafeInteger(data.budget.startedAt) || !Number.isSafeInteger(data.budget.deadlineAt) ||
      new Set(data.children.map((child) => child.id)).size !== data.children.length ||
      new Set(data.children.map((child) => child.key)).size !== data.children.length ||
      !data.children.some((child) => child.id === expected.leadID && child.key === "lead" && child.role === "lead") ||
      data.fix.policy !== "fix-review-v1") return yield* invalid("durable fix admission identity mismatch")
    if (data.source) yield* Effect.try({ try: () => validateCapture(data.input, data.source!), catch: (error) => invalid(String(error)) })
    const { state, output, ...common } = data
    if (state === "running") {
      if (output !== undefined || data.evidence.receiptID !== undefined || data.evidence.bytes !== undefined)
        return yield* invalid("unfinished fix record has terminal evidence")
      return { ...common, state }
    }
    if (output === undefined) return yield* invalid("terminal fix bytes are missing")
    const terminal = yield* Effect.try({ try: () => ReviewFixAuthorityV2.parse(output), catch: (error) => invalid(String(error)) })
    if (terminal.value.inputHash !== expected.inputHash || terminal.value.requestID !== expected.requestID ||
      terminal.value.sessionID !== expected.leadID || !same(terminal.value.budget, data.budget) ||
      !same(terminal.value.prior ?? null, data.fix.prior ?? null) || !same(terminal.value.source ?? null, data.source ?? null) ||
      terminal.value.status === "completed" && (data.evidence.receiptID === undefined || data.evidence.bytes === undefined) ||
      terminal.value.status !== "completed" && (data.evidence.receiptID !== undefined || data.evidence.bytes !== undefined))
      return yield* invalid("terminal fix result differs from durable admission")
    return { ...common, state, terminal }
  }).pipe(Effect.mapError((error) => storedFailure(row.metadata?.[KEY], error)))
}

function stopFix(tx: Sql, record: FixRunning, status: ReviewEngagementReportV2.Stopped,
  reason?: string, notExamined?: ReviewFixSchemaV2.FixResult["notExamined"]): Effect.Effect<FixTerminal, Tool.Failure> {
  const authority = { ...record, fix: record.fix }
  const terminal: FixTerminal = { ...record, state: "terminal", terminal: ReviewFixAuthorityV2.stopped(authority, status, reason, notExamined) }
  return write(tx, terminal, record).pipe(Effect.as(terminal))
}

function lookupRows(db: Pick<Sql, "select">, parent: SessionSchema.Info) {
  return db.select().from(SessionTable).where(and(eq(SessionTable.parent_id, parent.id),
    eq(SessionTable.project_id, parent.projectID), eq(SessionTable.directory, parent.location.directory),
    eq(SessionTable.agent, "lucy"), parent.location.workspaceID === undefined
      ? sql`${SessionTable.workspace_id} IS NULL` : eq(SessionTable.workspace_id, parent.location.workspaceID)))
    .all().pipe(Effect.orDie)
}

/** New durable integrity failures have evidence semantics; legacy admission/conflict behavior is preserved. */
function storedFailure(value: unknown, error: Tool.Failure): Tool.Failure {
  if (typeof value === "object" && value !== null && "schema" in value &&
    (value.schema === "review-engagement-state-v2" || value.schema === "review-engagement-state-v3" ||
      value.schema === "review-engagement-state-v4") &&
    (error.metadata?.reason === "engagement-record-invalid" || error.metadata?.reason === "engagement-report-invalid"))
    return failure("engagement-evidence-corrupt", "versioned evidence record is unavailable or corrupt")
  return error
}

function context(record: Common): ReviewEngagementReportV2.Context {
  return { input: record.input, inputHash: record.identity.inputHash, sessionID: record.identity.leadID,
    budget: record.budget, ...(record.source ? { source: record.source } : {}) }
}

function matchesResult(record: Common, result: ReviewEngagementReportV2.Stored) {
  const value = result.value
  return value.inputHash === record.identity.inputHash && value.requestID === record.input.requestID &&
    value.sessionID === record.identity.leadID && same(value.budget, record.budget) &&
    same(value.source ?? null, record.source ?? null) && (value.report === undefined || value.report.profile === record.input.profile)
    ? Effect.void : Effect.fail(invalid("terminal result does not match durable admission"))
}

function normalizeModel(model: SessionSchema.Info["model"] | Row["model"], legacy = false): typeof Model.Type | null {
  if (!model) return null
  const variant = legacy ? model.variant ?? "default" : model.variant
  return { id: model.id, providerID: model.providerID, ...(variant === undefined ? {} : { variant }) }
}

function validateCapture(input: ReviewEngagementPolicyV2.Input, source: ReviewEngagementEvidenceV2.Prepared) {
  ReviewEngagementReportV2.validateSource(source)
  const paths = [...source.files, ...source.notExamined].map((entry) => entry.path)
  const prefixes = input.paths ?? ["."]
  const covers = (prefix: string, file: string) => prefix === "." || file === prefix || file.startsWith(prefix + "/")
  if (source.revision !== (input.revision ?? "HEAD") || paths.some((file) => !prefixes.some((prefix) => covers(prefix, file))) ||
    prefixes.some((prefix) => !paths.some((file) => covers(prefix, file)))) throw new Error("capture differs from accepted input")
}

function placed(row: Placement, id: Identity) {
  return row.project_id === id.projectID && row.directory === id.location.directory &&
    (row.workspace_id ?? undefined) === id.location.workspaceID
}

function verifySession(row: Row, id: Identity, parentID: SessionSchema.ID, model: typeof Model.Type | null | undefined) {
  return placed(row, id) && row.parent_id === parentID && row.agent === "lucy" &&
    same(normalizeModel(row.model), model ?? null) && row.time_archived === null && row.revert === null
    ? Effect.void : Effect.fail(invalid("child Session identity mismatch"))
}

/** Re-check after native create: an existing ID is not proof that this request owns its contents. */
function pristine(db: Sql, row: Row) {
  return Effect.gen(function* () {
    // SQL NULL is the pristine default. JSON null/scalars cannot accept json_set's owned object member.
    const stored = yield* db.select({ kind: sql<string | null>`json_type(${SessionTable.metadata})` })
      .from(SessionTable).where(eq(SessionTable.id, row.id)).get().pipe(Effect.orDie)
    if (!stored || stored.kind !== null && stored.kind !== "object") return yield* invalid("Session metadata is not an object")
    if (row.metadata?.[KEY] !== undefined || row.metadata?.[SessionScope.KEY] !== undefined || row.permission !== null ||
      row.revert !== null || row.time_archived !== null || row.time_compacting !== null || row.subagent_models !== null ||
      row.cost !== 0 || row.tokens_input !== 0 || row.tokens_output !== 0 || row.tokens_reasoning !== 0 ||
      row.tokens_cache_read !== 0 || row.tokens_cache_write !== 0)
      return yield* invalid("unclaimed Session is not pristine")
    const checks = [
      db.select({ id: SessionMessageTable.id }).from(SessionMessageTable).where(eq(SessionMessageTable.session_id, row.id)).limit(1).all()
        .pipe(Effect.map((rows) => rows.length > 0), Effect.orDie),
      db.select({ id: SessionInputTable.id }).from(SessionInputTable).where(eq(SessionInputTable.session_id, row.id)).limit(1).all()
        .pipe(Effect.map((rows) => rows.length > 0), Effect.orDie),
      db.select({ id: MessageTable.id }).from(MessageTable).where(eq(MessageTable.session_id, row.id)).limit(1).all()
        .pipe(Effect.map((rows) => rows.length > 0), Effect.orDie),
      db.select({ id: PartTable.id }).from(PartTable).where(eq(PartTable.session_id, row.id)).limit(1).all()
        .pipe(Effect.map((rows) => rows.length > 0), Effect.orDie),
      db.select({ id: SessionContextEpochTable.session_id }).from(SessionContextEpochTable).where(eq(SessionContextEpochTable.session_id, row.id)).limit(1).all()
        .pipe(Effect.map((rows) => rows.length > 0), Effect.orDie),
      db.select({ id: SessionTable.id }).from(SessionTable).where(eq(SessionTable.parent_id, row.id)).limit(1).all()
        .pipe(Effect.map((rows) => rows.length > 0), Effect.orDie),
    ]
    for (const check of checks) if (yield* check) return yield* invalid("unclaimed Session has foreign activity")
  })
}

function write(db: Sql, record: Record | FixRecord, previous?: Running | FixRunning) {
  return Effect.gen(function* () {
    const data = record.state === "terminal" ? (() => {
      const { terminal, ...value } = record
      return { ...value, output: terminal.text }
    })() : record
    const changed = yield* db.update(SessionTable).set({
      metadata: sql`json_set(coalesce(${SessionTable.metadata}, '{}'), ${`$.${KEY}`}, json(${JSON.stringify(data)}))`,
      time_updated: sql`${SessionTable.time_updated}`,
    }).where(and(eq(SessionTable.id, record.identity.leadID),
      sql`(${SessionTable.metadata} IS NULL OR json_type(${SessionTable.metadata}) = 'object')`, previous
      ? and(sql`json_extract(${SessionTable.metadata}, ${`$.${KEY}.owner`}) = ${previous.owner}`,
        sql`json_extract(${SessionTable.metadata}, ${`$.${KEY}.state`}) = 'running'`,
        previous.schema === "review-engagement-state-v4"
          ? sql`json_extract(${SessionTable.metadata}, ${`$.${KEY}.schema`}) = 'review-engagement-state-v4'`
          : undefined)
      : sql`json_type(${SessionTable.metadata}, ${`$.${KEY}`}) IS NULL`))
      .returning({ id: SessionTable.id }).all().pipe(Effect.orDie)
    if (changed.length !== 1) return yield* failure("engagement-owner-lost", "durable compare-and-set refused")
  })
}

function common(record: Terminal): Common {
  const { state, terminal, ...value } = record
  return value
}

function reservationIdentity(value: ReviewVariantSchemaV2.ReservationIdentity): ReviewVariantSchemaV2.ReservationIdentity {
  return { generationID: value.generationID, ordinal: value.ordinal, sourceSha256: value.sourceSha256,
    seed: value.seed, reservedAt: value.reservedAt, proposalKey: value.proposalKey }
}

/** Structural owner-state checks only. Required bodies and native proof are validated before the sealed CAS. */
function validateJournal(record: Extract<Common, { readonly schema: "review-engagement-state-v3" }>, completed = false) {
  const journal = record.variants
  if (journal.limit !== (record.input.profile === "audit" ? 3 : 0) || journal.reservations.length > journal.limit ||
    completed && journal.phase !== "closed") throw corrupt("variant journal policy or phase differs")
  for (const [index, entry] of journal.reservations.entries()) {
    const previous = journal.reservations[index - 1]
    if (!record.source || entry.ordinal !== index + 1 || entry.sourceSha256 !== record.source.sha256 ||
      entry.reservedAt < record.budget.startedAt || entry.reservedAt >= record.budget.deadlineAt ||
      entry.proposalKey !== `variant:${entry.ordinal}:proposal` || entry.generationID !== ReviewVariantSchemaV2.generationID({
        namespace: record.identity.key, inputHash: record.identity.inputHash, sourceSha256: record.source.sha256,
        ordinal: entry.ordinal, seedID: entry.seed.seedID,
      }) || previous && (previous.status !== "settled" || previous.settlement.decision.type !== "continue" ||
        !same(previous.settlement.decision.nextSeed, entry.seed))) throw corrupt("variant reservation identity or lineage differs")
    if (entry.status === "reserved") {
      if (index !== journal.reservations.length - 1) throw corrupt("variant journal has a nonfinal pending reservation")
      continue
    }
    validateSettlement(entry.ordinal, entry.settlement)
  }
  if (journal.phase !== "closed") return
  const last = journal.reservations.at(-1)
  if (last) {
    if (last.status !== "settled" || last.settlement.decision.type !== "stop" || last.settlement.decision.reason !== journal.stop)
      throw corrupt("closed variant journal has no matching settled stop")
    return
  }
  if (record.input.profile !== "audit" ? journal.stop !== "not-applicable"
    : journal.stop !== "no-confirmed-seed" && journal.stop !== "independent-verification-unavailable")
    throw corrupt("zero-generation journal has an invalid eligibility stop")
}

function validateSettlement(ordinal: ReviewVariantSchemaV2.Ordinal,
  value: Extract<ReviewVariantSchemaV2.Reservation, { readonly status: "settled" }>["settlement"]) {
  const decision = value.decision
  const counts = value.counts
  if (counts && (counts.matches > 200 || counts.matches !== counts.confirmed + counts.noise + counts.questions + counts.notExamined))
    throw corrupt("variant settlement has invalid counts")
  if (decision.type === "continue") {
    if (!counts || ordinal === 3 || counts.confirmed === 0 || counts.questions || counts.notExamined || counts.noise * 2 >= counts.matches)
      throw corrupt("variant settlement cannot continue")
    return
  }
  if ((decision.reason === "stage-invalid") !== (decision.detail !== undefined)) throw corrupt("variant stop detail differs")
  if (!counts) {
    if (decision.reason !== "stage-invalid" && decision.reason !== "search-unavailable" && decision.reason !== "search-incomplete" && decision.reason !== "seed-not-matched")
      throw corrupt("variant stop without counts is not a rejected witness")
    return
  }
  if (decision.reason === "stage-invalid") {
    if (counts.notExamined !== counts.matches) throw corrupt("invalid proposal discarded examined matches")
    return
  }
  const expected = counts.questions || counts.notExamined ? "verification-incomplete" : counts.matches === 0 ? "no-new-matches"
    : counts.noise * 2 >= counts.matches ? "half-noise" : ordinal === 3 ? "generation-limit" : undefined
  if (!expected || decision.reason !== expected) throw corrupt("variant stop differs from bounded accounting")
}
