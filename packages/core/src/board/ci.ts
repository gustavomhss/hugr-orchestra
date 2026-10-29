export * as BoardCi from "./ci"

import fs from "fs/promises"
import os from "os"
import path from "path"
import { and, eq } from "drizzle-orm"
import { Clock, Effect, Option, Schema } from "effect"
import { ChildProcess } from "effect/unstable/process"
import { Board } from "@orchestra/schema/board"
import type { AppProcess } from "../process"
import { which } from "../util/which"
import type { BoardGithub } from "./github"
import { global } from "./queue-lanes"
import { affected, AUTHOR } from "./queue-shared"
import type { BoardQueue } from "./queue"
import { BoardCheckTable } from "./sql"
import { loadIssue, loadProject, NotFoundError, RefusedError, worktree } from "./shared"
import type { IssueRow, ProjectRow, Tx } from "./shared"

// CI facts (docs/specs/maestro-lead/merge-queue.md section 5): the `.orchestra/ci.json` contract, `ci_run`, and the
// `board_check` ledger keyed by tree. The scoped state is derived from that ledger on every read and never stored.

export interface Deps {
  readonly quiet: <A>(work: (tx: Tx) => Effect.Effect<A, unknown>) => Effect.Effect<A>
  readonly proc: AppProcess.Interface
  readonly gh: BoardGithub.Gh
  readonly env?: NodeJS.ProcessEnv
  /** Replaces `turbo`'s affected set, as in the queue; tests bind it so they need no installed workspace. */
  readonly affected?: BoardQueue.Deps["affected"]
}

/** The scoped check a card that touches no workspace package records instead of running the tests. */
export const UNTOUCHED = "none: no workspace package affected"

export type Contract = {
  readonly base: string
  readonly scoped: { readonly tests: string | null; readonly workflows: ReadonlyArray<string> }
  readonly full: {
    readonly label: string | null
    readonly checks: ReadonlyArray<string>
    /** A line the named jobs (name prefixes) always print; such a job that failed with no failing file and without it never ran its tests. */
    readonly control: { readonly line: string; readonly jobs: ReadonlyArray<string> } | null
  }
  readonly bundle: {
    readonly size: number
    readonly max: number
    readonly waitMinutes: number
    readonly onBaseMoved: "merge-if-disjoint" | "retest"
  }
  readonly budget: { readonly jobs: number | null }
  /**
   * Lanes (merge-queue spec section 7): cards whose turbo affected sets do not overlap land in parallel bundles that
   * run only their packages. Null, or no `turbo.json` on the base, keeps one bundle at a time.
   */
  readonly lanes: {
    readonly by: "turbo"
    /** Globs whose change has no lane: such a card overlaps everything and runs the whole suite alone. */
    readonly global: ReadonlyArray<string>
    /** Every Nth lane bundle runs the whole suite anyway; 0 never. */
    readonly fullEvery: number
    /** Jobs one lane bundle's gate uses; with `budget.jobs` it caps lanes in flight. Null leaves them uncapped. */
    readonly jobs: number | null
    /** The workflows a lane bundle dispatches with a `packages` input instead of applying the full label. */
    readonly workflows: ReadonlyArray<string>
  } | null
  /** The remote snapshot refs go to; a private one keeps a public repository's work in progress private. */
  readonly snapshots: { readonly remote: string }
  readonly merge: "merge"
  /** Where the contract came from: the file, or the default for a repository with or without required PR checks. */
  readonly source: "file" | "required-checks" | "no-ci"
}

