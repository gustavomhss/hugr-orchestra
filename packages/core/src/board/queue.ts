export * as BoardQueue from "./queue"

import fs from "fs/promises"
import os from "os"
import path from "path"
import { and, asc, desc, eq, inArray, isNull, ne, sql } from "drizzle-orm"
import { Clock, Effect, Option, Schema } from "effect"
import { ChildProcess } from "effect/unstable/process"
import { Board } from "@orchestra/schema/board"
import type { AppProcess } from "../process"
import { which } from "../util/which"
import { BoardCi } from "./ci"
import type { BoardGithub } from "./github"
import { BoardLedger } from "./ledger"
import type { BoardRecord } from "./record"
import {
  BoardAttemptTable,
  BoardBundleMemberTable,
  BoardBundleTable,
  BoardCheckTable,
  BoardDependencyTable,
  BoardEpicTable,
  BoardFlakeTable,
  BoardIssueTable,
  BoardNoteTable,
  BoardProjectTable,
  BoardQueueTable,
} from "./sql"
import { BoardSnapshot } from "./snapshot"
import { changed, endOf, gitRunner, loadIssue, loadProject, log, RefusedError, worktree } from "./shared"
import type { Changed, IssueRow, ProjectRow, Tx } from "./shared"

// The merge queue (docs/specs/maestro-lead/merge-queue.md sections 6.1 to 6.6, phase 1). Only the host moves a card
// into or out of the `queue` stage: `board_queue` enqueues a verified Review card, and the tick cuts one bundle per
// project, waits for its full gate, and pushes base to the tested head. A red bundle is halved until one card fails
// alone and is ejected into a new attempt; infrastructure failures rerun once and then pause the queue; the size follows
// the red rate; the failed jobs' logs give the failing files; a red whose failing files are bun tests in package groups runs them scoped on base and on the bundle head (base
// red, code red, or flaky); Maestro merges or retries a flaky bundle, and retries a paused one, with `board_bundle`.
// Projects settle concurrently, and a project still settling is skipped, never run twice.

export interface Deps {
  readonly quiet: <A>(work: (tx: Tx) => Effect.Effect<A, unknown>) => Effect.Effect<A>
  readonly proc: AppProcess.Interface
  readonly env?: NodeJS.ProcessEnv
  readonly gh: BoardGithub.Gh
  readonly contract: (directory: string, project: ProjectRow) => Effect.Effect<BoardCi.Contract, { readonly message: string }>
  readonly publish: (changed: Changed) => Effect.Effect<void>
  /** Atlas's record renderer and trailer writer; unbound until its adapter lands. */
  readonly record?: BoardRecord.Port
}

const Pull = Schema.Struct({ head: Schema.Struct({ sha: Schema.String, ref: Schema.String }) })
const decodePull = Schema.decodeUnknownOption(Schema.fromJsonString(Pull))
const Rollup = Schema.Struct({
  headRefOid: Schema.String,
  statusCheckRollup: Schema.Array(
    Schema.Struct({
      name: Schema.optional(Schema.String),
      context: Schema.optional(Schema.String),
      status: Schema.optional(Schema.String),
      conclusion: Schema.optional(Schema.NullOr(Schema.String)),
      state: Schema.optional(Schema.String),
      workflowName: Schema.optional(Schema.String),
      detailsUrl: Schema.optional(Schema.String),
    }),
  ),
})
const decodeRollup = Schema.decodeUnknownOption(Schema.fromJsonString(Rollup))
const decodeRuns = Schema.decodeUnknownOption(Schema.fromJsonString(Rollup.fields.statusCheckRollup))
const Dry = Schema.Struct({ packages: Schema.Array(Schema.String) })
const decodeDry = Schema.decodeUnknownOption(Schema.fromJsonString(Dry))

const FAILED = new Set(["FAILURE", "TIMED_OUT", "CANCELLED", "STARTUP_FAILURE", "ACTION_REQUIRED", "ERROR"])
const PASSED = new Set(["SUCCESS", "SKIPPED", "NEUTRAL"])
const INFRA = new Set(["CANCELLED", "TIMED_OUT", "STARTUP_FAILURE"])
const AUTHOR = ["-c", "user.name=Orchestra", "-c", "user.email=orchestra@users.noreply.github.com"]

