export * as BoardQueue from "./queue"

import fs from "fs/promises"
import os from "os"
import path from "path"
import { and, asc, desc, eq, inArray, isNull, ne } from "drizzle-orm"
import { Clock, Effect } from "effect"
import { Board } from "@orchestra/schema/board"
import { BoardCi } from "./ci"
import { BoardLedger } from "./ledger"
import {
  BoardAttemptTable,
  BoardBundleMemberTable,
  BoardBundleTable,
  BoardCheckTable,
  BoardDependencyTable,
  BoardIssueTable,
  BoardProjectTable,
  BoardQueueTable,
} from "./sql"
import { changed, gitRunner, loadIssue, loadProject, log, RefusedError, worktree } from "./shared"
import type { IssueRow, ProjectRow } from "./shared"
import { AUTHOR, isMember, openBundle, place, release } from "./queue-shared"
import type { Deps } from "./queue-shared"
import { makeRecord } from "./queue-record"
import { makeRed } from "./queue-red"
import { makeSettle } from "./queue-settle"

export type { Deps } from "./queue-shared"

// The merge queue (docs/specs/maestro-lead/merge-queue.md sections 6.1 to 6.6, phase 1). Only the host moves a card
// into or out of the `queue` stage: `board_queue` enqueues a verified Review card, and the tick cuts one bundle per
// project, waits for its full gate, and pushes base to the tested head. A red bundle is halved until one card fails
// alone and is ejected into a new attempt; infrastructure failures rerun once and then pause the queue; the size follows
// the red rate; the failed jobs' logs give the failing files; a red whose failing files are bun tests in package groups runs them scoped on base and on the bundle head (base
// red, code red, or flaky); Maestro merges or retries a flaky bundle, and retries a paused one, with `board_bundle`.
// Projects settle concurrently, and a project still settling is skipped, never run twice.

export function make(deps: Deps) {
  const git = gitRunner(deps.proc, deps.env)
  const record = makeRecord({ deps, git })
  const red = makeRed({ deps, git, note: record.note })
  const settlement = makeSettle({
    deps,
    git,
    head: record.head,
    moved: record.moved,
    note: record.note,
    describe: record.describe,
    failures: red.failures,
    baseState: red.baseState,
    scope: red.scope,
    tryOn: red.tryOn,
    isolate: red.isolate,
    bisect: red.bisect,
    fixCard: red.fixCard,
    probe: red.probe,
    flaky: red.flaky,
  })
  const head = record.head
  const moved = record.moved
  const note = record.note
  const describe = record.describe
  const recordBundle = record.recordBundle
  const recordOf = record.recordOf
  const settle = settlement.settle
  const dissolve = settlement.dissolve
  const close = settlement.close

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
        return { cards, waits, attempts, open, settled: yield* BoardLedger.settled(tx, row.id), last: last && { status: last.status, base_sha: last.base_sha, members: lastMembers.length, rebuilds: last.rebuilds, fix: last.fix_issue_id, failing: last.failing } }
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
      queued.last?.status === "base-red" ||
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
    // Section 6.8 phase 1: while base stays red, only its fix card is cut, alone.
    const fixing = queued.last?.status === "base-red" && tip === queued.last.base_sha
    const fix = fixing ? queued.cards.find((card) => card.issue.id === queued.last?.fix) : undefined
    if (fixing && !fix) return
    const scratch = yield* Effect.promise(() => fs.mkdtemp(path.join(os.tmpdir(), `orchestra-bundle-${row.key}-`)))
    const added = yield* git(directory, ["worktree", "add", "--quiet", "--detach", scratch, tip])
    if (added.code !== 0) return
    const ejections: Array<{ readonly card: string; readonly cause: string }> = []
    const members = yield* Effect.gen(function* () {
      const taken: Array<{ readonly issue: IssueRow; readonly head: string }> = []
      for (const card of fix ? [fix] : alone ? [alone] : queued.cards) {
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
    const n = yield* deps.quiet((tx) =>
      tx
        .select({ n: BoardBundleTable.n })
        .from(BoardBundleTable)
        .where(eq(BoardBundleTable.project_id, row.id))
        .orderBy(desc(BoardBundleTable.n))
        .get()
        .pipe(Effect.map((last) => (last?.n ?? 0) + 1)),
    )
    if (members.length > 0) yield* recordBundle(row, scratch, members.map((member) => member.issue), `${row.key}-B${n}`)
    const bundleHead = (yield* git(scratch, ["rev-parse", "HEAD"])).out
    const tree = (yield* git(scratch, ["rev-parse", "HEAD^{tree}"])).out
    yield* git(directory, ["worktree", "remove", "--force", scratch])
    if (members.length === 0) return
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
          .values({
            id,
            project_id: row.id,
            n,
            branch,
            pr_number: number,
            base_sha: tip,
            head_sha: bundleHead,
            tree_sha: tree,
            status: "open",
            rebuilds: queued.last?.status === "isolated" ? queued.last.rebuilds + 1 : 0,
            failing: fix ? queued.last?.failing ?? null : null,
            fix_issue_id: fix ? fix.issue.id : null,
          })
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

/** Section 6.3: once 50 bundled cards have settled, the size is the largest n with (1 - p)^n >= 0.75, p the share ejected. */
export function size(outcomes: ReadonlyArray<string | null>, bundle: BoardCi.Contract["bundle"]) {
  if (outcomes.length < 50) return bundle.size
  const p = outcomes.filter((outcome) => outcome === "ejected").length / outcomes.length
  if (p === 0) return bundle.max
  if (p >= 1) return 1
  return Math.min(bundle.max, Math.max(1, Math.floor(Math.log(0.75) / Math.log(1 - p))))
}
