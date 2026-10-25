export * as MaestroPlanningTools from "./planning"

import { isDeepStrictEqual } from "node:util"
import { Effect, Schema } from "effect"
import { AgentV2 } from "@orchestra/core/agent"
import { EventV2 } from "@orchestra/core/event"
import { RelayWorkflowBinding } from "@orchestra/core/relay-workflow-binding"
import { Tool } from "@orchestra/core/tool/tool"
import { MaestroEvent } from "@orchestra/schema/maestro-event"
import { UpstreamAttribution } from "@orchestra/schema/upstream-attribution"
import { MaestroAtlasSourceV2 } from "../atlas-source"
import { GovernanceEvidenceV2 } from "../governance/evidence"
import { GovernanceRecordsV2 } from "../governance/records"
import { MaestroAdmissionTools } from "./admission"
import { MaestroChainTools } from "./chain"
import { MaestroToolGate } from "./gate"

export const names = {
  catalog: "maestro_catalog_context",
  plan: "maestro_record_plan_revision",
  context: "maestro_record_context",
} as const

const Field = MaestroEvent.PlanRevision.RecordedV3.data.fields.goal
const PlanInput = Schema.Struct({
  admissionMessageID: Schema.String,
  methodVersion: Schema.String,
  goal: Field,
  acceptance: Schema.Array(Field),
  scope: Schema.Array(Field),
  units: Schema.Array(Schema.NonEmptyString).check(Schema.isMinLength(1)),
  constraints: Schema.Array(Field),
  reviewRequirement: Field,
  assumptions: Schema.Array(Field),
  risks: Schema.Array(Field),
  upstream: Schema.optional(
    Schema.Struct({
      parentMessageID: UpstreamAttribution.V1.fields.parentMessageID,
      parentCallID: UpstreamAttribution.V1.fields.parentCallID,
      authorSessionID: UpstreamAttribution.V1.fields.authorSessionID,
      authorMessageID: UpstreamAttribution.V1.fields.authorMessageID,
      logicalTaskID: UpstreamAttribution.V1.fields.logicalTaskID,
      dispatchKind: Schema.optional(Schema.Literals(["orchestra-task", "claude-code-agent"])),
    }),
  ),
  workflow: Schema.optional(
    Schema.Struct({
      documentID: Schema.NonEmptyString,
      parameters: Schema.Record(Schema.String, Schema.String),
      writePaths: Schema.Array(Schema.NonEmptyString),
    }),
  ).annotate({
    description:
      "A published Relay workflow this plan runs: its id from `maestro_workflows` as `documentID`, its `parameters`, and the `writePaths` the workflow Task will pass, in the same order.",
  }),
})

const PlanConflict = (admissionMessageID: string) =>
  new Tool.Failure({
    message: `MaestroPlanRevisionConflict: admission message ${admissionMessageID} has no READY_TO_DRAFT admission recorded under admit-request-v1 in this Session. Plan only from the admission message ID of a READY_TO_DRAFT maestro_record_admission result with methodVersion "admit-request-v1".`,
  })

const ContextConflict = (planRevisionID: string) =>
  new Tool.Failure({
    message: `MaestroContextConflict: plan revision ${planRevisionID} cannot take this context (not a plan revision of this Session, unreadable Git state, or HEAD or the tree changed since its context was recorded). Record a new plan revision (change any field, such as methodVersion), rerun the checks, then record a new context and a new validation.`,
  })

/**
 * V2 ports of V1's catalog, plan revision and context steps (`apps/orchestra/src/tool/maestro-{plan,context}.ts`). A
 * plan revision is always grounded (`units` is required), so it records `maestro.plan_revision.recorded` v2 and its
 * context `maestro.context.recorded` v2, the versions `GovernanceRecordsV2` reads. Upstream-authored and workflow
 * plans hold: V2 has neither the upstream provenance resolver nor the native workflow host V1 binds them through.
 */