export function make(deps: Deps) {
  const git = gitRunner(deps.proc, deps.env)

  /** Reads a PR's head through the API, fetches it, and checks the fetched commit is that head. */
  const head = Effect.fnUntraced(function* (directory: string, repo: string, pr: number) {
    const pulled = yield* deps.gh(["api", `repos/${repo}/pulls/${pr}`])
    const pull = pulled.exitCode === 0 ? Option.getOrUndefined(decodePull(pulled.stdout)) : undefined
    if (!pull) return yield* new RefusedError({ message: `PR #${pr} could not be read: ${pulled.stderr.trim() || "no head"}.` })
    yield* git(directory, ["fetch", "--quiet", "--no-tags", "origin", pull.head.ref])
    const fetched = (yield* git(directory, ["rev-parse", "--verify", "--quiet", `${pull.head.sha}^{commit}`])).out
    if (fetched !== pull.head.sha)
      return yield* new RefusedError({ message: `PR #${pr}'s head ${pull.head.sha.slice(0, 10)} is not on origin/${pull.head.ref}.` })
    return { sha: pull.head.sha, tree: (yield* git(directory, ["rev-parse", `${pull.head.sha}^{tree}`])).out }
  })

  const enqueue = Effect.fnUntraced(function* (input: Board.QueueInput) {
    const ref = `${input.project}-${input.number}`
    const found = yield* deps.quiet((tx) =>
      Effect.gen(function* () {
        const project = yield* loadProject(tx, input.project)
        const issue = yield* loadIssue(tx, project, input.number)
        const attempt = yield* tx
          .select()
          .from(BoardAttemptTable)
          .where(and(eq(BoardAttemptTable.issue_id, issue.id), isNull(BoardAttemptTable.outcome)))
          .orderBy(desc(BoardAttemptTable.n))
          .get()
        const waits = yield* tx
          .select({ number: BoardIssueTable.number, stage: BoardIssueTable.stage })
          .from(BoardDependencyTable)
          .innerJoin(BoardIssueTable, eq(BoardIssueTable.id, BoardDependencyTable.depends_on_id))
          .where(eq(BoardDependencyTable.issue_id, issue.id))
          .all()
        return { project, issue, attempt, waits, directory: yield* worktree(tx, project) }
      }).pipe(Effect.result),
    )
    if (found._tag === "Failure") return yield* found.failure
    const { project, issue } = found.success
    if (issue.stage !== "review") return yield* new RefusedError({ message: `${ref} is in ${issue.stage}; only a Review card is queued.` })
    if (!issue.pr_number) return yield* new RefusedError({ message: `${ref} has no PR to queue.` })
    if (!project.github_repo || !found.success.directory)
      return yield* new RefusedError({ message: `${input.project} needs a linked repository and its GitHub repo before cards queue.` })
    if (issue.paused) return yield* new RefusedError({ message: `${ref} is paused.` })
    if (found.success.attempt?.conflict_base)
      return yield* new RefusedError({
        message: `${ref} conflicts with base in ${(found.success.attempt.conflict_files ?? []).join(", ")}; merge base in its worktree first.`,
      })
    const waiting = found.success.waits.filter((dep) => dep.stage !== "shipped" && dep.stage !== "queue")
    if (waiting.length > 0)
      return yield* new RefusedError({
        message: `${ref} depends on ${waiting.map((dep) => `${input.project}-${dep.number}`).join(", ")}, which is neither shipped nor queued.`,
      })
    const missing = incomplete(issue.record)
    if (missing.length > 0)
      return yield* new RefusedError({ message: `${ref}'s PR record has no ${missing.join(", ")}; write it with board_issue first.` })
    const follow = issue.record?.follow_ups ?? []
    if (follow.length > 0) {
      const known = yield* deps.quiet((tx) =>
        tx.select({ number: BoardIssueTable.number }).from(BoardIssueTable).where(eq(BoardIssueTable.project_id, project.id)).all(),
      )
      const unknown = follow.filter((key) => !known.some((row) => key === `${input.project}-${row.number}`))
      if (unknown.length > 0)
        return yield* new RefusedError({ message: `${ref}'s follow-ups ${unknown.join(", ")} are not cards on ${input.project}.` })
    }
    const directory = found.success.directory
    const contract = yield* deps.contract(directory, project).pipe(Effect.mapError((error) => new RefusedError({ message: error.message })))
    const pr = yield* head(directory, project.github_repo, issue.pr_number)
    const checks = yield* deps.quiet((tx) =>
      tx
        .select()
        .from(BoardCheckTable)
        .where(and(eq(BoardCheckTable.issue_id, issue.id), eq(BoardCheckTable.tree_sha, pr.tree)))
        .all(),
    )
    const state = BoardCi.state(checks, contract)
    if (state === "scoped-red") return yield* new RefusedError({ message: `${ref} is scoped-red on its PR head; fix it before queueing.` })
    const required = contract.scoped.tests !== null || contract.scoped.workflows.length > 0
    if (required && state !== "scoped-green")
      return yield* new RefusedError({
        message: `${ref} is not scoped-green on its PR head ${pr.sha.slice(0, 10)}; run ci_run on that tree first.`,
      })
    const now = yield* Clock.currentTimeMillis
    const done = yield* deps.quiet((tx) =>
      Effect.gen(function* () {
        const current = yield* loadIssue(tx, project, input.number)
        if (current.stage !== "review" || current.pr_number !== issue.pr_number)
          return yield* new RefusedError({ message: `${ref} changed while it was being checked; try again.` })
        yield* tx
          .insert(BoardQueueTable)
          .values({ issue_id: issue.id, project_id: project.id, head_sha: pr.sha, urgent: input.urgent ?? false, flush: input.flush ?? false, queued_at: now })
          .run()
        const moved = yield* place(tx, project, current, "queue")
        const activity = yield* log(tx, {
          project: project.id,
          issue: issue.id,
          actor: "maestro",
          action: "queue.add",
          reason: input.reason,
          before: moved.before,
          after: { ...moved.after, head: pr.sha, urgent: input.urgent ?? false },
        })
        return changed(project.id, activity, issue.id)
      }).pipe(Effect.result),
    )
    if (done._tag === "Failure") return yield* done.failure
    yield* deps.publish(done.success)
    yield* describe(project, issue.id, contract.base)
    return { head: pr.sha, tree: pr.tree, state }
  })

  const dequeue = Effect.fnUntraced(function* (input: Board.DequeueInput) {
    const ref = `${input.project}-${input.number}`
    const done = yield* deps.quiet((tx) =>
      Effect.gen(function* () {
        const project = yield* loadProject(tx, input.project)
        const issue = yield* loadIssue(tx, project, input.number)
        if (issue.stage !== "queue") return yield* new RefusedError({ message: `${ref} is not queued.` })
        const bundle = yield* openBundle(tx, project.id)
        const member = bundle ? yield* isMember(tx, bundle.id, issue.id) : false
        const back = yield* release(tx, project, issue, "maestro", "queue.remove", input.reason)
        return { project, back, bundle: member ? bundle : undefined }
      }).pipe(Effect.result),
    )
    if (done._tag === "Failure") return yield* done.failure
    yield* deps.publish(done.success.back)
    if (done.success.bundle) yield* dissolve(done.success.project, done.success.bundle, `${ref} left the queue.`)
    return { dissolved: done.success.bundle?.n ?? null }
  })

  /** Section 6.4: Maestro's verdict on a flaky or paused bundle. */
  const decide = Effect.fnUntraced(function* (input: Board.BundleInput) {
    const ref = `${input.project}-B${input.bundle}`
    const done = yield* deps.quiet((tx) =>
      Effect.gen(function* () {
        const project = yield* loadProject(tx, input.project)
        const bundle = yield* tx
          .select()
          .from(BoardBundleTable)
          .where(and(eq(BoardBundleTable.project_id, project.id), eq(BoardBundleTable.n, input.bundle)))
          .get()
        if (!bundle) return yield* new RefusedError({ message: `${ref} is not a bundle.` })
        const members = yield* tx
          .select({ issue: BoardIssueTable })
          .from(BoardBundleMemberTable)
          .innerJoin(BoardIssueTable, eq(BoardIssueTable.id, BoardBundleMemberTable.issue_id))
          .where(eq(BoardBundleMemberTable.bundle_id, bundle.id))
          .orderBy(asc(BoardBundleMemberTable.position))
          .all()
        return { project, bundle, issues: members.map((member) => member.issue) }
      }).pipe(Effect.result),
    )
    if (done._tag === "Failure") return yield* done.failure
    const bundle = done.success.bundle
    const issues = done.success.issues
    if (input.verdict === "merge") {
      if (bundle.status !== "flaky") return yield* new RefusedError({ message: `${ref} is ${bundle.status}; only a flaky bundle merges.` })
      yield* deps.quiet((tx) => tx.update(BoardBundleTable).set({ status: "accepted" }).where(eq(BoardBundleTable.id, bundle.id)).run())
      yield* Effect.forEach(
        issues,
        (issue) => note(done.success.project, issue, `Maestro accepted flaky bundle ${ref}: ${input.reason}. It merges as tested on the next tick.`),
        { discard: true },
      )
      yield* Effect.logInfo(`integration: ${ref} ${input.verdict} by Maestro: ${input.reason}`)
      return { status: "accepted" as const }
    }
    if (input.verdict === "release") {
      if (bundle.status !== "dissolved" || input.card === undefined)
        return yield* new RefusedError({ message: `${ref} is ${bundle.status}; release names a held card of a dissolved bundle.` })
      const issue = issues.find((item) => item.number === input.card)
      const held = issue
        ? yield* deps.quiet((tx) =>
            tx
              .select()
              .from(BoardQueueTable)
              .where(and(eq(BoardQueueTable.issue_id, issue.id), eq(BoardQueueTable.hold, "held")))
              .get(),
          )
        : undefined
      if (!issue || !held) return yield* new RefusedError({ message: `${input.project}-${input.card} is not held in ${ref}.` })
      yield* deps.quiet((tx) => tx.update(BoardQueueTable).set({ hold: "alone", flush: true }).where(eq(BoardQueueTable.issue_id, issue.id)).run())
      yield* note(done.success.project, issue, `Maestro released this card from ${ref}: ${input.reason}. It rides a bundle alone next.`)
      yield* Effect.logInfo(`integration: ${ref} ${input.verdict} by Maestro: ${input.reason}`)
      return { status: "released" as const }
    }
    if (bundle.status !== "flaky" && bundle.status !== "paused")
      return yield* new RefusedError({ message: `${ref} is ${bundle.status}; only a flaky or paused bundle retries.` })
    yield* deps.quiet((tx) =>
      tx
        .update(BoardQueueTable)
        .set({ flush: true })
        .where(inArray(BoardQueueTable.issue_id, issues.map((issue) => issue.id)))
        .run(),
    )
    yield* Effect.forEach(
      issues,
      (issue) => note(done.success.project, issue, `Maestro retried bundle ${ref}: ${input.reason}. The queue cuts its cards into a new bundle.`),
      { discard: true },
    )
    if (bundle.status === "paused") {
      yield* deps.quiet((tx) => tx.update(BoardBundleTable).set({ status: "infra" }).where(eq(BoardBundleTable.id, bundle.id)).run())
      yield* Effect.logInfo(`integration: ${ref} ${input.verdict} by Maestro: ${input.reason}`)
      return { status: "infra" as const }
    }
    const repo = done.success.project.github_repo
    if (repo) yield* close(done.success.project, repo, bundle, `retried by Maestro: ${input.reason}`)
    if (!repo) yield* deps.quiet((tx) => tx.update(BoardBundleTable).set({ status: "dissolved" }).where(eq(BoardBundleTable.id, bundle.id)).run())
    yield* Effect.logInfo(`integration: ${ref} ${input.verdict} by Maestro: ${input.reason}`)
    return { status: "dissolved" as const }
  })

  // Projects settle concurrently, and a project still settling (a scoped run can take minutes) is skipped, never run twice.
  const busy = new Set<string>()

  /** One pass over every active project: settle the open bundle, else cut a new one. The poll runs it every minute. */
  const tick = Effect.fnUntraced(function* () {
    const rows = yield* deps.quiet((tx) => tx.select().from(BoardProjectTable).where(ne(BoardProjectTable.status, "archived")).all())
    yield* Effect.forEach(
      rows,
      (row) =>
        Effect.gen(function* () {
          if (busy.has(row.id)) return
          busy.add(row.id)
          yield* project(row).pipe(Effect.ignore, Effect.ensuring(Effect.sync(() => busy.delete(row.id))))
        }),
      { concurrency: "unbounded", discard: true },
    )
  })

  const project = Effect.fnUntraced(function* (row: ProjectRow) {
    const directory = yield* deps.quiet((tx) => worktree(tx, row))
    if (!directory || !row.github_repo) return
    const contract = yield* deps.contract(directory, row)
    const bundle = yield* deps.quiet((tx) => openBundle(tx, row.id))
    if (bundle) return yield* settle(row, row.github_repo, directory, contract, bundle)
    yield* cut(row, row.github_repo, directory, contract)
  })

  const cut = Effect.fnUntraced(function* (row: ProjectRow, repo: string, directory: string, contract: BoardCi.Contract) {
    const now = yield* Clock.currentTimeMillis
    const queued = yield* deps.quiet((tx) =>
      Effect.gen(function* () {
        const cards = yield* tx
          .select({ queue: BoardQueueTable, issue: BoardIssueTable })
          .from(BoardQueueTable)
          .innerJoin(BoardIssueTable, eq(BoardIssueTable.id, BoardQueueTable.issue_id))
          .where(eq(BoardQueueTable.project_id, row.id))
          .orderBy(desc(BoardQueueTable.urgent), asc(BoardQueueTable.queued_at))
          .all()
        const ids = cards.map((card) => card.issue.id)
        const waits = ids.length
          ? yield* tx
              .select({ issue: BoardDependencyTable.issue_id, on: BoardDependencyTable.depends_on_id, stage: BoardIssueTable.stage })
              .from(BoardDependencyTable)
              .innerJoin(BoardIssueTable, eq(BoardIssueTable.id, BoardDependencyTable.depends_on_id))
              .where(inArray(BoardDependencyTable.issue_id, ids))
              .all()
          : []
        const attempts = ids.length
          ? yield* tx
              .select()
              .from(BoardAttemptTable)
              .where(and(inArray(BoardAttemptTable.issue_id, ids), isNull(BoardAttemptTable.outcome)))
              .all()
          : []
        const epics = [...new Set(cards.map((card) => card.issue.epic_id).filter((id) => id !== null))]
        const open = epics.length
          ? yield* tx
              .select({ epic: BoardIssueTable.epic_id, stage: BoardIssueTable.stage })
              .from(BoardIssueTable)
              .where(and(inArray(BoardIssueTable.epic_id, epics), ne(BoardIssueTable.stage, "shipped"), ne(BoardIssueTable.stage, "cut")))
              .all()
          : []
        // A green base probe only clears base: the red bundle it was probing for still decides the next cut.
        const closed = yield* tx
          .select()
          .from(BoardBundleTable)
          .where(and(eq(BoardBundleTable.project_id, row.id), ne(BoardBundleTable.status, "open")))
          .orderBy(desc(BoardBundleTable.n))
          .limit(2)
          .all()
        const last = closed[0]?.status === "probe-green" ? closed[1] : closed[0]
        const lastMembers = last
          ? yield* tx.select().from(BoardBundleMemberTable).where(eq(BoardBundleMemberTable.bundle_id, last.id)).all()
          : []
        return { cards, waits, attempts, open, settled: yield* BoardLedger.settled(tx, row.id), last: last && { status: last.status, base_sha: last.base_sha, members: lastMembers.length, rebuilds: last.rebuilds } }
      }),
    )
    if (queued.cards.length === 0) return
    if (queued.last?.status === "paused" || queued.last?.status === "flaky") return
    const full = size(queued.settled, contract.bundle)
    const alone = queued.cards.find((card) => card.queue.hold === "alone")
    const split = (queued.last?.status === "red" && queued.last.members > 1) || queued.last?.status === "probing"
    const cap = alone ? 1 : split && queued.last ? Math.max(1, Math.floor(queued.last.members / 2)) : full
    const due =
      alone !== undefined ||
      split ||
      queued.cards.length >= full ||
      queued.cards.some((card) => card.queue.flush) ||
      now - Math.min(...queued.cards.map((card) => card.queue.queued_at)) >= contract.bundle.waitMinutes * 60_000 ||
      queued.cards.some(
        (card) => card.issue.epic_id !== null && queued.open.filter((item) => item.epic === card.issue.epic_id).every((item) => item.stage === "queue"),
      )
    if (!due) return
    const base = contract.base
    yield* git(directory, ["fetch", "--quiet", "--no-tags", "origin", base])
    const tip = (yield* git(directory, ["rev-parse", "--verify", "--quiet", `refs/remotes/origin/${base}`])).out
    if (!tip) return
    if (queued.last?.status === "base-red" && tip === queued.last.base_sha) return
    const scratch = yield* Effect.promise(() => fs.mkdtemp(path.join(os.tmpdir(), `orchestra-bundle-${row.key}-`)))
    const added = yield* git(directory, ["worktree", "add", "--quiet", "--detach", scratch, tip])
    if (added.code !== 0) return
    const ejections: Array<{ readonly card: string; readonly cause: string }> = []
    const members = yield* Effect.gen(function* () {
      const taken: Array<{ readonly issue: IssueRow; readonly head: string }> = []
      for (const card of alone ? [alone] : queued.cards) {
        if (taken.length >= cap) break
        if (card.queue.hold === "held") continue
        if (card.issue.hold_before_merge || card.issue.paused) continue
        const attempt = queued.attempts.find((item) => item.issue_id === card.issue.id)
        if (attempt?.conflict_base) continue
        const ready = queued.waits
          .filter((dep) => dep.issue === card.issue.id)
          .every((dep) => dep.stage === "shipped" || taken.some((item) => item.issue.id === dep.on))
        if (!ready) continue
        const current = yield* head(directory, repo, card.issue.pr_number ?? 0).pipe(Effect.orElseSucceed(() => undefined))
        const key = `${row.key}-${card.issue.number}`
        if (current?.sha !== card.queue.head_sha) {
          yield* moved(row, card.issue, current?.sha)
          ejections.push({ card: key, cause: "head moved after it queued" })
          continue
        }
        const message = [
          `Merge ${key}: ${card.issue.title}`,
          ...(deps.record ? ["", deps.record.trailer({ WP: key, Attempt: `a${attempt?.n ?? 0}` })] : []),
        ].join("\n")
        const merged = yield* git(scratch, [...AUTHOR, "merge", "--no-ff", "--quiet", "-m", message, card.queue.head_sha])
        if (merged.code === 0) {
          taken.push({ issue: card.issue, head: card.queue.head_sha })
          continue
        }
        const files = (yield* git(scratch, ["diff", "--name-only", "--diff-filter=U"])).out.split("\n").filter(Boolean)
        yield* git(scratch, ["merge", "--abort"])
        ejections.push({ card: key, cause: "conflicts with the bundle" })
        yield* note(row, card.issue, `conflicts-with-queue: merging onto the bundle so far conflicts in ${files.join(", ") || "its changes"}; it stays queued.`)
      }
      return taken
    })
    const bundleHead = (yield* git(scratch, ["rev-parse", "HEAD"])).out
    const tree = (yield* git(scratch, ["rev-parse", "HEAD^{tree}"])).out
    yield* git(directory, ["worktree", "remove", "--force", scratch])
    if (members.length === 0) return
    const n = yield* deps.quiet((tx) =>
      tx
        .select({ n: BoardBundleTable.n })
        .from(BoardBundleTable)
        .where(eq(BoardBundleTable.project_id, row.id))
        .orderBy(desc(BoardBundleTable.n))
        .get()
        .pipe(Effect.map((last) => (last?.n ?? 0) + 1)),
    )
    const branch = `bundle-${row.key}-${n}`
    const pushed = yield* git(directory, ["push", "--quiet", "--force", "origin", `${bundleHead}:refs/heads/${branch}`])
    if (pushed.code !== 0) return
    const records = deps.record
      ? (yield* Effect.forEach(members, (member) => recordOf(row, member.issue.id, base))).filter((item) => item !== undefined)
      : []
    const body = deps.record
      ? deps.record.bundle({ members: records, testedOn: tip, skew: 0, ciRuns: 0, ciMinutes: 0, ejections })
      : `Bundle ${row.key}-B${n}, assembled by Orchestra's merge queue: ${members.map((member) => `${row.key}-${member.issue.number}`).join(", ")}.`
    const opened = yield* deps.gh(
      [
        "pr",
        "create",
        "--repo",
        repo,
        "--base",
        base,
        "--head",
        branch,
        "--title",
        `chore(queue): bundle ${row.key}-B${n}`,
        "--body-file",
        "-",
        ...(contract.full.label ? ["--label", contract.full.label] : []),
      ],
      body,
    )
    const number = Number(opened.stdout.match(/\/pull\/(\d+)/)?.[1] ?? 0) || null
    const published = yield* deps.quiet((tx) =>
      Effect.gen(function* () {
        const id = Board.BundleID.create()
        yield* tx
          .insert(BoardBundleTable)
          .values({ id, project_id: row.id, n, branch, pr_number: number, base_sha: tip, head_sha: bundleHead, tree_sha: tree, status: "open", rebuilds: queued.last?.status === "isolated" ? queued.last.rebuilds + 1 : 0 })
          .run()
        yield* tx
          .insert(BoardBundleMemberTable)
          .values(members.map((member, position) => ({ bundle_id: id, issue_id: member.issue.id, head_sha: member.head, position })))
          .run()
        yield* tx
          .update(BoardQueueTable)
          .set({ flush: false, hold: null })
          .where(inArray(BoardQueueTable.issue_id, members.map((member) => member.issue.id)))
          .run()
        return yield* Effect.forEach(members, (member) =>
          log(tx, {
            project: row.id,
            issue: member.issue.id,
            actor: "github",
            action: "bundle.cut",
            after: { bundle: n, pr: number, base: tip, head: bundleHead },
          }).pipe(Effect.map((activity) => changed(row.id, activity, member.issue.id))),
        )
      }),
    )
    yield* Effect.forEach(published, deps.publish, { discard: true })
    yield* Effect.forEach(members, (member) => describe(row, member.issue.id, base), { discard: true })
  })

  /**
   * Section 6.3: the failing set F from the failed jobs' logs and the failing bun files of each turbo package group, and
   * whether the red is infrastructure. A job counts as
   * infrastructure when it was cancelled, timed out or never started, or when its log has no failing file and lacks the
   * contract's control line, which only the jobs it names print; a job whose log cannot be read counts as code.
   */
  const failures = Effect.fnUntraced(function* (repo: string, rollup: typeof Rollup.Type["statusCheckRollup"], contract: BoardCi.Contract) {
    const failed = gating(rollup, contract).filter((check) => check.done && FAILED.has(check.result))
    const read = yield* Effect.forEach(failed, (check) =>
      Effect.gen(function* () {
        if (INFRA.has(check.result)) return { files: [] as string[], groups: [], infra: true }
        const job = check.url.match(/\/job\/(\d+)/)?.[1]
        const log = job ? yield* deps.gh(["api", `repos/${repo}/actions/jobs/${job}/logs`]) : undefined
        const text = log?.exitCode === 0 ? log.stdout.replace(/^\S+Z /gm, "") : ""
        const files = text ? BoardCi.failing(text) : []
        const control = contract.full.control
        const silent = control !== null && control.jobs.some((prefix) => check.name.startsWith(prefix)) && !text.includes(control.line)
        return { files, groups: text ? BoardCi.packaged(text) : [], infra: silent && text !== "" && files.length === 0 }
      }),
    )
    return {
      files: [...new Set(read.flatMap((item) => item.files))],
      groups: read.flatMap((item) => item.groups),
      infra: read.length > 0 && read.every((item) => item.infra),
    }
  })

  /**
   * Whether base was green or red at `sha`: a base probe on that commit decides first, then the commit's own checks.
   * A base reached by an outside merge often has no runs; that is unknown, never green.
   */
  const baseState = Effect.fnUntraced(function* (row: ProjectRow, repo: string, sha: string, contract: BoardCi.Contract) {
    const probed = yield* deps.quiet((tx) =>
      tx
        .select({ status: BoardBundleTable.status })
        .from(BoardBundleTable)
        .where(and(eq(BoardBundleTable.project_id, row.id), eq(BoardBundleTable.base_sha, sha), inArray(BoardBundleTable.status, ["probe-green", "base-red"])))
        .orderBy(desc(BoardBundleTable.n))
        .get(),
    )
    if (probed) return probed.status === "probe-green" ? "green" : "red"
    const read = yield* deps.gh(["api", `repos/${repo}/commits/${sha}/check-runs`, "--jq", "[.check_runs[] | {name, status: (.status | ascii_upcase), conclusion: ((.conclusion // \"\") | ascii_upcase)}]"])
    const runs = read.exitCode === 0 ? Option.getOrUndefined(decodeRuns(read.stdout)) : undefined
    const verdict = runs && runs.length > 0 ? judge(runs, contract) : "pending"
    return verdict === "pending" ? "unknown" : verdict
  })

  /** Runs F's groups with the scoped command in `cwd`; true when every group passes. */
  const runGroups = (cwd: string, template: string, branch: string, groups: ReadonlyArray<{ readonly package: string; readonly files: ReadonlyArray<string> }>) =>
    Effect.forEach(groups, (group) =>
      Effect.gen(function* () {
        const argv = yield* BoardCi.command(template, group, branch).pipe(Effect.orElseSucceed(() => [] as string[]))
        if (argv.length === 0) return false
        const result = yield* deps.proc
          .run(ChildProcess.make(which(argv[0] ?? "", deps.env ?? process.env) ?? argv[0] ?? "", argv.slice(1), { cwd, env: deps.env, extendEnv: true, stdin: "ignore" }), {
            combineOutput: true,
            maxOutputBytes: 16 * 1024 * 1024,
            timeout: "90 minutes",
          })
          .pipe(Effect.result)
        return result._tag === "Success" && result.success.exitCode === 0
      }),
    ).pipe(Effect.map((passes) => passes.every(Boolean)))

  /**
   * Section 6.3 step 2: runs F on base and on the bundle head in parallel. F belongs to base when it fails there twice;
   * three passes on the head make the bundle flaky; a head failure is code. Undefined when a checkout fails.
   */
  const scope = Effect.fnUntraced(function* (
    directory: string,
    template: string,
    bundle: typeof BoardBundleTable.$inferSelect,
    groups: ReadonlyArray<{ readonly package: string; readonly files: ReadonlyArray<string> }>,
  ) {
    // Checkouts are added one at a time: concurrent `git worktree add` on one repository can race on its lock files.
    const checkouts = yield* Effect.forEach([bundle.base_sha, bundle.head_sha], (sha) =>
      Effect.gen(function* () {
        const scratch = yield* Effect.promise(() => fs.mkdtemp(path.join(os.tmpdir(), `orchestra-scope-${bundle.n}-`)))
        const added = yield* git(directory, ["worktree", "add", "--quiet", "--detach", scratch, sha])
        if (added.code === 0) return scratch
        yield* Effect.promise(() => fs.rm(scratch, { recursive: true, force: true }))
        return undefined
      }),
    )
    const base = checkouts[0]
    const head = checkouts[1]
    const outcome =
      base && head
        ? yield* Effect.all(
            [
              runGroups(base, template, bundle.branch, groups).pipe(Effect.flatMap((pass) => (pass ? Effect.succeed(true) : runGroups(base, template, bundle.branch, groups)))),
              runGroups(head, template, bundle.branch, groups).pipe(
                Effect.flatMap((pass) => (pass ? runGroups(head, template, bundle.branch, groups) : Effect.succeed(false))),
                Effect.flatMap((pass) => (pass ? runGroups(head, template, bundle.branch, groups) : Effect.succeed(false))),
              ),
            ],
            { concurrency: 2 },
          )
        : undefined
    yield* Effect.forEach(checkouts, (scratch) => (scratch ? git(directory, ["worktree", "remove", "--force", scratch]) : Effect.void), { discard: true })
    if (!outcome) return undefined
    return !outcome[0] ? ("base" as const) : outcome[1] ? ("flaky" as const) : ("code" as const)
  })

  /** Runs F on base plus `heads` merged in order; false when a merge conflicts or a group fails, undefined when the checkout fails. */
  const tryOn = Effect.fnUntraced(function* (
    directory: string,
    template: string,
    bundle: typeof BoardBundleTable.$inferSelect,
    groups: ReadonlyArray<{ readonly package: string; readonly files: ReadonlyArray<string> }>,
    heads: ReadonlyArray<string>,
  ) {
    const scratch = yield* Effect.promise(() => fs.mkdtemp(path.join(os.tmpdir(), `orchestra-isolate-${bundle.n}-`)))
    const added = yield* git(directory, ["worktree", "add", "--quiet", "--detach", scratch, bundle.base_sha])
    if (added.code !== 0) {
      yield* Effect.promise(() => fs.rm(scratch, { recursive: true, force: true }))
      return undefined
    }
    return yield* Effect.gen(function* () {
      for (const head of heads) {
        const merged = yield* git(scratch, [...AUTHOR, "merge", "--no-ff", "--quiet", "-m", "isolate", head])
        if (merged.code !== 0) return false
      }
      return yield* runGroups(scratch, template, bundle.branch, groups)
    }).pipe(Effect.ensuring(git(directory, ["worktree", "remove", "--force", scratch])))
  })

  /**
   * Section 6.3 steps 3-6: the culprits of a code red whose failing tests F ran scoped. Each candidate runs alone on base
   * with its in-bundle dependencies; when none fails alone, a binary search over the member prefixes finds the member
   * whose addition turns red. Undefined when a checkout fails; an empty list means no culprit.
   */
  const isolate = Effect.fnUntraced(function* (
    directory: string,
    template: string,
    bundle: typeof BoardBundleTable.$inferSelect,
    groups: ReadonlyArray<{ readonly package: string; readonly files: ReadonlyArray<string> }>,
    members: ReadonlyArray<{ issue: IssueRow; member: typeof BoardBundleMemberTable.$inferSelect }>,
  ) {
    const failing = groups.flatMap((group) => group.files)
    const ids = members.map((item) => item.issue.id)
    const links = yield* deps.quiet((tx) =>
      tx
        .select()
        .from(BoardDependencyTable)
        .where(and(inArray(BoardDependencyTable.issue_id, ids), inArray(BoardDependencyTable.depends_on_id, ids)))
        .all(),
    )
    const diffs = yield* Effect.forEach(members, (item) =>
      git(directory, ["diff", "--name-only", bundle.base_sha, item.member.head_sha]).pipe(
        Effect.map((diff) => ({ item, touches: diff.out.split("\n").some((file) => failing.includes(file)) })),
      ),
    )
    const touching = diffs.flatMap((entry) => (entry.touches ? [entry.item] : []))
    const candidates = touching.length > 0 ? touching : members
    // One at a time: concurrent `git worktree add` on one repository races on its lock files.
    const singles = yield* Effect.forEach(
      candidates,
      (item) => {
        const after = members.filter((dep) => links.some((link) => link.issue_id === item.issue.id && link.depends_on_id === dep.issue.id))
        return tryOn(directory, template, bundle, groups, [...after.map((dep) => dep.member.head_sha), item.member.head_sha])
      },
      { concurrency: 1 },
    )
    if (singles.includes(undefined)) return undefined
    const culprits = candidates.filter((_, index) => singles[index] === false)
    if (culprits.length > 0) return culprits.map((item) => item.issue)
    let lo = 1
    let hi = members.length
    while (lo < hi) {
      const mid = Math.floor((lo + hi) / 2)
      const prefix = yield* tryOn(directory, template, bundle, groups, members.slice(0, mid).map((item) => item.member.head_sha))
      if (prefix === undefined) return undefined
      if (prefix === false) hi = mid
      if (prefix === true) lo = mid + 1
    }
    // The full prefix was never run by the search: when the search reaches it, it decides whether there is a culprit at all.
    if (lo === members.length) {
      const whole = yield* tryOn(directory, template, bundle, groups, members.map((item) => item.member.head_sha))
      if (whole === undefined) return undefined
      if (whole) return []
    }
    return members.slice(lo - 1, lo).map((item) => item.issue)
  })

  /** Runs the full gate on base itself: an empty commit on the red bundle's base, opened as a bundle with no members. */
  const probe = Effect.fnUntraced(function* (row: ProjectRow, repo: string, directory: string, contract: BoardCi.Contract, red: typeof BoardBundleTable.$inferSelect) {
    const head = (yield* git(directory, [...AUTHOR, "commit-tree", `${red.base_sha}^{tree}`, "-p", red.base_sha, "-m", "chore(queue): base probe"])).out
    if (!head) return
    const n = red.n + 1
    const branch = `bundle-${row.key}-${n}`
    const pushed = yield* git(directory, ["push", "--quiet", "--force", "origin", `${head}:refs/heads/${branch}`])
    if (pushed.code !== 0) return
    const opened = yield* deps.gh(
      [
        "pr",
        "create",
        "--repo",
        repo,
        "--base",
        contract.base,
        "--head",
        branch,
        "--title",
        `chore(queue): base probe ${row.key}-B${n}`,
        "--body-file",
        "-",
        ...(contract.full.label ? ["--label", contract.full.label] : []),
      ],
      `Bundle ${row.key}-B${red.n} went red and ${contract.base} at ${red.base_sha.slice(0, 10)} has no checks; this runs the full gate on ${contract.base} alone.`,
    )
    const number = Number(opened.stdout.match(/\/pull\/(\d+)/)?.[1] ?? 0) || null
    yield* deps.quiet((tx) =>
      tx
        .insert(BoardBundleTable)
        .values({ id: Board.BundleID.create(), project_id: row.id, n, branch, pr_number: number, base_sha: red.base_sha, head_sha: head, tree_sha: "", status: "open" })
        .run(),
    )
  })

  /** The open bundle's next step: wait, merge when green, or give its members back when red. */
  const settle = Effect.fnUntraced(function* (
    row: ProjectRow,
    repo: string,
    directory: string,
    contract: BoardCi.Contract,
    bundle: typeof BoardBundleTable.$inferSelect,
  ) {
    if (!bundle.pr_number) return yield* dissolve(row, bundle, "The bundle PR was not opened.")
    const viewed = yield* deps.gh(["pr", "view", String(bundle.pr_number), "--repo", repo, "--json", "statusCheckRollup,headRefOid"])
    const rollup = viewed.exitCode === 0 ? Option.getOrUndefined(decodeRollup(viewed.stdout)) : undefined
    if (!rollup) return
    if (rollup.headRefOid !== bundle.head_sha) return yield* dissolve(row, bundle, "Someone pushed to the bundle branch.")
    const judged = judge(rollup.statusCheckRollup, contract)
    if (judged === "pending") return
    // Section 6.4: Maestro accepted this flaky bundle, so its red gate ships as tested.
    const verdict = bundle.status === "accepted" ? "green" : judged
    const members = yield* deps.quiet((tx) =>
      tx
        .select({ member: BoardBundleMemberTable, issue: BoardIssueTable })
        .from(BoardBundleMemberTable)
        .innerJoin(BoardIssueTable, eq(BoardIssueTable.id, BoardBundleMemberTable.issue_id))
        .where(eq(BoardBundleMemberTable.bundle_id, bundle.id))
        .orderBy(asc(BoardBundleMemberTable.position))
        .all(),
    )
    // A bundle with no members is a base probe: it never merges, it only says whether base is green.
    if (members.length === 0)
      return yield* close(row, repo, bundle, `probed ${contract.base} at ${bundle.base_sha.slice(0, 10)}`, verdict === "green" ? "probe-green" : "base-red")
    if (verdict === "red") {
      const found = yield* failures(repo, rollup.statusCheckRollup, contract)
      const cause = found.files.length > 0 ? ` Failing: ${found.files.join(", ")}.` : ""
      const previous = found.infra
        ? yield* deps.quiet((tx) =>
            tx
              .select({ status: BoardBundleTable.status })
              .from(BoardBundleTable)
              .where(and(eq(BoardBundleTable.project_id, row.id), ne(BoardBundleTable.status, "open"), ne(BoardBundleTable.id, bundle.id)))
              .orderBy(desc(BoardBundleTable.n))
              .get(),
          )
        : undefined
      if (found.infra && previous?.status === "infra") {
        yield* Effect.forEach(
          members,
          (item) => note(row, item.issue, `Bundle ${row.key}-B${bundle.n} failed on infrastructure twice; the ${row.key} queue is paused until Maestro retries it, and this card stays queued.`),
          { discard: true },
        )
        yield* Effect.logWarning(`integration: ${row.key} queue paused, bundle ${row.key}-B${bundle.n} failed on infrastructure twice`)
        return yield* close(row, repo, bundle, "failed on infrastructure twice; the queue is paused", "paused")
      }
      if (found.infra) {
        yield* Effect.forEach(
          members,
          (item) => note(row, item.issue, `Bundle ${row.key}-B${bundle.n} failed on infrastructure, not code; the queue reruns it once and this card stays queued.`),
          { discard: true },
        )
        yield* deps.quiet((tx) =>
          tx.update(BoardQueueTable).set({ flush: true }).where(inArray(BoardQueueTable.issue_id, members.map((item) => item.issue.id))).run(),
        )
        return yield* close(row, repo, bundle, "failed on infrastructure; the queue reruns it", "infra")
      }
      const sha10 = bundle.base_sha.slice(0, 10)
      // F runs scoped only when every failing file is a bun test file under a package group; otherwise base is judged by its checks or a probe.
      const runnable =
        contract.scoped.tests !== null &&
        found.groups.length > 0 &&
        found.files.every((file) => found.groups.some((group) => group.files.includes(file.replaceAll("\\", "/"))))
      const scoped = runnable && contract.scoped.tests !== null ? yield* scope(directory, contract.scoped.tests, bundle, found.groups) : undefined
      if (scoped === "flaky") return yield* flaky(row, bundle, members.map((item) => item.issue), found.groups.flatMap((group) => group.files))
      const based = scoped ? (scoped === "base" ? "red" : "green") : yield* baseState(row, repo, bundle.base_sha, contract)
      if (based === "unknown") {
        yield* Effect.forEach(
          members,
          (item) => note(row, item.issue, `Bundle ${row.key}-B${bundle.n} went red and ${contract.base} at ${sha10} has no checks; the queue tests ${contract.base} alone first and this card stays queued.`),
          { discard: true },
        )
        yield* deps.quiet((tx) =>
          tx.update(BoardQueueTable).set({ flush: true }).where(inArray(BoardQueueTable.issue_id, members.map((item) => item.issue.id))).run(),
        )
        yield* close(row, repo, bundle, `is red; the queue tests ${contract.base} alone first`, "probing")
        return yield* probe(row, repo, directory, contract, bundle)
      }
      if (based === "red") {
        yield* Effect.forEach(
          members,
          (item) =>
            note(row, item.issue, `Bundle ${row.key}-B${bundle.n} went red, and so does ${contract.base} at ${sha10}; this card stays queued until ${contract.base} is green.`),
          { discard: true },
        )
        return yield* close(row, repo, bundle, `is red because ${contract.base} at ${sha10} is red`, "base-red")
      }
      // Section 6.3 steps 3-6: a code red that ran scoped is searched with scoped runs, not halved through full gates.
      if (scoped === "code" && members.length > 1 && contract.scoped.tests !== null) {
        if (bundle.rebuilds >= 2) return yield* hold(row, repo, bundle, members, "went red after two rebuilds")
        const culprits = yield* isolate(directory, contract.scoped.tests, bundle, found.groups, members)
        if (culprits?.length === 0) return yield* hold(row, repo, bundle, members, "went red and halving found no culprit")
        if (culprits) {
          const fileList = found.groups.flatMap((group) => group.files).join(", ")
          yield* eject(row, bundle, culprits, `Bundle ${row.key}-B${bundle.n} went red, and this card fails ${fileList} on ${contract.base} alone; it is back in Review.`, "failed its scoped tests alone")
          const keys = culprits.map((issue) => `${row.key}-${issue.number}`).join(", ")
          const rest = members.filter((item) => !culprits.some((culprit) => culprit.id === item.issue.id))
          yield* deps.quiet((tx) =>
            tx
              .update(BoardQueueTable)
              .set({ flush: true })
              .where(inArray(BoardQueueTable.issue_id, rest.map((item) => item.issue.id)))
              .run(),
          )
          yield* Effect.forEach(
            rest,
            (item) => note(row, item.issue, `Bundle ${row.key}-B${bundle.n} went red; ${keys} failed alone and left it, and the queue rebuilds it with this card.`),
            { discard: true },
          )
          return yield* close(row, repo, bundle, `is red; ${keys} ejected, the queue rebuilds it`, "isolated")
        }
      }
      if (members.length > 1) {
        yield* Effect.forEach(
          members,
          (item) => note(row, item.issue, `Bundle ${row.key}-B${bundle.n} went red on its full gate; the queue splits it to find the cause and this card stays queued.${cause}`),
          { discard: true },
        )
        // Flush keeps the surviving half due next tick, even after its first half merges and the rest is below full size.
        yield* deps.quiet((tx) =>
          tx.update(BoardQueueTable).set({ flush: true }).where(inArray(BoardQueueTable.issue_id, members.map((item) => item.issue.id))).run(),
        )
        return yield* close(row, repo, bundle, "is red; the queue splits it to find the cause", "red")
      }
      yield* eject(row, bundle, members.map((item) => item.issue), `Bundle ${row.key}-B${bundle.n} went red with only this card on ${contract.base} at ${sha10}; it is back in Review.${cause}`, "red alone on the full gate")
      return yield* close(row, repo, bundle, "is red", "red")
    }
    // Section 6.6: a member head that moved since assembly dequeues that member and the bundle is rebuilt.
    const heads = yield* Effect.forEach(members, (item) =>
      head(directory, repo, item.issue.pr_number ?? 0).pipe(
        Effect.map((current) => ({ item, sha: current.sha as string | undefined })),
        Effect.orElseSucceed(() => ({ item, sha: undefined })),
      ),
    )
    const stale = heads.filter((entry) => entry.sha !== entry.item.member.head_sha)
    if (stale.length > 0) {
      yield* Effect.forEach(stale, (entry) => moved(row, entry.item.issue, entry.sha), { discard: true })
      return yield* dissolve(row, bundle, `${stale.map((entry) => `${row.key}-${entry.item.issue.number}`).join(", ")} moved after assembly.`)
    }
    yield* git(directory, ["fetch", "--quiet", "--no-tags", "origin", contract.base])
    const tip = (yield* git(directory, ["rev-parse", "--verify", "--quiet", `refs/remotes/origin/${contract.base}`])).out
    if (!tip) return
    // Section 8.5: a host that died after pushing base but before writing the rows finds the bundle already in base,
    // so it only records the merge: no second push and no rebuilt bundle.
    const already = tip !== bundle.base_sha && (yield* git(directory, ["merge-base", "--is-ancestor", bundle.head_sha, tip])).code === 0
    const landed = already
      ? { target: tip, on: null }
      : tip === bundle.base_sha
        ? { target: bundle.head_sha, on: null }
        : yield* skew(directory, contract, bundle, tip, row)
    if (!landed) return yield* dissolve(row, bundle, `${contract.base} moved to ${tip.slice(0, 10)}; the bundle is rebuilt and retested.`)
    const pushed = already
      ? { code: 0 }
      : yield* git(directory, [
          "push",
          "--quiet",
          `--force-with-lease=refs/heads/${contract.base}:${landed.on ?? bundle.base_sha}`,
          "origin",
          `${landed.target}:refs/heads/${contract.base}`,
        ])
    if (pushed.code !== 0) return
    const shipped = yield* deps.quiet((tx) =>
      Effect.gen(function* () {
        yield* tx
          .update(BoardBundleTable)
          .set({ status: "merged", merged_on: landed.on })
          .where(eq(BoardBundleTable.id, bundle.id))
          .run()
        return yield* Effect.forEach(members, (item) =>
          Effect.gen(function* () {
            yield* tx
              .update(BoardAttemptTable)
              .set({ outcome: "merged" })
              .where(and(eq(BoardAttemptTable.issue_id, item.issue.id), isNull(BoardAttemptTable.outcome)))
              .run()
            yield* tx.delete(BoardQueueTable).where(eq(BoardQueueTable.issue_id, item.issue.id)).run()
            const moving = yield* place(tx, row, item.issue, "shipped")
            const activity = yield* log(tx, {
              project: row.id,
              issue: item.issue.id,
              actor: "github",
              action: "bundle.merge",
              before: moving.before,
              after: { ...moving.after, bundle: bundle.n, merged: landed.target, ...(landed.on ? { on: landed.on } : {}) },
            })
            return changed(row.id, activity, item.issue.id)
          }),
        )
      }),
    )
    yield* Effect.forEach(shipped, deps.publish, { discard: true })
    yield* git(directory, ["push", "--quiet", "origin", "--delete", bundle.branch])
    // Snapshot refs go only once the merge is on the remote, and only for shipped cards.
    yield* Effect.forEach(
      members,
      (item) =>
        Effect.gen(function* () {
          const remote = contract.snapshots.remote
          const refs = (yield* git(directory, ["ls-remote", remote, `refs/orchestra/wip/${row.key}-${item.issue.number}/*`])).out
            .split("\n")
            .map((line) => line.split("\t")[1])
            .filter((name): name is string => Boolean(name))
          if (refs.length > 0) yield* git(directory, ["push", "--quiet", remote, "--delete", ...refs])
          yield* describe(row, item.issue.id, contract.base)
        }),
      { discard: true },
    )
  })

  /**
   * Section 6.5 `merge-if-disjoint`: the merge commit of the tested head onto the new tip, when the two merge clean and
   * what moved base does not overlap what the bundle changed. Undefined means retest.
   */
  const skew = Effect.fnUntraced(function* (
    directory: string,
    contract: BoardCi.Contract,
    bundle: typeof BoardBundleTable.$inferSelect,
    tip: string,
    row: ProjectRow,
  ) {
    if (contract.bundle.onBaseMoved !== "merge-if-disjoint") return undefined
    const merged = yield* git(directory, ["merge-tree", "--write-tree", tip, bundle.head_sha])
    if (merged.code !== 0) return undefined
    const theirs = (yield* git(directory, ["diff", "--name-only", `${bundle.base_sha}..${tip}`])).out.split("\n").filter(Boolean)
    const ours = (yield* git(directory, ["diff", "--name-only", `${bundle.base_sha}..${bundle.head_sha}`])).out.split("\n").filter(Boolean)
    if (theirs.some((file) => ours.includes(file))) return undefined
    const graph = (yield* git(directory, ["cat-file", "-e", `${tip}:turbo.json`])).code === 0
    if (graph) {
      const left = yield* affected(directory, bundle.base_sha, tip)
      const right = yield* affected(directory, bundle.base_sha, bundle.head_sha)
      if (!left || !right || left.some((name) => right.includes(name))) return undefined
    }
    const commit = yield* git(directory, [
      ...AUTHOR,
      "commit-tree",
      merged.out.split("\n")[0] ?? "",
      "-p",
      tip,
      "-p",
      bundle.head_sha,
      "-m",
      `Merge bundle ${row.key}-B${bundle.n} onto ${contract.base}\n\nTested on ${bundle.base_sha}, merged on ${tip}.`,
    ])
    if (commit.code !== 0 || !commit.out) return undefined
    return { target: commit.out, on: tip }
  })

  /** Section 7.1's affected set from `turbo`: the packages a commit range touches and every package that depends on them. */
  const affected = Effect.fnUntraced(function* (directory: string, from: string, to: string) {
    const bun = which("bun", deps.env ?? process.env)
    if (!bun) return undefined
    const result = yield* deps.proc
      .run(
        ChildProcess.make(bun, ["x", "turbo", "run", "typecheck", `--filter=...[${from}...${to}]`, "--dry=json"], {
          cwd: directory,
          env: { ...deps.env, TURBO_TELEMETRY_DISABLED: "1" },
          extendEnv: true,
          stdin: "ignore",
        }),
        { maxOutputBytes: 8 * 1024 * 1024, maxErrorBytes: 16 * 1024, timeout: "120 seconds" },
      )
      .pipe(Effect.orElseSucceed(() => undefined))
    if (!result || result.exitCode !== 0) return undefined
    return Option.getOrUndefined(decodeDry(result.stdout.toString("utf8")))?.packages
  })

  /** Closes the bundle PR and branch; its members stay queued and the next tick cuts again. */
  const dissolve = Effect.fnUntraced(function* (row: ProjectRow, bundle: typeof BoardBundleTable.$inferSelect, reason: string) {
    const published = yield* deps.quiet((tx) =>
      Effect.gen(function* () {
        const members = yield* tx
          .select({ issue: BoardBundleMemberTable.issue_id })
          .from(BoardBundleMemberTable)
          .where(eq(BoardBundleMemberTable.bundle_id, bundle.id))
          .all()
        return yield* Effect.forEach(members, (member) =>
          log(tx, { project: row.id, issue: member.issue, actor: "github", action: "bundle.dissolve", reason, after: { bundle: bundle.n } }).pipe(
            Effect.map((activity) => changed(row.id, activity, member.issue)),
          ),
        )
      }),
    )
    yield* Effect.forEach(published, deps.publish, { discard: true })
    if (row.github_repo) yield* close(row, row.github_repo, bundle, "dissolved")
  })

  const close = Effect.fnUntraced(function* (
    row: ProjectRow,
    repo: string,
    bundle: typeof BoardBundleTable.$inferSelect,
    why: string,
    status: typeof BoardBundleTable.$inferSelect.status = "dissolved",
  ) {
    yield* deps.quiet((tx) => tx.update(BoardBundleTable).set({ status }).where(eq(BoardBundleTable.id, bundle.id)).run())
    if (bundle.pr_number)
      yield* deps.gh(["pr", "close", String(bundle.pr_number), "--repo", repo, "--delete-branch", "--comment", `Bundle ${row.key}-B${bundle.n} ${why}.`])
  })

  /** Gives each issue back to Review with `text` and releases its queue row; the caller decides the bundle's fate. */
  const eject = Effect.fnUntraced(function* (row: ProjectRow, bundle: typeof BoardBundleTable.$inferSelect, issues: ReadonlyArray<IssueRow>, text: string, reason: string) {
    const back = yield* deps.quiet((tx) =>
      Effect.forEach(issues, (issue) =>
        Effect.gen(function* () {
          yield* insertNote(tx, row, issue, text)
          yield* tx
            .update(BoardAttemptTable)
            .set({ outcome: "ejected" })
            .where(and(eq(BoardAttemptTable.issue_id, issue.id), isNull(BoardAttemptTable.outcome)))
            .run()
          yield* BoardSnapshot.dispatch(tx, issue, { cause: `ejected:${row.key}-B${bundle.n}` })
          return yield* release(tx, row, issue, "github", "bundle.dissolve", reason)
        }),
      ),
    )
    yield* Effect.forEach(back, deps.publish, { discard: true })
  })

  /** Section 6.3: a dissolved bundle's cards stay held until Maestro releases them one at a time with `board_bundle`. */
  const hold = Effect.fnUntraced(function* (
    row: ProjectRow,
    repo: string,
    bundle: typeof BoardBundleTable.$inferSelect,
    members: ReadonlyArray<{ readonly member: typeof BoardBundleMemberTable.$inferSelect; readonly issue: IssueRow }>,
    why: string,
  ) {
    yield* deps.quiet((tx) =>
      tx
        .update(BoardQueueTable)
        .set({ hold: "held" })
        .where(inArray(BoardQueueTable.issue_id, members.map((item) => item.issue.id)))
        .run(),
    )
    yield* Effect.forEach(
      members,
      (item) => note(row, item.issue, `Bundle ${row.key}-B${bundle.n} ${why}; it dissolved and this card is held until Maestro releases it with board_bundle.`),
      { discard: true },
    )
    yield* Effect.logWarning(`integration: ${row.key}-B${bundle.n} ${why}; its cards are held. Release them one at a time with board_bundle, dequeue a suspect, or send F to jimmy.`)
    return yield* close(row, repo, bundle, why)
  })

  /** Section 6.4: a flaky bundle keeps its PR open and its members queued until Maestro merges or retries it. */
  const flaky = Effect.fnUntraced(function* (row: ProjectRow, bundle: typeof BoardBundleTable.$inferSelect, issues: ReadonlyArray<IssueRow>, tests: ReadonlyArray<string>) {
    const now = yield* Clock.currentTimeMillis
    yield* deps.quiet((tx) =>
      Effect.gen(function* () {
        yield* tx.update(BoardBundleTable).set({ status: "flaky" }).where(eq(BoardBundleTable.id, bundle.id)).run()
        yield* Effect.forEach(
          tests,
          (test) =>
            tx
              .insert(BoardFlakeTable)
              .values({ project_id: row.id, test, bundle_id: bundle.id, first_seen: now, count: 1 })
              .onConflictDoUpdate({ target: [BoardFlakeTable.project_id, BoardFlakeTable.test], set: { bundle_id: bundle.id, count: sql`${BoardFlakeTable.count} + 1` } })
              .run(),
          { discard: true },
        )
      }),
    )
    yield* Effect.forEach(
      issues,
      (issue) => note(row, issue, `Bundle ${row.key}-B${bundle.n} went red, and ${tests.join(", ")} then passed three scoped reruns of its head: it is flaky. Maestro merges it or retries it; this card stays queued.`),
      { discard: true },
    )
    yield* Effect.logWarning(`integration: ${row.key}-B${bundle.n} flaky: ${tests.join(", ")} failed, then passed on rerun. Merge or retry.`)
  })

  /** A queued card whose PR head moved since it queued goes back to Review: its new head is not verified. */
  const moved = Effect.fnUntraced(function* (row: ProjectRow, issue: IssueRow, sha: string | undefined) {
    const back = yield* deps.quiet((tx) =>
      Effect.gen(function* () {
        const why = `The PR head moved${sha ? ` to ${sha.slice(0, 10)}` : ""} after it queued; verify it and queue it again.`
        yield* insertNote(tx, row, issue, why)
        return yield* release(tx, row, issue, "github", "queue.remove", why)
      }),
    )
    yield* deps.publish(back)
  })

  const note = Effect.fnUntraced(function* (row: ProjectRow, issue: IssueRow, body: string) {
    const done = yield* deps.quiet((tx) => insertNote(tx, row, issue, body))
    yield* deps.publish(done)
  })

  /** Rewrites the card's PR body through the record port; unbound, the body stays as the seat wrote it. */
  const describe = Effect.fnUntraced(function* (row: ProjectRow, issue: Board.IssueID, base: string) {
    if (!deps.record || !row.github_repo) return
    const found = yield* recordOf(row, issue, base)
    if (!found?.pr) return
    yield* deps.gh(["pr", "edit", String(found.pr), "--repo", row.github_repo, "--body-file", "-"], deps.record.pr(found.record))
  })

  /** The card's record as Atlas reads it: Maestro's fields plus the host's facts, checks, cost, lineage and integration. */
  const recordOf = Effect.fnUntraced(function* (row: ProjectRow, issue: Board.IssueID, base: string) {
    const now = yield* Clock.currentTimeMillis
    const found = yield* deps.quiet((tx) =>
      Effect.gen(function* () {
        const card = yield* tx.select().from(BoardIssueTable).where(eq(BoardIssueTable.id, issue)).get()
        const checks = yield* tx.select().from(BoardCheckTable).where(eq(BoardCheckTable.issue_id, issue)).all()
        const attempts = yield* tx.select().from(BoardAttemptTable).where(eq(BoardAttemptTable.issue_id, issue)).orderBy(asc(BoardAttemptTable.n)).all()
        const queued = yield* tx.select().from(BoardQueueTable).where(eq(BoardQueueTable.issue_id, issue)).get()
        const bundle = yield* tx
          .select({ n: BoardBundleTable.n, status: BoardBundleTable.status, base: BoardBundleTable.base_sha, head: BoardBundleMemberTable.head_sha })
          .from(BoardBundleMemberTable)
          .innerJoin(BoardBundleTable, eq(BoardBundleTable.id, BoardBundleMemberTable.bundle_id))
          .where(eq(BoardBundleMemberTable.issue_id, issue))
          .orderBy(desc(BoardBundleTable.n))
          .get()
        const epic = card?.epic_id
          ? yield* tx.select({ number: BoardEpicTable.number }).from(BoardEpicTable).where(eq(BoardEpicTable.id, card.epic_id)).get()
          : undefined
        const depends = yield* tx
          .select({ number: BoardIssueTable.number })
          .from(BoardDependencyTable)
          .innerJoin(BoardIssueTable, eq(BoardIssueTable.id, BoardDependencyTable.depends_on_id))
          .where(eq(BoardDependencyTable.issue_id, issue))
          .all()
        return { card, checks, attempts, queued, bundle, epic, depends, directory: yield* worktree(tx, row) }
      }),
    )
    const card = found.card
    const record = card?.record
    if (!card || !record?.risk?.level) return undefined
    const head = found.bundle?.head ?? found.queued?.head_sha
    // Against the bundle's base once bundled: after it ships, base already contains the card.
    const numstat =
      head && found.directory
        ? (yield* git(found.directory, ["diff", "--numstat", `${found.bundle?.base ?? `refs/remotes/origin/${base}`}...${head}`])).out
            .split("\n")
            .filter(Boolean)
            .map((line) => line.split("\t"))
        : []
    const state =
      card.stage === "shipped" ? "merged" : found.bundle?.status === "open" ? "bundled" : found.queued ? "queued" : "not queued"
    return {
      pr: card.pr_number,
      title: card.title,
      head: head ?? "",
      record: {
        intent: record.intent ?? "",
        change: { text: record.change ?? "", start: [] },
        decisions: record.decisions?.trim() ? [record.decisions] : [],
        notCovered: record.not_covered ?? "",
        risk: { level: record.risk.level, breaks: record.risk.breaks ?? "", notice: "", undo: record.risk.undo ?? "" },
        followUps: record.follow_ups ?? [],
        facts: {
          files: numstat.length,
          added: numstat.reduce((sum, item) => sum + (Number(item[0]) || 0), 0),
          removed: numstat.reduce((sum, item) => sum + (Number(item[1]) || 0), 0),
          packages: [],
          ownUnits: [],
        },
        evidence: {
          doneWhen: [],
          reviews: [],
          checks: found.checks.map((check) => ({
            name: `${check.kind} ${check.command}`,
            state: check.outcome,
            ...(check.url ? { url: check.url } : {}),
          })),
          used: "unseen",
        },
        cost: {
          attempts: found.attempts.map((attempt) => ({ n: attempt.n, cause: attempt.cause ?? "" })),
          ciRuns: found.checks.length,
          ciMinutes: Math.round(
            found.checks.reduce((sum, check) => sum + Math.max(0, (check.ended_at ?? check.started_at) - check.started_at), 0) / 60_000,
          ),
          wallMs: now - card.time_created,
        },
        lineage: {
          card: `${row.key}-${card.number}`,
          ...(found.epic ? { epic: `${row.key}-E${found.epic.number}` } : {}),
          dependsOn: found.depends.map((dep) => `${row.key}-${dep.number}`),
          seats: [...new Set(found.attempts.map((attempt) => attempt.seat).filter((seat) => seat !== null))],
        },
        integration: {
          state,
          ...(found.bundle ? { bundle: `${row.key}-B${found.bundle.n}`, testedOn: found.bundle.base } : {}),
        },
      } satisfies BoardRecord.PrRecord,
    }
  })

  return { enqueue, dequeue, decide, tick }
}

