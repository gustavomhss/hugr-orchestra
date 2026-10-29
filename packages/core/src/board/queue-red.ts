import fs from "fs/promises"
import os from "os"
import path from "path"
import { and, desc, eq, inArray, ne, sql } from "drizzle-orm"
import { Clock, Effect, Option } from "effect"
import { ChildProcess } from "effect/unstable/process"
import { Board } from "@orchestra/schema/board"
import { which } from "../util/which"
import { BoardCi } from "./ci"
import {
  BoardBundleMemberTable,
  BoardBundleTable,
  BoardDependencyTable,
  BoardFlakeTable,
  BoardIssueTable,
  BoardProjectTable,
} from "./sql"
import { changed, endOf, log } from "./shared"
import type { IssueRow, ProjectRow } from "./shared"
import { AUTHOR, decodeRuns, FAILED, gating, INFRA, judge } from "./queue-shared"
import type { Context, Rollup } from "./queue-shared"
import type { makeRecord } from "./queue-record"

/** The red path of a bundle: what failed, whether base is red, the scoped reruns, the culprit search, the fix card and the base probe. `note` comes from the record module. */
export function makeRed(ctx: Context & Pick<ReturnType<typeof makeRecord>, "note">) {
  const deps = ctx.deps
  const git = ctx.git
  const note = ctx.note

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
   * whose addition turns red, with the members merged before it in `after`. Undefined when a checkout fails; an empty
   * `culprits` means no culprit.
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
    if (culprits.length > 0) return { culprits: culprits.map((item) => item.issue), after: [] }
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
      if (whole) return { culprits: [], after: [] }
    }
    return { culprits: members.slice(lo - 1, lo).map((item) => item.issue), after: members.slice(0, lo - 1).map((item) => item.issue) }
  })

  /**
   * Section 6.8: the first-parent commit between the last merged bundle and the red base where F starts failing. Undefined
   * when there is no merged bundle to start from or a checkout fails.
   */
  const bisect = Effect.fnUntraced(function* (
    row: ProjectRow,
    directory: string,
    template: string,
    bundle: typeof BoardBundleTable.$inferSelect,
    groups: ReadonlyArray<{ readonly package: string; readonly files: ReadonlyArray<string> }>,
  ) {
    const good = yield* deps.quiet((tx) =>
      tx
        .select({ head_sha: BoardBundleTable.head_sha })
        .from(BoardBundleTable)
        .where(and(eq(BoardBundleTable.project_id, row.id), eq(BoardBundleTable.status, "merged")))
        .orderBy(desc(BoardBundleTable.n))
        .get(),
    )
    if (!good) return undefined
    if ((yield* git(directory, ["merge-base", "--is-ancestor", good.head_sha, bundle.base_sha])).code !== 0) return undefined
    const commits = (yield* git(directory, ["rev-list", "--first-parent", "--reverse", `${good.head_sha}..${bundle.base_sha}`])).out.split("\n").filter(Boolean)
    if (commits.length === 0) return undefined
    const scratch = yield* Effect.promise(() => fs.mkdtemp(path.join(os.tmpdir(), `orchestra-bisect-${bundle.n}-`)))
    const added = yield* git(directory, ["worktree", "add", "--quiet", "--detach", scratch, bundle.base_sha])
    if (added.code !== 0) {
      yield* Effect.promise(() => fs.rm(scratch, { recursive: true, force: true }))
      return undefined
    }
    return yield* Effect.gen(function* () {
      // The last commit is known to fail, so the search only narrows within the list.
      let lo = 0
      let hi = commits.length - 1
      while (lo < hi) {
        const mid = Math.floor((lo + hi) / 2)
        if ((yield* git(scratch, ["checkout", "--quiet", "--detach", commits[mid] ?? ""])).code !== 0) return undefined
        const passes = yield* runGroups(scratch, template, bundle.branch, groups)
        if (passes) lo = mid + 1
        if (!passes) hi = mid
      }
      return commits[lo]
    }).pipe(Effect.ensuring(git(directory, ["worktree", "remove", "--force", scratch])))
  })

  /** Section 6.8: the open fix card for a red base, reused while an earlier one has not shipped. */
  const fixCard = Effect.fnUntraced(function* (
    row: ProjectRow,
    base: string,
    culprit: string | undefined,
    groups: ReadonlyArray<{ readonly package: string; readonly files: ReadonlyArray<string> }>,
  ) {
    const open = yield* deps.quiet((tx) =>
      tx
        .select({ id: BoardIssueTable.id })
        .from(BoardBundleTable)
        .innerJoin(BoardIssueTable, eq(BoardIssueTable.id, BoardBundleTable.fix_issue_id))
        .where(and(eq(BoardBundleTable.project_id, row.id), ne(BoardIssueTable.stage, "shipped"), ne(BoardIssueTable.stage, "cut")))
        .orderBy(desc(BoardBundleTable.n))
        .get(),
    )
    if (open) return open.id
    const files = groups.flatMap((group) => group.files).join(", ")
    const title = `Fix ${base}: ${files} fail${culprit ? ` since ${culprit.slice(0, 10)}` : ""}`
    const body = `${base} fails ${files}.${culprit ? ` Bisect found ${culprit} as the first failing commit.` : " The queue has no green point to bisect from."} The queue cuts only this card until ${base} is green; it rides alone and merges when these tests pass.`
    const created = yield* deps.quiet((tx) =>
      Effect.gen(function* () {
        // `row` may be stale: the next issue number comes from a fresh read.
        const project = yield* tx.select().from(BoardProjectTable).where(eq(BoardProjectTable.id, row.id)).get()
        if (!project) return yield* Effect.die(`${row.key} has no project row to file its fix card in.`)
        const id = Board.IssueID.create()
        const position = yield* endOf(tx, row.id, "backlog")
        const entered = yield* Clock.currentTimeMillis
        yield* tx
          .insert(BoardIssueTable)
          .values({
            id,
            project_id: row.id,
            number: project.next_issue_number,
            title,
            body,
            type: "bug",
            epic_id: null,
            stage: "backlog",
            position,
            estimate: null,
            seat: null,
            session_id: null,
            branch: null,
            pr_number: null,
            attempts: 0,
            crash_reason: null,
            guardrail_rule: null,
            record: null,
            stage_entered_at: entered,
            github_dirty: project.github_repo !== null,
          })
          .run()
        yield* tx
          .update(BoardProjectTable)
          .set({ next_issue_number: project.next_issue_number + 1 })
          .where(eq(BoardProjectTable.id, row.id))
          .run()
        const activity = yield* log(tx, {
          project: row.id,
          issue: id,
          actor: "github",
          action: "issue.create",
          reason: "base is red",
          after: {
            number: project.next_issue_number,
            title,
            body,
            type: "bug",
            stage: "backlog",
            position,
            stage_entered_at: entered,
          },
        })
        return { id, changed: changed(row.id, activity, id) }
      }),
    )
    yield* deps.publish(created.changed)
    return created.id
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

  return { failures, baseState, scope, tryOn, isolate, bisect, fixCard, probe, flaky }
}
