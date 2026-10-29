import { mkdtempSync, writeFileSync } from "fs"
import fs from "fs/promises"
import { tmpdir } from "os"
import path from "path"
import { pathToFileURL } from "url"
import { and, asc, eq } from "drizzle-orm"
import { Effect } from "effect"
import { Board } from "@orchestra/core/board/board"
import type { BoardRecord } from "@orchestra/core/board/record"
import { BoardActivityTable, BoardBundleTable, BoardCheckTable, BoardIssueTable, BoardNoteTable, BoardProjectTable, BoardQueueTable } from "@orchestra/core/board/sql"
import { Credential } from "@orchestra/core/credential"
import { Database } from "@orchestra/core/database/database"
import { AppNodeBuilder } from "@orchestra/core/effect/app-node-builder"
import { makeGlobalNode } from "@orchestra/core/effect/app-node"
import { LayerNode } from "@orchestra/core/effect/layer-node"
import { EventV2 } from "@orchestra/core/event"
import { Global } from "@orchestra/core/global"
import { AppProcess } from "@orchestra/core/process"
import { ProjectSchema } from "@orchestra/core/project/schema"
import { ProjectTable } from "@orchestra/core/project/sql"
import { AbsolutePath } from "@orchestra/core/schema"
import { CheckID } from "@orchestra/schema/board"
import type { PrRecord } from "@orchestra/schema/board"
import { git } from "./git"
import { testEffect } from "../lib/effect"

// GitHub is a fake keyed by repo name that reads PR heads from each test's bare origin; git itself is real.
// `seeded` branches make a PR's full gate fail when every one of them is in its head; `baseRuns` is the base commit's check-runs.
type Remote = {
  origin: string
  pulls: Map<number, string>
  bodies: Map<number, string>
  conclusion: string
  seeded: ReadonlyArray<string>
  /** Branches whose full gate comes back CANCELLED (infrastructure, not code). */
  cancelled: ReadonlyArray<string>
  /** The name of the one gating job, and the log it returns when it fails. */
  job: string
  log: string
  baseRuns: string
  calls: Array<ReadonlyArray<string>>
  /** Lane gates started with `gh workflow run`; each run's one job concludes with `conclusion`, or fails when its commit holds every `seeded` branch. */
  dispatches: Array<{ id: number; workflow: string; branch: string; sha: string; createdAt: string }>
  /** Labels on a PR, by number. */
  labels: Map<number, ReadonlyArray<string>>
}
const remotes = new Map<string, Remote>()

