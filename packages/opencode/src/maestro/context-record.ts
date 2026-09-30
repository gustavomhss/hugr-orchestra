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

type ContextData = Schema.Schema.Type<typeof MaestroEvent.Context.Recorded.data>

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
  if (!row || row.type !== EventV2.versionedType(MaestroEvent.Context.Recorded.type, 1)) return undefined
  return Schema.decodeUnknownSync(MaestroEvent.Context.Recorded.data)(row.data)
})

export const recordContext = Effect.fn("MaestroContext.record")(function* (planRevisionID: string, sessionID: string) {
  const plan = yield* readPlanRevision(planRevisionID)
  if (!plan || plan.sessionID !== sessionID) return yield* new ContextConflictError({ sessionID, planRevisionID })
  const sessions = yield* Session.Service
  const session = yield* sessions.get(SessionID.make(sessionID))
  const evidence = yield* currentEvidence(session.directory)
  if (!evidence) return yield* new ContextConflictError({ sessionID, planRevisionID })
  const next: ContextData = {
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
  const existing = yield* readContext(next.id)
  if (existing) {
    if (isDeepStrictEqual({ ...existing, createdAt: 0 }, { ...next, createdAt: 0 })) return existing
    return yield* new ContextConflictError({ sessionID, planRevisionID })
  }
  const events = yield* EventV2Bridge.Service
  return (yield* events.publish(MaestroEvent.Context.Recorded, next, { id: EventV2.ID.make(next.id) })).data
})

export const contextIsCurrent = Effect.fn("MaestroContext.isCurrent")(function* (context: ContextData) {
  const evidence = yield* currentEvidence(context.directory)
  return !!evidence && context.currentEvidenceIdentityHash === hash(evidence)
})

const currentEvidence = Effect.fn("MaestroContext.currentEvidence")(function* (directory: string) {
  const git = yield* Git.Service
  const root = yield* git.run(["rev-parse", "--show-toplevel"], { cwd: directory })
  const worktree = root.text().trim()
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
