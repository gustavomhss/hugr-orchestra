export * as ReviewEngagementRequestV2 from "./review-engagement"

import { randomUUID } from "node:crypto"
import { Cause, Clock, Deferred, Duration, Effect, Exit, Option, Scope } from "effect"
import { AgentV2 } from "@orchestra/core/agent"
import { Database } from "@orchestra/core/database/database"
import { AppProcess } from "@orchestra/core/process"
import { ReviewCatalog } from "@orchestra/core/review/catalog"
import { ReviewPrecisionCatalog } from "@orchestra/core/review/precision-catalog"
import { ReviewPrecisionStore } from "@orchestra/core/review/precision-store"
import type { ReviewRoute } from "@orchestra/core/review/route"
import { ReviewRouting } from "@orchestra/core/review/routing"
import { ReviewProbe } from "@orchestra/core/review-toolkit/probe"
import { ReviewScratch } from "@orchestra/core/review-toolkit/scratch-copy"
import { SessionSchema, type SessionV2 } from "@orchestra/core/session"
import type { SessionExecution } from "@orchestra/core/session/execution"
import { TaskTool } from "@orchestra/core/tool/task"
import { Tool } from "@orchestra/core/tool/tool"
import { SessionMessage } from "@orchestra/schema/session-message"
import { ReviewResultV2 } from "../governance/review-result"
import { ReviewEngagementEvidenceV2 } from "../workflow/review-engagement-evidence"
import { ReviewEngagementPolicyV2 } from "../workflow/review-engagement-policy"
import { ReviewEngagementReportV2 } from "../workflow/review-engagement-report"
import { ReviewEngagementSourceV2 } from "../workflow/review-engagement-source"
import { ReviewFanoutV2 } from "../workflow/review-fanout"
import type { MaestroChainTools } from "./chain"
import type { MaestroReviewTools } from "./review"
import { ReviewBindingV2 } from "./review-binding"
import { ReviewEngagementStoreV2 } from "./review-engagement-store"

type Input = {
  readonly sessionID: SessionSchema.ID
  readonly services: MaestroChainTools.Services
  readonly sessions: Option.Option<SessionV2.Interface>
  readonly execution: Option.Option<SessionExecution.Interface>
  readonly database: Database.Interface
  readonly analyze: MaestroReviewTools.Analyze
  readonly stages: ReviewFanoutV2.Stages
  readonly processes: AppProcess.Interface
  readonly settings: (projectID: SessionSchema.Info["projectID"]) => Effect.Effect<ReviewRoute.Request["settings"]>
}
type Owner = { readonly token: string; readonly inputHash: string; readonly done: Deferred.Deferred<void> }
const owners = new Map<string, Owner>()
const transientDatabases = new WeakMap<object, string>()
const failure = (reason: string, detail: string) => new Tool.Failure({ message: `${reason}: ${detail}`, metadata: { reason } })

