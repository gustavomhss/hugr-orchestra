import { Database } from "@orchestra/core/database/database"
import { EventV2 } from "@orchestra/core/event"
import { EventTable } from "@orchestra/core/event/sql"
import { MaestroEvent } from "@orchestra/schema/maestro-event"
import { createHash } from "node:crypto"
import { isDeepStrictEqual } from "node:util"
import path from "node:path"
import { eq } from "drizzle-orm"
import { Effect, Schema } from "effect"
import { EventV2Bridge } from "@/event-v2-bridge"
import { Session } from "@/session/session"
import { SessionID } from "@/session/schema"
import { readPlanRevision } from "./plan-revision"
import { AtlasContextHeld, loadAtlasSkills, readAtlasSource } from "./atlas-source"
import { compileContextToolPlan } from "./context-tool-plan"
import { ConfigMarkdown } from "@/config/markdown"
import { WorktreeEvidence } from "./worktree-evidence"

type LegacyContextData = Schema.Schema.Type<typeof MaestroEvent.Context.Recorded.data> & { readonly mode: "UNGROUNDED" }
type ContextData = LegacyContextData | Schema.Schema.Type<typeof MaestroEvent.Context.RecordedV2.data>

// A context's identity is its Session and plan revision, so a changed repository needs a new plan revision.
export const STALE_CONTEXT_NEXT_STEP =
  "HEAD, the working tree or the Own source changed since the context was recorded; record a new plan revision (change any field, such as methodVersion), rerun the checks, then record a new context and a new validation."

export const DIRTY_CONTEXT_NEXT_STEP =
  "The context was recorded with uncommitted or untracked changes; leave the tree clean, then record a new plan revision (change any field, such as methodVersion), rerun the checks, and record a new context and a new validation."

