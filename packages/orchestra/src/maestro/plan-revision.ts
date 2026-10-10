import { Database } from "@orchestra/core/database/database"
import { EventV2 } from "@orchestra/core/event"
import { EventTable } from "@orchestra/core/event/sql"
import { MaestroEvent } from "@orchestra/schema/maestro-event"
import { createHash } from "node:crypto"
import { isDeepStrictEqual } from "node:util"
import { eq } from "drizzle-orm"
import { Effect, Schema } from "effect"
import { RelayArm } from "@orchestra/schema/relay-arm"
import { RelayWorkflowBinding } from "@orchestra/core/relay-workflow-binding"
import { EventV2Bridge } from "@/event-v2-bridge"
import { readAdmission } from "./admission-record"
import { readAtlasSource, AtlasContextHeld } from "./atlas-source"
import { compileContextToolPlan } from "./context-tool-plan"
import { Session } from "@/session/session"
import { SessionID } from "@/session/schema"
import { UpstreamAttribution } from "@orchestra/schema/upstream-attribution"
import { UpstreamProvenance } from "./upstream-provenance"

type LegacyRevisionData = Schema.Schema.Type<typeof MaestroEvent.PlanRevision.Recorded.data>
type RevisionData = LegacyRevisionData | Schema.Schema.Type<typeof MaestroEvent.PlanRevision.RecordedV2.data> |
  Schema.Schema.Type<typeof MaestroEvent.PlanRevision.RecordedV3.data>

// Decode the upstream-owned canonical V3 and verify its existing content hash. Legacy sources stay unchanged.
export interface WorkflowRevision {
  readonly id: EventV2.ID
  readonly sessionID: string
  readonly revisionHash: string
  readonly workflowBinding: RelayArm.WorkflowDefinition
}
export const readWorkflowRevision = Effect.fn("MaestroPlanRevision.readWorkflow")(function* (id: string) {
  const database = yield* Database.Service
  const row = yield* database.db.select().from(EventTable).where(eq(EventTable.id, EventV2.ID.make(id))).get().pipe(Effect.orDie)
  if (!row || row.type !== EventV2.versionedType(MaestroEvent.PlanRevision.Recorded.type, 3))
    return yield* new RelayWorkflowBinding.Held({ reason: "WORKFLOW_PLAN_REVISION_MISSING" })
  const revision = yield* decodeV3(row.data)
  if (revision.id !== row.id || revision.sessionID !== row.aggregate_id)
    return yield* new RelayWorkflowBinding.Held({ reason: "WORKFLOW_PLAN_REVISION_MISMATCH" })
  if (!revision.workflowBinding) return yield* new RelayWorkflowBinding.Held({ reason: "WORKFLOW_PLAN_BINDING_MISSING" })
  return { ...revision, id: row.id, workflowBinding: revision.workflowBinding }
})

// Called by the final canonical V3 producer with host-observed attribution already in fields. Preserve the existing
// stable/SHA-256 algorithm, and keep the resulting Event.ID outside its own revision body.
export function workflowRevisionBody(fields: Readonly<Record<string, unknown>>, workflowBinding: RelayArm.WorkflowDefinition) {
  const { id, revisionHash, createdAt, ...input } = fields
  const body = { ...input, revision: "v3", workflowBinding }
  return { ...body, id: EventV2.ID.make(`evt_maestro_plan_revision_${hash(body)}`),
    revisionHash: hash(body), createdAt: createdAt ?? Date.now() }
}

export type RecordPlanRevisionInput = Omit<
  Schema.Schema.Type<typeof MaestroEvent.PlanRevision.RecordedV3.data>,
  "id" | "revisionHash" | "createdAt" | "status" | "revision" | "upstreamAttribution" | "workflowBinding" | "grounding"
> & { units?: readonly string[];
  upstream?: Pick<UpstreamAttribution.V1, "parentMessageID" | "parentCallID" | "authorSessionID" | "authorMessageID" | "logicalTaskID">;
  workflow?: { port: RelayWorkflowBinding.PublicationPort; documentID: string; parameters: Readonly<Record<string, string>>; writePaths: readonly string[] }
}

