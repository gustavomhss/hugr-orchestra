export * as WorkflowAdmissionV2 from "./workflow-admission"

import { isDeepStrictEqual } from "node:util"
import path from "node:path"
import { ToolFailure } from "@orchestra/llm"
import { and, desc, eq, inArray } from "drizzle-orm"
import { Effect, Option, Schema } from "effect"
import type { Database } from "@orchestra/core/database/database"
import { EventV2 } from "@orchestra/core/event"
import { FSUtil } from "@orchestra/core/fs-util"
import type { Location } from "@orchestra/core/location"
import { RelayWorkflowBinding } from "@orchestra/core/relay-workflow-binding"
import type { SessionSchema } from "@orchestra/core/session"
import { MaestroEvent } from "@orchestra/schema/maestro-event"
import { MaestroAtlasSourceV2 } from "../atlas-source"
import { WorkflowArmV2 } from "../workflow/arm"
import type { MaestroWorkflowHostV2 } from "../workflow/host"
import { WorkflowRecordsV2 } from "../workflow/records"
import { UpstreamProvenanceV2 } from "../workflow/upstream-provenance"
import type { GovernanceDispatchV2 } from "./dispatch"
import type { GovernanceInputV2 } from "./input"
import { LogicalTaskV2 } from "./logical-task"
import { GovernanceRecordsV2 } from "./records"
import { WriteRootsV2 } from "./write-roots"

// Workflow Task admission: a Task that names a workflow step runs exactly the approved plan revision's workflow, from the arm its
// Maestro armed, inside the approved writePaths. The approval itself is checked by the reservation it rides on.

export type Services = GovernanceDispatchV2.Services & { readonly location: Location.Interface }

const decodeBound = Schema.decodeUnknownSync(MaestroEvent.Task.WorkflowBound.data)

type Revision = Effect.Success<ReturnType<typeof GovernanceRecordsV2.readWorkflowRevision>>

/**
 * The checks before a workflow Task reserves its child: an approval binds it, its Maestro armed a completion contract
 * here, the revision it names is this Session's newest plan for this workflow, the Task passes exactly the approved
 * parameters and writePaths, the plan's upstream author still attributes it and its Atlas source is unchanged.
 */
export const before = Effect.fn("WorkflowAdmissionV2.before")(function* (
  services: Services & { readonly database: Database.Interface },
  input: { readonly task: GovernanceInputV2.Input; readonly workflow: NonNullable<GovernanceInputV2.Input["workflow"]>; readonly parent: SessionSchema.Info },
) {
  if (!input.task.governed && !input.task.authorizationID) return yield* hold("WORKFLOW_APPROVAL_BINDING_MISSING")
  const receipt = yield* WorkflowArmV2.receipt(services.database, {
    sessionID: input.parent.id,
    directory: services.location.directory,
    projectID: input.parent.projectID,
  })
  if (!receipt)
    return yield* hold(
      "WORKFLOW_NATIVE_ARM_UNBOUND",
      "No armed completion contract is bound for this workflow Task. Arm it first with relay-arm action arm, with a contract of only sessionID (this Session) and a label naming this Task, without chain (the host arms the approved plan's own checks), then dispatch the Task with the approved workflow and writePaths; nothing was dispatched.",
    )
  const revision = yield* GovernanceRecordsV2.readWorkflowRevision(services.db, input.workflow.planRevisionID).pipe(
    Effect.mapError(held),
  )
  if (
    revision.sessionID !== input.parent.id ||
    revision.workflowBinding.publication.projectID !== input.parent.projectID ||
    revision.workflowBinding.publication.documentID !== input.workflow.documentID
  )
    return yield* hold("WORKFLOW_PLAN_REVISION_MISMATCH")
  if (!isDeepStrictEqual(revision.workflowBinding.parameters, input.workflow.parameters))
    return yield* hold(
      "WORKFLOW_APPROVED_SCOPE_MISMATCH",
      `Plan revision ${revision.id} approved workflow parameters ${JSON.stringify(revision.workflowBinding.parameters)}; this Task passed ${JSON.stringify(input.workflow.parameters)}. Retry with exactly the approved parameters.`,
    )
  const writePaths = input.task.writePaths ?? []
  if (!isDeepStrictEqual(revision.workflowBinding.writePaths, writePaths))
    return yield* hold(
      "WORKFLOW_APPROVED_SCOPE_MISMATCH",
      `Plan revision ${revision.id} approved writePaths ${JSON.stringify(revision.workflowBinding.writePaths)}; this Task passed ${JSON.stringify(writePaths)}. Retry with exactly the approved writePaths, in the same order.`,
    )
  const newest = yield* services.db
    .select({ id: EventV2.EventTable.id })
    .from(EventV2.EventTable)
    .where(
      and(
        eq(EventV2.EventTable.aggregate_id, input.parent.id),
        inArray(
          EventV2.EventTable.type,
          [1, 2, 3].map((version) => EventV2.versionedType(MaestroEvent.PlanRevision.Recorded.type, version)),
        ),
      ),
    )
    .orderBy(desc(EventV2.EventTable.seq))
    .get()
    .pipe(Effect.orDie)
  if (newest?.id !== revision.id) return yield* hold("WORKFLOW_PLAN_REVISION_STALE")
  yield* upstream(services, revision)
  if (!revision.grounding) return { revision, token: receipt.token }
  const source = yield* MaestroAtlasSourceV2.read(services.atlas, {
    projectID: input.parent.projectID,
    directory: services.location.directory,
  }).pipe(Effect.mapError(() => hold("WORKFLOW_CONTEXT_SOURCE_STALE")))
  if (source.identityHash !== revision.grounding.sourceIdentityHash) return yield* hold("WORKFLOW_CONTEXT_SOURCE_STALE")
  return { revision, token: receipt.token }
})

