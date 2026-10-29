import { describe, expect, test } from "bun:test"
import { asc, eq } from "drizzle-orm"
import { Effect } from "effect"
import { Board } from "@orchestra/core/board/board"
import { capacity, earlier, global, lanes } from "@orchestra/core/board/queue-lanes"
import { BoardBundleTable, BoardIssueTable, BoardProjectTable } from "@orchestra/core/board/sql"
import { Database } from "@orchestra/core/database/database"
import { bundleStatuses, card, laneIt, origin, repository, row } from "./fixture/board-queue"

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
