export * as ReviewPRRequestV2 from "./review-pr"

import { createHash } from "node:crypto"
import { Cause, Effect, Option, Schema, Scope } from "effect"
import { Database } from "@orchestra/core/database/database"
import { EventV2 } from "@orchestra/core/event"
import { ReviewPrecisionCatalog } from "@orchestra/core/review/precision-catalog"
import { ReviewPrecisionStore } from "@orchestra/core/review/precision-store"
import { AgentV2 } from "@orchestra/core/agent"
import { ReviewCatalog } from "@orchestra/core/review/catalog"
import type { ReviewRoute } from "@orchestra/core/review/route"
import { ReviewRouting } from "@orchestra/core/review/routing"
import { ReviewProbe } from "@orchestra/core/review-toolkit/probe"
import { ReviewScratch } from "@orchestra/core/review-toolkit/scratch-copy"
import { AppProcess } from "@orchestra/core/process"
import { SessionSchema, type SessionV2 } from "@orchestra/core/session"
import type { SessionExecution } from "@orchestra/core/session/execution"
import { TaskTool } from "@orchestra/core/tool/task"
import { Tool } from "@orchestra/core/tool/tool"
import { SessionMessage } from "@orchestra/schema/session-message"
import { GovernanceRecordsV2 } from "../governance/records"
import { ReviewResultV2 } from "../governance/review-result"
import { ReviewCardV2 } from "../workflow/review-card"
import { ReviewFanoutV2 } from "../workflow/review-fanout"
import { ReviewPREvidenceV2 } from "../workflow/review-pr-evidence"
import type { MaestroChainTools } from "./chain"
import type { MaestroReviewTools } from "./review"
import { ReviewPRConcurrencyV2 } from "./review-pr-concurrency"
import { ReviewPRFactsV2 } from "./review-pr-facts"

export const Input = Schema.Struct({
  kind: Schema.Literal("pr"), baseRef: Schema.NonEmptyString, headRef: Schema.NonEmptyString,
  prText: Schema.optional(Schema.String), tier: Schema.optional(Schema.NonEmptyString),
}).annotate({ parseOptions: { onExcessProperty: "error" } })
export type Input = typeof Input.Type

const failure = (reason: string, detail: string) => new Tool.Failure({ message: `${reason}: ${detail}`, metadata: { reason } })
const sha256 = (value: string) => createHash("sha256").update(value).digest("hex")
const optional = (value: string | undefined) => value === undefined ? { present: false } : { present: true, value }