/**
 * V1's verifyUpstream: the upstream attribution a v3 revision recorded still observes from stored host facts, the
 * same in every field; the approval and every Task turn of a workflow plan run it.
 */
export const upstream = Effect.fn("WorkflowAdmissionV2.upstream")(function* (
  services: Pick<Services, "db" | "events" | "store">,
  revision: Pick<Revision, "upstreamAttribution" | "workflowBinding">,
) {
  const attribution = revision.upstreamAttribution
  if (!attribution) return yield* hold("UPSTREAM_ATTRIBUTION_MISSING")
  if (revision.workflowBinding.publication.projectID !== attribution.projectID)
    return yield* hold("UPSTREAM_ATTRIBUTION_PROJECT_MISMATCH")
  const observed = yield* UpstreamProvenanceV2.observe(services, {
    ...attribution,
    dispatchKind: attribution.schema === "maestro-upstream-attribution-v2" ? attribution.dispatch.kind : undefined,
  }).pipe(Effect.mapError((error) => hold(error.code, error.message)))
  if (!isDeepStrictEqual(observed, attribution)) return yield* hold("UPSTREAM_ATTRIBUTION_TASK_MISMATCH")
})

/**
 * The workflow binding a reserved child takes and its adoption by the workflow host. A continuation resumes an
 * authorized child that already holds this binding; it must have changed nothing outside the approved writePaths
 * since the approved context. Without a workflow host in this process the Task is refused, never run unbound.
 */
export const admit = Effect.fn("WorkflowAdmissionV2.admit")(function* (
  services: Services & { readonly canonical: (id: string) => string },
  input: {
    readonly host: Option.Option<MaestroWorkflowHostV2.Interface>
    readonly revision: Revision
    readonly token: string
    readonly parentID: SessionSchema.ID
    readonly childID: SessionSchema.ID
    readonly governed: boolean
    readonly authorizationID?: string
    readonly call: { readonly assistantMessageID: string; readonly toolCallID: string }
    readonly continuation: boolean
  },
) {
  if (Option.isNone(input.host)) return yield* hold("WORKFLOW_HOST_UNAVAILABLE")
  const bound = decodeBound({
    executionSessionID: input.childID,
    authorityMessageID: input.call.assistantMessageID,
    authorityCallID: input.call.toolCallID,
    token: input.token,
    binding: {
      definition: input.revision.workflowBinding,
      planRevisionID: input.revision.id,
      executionSessionID: input.childID,
      authoritySessionID: input.parentID,
      // The logical Task the child's first turn records, known before the child exists.
      logicalTaskID: LogicalTaskV2.origin(input.childID, input.governed).taskId,
    },
  })
  if (input.continuation) yield* scope(services, input.revision.workflowBinding.writePaths, input.authorizationID)
  yield* input.host.value.admit(bound, input.continuation).pipe(Effect.mapError(held))
})