const gh = (args: ReadonlyArray<string>, stdin?: string) =>
  Effect.promise(async () => {
    const repo = args[0] === "api" ? args[1]?.split("/").slice(1, 3).join("/") : args[args.indexOf("--repo") + 1]
    const remote = repo ? remotes.get(repo) : undefined
    if (!remote) return { exitCode: 1, stdout: "", stderr: "unknown repo" }
    remote.calls.push(args)
    const sha = async (branch: string) => (await Bun.$`git --git-dir ${remote.origin} rev-parse refs/heads/${branch}`.quiet().nothrow().text()).trim()
    const pull = args[0] === "api" ? args[1]?.match(/\/pulls\/(\d+)$/) : null
    if (pull) {
      const branch = remote.pulls.get(Number(pull[1])) ?? ""
      const labels = (remote.labels.get(Number(pull[1])) ?? []).map((name) => ({ name }))
      return { exitCode: 0, stdout: JSON.stringify({ head: { sha: await sha(branch), ref: branch }, labels }), stderr: "" }
    }
    if (args[0] === "api" && args[1]?.endsWith("/check-runs")) return { exitCode: 0, stdout: remote.baseRuns, stderr: "" }
    if (args[0] === "pr" && args[1] === "create") {
      const number = 100 + remote.pulls.size
      remote.pulls.set(number, args[args.indexOf("--head") + 1] ?? "")
      remote.bodies.set(number, stdin ?? "")
      return { exitCode: 0, stdout: `https://github.com/${repo}/pull/${number}\n`, stderr: "" }
    }
    if (args[0] === "pr" && args[1] === "view") {
      const headRefOid = await sha(remote.pulls.get(Number(args[2])) ?? "")
      const seededRed = remote.seeded.length > 0 && (await Promise.all(remote.seeded.map((branch) => contains(remote.origin, branch, headRefOid)))).every(Boolean)
      const cancelled = remote.cancelled.includes(remote.pulls.get(Number(args[2])) ?? "")
      const conclusion = seededRed ? "FAILURE" : cancelled ? "CANCELLED" : remote.conclusion
      const done = conclusion !== ""
      const rollup = [
        {
          name: remote.job,
          status: done ? "COMPLETED" : "IN_PROGRESS",
          conclusion: done ? conclusion : null,
          workflowName: "test",
          detailsUrl: `https://github.com/${repo}/actions/runs/1/job/${args[2]}`,
        },
      ]
      return { exitCode: 0, stdout: JSON.stringify({ headRefOid, statusCheckRollup: rollup }), stderr: "" }
    }
    if (args[0] === "workflow" && args[1] === "run") {
      const branch = args[args.indexOf("--ref") + 1] ?? ""
      remote.dispatches.push({ id: remote.dispatches.length + 1, workflow: args[2] ?? "", branch, sha: await sha(branch), createdAt: new Date().toISOString() })
      return { exitCode: 0, stdout: "", stderr: "" }
    }
    if (args[0] === "run" && args[1] === "list") {
      const runs = remote.dispatches
        .filter((run) => run.branch === args[args.indexOf("--branch") + 1])
        .map((run) => ({ databaseId: run.id, workflowName: run.workflow.replace(/\.yml$/, ""), headSha: run.sha, createdAt: run.createdAt }))
      return { exitCode: 0, stdout: JSON.stringify(runs), stderr: "" }
    }
    if (args[0] === "run" && args[1] === "view") {
      const run = remote.dispatches.find((item) => item.id === Number(args[2]))
      const seededRed = run !== undefined && remote.seeded.length > 0 && (await Promise.all(remote.seeded.map((branch) => contains(remote.origin, branch, run.sha)))).every(Boolean)
      const conclusion = seededRed ? "FAILURE" : remote.conclusion
      const done = conclusion !== ""
      const jobs = [
        {
          name: remote.job,
          status: done ? "completed" : "in_progress",
          conclusion: done ? conclusion.toLowerCase() : null,
          url: `https://github.com/${repo}/actions/runs/${args[2]}/job/1`,
        },
      ]
      return { exitCode: 0, stdout: JSON.stringify({ jobs }), stderr: "" }
    }
    if (args[0] === "pr" && args[1] === "edit") remote.bodies.set(Number(args[2]), stdin ?? "")
    if (args[0] === "api" && /\/actions\/jobs\/\d+\/logs$/.test(args[1] ?? "")) return { exitCode: 0, stdout: remote.log, stderr: "" }
    if (args[0] === "api") return { exitCode: 1, stdout: "", stderr: "not found" }
    return { exitCode: 0, stdout: "", stderr: "" }
  })

const GREEN_BASE = JSON.stringify([{ name: "test", status: "COMPLETED", conclusion: "SUCCESS" }])

// A unit job's log with one turbo package group: a bun test file that failed inside `@orchestra/ui:test`.
export const GROUPED = "##[group]@orchestra/ui:test\ntest\\a.test.ts:\r\n(fail) a > b [1.00ms]\r\n##[endgroup]\n"

const contains = async (origin: string, branch: string, sha: string) =>
  (await Bun.$`git --git-dir ${origin} merge-base --is-ancestor refs/heads/${branch} ${sha}`.quiet().nothrow()).exitCode === 0

// Stands in for Atlas's renderer: the bodies are the records themselves, so the test reads what the host filled in.
const RENDER: BoardRecord.Port = {
  pr: (record) => JSON.stringify(record),
  bundle: (record) => JSON.stringify(record),
  trailer: (trailer) => `WP: ${trailer.WP}\nAttempt: ${trailer.Attempt}`,
}

const build = (env?: NodeJS.ProcessEnv) =>
  testEffect(
    AppNodeBuilder.build(LayerNode.group([Board.node, Database.node, EventV2.node, Credential.node]), [
      [
        Board.node,
        makeGlobalNode({
          service: Board.Service,
          layer: Board.layerWith({ gh, record: RENDER, env }),
          deps: [Database.node, EventV2.node, Credential.node, AppProcess.node, Global.node],
        }),
      ],
    ]),
  )

export const it = build()

// A `bun` on PATH that answers turbo's dry run with whatever `affected.json` holds, so a test picks the affected set without a workspace.
// It writes the parents of the commit it ran on and that commit's files to `turbo-head.txt`, so a test sees which tree
// turbo read the workspace graph from.
const turbo = syncDir()
export const AFFECTED = path.join(turbo, "affected.json")
export const TURBO_HEAD = path.join(turbo, "turbo-head.txt")
export const itTurbo = build({ ...process.env, PATH: `${turbo}${path.delimiter}${process.env.PATH ?? ""}` })

function syncDir() {
  const dir = mkdtempSync(path.join(tmpdir(), "orchestra-board-turbo-"))
  writeFileSync(path.join(dir, "bun"), `#!/bin/sh\ngit rev-parse HEAD^1 HEAD^2 > "$(dirname "$0")/turbo-head.txt"\ngit ls-files >> "$(dirname "$0")/turbo-head.txt"\ncat "$(dirname "$0")/affected.json"\n`, { mode: 0o755 })
  return dir
}

