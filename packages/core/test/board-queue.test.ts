import { describe, expect, test } from "bun:test"
import fs from "fs/promises"
import { tmpdir } from "os"
import path from "path"
import { pathToFileURL } from "url"
import { and, asc, desc, eq } from "drizzle-orm"
import { Effect, Exit } from "effect"
import { Board } from "@orchestra/core/board/board"
import { BoardQueue } from "@orchestra/core/board/queue"
import type { BoardRecord } from "@orchestra/core/board/record"
import {
  BoardActivityTable,
  BoardAttemptTable,
  BoardBundleTable,
  BoardCheckTable,
  BoardFlakeTable,
  BoardIssueTable,
  BoardNoteTable,
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
  /** Branches whose full gate comes back CANCELLED (infrastructure, not code). */
  cancelled: ReadonlyArray<string>
  /** The name of the one gating job, and the log it returns when it fails. */
  job: string
  log: string
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
    if (args[0] === "pr" && args[1] === "edit") remote.bodies.set(Number(args[2]), stdin ?? "")
    if (args[0] === "api" && /\/actions\/jobs\/\d+\/logs$/.test(args[1] ?? "")) return { exitCode: 0, stdout: remote.log, stderr: "" }
    if (args[0] === "api") return { exitCode: 1, stdout: "", stderr: "not found" }
    return { exitCode: 0, stdout: "", stderr: "" }
  })

const GREEN_BASE = JSON.stringify([{ name: "test", status: "COMPLETED", conclusion: "SUCCESS" }])

