export * as GovernanceEvidenceV2 from "./evidence"

import { createHash } from "node:crypto"
import path from "node:path"
import { isDeepStrictEqual } from "node:util"
import { Effect, Schema } from "effect"
import { ConfigMarkdown } from "@orchestra/core/config/markdown"
import type { Database } from "@orchestra/core/database/database"
import type { GitCli } from "@orchestra/core/git-cli"
import { SessionSchema, type SessionStore } from "@orchestra/core/session"
import { MaestroAtlasSourceV2 } from "../atlas-source"
import { GovernanceRecordsV2 } from "./records"

// V2 port of V1's worktree evidence and context currency (`apps/orchestra/src/maestro/{worktree-evidence,
// context-record}.ts`). The identity hash is computed exactly as V1 records it, so a V1 context stays current on V2
// only while HEAD, the diff, the untracked files and (for a grounded context) the Atlas source are unchanged.

// The append-only Atlas Memory logs (the union-merged files in .gitattributes).
const MEMORY_LOGS = [".atlas/memory.jsonl", ".atlas/orientation.jsonl"]
const MEMORY = MEMORY_LOGS.map((file) => `:(exclude)${file}`)

export type Services = {
  readonly db: Database.Interface["db"]
  readonly store: SessionStore.Interface
  readonly atlas: MaestroAtlasSourceV2.Services
}

export const current = Effect.fn("GovernanceEvidenceV2.current")(function* (git: GitCli.Interface, directory: string) {
  const root = yield* git.run(["rev-parse", "--show-toplevel"], { cwd: directory })
  const worktree = root.text().replace(/\r?\n$/, "")
  if (root.exitCode !== 0 || !worktree) return undefined
  const head = yield* git.run(["rev-parse", "HEAD"], { cwd: worktree })
  if (head.exitCode !== 0) return undefined
  // Atlas Memory logs are versioned with the code but are not task output: a Memory write never makes a context stale.
  const diff = yield* git.run(["diff", "--binary", "--no-ext-diff", "HEAD", "--", ".", ...MEMORY], { cwd: worktree })
  const untracked = yield* git.run(["ls-files", "--others", "--exclude-standard", "-z", "--", ".", ...MEMORY], {
    cwd: worktree,
  })
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
    changedPaths: (yield* git.status(worktree))
      .map((item) => item.file)
      .filter((file) => !MEMORY_LOGS.includes(file))
      .sort(),
    diffSHA256: createHash("sha256").update(diff.stdout).digest("hex"),
    untrackedFiles,
  }
})

/** Whether a recorded context still describes the repository; any unreadable step is not current. */
export const contextIsCurrent = Effect.fn("GovernanceEvidenceV2.contextIsCurrent")(
  function* (services: Services, context: GovernanceRecordsV2.Context) {
    const evidence = yield* current(services.atlas.git, context.directory)
    if (!evidence || context.currentEvidenceIdentityHash !== GovernanceRecordsV2.hash(evidence)) return false
    if (context.mode !== "GROUNDED") return true
    if (!Schema.is(SessionSchema.ID)(context.sessionID)) return false
    const session = yield* services.store.get(context.sessionID)
    if (session?.projectID !== context.projectID || session.location.directory !== context.directory) return false
    const plan = yield* GovernanceRecordsV2.readPlanRevision(services.db, context.planRevisionID)
    if (!plan || plan.revisionHash !== context.planRevisionHash) return false
    const grounding = plan.revision === "v2" || plan.revision === "v3" ? plan.grounding : undefined
    if (grounding === undefined) return false
    const source = yield* MaestroAtlasSourceV2.read(services.atlas, {
      projectID: session.projectID,
      directory: session.location.directory,
    })
    if (source.identityHash !== context.sourceIdentityHash || source.identityHash !== grounding.sourceIdentityHash)
      return false
    // The compiler reads the roster, which loads lazily.
    const { compileContextToolPlan } = yield* Effect.tryPromise(() => import("../../context-tool-plan"))
    const compiled = compileContextToolPlan({
      actor: { projectId: session.projectID, sessionId: session.id, memberId: "maestro" },
      revision: { id: plan.id, hash: plan.revisionHash, projectId: session.projectID, sessionId: session.id },
      territories: plan.scope.map((field) => field.value),
      units: grounding.units,
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
        const content = yield* services.atlas.fs.readFileStringSafe(path.join(source.directory, action.path))
        if (content === undefined) return false
        const markdown = ConfigMarkdown.parse(content)
        return markdown.data.name === loaded.name && markdown.content === loaded.content
      }),
    )
    const after = yield* current(services.atlas.git, context.directory)
    return matches.every(Boolean) && !!after && context.currentEvidenceIdentityHash === GovernanceRecordsV2.hash(after)
  },
  Effect.catch(() => Effect.succeed(false)),
)