// The queue with lanes: `affected` stands in for turbo, mapping every changed `packages/<name>/` path to `<name>`.
export const laneIt = testEffect(
  AppNodeBuilder.build(LayerNode.group([Board.node, Database.node, EventV2.node, Credential.node]), [
    [
      Board.node,
      makeGlobalNode({
        service: Board.Service,
        layer: Board.layerWith({
          gh,
          record: RENDER,
          affected: (directory, from, to) =>
            Effect.promise(async () =>
              [
                ...new Set(
                  (await Bun.$`git -C ${directory} diff --name-only ${from}...${to}`.quiet().text())
                    .split("\n")
                    .flatMap((file) => file.match(/^packages\/([^/]+)\//)?.slice(1) ?? []),
                ),
              ].toSorted(),
            ),
        }),
        deps: [Database.node, EventV2.node, Credential.node, AppProcess.node, Global.node],
      }),
    ],
  ]),
)

export const RECORD = { intent: "Say hello.", decisions: "None worth noting.", not_covered: "Nothing.", risk: { level: "low" as const } }


type Repo = { readonly root: string; readonly directory: string; readonly key: string; readonly remote: Remote }

// A repository on main with a contract that bundles two cards, pushed to a bare origin GitHub knows as acme/<key>.
// With `lanes`, base also carries a `turbo.json` (the workspace graph lanes need) and union-merged `.atlas` logs.
export function repository(key: string, size = 2, full?: object, scoped?: "script", lanes?: object) {
  return Effect.gen(function* () {
    const made = yield* Effect.promise(async () => {
      const root = await fs.realpath(await fs.mkdtemp(path.join(tmpdir(), `orchestra-board-queue-${key}-`)))
      const directory = path.join(root, "repo")
      const remote = path.join(root, "origin.git")
      // Forward slashes: on Windows `sh` reads backslashes in these paths as escapes.
      const script = path.join(root, "scoped.sh").replaceAll("\\", "/")
      await git(root, "init", "--bare", remote)
      await git(root, "-c", "init.defaultBranch=main", "init", directory)
      await fs.mkdir(path.join(directory, ".orchestra"))
      if (scoped) await fs.writeFile(script, `echo "$@" >> ${path.join(root, "runs.log").replaceAll("\\", "/")}\n[ -f fail.txt ] && [ ! -f fix.txt ] && exit 1\n[ -f x.txt ] && [ -f y.txt ] && exit 1\n[ -f packages/a/x.txt ] && [ -f packages/b/y.txt ] && exit 1\nexit 0\n`)
      await fs.writeFile(
        path.join(directory, ".orchestra", "ci.json"),
        JSON.stringify({ bundle: { size, waitMinutes: 600 }, merge: "merge", full, scoped: scoped ? { tests: `sh ${script} {package} {files}` } : undefined, lanes }),
      )
      if (lanes) await fs.writeFile(path.join(directory, "turbo.json"), "{}\n")
      if (lanes) await fs.writeFile(path.join(directory, ".gitattributes"), ".atlas/**/*.jsonl merge=union\n")
      await commit(directory, "base")
      await git(directory, "remote", "add", "origin", pathToFileURL(remote).href)
      await git(directory, "push", "--quiet", "origin", "main")
      return { root, directory, key, remote: { origin: remote, pulls: new Map<number, string>(), bodies: new Map<number, string>(), conclusion: "", seeded: [] as ReadonlyArray<string>, cancelled: [] as ReadonlyArray<string>, job: "unit (linux)", log: "", baseRuns: GREEN_BASE, calls: [] as Remote["calls"], dispatches: [] as Remote["dispatches"], labels: new Map<number, ReadonlyArray<string>>() } }
    })
    remotes.set(`acme/${key}`, made.remote)
    const database = yield* Database.Service
    yield* database.db
      .insert(ProjectTable)
      .values({ id: ProjectSchema.ID.make(`prj_board_queue_${key}`), worktree: AbsolutePath.make(made.directory), sandboxes: [] })
      .run()
      .pipe(Effect.orDie)
    const board = yield* Board.Service
    yield* board.project({ key, name: key, repo: made.directory, github_repo: `acme/${key}`, reason: "Start." })
    return made
  })
}

// A Review card whose branch adds `file` and is open as PR `number`.
export function card(repo: Repo, key: string, number: number, file: string, record: PrRecord = RECORD) {
  return Effect.gen(function* () {
    const branch = `card-${number}`
    yield* Effect.promise(async () => {
      const worktree = path.join(repo.root, branch)
      await git(repo.directory, "worktree", "add", "-b", branch, worktree)
      await fs.mkdir(path.dirname(path.join(worktree, file)), { recursive: true })
      await fs.writeFile(path.join(worktree, file), `${file}\n`)
      await commit(worktree, branch)
      await git(worktree, "push", "--quiet", "origin", branch)
    })
    repo.remote.pulls.set(number, branch)
    const board = yield* Board.Service
    const created = yield* board.issue({ project: key, title: branch, branch, pr: number, record, reason: "Plan." })
    if (!created.issue) return yield* Effect.die("The card was not created.")
    const database = yield* Database.Service
    yield* database.db.update(BoardIssueTable).set({ stage: "review" }).where(eq(BoardIssueTable.id, created.issue.id)).run().pipe(Effect.orDie)
  })
}

export function origin(repo: Repo, branch: string) {
  return Effect.promise(async () =>
    (await Bun.$`git --git-dir ${repo.remote.origin} rev-parse --verify --quiet refs/heads/${branch}`.quiet().nothrow().text()).trim(),
  )
}

export function stage(repo: Repo, number: number) {
  return row(repo, number).pipe(Effect.map((found) => found.issue.stage))
}

export function bundleStatuses(repo: Repo) {
  return Effect.gen(function* () {
    const database = yield* Database.Service
    const found = yield* database.db
      .select({ status: BoardBundleTable.status })
      .from(BoardBundleTable)
      .innerJoin(BoardProjectTable, eq(BoardProjectTable.id, BoardBundleTable.project_id))
      .where(eq(BoardProjectTable.key, repo.key))
      .orderBy(asc(BoardBundleTable.n))
      .all()
      .pipe(Effect.orDie)
    return found.map((item) => item.status)
  })
}

export function ejections(repo: Repo, number: number) {
  return Effect.gen(function* () {
    const found = yield* row(repo, number)
    const database = yield* Database.Service
    const activity = yield* database.db
      .select({ reason: BoardActivityTable.reason })
      .from(BoardActivityTable)
      .where(and(eq(BoardActivityTable.issue_id, found.issue.id), eq(BoardActivityTable.action, "bundle.dissolve")))
      .all()
      .pipe(Effect.orDie)
    return activity.map((item) => item.reason)
  })
}

export function notes(repo: Repo, number: number) {
  return Effect.gen(function* () {
    const found = yield* row(repo, number)
    const database = yield* Database.Service
    const rows = yield* database.db
      .select({ body: BoardNoteTable.body })
      .from(BoardNoteTable)
      .where(eq(BoardNoteTable.issue_id, found.issue.id))
      .all()
      .pipe(Effect.orDie)
    return rows.map((item) => item.body)
  })
}

export function queued(repo: Repo, number: number) {
  return row(repo, number).pipe(Effect.map((found) => found.queue))
}

export function row(repo: Repo, number: number) {
  return Effect.gen(function* () {
    const database = yield* Database.Service
    const found = yield* database.db
      .select({ issue: BoardIssueTable, queue: BoardQueueTable })
      .from(BoardIssueTable)
      .innerJoin(BoardProjectTable, eq(BoardProjectTable.id, BoardIssueTable.project_id))
      .leftJoin(BoardQueueTable, eq(BoardQueueTable.issue_id, BoardIssueTable.id))
      .where(and(eq(BoardProjectTable.key, repo.key), eq(BoardIssueTable.number, number)))
      .get()
      .pipe(Effect.orDie)
    if (!found) return yield* Effect.die(`${repo.key}-${number} is not on the board.`)
    return found
  })
}

// A scoped pass on the card's head tree, which `queue` requires when the contract has `scoped.tests`.
export function passed(repo: Repo, number: number) {
  return Effect.gen(function* () {
    const tree = yield* Effect.promise(async () => (await Bun.$`git -C ${repo.directory} rev-parse card-${number}^{tree}`.quiet().text()).trim())
    const found = yield* row(repo, number)
    const database = yield* Database.Service
    yield* database.db
      .insert(BoardCheckTable)
      .values({
        id: CheckID.create(),
        issue_id: found.issue.id,
        attempt: 1,
        kind: "scoped",
        command: "bun test a",
        tree_sha: tree,
        outcome: "pass",
        failing: [],
        started_at: 0,
        ended_at: 120_000,
      })
      .run()
      .pipe(Effect.orDie)
  })
}

// The lines the scoped stand-in logged: one per run, with its package and files.
export function runs(repo: Repo) {
  return Effect.promise(async () =>
    (await fs.readFile(path.join(repo.root, "runs.log"), "utf8").catch(() => "")).split("\n").filter(Boolean),
  )
}

export async function commit(directory: string, message: string) {
  await git(directory, "add", ".")
  await git(directory, "-c", "user.email=test@example.com", "-c", "user.name=Test", "commit", "--quiet", "-m", message)
}
