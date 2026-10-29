import { describe, expect } from "bun:test"
import { asc, desc, eq } from "drizzle-orm"
import { Effect } from "effect"
import { Board } from "@orchestra/core/board/board"
import { BoardAttemptTable, BoardBundleTable, BoardProjectTable } from "@orchestra/core/board/sql"
import { Database } from "@orchestra/core/database/database"
import { bundleStatuses, card, ejections, it, notes, queued, repository, row, stage } from "./fixture/board-queue"

describe("BoardQueue", () => {
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
      // A failing test the gate can name: without one, a red base reads as infrastructure (see the infra-path test).
      repo.remote.log = "##[group]@orchestra/core:test\ntest/a.test.ts:\n(fail) a > b [1.00ms]\n##[endgroup]\n"
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
})