// Revision identity hashes the whole input, so in practice this conflict means the admission precondition failed.
export class PlanRevisionConflictError extends Schema.TaggedErrorClass<PlanRevisionConflictError>()(
  "MaestroPlanRevisionConflict",
  { sessionID: Schema.String, admissionMessageID: Schema.String, methodVersion: Schema.String },
) {
  override get message() {
    return `${this._tag}: admission message ${this.admissionMessageID} has no READY_TO_DRAFT admission recorded under admit-request-v1 in this Session. Plan only from the admission message ID of a READY_TO_DRAFT maestro_record_admission result with methodVersion "admit-request-v1".`
  }
}

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`
  if (value && typeof value === "object") {
    return `{${Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${stable(item)}`)
      .join(",")}}`
  }
  return JSON.stringify(value)
}

function hash(value: unknown) {
  return createHash("sha256").update(stable(value), "utf8").digest("hex")
}

function eventID(input: Pick<RecordPlanRevisionInput, "sessionID" | "admissionMessageID" | "methodVersion">) {
  return EventV2.ID.make(`evt_maestro_plan_revision_${hash(input)}`)
}

function wanted(input: RecordPlanRevisionInput): LegacyRevisionData {
  const { units, upstream, workflow, ...fields } = input
  const body = {
    ...fields,
    revision: "v1" as const,
    status: "PROPOSED" as const,
    contextRequirement: "PENDING" as const,
  }
  return Schema.decodeUnknownSync(MaestroEvent.PlanRevision.Recorded.data)({ ...body, id: eventID(input), revisionHash: hash(body), createdAt: Date.now() })
}

const decodeV3 = (data: unknown) => Schema.decodeUnknownEffect(MaestroEvent.PlanRevision.RecordedV3.data)(data, { onExcessProperty: "error" }).pipe(
  Effect.mapError(() => new RelayWorkflowBinding.Held({ reason: "WORKFLOW_PLAN_REVISION_INVALID" })),
  Effect.flatMap((revision) => {
    const { id, revisionHash, createdAt, ...body } = revision
    return hash(body) === revisionHash && id === `evt_maestro_plan_revision_${revisionHash}`
      ? Effect.succeed(revision) : Effect.fail(new RelayWorkflowBinding.Held({ reason: "WORKFLOW_PLAN_HASH_MISMATCH" }))
  }),
)

export const readPlanRevision = Effect.fn("MaestroPlanRevision.read")(function* (id: string) {
  if (!id.startsWith("evt_")) return undefined
  const { db } = yield* Database.Service
  const row = yield* db
    .select()
    .from(EventTable)
    .where(eq(EventTable.id, EventV2.ID.make(id)))
    .get()
    .pipe(Effect.orDie)
  if (!row) return undefined
  if (row.type === EventV2.versionedType(MaestroEvent.PlanRevision.RecordedV3.type, 3))
    return yield* decodeV3(row.data)
  if (row.type === EventV2.versionedType(MaestroEvent.PlanRevision.RecordedV2.type, 2)) {
    return Schema.decodeUnknownSync(MaestroEvent.PlanRevision.RecordedV2.data)(row.data)
  }
  if (row.type !== EventV2.versionedType(MaestroEvent.PlanRevision.Recorded.type, 1)) return undefined
  return Schema.decodeUnknownSync(MaestroEvent.PlanRevision.Recorded.data)(row.data)
})