export const run = Effect.fn("ReviewPRRequestV2.run")(function* (params: Input, input: {
  readonly sessionID: SessionSchema.ID
  readonly services: MaestroChainTools.Services
  readonly sessions: Option.Option<SessionV2.Interface>
  readonly execution: Option.Option<SessionExecution.Interface>
  readonly analyze: MaestroReviewTools.Analyze
  readonly stages: ReviewFanoutV2.Stages
  readonly processes: AppProcess.Interface
  readonly binding: typeof MaestroReviewTools.reviewBinding
  readonly analysisStore: typeof MaestroReviewTools.analysisStore
  readonly settings: (projectID: SessionSchema.Info["projectID"]) => Effect.Effect<ReviewRoute.Request["settings"]>
}) {
  if (params.prText !== undefined && Buffer.byteLength(params.prText, "utf8") > 64 * 1024)
    return yield* failure("pr-text-too-large", "PR text exceeds 64 KiB")
  if (Option.isNone(input.sessions) || Option.isNone(input.execution))
    return yield* failure("session-execution-unavailable", "PR review requires Session execution")
  const sessions = input.sessions.value
  const execution = input.execution.value
  const parent = yield* input.services.store.get(input.sessionID)
  if (!parent) return yield* failure("pr-session-unavailable", "parent Session is unavailable")
  const git = input.services.atlas.git
  const root = yield* git.run(["rev-parse", "--show-toplevel"], { cwd: parent.location.directory })
  const worktree = root.text().replace(/\r?\n$/, "")
  if (root.exitCode !== 0 || root.truncated || !worktree) return yield* failure("pr-root-unavailable", "Git root is unavailable")
  const prepared = yield* ReviewPREvidenceV2.prepare(git, { worktree, baseRef: params.baseRef, headRef: params.headRef })
  const settings = yield* input.settings(parent.projectID)
  const candidate = GovernanceRecordsV2.hash({
    domain: "orchestra-pr-review-v1", parent: parent.id, project: parent.projectID, location: parent.location,
    baseRef: params.baseRef, headRef: params.headRef, baseCommit: prepared.baseCommit, headCommit: prepared.headCommit,
    baseSHA: prepared.baseSHA, headSHA: prepared.headSHA, diffSHA256: prepared.sha256,
    prText: optional(params.prText), tier: optional(params.tier), catalog: ReviewCatalog.catalogDigest(ReviewCatalog.current), settings,
  })
  return yield* ReviewPRConcurrencyV2.withCandidate(candidate, (waited) => Effect.gen(function* () {
    const cache = `pr_${candidate}`
    const store = input.analysisStore(cache)
    const lead = SessionSchema.ID.make(`ses_lucy_pr_${sha256(`${candidate}\0lead`)}`)
    const sessionID = (key: string) => key === "lead" ? lead : SessionSchema.ID.make(`ses_lucy_pr_${sha256(`${candidate}\0${key}`)}`)
    const promptID = (child: SessionSchema.ID, turn: string) => SessionMessage.ID.make(`msg_lucy_pr_${sha256(`${candidate}\0${child}\0${turn}`)}`)
    const existing = yield* input.services.store.get(lead)
    const retained = yield* ReviewPRFactsV2.read(store, candidate)
    if (waited && !existing && !retained) return yield* failure("pr-retry-incomplete", "prior review did not start a Session")
    const finish = promptID(lead, "finish")
    const replyFor = (child: SessionSchema.ID, prompt: SessionMessage.ID) => sessions.messages({ sessionID: child, order: "asc" }).pipe(
      Effect.map((messages) => TaskTool.completedReply(messages, prompt)?.content.findLast(
        (part): part is SessionMessage.AssistantText => part.type === "text",
      )?.text),
      Effect.mapError(() => failure("pr-session-unavailable", "review messages unavailable")),
    )
    if (existing || retained) {
      if (!existing || !retained) return yield* failure("pr-retry-incomplete", "prior review did not finish")
      const reply = yield* replyFor(lead, finish)
      if (!reply) return yield* failure("pr-retry-incomplete", "completed finish reply unavailable")
      return yield* output(reply, retained, prepared, worktree, git, parent.projectID, input.services)
    }
    const batches = yield* ReviewPrecisionStore.history().pipe(
      Effect.provideService(Database.Service, { db: input.services.db }),
      Effect.catchCause((cause) => Effect.fail(failure("precision-history", Cause.pretty(cause)))),
    )
    const catalog = yield* Effect.try({
      try: () => ReviewPrecisionCatalog.effective({ project: parent.projectID, catalog: ReviewCatalog.current, batches }),
      catch: (error) => failure("precision-history", error instanceof Error ? error.message : String(error)),
    })
    const rules = yield* ReviewFanoutV2.baseRules(git, worktree, prepared.baseSHA, prepared.changedPaths)
    const lenses: string[] = []
    const ledger = ReviewProbe.ledger()
    const parentScope = yield* Scope.Scope
    const copies = yield* Effect.cached(Effect.all({
      head: ReviewScratch.create({ worktree, revision: prepared.headSHA }),
      base: ReviewScratch.create({ worktree, revision: prepared.baseSHA }),
    }, { concurrency: 1 }).pipe(
      Effect.provideService(AppProcess.Service, input.processes),
      Effect.provideService(Scope.Scope, parentScope),
    ))
    const binding = input.binding({ worktree, diff: prepared.diff, cache, lenses, ledger, copies, headCommit: prepared.headSHA })
    let first = true
    const port: ReviewFanoutV2.Port = {
      create: (child) => sessions.create({ id: sessionID(child.key), parentID: child.role === "lead" ? parent.id : lead,
        agent: AgentV2.ID.make("lucy"), ...(parent.model ? { model: parent.model } : {}), location: parent.location }).pipe(
          Effect.map((created) => created.id), Effect.mapError(() => failure("pr-session-unavailable", "child Session unavailable"))),
      run: (child, brief, turn) => Effect.gen(function* () {
        if (first) {
          yield* ReviewPREvidenceV2.recheck(git, worktree, prepared)
          first = false
        }
        const prompt = promptID(child, turn.key)
        yield* sessions.prompt({ id: prompt, sessionID: child, prompt: { text: brief }, delivery: "queue", resume: false }).pipe(
          Effect.mapError(() => failure("pr-prompt-refused", "review prompt refused")))
        yield* execution.resume(child, { interruptOnCancel: true }).pipe(Effect.mapError(() => failure("pr-execution-failed", "review execution failed")))
        return (yield* replyFor(child, prompt)) ?? ""
      }),
      analyze: (step) => input.analyze({ ...step, catalog, worktree, base: prepared.baseSHA, head: prepared.headSHA, sessionID: lead, changes: prepared.changes }),
      region: (file, start, end) => git.run(["show", `${prepared.headSHA}:${file}`], { cwd: worktree }).pipe(
        Effect.map((result) => result.exitCode === 0 && !result.truncated ? result.text().split("\n").slice(start - 1, end).join("\n") : "")),
      binding,
      allow: (ids) => Effect.sync(() => { for (const id of ids) if (!lenses.includes(id)) lenses.push(id) }),
    }
    const scope = { base: prepared.baseSHA, head: prepared.headSHA, files: prepared.changedPaths.length,
      changedLines: prepared.changes.reduce((sum, change) => sum + change.added.length + change.removed, 0) }
    const ran = yield* Effect.scoped(ReviewFanoutV2.run({
      completion: "card-only", request: { stage: "code", profile: "pr", settings, ...(params.tier ? { tier: params.tier } : {}) },
      base: { files: prepared.baseFiles }, head: { files: prepared.headFiles, changes: prepared.changes },
      catalog, stages: input.stages, skills: yield* input.services.atlas.skills.list(),
      fs: input.services.atlas.fs, store: input.services.store, verifierModel: "same", cache, reviewed: prepared.headSHA,
      facts: { workCard: JSON.stringify({ candidate, scope, changedPaths: prepared.changedPaths, diffSHA256: prepared.sha256 }),
        ...(params.prText === undefined ? {} : { prText: params.prText }), diff: prepared.diff, rules, scope, record: [] },
    }, port))
    if (ran.status !== "ran") return yield* failure("pr-unaddressed", "unexpected first-round state")
    const facts = { candidate, method: ran.method, routing: ran.routing, scope, confirmed: ran.confirmed, checkFacts: ran.checkFacts, outcomes: ran.outcomes }
    yield* ReviewPRFactsV2.write(store, facts)
    return yield* output(ran.reply, facts, prepared, worktree, git, parent.projectID, input.services)
  }))
})

