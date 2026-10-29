import { and, asc, desc, eq, inArray } from "drizzle-orm"
import { Clock, Effect, Option, Schema } from "effect"
import { ChildProcess } from "effect/unstable/process"
import { Board } from "@orchestra/schema/board"
import type { AppProcess } from "../process"
import { which } from "../util/which"
import type { BoardCi } from "./ci"
import type { BoardGithub } from "./github"
import type { BoardRecord } from "./record"
import { BoardBundleMemberTable, BoardBundleTable, BoardIssueTable, BoardNoteTable, BoardQueueTable } from "./sql"
import { changed, endOf, log } from "./shared"
import type { gitRunner } from "./shared"
import type { Changed, IssueRow, ProjectRow, Tx } from "./shared"

export interface Deps {
  readonly quiet: <A>(work: (tx: Tx) => Effect.Effect<A, unknown>) => Effect.Effect<A>
  readonly proc: AppProcess.Interface
  readonly env?: NodeJS.ProcessEnv
  readonly gh: BoardGithub.Gh
  readonly contract: (directory: string, project: ProjectRow) => Effect.Effect<BoardCi.Contract, { readonly message: string }>
  readonly publish: (changed: Changed) => Effect.Effect<void>
  /** Atlas's record renderer and trailer writer; `Board.layer` binds it, tests may leave it unbound. */
  readonly record?: BoardRecord.Port
  /** Replaces `turbo`'s affected set; tests bind it so they need no installed workspace. */
  readonly affected?: (directory: string, from: string, to: string) => Effect.Effect<ReadonlyArray<string> | undefined>
}

/** What every queue module shares: the injected dependencies and the git runner built from them. */
export type Context = { readonly deps: Deps; readonly git: ReturnType<typeof gitRunner> }

