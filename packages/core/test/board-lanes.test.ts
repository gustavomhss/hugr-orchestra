import { describe, expect, test } from "bun:test"
import { asc, eq } from "drizzle-orm"
import { Effect } from "effect"
import { Board } from "@orchestra/core/board/board"
import { capacity, earlier, global, lanes } from "@orchestra/core/board/queue-lanes"
import { BoardBundleTable, BoardIssueTable, BoardProjectTable } from "@orchestra/core/board/sql"
import { Database } from "@orchestra/core/database/database"
import { bundleStatuses, card, laneIt, origin, passed, repository, row, stage } from "./fixture/board-queue"

const LANES = { by: "turbo", global: ["package.json", "bun.lock", "turbo.json"], workflows: ["test.yml"] }

describe("BoardQueue lanes", () => {
  laneIt.live("disjoint cards land in parallel lane bundles, and a global card waits for both and runs the whole suite", () =>
    Effect.gen(function* () {
      const board = yield* Board.Service
      const database = yield* Database.Service
      const repo = yield* repository("QLN", 1, { label: "epic", checks: ["test"] }, undefined, LANES)
      yield* card(repo, "QLN", 1, "packages/a/one.ts")
      yield* card(repo, "QLN", 2, "packages/b/two.ts")
      yield* card(repo, "QLN", 3, "bun.lock")
      yield* card(repo, "QLN", 4, "packages/c/four.ts")
      yield* Effect.forEach([1, 2, 3, 4], (number) =>
        Effect.gen(function* () {
          const found = yield* row(repo, number)
          yield* database.db.update(BoardIssueTable).set({ order: number }).where(eq(BoardIssueTable.id, found.issue.id)).run().pipe(Effect.orDie)
          yield* board.queue({ project: "QLN", number, reason: "Verified." })
        }),
      )
      const bundles = () =>
        database.db
          .select({ branch: BoardBundleTable.branch, packages: BoardBundleTable.packages, status: BoardBundleTable.status, base: BoardBundleTable.base_sha, on: BoardBundleTable.merged_on })
          .from(BoardBundleTable)
          .innerJoin(BoardProjectTable, eq(BoardProjectTable.id, BoardBundleTable.project_id))
          .where(eq(BoardProjectTable.key, "QLN"))
          .orderBy(asc(BoardBundleTable.n))
          .all()
          .pipe(Effect.orDie)
      const created = () => repo.remote.calls.filter((args) => args.slice(0, 2).join(" ") === "pr create")
      const dispatched = () => repo.remote.calls.filter((args) => args.slice(0, 2).join(" ") === "workflow run")

      yield* board.queueTick()
      // Two lanes in flight, each gated by a dispatch with only its packages and no full-suite label.
      expect((yield* bundles()).map((bundle) => bundle.packages)).toEqual([["a"], ["b"]])
      expect(created().some((args) => args.includes("--label"))).toBe(false)
      expect(dispatched().map((args) => args.at(-1))).toEqual(["packages=a", "packages=b"])
      expect(dispatched().map((args) => args[2])).toEqual(["test.yml", "test.yml"])
      // The global card waits for both lanes, and the card queued after it is not cut ahead of it.
      expect((yield* bundles()).length).toBe(2)

      repo.remote.conclusion = "SUCCESS"
      yield* board.queueTick()
      const landed = yield* bundles()
      expect(landed.slice(0, 2).map((bundle) => bundle.status)).toEqual(["merged", "merged"])
      // The second lane was tested on the old base and merged onto the first lane's merge (section 7.2).
      expect(landed[1]?.on).not.toBe(landed[1]?.base)
      // Then the global card goes alone, on the whole suite: the full label and no packages.
      expect(landed.slice(2).map((bundle) => bundle.packages)).toEqual([null])
      expect(created().at(-1)).toEqual(expect.arrayContaining(["--label", "epic"]))
      expect(dispatched()).toHaveLength(2)
      expect(landed).toHaveLength(3)

      yield* board.queueTick()
      expect(yield* bundleStatuses(repo)).toEqual(["merged", "merged", "merged", "open"])
      expect((yield* bundles()).at(-1)?.packages).toEqual(["c"])
      expect(dispatched().at(-1)?.at(-1)).toBe("packages=c")
      const main = yield* origin(repo, "main")
      expect(yield* Effect.promise(() => Bun.$`git --git-dir ${repo.remote.origin} ls-tree -r --name-only ${main}`.quiet().text())).toContain("bun.lock")
    }),
  )

  laneIt.live("a safety run finds a cross-package break the affected graph missed, and only the lane touching it pauses", () =>
    Effect.gen(function* () {
      const board = yield* Board.Service
      const database = yield* Database.Service
      const repo = yield* repository("QSN", 1, { label: "epic", checks: ["test"] }, "script", { ...LANES, fullEvery: 2 })
      const bundles = () =>
        database.db
          .select({ packages: BoardBundleTable.packages, status: BoardBundleTable.status, failing: BoardBundleTable.failing, fix: BoardBundleTable.fix_issue_id })
          .from(BoardBundleTable)
          .innerJoin(BoardProjectTable, eq(BoardProjectTable.id, BoardBundleTable.project_id))
          .where(eq(BoardProjectTable.key, "QSN"))
          .orderBy(asc(BoardBundleTable.n))
          .all()
          .pipe(Effect.orDie)
      const add = (number: number, file: string) =>
        Effect.gen(function* () {
          yield* card(repo, "QSN", number, file)
          yield* passed(repo, number)
          yield* board.queue({ project: "QSN", number, reason: "Verified." })
        })
      // Each card passes on its own lane; together they break b's tests, which lane a's affected set never reaches.
      yield* add(1, "packages/a/x.txt")
      yield* add(2, "packages/b/y.txt")
      repo.remote.seeded = ["card-1", "card-2"]
      repo.remote.log = "##[group]b:test\ntest/y.test.ts:\r\n(fail) y > z [1.00ms]\r\n##[endgroup]\n"
      repo.remote.conclusion = "SUCCESS"

      yield* board.queueTick()
      expect((yield* bundles()).map((bundle) => bundle.packages)).toEqual([["a"], ["b"]])
      // Both lanes land; two lane landings reach `fullEvery`, so a safety run starts on base with no package filter.
      yield* board.queueTick()
      expect((yield* bundles()).map((bundle) => [bundle.status, bundle.packages])).toEqual([["merged", ["a"]], ["merged", ["b"]], ["open", []]])
      const safety = repo.remote.calls.filter((args) => args.slice(0, 2).join(" ") === "workflow run").at(-1)
      expect(safety?.some((arg) => arg.startsWith("packages="))).toBe(false)

      // The safety run goes red, F fails on base, and the red base gets a fix card instead of a revert.
      yield* board.queueTick()
      const red = (yield* bundles()).at(-1)
      expect(red?.status).toBe("base-red")
      expect(red?.failing).toEqual([{ package: "b", files: ["test/y.test.ts"] }])
      const fix = red?.fix ? yield* database.db.select().from(BoardIssueTable).where(eq(BoardIssueTable.id, red.fix)).get().pipe(Effect.orDie) : undefined
      expect(fix?.type).toBe("bug")
      const main = yield* origin(repo, "main")
      expect(yield* Effect.promise(() => Bun.$`git --git-dir ${repo.remote.origin} ls-tree -r --name-only ${main}`.quiet().text())).toContain("packages/b/y.txt")

      // The fix card took number 3. A card touching b waits behind the red; a disjoint card in c still cuts its lane.
      yield* add(4, "packages/b/four.txt")
      yield* add(5, "packages/c/five.txt")
      repo.remote.conclusion = ""
      yield* board.queueTick()
      const after = yield* bundles()
      expect(after.slice(3).map((bundle) => bundle.packages)).toEqual([["c"]])
      expect(yield* stage(repo, 4)).toBe("queue")
      // No second safety run: the red one reset the count of lane landings.
      expect(after.filter((bundle) => bundle.packages?.length === 0)).toHaveLength(1)
    }),
  )

  laneIt.live("with fullEvery 0 lane landings never schedule a safety run", () =>
    Effect.gen(function* () {
      const board = yield* Board.Service
      const repo = yield* repository("QSZ", 1, { label: "epic", checks: ["test"] }, undefined, LANES)
      yield* card(repo, "QSZ", 1, "packages/a/one.ts")
      yield* card(repo, "QSZ", 2, "packages/b/two.ts")
      yield* board.queue({ project: "QSZ", number: 1, reason: "Verified." })
      yield* board.queue({ project: "QSZ", number: 2, reason: "Verified." })
      yield* board.queueTick()
      repo.remote.conclusion = "SUCCESS"
      yield* board.queueTick()
      yield* board.queueTick()
      yield* board.queueTick()
      expect(yield* bundleStatuses(repo)).toEqual(["merged", "merged"])
    }),
  )
})