/** The workflow binding an execution Session holds, or undefined; a binding that does not decode holds. */
export const bound = (db: Database.Interface["db"], executionSessionID: string) =>
  WorkflowRecordsV2.read(db, executionSessionID).pipe(Effect.mapError(held))

/**
 * Every provider turn of a workflow-bound child, as V1's prepare checks it: the child still descends from the Session
 * that approved its plan, keeps the logical Task the binding names and the approved write roots, and the plan's
 * upstream author still attributes it. The runner reads and revalidates the step itself on the same turn.
 */
export const turn = Effect.fn("WorkflowAdmissionV2.turn")(function* (
  services: Services & { readonly canonical: (id: string) => string },
  session: SessionSchema.Info,
) {
  const binding = (yield* bound(services.db, session.id))?.binding
  if (!binding) return
  if (session.parentID !== binding.authoritySessionID) return yield* hold("WORKFLOW_HOST_LINEAGE_MISMATCH")
  if ((yield* LogicalTaskV2.read(services, session.id))?.taskId !== binding.logicalTaskID)
    return yield* hold("WORKFLOW_LOGICAL_TASK_MISMATCH")
  const approved = WriteRootsV2.read(
    yield* WriteRootsV2.bind(services.atlas.fs, services.location, binding.definition.writePaths, []),
  )
  if (!approved || !isDeepStrictEqual(WriteRootsV2.read(yield* services.store.permissions(session.id)), approved))
    return yield* hold("WORKFLOW_APPROVED_SCOPE_MISMATCH")
  yield* upstream(
    services,
    yield* GovernanceRecordsV2.readWorkflowRevision(services.db, binding.planRevisionID).pipe(Effect.mapError(held)),
  )
})

// V1's continuation scope check: every file changed since the approved context's HEAD, tracked or not, lies inside an
// approved write path.
const scope = Effect.fn("WorkflowAdmissionV2.scope")(function* (
  services: Services & { readonly canonical: (id: string) => string },
  writePaths: ReadonlyArray<string>,
  authorizationID: string | undefined,
) {
  const authorization = authorizationID
    ? yield* GovernanceRecordsV2.readAuthorization(services.db, authorizationID, services.canonical)
    : undefined
  const validation = authorization
    ? yield* GovernanceRecordsV2.readValidation(services.db, authorization.validationRecordID)
    : undefined
  const context = validation?.contextRecordID
    ? yield* GovernanceRecordsV2.readContext(services.db, validation.contextRecordID)
    : undefined
  if (!context || !/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(context.headSHA)) return yield* hold("WORKFLOW_CONTEXT_STALE")
  const worktree =
    services.location.vcs?.type === "git" ? services.location.project.directory : services.location.directory
  const options = { cwd: worktree, maxOutputBytes: 512 * 1024 }
  const diff = yield* services.atlas.git.run(
    ["diff", "--no-ext-diff", "--no-renames", "--name-only", "-z", context.headSHA, "--", "."],
    options,
  )
  const untracked = yield* services.atlas.git.run(
    ["ls-files", "--full-name", "--others", "--exclude-standard", "-z"],
    options,
  )
  if (diff.exitCode || diff.truncated || untracked.exitCode || untracked.truncated)
    return yield* hold(
      "WORKFLOW_APPROVED_SCOPE_MISMATCH",
      "The changed files since the approved context could not be read, so the approved scope cannot be checked.",
    )
  const outside = [...new Set([...diff.text().split("\0"), ...untracked.text().split("\0")].filter(Boolean))].filter(
    (file) => !writePaths.some((root) => FSUtil.contains(path.resolve(worktree, root), path.resolve(worktree, file))),
  )
  if (outside.length > 0)
    return yield* hold(
      "WORKFLOW_APPROVED_SCOPE_MISMATCH",
      `Approved writePaths ${JSON.stringify(writePaths)}; changed outside them: ${JSON.stringify(outside.slice(0, 10))}${outside.length > 10 ? ` and ${outside.length - 10} more` : ""}.`,
    )
})

function hold(reason: string, detail?: string) {
  return new ToolFailure({ message: `Tool safety HOLD: ${reason}${detail ? `: ${detail}` : ""}` })
}

function held(error: RelayWorkflowBinding.Held | ToolFailure) {
  return error instanceof RelayWorkflowBinding.Held ? hold(error.reason, error.detail) : error
}