export const recordPlanRevision = Effect.fn("MaestroPlanRevision.record")(function* (input: RecordPlanRevisionInput) {
  const admission = yield* readAdmission({
    sessionID: input.sessionID,
    messageID: input.admissionMessageID,
    methodVersion: "admit-request-v1",
  })
  if (!admission || admission.outcome !== "READY_TO_DRAFT") {
    return yield* new PlanRevisionConflictError(input)
  }
  if (!input.upstream && [input.goal, input.reviewRequirement, ...input.acceptance, ...input.scope,
    ...input.constraints, ...input.assumptions, ...input.risks].some((field) => field.source === "upstream"))
    return yield* new RelayWorkflowBinding.Held({ reason: "UPSTREAM_ATTRIBUTION_MISSING" })
  if (input.workflow || input.upstream) {
    const sessions = yield* Session.Service
    const session = yield* sessions.get(SessionID.make(input.sessionID))
    if (!input.upstream) return yield* new RelayWorkflowBinding.Held({ reason: "UPSTREAM_ATTRIBUTION_MISSING" })
    const upstreamAttribution = yield* UpstreamProvenance.observe({ ...input.upstream,
      parentSessionID: session.id, projectID: session.projectID }).pipe(
      Effect.mapError((error) => new RelayWorkflowBinding.Held({ reason: "code" in error ? error.code : error.reason })),
    )
    const materialized = input.workflow ? yield* RelayWorkflowBinding.acquire({ ...input.workflow,
      projectID: input.workflow.port.projectID }) : undefined
    if (materialized && materialized.definition.publication.projectID !== session.projectID)
      return yield* new RelayWorkflowBinding.Held({ reason: "WORKFLOW_PUBLICATION_PROJECT_MISMATCH" })
    const source = input.units ? yield* readAtlasSource(session) : undefined
    const { upstream, workflow, units, ...fields } = input
    const body = { ...fields, revision: "v3" as const, status: "PROPOSED" as const, upstreamAttribution,
      ...(materialized ? { workflowBinding: materialized.definition } : {}),
      ...(source && units ? { grounding: { catalogVersion: source.context.catalogVersion,
        snapshot: source.context.snapshot, sourceRevision: source.context.sourceRevision,
        sourceIdentityHash: source.identityHash, units: [...units] } } : {}),
    }
    const next = Schema.decodeUnknownSync(MaestroEvent.PlanRevision.RecordedV3.data)({ ...body,
      id: `evt_maestro_plan_revision_${hash(body)}`, revisionHash: hash(body), createdAt: Date.now() })
    if (source && next.grounding) {
      const compiled = compileContextToolPlan({ actor: { projectId: session.projectID, sessionId: session.id, memberId: "maestro" },
        revision: { id: next.id, hash: next.revisionHash, projectId: session.projectID, sessionId: session.id },
        territories: next.scope.map((field) => field.value), units: next.grounding.units, context: source.context })
      if (compiled.status === "HOLD") return yield* new AtlasContextHeld({ reason: compiled.reason, evidence: compiled.evidence })
    }
    const existing = yield* readPlanRevision(next.id)
    if (existing) {
      if (isDeepStrictEqual({ ...existing, createdAt: 0 }, { ...next, createdAt: 0 })) return existing
      return yield* new PlanRevisionConflictError(input)
    }
    const events = yield* EventV2Bridge.Service
    return (yield* events.publish(MaestroEvent.PlanRevision.RecordedV3, next, { id: EventV2.ID.make(next.id) })).data
  }
  const legacy = wanted(input)
  const units = input.units
  const next: RevisionData = units
    ? yield* Effect.gen(function* () {
        const sessions = yield* Session.Service
        const session = yield* sessions.get(SessionID.make(input.sessionID))
        const source = yield* readAtlasSource(session)
        const grounding = {
          catalogVersion: source.context.catalogVersion,
          snapshot: source.context.snapshot,
          sourceRevision: source.context.sourceRevision,
          sourceIdentityHash: source.identityHash,
          units: [...units],
        }
        const { id, revisionHash, createdAt, ...fields } = legacy
        const body = { ...fields, revision: "v2" as const, grounding }
        const proposed = {
          ...body,
          id: EventV2.ID.make(`evt_maestro_plan_revision_${hash(body)}`),
          revisionHash: hash(body),
          createdAt,
        }
        const compiled = compileContextToolPlan({
          actor: { projectId: session.projectID, sessionId: session.id, memberId: "maestro" },
          revision: {
            id: proposed.id,
            hash: proposed.revisionHash,
            projectId: session.projectID,
            sessionId: session.id,
          },
          territories: proposed.scope.map((field) => field.value),
          units: grounding.units,
          context: source.context,
        })
        if (compiled.status === "HOLD")
          return yield* new AtlasContextHeld({ reason: compiled.reason, evidence: compiled.evidence })
        return proposed
      })
    : legacy
  const existing = yield* readPlanRevision(next.id)
  if (existing) {
    if (isDeepStrictEqual({ ...existing, createdAt: 0 }, { ...next, createdAt: 0 })) return existing
    return yield* new PlanRevisionConflictError(input)
  }
  const events = yield* EventV2Bridge.Service
  const recorded =
    next.revision === "v2"
      ? yield* events.publish(MaestroEvent.PlanRevision.RecordedV2, next, { id: EventV2.ID.make(next.id) })
      : yield* events.publish(MaestroEvent.PlanRevision.Recorded, next, { id: EventV2.ID.make(next.id) })
  return recorded.data
})
