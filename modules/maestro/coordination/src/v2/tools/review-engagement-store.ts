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
const StoredRecord = Schema.Struct({
  schema: Schema.Literal("review-engagement-state-v1"), identity: IdentitySchema,
  input: ReviewEngagementPolicyV2.Input, owner: Schema.NonEmptyString, model: Schema.optional(Model),
  budget: ReviewEngagementReportV2.Budget, source: Schema.optional(ReviewEngagementReportV2.Source),
  children: Schema.Array(ChildSchema), state: Schema.Literals(["running", "terminal"]), output: Schema.optional(Schema.String),
})
type Common = Omit<typeof StoredRecord.Type, "schema" | "state" | "output">
export type Running = Common & { readonly state: "running" }
export type Terminal = Common & { readonly state: "terminal"; readonly terminal: ReviewEngagementReportV2.Stored }
export type Record = Running | Terminal
export type Ticket = { readonly identity: Identity; readonly owner: string }
export type Outcome = { readonly status: "completed"; readonly result: ReviewEngagementReportV2.Stored } |
  { readonly status: ReviewEngagementReportV2.Stopped; readonly reason?: string }
export type Interface = {
  readonly read: (identity: Identity) => Effect.Effect<Record | undefined, Tool.Failure>
  readonly admit: (identity: Identity, input: ReviewEngagementPolicyV2.Input, owner: string,
    model?: SessionSchema.Info["model"]) => Effect.Effect<Record, Tool.Failure>
  readonly capture: (ticket: Ticket, source: ReviewEngagementEvidenceV2.Prepared) => Effect.Effect<Record, Tool.Failure>
  readonly own: (ticket: Ticket, child: Child) => Effect.Effect<Record, Tool.Failure>
  readonly finish: (ticket: Ticket, outcome: Outcome) => Effect.Effect<Terminal, Tool.Failure>
}
type Sql = Pick<Database.Interface["db"], "select" | "update">
type Row = typeof SessionTable.$inferSelect

const same = (left: unknown, right: unknown) => ReviewEngagementReportV2.canonical(left) === ReviewEngagementReportV2.canonical(right)
const failure = (reason: string, detail: string) => new Tool.Failure({ message: `${reason}: ${detail}`, metadata: { reason } })
const invalid = (detail: string) => failure("engagement-record-invalid", detail)

