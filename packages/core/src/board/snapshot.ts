export * as BoardSnapshot from "./snapshot"

import { existsSync } from "fs"
import fs from "fs/promises"
import os from "os"
import path from "path"
import { and, desc, eq, isNull } from "drizzle-orm"
import { Clock, Effect } from "effect"
import { ChildProcess } from "effect/unstable/process"
import type { Board } from "@orchestra/schema/board"
import type { AppProcess } from "../process"
import { BoardAttemptTable, BoardIssueTable, BoardProjectTable } from "./sql"
import { gitRunner, worktree } from "./shared"
import type { Fields, IssueRow, ProjectRow, Tx } from "./shared"

// Push early (docs/specs/maestro-lead/merge-queue.md section 8.1): the host writes a card's worktree to a snapshot
// commit through a temporary index and pushes it to refs/orchestra/wip/<KEY>/a<n>. The worktree, its index and its
// HEAD stay untouched, so seats still never commit.

export interface Deps {
  readonly quiet: <A>(work: (tx: Tx) => Effect.Effect<A, unknown>) => Effect.Effect<A>
  readonly proc: AppProcess.Interface
  /** The gitleaks executable, or undefined when none can be had; then no snapshot is pushed. */
  readonly scanner: Effect.Effect<string | undefined>
  /** The project's snapshot remote from its CI contract; a failure blocks the push rather than guess a remote. */
  readonly remote: (directory: string, project: ProjectRow) => Effect.Effect<string, { readonly message: string }>
  readonly env?: NodeJS.ProcessEnv
}

export type Attempt = typeof BoardAttemptTable.$inferSelect

/**
 * What one snapshot did. `blocked` says why nothing was pushed. `missing` means the worktree is gone with no snapshot
 * to restore it from; `restored` means a gone worktree was re-created at its snapshot commit (spec 8.5).
 */
export type Result =
  | { readonly status: "pushed" | "unchanged"; readonly ref: string; readonly sha: string }
  | { readonly status: "blocked"; readonly ref: string; readonly reason: string }
  | { readonly status: "missing"; readonly ref: string; readonly worktree: string | null }
  | { readonly status: "restored"; readonly ref: string; readonly worktree: string; readonly sha: string }
  | { readonly status: "none" }

const IDENTITY = {
  GIT_AUTHOR_NAME: "Orchestra",
  GIT_AUTHOR_EMAIL: "orchestra@localhost",
  GIT_COMMITTER_NAME: "Orchestra",
  GIT_COMMITTER_EMAIL: "orchestra@localhost",
}