export class ContextConflictError extends Schema.TaggedErrorClass<ContextConflictError>()("MaestroContextConflict", {
  sessionID: Schema.String,
  planRevisionID: Schema.String,
}) {
  override get message() {
    return `${this._tag}: plan revision ${this.planRevisionID} cannot take this context (not a plan revision of this Session, unreadable Git state, or HEAD or the tree changed since its context was recorded). Record a new plan revision (change any field, such as methodVersion), rerun the checks, then record a new context and a new validation.`
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

function id(sessionID: string, planRevisionID: string) {
  return EventV2.ID.make(`evt_maestro_context_${hash({ sessionID, planRevisionID })}`)
}

export const readContext = Effect.fn("MaestroContext.read")(function* (contextID: string) {
  if (!contextID.startsWith("evt_")) return undefined
  const { db } = yield* Database.Service
  const row = yield* db
    .select()
    .from(EventTable)
    .where(eq(EventTable.id, EventV2.ID.make(contextID)))
    .get()
    .pipe(Effect.orDie)
  if (!row) return undefined
  if (row.type === EventV2.versionedType(MaestroEvent.Context.RecordedV2.type, 2)) {
    return Schema.decodeUnknownSync(MaestroEvent.Context.RecordedV2.data)(row.data)
  }
  if (row.type !== EventV2.versionedType(MaestroEvent.Context.Recorded.type, 1)) return undefined
  const legacy = Schema.decodeUnknownSync(MaestroEvent.Context.Recorded.data)(row.data)
  if (legacy.mode !== "UNGROUNDED") return undefined
  return { ...legacy, mode: "UNGROUNDED" as const }
})

export const recordContext = Effect.fn("MaestroContext.record")(function* (
  planRevisionID: string,
  sessionID: string,
  requireGrounded = false,
) {
  const plan = yield* readPlanRevision(planRevisionID)
  if (!plan || plan.sessionID !== sessionID) return yield* new ContextConflictError({ sessionID, planRevisionID })
  const sessions = yield* Session.Service
  const session = yield* sessions.get(SessionID.make(sessionID))
  if (requireGrounded && plan.revision !== "v2")
    return yield* new AtlasContextHeld({ reason: "grounded-plan-required", evidence: [plan.id] })
  const evidence = yield* WorktreeEvidence.current(session.directory)
  if (!evidence) return yield* new ContextConflictError({ sessionID, planRevisionID })
  const legacy: LegacyContextData = {
    id: id(sessionID, planRevisionID),
    sessionID,
    planRevisionID,
    projectID: session.projectID,
    directory: session.directory,
    mode: "UNGROUNDED",
    branch: evidence.branch,
    headSHA: evidence.headSHA,
    changedPaths: evidence.changedPaths,
    currentEvidenceIdentityHash: hash(evidence),
    contextHash: hash({ planRevisionID, evidence }),
    status: "CURRENT",
    createdAt: Date.now(),
  }
  const next: ContextData =
    plan.revision === "v2"
      ? yield* Effect.gen(function* () {
          if (evidence.changedPaths.length)
            return yield* new AtlasContextHeld({ reason: "context-dirty", evidence: evidence.changedPaths })
          const source = yield* readAtlasSource(session)
          if (
            source.identityHash !== plan.grounding.sourceIdentityHash ||
            source.context.catalogVersion !== plan.grounding.catalogVersion ||
            source.context.snapshot !== plan.grounding.snapshot ||
            source.context.sourceRevision !== plan.grounding.sourceRevision
          )
            return yield* new AtlasContextHeld({
              reason: "plan-grounding-stale",
              evidence: [plan.id, source.identityHash],
            })
          const compiled = compileContextToolPlan({
            actor: { projectId: session.projectID, sessionId: session.id, memberId: "maestro" },
            revision: { id: plan.id, hash: plan.revisionHash, projectId: session.projectID, sessionId: session.id },
            territories: plan.scope.map((field) => field.value),
            units: plan.grounding.units,
            context: source.context,
          })
          if (compiled.status === "HOLD")
            return yield* new AtlasContextHeld({ reason: compiled.reason, evidence: compiled.evidence })
          const skills = yield* loadAtlasSkills(session, source, compiled.plan)
          const after = yield* WorktreeEvidence.current(session.directory)
          if (!after || !isDeepStrictEqual(evidence, after))
            return yield* new AtlasContextHeld({
              reason: "git-changed-during-context-load",
              evidence: [session.directory],
            })
          return {
            ...legacy,
            mode: "GROUNDED" as const,
            planRevisionHash: plan.revisionHash,
            sourceIdentityHash: source.identityHash,
            toolPlan: compiled.plan,
            skills,
            contextHash: hash({
              planRevisionID,
              revisionHash: plan.revisionHash,
              evidence,
              sourceIdentityHash: source.identityHash,
              toolPlan: compiled.plan,
              skills,
            }),
          }
        })
      : legacy
  const existing = yield* readContext(next.id)
  if (existing) {
    if (isDeepStrictEqual({ ...existing, createdAt: 0 }, { ...next, createdAt: 0 })) return existing
    return yield* new ContextConflictError({ sessionID, planRevisionID })
  }
  const events = yield* EventV2Bridge.Service
  if (next.mode === "GROUNDED")
    yield* events.publish(MaestroEvent.Context.RecordedV2, next, { id: EventV2.ID.make(next.id) })
  if (next.mode === "UNGROUNDED")
    yield* events.publish(MaestroEvent.Context.Recorded, next, { id: EventV2.ID.make(next.id) })
  return next
})

export const contextIsCurrent = Effect.fn("MaestroContext.isCurrent")(
  function* (context: ContextData) {
    const evidence = yield* WorktreeEvidence.current(context.directory)
    if (!evidence || context.currentEvidenceIdentityHash !== hash(evidence)) return false
    if (context.mode !== "GROUNDED") return true
    if (!("toolPlan" in context)) return false
    const sessions = yield* Session.Service
    const session = yield* sessions.get(SessionID.make(context.sessionID))
    if (session.projectID !== context.projectID || session.directory !== context.directory) return false
    const plan = yield* readPlanRevision(context.planRevisionID)
    if (!plan || plan.revision !== "v2" || plan.revisionHash !== context.planRevisionHash) return false
    const source = yield* readAtlasSource(session)
    if (source.identityHash !== context.sourceIdentityHash || source.identityHash !== plan.grounding.sourceIdentityHash)
      return false
    const compiled = compileContextToolPlan({
      actor: { projectId: session.projectID, sessionId: session.id, memberId: "maestro" },
      revision: { id: plan.id, hash: plan.revisionHash, projectId: session.projectID, sessionId: session.id },
      territories: plan.scope.map((field) => field.value),
      units: plan.grounding.units,
      context: source.context,
    })
    if (
      compiled.status !== "READY" ||
      !isDeepStrictEqual(compiled.plan, context.toolPlan) ||
      context.skills.length !== compiled.plan.actions.length
    )
      return false
    const matches = yield* Effect.forEach(compiled.plan.actions, (action, index) =>
      Effect.gen(function* () {
        const loaded = context.skills[index]
        if (
          !loaded ||
          loaded.unit !== action.unit ||
          loaded.name !== action.skillName ||
          loaded.contentHash !== action.contentHash ||
          loaded.receiptHash !== action.receiptHash
        )
          return false
        const markdown = yield* Effect.tryPromise({
          try: () => ConfigMarkdown.parse(path.join(source.directory, action.path)),
          catch: (error) => error,
        })
        return markdown.data.name === loaded.name && markdown.content === loaded.content
      }),
    )
    const after = yield* WorktreeEvidence.current(context.directory)
    return matches.every(Boolean) && !!after && context.currentEvidenceIdentityHash === hash(after)
  },
  Effect.catch(() => Effect.succeed(false)),
)
