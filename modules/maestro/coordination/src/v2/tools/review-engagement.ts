export * as ReviewEngagementRequestV2 from "./review-engagement"

import { Cause, Clock, Deferred, Duration, Effect, Exit, Option, Scope } from "effect"
import { AgentV2 } from "@orchestra/core/agent"
import { Database } from "@orchestra/core/database/database"
import type { Global } from "@orchestra/core/global"
import { AppProcess } from "@orchestra/core/process"
import { ReviewCatalog } from "@orchestra/core/review/catalog"
import { ReviewPrecisionCatalog } from "@orchestra/core/review/precision-catalog"
import { ReviewPrecisionStore } from "@orchestra/core/review/precision-store"
import type { ReviewRoute } from "@orchestra/core/review/route"
import { ReviewRouting } from "@orchestra/core/review/routing"
import type { ReviewTools } from "@orchestra/core/review/tools"
import { ReviewScopedHistory } from "@orchestra/core/review-toolkit/index"
import { ReviewProbe } from "@orchestra/core/review-toolkit/probe"
import { ReviewScratch } from "@orchestra/core/review-toolkit/scratch-copy"
import { SessionSchema, type SessionV2 } from "@orchestra/core/session"
import type { SessionExecution } from "@orchestra/core/session/execution"
import { Tool } from "@orchestra/core/tool/tool"
import { ReviewResultV2 } from "../governance/review-result"
import { ReviewEngagementEvidenceV2 } from "../workflow/review-engagement-evidence"
import { ReviewEngagementArtifactsV2 } from "../workflow/review-engagement-artifacts"
import { ReviewEngagementPolicyV2 } from "../workflow/review-engagement-policy"
import { ReviewEngagementReportV2 } from "../workflow/review-engagement-report"
import { ReviewScopedProbeV2 } from "../workflow/review-scoped-probe"
import { ReviewEngagementSourceV2 } from "../workflow/review-engagement-source"
import { ReviewFanoutV2 } from "../workflow/review-fanout"
import type { ReviewVariantValidationV2 } from "../workflow/review-variant-validation"
import { ReviewVariantsV2 } from "../workflow/review-variants"
import type { MaestroChainTools } from "./chain"
import type { MaestroReviewTools } from "./review"
import { ReviewBindingV2 } from "./review-binding"
import { ReviewEngagementStoreV2 } from "./review-engagement-store"
import { ReviewEngagementRuntimeV2 } from "./review-engagement-runtime"
import { ReviewEngagementVariantsV2 } from "./review-engagement-variants"

export type Input = {
  readonly sessionID: SessionSchema.ID
  readonly services: MaestroChainTools.Services
  readonly sessions: Option.Option<SessionV2.Interface>
  readonly execution: Option.Option<SessionExecution.Interface>
  readonly database: Database.Interface
  readonly global?: Global.Interface
  readonly analyze: MaestroReviewTools.Analyze
  readonly stages: ReviewFanoutV2.Stages
  readonly processes: AppProcess.Interface
  readonly settings: (projectID: SessionSchema.Info["projectID"]) => Effect.Effect<ReviewRoute.Request["settings"]>
}
const failure = (reason: string, detail: string) => new Tool.Failure({ message: `${reason}: ${detail}`, metadata: { reason } })