export function identity(parent: SessionSchema.Info, input: ReviewEngagementPolicyV2.Input): Identity {
  const location = { directory: parent.location.directory,
    ...(parent.location.workspaceID === undefined ? {} : { workspaceID: parent.location.workspaceID }) }
  const namespace = { domain: "review-engagement-namespace-v1", parentID: parent.id,
    projectID: parent.projectID, location, requestID: input.requestID }
  const key = ReviewEngagementReportV2.digest(namespace)
  return { key, leadID: SessionSchema.ID.make(`ses_lucy_engagement_${ReviewEngagementReportV2.digest({ key, role: "lead" })}`),
    parentID: parent.id, projectID: parent.projectID, location, requestID: input.requestID,
    inputHash: ReviewEngagementReportV2.digest(input) }
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
  const stop = (tx: Sql, record: Running, status: ReviewEngagementReportV2.Stopped, reason?: string) => {
    const terminal: Terminal = { ...record, state: "terminal", terminal: ReviewEngagementReportV2.terminal(context(record), status, reason) }
    return write(tx, terminal, record).pipe(Effect.as(terminal))
  }
  return {
    read: (id) => Effect.gen(function* () {
      const row = yield* load(database.db, id.leadID)
      return row ? yield* decode(row, id) : undefined
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
      const record: Running = { identity: id, input, owner, ...(model ? { model } : {}),
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
      yield* pristine(tx, row)
      const next: Running = { ...record, children: [...record.children, child] }
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
      const terminal: Terminal = { ...record, state: "terminal", terminal: result }
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

function decode(row: Row, expected: Identity): Effect.Effect<Record | undefined, Tool.Failure> {
  return Effect.gen(function* () {
    if (!placed(row, expected) || row.id !== expected.leadID || row.parent_id !== expected.parentID || row.agent !== "lucy")
      return yield* invalid("lead Session identity mismatch")
    const value = row.metadata?.[KEY]
    if (value === undefined) return undefined
    const data = yield* Effect.try({
      try: () => Schema.decodeUnknownSync(StoredRecord)(value, strict), catch: (error) => invalid(String(error)),
    })
    if (data.identity.inputHash !== expected.inputHash)
      return yield* failure("engagement-request-conflict", "request ID already owns a different accepted input")
    if (!same(data.identity, expected) || ReviewEngagementReportV2.digest(data.input) !== expected.inputHash ||
      data.input.requestID !== expected.requestID || data.input.profile === "compliance" || data.input.fixReview !== undefined ||
      !same(normalizeModel(row.model), data.model ?? null) ||
      data.budget.deadlineAt - data.budget.startedAt !== data.input.timeBoxMinutes * 60_000 ||
      !Number.isSafeInteger(data.budget.startedAt) || !Number.isSafeInteger(data.budget.deadlineAt) ||
      new Set(data.children.map((child) => child.id)).size !== data.children.length ||
      new Set(data.children.map((child) => child.key)).size !== data.children.length ||
      !data.children.some((child) => child.id === expected.leadID && child.key === "lead" && child.role === "lead"))
      return yield* invalid("durable admission identity mismatch")
    const source = data.source
    if (source) yield* Effect.try({ try: () => validateCapture(data.input, source), catch: (error) => invalid(String(error)) })
    const { schema, state, output, ...common } = data
    if (state === "running") {
      if (output !== undefined) return yield* invalid("unfinished record has terminal bytes")
      return { ...common, state }
    }
    if (output === undefined) return yield* invalid("terminal bytes are missing")
    const terminal = yield* ReviewEngagementReportV2.read(output)
    yield* matchesResult(common, terminal)
    return { ...common, state, terminal }
  })
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

function normalizeModel(model: SessionSchema.Info["model"] | Row["model"]): typeof Model.Type | null {
  if (!model) return null
  return { id: model.id, providerID: model.providerID, variant: model.variant ?? "default" }
}

function validateCapture(input: ReviewEngagementPolicyV2.Input, source: ReviewEngagementEvidenceV2.Prepared) {
  ReviewEngagementReportV2.validateSource(source)
  const paths = [...source.files, ...source.notExamined].map((entry) => entry.path)
  const prefixes = input.paths ?? ["."]
  const covers = (prefix: string, file: string) => prefix === "." || file === prefix || file.startsWith(prefix + "/")
  if (source.revision !== (input.revision ?? "HEAD") || paths.some((file) => !prefixes.some((prefix) => covers(prefix, file))) ||
    prefixes.some((prefix) => !paths.some((file) => covers(prefix, file)))) throw new Error("capture differs from accepted input")
}

function placed(row: Row, id: Identity) {
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

function write(db: Sql, record: Record, previous?: Running) {
  return Effect.gen(function* () {
    const { state, ...rest } = record
    const data = state === "terminal"
      ? { schema: "review-engagement-state-v1", ...common(record), state, output: record.terminal.text }
      : { schema: "review-engagement-state-v1", ...rest, state }
    const changed = yield* db.update(SessionTable).set({
      metadata: sql`json_set(coalesce(${SessionTable.metadata}, '{}'), ${`$.${KEY}`}, json(${JSON.stringify(data)}))`,
      time_updated: sql`${SessionTable.time_updated}`,
    }).where(and(eq(SessionTable.id, record.identity.leadID),
      sql`(${SessionTable.metadata} IS NULL OR json_type(${SessionTable.metadata}) = 'object')`, previous
      ? and(sql`json_extract(${SessionTable.metadata}, ${`$.${KEY}.owner`}) = ${previous.owner}`,
        sql`json_extract(${SessionTable.metadata}, ${`$.${KEY}.state`}) = 'running'`)
      : sql`json_type(${SessionTable.metadata}, ${`$.${KEY}`}) IS NULL`))
      .returning({ id: SessionTable.id }).all().pipe(Effect.orDie)
    if (changed.length !== 1) return yield* failure("engagement-owner-lost", "durable compare-and-set refused")
  })
}

function common(record: Terminal): Common {
  const { state, terminal, ...value } = record
  return value
}