export function tools(input: { readonly services: MaestroChainTools.Services; readonly gate: MaestroToolGate.Gate }) {
  const services = input.services
  return {
    [names.catalog]: Tool.make({
      description:
        "Read verified project-bound Atlas territory names and static Own availability. Maestro only. No scope inference or runtime retrieval. Tier is criticality: T0 (must be right) and T1 (load-bearing) are ratified and binding; T2 is the unratified default and only advisory.",
      input: Schema.Struct({}),
      output: Schema.String,
      execute: (_params, context) =>
        Effect.gen(function* () {
          yield* input.gate(context, AgentV2.defaultID, "Atlas context catalog requires Maestro")
          const session = yield* MaestroChainTools.placement(services, context.sessionID)
          const source = yield* MaestroChainTools.fromAtlas(MaestroAtlasSourceV2.read(services.atlas, session))
          return JSON.stringify({
            projectID: source.context.projectId,
            catalogVersion: source.context.catalogVersion,
            snapshot: source.context.snapshot,
            territories: source.context.territories.map((territory) => ({
              name: territory.name,
              owner: territory.owner,
              tier: territory.tier,
            })),
            units: source.context.units.map((unit) => ({
              unit: unit.unit,
              skillName: unit.skillName,
              tokenEstimate: unit.tokenEstimate,
              drillUnits: unit.receipt.drillUnits,
              manifest: unit.pointers,
              pullReachable: unit.pullReachable,
              advisoryDropped: unit.advisoryDropped,
              truncated: unit.truncated,
            })),
          })
        }),
    }),
    [names.plan]: Tool.make({
      description:
        "Persist one immutable grounded PlanRevision using exact catalog territory names in scope and verified Own unit IDs in units. Maestro only. With upstream, call it in the Session that dispatched the archie Task: that calling Session is recorded as the dispatch parent.",
      input: PlanInput,
      output: Schema.String,
      execute: (params, context) =>
        Effect.gen(function* () {
          yield* input.gate(context, AgentV2.defaultID, "Plan revision requires Maestro")
          if (params.workflow && !params.upstream)
            return yield* held(
              "UPSTREAM_ATTRIBUTION_MISSING",
              "A workflow plan is authored upstream: dispatch archie with task for the plan, then record this revision in this Session with upstream naming that Task.",
            )
          // V1 resolves the publication through its native workflow host; V2 has none bound.
          if (params.workflow) return yield* held("WORKFLOW_NATIVE_HOST_UNBOUND")
          const admission = yield* MaestroAdmissionTools.read(services.db, {
            sessionID: context.sessionID,
            messageID: params.admissionMessageID,
            methodVersion: MaestroAdmissionTools.methodVersion,
          })
          if (admission?.outcome !== "READY_TO_DRAFT") return yield* PlanConflict(params.admissionMessageID)
          const fields = [
            params.goal,
            params.reviewRequirement,
            ...params.acceptance,
            ...params.scope,
            ...params.constraints,
            ...params.assumptions,
            ...params.risks,
          ]
          if (!params.upstream && fields.some((field) => field.source === "upstream"))
            return yield* held("UPSTREAM_ATTRIBUTION_MISSING")
          // V1 records an upstream-authored revision (v3) with the author's attribution, which it resolves from the
          // archie Task's Session and its dispatch reservation. V2 records no such provenance yet.
          if (params.upstream)
            return yield* MaestroToolGate.hold(
              "upstream-provenance-unavailable",
              "V2 cannot verify the archie Task that authored this plan, so it cannot record an upstream-attributed plan revision. Record the plan without upstream (and without upstream fields) in this Session; the owner decides.",
            )
          const session = yield* MaestroChainTools.placement(services, context.sessionID)
          const source = yield* MaestroChainTools.fromAtlas(MaestroAtlasSourceV2.read(services.atlas, session))
          const body = {
            sessionID: context.sessionID,
            admissionMessageID: params.admissionMessageID,
            methodVersion: params.methodVersion,
            goal: params.goal,
            acceptance: params.acceptance,
            scope: params.scope,
            constraints: params.constraints,
            reviewRequirement: params.reviewRequirement,
            contextRequirement: "PENDING" as const,
            assumptions: params.assumptions,
            risks: params.risks,
            status: "PROPOSED" as const,
            revision: "v2" as const,
            grounding: {
              catalogVersion: source.context.catalogVersion,
              snapshot: source.context.snapshot,
              sourceRevision: source.context.sourceRevision,
              sourceIdentityHash: source.identityHash,
              units: [...params.units],
            },
          }
          const revisionHash = GovernanceRecordsV2.hash(body)
          const next = Schema.decodeUnknownSync(MaestroEvent.PlanRevision.RecordedV2.data)({
            ...body,
            id: `evt_maestro_plan_revision_${revisionHash}`,
            revisionHash,
            createdAt: Date.now(),
          })
          yield* MaestroChainTools.compile({
            session,
            revision: { id: next.id, hash: next.revisionHash },
            territories: next.scope.map((field) => field.value),
            units: next.grounding.units,
            context: source.context,
          })
          const existing = yield* GovernanceRecordsV2.readPlanRevision(services.db, next.id)
          const record = existing
            ? isDeepStrictEqual({ ...existing, createdAt: 0 }, { ...next, createdAt: 0 })
              ? existing
              : yield* PlanConflict(params.admissionMessageID)
            : (yield* services.events.publish(MaestroEvent.PlanRevision.RecordedV2, next, {
                id: EventV2.ID.make(next.id),
              })).data
          const bindings = { planRevisionID: record.id, revisionHash: record.revisionHash }
          return `${record.status}: ${record.id}\n\nBindings: ${JSON.stringify(bindings)}`
        }),
    }),
    [names.context]: Tool.make({
      description:
        "Load exact verified static Own skills and record GROUNDED context bound to one current PlanRevision and clean Git worktree. Maestro only.",
      input: Schema.Struct({ planRevisionID: Schema.String }),
      output: Schema.String,
      execute: (params, context) =>
        Effect.gen(function* () {
          yield* input.gate(context, AgentV2.defaultID, "Context recording requires Maestro")
          const record = yield* recordContext(services, params.planRevisionID, context.sessionID)
          const bindings = { contextRecordID: record.id, contextHash: record.contextHash, mode: record.mode }
          return [
            `${record.mode}: ${record.id}`,
            `Bindings: ${JSON.stringify(bindings)}`,
            ...record.skills.map((skill) => `<skill_content name="${skill.name}">\n${skill.content}\n</skill_content>`),
          ].join("\n\n")
        }),
    }),
  }
}

