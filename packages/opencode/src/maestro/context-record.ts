import { Database } from "@opencode-ai/core/database/database"
import { EventV2 } from "@opencode-ai/core/event"
import { EventTable } from "@opencode-ai/core/event/sql"
import { MaestroEvent } from "@opencode-ai/schema/maestro-event"
import { createHash } from "node:crypto"
import { isDeepStrictEqual } from "node:util"
import path from "node:path"
import { eq } from "drizzle-orm"
import { Effect, Schema } from "effect"
import { EventV2Bridge } from "@/event-v2-bridge"
import { Git } from "@/git"
import { Session } from "@/session/session"
import { SessionID } from "@/session/schema"
import { readPlanRevision } from "./plan-revision"
import { AtlasContextHeld, loadAtlasSkills, readAtlasSource } from "./atlas-source"
import { compileContextToolPlan } from "./context-tool-plan"
import { ConfigMarkdown } from "@/config/markdown"
import { Filesystem } from "@/util/filesystem"

type LegacyContextData = Schema.Schema.Type<typeof MaestroEvent.Context.Recorded.data> & { readonly mode: "UNGROUNDED" }
type ContextData = LegacyContextData | Schema.Schema.Type<typeof MaestroEvent.Context.RecordedV2.data>

export class ContextConflictError extends Schema.TaggedErrorClass<ContextConflictError>()("MaestroContextConflict", {
  sessionID: Schema.String,
  planRevisionID: Schema.String,
}) {}

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
  const evidence = yield* currentEvidence(session.directory)
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
          const after = yield* currentEvidence(session.directory)
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
    const evidence = yield* currentEvidence(context.directory)
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
    const after = yield* currentEvidence(context.directory)
    return matches.every(Boolean) && !!after && context.currentEvidenceIdentityHash === hash(after)
  },
  Effect.catch(() => Effect.succeed(false)),
)

const currentEvidence = Effect.fn("MaestroContext.currentEvidence")(function* (directory: string) {
  const git = yield* Git.Service
  const root = yield* git.run(["rev-parse", "--show-toplevel"], { cwd: directory })
  const worktree = Filesystem.windowsPath(root.text().replace(/\r?\n$/, ""))
  if (root.exitCode !== 0 || !worktree) return undefined
  const head = yield* git.run(["rev-parse", "HEAD"], { cwd: worktree })
  if (head.exitCode !== 0) return undefined
  const diff = yield* git.run(["diff", "--binary", "--no-ext-diff", "HEAD", "--", "."], { cwd: worktree })
  const untracked = yield* git.run(["ls-files", "--others", "--exclude-standard", "-z"], { cwd: worktree })
  if (diff.exitCode !== 0 || diff.truncated || untracked.exitCode !== 0 || untracked.truncated) return undefined
  const untrackedFiles = yield* Effect.forEach(untracked.text().split("\0").filter(Boolean).sort(), (file) =>
    Effect.promise(() => Bun.file(path.join(worktree, file)).arrayBuffer()).pipe(
      Effect.map((bytes) => ({ file, sha256: createHash("sha256").update(Buffer.from(bytes)).digest("hex") })),
    ),
  )
  return {
    directory,
    branch: (yield* git.branch(worktree)) ?? "DETACHED",
    headSHA: head.text().trim(),
    changedPaths: (yield* git.status(worktree)).map((item) => item.file).sort(),
    diffSHA256: createHash("sha256").update(diff.stdout).digest("hex"),
    untrackedFiles,
  }
})