function output(reply: string, facts: ReviewPRFactsV2.Facts, prepared: ReviewPREvidenceV2.Prepared, worktree: string,
  git: MaestroChainTools.Services["atlas"]["git"], project: string, services: MaestroChainTools.Services) {
  return Effect.gen(function* () {
    const card = yield* Effect.try({
      try: () => ReviewCardV2.validate(reply, { routing: facts.routing, scope: facts.scope, checkFacts: facts.checkFacts,
        ...(ReviewRouting.tier(facts.routing) === "quick" ? {} : { confirmed: facts.confirmed }) }),
      catch: (error) => failure("pr-card-invalid", String(error)),
    })
    if (ReviewResultV2.method({ profile: card.profile, tier: card.tier }) !== facts.method)
      return yield* failure("pr-card-invalid", "method mismatch")
    if (card.tier === "quick") for (const finding of card.findings) {
      if (!prepared.changedPaths.includes(finding.path) || !prepared.headFiles.includes(finding.path) ||
        !prepared.changes.some((change) => change.path === finding.path && change.added.some((line) => line.line === finding.line)) ||
        finding.evidence.kind !== "quote") return yield* failure("pr-quote-unavailable", "finding is not an added head line")
      const blob = yield* git.run(["show", `${prepared.headSHA}:${finding.path}`], { cwd: worktree, maxOutputBytes: 4 * 1024 * 1024 })
      if (blob.exitCode !== 0 || blob.truncated) return yield* failure("pr-quote-unavailable", "head blob unavailable")
      const text = yield* Effect.try({ try: () => new TextDecoder("utf-8", { fatal: true }).decode(blob.stdout),
        catch: () => failure("pr-quote-unavailable", "head blob is not UTF-8") })
      const lines = text.split("\n")
      const actualLineCount = text.length === 0 ? 0 : lines.length - Number(text.endsWith("\n"))
      const quoted = lines.slice(finding.evidence.startLine - 1, finding.evidence.endLine).join("\n")
      if (finding.evidence.endLine > actualLineCount || quoted.trim().length === 0)
        return yield* failure("pr-quote-unavailable", "quote range is empty or outside the head blob")
    }
    yield* ReviewPrecisionStore.append({ review: `pr:${facts.candidate}`, project, reads: facts.outcomes }).pipe(
      Effect.provideService(Database.Service, { db: services.db }),
      Effect.provideService(EventV2.Service, services.events),
      Effect.catchCause((cause) => Effect.fail(failure("precision-admission", Cause.pretty(cause)))),
    )
    return `PR identity: ${JSON.stringify({ candidate: facts.candidate, baseRef: prepared.baseRef, headRef: prepared.headRef,
      baseCommit: prepared.baseCommit, headCommit: prepared.headCommit, baseSHA: prepared.baseSHA, headSHA: prepared.headSHA,
      diffSHA256: prepared.sha256 })}\n\n\`\`\`${ReviewResultV2.TAG}\n${JSON.stringify(card)}\n\`\`\``
  })
}