export const Rollup = Schema.Struct({
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
export const decodeRollup = Schema.decodeUnknownOption(Schema.fromJsonString(Rollup))
export const decodeRuns = Schema.decodeUnknownOption(Schema.fromJsonString(Rollup.fields.statusCheckRollup))
export const FAILED = new Set(["FAILURE", "TIMED_OUT", "CANCELLED", "STARTUP_FAILURE", "ACTION_REQUIRED", "ERROR"])
export const PASSED = new Set(["SUCCESS", "SKIPPED", "NEUTRAL"])
export const INFRA = new Set(["CANCELLED", "TIMED_OUT", "STARTUP_FAILURE"])
export const AUTHOR = ["-c", "user.name=Orchestra", "-c", "user.email=orchestra@users.noreply.github.com"]

/** `full.checks` names the checks that gate the bundle, matched by check or by the workflow that ran it; with none named, every reported check must pass. */
export function judge(rollup: typeof Rollup.Type["statusCheckRollup"], contract: BoardCi.Contract) {
  const gates = gating(rollup, contract)
  if (gates.some((check) => check.done && FAILED.has(check.result))) return "red"
  if (contract.full.checks.some((name) => !gates.some((check) => check.name === name || check.workflow === name))) return "pending"
  if (gates.length === 0) return contract.source === "no-ci" ? "green" : "pending"
  return gates.every((check) => check.done && PASSED.has(check.result)) ? "green" : "pending"
}

export function gating(rollup: typeof Rollup.Type["statusCheckRollup"], contract: BoardCi.Contract) {
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

const Dry = Schema.Struct({ packages: Schema.Array(Schema.String) })
const decodeDry = Schema.decodeUnknownOption(Schema.fromJsonString(Dry))

/** Section 7.1's affected set from `turbo`: the packages a commit range touches and every package that depends on them. */
export const affected = Effect.fnUntraced(function* (deps: Deps, directory: string, from: string, to: string) {
  if (deps.affected) return yield* deps.affected(directory, from, to)
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

/** The project's bundles in flight, oldest first: one in phase 1, one per lane in phase 2. */
export const openBundles = Effect.fnUntraced(function* (tx: Tx, project: Board.ProjectID) {
  return yield* tx
    .select()
    .from(BoardBundleTable)
    .where(and(eq(BoardBundleTable.project_id, project), inArray(BoardBundleTable.status, ["open", "accepted"])))
    .orderBy(asc(BoardBundleTable.n))
    .all()
})

/** The next bundle number of the project; lanes cut several bundles, so it is never derived from one bundle. */
export const nextBundle = Effect.fnUntraced(function* (tx: Tx, project: Board.ProjectID) {
  const last = yield* tx
    .select({ n: BoardBundleTable.n })
    .from(BoardBundleTable)
    .where(eq(BoardBundleTable.project_id, project))
    .orderBy(desc(BoardBundleTable.n))
    .get()
  return (last?.n ?? 0) + 1
})

/** A lane bundle's gate dispatches the lane workflows with its packages instead of applying the full label. */
export function dispatched(bundle: { readonly packages: ReadonlyArray<string> | null }, contract: BoardCi.Contract) {
  return bundle.packages !== null && (contract.lanes?.workflows.length ?? 0) > 0
}

const Runs = Schema.Array(Schema.Struct({ databaseId: Schema.Number, workflowName: Schema.String, headSha: Schema.String, createdAt: Schema.String }))
const decodeDispatches = Schema.decodeUnknownOption(Schema.fromJsonString(Runs))
const Jobs = Schema.Struct({
  jobs: Schema.Array(Schema.Struct({ name: Schema.String, status: Schema.String, conclusion: Schema.NullOr(Schema.String), url: Schema.String })),
})
const decodeJobs = Schema.decodeUnknownOption(Schema.fromJsonString(Jobs))

/**
 * A lane bundle's checks in rollup shape. A workflow_dispatch run never shows in its PR's status rollup, so the jobs
 * come from the newest dispatched run of each workflow on the bundle head.
 */
export const dispatchRollup = Effect.fnUntraced(function* (deps: Deps, repo: string, branch: string, head: string) {
  const listed = yield* deps.gh([
    "run", "list", "--repo", repo, "--branch", branch, "--event", "workflow_dispatch",
    "--json", "databaseId,workflowName,headSha,createdAt", "--limit", "20",
  ])
  const runs = Option.getOrElse(decodeDispatches(listed.exitCode === 0 ? listed.stdout : ""), () => [])
    .filter((run) => run.headSha === head)
    .toSorted((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
  const latest = runs.filter((run, index) => runs.findIndex((other) => other.workflowName === run.workflowName) === index)
  const jobs = yield* Effect.forEach(latest, (run) =>
    deps.gh(["run", "view", String(run.databaseId), "--repo", repo, "--json", "jobs"]).pipe(
      Effect.map((viewed) =>
        Option.getOrElse(decodeJobs(viewed.exitCode === 0 ? viewed.stdout : ""), () => ({ jobs: [] })).jobs.map((job) => ({
          name: job.name,
          workflowName: run.workflowName,
          status: job.status.toUpperCase(),
          conclusion: job.conclusion ? job.conclusion.toUpperCase() : null,
          detailsUrl: job.url,
        })),
      ),
    ),
  )
  return jobs.flat()
})

export const isMember = Effect.fnUntraced(function* (tx: Tx, bundle: Board.BundleID, issue: Board.IssueID) {
  const row = yield* tx
    .select({ issue: BoardBundleMemberTable.issue_id })
    .from(BoardBundleMemberTable)
    .where(and(eq(BoardBundleMemberTable.bundle_id, bundle), eq(BoardBundleMemberTable.issue_id, issue)))
    .get()
  return row !== undefined
})

/** Moves a card to the end of `stage`, the way `move` does, and returns what changed for the activity row. */
export const place = Effect.fnUntraced(function* (tx: Tx, project: ProjectRow, issue: IssueRow, stage: Board.Stage) {
  const next = { stage, position: yield* endOf(tx, project.id, stage), stage_entered_at: yield* Clock.currentTimeMillis }
  yield* tx
    .update(BoardIssueTable)
    .set({ ...next, ...(project.github_repo !== null ? { github_dirty: true } : {}) })
    .where(eq(BoardIssueTable.id, issue.id))
    .run()
  return { before: { stage: issue.stage, position: issue.position, stage_entered_at: issue.stage_entered_at }, after: next }
})

/** Takes a card out of the queue and back to Review. */
export const release = Effect.fnUntraced(function* (
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

export const insertNote = Effect.fnUntraced(function* (tx: Tx, project: ProjectRow, issue: IssueRow, body: string) {
  const id = Board.NoteID.create()
  yield* tx.insert(BoardNoteTable).values({ id, issue_id: issue.id, author: "orchestra", body }).run()
  const activity = yield* log(tx, { project: project.id, issue: issue.id, actor: "github", action: "note.add", after: { id, author: "orchestra", body } })
  return changed(project.id, activity, issue.id)
})
