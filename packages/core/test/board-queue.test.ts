import { describe, expect, test } from "bun:test"
import fs from "fs/promises"
import path from "path"
import { and, eq } from "drizzle-orm"
import { Effect, Exit } from "effect"
import { Board } from "@orchestra/core/board/board"
import { BoardQueue } from "@orchestra/core/board/queue"
import type { BoardRecord } from "@orchestra/core/board/record"
import { BoardBundleTable, BoardCheckTable, BoardProjectTable } from "@orchestra/core/board/sql"
import { Database } from "@orchestra/core/database/database"
import { CheckID } from "@orchestra/schema/board"
import { git } from "./fixture/git"
import { RECORD, bundleStatuses, card, commit, it, origin, queued, repository, row, stage } from "./fixture/board-queue"

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
      // Section 4.7: the record commit tops the bundle with the board log, and one logbook entry and one milestone per
      // member; a local remote reads as public, so the free text is dropped.
      const tree = (...args: string[]) => Effect.promise(() => Bun.$`git --git-dir ${repo.remote.origin} ${args}`.quiet().text())
      expect((yield* tree("log", "-1", "--format=%s", bundle)).trim()).toBe("chore(queue): record QOK-B1")
      expect((yield* tree("show", `${bundle}:.atlas/members/orch/memory/logbook.jsonl`)).trim().split("\n")).toHaveLength(3)
      expect(yield* tree("show", `${bundle}:.atlas/project/orientation.jsonl`)).toContain("QOK-2")
      const boardLog = yield* tree("show", `${bundle}:.atlas/project/board.jsonl`)
      expect(boardLog).toContain("QOK-3")
      expect(boardLog).not.toContain("Verified.")

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