const Positive = Schema.Int.check(Schema.isGreaterThan(0))
const File = Schema.Struct({
  base: Schema.optional(Schema.String),
  scoped: Schema.optional(
    Schema.Struct({ tests: Schema.optional(Schema.NullOr(Schema.String)), workflows: Schema.optional(Schema.Array(Schema.String)) }),
  ),
  full: Schema.optional(
    Schema.Struct({
      label: Schema.optional(Schema.NullOr(Schema.String)),
      checks: Schema.optional(Schema.Array(Schema.String)),
      control: Schema.optional(Schema.NullOr(Schema.Struct({ line: Schema.String, jobs: Schema.Array(Schema.String) }))),
    }),
  ),
  bundle: Schema.optional(
    Schema.Struct({
      size: Schema.optional(Positive),
      max: Schema.optional(Positive),
      waitMinutes: Schema.optional(Positive),
      onBaseMoved: Schema.optional(Schema.Literals(["merge-if-disjoint", "retest"])),
    }),
  ),
  budget: Schema.optional(Schema.Struct({ jobs: Schema.optional(Positive) })),
  lanes: Schema.optional(
    Schema.Struct({
      by: Schema.Literal("turbo"),
      global: Schema.optional(Schema.Array(Schema.String)),
      fullEvery: Schema.optional(Schema.Int.check(Schema.isGreaterThanOrEqualTo(0))),
      jobs: Schema.optional(Positive),
      workflows: Schema.optional(Schema.Array(Schema.String)),
    }),
  ),
  snapshots: Schema.optional(Schema.Struct({ remote: Schema.optional(Schema.String) })),
  // Squash or rebase would rewrite member SHAs and GitHub would stop marking member PRs merged.
  merge: Schema.optional(Schema.Literal("merge")),
})
const decodeFile = Schema.decodeUnknownResult(Schema.fromJsonString(File))
const Rules = Schema.Array(Schema.Struct({ type: Schema.String }))
const decodeRules = Schema.decodeUnknownOption(Schema.fromJsonString(Rules))
const Branch = Schema.Struct({ commit: Schema.Struct({ sha: Schema.String, commit: Schema.Struct({ tree: Schema.Struct({ sha: Schema.String }) }) }) })
const decodeBranch = Schema.decodeUnknownOption(Schema.fromJsonString(Branch))
const Runs = Schema.Array(
  Schema.Struct({ headSha: Schema.String, status: Schema.String, conclusion: Schema.String, url: Schema.String, createdAt: Schema.String }),
)
const decodeRuns = Schema.decodeUnknownOption(Schema.fromJsonString(Runs))

const RUN_URL = /https:\/\/github\.com\/[\w.-]+\/[\w.-]+\/actions\/runs\/\d+/g