/** V1's `recordContext(planRevisionID, sessionID, true)`: only a grounded plan revision takes a context. */
const recordContext = Effect.fn("MaestroPlanningTools.recordContext")(function* (
  services: MaestroChainTools.Services,
  planRevisionID: string,
  sessionID: Tool.Context["sessionID"],
) {
  const plan = yield* GovernanceRecordsV2.readPlanRevision(services.db, planRevisionID)
  if (!plan || plan.sessionID !== sessionID) return yield* ContextConflict(planRevisionID)
  const session = yield* MaestroChainTools.placement(services, sessionID)
  const grounding = plan.revision === "v2" || plan.revision === "v3" ? plan.grounding : undefined
  if (grounding === undefined) return yield* MaestroChainTools.atlasHeld("grounded-plan-required", [plan.id])
  const evidence = yield* GovernanceEvidenceV2.current(services.atlas.git, session.directory)
  if (!evidence) return yield* ContextConflict(planRevisionID)
  if (evidence.changedPaths.length) return yield* MaestroChainTools.atlasHeld("context-dirty", evidence.changedPaths)
  const source = yield* MaestroChainTools.fromAtlas(MaestroAtlasSourceV2.read(services.atlas, session))
  if (
    source.identityHash !== grounding.sourceIdentityHash ||
    source.context.catalogVersion !== grounding.catalogVersion ||
    source.context.snapshot !== grounding.snapshot ||
    source.context.sourceRevision !== grounding.sourceRevision
  )
    return yield* MaestroChainTools.atlasHeld("plan-grounding-stale", [plan.id, source.identityHash])
  const toolPlan = yield* MaestroChainTools.compile({
    session,
    revision: { id: plan.id, hash: plan.revisionHash },
    territories: plan.scope.map((field) => field.value),
    units: grounding.units,
    context: source.context,
  })
  const skills = yield* MaestroChainTools.fromAtlas(loadSkills(services, session, source, toolPlan))
  const after = yield* GovernanceEvidenceV2.current(services.atlas.git, session.directory)
  if (!after || !isDeepStrictEqual(evidence, after))
    return yield* MaestroChainTools.atlasHeld("git-changed-during-context-load", [session.directory])
  const next = Schema.decodeUnknownSync(MaestroEvent.Context.RecordedV2.data)({
    id: `evt_maestro_context_${GovernanceRecordsV2.hash({ sessionID, planRevisionID })}`,
    sessionID,
    planRevisionID,
    projectID: session.projectID,
    directory: session.directory,
    mode: "GROUNDED",
    branch: evidence.branch,
    headSHA: evidence.headSHA,
    changedPaths: evidence.changedPaths,
    currentEvidenceIdentityHash: GovernanceRecordsV2.hash(evidence),
    contextHash: GovernanceRecordsV2.hash({
      planRevisionID,
      revisionHash: plan.revisionHash,
      evidence,
      sourceIdentityHash: source.identityHash,
      toolPlan,
      skills,
    }),
    status: "CURRENT",
    createdAt: Date.now(),
    planRevisionHash: plan.revisionHash,
    sourceIdentityHash: source.identityHash,
    toolPlan,
    skills,
  })
  const existing = yield* GovernanceRecordsV2.readContext(services.db, next.id)
  if (existing) {
    if (existing.mode === "GROUNDED" && isDeepStrictEqual({ ...existing, createdAt: 0 }, { ...next, createdAt: 0 }))
      return existing
    return yield* ContextConflict(planRevisionID)
  }
  return (yield* services.events.publish(MaestroEvent.Context.RecordedV2, next, { id: EventV2.ID.make(next.id) })).data
})