// A unit job's log with one turbo package group: a bun test file that failed inside `@orchestra/ui:test`.
const GROUPED = "##[group]@orchestra/ui:test\ntest\\a.test.ts:\r\n(fail) a > b [1.00ms]\r\n##[endgroup]\n"

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
      const ledger = (yield* board.snapshot("QOK")).ledger
      expect(typeof ledger?.queueWait).toBe("number")
      expect(ledger?.queueWait).toBeGreaterThanOrEqual(0)
      expect(typeof ledger?.leadTime).toBe("number")
      expect(ledger?.leadTime).toBeGreaterThanOrEqual(0)
      // The seed has no attempt rows: no settled attempt means no red rate, and no attempts means no rework.
      expect(ledger?.redRate).toBeNull()
      expect(ledger?.reworkRate).toBeNull()
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
      const database = yield* Database.Service
      yield* database.db
        .insert(BoardAttemptTable)
        .values({ issue_id: (yield* row(repo, 3)).issue.id, n: 1, write_paths: [] })
        .run()
        .pipe(Effect.orDie)
      yield* Effect.forEach([1, 2, 3], (number) => board.queue({ project: "QRD", number, flush: true, reason: "Verified." }), { discard: true })
      repo.remote.conclusion = "SUCCESS"
      repo.remote.seeded = ["card-3"]

      yield* Effect.forEach(Array.from({ length: 12 }), () => board.queueTick(), { discard: true })
      expect([yield* stage(repo, 1), yield* stage(repo, 2), yield* stage(repo, 3)]).toEqual(["shipped", "shipped", "review"])
      expect(yield* queued(repo, 3)).toBeNull()
      expect(yield* bundleStatuses(repo)).toEqual(["red", "merged", "red", "merged", "red"])
      expect(yield* ejections(repo, 3)).toEqual(["red alone on the full gate"])
      const ejecting = yield* database.db
        .select({ n: BoardBundleTable.n })
        .from(BoardBundleTable)
        .innerJoin(BoardProjectTable, eq(BoardProjectTable.id, BoardBundleTable.project_id))
        .where(eq(BoardProjectTable.key, "QRD"))
        .orderBy(desc(BoardBundleTable.n))
        .get()
        .pipe(Effect.orDie)
      const attempts = yield* database.db
        .select({ n: BoardAttemptTable.n, outcome: BoardAttemptTable.outcome, cause: BoardAttemptTable.cause })
        .from(BoardAttemptTable)
        .where(eq(BoardAttemptTable.issue_id, (yield* row(repo, 3)).issue.id))
        .orderBy(asc(BoardAttemptTable.n))
        .all()
        .pipe(Effect.orDie)
      expect(attempts.map((item) => [item.n, item.outcome])).toEqual([
        [1, "ejected"],
        [2, null],
      ])
      expect(attempts[1]?.cause).toBe(`ejected:QRD-B${ejecting?.n}`)
    }),
  )

  it.live("a red bundle names its failing files in the card's notes", () =>
    Effect.gen(function* () {
      const board = yield* Board.Service
      const repo = yield* repository("QFF", 1)
      yield* card(repo, "QFF", 1, "a.txt")
      yield* board.queue({ project: "QFF", number: 1, reason: "Verified." })
      repo.remote.conclusion = "SUCCESS"
      repo.remote.seeded = ["card-1"]
      repo.remote.log = "2026-10-28T12:00:00.0000000Z test/a.test.ts:\n2026-10-28T12:00:00.0000000Z (fail) a > b [1.00ms]\n2026-10-28T12:00:00.0000000Z src/b.ts(3,5): error TS2322: x\n"

      yield* Effect.forEach(Array.from({ length: 12 }), () => board.queueTick(), { discard: true })
      expect(yield* stage(repo, 1)).toBe("review")
      expect((yield* notes(repo, 1)).some((body) => body.includes("Failing: test/a.test.ts, src/b.ts."))).toBe(true)
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

  it.live("a host that pushed base and died before writing the rows merges once on restart", () =>
    Effect.gen(function* () {
      const board = yield* Board.Service
      const repo = yield* repository("QCR", 2)
      yield* card(repo, "QCR", 1, "a.txt")
      yield* card(repo, "QCR", 2, "b.txt")
      yield* board.queue({ project: "QCR", number: 1, reason: "Verified." })
      yield* board.queue({ project: "QCR", number: 2, reason: "Verified." })
      yield* board.queueTick()
      expect(repo.remote.pulls.get(102)).toBe("bundle-QCR-1")
      yield* board.queueTick()
      repo.remote.conclusion = "SUCCESS"

      const database = yield* Database.Service
      const open = yield* database.db
        .select({ head: BoardBundleTable.head_sha })
        .from(BoardBundleTable)
        .innerJoin(BoardProjectTable, eq(BoardProjectTable.id, BoardBundleTable.project_id))
        .where(and(eq(BoardProjectTable.key, "QCR"), eq(BoardBundleTable.status, "open")))
        .get()
        .pipe(Effect.orDie)
      if (!open) return yield* Effect.die("The bundle is not open.")
      yield* Effect.promise(() => git(repo.directory, "push", "--quiet", "origin", `${open.head}:refs/heads/main`))

      yield* board.queueTick()
      expect([yield* stage(repo, 1), yield* stage(repo, 2)]).toEqual(["shipped", "shipped"])
      expect(yield* bundleStatuses(repo)).toEqual(["merged"])
      expect(yield* origin(repo, "main")).toBe(open.head)
    }),
  )

  it.live("an infrastructure red reruns the bundle once and ships it when the rerun is green", () =>
    Effect.gen(function* () {
      const board = yield* Board.Service
      const repo = yield* repository("QIF")
      yield* card(repo, "QIF", 1, "a.txt")
      yield* card(repo, "QIF", 2, "b.txt")
      yield* board.queue({ project: "QIF", number: 1, reason: "Verified." })
      yield* board.queue({ project: "QIF", number: 2, reason: "Verified." })
      repo.remote.conclusion = "SUCCESS"
      repo.remote.cancelled = ["bundle-QIF-1"]

      yield* Effect.forEach(Array.from({ length: 8 }), () => board.queueTick(), { discard: true })
      expect([yield* stage(repo, 1), yield* stage(repo, 2)]).toEqual(["shipped", "shipped"])
      expect(yield* bundleStatuses(repo)).toEqual(["infra", "merged"])
    }),
  )

  it.live("a failed test job with no failing file and no control line is infrastructure through its workflow name", () =>
    Effect.gen(function* () {
      const board = yield* Board.Service
      const repo = yield* repository("QOM", 2, { checks: ["test"], control: { line: "omni positive control:", jobs: ["unit ("] } })
      yield* card(repo, "QOM", 1, "a.txt")
      yield* card(repo, "QOM", 2, "b.txt")
      yield* board.queue({ project: "QOM", number: 1, reason: "Verified." })
      yield* board.queue({ project: "QOM", number: 2, reason: "Verified." })
      repo.remote.conclusion = "FAILURE"
      repo.remote.log = "setup failed\n"

      yield* Effect.forEach(Array.from({ length: 8 }), () => board.queueTick(), { discard: true })
      expect((yield* bundleStatuses(repo))[0]).toBe("infra")
    }),
  )

  it.live("a failed test job that ran its tests is code, not infrastructure", () =>
    Effect.gen(function* () {
      const board = yield* Board.Service
      const repo = yield* repository("QOC", 2, { checks: ["test"], control: { line: "omni positive control:", jobs: ["unit ("] } })
      yield* card(repo, "QOC", 1, "a.txt")
      yield* card(repo, "QOC", 2, "b.txt")
      yield* board.queue({ project: "QOC", number: 1, reason: "Verified." })
      yield* board.queue({ project: "QOC", number: 2, reason: "Verified." })
      repo.remote.conclusion = "FAILURE"
      repo.remote.log = "test/a.test.ts:\n(fail) a > b\nomni positive control: pass (x)\n"

      yield* Effect.forEach(Array.from({ length: 8 }), () => board.queueTick(), { discard: true })
      expect((yield* bundleStatuses(repo))[0]).toBe("red")
    }),
  )

  it.live("a failed job the control line does not cover is code, with its vitest files in F", () =>
    Effect.gen(function* () {
      const board = yield* Board.Service
      const repo = yield* repository("QAT", 2, { checks: ["test"], control: { line: "omni positive control:", jobs: ["unit ("] } })
      yield* card(repo, "QAT", 1, "a.txt")
      yield* card(repo, "QAT", 2, "b.txt")
      yield* board.queue({ project: "QAT", number: 1, reason: "Verified." })
      yield* board.queue({ project: "QAT", number: 2, reason: "Verified." })
      repo.remote.conclusion = "FAILURE"
      repo.remote.job = "atlas"
      // A real atlas job's failing line: vitest, colored, and no omni control line anywhere in the log.
      repo.remote.log =
        "2026-10-28T22:36:49.2677971Z \x1b[31m\x1b[1m\x1b[7m FAIL \x1b[27m\x1b[22m\x1b[39m\x1b[33m|e2e-blackbox|\x1b[39m  packages/e2e-blackbox/test/s34-mine-history-frontier.blackbox.test.ts\x1b[2m > \x1b[22m#243 mines the frontier\n"

      yield* Effect.forEach(Array.from({ length: 8 }), () => board.queueTick(), { discard: true })
      expect((yield* bundleStatuses(repo))[0]).toBe("red")
      expect((yield* notes(repo, 1)).some((body) => body.includes("Failing: packages/e2e-blackbox/test/s34-mine-history-frontier.blackbox.test.ts."))).toBe(true)
    }),
  )

  it.live("a scoped rerun that fails on the head and passes on base ejects the card without probing base", () =>
    Effect.gen(function* () {
      const board = yield* Board.Service
      const repo = yield* repository("QSC", 1, undefined, "script")
      yield* card(repo, "QSC", 1, "fail.txt")
      yield* passed(repo, 1)
      yield* board.queue({ project: "QSC", number: 1, reason: "Verified." })
      repo.remote.conclusion = "SUCCESS"
      repo.remote.seeded = ["card-1"]
      repo.remote.log = GROUPED

      yield* Effect.forEach(Array.from({ length: 12 }), () => board.queueTick(), { discard: true })
      expect(yield* stage(repo, 1)).toBe("review")
      expect(yield* runs(repo)).toEqual(["@orchestra/ui test/a.test.ts", "@orchestra/ui test/a.test.ts"])
      expect(repo.remote.pulls.size).toBe(2)
    }),
  )

  it.live("a scoped rerun that fails twice on base blames base, not the card", () =>
    Effect.gen(function* () {
      const board = yield* Board.Service
      const repo = yield* repository("QSB", 1, undefined, "script")
      yield* Effect.promise(async () => {
        await fs.writeFile(path.join(repo.directory, "fail.txt"), "x\n")
        await commit(repo.directory, "break")
        await git(repo.directory, "push", "--quiet", "origin", "main")
      })
      yield* card(repo, "QSB", 1, "a.txt")
      yield* passed(repo, 1)
      yield* board.queue({ project: "QSB", number: 1, reason: "Verified." })
      repo.remote.conclusion = "SUCCESS"
      repo.remote.seeded = ["card-1"]
      repo.remote.log = GROUPED

      yield* Effect.forEach(Array.from({ length: 12 }), () => board.queueTick(), { discard: true })
      expect((yield* bundleStatuses(repo))[0]).toBe("base-red")
      expect(yield* stage(repo, 1)).toBe("queue")
      expect(yield* runs(repo)).toHaveLength(3)
    }),
  )

  it.live("a red whose tests pass three scoped reruns of the head is flaky, kept open and recorded", () =>
    Effect.gen(function* () {
      const board = yield* Board.Service
      const repo = yield* repository("QSF", 1, undefined, "script")
      yield* card(repo, "QSF", 1, "a.txt")
      yield* passed(repo, 1)
      yield* board.queue({ project: "QSF", number: 1, reason: "Verified." })
      repo.remote.conclusion = "SUCCESS"
      repo.remote.seeded = ["card-1"]
      repo.remote.log = GROUPED

      yield* Effect.forEach(Array.from({ length: 12 }), () => board.queueTick(), { discard: true })
      yield* Effect.forEach(Array.from({ length: 2 }), () => board.queueTick(), { discard: true })
      expect(yield* bundleStatuses(repo)).toEqual(["flaky"])
      expect(yield* stage(repo, 1)).toBe("queue")
      expect(yield* runs(repo)).toHaveLength(4)
      expect(repo.remote.calls.some((args) => args[0] === "pr" && args[1] === "close")).toBe(false)
      const database = yield* Database.Service
      const flakes = yield* database.db
        .select({ test: BoardFlakeTable.test, count: BoardFlakeTable.count })
        .from(BoardFlakeTable)
        .all()
        .pipe(Effect.orDie)
      expect(flakes).toEqual([{ test: "test/a.test.ts", count: 1 }])
    }),
  )

  it.live("a member that fails F alone is ejected and the rest are rebuilt", () =>
    Effect.gen(function* () {
      const board = yield* Board.Service
      const repo = yield* repository("QIS", 3, undefined, "script")
      yield* card(repo, "QIS", 1, "a.txt")
      yield* card(repo, "QIS", 2, "fail.txt")
      yield* card(repo, "QIS", 3, "c.txt")
      yield* Effect.forEach([1, 2, 3], (number) => passed(repo, number), { discard: true })
      yield* board.queue({ project: "QIS", number: 1, reason: "Verified." })
      yield* board.queue({ project: "QIS", number: 2, reason: "Verified." })
      yield* board.queue({ project: "QIS", number: 3, reason: "Verified.", flush: true })
      repo.remote.conclusion = "SUCCESS"
      repo.remote.seeded = ["card-2"]
      repo.remote.log = GROUPED

      yield* Effect.forEach(Array.from({ length: 12 }), () => board.queueTick(), { discard: true })
      expect(yield* stage(repo, 2)).toBe("review")
      expect((yield* bundleStatuses(repo))[0]).toBe("isolated")
      expect(yield* stage(repo, 1)).not.toBe("review")
      expect(yield* stage(repo, 3)).not.toBe("review")

      repo.remote.seeded = []
      yield* Effect.forEach(Array.from({ length: 4 }), () => board.queueTick(), { discard: true })
      expect(yield* stage(repo, 1)).toBe("shipped")
      expect(yield* stage(repo, 3)).toBe("shipped")
    }),
  )

  it.live("halving finds the member whose addition turns the prefix red", () =>
    Effect.gen(function* () {
      const board = yield* Board.Service
      const repo = yield* repository("QIH", 3, undefined, "script")
      yield* card(repo, "QIH", 1, "x.txt")
      yield* card(repo, "QIH", 2, "y.txt")
      yield* card(repo, "QIH", 3, "c.txt")
      yield* Effect.forEach([1, 2, 3], (number) => passed(repo, number), { discard: true })
      yield* board.queue({ project: "QIH", number: 1, reason: "Verified." })
      yield* board.queue({ project: "QIH", number: 2, reason: "Verified." })
      yield* board.queue({ project: "QIH", number: 3, reason: "Verified.", flush: true })
      repo.remote.conclusion = "SUCCESS"
      repo.remote.seeded = ["card-1", "card-2"]
      repo.remote.log = GROUPED

      yield* Effect.forEach(Array.from({ length: 12 }), () => board.queueTick(), { discard: true })
      expect(yield* stage(repo, 2)).toBe("review")
      expect(yield* stage(repo, 1)).not.toBe("review")
    }),
  )

  it.live("a bundle red after two rebuilds dissolves and holds its cards until Maestro releases one", () =>
    Effect.gen(function* () {
      const board = yield* Board.Service
      const repo = yield* repository("QHD", 3, undefined, "script")
      yield* card(repo, "QHD", 1, "a.txt")
      yield* card(repo, "QHD", 2, "fail.txt")
      yield* Effect.forEach([1, 2], (number) => passed(repo, number), { discard: true })
      yield* board.queue({ project: "QHD", number: 1, reason: "Verified." })
      yield* board.queue({ project: "QHD", number: 2, reason: "Verified.", flush: true })
      repo.remote.conclusion = "SUCCESS"
      repo.remote.seeded = ["card-2"]
      repo.remote.log = GROUPED

      yield* board.queueTick()
      const database = yield* Database.Service
      yield* database.db.update(BoardBundleTable).set({ rebuilds: 2 }).where(eq(BoardBundleTable.status, "open")).run().pipe(Effect.orDie)
      yield* Effect.forEach(Array.from({ length: 12 }), () => board.queueTick(), { discard: true })
      expect((yield* bundleStatuses(repo))[0]).toBe("dissolved")
      expect(yield* stage(repo, 1)).toBe("queue")
      expect(yield* stage(repo, 2)).toBe("queue")

      expect(yield* board.bundle({ project: "QHD", bundle: 1, verdict: "release", card: 1, reason: "Try it alone." })).toEqual({ status: "released" })
      const pulls = repo.remote.pulls.size
      yield* board.queueTick()
      expect(repo.remote.pulls.size).toBe(pulls + 1)
    }),
  )

  it.live("Maestro merges a flaky bundle as tested", () =>
    Effect.gen(function* () {
      const board = yield* Board.Service
      const repo = yield* repository("QVM", 1, undefined, "script")
      yield* card(repo, "QVM", 1, "a.txt")
      yield* passed(repo, 1)
      yield* board.queue({ project: "QVM", number: 1, reason: "Verified." })
      repo.remote.conclusion = "SUCCESS"
      repo.remote.seeded = ["card-1"]
      repo.remote.log = GROUPED

      yield* Effect.forEach(Array.from({ length: 12 }), () => board.queueTick(), { discard: true })
      yield* Effect.forEach(Array.from({ length: 2 }), () => board.queueTick(), { discard: true })
      expect(yield* board.bundle({ project: "QVM", bundle: 1, verdict: "merge", reason: "Known flake." })).toEqual({ status: "accepted" })
      yield* Effect.forEach(Array.from({ length: 4 }), () => board.queueTick(), { discard: true })
      expect(yield* stage(repo, 1)).toBe("shipped")
      expect(yield* bundleStatuses(repo)).toEqual(["merged"])
    }),
  )

  it.live("Maestro retries a flaky bundle into a new one", () =>
    Effect.gen(function* () {
      const board = yield* Board.Service
      const repo = yield* repository("QVR", 1, undefined, "script")
      yield* card(repo, "QVR", 1, "a.txt")
      yield* passed(repo, 1)
      yield* board.queue({ project: "QVR", number: 1, reason: "Verified." })
      repo.remote.conclusion = "SUCCESS"
      repo.remote.seeded = ["card-1"]
      repo.remote.log = GROUPED

      yield* Effect.forEach(Array.from({ length: 12 }), () => board.queueTick(), { discard: true })
      yield* Effect.forEach(Array.from({ length: 2 }), () => board.queueTick(), { discard: true })
      const pulls = repo.remote.pulls.size
      expect(yield* board.bundle({ project: "QVR", bundle: 1, verdict: "retry", reason: "Rerun." })).toEqual({ status: "dissolved" })
      yield* board.queueTick()
      expect((yield* bundleStatuses(repo))[0]).toBe("dissolved")
      expect(repo.remote.pulls.size).toBe(pulls + 1)
      expect(yield* stage(repo, 1)).toBe("queue")
    }),
  )

  it.live("a verdict on an open bundle is refused", () =>
    Effect.gen(function* () {
      const board = yield* Board.Service
      const repo = yield* repository("QVX")
      yield* card(repo, "QVX", 1, "a.txt")
      yield* board.queue({ project: "QVX", number: 1, reason: "Verified.", flush: true })
      yield* board.queueTick()
      const refused = yield* board.bundle({ project: "QVX", bundle: 1, verdict: "merge", reason: "x" }).pipe(Effect.flip)
      expect(refused.message).toContain("only a flaky bundle merges")
    }),
  )

  it.live("two ticks at once settle a project only once", () =>
    Effect.gen(function* () {
      const board = yield* Board.Service
      const repo = yield* repository("QLK", 1)
      yield* card(repo, "QLK", 1, "a.txt")
      yield* board.queue({ project: "QLK", number: 1, reason: "Verified.", flush: true })
      yield* Effect.all([board.queueTick(), board.queueTick()], { concurrency: 2, discard: true })
      expect(yield* bundleStatuses(repo)).toHaveLength(1)
      expect(repo.remote.pulls.size).toBe(2)
    }),
  )

  it.live("an infrastructure red twice pauses the queue until Maestro retries it", () =>
    Effect.gen(function* () {
      const board = yield* Board.Service
      const repo = yield* repository("QIP")
      yield* card(repo, "QIP", 1, "a.txt")
      yield* card(repo, "QIP", 2, "b.txt")
      yield* board.queue({ project: "QIP", number: 1, reason: "Verified." })
      yield* board.queue({ project: "QIP", number: 2, reason: "Verified." })
      repo.remote.conclusion = "SUCCESS"
      repo.remote.cancelled = ["bundle-QIP-1", "bundle-QIP-2"]

      yield* Effect.forEach(Array.from({ length: 8 }), () => board.queueTick(), { discard: true })
      expect([yield* stage(repo, 1), yield* stage(repo, 2)]).toEqual(["queue", "queue"])
      expect(yield* bundleStatuses(repo)).toEqual(["infra", "paused"])

      const pulls = repo.remote.pulls.size
      yield* board.queueTick()
      expect(repo.remote.pulls.size).toBe(pulls)
      expect(yield* bundleStatuses(repo)).toEqual(["infra", "paused"])

      repo.remote.cancelled = []
      expect(yield* board.bundle({ project: "QIP", bundle: 2, verdict: "retry", reason: "Runner back." })).toEqual({ status: "infra" })
      yield* board.queueTick()
      expect(repo.remote.pulls.size).toBe(pulls + 1)
    }),
  )

  test("the bundle size follows the red rate once 50 cards have settled", () => {
    const bundle = { size: 4, max: 16, waitMinutes: 45, onBaseMoved: "retest" as const }
    const outcomes = (outcome: string, count: number) => Array.from({ length: count }, () => outcome)
    expect(BoardQueue.size(outcomes("merged", 49), bundle)).toBe(4)
    expect(BoardQueue.size(outcomes("merged", 50), bundle)).toBe(16)
    expect(BoardQueue.size([...outcomes("merged", 45), ...outcomes("ejected", 5)], bundle)).toBe(2)
    expect(BoardQueue.size([...outcomes("merged", 48), ...outcomes("ejected", 2)], bundle)).toBe(7)
    expect(BoardQueue.size(outcomes("ejected", 50), bundle)).toBe(1)
  })
})

type Repo = { readonly root: string; readonly directory: string; readonly key: string; readonly remote: Remote }

// A repository on main with a contract that bundles two cards, pushed to a bare origin GitHub knows as acme/<key>.
function repository(key: string, size = 2, full?: object, scoped?: "script") {
  return Effect.gen(function* () {
    const made = yield* Effect.promise(async () => {
      const root = await fs.realpath(await fs.mkdtemp(path.join(tmpdir(), `orchestra-board-queue-${key}-`)))
      const directory = path.join(root, "repo")
      const remote = path.join(root, "origin.git")
      const script = path.join(root, "scoped.sh")
      await git(root, "init", "--bare", remote)
      await git(root, "-c", "init.defaultBranch=main", "init", directory)
      await fs.mkdir(path.join(directory, ".orchestra"))
      if (scoped) await fs.writeFile(script, `echo "$@" >> ${path.join(root, "runs.log")}\n[ -f fail.txt ] && exit 1\n[ -f x.txt ] && [ -f y.txt ] && exit 1\nexit 0\n`)
      await fs.writeFile(
        path.join(directory, ".orchestra", "ci.json"),
        JSON.stringify({ bundle: { size, waitMinutes: 600 }, merge: "merge", full, scoped: scoped ? { tests: `sh ${script} {package} {files}` } : undefined }),
      )
      await commit(directory, "base")
      await git(directory, "remote", "add", "origin", pathToFileURL(remote).href)
      await git(directory, "push", "--quiet", "origin", "main")
      return { root, directory, key, remote: { origin: remote, pulls: new Map<number, string>(), bodies: new Map<number, string>(), conclusion: "", seeded: [] as ReadonlyArray<string>, cancelled: [] as ReadonlyArray<string>, job: "unit (linux)", log: "", baseRuns: GREEN_BASE, calls: [] } }
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

function notes(repo: Repo, number: number) {
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

// A scoped pass on the card's head tree, which `queue` requires when the contract has `scoped.tests`.
function passed(repo: Repo, number: number) {
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
function runs(repo: Repo) {
  return Effect.promise(async () =>
    (await fs.readFile(path.join(repo.root, "runs.log"), "utf8").catch(() => "")).split("\n").filter(Boolean),
  )
}

async function commit(directory: string, message: string) {
  await git(directory, "add", ".")
  await git(directory, "-c", "user.email=test@example.com", "-c", "user.name=Test", "commit", "--quiet", "-m", message)
}