export function make(deps: Deps) {
  const git = gitRunner(deps.proc, deps.env)

  /** The worktree's tree as it stands, written from a copy of its index so the real index stays untouched. */
  const tree = Effect.fnUntraced(function* (cwd: string) {
    const index = yield* git(cwd, ["rev-parse", "--path-format=absolute", "--git-path", "index"])
    return yield* Effect.acquireUseRelease(
      Effect.promise(() => fs.mkdtemp(path.join(os.tmpdir(), "orchestra-snapshot-"))),
      (temporary) =>
        Effect.gen(function* () {
          const env = { GIT_INDEX_FILE: path.join(temporary, "index") }
          yield* Effect.promise(() => fs.copyFile(index.out, env.GIT_INDEX_FILE).catch(() => undefined))
          const added = yield* git(cwd, ["add", "-A"], env)
          const written = yield* git(cwd, ["write-tree"], env)
          if (added.code !== 0 || written.code !== 0) return undefined
          return written.out
        }),
      (temporary) => Effect.promise(() => fs.rm(temporary, { recursive: true, force: true })),
    )
  })

  /** Scans the commits `from..to` with gitleaks; anything but a clean exit blocks the push. */
  const scan = Effect.fnUntraced(function* (cwd: string, range: string) {
    const scanner = yield* deps.scanner
    if (!scanner) return "no secret scanner (gitleaks) is available"
    const result = yield* deps.proc
      .run(
        ChildProcess.make(scanner, ["git", "--no-banner", "--redact", "--exit-code", "1", "--log-opts", range, cwd], {
          cwd,
          env: deps.env,
          extendEnv: true,
          stdin: "ignore",
        }),
        { combineOutput: true, maxOutputBytes: 1024 * 1024, timeout: "120 seconds" },
      )
      .pipe(Effect.result)
    if (result._tag === "Failure") return `the secret scanner could not run: ${result.failure.message}`
    if (result.success.exitCode === 0) return undefined
    if (result.success.exitCode === 1) return "the secret scanner found a secret in the changed files"
    return `the secret scanner could not run (exit ${result.success.exitCode})`
  })

  const update = (attempt: Attempt, set: Partial<typeof BoardAttemptTable.$inferInsert>) =>
    deps.quiet((tx) =>
      tx
        .update(BoardAttemptTable)
        .set(set)
        .where(and(eq(BoardAttemptTable.issue_id, attempt.issue_id), eq(BoardAttemptTable.n, attempt.n)))
        .run(),
    )

  const find = (issue: Board.IssueID) =>
    deps.quiet((tx) =>
      Effect.gen(function* () {
        const row = yield* tx
          .select({ issue: BoardIssueTable, project: BoardProjectTable })
          .from(BoardIssueTable)
          .innerJoin(BoardProjectTable, eq(BoardIssueTable.project_id, BoardProjectTable.id))
          .where(eq(BoardIssueTable.id, issue))
          .get()
        if (!row) return undefined
        const attempt = yield* open(tx, issue)
        return { ...row, attempt, directory: yield* worktree(tx, row.project) }
      }),
    )

  /** The card's worktree: the one recorded on the attempt, else the worktree that has the card's branch checked out. */
  const locate = Effect.fnUntraced(function* (directory: string | null, issue: IssueRow, attempt: Attempt) {
    if (attempt.worktree) return attempt.worktree
    if (!directory || !issue.branch) return null
    const listed = yield* git(directory, ["worktree", "list", "--porcelain"])
    const found = listed.out
      .split("\n\n")
      .map((block) => block.split("\n"))
      .find((lines) => lines.includes(`branch refs/heads/${issue.branch}`))
      ?.find((line) => line.startsWith("worktree "))
      ?.slice("worktree ".length)
    if (found) yield* update(attempt, { worktree: found })
    return found ?? null
  })

  /**
   * Re-creates a gone worktree on the card's branch, then writes the snapshot's tree over its files only, so HEAD and
   * index are the branch's again and the work in progress shows as uncommitted, as before the loss (section 8.1).
   * The branch is checked out detached when another worktree holds it.
   */
  const restore = Effect.fnUntraced(function* (directory: string, project: ProjectRow, branch: string, cwd: string, sha: string, ref: string) {
    const remote = yield* deps.remote(directory, project).pipe(Effect.orElseSucceed(() => undefined))
    if (!remote) return false
    yield* git(directory, ["worktree", "prune"])
    const fetched = yield* git(directory, ["fetch", "--quiet", "--no-tags", remote, ref])
    if (fetched.code !== 0) return false
    const added =
      (yield* git(directory, ["worktree", "add", cwd, branch])).code === 0 ||
      (yield* git(directory, ["worktree", "add", "--detach", cwd, branch])).code === 0
    if (!added) return false
    // No-overlay restore also deletes the files the snapshot lacks.
    return (yield* git(cwd, ["restore", `--source=${sha}`, "--worktree", "--", "."])).code === 0
  })

  const push = Effect.fnUntraced(function* (issue: Board.IssueID) {
    const found = yield* find(issue)
    const attempt = found?.attempt
    if (!found || !attempt) return { status: "none" } satisfies Result
    const ref = `refs/orchestra/wip/${found.project.key}-${found.issue.number}/a${attempt.n}`
    const cwd = yield* locate(found.directory, found.issue, attempt)
    if (!cwd || !existsSync(cwd)) {
      const sha = attempt.snapshot_sha
      const branch = found.issue.branch
      if (cwd && sha && branch && found.directory && (yield* restore(found.directory, found.project, branch, cwd, sha, ref)))
        return { status: "restored", ref, worktree: cwd, sha } satisfies Result
      yield* Effect.logWarning(`drift: ${found.project.key}-${found.issue.number} worktree ${cwd ?? "(none)"} is gone and has no snapshot to restore`)
      return { status: "missing", ref, worktree: cwd } satisfies Result
    }
    const current = yield* tree(cwd)
    if (!current) return { status: "blocked", ref, reason: `could not read the tree of ${cwd}` } satisfies Result
    if (current === attempt.snapshot_tree && attempt.snapshot_sha)
      return { status: "unchanged", ref, sha: attempt.snapshot_sha } satisfies Result
    // The first snapshot's parent is the worktree's HEAD, so the scan and the push carry only the seat's change.
    const parent = attempt.snapshot_sha ?? (yield* git(cwd, ["rev-parse", "HEAD"])).out
    const commit = yield* git(
      cwd,
      ["commit-tree", current, ...(parent ? ["-p", parent] : []), "-m", `orchestra snapshot ${found.project.key}-${found.issue.number} a${attempt.n}`],
      IDENTITY,
    )
    const blocked = (reason: string) =>
      update(attempt, { snapshot_blocked: reason }).pipe(Effect.as({ status: "blocked", ref, reason } satisfies Result))
    if (commit.code !== 0) return yield* blocked(`could not write the snapshot commit: ${commit.err}`)
    const hit = yield* scan(cwd, parent ? `${parent}..${commit.out}` : commit.out)
    if (hit) return yield* blocked(hit)
    const remote = yield* deps.remote(found.directory ?? cwd, found.project).pipe(Effect.result)
    if (remote._tag === "Failure") return yield* blocked(remote.failure.message)
    const pushed = yield* git(cwd, ["push", "--no-verify", "--force", remote.success, `${commit.out}:${ref}`])
    if (pushed.code !== 0) return yield* blocked(`the push to ${remote.success} failed: ${pushed.err.split("\n").at(-1)}`)
    yield* update(attempt, {
      snapshot_sha: commit.out,
      snapshot_tree: current,
      snapshot_at: yield* Clock.currentTimeMillis,
      snapshot_blocked: null,
    })
    return { status: "pushed", ref, sha: commit.out } satisfies Result
  })

  return {
    tree,
    push,
    /**
     * `pushed` when the worktree's tree equals the last pushed snapshot's tree, else `local`. Null with no open attempt
     * or no worktree to read. The host records a snapshot only after its push succeeded, so the row stands for the remote.
     */
    state: Effect.fnUntraced(function* (issue: Board.IssueID) {
      const found = yield* find(issue)
      if (!found?.attempt) return null satisfies Board.PushState
      const cwd = yield* locate(found.directory, found.issue, found.attempt)
      if (!cwd || !existsSync(cwd)) return null satisfies Board.PushState
      const current = yield* tree(cwd)
      return (current && current === found.attempt.snapshot_tree ? "pushed" : "local") satisfies Board.PushState
    }),
    /** Snapshots every Building card with an open attempt: the 10 minute timer. */
    sweep: Effect.fnUntraced(function* () {
      const issues = yield* deps.quiet((tx) =>
        tx
          .selectDistinct({ id: BoardIssueTable.id })
          .from(BoardIssueTable)
          .innerJoin(BoardAttemptTable, eq(BoardAttemptTable.issue_id, BoardIssueTable.id))
          .where(and(eq(BoardIssueTable.stage, "building"), isNull(BoardAttemptTable.outcome)))
          .all(),
      )
      return yield* Effect.forEach(issues, (row) => push(row.id))
    }),
  }
}

