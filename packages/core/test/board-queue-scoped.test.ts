import { describe, expect, test } from "bun:test"
import fs from "fs/promises"
import path from "path"
import { desc, eq } from "drizzle-orm"
import { Effect } from "effect"
import { Board } from "@orchestra/core/board/board"
import { BoardBundleTable, BoardFlakeTable, BoardIssueTable, BoardProjectTable } from "@orchestra/core/board/sql"
import { Database } from "@orchestra/core/database/database"
import { git } from "./fixture/git"
import { GROUPED, RECORD, bundleStatuses, card, commit, it, notes, passed, repository, row, runs, stage } from "./fixture/board-queue"

describe("BoardQueue", () => {
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

  it.live("a red base is bisected to its culprit, gets a fix card, and only the fix rides until it merges", () =>
    Effect.gen(function* () {
      const board = yield* Board.Service
      const repo = yield* repository("QBF", 1, undefined, "script")
      yield* card(repo, "QBF", 1, "a.txt")
      yield* passed(repo, 1)
      yield* board.queue({ project: "QBF", number: 1, reason: "Verified." })
      repo.remote.conclusion = "SUCCESS"
      repo.remote.seeded = []
      yield* Effect.forEach(Array.from({ length: 6 }), () => board.queueTick(), { discard: true })
      expect(yield* stage(repo, 1)).toBe("shipped")

      const broken = yield* Effect.promise(async () => {
        await git(repo.directory, "pull", "--quiet", "--ff-only", "origin", "main")
        await fs.writeFile(path.join(repo.directory, "noise.txt"), "noise\n")
        await commit(repo.directory, "noise")
        await fs.writeFile(path.join(repo.directory, "fail.txt"), "x\n")
        await commit(repo.directory, "break")
        await git(repo.directory, "push", "--quiet", "origin", "main")
        return (await Bun.$`git -C ${repo.directory} rev-parse HEAD`.quiet().text()).trim()
      })
      yield* card(repo, "QBF", 2, "b.txt")
      yield* passed(repo, 2)
      yield* board.queue({ project: "QBF", number: 2, reason: "Verified." })
      repo.remote.seeded = ["card-2"]
      repo.remote.log = GROUPED
      yield* Effect.forEach(Array.from({ length: 12 }), () => board.queueTick(), { discard: true })

      expect((yield* bundleStatuses(repo)).at(-1)).toBe("base-red")
      expect(yield* stage(repo, 2)).toBe("queue")
      expect(yield* stage(repo, 3)).toBe("backlog")
      const fix = yield* row(repo, 3)
      expect(fix.issue.type).toBe("bug")
      expect(fix.issue.body).toContain(broken)
      const database = yield* Database.Service
      const latest = yield* database.db
        .select({ culprit: BoardBundleTable.culprit })
        .from(BoardBundleTable)
        .innerJoin(BoardProjectTable, eq(BoardProjectTable.id, BoardBundleTable.project_id))
        .where(eq(BoardProjectTable.key, "QBF"))
        .orderBy(desc(BoardBundleTable.n))
        .get()
        .pipe(Effect.orDie)
      expect(latest?.culprit).toBe(broken)

      yield* Effect.promise(async () => {
        const worktree = path.join(repo.root, "card-3")
        await git(repo.directory, "worktree", "add", "-b", "card-3", worktree)
        await fs.writeFile(path.join(worktree, "fix.txt"), "fix\n")
        await commit(worktree, "card-3")
        await git(worktree, "push", "--quiet", "origin", "card-3")
      })
      repo.remote.pulls.set(3, "card-3")
      yield* board.issue({ project: "QBF", number: 3, branch: "card-3", pr: 3, record: RECORD, reason: "Fix." })
      yield* database.db.update(BoardIssueTable).set({ stage: "review" }).where(eq(BoardIssueTable.id, fix.issue.id)).run().pipe(Effect.orDie)
      yield* passed(repo, 3)
      yield* board.queue({ project: "QBF", number: 3, reason: "Verified." })
      repo.remote.seeded = ["card-3"]
      yield* Effect.forEach(Array.from({ length: 8 }), () => board.queueTick(), { discard: true })
      expect(yield* stage(repo, 3)).toBe("shipped")
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
      expect((yield* notes(repo, 2)).some((body) => body.includes("once merged after QIH-1"))).toBe(true)
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
})