const shape = (id: string, affected: ReadonlyArray<string> | null, order: number, extra: { bundleable?: boolean; urgent?: boolean } = {}) => ({
  id,
  affected,
  bundleable: extra.bundleable ?? true,
  urgent: extra.urgent ?? false,
  order,
  queuedAt: order,
})

describe("queue lanes", () => {
  test("disjoint cards make one lane each; overlapping cards join one lane", () => {
    expect(lanes([shape("a", ["x"], 1), shape("b", ["y"], 2), shape("c", ["x", "z"], 3)], [])).toEqual([
      { ids: ["a", "c"], packages: ["x", "z"] },
      { ids: ["b"], packages: ["y"] },
    ])
  })

  test("rule 1: a card that overlaps a bundle in flight waits", () => {
    expect(lanes([shape("a", ["x"], 1), shape("b", ["y"], 2)], [["x"]])).toEqual([{ ids: ["b"], packages: ["y"] }])
  })

  test("rule 2: no card goes ahead of an earlier card that overlaps it and waits", () => {
    // `a` waits on the bundle in flight; `b` overlaps `a`, so it waits too, and `c` is free.
    expect(lanes([shape("a", ["x", "y"], 1), shape("b", ["y"], 2), shape("c", ["z"], 3)], [["x"]])).toEqual([{ ids: ["c"], packages: ["z"] }])
  })

  test("a global card goes alone once nothing is in flight, and holds every card behind it", () => {
    expect(lanes([shape("a", null, 1), shape("b", ["y"], 2)], [["x"]])).toEqual([])
    expect(lanes([shape("a", null, 1), shape("b", ["y"], 2)], [])).toEqual([{ ids: ["a"], packages: null }])
    expect(lanes([shape("a", null, 1), shape("b", null, 2)], [])).toEqual([{ ids: ["a", "b"], packages: null }])
    // An earlier lane card makes the global card wait until it lands.
    expect(lanes([shape("a", ["x"], 1), shape("b", null, 2), shape("c", ["y"], 3)], [])).toEqual([{ ids: ["a"], packages: ["x"] }])
  })

  test("a card that cannot bundle neither goes nor blocks", () => {
    expect(lanes([shape("a", ["x"], 1, { bundleable: false }), shape("b", ["x"], 2)], [])).toEqual([{ ids: ["b"], packages: ["x"] }])
  })

  test("cards with no affected package share one lane, and room caps the lanes", () => {
    expect(lanes([shape("a", [], 1), shape("b", [], 2)], [])).toEqual([{ ids: ["a", "b"], packages: [] }])
    expect(lanes([shape("a", ["x"], 1), shape("b", ["y"], 2)], [], 1)).toEqual([{ ids: ["a"], packages: ["x"] }])
    expect(lanes([shape("a", ["x"], 1)], [], 0)).toEqual([])
  })

  test("earlier: urgent, then order, then time queued", () => {
    expect(earlier(shape("a", [], 2, { urgent: true }), shape("b", [], 1))).toBeLessThan(0)
    expect(earlier(shape("a", [], 1), shape("b", [], 2))).toBeLessThan(0)
    expect(earlier({ ...shape("a", [], 1), order: null, queuedAt: 5 }, { ...shape("b", [], 2), queuedAt: 3 })).toBeGreaterThan(0)
  })

  test("global matches the contract globs, and capacity floors the job budget", () => {
    expect(global(["packages/a/x.ts", "bun.lock"], ["bun.lock"])).toBe(true)
    expect(global(["packages/a/package.json"], ["package.json"])).toBe(false)
    expect(capacity(20, 10)).toBe(2)
    expect(capacity(25, 10)).toBe(2)
    expect(capacity(5, 10)).toBe(1)
    expect(capacity(null, 10)).toBe(Infinity)
  })
})