export function make(deps: Deps) {
  const git = (cwd: string, args: ReadonlyArray<string>, env?: Record<string, string>) =>
    deps.proc
      .run(
        ChildProcess.make("git", ["--no-optional-locks", "-C", cwd, "-c", "core.fsmonitor=false", ...args], {
          cwd,
          env,
          extendEnv: true,
          stdin: "ignore",
        }),
        { maxOutputBytes: 4 * 1024 * 1024, maxErrorBytes: 16 * 1024, timeout: "60 seconds" },
      )
      .pipe(
        Effect.map((result) => ({ code: result.exitCode, out: result.stdout.toString("utf8").trim(), err: result.stderr.toString("utf8").trim() })),
        Effect.catch((error) => Effect.succeed({ code: 1, out: "", err: error.message })),
      )

  /** The contract read from the base branch: a change to it goes through a PR like any other change. */
  const contract = Effect.fnUntraced(function* (directory: string, project: ProjectRow) {
    const origin = yield* git(directory, ["symbolic-ref", "--short", "refs/remotes/origin/HEAD"])
    const ref = origin.code === 0 ? origin.out : "HEAD"
    const shown = yield* git(directory, ["show", `${ref}:.orchestra/ci.json`])
    const base = origin.code === 0 ? origin.out.replace(/^origin\//, "") : (yield* git(directory, ["rev-parse", "--abbrev-ref", "HEAD"])).out
    if (shown.code !== 0) return yield* defaults(base, project)
    const decoded = decodeFile(shown.out)
    if (decoded._tag === "Failure")
      return yield* new RefusedError({
        message: `.orchestra/ci.json on ${ref} is invalid, so CI is not run: ${decoded.failure.message.split("\n")[0]}. Fix the file on the base branch.`,
      })
    const file = decoded.success
    return {
      base: file.base ?? base,
      scoped: { tests: file.scoped?.tests ?? null, workflows: file.scoped?.workflows ?? [] },
      full: { label: file.full?.label ?? null, checks: file.full?.checks ?? [], control: file.full?.control ?? null },
      bundle: {
        size: file.bundle?.size ?? 4,
        max: file.bundle?.max ?? 16,
        waitMinutes: file.bundle?.waitMinutes ?? 45,
        onBaseMoved: file.bundle?.onBaseMoved ?? "retest",
      },
      budget: { jobs: file.budget?.jobs ?? null },
      lanes: file.lanes
        ? {
            by: "turbo",
            global: file.lanes.global ?? [],
            fullEvery: file.lanes.fullEvery ?? 0,
            jobs: file.lanes.jobs ?? null,
            workflows: file.lanes.workflows ?? [],
          }
        : null,
      snapshots: { remote: file.snapshots?.remote ?? "origin" },
      merge: "merge",
      source: "file",
    } satisfies Contract
  })

  const defaults = Effect.fnUntraced(function* (base: string, project: ProjectRow) {
    const rules = project.github_repo ? yield* deps.gh(["api", `repos/${project.github_repo}/rules/branches/${base}`]) : undefined
    const required =
      rules?.exitCode === 0 &&
      Option.getOrElse(decodeRules(rules.stdout), () => []).some((rule) => rule.type === "required_status_checks")
    return {
      base,
      scoped: { tests: null, workflows: [] },
      full: { label: null, checks: [], control: null },
      bundle: { size: required ? 4 : 1, max: 16, waitMinutes: 45, onBaseMoved: "retest" },
      budget: { jobs: null },
      lanes: null,
      snapshots: { remote: "origin" },
      merge: "merge",
      source: required ? "required-checks" : "no-ci",
    } satisfies Contract
  })

  /** The tree of the worktree as it stands, from a temporary index so the worktree and its index stay untouched. */
  const snapshot = Effect.fnUntraced(function* (directory: string) {
    const index = yield* git(directory, ["rev-parse", "--path-format=absolute", "--git-path", "index"])
    return yield* Effect.acquireUseRelease(
      Effect.promise(() => fs.mkdtemp(path.join(os.tmpdir(), "orchestra-check-"))),
      (temporary) =>
        Effect.gen(function* () {
          const env = { GIT_INDEX_FILE: path.join(temporary, "index") }
          yield* Effect.promise(() => fs.copyFile(index.out, env.GIT_INDEX_FILE).catch(() => undefined))
          const added = yield* git(directory, ["add", "-A"], env)
          const tree = yield* git(directory, ["write-tree"], env)
          if (added.code !== 0 || tree.code !== 0)
            return yield* new RefusedError({ message: `Could not read the tree of ${directory}: ${added.err || tree.err}` })
          return tree.out
        }),
      (temporary) => Effect.promise(() => fs.rm(temporary, { recursive: true, force: true })),
    )
  })

  const cardWorktree = Effect.fnUntraced(function* (directory: string, issue: IssueRow, ref: string) {
    if (!issue.branch) return yield* new RefusedError({ message: `${ref} has no branch; link one with board_issue first.` })
    const listed = yield* git(directory, ["worktree", "list", "--porcelain"])
    const found = listed.out
      .split("\n\n")
      .map((block) => block.split("\n"))
      .find((lines) => lines.includes(`branch refs/heads/${issue.branch}`))
      ?.find((line) => line.startsWith("worktree "))
      ?.slice("worktree ".length)
    if (!found) return yield* new RefusedError({ message: `${ref}'s branch ${issue.branch} is checked out in no worktree of ${directory}.` })
    return found
  })

  const rows = (issue: Board.IssueID) =>
    deps.quiet((tx) => tx.select().from(BoardCheckTable).where(eq(BoardCheckTable.issue_id, issue)).all())

  const insert = (row: typeof BoardCheckTable.$inferInsert) =>
    deps.quiet((tx) => tx.insert(BoardCheckTable).values(row).run())

  const runTests = Effect.fnUntraced(function* (input: {
    readonly issue: IssueRow
    readonly cwd: string
    readonly argv: ReadonlyArray<string>
    readonly tree: string
  }) {
    const startedAt = yield* Clock.currentTimeMillis
    const executable = which(input.argv[0] ?? "", deps.env ?? process.env) ?? input.argv[0] ?? ""
    const result = yield* deps.proc
      .run(ChildProcess.make(executable, input.argv.slice(1), { cwd: input.cwd, env: deps.env, extendEnv: true, stdin: "ignore" }), {
        combineOutput: true,
        maxOutputBytes: 16 * 1024 * 1024,
        timeout: "90 minutes",
      })
      .pipe(Effect.result)
    const output = result._tag === "Success" ? (result.success.output?.toString("utf8") ?? "") : ""
    const outcome: Board.CheckOutcome =
      result._tag === "Failure" ? "error" : result.success.exitCode === 0 ? "pass" : "fail"
    const commit = yield* git(input.cwd, ["rev-parse", "HEAD"])
    const row = {
      id: Board.CheckID.create(),
      issue_id: input.issue.id,
      attempt: input.issue.attempts,
      kind: "scoped" as const,
      command: input.argv.join(" "),
      tree_sha: input.tree,
      commit_sha: commit.code === 0 ? commit.out : null,
      outcome,
      url: output.match(RUN_URL)?.at(-1) ?? null,
      failing: result._tag === "Failure" ? [result.failure.message] : outcome === "fail" ? failing(output) : [],
      started_at: startedAt,
      ended_at: yield* Clock.currentTimeMillis,
    }
    yield* insert(row)
    return row
  })

  // The workspace packages a card's tree changes against base, by turbo's affected set: the root `//` alone is no
  // package, and a file the lanes call global counts as one. Undefined when turbo cannot tell.
  const packages = Effect.fnUntraced(function* (cwd: string, tree: string, terms: Contract) {
    const base = yield* git(cwd, ["merge-base", "HEAD", `origin/${terms.base}`])
    const from = base.code === 0 ? base.out : (yield* git(cwd, ["merge-base", "HEAD", terms.base])).out
    // turbo compares commits, so the tree, which may hold uncommitted edits, gets a commit of its own that no ref keeps.
    const to = (yield* git(cwd, [...AUTHOR, "commit-tree", tree, "-p", "HEAD", "-m", "ci_run tree"])).out
    if (!from || !to) return undefined
    const files = (yield* git(cwd, ["diff", "--name-only", from, to])).out.split("\n").filter(Boolean)
    if (terms.lanes && global(files, terms.lanes.global)) return ["the whole repository"]
    return (yield* affected(deps, cwd, from, to))?.filter((name) => name !== "//")
  })

  /** Dispatches each workflow once per pushed tree, and settles pending dispatches from `gh run list`. */
  const workflows = Effect.fnUntraced(function* (input: {
    readonly project: ProjectRow
    readonly issue: IssueRow
    readonly files: ReadonlyArray<string>
    readonly dispatch: boolean
    readonly notes: string[]
  }) {
    if (input.files.length === 0) return
    const repo = input.project.github_repo
    if (!repo || !input.issue.branch) {
      input.notes.push("The contract's workflows need a GitHub repository and a branch; none was dispatched.")
      return
    }
    const known = yield* rows(input.issue.id)
    yield* Effect.forEach(
      known.filter((row) => row.kind === "workflow" && row.outcome === "pending"),
      (row) => settle(repo, input.issue.branch ?? "", row),
    )
    if (!input.dispatch) return
    const head = yield* deps.gh(["api", `repos/${repo}/branches/${input.issue.branch}`])
    const branch = head.exitCode === 0 ? Option.getOrUndefined(decodeBranch(head.stdout)) : undefined
    if (!branch) {
      input.notes.push(`${input.issue.branch} is not pushed, so the contract's workflows wait for the push.`)
      return
    }
    const tree = branch.commit.commit.tree.sha
    const fresh = input.files.filter(
      (file) => !known.some((row) => row.kind === "workflow" && row.command === file && row.tree_sha === tree && row.outcome !== "error"),
    )
    yield* Effect.forEach(fresh, (file) =>
      Effect.gen(function* () {
        const startedAt = yield* Clock.currentTimeMillis
        const sent = yield* deps.gh(["workflow", "run", file, "--ref", input.issue.branch ?? "", "-R", repo])
        yield* insert({
          id: Board.CheckID.create(),
          issue_id: input.issue.id,
          attempt: input.issue.attempts,
          kind: "workflow",
          command: file,
          tree_sha: tree,
          commit_sha: branch.commit.sha,
          outcome: sent.exitCode === 0 ? "pending" : "error",
          url: null,
          failing: sent.exitCode === 0 ? [] : [sent.stderr.trim() || `gh workflow run ${file} failed`],
          started_at: startedAt,
          ended_at: sent.exitCode === 0 ? null : startedAt,
        })
      }),
    )
  })

  const settle = Effect.fnUntraced(function* (repo: string, branch: string, row: typeof BoardCheckTable.$inferSelect) {
    const listed = yield* deps.gh([
      "run", "list", "-R", repo, "--workflow", row.command, "--branch", branch, "--event", "workflow_dispatch",
      "--json", "headSha,status,conclusion,url,createdAt", "--limit", "20",
    ])
    // A dispatch returns no run id: the run is the newest one on the dispatched commit created after the dispatch.
    const run = Option.getOrElse(decodeRuns(listed.stdout), () => []).find(
      (item) => item.headSha === row.commit_sha && Date.parse(item.createdAt) >= row.started_at - 60_000,
    )
    if (!run) return
    if (run.status !== "completed") {
      if (row.url !== run.url) yield* deps.quiet((tx) => tx.update(BoardCheckTable).set({ url: run.url }).where(eq(BoardCheckTable.id, row.id)).run())
      return
    }
    const outcome: Board.CheckOutcome =
      run.conclusion === "success" ? "pass" : run.conclusion === "failure" || run.conclusion === "timed_out" ? "fail" : "error"
    yield* deps.quiet((tx) =>
      tx
        .update(BoardCheckTable)
        .set({ outcome, url: run.url, failing: outcome === "pass" ? [] : [row.command], ended_at: Date.now() })
        .where(and(eq(BoardCheckTable.id, row.id), eq(BoardCheckTable.outcome, "pending")))
        .run(),
    )
  })

  return {
    contract,
    snapshot,
    run: Effect.fnUntraced(function* (input: Board.CiRunInput) {
      const found = yield* deps.quiet((tx) =>
        Effect.gen(function* () {
          const project = yield* loadProject(tx, input.project)
          const issue = yield* loadIssue(tx, project, input.issue)
          return { project, issue, directory: yield* worktree(tx, project) }
        }),
      )
      const ref = `${found.project.key}-${found.issue.number}`
      if (!found.directory) return yield* new RefusedError({ message: `${found.project.key} has no repo; set one with board_project.` })
      const terms = yield* contract(found.directory, found.project)
      const cwd = yield* cardWorktree(found.directory, found.issue, ref)
      const tree = yield* snapshot(cwd)
      const notes: string[] = []
      const dispatch = input.run !== false

      if (terms.scoped.tests === null)
        notes.push(
          terms.source === "required-checks"
            ? "No .orchestra/ci.json: the scoped gate is the PR's own checks."
            : terms.source === "no-ci"
              ? "No .orchestra/ci.json and no required checks: the scoped gate is land's verification only."
              : "The contract has no scoped.tests command.",
        )
      // A contract that tests per package and a card that changes none, such as a docs-only card: nothing is there to
      // test, so the ledger records an explicit `none` check instead of refusing or running the whole suite.
      const bare = terms.scoped.tests?.includes("{package}") === true && !input.package
      if (bare) {
        const touched = yield* packages(cwd, tree, terms)
        if (touched === undefined)
          return yield* new RefusedError({ message: `The contract's scoped.tests needs \`package\` for ${ref}, and turbo could not tell which packages it changes.` })
        if (touched.length > 0)
          return yield* new RefusedError({ message: `The contract's scoped.tests needs \`package\` for ${ref}: it changes ${touched.join(", ")}.` })
        notes.push(`${ref} changes no workspace package, so there is nothing to test: the scoped tests record \`${UNTOUCHED}\`.`)
        const done = (yield* rows(found.issue.id)).some((row) => row.kind === "scoped" && row.tree_sha === tree && row.command === UNTOUCHED)
        if (dispatch && !done) {
          const now = yield* Clock.currentTimeMillis
          yield* insert({
            id: Board.CheckID.create(),
            issue_id: found.issue.id,
            attempt: found.issue.attempts,
            kind: "scoped",
            command: UNTOUCHED,
            tree_sha: tree,
            commit_sha: null,
            outcome: "pass",
            url: null,
            failing: [],
            started_at: now,
            ended_at: now,
          })
        }
      }
      if (terms.scoped.tests !== null && !bare) {
        const argv = yield* command(terms.scoped.tests, input, ref)
        const done = (yield* rows(found.issue.id)).some(
          (row) => row.kind === "scoped" && row.tree_sha === tree && row.command === argv.join(" ") && row.outcome !== "error",
        )
        if (dispatch && !done) yield* runTests({ issue: found.issue, cwd, argv, tree })
      }
      yield* workflows({ project: found.project, issue: found.issue, files: terms.scoped.workflows, dispatch, notes })

      const checks = (yield* rows(found.issue.id)).filter((row) => row.tree_sha === tree).sort((a, b) => a.started_at - b.started_at)
      return {
        tree,
        state: state(checks, terms),
        checks: checks.map(toCheck),
        notes,
      } satisfies Board.CiRunResult
    }),
  }
}

export type Interface = ReturnType<typeof make>
export type Error = NotFoundError | RefusedError

/**
 * `scoped-red` when the latest result of any check on the tree failed; `scoped-green` when the contract requires
 * something and every required check passed on the tree. Rows must all be on the one tree.
 */
export function state(
  rows: ReadonlyArray<typeof BoardCheckTable.$inferSelect>,
  terms: Pick<Contract, "scoped">,
): Board.ScopedState {
  const latest = [...new Map(rows.toSorted((a, b) => a.started_at - b.started_at).map((row) => [`${row.kind}:${row.command}`, row])).values()]
  if (latest.some((row) => row.outcome === "fail")) return "scoped-red"
  if (terms.scoped.tests === null && terms.scoped.workflows.length === 0) return null
  const tests = terms.scoped.tests === null || latest.some((row) => row.kind === "scoped" && row.outcome === "pass")
  const flows = terms.scoped.workflows.every((file) => latest.some((row) => row.kind === "workflow" && row.command === file && row.outcome === "pass"))
  return tests && flows ? "scoped-green" : null
}

// Split on whitespace with no shell: `{files}` becomes one argument per file and `{package}` is filled in place.
export function command(template: string, input: { readonly package?: string; readonly files?: ReadonlyArray<string> }, ref: string) {
  if (template.includes("{package}") && !input.package)
    return Effect.fail(new RefusedError({ message: `The contract's scoped.tests needs \`package\` for ${ref}.` }))
  return Effect.succeed(
    template
      .split(/\s+/)
      .filter(Boolean)
      .flatMap((token) => (token === "{files}" ? [...(input.files ?? [])] : [token.replaceAll("{package}", input.package ?? "")])),
  )
}

// Bun prints each test file as a header line and `(fail)` under it; vitest prints `FAIL |project| <file> > <test>`; tsc and
// tsgo print each type error with its file path; test:ci prints a failed job as `=== name: failure ===`. Colors are stripped.
export function failing(colored: string) {
  const output = colored.replace(/\x1b\[[0-9;]*m/g, "")
  const bun = output
    .split("\n")
    .reduce(
      (acc, line) => {
        const header = line.trim().match(/^(\S+\.test\.[cm]?[jt]sx?):$/)
        if (header) return { file: header[1], found: acc.found }
        if (line.includes("(fail)") && acc.file) return { file: acc.file, found: acc.found.add(acc.file) }
        return acc
      },
      { file: undefined as string | undefined, found: new Set<string>() },
    ).found
  const types = output.split("\n").flatMap((line) => line.trim().match(/^(\S+\.[cm]?tsx?)(?:\(\d+,\d+\)|:\d+:\d+)(?::| -) error TS\d+/)?.[1] ?? [])
  const vitest = output.split("\n").flatMap((line) => line.trim().match(/^FAIL\s+(?:\|[^|]+\|\s+)?(\S+\.[cm]?[jt]sx?)\b/)?.[1] ?? [])
  const files = [...new Set([...bun, ...vitest, ...types])]
  if (files.length > 0) return files
  return [...output.matchAll(/^=== (.+): failure ===$/gm)].map((match) => match[1] ?? "").filter(Boolean)
}

// A turbo run prints each package's output between `##[group]<package>:test` and `##[endgroup]`; the bun test files
// that failed inside a group belong to that package. Windows paths come back with forward slashes.
export function packaged(colored: string) {
  return colored
    .replace(/\x1b\[[0-9;]*m/g, "")
    .split(/^##\[group\]/m)
    .slice(1)
    .flatMap((section) => {
      const name = section.match(/^(\S+):test\r?$/m)?.[1]
      const files = failing(section.split(/^##\[endgroup\]/m)[0] ?? "")
        .filter((file) => /\.test\.[cm]?[jt]sx?$/.test(file))
        .map((file) => file.replaceAll("\\", "/"))
      return name && files.length > 0 ? [{ package: name, files }] : []
    })
}

function toCheck(row: typeof BoardCheckTable.$inferSelect): Board.Check {
  return {
    id: row.id,
    attempt: row.attempt,
    kind: row.kind,
    command: row.command,
    treeSha: row.tree_sha,
    commitSha: row.commit_sha,
    outcome: row.outcome,
    url: row.url,
    failing: row.failing,
    startedAt: row.started_at,
    endedAt: row.ended_at,
  }
}
