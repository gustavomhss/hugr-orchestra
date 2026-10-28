import { describe, expect } from "bun:test"
import fs from "fs/promises"
import { tmpdir } from "os"
import path from "path"
import { pathToFileURL } from "url"
import { and, asc, eq } from "drizzle-orm"
import { Effect, Exit } from "effect"
import { Board } from "@orchestra/core/board/board"
import type { BoardRecord } from "@orchestra/core/board/record"
import {
  BoardActivityTable,
  BoardBundleTable,
  BoardCheckTable,
  BoardIssueTable,
  BoardProjectTable,
  BoardQueueTable,
} from "@orchestra/core/board/sql"
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
import { git } from "./fixture/git"
import { testEffect } from "./lib/effect"

// GitHub is a fake keyed by repo name that reads PR heads from each test's bare origin; git itself is real.
// `seeded` branches make a PR's full gate fail when every one of them is in its head; `baseRuns` is the base commit's check-runs.
type Remote = {
  origin: string
  pulls: Map<number, string>
  bodies: Map<number, string>
  conclusion: string
  seeded: ReadonlyArray<string>
  baseRuns: string
  calls: Array<ReadonlyArray<string>>
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
      return { exitCode: 0, stdout: JSON.stringify({ head: { sha: await sha(branch), ref: branch } }), stderr: "" }
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
      const conclusion = seededRed ? "FAILURE" : remote.conclusion
      const done = conclusion !== ""
      const rollup = [{ name: "test", status: done ? "COMPLETED" : "IN_PROGRESS", conclusion: done ? conclusion : null }]
      return { exitCode: 0, stdout: JSON.stringify({ headRefOid, statusCheckRollup: rollup }), stderr: "" }
    }
    if (args[0] === "pr" && args[1] === "edit") remote.bodies.set(Number(args[2]), stdin ?? "")
    if (args[0] === "api") return { exitCode: 1, stdout: "", stderr: "not found" }
    return { exitCode: 0, stdout: "", stderr: "" }
  })

const GREEN_BASE = JSON.stringify([{ name: "test", status: "COMPLETED", conclusion: "SUCCESS" }])

const contains = async (origin: string, branch: string, sha: string) =>
  (await Bun.$`git --git-dir ${origin} merge-base --is-ancestor refs/heads/${branch} ${sha}`.quiet().nothrow()).exitCode === 0

// Stands in for Atlas's renderer: the bodies are the records themselves, so the test reads what the host filled in.
const RENDER: BoardRecord.Port = {
  pr: (record) => JSON.stringify(record),
  bundle: (record) => JSON.stringify(record),
  trailer: (trailer) => `WP: ${trailer.WP}\nAttempt: ${trailer.Attempt}`,
}

const it = testEffect(
  AppNodeBuilder.build(LayerNode.group([Board.node, Database.node, EventV2.node, Credential.node]), [
    [
      Board.node,
      makeGlobalNode({
        service: Board.Service,
        layer: Board.layerWith({ gh, record: RENDER }),
        deps: [Database.node, EventV2.node, Credential.node, AppProcess.node, Global.node],
      }),
    ],
  ]),
)

const RECORD = { intent: "Say hello.", decisions: "None worth noting.", not_covered: "Nothing.", risk: { level: "low" as const } }