export type Interface = ReturnType<typeof make>

/** The record fields section 4.5 requires before a card queues. */
export function incomplete(record: Board.PrRecord | null) {
  const blank = (text: string | undefined) => !text?.trim()
  return [
    ...(blank(record?.intent) ? ["Intent"] : []),
    ...(blank(record?.decisions) ? ["Decisions"] : []),
    ...(blank(record?.not_covered) ? ["Not covered"] : []),
    ...(record?.risk?.level ? [] : ["Risk level"]),
  ]
}

/** `full.checks` names the checks that gate the bundle, matched by check or by the workflow that ran it; with none named, every reported check must pass. */
function judge(rollup: typeof Rollup.Type["statusCheckRollup"], contract: BoardCi.Contract) {
  const gates = gating(rollup, contract)
  if (gates.some((check) => check.done && FAILED.has(check.result))) return "red"
  if (contract.full.checks.some((name) => !gates.some((check) => check.name === name || check.workflow === name))) return "pending"
  if (gates.length === 0) return contract.source === "no-ci" ? "green" : "pending"
  return gates.every((check) => check.done && PASSED.has(check.result)) ? "green" : "pending"
}

function gating(rollup: typeof Rollup.Type["statusCheckRollup"], contract: BoardCi.Contract) {
  const checks = rollup.map((item) => ({
    name: item.name ?? item.context ?? "",
    done: item.state ? item.state !== "PENDING" && item.state !== "EXPECTED" : item.status === "COMPLETED",
    result: item.conclusion ?? item.state ?? "",
    workflow: item.workflowName ?? "",
    url: item.detailsUrl ?? "",
  }))
  return contract.full.checks.length > 0
    ? checks.filter((check) => contract.full.checks.includes(check.name) || contract.full.checks.includes(check.workflow))
    : checks
}

