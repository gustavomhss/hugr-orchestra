export * as GovernanceRecordsV2 from "./records"

import { createHash } from "node:crypto"
import { eq } from "drizzle-orm"
import { Effect, Option, Schema } from "effect"
import type { Database } from "@orchestra/core/database/database"
import { EventV2 } from "@orchestra/core/event"
import { RelayWorkflowBinding } from "@orchestra/core/relay-workflow-binding"
import { MaestroEvent } from "@orchestra/schema/maestro-event"

// Read-only governed-chain record readers. They read the legacy event rows as written, by id and versioned
// type, and never write; a row of another type or shape reads as absent.

type Db = Database.Interface["db"]

export type Context =
  | (Schema.Schema.Type<typeof MaestroEvent.Context.Recorded.data> & { readonly mode: "UNGROUNDED" })
  | Schema.Schema.Type<typeof MaestroEvent.Context.RecordedV2.data>

export function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`
  if (value && typeof value === "object") {
    return `{${Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${stable(item)}`)
      .join(",")}}`
  }
  return JSON.stringify(value)
}

export function hash(value: unknown) {
  return createHash("sha256").update(stable(value), "utf8").digest("hex")
}

/** The event row with `id`, or undefined when `id` cannot name an event. */
export const row = Effect.fn("GovernanceRecordsV2.row")(function* (db: Db, id: string) {
  if (!id.startsWith("evt_")) return undefined
  return yield* db
    .select()
    .from(EventV2.EventTable)
    .where(eq(EventV2.EventTable.id, EventV2.ID.make(id)))
    .get()
    .pipe(Effect.orDie)
})

/** A grant recorded before the backend seat's rename routes to its former id; it is read under `canonical`. */
export const readAuthorization = Effect.fn("GovernanceRecordsV2.readAuthorization")(function* (
  db: Db,
  id: string,
  canonical: (id: string) => string,
) {
  const found = yield* row(db, id)
  if (!found || found.type !== EventV2.versionedType(MaestroEvent.Authorization.Granted.type, 1)) return undefined
  const data = Schema.decodeUnknownSync(MaestroEvent.Authorization.Granted.data)(found.data)
  return { id: found.id, ...data, routedMemberID: canonical(data.routedMemberID) }
})

export const readValidation = Effect.fn("GovernanceRecordsV2.readValidation")(function* (db: Db, id: string) {
  const found = yield* row(db, id)
  if (!found) return undefined
  if (found.type === EventV2.versionedType(MaestroEvent.Validation.RecordedV3.type, 3))
    return { id: found.id, ...Schema.decodeUnknownSync(MaestroEvent.Validation.RecordedV3.data)(found.data) }
  if (found.type === EventV2.versionedType(MaestroEvent.Validation.RecordedV2.type, 2))
    return { id: found.id, ...Schema.decodeUnknownSync(MaestroEvent.Validation.RecordedV2.data)(found.data) }
  if (found.type === EventV2.versionedType(MaestroEvent.Validation.Recorded.type, 1))
    return { id: found.id, ...Schema.decodeUnknownSync(MaestroEvent.Validation.Recorded.data)(found.data) }
  return undefined
})

export const readContext = Effect.fn("GovernanceRecordsV2.readContext")(function* (db: Db, id: string) {
  const found = yield* row(db, id)
  if (!found) return undefined
  if (found.type === EventV2.versionedType(MaestroEvent.Context.RecordedV2.type, 2))
    return Schema.decodeUnknownSync(MaestroEvent.Context.RecordedV2.data)(found.data)
  if (found.type !== EventV2.versionedType(MaestroEvent.Context.Recorded.type, 1)) return undefined
  const legacy = Schema.decodeUnknownSync(MaestroEvent.Context.Recorded.data)(found.data)
  if (legacy.mode !== "UNGROUNDED") return undefined
  return { ...legacy, mode: "UNGROUNDED" as const }
})

const decodeV3 = Schema.decodeUnknownOption(MaestroEvent.PlanRevision.RecordedV3.data)

/** A v3 revision reads only when it decodes closed and its id and hash still bind its body. */
export const readPlanRevision = Effect.fn("GovernanceRecordsV2.readPlanRevision")(function* (db: Db, id: string) {
  const found = yield* row(db, id)
  if (!found) return undefined
  if (found.type === EventV2.versionedType(MaestroEvent.PlanRevision.RecordedV3.type, 3)) {
    const revision = decodeV3(found.data, { onExcessProperty: "error" })
    if (Option.isNone(revision)) return undefined
    const { id: revisionID, revisionHash, createdAt, ...body } = revision.value
    return hash(body) === revisionHash && revisionID === `evt_maestro_plan_revision_${revisionHash}`
      ? revision.value
      : undefined
  }
  if (found.type === EventV2.versionedType(MaestroEvent.PlanRevision.RecordedV2.type, 2))
    return Schema.decodeUnknownSync(MaestroEvent.PlanRevision.RecordedV2.data)(found.data)
  if (found.type !== EventV2.versionedType(MaestroEvent.PlanRevision.Recorded.type, 1)) return undefined
  return Schema.decodeUnknownSync(MaestroEvent.PlanRevision.Recorded.data)(found.data)
})

/**
 * The workflow-bound v3 revision a workflow Task runs, as the earlier runtime's `readWorkflowRevision` reads it: anything but a v3 row
 * of this id holds as missing, a body that does not decode closed or whose hash no longer binds it holds, a row whose
 * body names another id or Session holds, and a v3 revision without a workflow binding holds.
 */
export const readWorkflowRevision = Effect.fn("GovernanceRecordsV2.readWorkflowRevision")(function* (db: Db, id: string) {
  const found = yield* row(db, id)
  if (!found || found.type !== EventV2.versionedType(MaestroEvent.PlanRevision.RecordedV3.type, 3))
    return yield* new RelayWorkflowBinding.Held({ reason: "WORKFLOW_PLAN_REVISION_MISSING" })
  const revision = decodeV3(found.data, { onExcessProperty: "error" })
  if (Option.isNone(revision)) return yield* new RelayWorkflowBinding.Held({ reason: "WORKFLOW_PLAN_REVISION_INVALID" })
  const { id: revisionID, revisionHash, createdAt, ...body } = revision.value
  if (hash(body) !== revisionHash || revisionID !== `evt_maestro_plan_revision_${revisionHash}`)
    return yield* new RelayWorkflowBinding.Held({ reason: "WORKFLOW_PLAN_HASH_MISMATCH" })
  if (revisionID !== found.id || revision.value.sessionID !== found.aggregate_id)
    return yield* new RelayWorkflowBinding.Held({ reason: "WORKFLOW_PLAN_REVISION_MISMATCH" })
  const workflowBinding = revision.value.workflowBinding
  if (!workflowBinding) return yield* new RelayWorkflowBinding.Held({ reason: "WORKFLOW_PLAN_BINDING_MISSING" })
  return { ...revision.value, id: found.id, workflowBinding }
})
