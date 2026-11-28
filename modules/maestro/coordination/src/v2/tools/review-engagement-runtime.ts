export * as ReviewEngagementRuntimeV2 from "./review-engagement-runtime"

import { randomUUID } from "node:crypto"
import { Deferred, Effect, Option } from "effect"
import type { GitCli } from "@orchestra/core/git-cli"
import type { SessionSchema, SessionV2 } from "@orchestra/core/session"
import type { SessionExecution } from "@orchestra/core/session/execution"
import { TaskTool } from "@orchestra/core/tool/task"
import { Tool } from "@orchestra/core/tool/tool"
import { SessionMessage } from "@orchestra/schema/session-message"
import { ReviewVariantSchemaV2 } from "../workflow/review-variant-schema"
import type { ReviewEngagementStoreV2 } from "./review-engagement-store"

type Owner = { readonly token: string; readonly inputHash: string; readonly done: Deferred.Deferred<void> }
const owners = new Map<string, Owner>()
const failure = (reason: string, detail: string) => new Tool.Failure({ message: `${reason}: ${detail}`, metadata: { reason } })

/** A follower can interrupt its own wait without touching the owner's drain. Both request kinds share this registry. */
export function withOwner<A, E, R>(namespace: string | undefined, identity: ReviewEngagementStoreV2.Identity,
  use: (held: { readonly entry: Owner; readonly owner: boolean }) => Effect.Effect<A, E, R>) {
  if (typeof namespace !== "string" || !namespace.trim())
    return Effect.fail(failure("engagement-evidence-storage-unavailable", "a stable database identity is required"))
  const key = `${namespace}\0${identity.leadID}`
  return Effect.acquireUseRelease(
    Effect.suspend(() => {
      const existing = owners.get(key)
      if (existing && existing.inputHash !== identity.inputHash)
        return Effect.fail(failure("engagement-request-conflict", "request ID already owns a different accepted input"))
      if (existing) return Effect.succeed({ entry: existing, owner: false })
      const entry: Owner = { token: randomUUID(), inputHash: identity.inputHash, done: Deferred.makeUnsafe<void>() }
      owners.set(key, entry)
      return Effect.succeed({ entry, owner: true })
    }),
    use,
    (held) => held.owner ? Effect.sync(() => {
      if (owners.get(key) === held.entry) owners.delete(key)
    }).pipe(Effect.andThen(Deferred.succeed(held.entry.done, undefined))) : Effect.void,
  )
}

export const root = Effect.fn("ReviewEngagementRuntimeV2.root")(function* (git: GitCli.Interface, cwd: string) {
  const result = yield* git.run(["rev-parse", "--show-toplevel"], { cwd,
    env: { GIT_NO_REPLACE_OBJECTS: "1", GIT_NO_LAZY_FETCH: "1", GIT_ALLOW_PROTOCOL: "", GIT_TERMINAL_PROMPT: "0" },
    maxOutputBytes: 64 * 1024, timeout: "30 seconds" }).pipe(
    Effect.mapError(() => failure("engagement-root-unavailable", "Git root is unavailable")),
  )
  const worktree = result.text().replace(/\r?\n$/, "")
  if (result.exitCode !== 0 || result.truncated || !worktree)
    return yield* failure("engagement-root-unavailable", "Git root is unavailable")
  return worktree
})

export const turn = Effect.fn("ReviewEngagementRuntimeV2.turn")(function* (sessions: SessionV2.Interface,
  execution: SessionExecution.Interface, identity: ReviewEngagementStoreV2.Identity,
  child: SessionSchema.ID, brief: string, turnKey: string) {
  const prompt = SessionMessage.ID.make(ReviewVariantSchemaV2.promptID(identity.key, child, turnKey))
  yield* sessions.prompt({ id: prompt, sessionID: child, prompt: { text: brief }, delivery: "queue", resume: false }).pipe(
    Effect.mapError(() => failure("engagement-prompt-refused", "review prompt was refused")))
  const drained = yield* execution.exclusive(child,
    execution.withRunner(child, (runner) => runner.run({ sessionID: child, force: true })), { discardPending: true }).pipe(
    Effect.onInterrupt(() => execution.interrupt(child, { discardPending: true })),
    Effect.mapError(() => failure("engagement-execution-failed", "review execution failed")),
  )
  if (Option.isNone(drained)) return yield* failure("engagement-session-busy", "owned review Session is already running")
  const messages = yield* sessions.messages({ sessionID: child, order: "asc" }).pipe(
    Effect.mapError(() => failure("engagement-session-unavailable", "review messages are unavailable")))
  const reply = TaskTool.completedReply(messages, prompt)
  const part = reply?.content.findLast((part): part is SessionMessage.AssistantText => part.type === "text")
  return { prompt, messages, ...(reply && part ? { reply: { assistantMessageID: reply.id, textPartID: part.id, text: part.text } } : {}) }
})