/** Section 6.3: once 50 bundled cards have settled, the size is the largest n with (1 - p)^n >= 0.75, p the share ejected. */
export function size(outcomes: ReadonlyArray<string | null>, bundle: BoardCi.Contract["bundle"]) {
  if (outcomes.length < 50) return bundle.size
  const p = outcomes.filter((outcome) => outcome === "ejected").length / outcomes.length
  if (p === 0) return bundle.max
  if (p >= 1) return 1
  return Math.min(bundle.max, Math.max(1, Math.floor(Math.log(0.75) / Math.log(1 - p))))
}

const openBundle = Effect.fnUntraced(function* (tx: Tx, project: Board.ProjectID) {
  return yield* tx
    .select()
    .from(BoardBundleTable)
    .where(and(eq(BoardBundleTable.project_id, project), inArray(BoardBundleTable.status, ["open", "accepted"])))
    .get()
})

const isMember = Effect.fnUntraced(function* (tx: Tx, bundle: Board.BundleID, issue: Board.IssueID) {
  const row = yield* tx
    .select({ issue: BoardBundleMemberTable.issue_id })
    .from(BoardBundleMemberTable)
    .where(and(eq(BoardBundleMemberTable.bundle_id, bundle), eq(BoardBundleMemberTable.issue_id, issue)))
    .get()
  return row !== undefined
})