/** In-process admission only. An unfinished record with no live owner never resumes a provider after reopening. */
export const run = Effect.fn("ReviewEngagementRequestV2.run")(function* (params: ReviewEngagementPolicyV2.Input, input: Input) {
  if (params.profile === "compliance") return yield* failure("engagement-profile-unavailable", "compliance execution is not built")
  if (params.fixReview !== undefined) return yield* failure("engagement-fix-review-unavailable", "fix review execution is not built")
  if (Option.isNone(input.sessions) || Option.isNone(input.execution))
    return yield* failure("session-execution-unavailable", "engagement requires native Session execution")
  const sessions = input.sessions.value
  const execution = input.execution.value
  const parent = yield* input.services.store.get(input.sessionID)
  if (!parent) return yield* failure("engagement-session-unavailable", "parent Session is unavailable")
  const identity = ReviewEngagementStoreV2.identity(parent, params)
  const store = ReviewEngagementStoreV2.make(input.database)
  // Durable terminal bytes precede source acquisition, settings, catalog, skills and Session creation.
  const retained = yield* store.read(identity)
  if (retained?.state === "terminal") return retained.terminal.text
  const namespace = yield* Effect.sync(() => {
    if (input.database.storageID !== undefined) return input.database.storageID
    const existing = transientDatabases.get(input.database.db)
    if (existing) return existing
    const made = randomUUID()
    transientDatabases.set(input.database.db, made)
    return made
  })
  const key = `${namespace}\0${identity.leadID}`
  return yield* Effect.acquireUseRelease(
    Effect.suspend(() => {
      const existing = owners.get(key)
      if (existing && existing.inputHash !== identity.inputHash)
        return Effect.fail(failure("engagement-request-conflict", "request ID already owns a different accepted input"))
      if (existing) return Effect.succeed({ entry: existing, owner: false })
      const entry: Owner = { token: randomUUID(), inputHash: identity.inputHash, done: Deferred.makeUnsafe<void>() }
      owners.set(key, entry)
      return Effect.succeed({ entry, owner: true })
    }),
    (held) => Effect.gen(function* () {
      if (!held.owner) {
        // A cancelled waiter owns neither the provider drain nor the owner's registry entry.
        yield* Deferred.await(held.entry.done)
        const finished = yield* store.read(identity)
        if (finished?.state === "terminal") return finished.terminal.text
        return yield* failure("engagement-interrupted", "prior admission did not publish a terminal result")
      }
      const existing = yield* store.read(identity)
      if (existing?.state === "terminal") return existing.terminal.text
      if (existing?.state === "running") {
        const stopped = yield* store.finish({ identity, owner: existing.owner }, { status: "failed", reason: "engagement-interrupted" })
        if (stopped.terminal.value.status !== "failed") return stopped.terminal.text
        return yield* failure("engagement-interrupted", "unfinished request has no live process owner")
      }
      // Native create is interruptible pre-admission setup. The store verifies an adopted ID is pristine before claim.
      yield* sessions.create({ id: identity.leadID, parentID: parent.id, agent: AgentV2.ID.make("lucy"),
        ...(parent.model ? { model: parent.model } : {}), location: parent.location }).pipe(
        Effect.mapError(() => failure("engagement-session-unavailable", "lead Session is unavailable")),
      )
      return yield* Effect.uninterruptibleMask((restore) => Effect.gen(function* () {
        const admitted = yield* store.admit(identity, params, held.entry.token, parent.model)
        if (admitted.state === "terminal") return admitted.terminal.text
        if (admitted.owner !== held.entry.token) return yield* failure("engagement-owner-lost", "request is owned by another admission")
        const ticket = { identity, owner: held.entry.token }
        const owned = new Set<SessionSchema.ID>([identity.leadID])
        const remaining = Math.max(0, admitted.budget.deadlineAt - (yield* Clock.currentTimeMillis))
        // The yield gives Effect's timeout fiber a turn before any capture observer or provider can advance the clock.
        const work = Effect.gen(function* () {
          yield* Effect.yieldNow
          return yield* perform(params, input, parent, sessions, execution, admitted, store, owned)
        }).pipe(Effect.scoped, Effect.timeoutOption(Duration.millis(remaining)))
        const result = yield* (remaining === 0 ? Effect.succeed(Option.none<string>()) : restore(work)).pipe(Effect.exit)
        const cleaned = yield* Effect.forEach([...owned], (child) => execution.interrupt(child, { discardPending: true }),
          { concurrency: "unbounded", discard: true }).pipe(Effect.exit)
        if (Exit.isFailure(result) || Exit.isFailure(cleaned)) {
          const cause = Exit.isFailure(result) && Exit.isFailure(cleaned) ? Cause.combine(result.cause, cleaned.cause)
            : Exit.isFailure(result) ? result.cause : Exit.isFailure(cleaned) ? cleaned.cause : Cause.empty
          const stopped = yield* store.finish(ticket, { status: Cause.hasInterruptsOnly(cause) ? "cancelled" : "failed",
            reason: Cause.hasInterruptsOnly(cause) ? "cancelled" : "engagement-failed" }).pipe(Effect.exit)
          if (Exit.isFailure(stopped)) return yield* Effect.failCause(Cause.combine(cause, stopped.cause))
          if (!Cause.hasDies(cause) && !Cause.hasInterrupts(cause) && stopped.value.terminal.value.status === "expired")
            return stopped.value.terminal.text
          return yield* Effect.failCause(cause)
        }
        if (Option.isSome(result.value)) return result.value.value
        return (yield* store.finish(ticket, { status: "expired" })).terminal.text
      }))
    }),
    (held) => held.owner ? Effect.sync(() => {
      if (owners.get(key) === held.entry) owners.delete(key)
    }).pipe(Effect.andThen(Deferred.succeed(held.entry.done, undefined))) : Effect.void,
  )
})

