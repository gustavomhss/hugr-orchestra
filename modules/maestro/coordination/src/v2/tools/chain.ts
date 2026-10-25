export * as MaestroChainTools from "./chain"

import { Effect, type Schema } from "effect"
import type { EventV2 } from "@orchestra/core/event"
import { Tool } from "@orchestra/core/tool/tool"
import type { VerifiedHostContext } from "@orchestra/atlas-boundary"
import type { MaestroContext } from "@orchestra/schema/maestro-context"
import { MaestroAtlasSourceV2 } from "../atlas-source"
import type { GovernanceEvidenceV2 } from "../governance/evidence"

// Shared pieces of the governed-chain tools (plan, context, validation, review, presentation, authorization): the
// services they read and write through, and the V1 refusal texts the model reads.

export type Services = GovernanceEvidenceV2.Services & { readonly events: EventV2.Interface }

// V1's next steps for the Atlas holds a governed flow meets in practice (`apps/orchestra/src/maestro/atlas-source.ts`).
const nextSteps: Record<string, string> = {
  "provider-unconfigured":
    "Atlas is not configured for this project (maestro.atlas), so governed work cannot proceed here; the owner decides.",
  "provider-project-mismatch":
    "maestro.atlas names another project, so governed work cannot proceed here; the owner decides.",
  "artifacts-invalid":
    "Own artifacts are stale against the current source or their snapshot and must be re-materialized by the owner or a maintainer before governed work can proceed.",
  "source-revision-not-ancestor":
    "The Own snapshot was built from a revision outside this branch's history; the owner or a maintainer must re-materialize it.",
  "context-dirty": "Leave the working tree clean (untracked files count), then record the context again.",
  "plan-grounding-stale":
    "The Atlas source changed after this plan revision; call maestro_catalog_context again and record a new plan revision.",
  "grounded-plan-required": "Record a new plan revision with verified Own unit IDs in units.",
  "territory-unavailable": "Use exact territory names from maestro_catalog_context.",
  "unit-unavailable": "Use exact unit IDs from maestro_catalog_context.",
}

/** V1's `AtlasContextHeld` refusal, as the tool failure the model reads. */
export function atlasHeld(reason: string, evidence: readonly string[]) {
  const held = `${reason}: ${evidence.join("; ")}`
  const next = nextSteps[reason]
  return new Tool.Failure({ message: next ? `${held}. ${next}` : held, metadata: { status: "HOLD", reason } })
}

/** An Atlas source hold becomes V1's refusal; every other failure stays as it is. */
export function fromAtlas<A, R>(effect: Effect.Effect<A, MaestroAtlasSourceV2.Held | Tool.Failure, R>) {
  return effect.pipe(
    Effect.mapError((error) =>
      error instanceof MaestroAtlasSourceV2.Held ? atlasHeld(error.reason, error.evidence) : error,
    ),
  )
}

/** The Session's placement for the Atlas source, or the V1 refusal a missing Session gets. */
export const placement = Effect.fn("MaestroChainTools.placement")(function* (
  services: Services,
  sessionID: Tool.Context["sessionID"],
) {
  const session = yield* services.store.get(sessionID)
  if (!session) return yield* new Tool.Failure({ message: `Session ${sessionID} is not available` })
  return { id: session.id, projectID: session.projectID, directory: session.location.directory }
})

export type ToolPlan = Schema.Schema.Type<typeof MaestroContext.ToolPlan>

/** V1's context tool plan compiler; it reads the roster, which loads lazily. */
export const compile = Effect.fn("MaestroChainTools.compile")(function* (input: {
  readonly session: { readonly id: string; readonly projectID: string }
  readonly revision: { readonly id: string; readonly hash: string }
  readonly territories: readonly string[]
  readonly units: readonly string[]
  readonly context: VerifiedHostContext
}) {
  const { compileContextToolPlan } = yield* Effect.tryPromise(() => import("../../context-tool-plan")).pipe(
    Effect.orDie,
  )
  const compiled = compileContextToolPlan({
    actor: { projectId: input.session.projectID, sessionId: input.session.id, memberId: "maestro" },
    revision: {
      id: input.revision.id,
      hash: input.revision.hash,
      projectId: input.session.projectID,
      sessionId: input.session.id,
    },
    territories: input.territories,
    units: input.units,
    context: input.context,
  })
  if (compiled.status === "HOLD") return yield* atlasHeld(compiled.reason, compiled.evidence)
  return compiled.plan
})