/**
 * V1's `loadAtlasSkills`: the plan still compiles the same against a fresh read, each action loads the exact bytes it
 * names, and the source is unchanged across the whole load.
 */
const loadSkills = Effect.fn("MaestroPlanningTools.loadSkills")(function* (
  services: MaestroChainTools.Services,
  session: { readonly id: string; readonly projectID: string; readonly directory: string },
  source: MaestroAtlasSourceV2.Source,
  toolPlan: MaestroChainTools.ToolPlan,
) {
  const fresh = yield* MaestroAtlasSourceV2.read(services.atlas, session)
  if (fresh.directory !== source.directory || fresh.identityHash !== source.identityHash)
    return yield* new MaestroAtlasSourceV2.Held({
      reason: "source-identity-changed",
      evidence: [source.identityHash, fresh.identityHash],
    })
  const recompiled = yield* MaestroChainTools.compile({
    session,
    revision: toolPlan.planRevision,
    territories: toolPlan.territories,
    units: toolPlan.actions.map((action) => action.unit),
    context: fresh.context,
  })
  if (!isDeepStrictEqual(recompiled, toolPlan))
    return yield* new MaestroAtlasSourceV2.Held({
      reason: "context-tool-plan-changed",
      evidence: [toolPlan.hash, recompiled.hash],
    })
  const skills = yield* Effect.forEach(toolPlan.actions, (action) =>
    Effect.gen(function* () {
      const loaded = yield* MaestroAtlasSourceV2.unit(services.atlas, session, action.unit)
      if (
        loaded.sourceIdentity !== fresh.identityHash ||
        loaded.name !== action.skillName ||
        loaded.contentHash !== action.contentHash ||
        loaded.receiptHash !== action.receiptHash
      )
        return yield* new MaestroAtlasSourceV2.Held({ reason: "loaded-action-mismatch", evidence: [action.unit] })
      return {
        unit: loaded.unit,
        name: loaded.name,
        content: loaded.content,
        contentHash: loaded.contentHash,
        receiptHash: loaded.receiptHash,
      }
    }),
  )
  const after = yield* MaestroAtlasSourceV2.read(services.atlas, session)
  if (after.directory !== fresh.directory || after.identityHash !== fresh.identityHash)
    return yield* new MaestroAtlasSourceV2.Held({
      reason: "source-changed-during-load",
      evidence: [fresh.identityHash, after.identityHash],
    })
  return skills
})

function held(reason: string, detail?: string) {
  const error = new RelayWorkflowBinding.Held({ reason, ...(detail === undefined ? {} : { detail }) })
  return new Tool.Failure({ message: error.message, metadata: { status: "HOLD", reason } })
}