/** Moves a card to the end of `stage`, the way `move` does, and returns what changed for the activity row. */
const place = Effect.fnUntraced(function* (tx: Tx, project: ProjectRow, issue: IssueRow, stage: Board.Stage) {
  const next = { stage, position: yield* endOf(tx, project.id, stage), stage_entered_at: yield* Clock.currentTimeMillis }
  yield* tx
    .update(BoardIssueTable)
    .set({ ...next, ...(project.github_repo !== null ? { github_dirty: true } : {}) })
    .where(eq(BoardIssueTable.id, issue.id))
    .run()
  return { before: { stage: issue.stage, position: issue.position, stage_entered_at: issue.stage_entered_at }, after: next }
})

/** Takes a card out of the queue and back to Review. */
const release = Effect.fnUntraced(function* (
  tx: Tx,
  project: ProjectRow,
  issue: IssueRow,
  actor: Board.Actor,
  action: Board.Action,
  reason: string,
) {
  yield* tx.delete(BoardQueueTable).where(eq(BoardQueueTable.issue_id, issue.id)).run()
  const current = (yield* tx.select().from(BoardIssueTable).where(eq(BoardIssueTable.id, issue.id)).get()) ?? issue
  const moving = yield* place(tx, project, current, "review")
  const activity = yield* log(tx, { project: project.id, issue: issue.id, actor, action, reason, before: moving.before, after: moving.after })
  return changed(project.id, activity, issue.id)
})

const insertNote = Effect.fnUntraced(function* (tx: Tx, project: ProjectRow, issue: IssueRow, body: string) {
  const id = Board.NoteID.create()
  yield* tx.insert(BoardNoteTable).values({ id, issue_id: issue.id, author: "orchestra", body }).run()
  const activity = yield* log(tx, { project: project.id, issue: issue.id, actor: "github", action: "note.add", after: { id } })
  return changed(project.id, activity, issue.id)
})