/** In-process admission only. An unfinished record with no live owner never resumes a provider after reopening. */
export const run = Effect.fn("ReviewEngagementRequestV2.run")(function* (params: ReviewEngagementPolicyV2.Input, input: Input) {
  if (params.profile === "compliance") return yield* failure("engagement-profile-unavailable", "compliance execution is not built")
  if (Option.isNone(input.sessions) || Option.isNone(input.execution))
    return yield* failure("session-execution-unavailable", "engagement requires native Session execution")
  const sessions = input.sessions.value
  const execution = input.execution.value
  const parent = yield* input.services.store.get(input.sessionID)
  if (!parent) return yield* failure("engagement-session-unavailable", "parent Session is unavailable")
  const identity = ReviewEngagementStoreV2.identity(parent, params)
  const store = ReviewEngagementStoreV2.make(input.database)
  const artifacts = yield* ReviewEngagementArtifactsV2.make({ database: input.database, fs: input.services.atlas.fs,
    readMessage: input.services.store.message,
    ...(input.global ? { global: input.global } : {}) })
  // Durable terminal bytes precede source acquisition, settings, catalog, skills and Session creation.
  const retained = yield* store.read(identity)
  if (retained?.state === "terminal") return yield* artifacts.replay(retained)
  return yield* ReviewEngagementRuntimeV2.withOwner(input.database.storageID, identity, (held) => Effect.gen(function* () {
    if (!held.owner) {
      // A cancelled waiter owns neither the provider drain nor the owner's registry entry.
      yield* Deferred.await(held.entry.done)
      const finished = yield* store.read(identity)
      if (finished?.state === "terminal") return yield* artifacts.replay(finished)
      return yield* failure("engagement-interrupted", "prior admission did not publish a terminal result")
    }
    const existing = yield* store.read(identity)
    if (existing?.state === "terminal") return yield* artifacts.replay(existing)
    if (existing?.state === "running") {
      const stopped = yield* store.finish({ identity, owner: existing.owner }, { status: "failed", reason: "engagement-interrupted" })
      if (stopped.terminal.value.status !== "failed") return yield* artifacts.replay(stopped)
      return yield* failure("engagement-interrupted", "unfinished request has no live process owner")
    }
    // Native create is interruptible pre-admission setup. The store verifies an adopted ID is pristine before claim.
    yield* sessions.create({ id: identity.leadID, parentID: parent.id, agent: AgentV2.ID.make("lucy"),
      ...(parent.model ? { model: parent.model } : {}), location: parent.location }, { inheritParentPlacement: true }).pipe(
      Effect.mapError(() => failure("engagement-session-unavailable", "lead Session is unavailable")),
    )
    return yield* Effect.uninterruptibleMask((restore) => Effect.gen(function* () {
      const admitted = yield* store.admit(identity, params, held.entry.token, parent.model)
      if (admitted.state === "terminal") return yield* restore(artifacts.replay(admitted))
      if (admitted.owner !== held.entry.token) return yield* failure("engagement-owner-lost", "request is owned by another admission")
      const ticket = { identity, owner: held.entry.token }
      const owned = new Set<SessionSchema.ID>([identity.leadID])
      const remaining = Math.max(0, admitted.budget.deadlineAt - (yield* Clock.currentTimeMillis))
      // The yield gives Effect's timeout fiber a turn before any capture observer or provider can advance the clock.
      const work = Effect.gen(function* () {
        yield* Effect.yieldNow
        return yield* perform(params, input, parent, sessions, execution, admitted, store, artifacts, owned)
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
          return yield* restore(artifacts.replay(stopped.value))
        return yield* Effect.failCause(cause)
      }
      if (Option.isSome(result.value)) return result.value.value
      const stopped = yield* store.finish(ticket, { status: "expired" })
      return yield* restore(artifacts.replay(stopped))
    }))
  }))
})

function perform(params: ReviewEngagementPolicyV2.Input, input: Input, parent: SessionSchema.Info,
  sessions: SessionV2.Interface, execution: SessionExecution.Interface, admitted: ReviewEngagementStoreV2.Running,
  store: ReviewEngagementStoreV2.Interface, artifacts: ReviewEngagementArtifactsV2.Repository, owned: Set<SessionSchema.ID>) {
  return Effect.gen(function* () {
    const identity = admitted.identity
    const ticket = { identity, owner: admitted.owner }
    const git = input.services.atlas.git
    const worktree = yield* ReviewEngagementRuntimeV2.root(git, parent.location.directory)
    const source = yield* ReviewEngagementEvidenceV2.prepare(git, { worktree,
      ...(params.revision === undefined ? {} : { revision: params.revision }),
      ...(params.paths === undefined ? {} : { paths: params.paths }) })
    const captured = yield* store.capture(ticket, source)
    if (captured.state === "terminal") return yield* artifacts.replay(captured)
    const active = Effect.gen(function* () {
      const current = yield* store.read(identity)
      if (!current || current.state !== "running" || current.owner !== admitted.owner)
        return yield* failure("engagement-owner-lost", "evidence publication is no longer owned")
      if (current.source?.sha256 !== source.sha256)
        return yield* failure("engagement-evidence-corrupt", "captured evidence source changed")
      if ((yield* Clock.currentTimeMillis) >= admitted.budget.deadlineAt)
        return yield* failure("engagement-expired", "the original evidence publication deadline elapsed")
    })
    const authority: Effect.Effect<ReviewVariantValidationV2.Authority, Tool.Failure> = Effect.gen(function* () {
      const current = yield* store.read(identity)
      if (!current || current.state !== "running" || current.owner !== admitted.owner)
        return yield* failure("engagement-owner-lost", "variant evidence is no longer owned")
      if (current.schema !== "review-engagement-state-v3" || current.source?.sha256 !== source.sha256)
        return yield* failure("engagement-evidence-corrupt", "variant evidence lost its captured admission")
      return { namespace: identity.key, leadID: identity.leadID, children: current.children,
        input: current.input, budget: current.budget, source: current.source, journal: current.variants }
    })
    let variantPolicy: ReviewVariantsV2.Context | undefined
    const historyCoverage = params.profile === "audit" || params.profile === "diligence" ? "host" as const : undefined
    const collector = yield* artifacts.collect({ namespace: identity.key, inputHash: identity.inputHash, sessionID: identity.leadID,
      ...(historyCoverage ? { historyCoverage } : {}),
      budget: admitted.budget, source, active, authority, policy: Effect.suspend(() => variantPolicy ? Effect.succeed(variantPolicy)
        : Effect.fail(failure("engagement-evidence-corrupt", "variant policy has not been pinned by the host"))) })
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
      copies, headCommit: source.commit, scope: { sha256: source.sha256, files }, processes: input.processes,
      observeCode: collector.code })
    const read = (path: string, startLine: number, endLine: number) =>
      ReviewEngagementSourceV2.read(git, { worktree, prepared: source, path, startLine, endLine })
    const variants = ReviewEngagementVariantsV2.make({ ticket, store, collector, source, read })
    const children = new Map<SessionSchema.ID, ReviewEngagementStoreV2.Child>([[lead, { id: lead, key: "lead", role: "lead" }]])
    const runProbe = ReviewScopedProbeV2.make({ git, worktree, source, collector, processes: input.processes })
    const port: ReviewFanoutV2.Port = {
      ...(params.profile !== "diligence" ? {} : { scopedProbe: runProbe.initial }),
      create: (child) => Effect.gen(function* () {
        if (child.role === "lead" && child.key === "lead") return lead
        if (child.role === "lead" || child.key === "lead") return yield* failure("engagement-child-invalid", "child role conflicts with lead")
        const id = SessionSchema.ID.make(`ses_lucy_engagement_${ReviewEngagementReportV2.digest({ namespace: identity.key, key: child.key, role: child.role })}`)
        yield* sessions.create({ id, parentID: lead, agent: AgentV2.ID.make("lucy"),
          ...(parent.model ? { model: parent.model } : {}), location: parent.location }, { inheritParentPlacement: true }).pipe(
          Effect.mapError(() => failure("engagement-session-unavailable", "child Session is unavailable")))
        const claimed = yield* store.own(ticket, { ...child, id })
        if (claimed.state === "terminal") return yield* failure("engagement-expired", "child admission is closed")
        owned.add(id)
        children.set(id, { ...child, id })
        return id
      }),
      run: (child, brief, turn) => Effect.gen(function* () {
        if (!owned.has(child)) return yield* failure("engagement-child-invalid", "Session is not owned by this request")
        const native = yield* ReviewEngagementRuntimeV2.turn(sessions, execution, identity, child, brief, turn.key)
        const admission = children.get(child)
        if (!admission) return yield* failure("engagement-child-invalid", "native turn has no owned child admission")
        yield* collector.acknowledge(child, native.messages, { promptMessageID: native.prompt, childKey: admission.key,
          role: admission.role, turnKey: turn.key, ...(native.reply ? { reply: native.reply } : {}) })
        return native.reply?.text ?? ""
      }),
      analyze: (step) => Effect.gen(function* () {
        const evidence = yield* collector.analysis({ routing: step.routing, catalog })
        return yield* input.analyze({ ...step, catalog, worktree, base: source.commit, head: source.commit,
          sessionID: lead, evidence })
      }),
      region: (path, startLine, endLine) => read(path, startLine, endLine).pipe(Effect.map((quote) => quote.text)),
      binding: (bound) => Effect.gen(function* () {
        const granted = yield* binding({ ...bound, offered: {} })
        if (!historyCoverage || bound.role !== "lead" || bound.sessionID !== lead) return granted
        const retain = granted.retain
        return {
          ...granted,
          // History is already retained under the collector's shared quotas; CODE keeps its existing retention.
          ...(retain ? { retain: (artifact: { readonly uri: string; readonly text: string }) =>
            artifact.uri.startsWith(`history:${lead}/`) ? Effect.void : retain(artifact) } : {}),
          history: (historyInput, context, bindingActive) => Effect.gen(function* () {
            if (context.sessionID !== lead)
              return yield* failure("engagement-history-owner", "history is bound to the original lead")
            const started = yield* Clock.currentTimeMillis
            const deadline = Math.min(admitted.budget.deadlineAt, started + 30_000)
            const expired = () => failure("engagement-history-deadline", "the original history call deadline elapsed")
            const fence = Effect.gen(function* () {
              yield* active
              yield* bindingActive
              if ((yield* Clock.currentTimeMillis) >= deadline) return yield* expired()
            })
            return yield* Effect.gen(function* () {
              yield* fence
              const read = yield* ReviewScopedHistory.run(historyInput, {
                repository: worktree, inputHash: identity.inputHash,
                source: { sha256: source.sha256, commit: source.commit, files }, budget: admitted.budget,
                call: { sessionID: context.sessionID, assistantMessageID: context.assistantMessageID,
                  toolCallID: context.toolCallID }, active: fence,
              }).pipe(Effect.provideService(AppProcess.Service, input.processes))
              yield* fence
              yield* collector.history({ input: historyInput, result: read.result,
                sessionID: context.sessionID, assistantMessageID: context.assistantMessageID,
                toolCallID: context.toolCallID, active: bindingActive, admissionActive: fence })
              yield* fence
              return read
            }).pipe(Effect.timeoutOrElse({ duration: Duration.millis(Math.max(1, deadline - started)),
              orElse: () => Effect.fail(expired()) }))
          }),
        } satisfies ReviewTools.Binding
      }),
      allow: (ids) => Effect.sync(() => { for (const id of ids) if (!lenses.includes(id)) lenses.push(id) }),
    }
    const scope = { base: source.commit, head: source.commit, files: files.length, changedLines: 0 }
    const ran = yield* ReviewFanoutV2.run({
      completion: "report", repositoryFiles: files,
      request: { stage: "code", profile: params.profile, settings }, base: { files }, head: { files, changes: [] },
      catalog, stages: input.stages, skills: yield* input.services.atlas.skills.list(),
      fs: input.services.atlas.fs, store: input.services.store, verifierModel: "same", cache, reviewed: source.commit,
      afterConfirmed: (context, stages) => Effect.gen(function* () {
        if (variantPolicy) return yield* failure("engagement-evidence-corrupt", "variant policy was admitted twice")
        variantPolicy = context
        return yield* ReviewVariantsV2.run({ ...context, namespace: identity.key, inputHash: identity.inputHash, source }, stages, variants)
      }),
      facts: { workCard: JSON.stringify({ requestID: params.requestID, profile: params.profile, brief: params.brief,
        source, scope }), diff: "", rules: [], scope, record: [] },
    }, port)
    if (ran.status !== "ran") return yield* failure("engagement-unaddressed", "unexpected first-round state")
    const report = yield* ReviewEngagementReportV2.completed({ input: params, inputHash: identity.inputHash,
      sessionID: lead, budget: admitted.budget, source, variantCoverage: "host",
      ...(historyCoverage ? { historyCoverage } : {}), notExamined: yield* collector.gaps() }, {
      reply: ran.reply, expected: { routing: ran.routing, scope, checkFacts: ran.checkFacts,
        ...(ReviewRouting.tier(ran.routing) === "quick" ? {} : { confirmed: ran.confirmed }) }, read,
    })
    if (!report.value.report || ReviewResultV2.method({ profile: report.value.report.profile, tier: report.value.report.tier }) !== ran.method)
      return yield* failure("engagement-report-invalid", "method mismatch")
    const evidence = yield* collector.seal(report, ran)
    return yield* artifacts.replay(yield* store.finish(ticket, { status: "completed", result: report, evidence }))
  })
}