describe("BoardQueue", () => {
  it.live("three verified cards bundle together, run the full gate once and ship when it is green", () =>
    Effect.gen(function* () {
      const board = yield* Board.Service
      const repo = yield* repository("QOK", 3)
      yield* card(repo, "QOK", 1, "a.txt")
      yield* card(repo, "QOK", 2, "b.txt")
      yield* card(repo, "QOK", 3, "c.txt")
      const one = yield* row(repo, 1)
      const database = yield* Database.Service
      yield* database.db
        .insert(BoardCheckTable)
        .values({
          id: CheckID.create(),
          issue_id: one.issue.id,
          attempt: 1,
          kind: "scoped",
          command: "bun test a",
          tree_sha: "0".repeat(40),
          outcome: "pass",
          failing: [],
          started_at: 0,
          ended_at: 120_000,
        })
        .run()
        .pipe(Effect.orDie)

      expect(yield* board.queue({ project: "QOK", number: 1, reason: "Verified." })).toMatchObject({ head: expect.any(String) })
      yield* board.queueTick()
      yield* board.queue({ project: "QOK", number: 2, reason: "Verified." })
      yield* board.queueTick()
      expect(repo.remote.pulls.size).toBe(3)
      expect(yield* stage(repo, 1)).toBe("queue")

      yield* board.queue({ project: "QOK", number: 3, reason: "Verified." })
      yield* board.queueTick()
      expect(repo.remote.pulls.get(103)).toBe("bundle-QOK-1")
      expect(repo.remote.pulls.size).toBe(4)
      const opened: BoardRecord.BundleRecord = JSON.parse(repo.remote.bodies.get(103) ?? "")
      expect(opened.members.map((member) => member.record.lineage.card)).toEqual(["QOK-1", "QOK-2", "QOK-3"])
      const bundle = yield* origin(repo, "bundle-QOK-1")

      // Pending checks leave the bundle open.
      yield* board.queueTick()
      expect(yield* stage(repo, 2)).toBe("queue")

      repo.remote.conclusion = "SUCCESS"
      yield* board.queueTick()
      expect([yield* stage(repo, 1), yield* stage(repo, 2), yield* stage(repo, 3)]).toEqual(["shipped", "shipped", "shipped"])
      expect(yield* origin(repo, "main")).toBe(bundle)
      expect(yield* origin(repo, "bundle-QOK-1")).toBe("")
      expect(yield* queued(repo, 1)).toBeNull()
      const shipped: BoardRecord.PrRecord = JSON.parse(repo.remote.bodies.get(1) ?? "")
      expect(shipped).toMatchObject({
        intent: "Say hello.",
        facts: { files: 1, added: 1, removed: 0 },
        evidence: { checks: [{ name: "scoped bun test a", state: "pass" }] },
        cost: { ciRuns: 1, ciMinutes: 2 },
        integration: { state: "merged", bundle: "QOK-B1" },
      })
      expect(yield* Effect.promise(() => Bun.$`git --git-dir ${repo.remote.origin} log --format=%B main`.quiet().text())).toContain(
        "WP: QOK-1\nAttempt: a0",
      )
    }),
  )

  it.live("a card whose PR moves after assembly leaves the bundle and the queue", () =>
    Effect.gen(function* () {
      const board = yield* Board.Service
      const repo = yield* repository("QMV")
      yield* card(repo, "QMV", 1, "a.txt")
      yield* card(repo, "QMV", 2, "b.txt")
      yield* board.queue({ project: "QMV", number: 1, reason: "Verified." })
      yield* board.queue({ project: "QMV", number: 2, reason: "Verified." })
      yield* board.queueTick()
      expect(repo.remote.pulls.get(102)).toBe("bundle-QMV-1")

      yield* Effect.promise(async () => {
        const worktree = path.join(repo.root, "card-1")
        await fs.writeFile(path.join(worktree, "a.txt"), "changed\n")
        await commit(worktree, "late")
        await git(worktree, "push", "--quiet", "origin", "card-1")
      })
      repo.remote.conclusion = "SUCCESS"
      yield* board.queueTick()
      expect([yield* stage(repo, 1), yield* stage(repo, 2)]).toEqual(["review", "queue"])
      expect(repo.remote.calls.some((args) => args[0] === "pr" && args[1] === "close" && args[2] === "102")).toBe(true)
    }),
  )

  it.live("a red bundle is halved until the one card that fails alone goes back to Review", () =>
    Effect.gen(function* () {
      const board = yield* Board.Service
      const repo = yield* repository("QRD", 3)
      yield* card(repo, "QRD", 1, "a.txt")
      yield* card(repo, "QRD", 2, "b.txt")
      yield* card(repo, "QRD", 3, "c.txt")
      yield* Effect.forEach([1, 2, 3], (number) => board.queue({ project: "QRD", number, flush: true, reason: "Verified." }), { discard: true })
      repo.remote.conclusion = "SUCCESS"
      repo.remote.seeded = ["card-3"]

      yield* Effect.forEach(Array.from({ length: 12 }), () => board.queueTick(), { discard: true })
      expect([yield* stage(repo, 1), yield* stage(repo, 2), yield* stage(repo, 3)]).toEqual(["shipped", "shipped", "review"])
      expect(yield* queued(repo, 3)).toBeNull()
      expect(yield* bundleStatuses(repo)).toEqual(["red", "merged", "red", "merged", "red"])
      expect(yield* ejections(repo, 3)).toEqual(["red alone on the full gate"])
    }),
  )

  it.live("a bundle that is red on its base waits for the base instead of blaming its cards", () =>
    Effect.gen(function* () {
      const board = yield* Board.Service
      const repo = yield* repository("QBR")
      yield* card(repo, "QBR", 1, "a.txt")
      yield* card(repo, "QBR", 2, "b.txt")
      yield* board.queue({ project: "QBR", number: 1, reason: "Verified." })
      yield* board.queue({ project: "QBR", number: 2, reason: "Verified." })
      yield* board.queueTick()
      expect(repo.remote.pulls.get(102)).toBe("bundle-QBR-1")

      repo.remote.conclusion = "FAILURE"
      repo.remote.baseRuns = JSON.stringify([{ name: "test", status: "COMPLETED", conclusion: "FAILURE" }])
      yield* board.queueTick()
      expect([yield* stage(repo, 1), yield* stage(repo, 2)]).toEqual(["queue", "queue"])
      expect(yield* bundleStatuses(repo)).toEqual(["base-red"])

      yield* board.queueTick()
      expect(repo.remote.pulls.size).toBe(3)
      expect(yield* bundleStatuses(repo)).toEqual(["base-red"])
    }),
  )

  it.live("a red bundle on a base with no checks probes base, and a red probe ejects no member", () =>
    Effect.gen(function* () {
      const board = yield* Board.Service
      const repo = yield* repository("QBU")
      yield* card(repo, "QBU", 1, "a.txt")
      yield* card(repo, "QBU", 2, "b.txt")
      yield* board.queue({ project: "QBU", number: 1, reason: "Verified." })
      yield* board.queue({ project: "QBU", number: 2, reason: "Verified." })
      repo.remote.conclusion = "SUCCESS"
      repo.remote.seeded = ["main"]
      repo.remote.baseRuns = "[]"

      yield* Effect.forEach(Array.from({ length: 4 }), () => board.queueTick(), { discard: true })
      expect([yield* stage(repo, 1), yield* stage(repo, 2)]).toEqual(["queue", "queue"])
      expect(yield* bundleStatuses(repo)).toEqual(["probing", "base-red"])
      expect(yield* ejections(repo, 1)).toEqual([])
      expect(yield* ejections(repo, 2)).toEqual([])
    }),
  )

  it.live("a probe that finds base green lets the queue halve the red bundle", () =>
    Effect.gen(function* () {
      const board = yield* Board.Service
      const repo = yield* repository("QBG")
      yield* card(repo, "QBG", 1, "a.txt")
      yield* card(repo, "QBG", 2, "b.txt")
      yield* board.queue({ project: "QBG", number: 1, reason: "Verified." })
      yield* board.queue({ project: "QBG", number: 2, reason: "Verified." })
      repo.remote.conclusion = "SUCCESS"
      repo.remote.seeded = ["card-2"]
      repo.remote.baseRuns = "[]"

      yield* Effect.forEach(Array.from({ length: 12 }), () => board.queueTick(), { discard: true })
      expect([yield* stage(repo, 1), yield* stage(repo, 2)]).toEqual(["shipped", "review"])
      expect(yield* bundleStatuses(repo)).toEqual(["probing", "probe-green", "merged", "probing", "probe-green", "red"])
      expect(yield* ejections(repo, 2)).toEqual(["red alone on the full gate"])
    }),
  )

  it.live("a card that passes alone is shipped and the card that fails beside it is ejected", () =>
    Effect.gen(function* () {
      const board = yield* Board.Service
      const repo = yield* repository("QIX")
      yield* card(repo, "QIX", 1, "a.txt")
      yield* card(repo, "QIX", 2, "b.txt")
      yield* board.queue({ project: "QIX", number: 1, reason: "Verified." })
      yield* board.queue({ project: "QIX", number: 2, reason: "Verified." })
      repo.remote.conclusion = "SUCCESS"
      repo.remote.seeded = ["card-1", "card-2"]

      yield* Effect.forEach(Array.from({ length: 8 }), () => board.queueTick(), { discard: true })
      expect([yield* stage(repo, 1), yield* stage(repo, 2)]).toEqual(["shipped", "review"])
      expect(yield* bundleStatuses(repo)).toEqual(["red", "merged", "red"])
      expect(yield* ejections(repo, 2)).toEqual(["red alone on the full gate"])
    }),
  )

  it.live("only a card with a full record queues, and only the host moves cards into or out of Queue", () =>
    Effect.gen(function* () {
      const board = yield* Board.Service
      const repo = yield* repository("QRF")
      yield* card(repo, "QRF", 1, "a.txt", {})

      const incomplete = yield* board.queue({ project: "QRF", number: 1, reason: "Verified." }).pipe(Effect.exit)
      expect(Exit.isFailure(incomplete)).toBe(true)
      expect(JSON.stringify(incomplete)).toContain("Intent, Decisions, Not covered, Risk level")
      const moved = yield* board.move({ project: "QRF", number: 1, stage: "queue", reason: "Skip." }).pipe(Effect.exit)
      expect(JSON.stringify(moved)).toContain("Only the host moves a card into Queue")

      yield* board.issue({ project: "QRF", number: 1, record: RECORD, reason: "Record." })
      yield* board.queue({ project: "QRF", number: 1, reason: "Verified." })
      const out = yield* board.move({ project: "QRF", number: 1, stage: "review", reason: "Back." }).pipe(Effect.exit)
      expect(JSON.stringify(out)).toContain("board_dequeue")

      expect(yield* board.dequeue({ project: "QRF", number: 1, reason: "Not yet." })).toEqual({ dissolved: null })
      expect(yield* stage(repo, 1)).toBe("review")
    }),
  )
})