export type Interface = ReturnType<typeof make>

/** The card's open attempt: the latest one with no outcome. */
export const open = Effect.fnUntraced(function* (tx: Tx, issue: Board.IssueID) {
  const latest = yield* tx
    .select()
    .from(BoardAttemptTable)
    .where(eq(BoardAttemptTable.issue_id, issue))
    .orderBy(desc(BoardAttemptTable.n))
    .limit(1)
    .get()
  return latest && latest.outcome === null ? latest : undefined
})

/**
 * Records a dispatch of `issue`: the open attempt ends (`failed` when the card has a crash reason, else `superseded`)
 * and attempt n+1 opens with what it runs on. `board_issue.attempts` becomes the new n.
 */
export const dispatch = Effect.fnUntraced(function* (
  tx: Tx,
  issue: IssueRow,
  input: { readonly worktree?: string; readonly writePaths?: ReadonlyArray<string>; readonly cause?: string },
) {
  const latest = yield* tx
    .select()
    .from(BoardAttemptTable)
    .where(eq(BoardAttemptTable.issue_id, issue.id))
    .orderBy(desc(BoardAttemptTable.n))
    .limit(1)
    .get()
  if (latest && latest.outcome === null)
    yield* tx
      .update(BoardAttemptTable)
      .set({ outcome: issue.crash_reason ? "failed" : "superseded" })
      .where(and(eq(BoardAttemptTable.issue_id, issue.id), eq(BoardAttemptTable.n, latest.n)))
      .run()
  const n = (latest?.n ?? 0) + 1
  const cause = input.cause ?? (n === 1 ? null : `failed:${issue.crash_reason ?? "redispatched"}`)
  yield* tx
    .insert(BoardAttemptTable)
    .values({
      issue_id: issue.id,
      n,
      seat: issue.seat,
      session_id: issue.session_id,
      worktree: input.worktree ?? null,
      branch: issue.branch,
      pr_number: issue.pr_number,
      write_paths: [...(input.writePaths ?? [])],
      cause,
    })
    .run()
  yield* tx.update(BoardIssueTable).set({ attempts: n }).where(eq(BoardIssueTable.id, issue.id)).run()
  return n
})

/**
 * Keeps attempts in step with an issue update: a new Session opens the next attempt, and a changed seat, branch or PR
 * is written to the open one. The crash reason the card had before the update decides how the old attempt ended.
 */
export const follow = Effect.fnUntraced(function* (tx: Tx, before: IssueRow, after: Fields) {
  const updated = yield* tx.select().from(BoardIssueTable).where(eq(BoardIssueTable.id, before.id)).get()
  if (!updated) return
  if (typeof after.session_id === "string" && after.session_id !== before.session_id) {
    yield* dispatch(tx, { ...updated, crash_reason: before.crash_reason ?? updated.crash_reason }, {})
    return
  }
  if (!["seat", "branch", "pr_number"].some((key) => key in after)) return
  yield* tx
    .update(BoardAttemptTable)
    .set({ seat: updated.seat, branch: updated.branch, pr_number: updated.pr_number })
    .where(and(eq(BoardAttemptTable.issue_id, before.id), isNull(BoardAttemptTable.outcome)))
    .run()
})