function perform(params: ReviewEngagementPolicyV2.Input, input: Input, parent: SessionSchema.Info,
  sessions: SessionV2.Interface, execution: SessionExecution.Interface, admitted: ReviewEngagementStoreV2.Running,
  store: ReviewEngagementStoreV2.Interface, owned: Set<SessionSchema.ID>) {
  return Effect.gen(function* () {
    const identity = admitted.identity
    const ticket = { identity, owner: admitted.owner }
    const git = input.services.atlas.git
    const root = yield* git.run(["rev-parse", "--show-toplevel"], { cwd: parent.location.directory,
      env: { GIT_NO_REPLACE_OBJECTS: "1", GIT_NO_LAZY_FETCH: "1", GIT_ALLOW_PROTOCOL: "", GIT_TERMINAL_PROMPT: "0" },
      maxOutputBytes: 64 * 1024, timeout: "30 seconds" }).pipe(
      Effect.mapError(() => failure("engagement-root-unavailable", "Git root is unavailable")),
    )
    const worktree = root.text().replace(/\r?\n$/, "")
    if (root.exitCode !== 0 || root.truncated || !worktree)
      return yield* failure("engagement-root-unavailable", "Git root is unavailable")
    const source = yield* ReviewEngagementEvidenceV2.prepare(git, { worktree,
      ...(params.revision === undefined ? {} : { revision: params.revision }),
      ...(params.paths === undefined ? {} : { paths: params.paths }) })
    const captured = yield* store.capture(ticket, source)
    if (captured.state === "terminal") return captured.terminal.text
    const files = source.files.map((file) => file.path)
    const settings = yield* input.settings(parent.projectID)
    const batches = yield* ReviewPrecisionStore.history().pipe(Effect.provideService(Database.Service, input.database),
      Effect.mapError(() => failure("precision-history", "precision history is unavailable")))
    const catalog = yield* Effect.try({
      try: () => ReviewPrecisionCatalog.effective({ project: parent.projectID, catalog: ReviewCatalog.current, batches }),
      catch: (error) => failure("precision-history", error instanceof Error ? error.message : String(error)),
    })
    const cache = `engagement_${identity.key}`
    const lead = identity.leadID
    const lenses: string[] = []
    const parentScope = yield* Scope.Scope
    const copies = yield* Effect.cached(Effect.all({
      head: ReviewScratch.create({ worktree, revision: source.commit }),
      base: ReviewScratch.create({ worktree, revision: source.commit }),
    }, { concurrency: 1 }).pipe(Effect.provideService(AppProcess.Service, input.processes),
      Effect.provideService(Scope.Scope, parentScope)))
    const binding = ReviewBindingV2.reviewBinding({ worktree, diff: "", cache, lenses, ledger: ReviewProbe.ledger(),
      copies, headCommit: source.commit, scope: { sha256: source.sha256, files }, processes: input.processes })
    const read = (path: string, startLine: number, endLine: number) =>
      ReviewEngagementSourceV2.read(git, { worktree, prepared: source, path, startLine, endLine })
    const port: ReviewFanoutV2.Port = {
      create: (child) => Effect.gen(function* () {
        if (child.role === "lead" && child.key === "lead") return lead
        if (child.role === "lead" || child.key === "lead") return yield* failure("engagement-child-invalid", "child role conflicts with lead")
        const id = SessionSchema.ID.make(`ses_lucy_engagement_${ReviewEngagementReportV2.digest({ key: identity.key, ...child })}`)
        yield* sessions.create({ id, parentID: lead, agent: AgentV2.ID.make("lucy"),
          ...(parent.model ? { model: parent.model } : {}), location: parent.location }).pipe(
          Effect.mapError(() => failure("engagement-session-unavailable", "child Session is unavailable")))
        const claimed = yield* store.own(ticket, { ...child, id })
        if (claimed.state === "terminal") return yield* failure("engagement-expired", "child admission is closed")
        owned.add(id)
        return id
      }),
      run: (child, brief, turn) => Effect.gen(function* () {
        if (!owned.has(child)) return yield* failure("engagement-child-invalid", "Session is not owned by this request")
        const prompt = SessionMessage.ID.make(`msg_lucy_engagement_${ReviewEngagementReportV2.digest({ key: identity.key, child, turn: turn.key })}`)
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
        return TaskTool.completedReply(messages, prompt)?.content.findLast(
          (part): part is SessionMessage.AssistantText => part.type === "text")?.text ?? ""
      }),
      analyze: (step) => input.analyze({ ...step, catalog, worktree, base: source.commit, head: source.commit, sessionID: lead }),
      region: (path, startLine, endLine) => read(path, startLine, endLine).pipe(Effect.map((quote) => quote.text)),
      // The first report route offers captured CODE and analyzer pages; scoped executable probes are not built.
      binding: (bound) => binding({ ...bound, offered: {} }),
      allow: (ids) => Effect.sync(() => { for (const id of ids) if (!lenses.includes(id)) lenses.push(id) }),
    }
    const scope = { base: source.commit, head: source.commit, files: files.length, changedLines: 0 }
    const ran = yield* ReviewFanoutV2.run({
      completion: "report", repositoryFiles: files,
      request: { stage: "code", profile: params.profile, settings }, base: { files }, head: { files, changes: [] },
      catalog, stages: input.stages, skills: yield* input.services.atlas.skills.list(),
      fs: input.services.atlas.fs, store: input.services.store, verifierModel: "same", cache, reviewed: source.commit,
      facts: { workCard: JSON.stringify({ requestID: params.requestID, profile: params.profile, brief: params.brief,
        source, scope }), diff: "", rules: [], scope, record: [] },
    }, port)
    if (ran.status !== "ran") return yield* failure("engagement-unaddressed", "unexpected first-round state")
    const report = yield* ReviewEngagementReportV2.completed({ input: params, inputHash: identity.inputHash,
      sessionID: lead, budget: admitted.budget, source }, {
      reply: ran.reply, expected: { routing: ran.routing, scope, checkFacts: ran.checkFacts,
        ...(ReviewRouting.tier(ran.routing) === "quick" ? {} : { confirmed: ran.confirmed }) }, read,
    })
    if (!report.value.report || ReviewResultV2.method({ profile: report.value.report.profile, tier: report.value.report.tier }) !== ran.method)
      return yield* failure("engagement-report-invalid", "method mismatch")
    return (yield* store.finish(ticket, { status: "completed", result: report })).terminal.text
  })
}