type Repo = { readonly root: string; readonly directory: string; readonly key: string; readonly remote: Remote }

// A repository on main with a contract that bundles two cards, pushed to a bare origin GitHub knows as acme/<key>.
function repository(key: string, size = 2) {
  return Effect.gen(function* () {
    const made = yield* Effect.promise(async () => {
      const root = await fs.realpath(await fs.mkdtemp(path.join(tmpdir(), `orchestra-board-queue-${key}-`)))
      const directory = path.join(root, "repo")
      const remote = path.join(root, "origin.git")
      await git(root, "init", "--bare", remote)
      await git(root, "-c", "init.defaultBranch=main", "init", directory)
      await fs.mkdir(path.join(directory, ".orchestra"))
      await fs.writeFile(path.join(directory, ".orchestra", "ci.json"), JSON.stringify({ bundle: { size, waitMinutes: 600 }, merge: "merge" }))
      await commit(directory, "base")
      await git(directory, "remote", "add", "origin", pathToFileURL(remote).href)
      await git(directory, "push", "--quiet", "origin", "main")
      return { root, directory, key, remote: { origin: remote, pulls: new Map<number, string>(), bodies: new Map<number, string>(), conclusion: "", seeded: [] as ReadonlyArray<string>, baseRuns: GREEN_BASE, calls: [] } }
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
function card(repo: Repo, key: string, number: number, file: string, record: PrRecord = RECORD) {
  return Effect.gen(function* () {
    const branch = `card-${number}`
    yield* Effect.promise(async () => {
      const worktree = path.join(repo.root, branch)
      await git(repo.directory, "worktree", "add", "-b", branch, worktree)
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

function origin(repo: Repo, branch: string) {
  return Effect.promise(async () =>
    (await Bun.$`git --git-dir ${repo.remote.origin} rev-parse --verify --quiet refs/heads/${branch}`.quiet().nothrow().text()).trim(),
  )
}

function stage(repo: Repo, number: number) {
  return row(repo, number).pipe(Effect.map((found) => found.issue.stage))
}

function bundleStatuses(repo: Repo) {
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

function ejections(repo: Repo, number: number) {
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

function queued(repo: Repo, number: number) {
  return row(repo, number).pipe(Effect.map((found) => found.queue))
}

function row(repo: Repo, number: number) {
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

async function commit(directory: string, message: string) {
  await git(directory, "add", ".")
  await git(directory, "-c", "user.email=test@example.com", "-c", "user.name=Test", "commit", "--quiet", "-m", message)
}
