import { describe, expect } from "bun:test"
import { eq } from "drizzle-orm"
import { Effect } from "effect"
import { Board } from "@orchestra/core/board/board"
import { BoardGithub } from "@orchestra/core/board/github"
import { BoardActivityTable, BoardCiRunTable, BoardIssueTable, BoardProjectTable } from "@orchestra/core/board/sql"
import { log } from "../src/board/shared"
import { Credential } from "@orchestra/core/credential"
import { Database } from "@orchestra/core/database/database"
import { AppNodeBuilder } from "@orchestra/core/effect/app-node-builder"
import { makeGlobalNode } from "@orchestra/core/effect/app-node"
import { LayerNode } from "@orchestra/core/effect/layer-node"
import { EventV2 } from "@orchestra/core/event"
import { Global } from "@orchestra/core/global"
import { AppProcess } from "@orchestra/core/process"
import { testEffect } from "./lib/effect"
import { github } from "./fixture/board-github"

const it = testEffect(
  AppNodeBuilder.build(LayerNode.group([Board.node, Database.node, EventV2.node, Credential.node]), [
    [
      Board.node,
      makeGlobalNode({
        service: Board.Service,
        layer: Board.layerWith({ gh: github.run, poll: false }),
        deps: [Database.node, EventV2.node, Credential.node, AppProcess.node, Global.node],
      }),
    ],
  ]),
)

const SECRET = "sk-board-github-4d2a9c61"

describe("Board GitHub mirror", () => {
  it.live("a legacy PR watermark is not a revision-attested scan and telemetry preserves the plan timestamp", () =>
    Effect.gen(function* () {
      github.reset()
      const board = yield* Board.Service
      const database = yield* Database.Service
      yield* board.project({ key: "LEG", name: "Legacy scan", github_repo: "acme/widgets", reason: "Start." })
      const made = yield* board.issue({ project: "LEG", title: "Work", pr: 9, reason: "Track." })
      const issue = made.issue!
      const row = (yield* database.db.select().from(BoardIssueTable).where(eq(BoardIssueTable.id, issue.id)).get().pipe(Effect.orDie))!
      yield* database.db.insert(BoardCiRunTable).values({ run_id: 91, project_id: row.project_id, issue_id: issue.id, name: "legacy", attempt: 1, billable_ms: 60000, cost_usd: 0.006, billing_known: true }).run().pipe(Effect.orDie)
      // This represents pre-revision storage, not a complete scan under today's association fence.
      yield* database.db.update(BoardIssueTable).set({ ci_scanned_pr: 9, time_updated: 1 }).where(eq(BoardIssueTable.id, issue.id)).run().pipe(Effect.orDie)
      expect((yield* board.execution("LEG", 1)).metrics.ciRateBasis).toBeUndefined()
      expect((yield* board.spend("LEG")).cards[0].infra.kind).toBe("not-metered")
      github.state.pulls[9] = { state: "open", merged: false }
      github.state.runs = [{ id: 91, name: "legacy", status: "completed", run_attempt: 1 }]
      const mirror = BoardGithub.make({ gh: github.run, log, quiet: (work) => database.db.transaction(work, { behavior: "immediate" }).pipe(Effect.orDie), publish: () => Effect.void })
      yield* mirror.ci("LEG", true)
      expect((yield* board.execution("LEG", 1)).metrics).toMatchObject({ ciMs: 60000, ciUsd: 0.006, ciRateBasis: "standard-x64-2026-11" })
      expect(yield* database.db.select().from(BoardIssueTable).where(eq(BoardIssueTable.id, issue.id)).get().pipe(Effect.orDie)).toMatchObject({ time_updated: 1, ci_pr_revision: 0, ci_scanned_revision: 0 })
    }),
  )
  for (const mode of ["edit", "undo"] as const) it.live(`an in-flight scan cannot re-attest a PR association that left and returned through ${mode}`, () =>
    Effect.gen(function* () {
      github.reset()
      const board = yield* Board.Service
      const database = yield* Database.Service
      const key = mode === "edit" ? "ABAE" : "ABAU"
      yield* board.project({ key, name: "Concurrent association", github_repo: "acme/widgets", reason: "Start." })
      yield* board.issue({ project: key, title: "Work", pr: 9, reason: "Track." })
      github.state.pulls[9] = { state: "open", merged: false }
      github.state.runs = [{ id: 91, name: "test", status: "completed", run_attempt: 1 }]
      github.state.timing[91] = { billable: { UBUNTU: { total_ms: 60000 } } }
      const change = { enabled: false, made: false }
      const gh: BoardGithub.Gh = (args, stdin) => Effect.gen(function* () {
        const response = yield* github.run(args, stdin)
        if (change.enabled && !change.made && args[2]?.includes("/actions/runs?")) {
          change.made = true
          const moved = yield* board.issue({ project: key, number: 1, pr: 10, reason: "Association changes during the scan." })
          if (mode === "undo") yield* board.undo(key, moved.activity)
          if (mode === "edit") yield* board.issue({ project: key, number: 1, pr: 9, reason: "Return during the same scan." })
        }
        return response
      }).pipe(Effect.orDie)
      const mirror = BoardGithub.make({ gh, log, quiet: (work) => database.db.transaction(work, { behavior: "immediate" }).pipe(Effect.orDie), publish: () => Effect.void })
      yield* mirror.ci(key, true)
      expect((yield* board.execution(key, 1)).metrics.ciRateBasis).toBe("standard-x64-2026-11")
      change.enabled = true
      yield* mirror.ci(key, true)
      expect(change.made).toBe(true)
      expect((yield* board.snapshot(key)).issues[0].prNumber).toBe(9)
      expect((yield* board.execution(key, 1)).metrics.ciRateBasis).toBeUndefined()
      expect((yield* board.spend(key)).cards[0].infra.kind).toBe("not-metered")
      yield* mirror.ci(key, true)
      expect((yield* board.execution(key, 1)).metrics.ciRateBasis).toBe("standard-x64-2026-11")
    }),
  )
  for (const source of ["head", "historical"] as const) it.live(`invalid ${source} run-attempt metadata refuses a scan without guessing attempt one`, () =>
    Effect.gen(function* () {
      github.reset()
      const board = yield* Board.Service
      const database = yield* Database.Service
      const key = source === "head" ? "ATTH" : "ATTO"
      const attempt = source === "head" ? 1 : 2
      const mirror = BoardGithub.make({ gh: github.run, log, quiet: (work) => database.db.transaction(work, { behavior: "immediate" }).pipe(Effect.orDie), publish: () => Effect.void })
      yield* board.project({ key, name: "Attempt provenance", github_repo: "acme/widgets", reason: "Start." })
      yield* board.issue({ project: key, title: "Work", pr: 9, reason: "Track." })
      github.state.pulls[9] = { state: "open", merged: false }
      github.state.runs = [{ id: 91, name: "test", status: "completed", run_attempt: attempt }]
      github.state.timing[91] = { billable: { UBUNTU: { total_ms: attempt * 60000 } } }
      yield* mirror.ci(key, true)
      const before = yield* database.db.select().from(BoardCiRunTable).where(eq(BoardCiRunTable.run_id, 91)).get().pipe(Effect.orDie)
      expect((yield* board.execution(key, 1)).metrics.ciRateBasis).toBe("standard-x64-2026-11")
      for (const value of [undefined, null, 0, -1]) {
        const run = { id: 91, name: "unknown attempt", status: "completed", ...(value === undefined ? {} : { run_attempt: value }) }
        github.state.runs = source === "head" ? [run] : []
        github.state.historicalRuns[91] = run
        github.state.timing[91] = { billable: { UBUNTU: { total_ms: 180000 } } }
        expect(yield* mirror.ci(key, true)).toMatchObject({ state: "error" })
        expect((yield* board.execution(key, 1)).metrics.ciRateBasis).toBeUndefined()
        expect((yield* board.execution(key, 1)).metrics.ciUsd).toBeNull()
        expect(yield* database.db.select().from(BoardCiRunTable).where(eq(BoardCiRunTable.run_id, 91)).get().pipe(Effect.orDie)).toEqual(before)
      }
    }),
  )
  it.live("a previously measured off-head run is revalidated when a new attempt queues and finishes", () =>
    Effect.gen(function* () {
      github.reset()
      const board = yield* Board.Service
      const database = yield* Database.Service
      const mirror = BoardGithub.make({ gh: github.run, log, quiet: (work) => database.db.transaction(work, { behavior: "immediate" }).pipe(Effect.orDie), publish: () => Effect.void })
      yield* board.project({ key: "RERUN", name: "Historical rerun", github_repo: "acme/widgets", reason: "Start." })
      yield* board.issue({ project: "RERUN", title: "Work", pr: 9, reason: "Track." })
      github.state.pulls[9] = { state: "open", merged: false }
      github.state.runs = [{ id: 91, name: "test", status: "completed", run_attempt: 1 }]
      github.state.timing[91] = { billable: { UBUNTU: { total_ms: 60000 } } }
      yield* mirror.ci("RERUN", true)
      expect((yield* board.execution("RERUN", 1)).metrics.ciRateBasis).toBe("standard-x64-2026-11")
      github.state.runs = []
      github.state.historicalRuns[91] = { id: 91, name: "rerun", status: "queued", run_attempt: 2 }
      yield* mirror.ci("RERUN", true)
      expect(yield* database.db.select().from(BoardCiRunTable).where(eq(BoardCiRunTable.run_id, 91)).get().pipe(Effect.orDie)).toMatchObject({ attempt: 1, billable_ms: 60000, cost_usd: 0.006, billing_known: false })
      expect((yield* board.execution("RERUN", 1)).metrics.ciRateBasis).toBeUndefined()
      github.state.historicalRuns[91].status = "completed"
      github.state.timing[91] = { billable: {} }
      yield* mirror.ci("RERUN", true)
      expect((yield* board.execution("RERUN", 1)).metrics.ciUsd).toBeNull()
      github.state.timing[91] = { billable: { UBUNTU: { total_ms: 120000 } } }
      yield* mirror.ci("RERUN", true)
      expect((yield* board.execution("RERUN", 1)).metrics).toMatchObject({ ciMs: 120000, ciUsd: 0.012, ciRateBasis: "standard-x64-2026-11" })
      // A completed off-head rerun must withdraw the prior measurement before an unsuccessful timing read too.
      github.state.historicalRuns[91].run_attempt = 3
      github.state.timing[91] = { billable: {} }
      yield* mirror.ci("RERUN", true)
      expect(yield* database.db.select().from(BoardCiRunTable).where(eq(BoardCiRunTable.run_id, 91)).get().pipe(Effect.orDie)).toMatchObject({ attempt: 2, billable_ms: 120000, cost_usd: 0.012, billing_known: false, observed_pr: 9 })
      expect((yield* board.execution("RERUN", 1)).metrics.ciRateBasis).toBeUndefined()
      github.state.timing[91] = { billable: { UBUNTU: { total_ms: 180000 } } }
      yield* mirror.ci("RERUN", true)
      expect((yield* board.execution("RERUN", 1)).metrics).toMatchObject({ ciMs: 180000, ciRateBasis: "standard-x64-2026-11" })
      expect((yield* board.execution("RERUN", 1)).metrics.ciUsd).toBeCloseTo(0.018, 9)
    }),
  )
  it.live("changing PR keeps first observed run association separate from cumulative card scan attestation", () =>
    Effect.gen(function* () {
      github.reset()
      const board = yield* Board.Service
      const database = yield* Database.Service
      const mirror = BoardGithub.make({ gh: github.run, log, quiet: (work) => database.db.transaction(work, { behavior: "immediate" }).pipe(Effect.orDie), publish: () => Effect.void })
      yield* board.project({ key: "RELINK", name: "Card history", github_repo: "acme/widgets", reason: "Start." })
      yield* board.issue({ project: "RELINK", title: "Work", pr: 9, reason: "Track first attempt." })
      github.state.pulls[9] = { state: "open", merged: false }
      github.state.runs = [{ id: 91, name: "first", status: "completed", run_attempt: 1 }]
      github.state.timing[91] = { billable: { UBUNTU: { total_ms: 60000 } } }
      yield* mirror.ci("RELINK", true)
      yield* board.issue({ project: "RELINK", number: 1, pr: 10, reason: "A replacement PR must not erase the earlier work." })
      expect((yield* board.execution("RELINK", 1)).metrics.ciRateBasis).toBeUndefined()
      github.state.pulls[10] = { state: "open", merged: false }
      github.state.historicalRuns[91] = github.state.runs[0]
      github.state.runs = [{ id: 92, name: "replacement", status: "completed", run_attempt: 1 }]
      github.state.timing[92] = { billable: { UBUNTU: { total_ms: 120000 } } }
      yield* mirror.ci("RELINK", true)
      const rows = yield* database.db.select().from(BoardCiRunTable).orderBy(BoardCiRunTable.run_id).all().pipe(Effect.orDie)
      expect(rows[0]).toMatchObject({ run_id: 91, observed_pr: 9 })
      expect(rows[1]).toMatchObject({ run_id: 92, observed_pr: 10 })
      expect((yield* board.execution("RELINK", 1)).metrics).toMatchObject({ ciMs: 180000, ciRuns: 2, ciRateBasis: "standard-x64-2026-11" })
      expect((yield* board.execution("RELINK", 1)).metrics.ciUsd).toBeCloseTo(0.018, 9)
      const infra = (yield* board.spend("RELINK")).cards[0].infra
      expect(infra.kind).toBe("usd")
      if (infra.kind === "usd") expect(infra.usd).toBeCloseTo(0.018, 9)
      yield* board.issue({ project: "RELINK", number: 1, pr: 9, reason: "Return to the earlier association." })
      yield* board.issue({ project: "RELINK", number: 1, pr: 10, reason: "Returning to the scanned PR does not reuse old scan freshness." })
      expect((yield* board.execution("RELINK", 1)).metrics.ciRateBasis).toBeUndefined()
    }),
  )
  it.live("unknown off-head CI retries preserve legacy evidence until measured timing arrives", () =>
    Effect.gen(function* () {
      github.reset()
      const board = yield* Board.Service
      const database = yield* Database.Service
      const mirror = BoardGithub.make({ gh: github.run, log, quiet: (work) => database.db.transaction(work, { behavior: "immediate" }).pipe(Effect.orDie), publish: () => Effect.void })
      yield* board.project({ key: "OLD", name: "Old head timing", github_repo: "acme/widgets", reason: "Start." })
      const made = yield* board.issue({ project: "OLD", title: "Work", pr: 9, reason: "Track." })
      github.state.pulls[9] = { state: "open", merged: false }
      const project = (yield* database.db.select().from(BoardProjectTable).where(eq(BoardProjectTable.key, "OLD")).get().pipe(Effect.orDie))!
      yield* database.db.insert(BoardCiRunTable).values({ run_id: 91, project_id: project.id, issue_id: made.issue!.id, name: "legacy", attempt: 1, billable_ms: 12345, cost_usd: 8.5, billing_known: false }).run().pipe(Effect.orDie)
      github.state.historicalRuns[91] = { id: 91, name: "legacy", status: "completed", run_attempt: 1 }
      yield* mirror.ci("OLD", true)
      expect(yield* database.db.select().from(BoardCiRunTable).where(eq(BoardCiRunTable.run_id, 91)).get().pipe(Effect.orDie)).toMatchObject({ billable_ms: 12345, cost_usd: 8.5, billing_known: false })
      expect(github.state.calls.some((call) => call.args[2] === "repos/acme/widgets/actions/runs/91/timing")).toBe(true)
      expect((yield* board.execution("OLD", 1)).metrics.ciUsd).toBeNull()
      github.state.timing[91] = { billable: { UBUNTU: { total_ms: 60000 } } }
      yield* mirror.ci("OLD", true)
      expect((yield* board.execution("OLD", 1)).metrics).toMatchObject({ ciRuns: 1, ciUsd: 0.006, ciMs: 60000, ciRateBasis: "standard-x64-2026-11" })
      github.state.runs = [{ id: 91, name: "rerun", status: "completed", run_attempt: 2 }]
      github.state.timing[91] = { billable: {} }
      yield* mirror.ci("OLD", true)
      expect(yield* database.db.select().from(BoardCiRunTable).where(eq(BoardCiRunTable.run_id, 91)).get().pipe(Effect.orDie)).toMatchObject({ billable_ms: 60000, cost_usd: 0.006, billing_known: false, attempt: 1 })
      expect((yield* board.execution("OLD", 1)).metrics.ciRateBasis).toBeUndefined()
      github.state.runs = []
      github.state.historicalRuns[91] = { id: 91, name: "rerun", status: "completed", run_attempt: 2 }
      github.state.timing[91] = { billable: { UBUNTU: { total_ms: 120000 } } }
      yield* mirror.ci("OLD", true)
      expect((yield* board.execution("OLD", 1)).metrics).toMatchObject({ ciRuns: 1, ciUsd: 0.012, ciMs: 120000, ciRateBasis: "standard-x64-2026-11" })
      yield* board.issue({ project: "OLD", number: 1, pr: 10, reason: "A new PR association needs its own discovery." })
      expect((yield* board.execution("OLD", 1)).metrics.ciRateBasis).toBeUndefined()
    }),
  )
  it.live("CI pages nullable-status runs and invalidates discovery attestation when a later listing is malformed", () =>
    Effect.gen(function* () {
      github.reset()
      const board = yield* Board.Service
      const database = yield* Database.Service
      const mirror = BoardGithub.make({ gh: github.run, log, quiet: (work) => database.db.transaction(work, { behavior: "immediate" }).pipe(Effect.orDie), publish: () => Effect.void })
      yield* board.project({ key: "PAGES", name: "Complete CI", github_repo: "acme/widgets", reason: "Start." })
      yield* board.issue({ project: "PAGES", title: "Work", pr: 9, reason: "Track." })
      github.state.pulls[9] = { state: "open", merged: false }
      github.state.runs = Array.from({ length: 101 }, (_, i) => ({ id: i + 1, name: "test", status: "completed", run_attempt: 1 }))
      github.state.runs.push({ id: 102, name: "pending status", status: null, run_attempt: 1 })
      github.state.timing = Object.fromEntries(github.state.runs.map((run) => [run.id, { billable: { UBUNTU: { total_ms: 60000 } } }]))
      expect(yield* mirror.ci("PAGES", true)).toMatchObject({ state: "ok" })
      expect((yield* board.execution("PAGES", 1)).metrics.ciRuns).toBe(102)
      expect((yield* board.execution("PAGES", 1)).metrics.ciRateBasis).toBeUndefined()
      expect(github.state.calls.some((call) => call.args[2]?.includes("page=2"))).toBe(true)
      github.state.runs = github.state.runs.map((run) => ({ ...run, status: "completed" }))
      yield* mirror.ci("PAGES", true)
      expect((yield* board.execution("PAGES", 1)).metrics.ciRateBasis).toBe("standard-x64-2026-11")
      expect((yield* board.spend("PAGES")).cards[0].infra.kind).toBe("usd")
      github.state.runsMalformed = true
      expect(yield* mirror.ci("PAGES", true)).toMatchObject({ state: "error" })
      expect((yield* board.execution("PAGES", 1)).metrics).toMatchObject({ ciUsd: null, ciMs: null, partial: true })
      expect((yield* board.execution("PAGES", 1)).metrics.ciRateBasis).toBeUndefined()
      expect((yield* board.spend("PAGES")).cards[0].infra.kind).toBe("not-metered")
      github.state.runsMalformed = false
      github.state.runsTotal = 103
      expect(yield* mirror.ci("PAGES", true)).toMatchObject({ state: "error" })
      expect((yield* board.execution("PAGES", 1)).metrics.ciRateBasis).toBeUndefined()
      github.state.runsTotal = 1001
      expect(yield* mirror.ci("PAGES", true)).toMatchObject({ state: "error" })
      expect((yield* board.execution("PAGES", 1)).metrics.ciRateBasis).toBeUndefined()
    }),
  )
  it.live("a PR read cannot overwrite a concurrent terminal move or append a duplicate receipt", () =>
    Effect.gen(function* () {
      github.reset()
      const board = yield* Board.Service
      const database = yield* Database.Service
      yield* board.project({ key: "RACE", name: "Concurrent PR", github_repo: "acme/widgets", reason: "Start." })
      yield* board.issue({ project: "RACE", title: "Work", seat: "backend", reason: "Plan." })
      yield* board.move({ project: "RACE", number: 1, stage: "building", reason: "Dispatch." })
      yield* board.issue({ project: "RACE", number: 1, pr: 9, reason: "Link PR." })
      github.state.pulls[9] = { state: "closed", merged: true }
      const mirror = BoardGithub.make({
        gh: (args, stdin) => github.run(args, stdin).pipe(Effect.tap(() => args[2] === "repos/acme/widgets/pulls/9"
          ? board.move({ project: "RACE", number: 1, stage: "cut", reason: "Owner plan changed during HTTP." }).pipe(Effect.orDie)
          : Effect.void)),
        log, quiet: (work) => database.db.transaction(work, { behavior: "immediate" }).pipe(Effect.orDie), publish: () => Effect.void,
      })
      yield* mirror.sync("RACE")
      expect((yield* board.snapshot("RACE")).issues[0].stage).toBe("cut")
      expect((yield* board.execution("RACE", 1)).receipts.map((receipt) => receipt.stage)).toEqual(["cut"])
      expect((yield* board.activity("RACE")).filter((entry) => entry.actor === "github" && entry.action === "issue.move")).toEqual([])
    }),
  )

  it.live("missing, empty and unknown CI timing remain unavailable, refresh later, and never seal a fabricated zero", () =>
    Effect.gen(function* () {
      github.reset()
      const board = yield* Board.Service
      const database = yield* Database.Service
      const mirror = BoardGithub.make({ gh: github.run, log, quiet: (work) => database.db.transaction(work, { behavior: "immediate" }).pipe(Effect.orDie), publish: () => Effect.void })
      yield* board.project({ key: "BILL", name: "CI provenance", github_repo: "acme/widgets", reason: "Start." })
      yield* board.issue({ project: "BILL", title: "Work", pr: 9, reason: "Track." })
      github.state.pulls[9] = { state: "open", merged: false }
      github.state.runs = [1, 2, 3].map((id) => ({ id, name: "test", status: "completed", run_attempt: 1 }))
      github.state.timing = { 1: {}, 2: { billable: {} }, 3: { billable: { UNKNOWN: { total_ms: 60000 } } } }
      yield* mirror.ci("BILL", true)
      expect((yield* board.execution("BILL", 1)).metrics).toMatchObject({ ciRuns: 3, ciUsd: null, ciMs: null, partial: true })
      yield* board.move({ project: "BILL", number: 1, stage: "cut", reason: "Seal unavailable evidence." })
      const sealed = (yield* board.execution("BILL", 1)).receipts[0]
      expect(sealed.metrics).toMatchObject({ ciUsd: null, ciMs: null, partial: true })
      yield* board.move({ project: "BILL", number: 1, stage: "backlog", reason: "Reopen; CI later becomes available." })
      github.state.timing = { 1: { billable: { UBUNTU: { total_ms: 60000 } } }, 2: { billable: { WINDOWS: { total_ms: 60000 } } }, 3: { billable: { MACOS: { total_ms: 60000 } } } }
      yield* mirror.ci("BILL", true)
      expect((yield* board.execution("BILL", 1)).metrics).toMatchObject({ ciRuns: 3, ciUsd: 0.078, ciMs: 180000, ciRateBasis: "standard-x64-2026-11" })
      expect((yield* board.execution("BILL", 1)).receipts[0]).toEqual(sealed)
    }),
  )

  it.live("pushes a card as an issue with steps, labels, milestone and a link back, and closes it on Shipped", () =>
    Effect.gen(function* () {
      github.reset()
      const board = yield* Board.Service
      yield* board.project({ key: "OUT", name: "Out", github_repo: "acme/widgets", reason: "Start." })
      yield* board.epic({ project: "OUT", title: "Launch", goal: "Ship the launch.", reason: "Group." })
      yield* board.issue({ project: "OUT", title: "Write docs", body: "Plan body", type: "chore", epic: 1, reason: "Plan." })
      yield* board.steps({
        project: "OUT",
        number: 1,
        steps: [
          { title: "Draft", status: "done" },
          { title: "Review", status: "pending" },
          { title: "Old idea", status: "skipped" },
        ],
        reason: "Break it down.",
      })
      yield* board.issue({ project: "OUT", title: "Drop me", reason: "Plan." })

      expect(yield* board.sync("OUT")).toEqual({ state: "ok", error: null })
      const [docs, dropped] = github.state.issues
      expect(docs?.title).toBe("Write docs")
      expect(docs?.body).toBe(
        [
          "Plan body",
          "### Steps\n- [x] Draft\n- [ ] Review\n- [x] ~~Old idea~~",
          "---\nTracked on the Orchestra board as OUT-1. <!-- orchestra-board:OUT-1 -->",
        ].join("\n\n"),
      )
      expect(docs?.labels).toEqual(["stage:backlog", "type:chore"])
      expect(docs?.milestone).toBe(1)
      expect(github.state.milestones).toEqual([{ number: 1, title: "OUT-E1: Launch" }])
      expect(dropped?.labels).toEqual(["stage:backlog", "type:feature"])
      expect(dropped?.milestone).toBeNull()
      expect((yield* board.snapshot("OUT")).issues.map((issue) => issue.githubNumber)).toEqual([1, 2])

      // Nothing is dirty any more: the next sync writes nothing.
      const before = github.writes().length
      yield* board.sync("OUT")
      expect(github.writes().length).toBe(before)

      yield* board.move({ project: "OUT", number: 1, stage: "shipped", reason: "Docs are live." })
      yield* board.move({ project: "OUT", number: 2, stage: "cut", reason: "Not needed." })
      yield* board.sync("OUT")
      expect(github.state.issues[0]).toMatchObject({ state: "closed", state_reason: "completed" })
      expect(github.state.issues[0]?.labels).toContain("stage:shipped")
      expect(github.state.issues[1]).toMatchObject({ state: "closed", state_reason: "not_planned" })
      expect(github.state.issues[1]?.labels).toContain("stage:cut")

      // Our own pushes coming back are not conflicts.
      expect((yield* activity("OUT")).filter((row) => row.action === "github.overwrite")).toEqual([])
      expect((yield* board.snapshot("OUT")).questions).toEqual([])
    }),
  )

  it.live("never puts notes, attachments, secrets or questions in the issue body", () =>
    Effect.gen(function* () {
      github.reset()
      const board = yield* Board.Service
      yield* board.project({ key: "SEC", name: "Secrets", github_repo: "acme/widgets", reason: "Start." })
      yield* board.issue({ project: "SEC", title: "Rotate keys", body: "Plan only.", reason: "Plan." })
      yield* board.note("SEC", 1, { body: "Private owner note NOTE-MARKER" })
      yield* board.attach("SEC", 1, { kind: "secret", name: "deploy key", value: SECRET })
      yield* board.question({
        action: "ask",
        project: "SEC",
        issue: 1,
        text: "QUESTION-MARKER which vault?",
        options: [
          { id: "a", label: "A", consequence: "One." },
          { id: "b", label: "B", consequence: "Two." },
        ],
        recommended: "a",
        reason: "Blocks the work.",
      })

      yield* board.sync("SEC")
      const sent = JSON.stringify(github.state.calls)
      expect(github.state.issues[0]?.body).toBe(
        "Plan only.\n\n---\nTracked on the Orchestra board as SEC-1. <!-- orchestra-board:SEC-1 -->",
      )
      expect(github.state.calls.length).toBeGreaterThan(0)
      for (const text of [SECRET, "NOTE-MARKER", "QUESTION-MARKER", "deploy key"]) expect(sent).not.toContain(text)
    }),
  )

  it.live("a new issue from someone else lands in Intake; pull requests, closed issues and other boards' issues do not", () =>
    Effect.gen(function* () {
      github.reset()
      const board = yield* Board.Service
      yield* board.project({ key: "INT", name: "Intake", github_repo: "acme/widgets", reason: "Start." })
      yield* board.sync("INT")

      github.open({ title: "Crash on start", body: "It crashes.", labels: ["bug"] })
      github.open({ title: "A pull request", pull_request: {} })
      github.open({ title: "Old news", state: "closed" })
      github.open({ title: "Mirror", body: "x\n\n<!-- orchestra-board:OTH-4 -->" })
      yield* board.sync("INT")
      yield* board.sync("INT")

      const snapshot = yield* board.snapshot("INT")
      expect(snapshot.issues).toHaveLength(1)
      expect(snapshot.issues[0]).toMatchObject({ title: "Crash on start", body: "It crashes.", type: "bug", stage: "intake", githubNumber: 1 })
      expect((yield* activity("INT")).filter((row) => row.action === "issue.create")).toEqual([
        expect.objectContaining({ actor: "github" }),
      ])
      // Intake is the owner's to accept, so nothing is written to GitHub yet.
      expect(github.writes()).toEqual([])

      yield* board.accept("INT", 1)
      yield* board.sync("INT")
      expect(github.state.issues[0]?.labels).toEqual(["bug", "stage:backlog", "type:bug"])
      expect(github.state.issues[0]?.body).toContain("<!-- orchestra-board:INT-1 -->")
    }),
  )

  it.live("auto_accept_intake sends the new issue to Backlog and mirrors it", () =>
    Effect.gen(function* () {
      github.reset()
      const board = yield* Board.Service
      const database = yield* Database.Service
      yield* board.project({ key: "AUT", name: "Auto", github_repo: "acme/widgets", reason: "Start." })
      yield* database.db.update(BoardProjectTable).set({ auto_accept_intake: true }).where(eq(BoardProjectTable.key, "AUT")).run().pipe(Effect.orDie)
      yield* board.sync("AUT")

      github.open({ title: "Add dark mode" })
      yield* board.sync("AUT")
      expect((yield* board.snapshot("AUT")).issues[0]).toMatchObject({ title: "Add dark mode", stage: "backlog" })
      expect(github.state.issues[0]?.labels).toEqual(["stage:backlog", "type:feature"])
    }),
  )

  it.live("a card follows its PR: open moves Building to Review, merged moves it to Shipped; a hold or a pause keeps it", () =>
    Effect.gen(function* () {
      github.reset()
      const board = yield* Board.Service
      yield* board.project({ key: "PRS", name: "Pulls", github_repo: "acme/widgets", reason: "Start." })
      yield* board.issue({ project: "PRS", title: "Code", seat: "backend", reason: "Plan." })
      yield* board.issue({ project: "PRS", title: "Held", seat: "backend", reason: "Plan." })
      yield* board.issue({ project: "PRS", title: "Gone", seat: "backend", reason: "Plan." })
      yield* Effect.forEach([1, 2, 3], (number) => board.move({ project: "PRS", number, stage: "building", reason: "Dispatched." }))
      yield* board.issue({ project: "PRS", number: 1, pr: 11, crash_reason: "Stalled twice.", reason: "PR is up." })
      yield* board.issue({ project: "PRS", number: 2, pr: 12, reason: "PR is up." })
      yield* board.issue({ project: "PRS", number: 3, pr: 13, reason: "PR is up." })
      yield* board.hold("PRS", 2, { hold: true })
      github.state.pulls = { 11: { state: "open", merged: false }, 12: { state: "closed", merged: true } }

      expect((yield* board.sync("PRS")).state).toBe("ok")
      const stages = () => board.snapshot("PRS").pipe(Effect.map((snapshot) => snapshot.issues.toSorted((a, b) => a.number - b.number).map((issue) => issue.stage)))
      // PR 13 does not exist on GitHub: its card stays and the sync still succeeds.
      expect(yield* stages()).toEqual(["review", "building", "building"])
      expect((yield* activity("PRS")).filter((row) => row.actor === "github" && row.action === "issue.move")).toEqual([
        expect.objectContaining({ reason: "PR #11 is open on GitHub." }),
      ])

      github.state.pulls[11] = { state: "closed", merged: true }
      yield* board.sync("PRS")
      expect(yield* stages()).toEqual(["shipped", "building", "building"])
      expect((yield* board.proof("PRS", 1)).crashReason).toBeNull()
      expect(github.state.issues.find((issue) => issue.body.includes("orchestra-board:PRS-1 "))).toMatchObject({
        state: "closed",
        state_reason: "completed",
      })

      yield* board.hold("PRS", 2, { hold: false })
      yield* board.pause("PRS", { reason: "Owner pause." })
      yield* board.sync("PRS")
      expect(yield* stages()).toEqual(["shipped", "building", "building"])
      yield* board.resume("PRS")
      yield* board.sync("PRS")
      expect(yield* stages()).toEqual(["shipped", "shipped", "building"])
    }),
  )

  it.live("a GitHub comment on a mirrored issue becomes a note, once", () =>
    Effect.gen(function* () {
      github.reset()
      const board = yield* Board.Service
      yield* board.project({ key: "COM", name: "Comments", github_repo: "acme/widgets", reason: "Start." })
      yield* board.issue({ project: "COM", title: "Talk", reason: "Plan." })
      yield* board.sync("COM")

      github.comment(1, "alice", "Have you tried turning it off?")
      github.comment(7, "bob", "On an issue the board does not track.")
      yield* board.sync("COM")
      yield* board.sync("COM")

      expect((yield* board.issuePage("COM", 1)).notes).toEqual([
        expect.objectContaining({ author: "github:alice", body: "Have you tried turning it off?" }),
      ])
    }),
  )

  it.live("a GitHub edit is overwritten by the board, logged as github.overwrite, and undo takes GitHub's text", () =>
    Effect.gen(function* () {
      github.reset()
      const board = yield* Board.Service
      yield* board.project({ key: "OVR", name: "Overwrite", github_repo: "acme/widgets", reason: "Start." })
      yield* board.issue({ project: "OVR", title: "Board title", body: "Board body", reason: "Plan." })
      yield* board.sync("OVR")

      github.edit(1, { title: "GitHub title" })
      yield* board.sync("OVR")
      expect(github.state.issues[0]?.title).toBe("Board title")
      const overwrite = (yield* activity("OVR")).find((row) => row.action === "github.overwrite")
      expect(overwrite).toMatchObject({ actor: "github", before: { title: "GitHub title" }, after: { title: "Board title" } })

      yield* board.undo("OVR", overwrite!.id)
      expect((yield* board.snapshot("OVR")).issues[0]?.title).toBe("GitHub title")
      yield* board.sync("OVR")
      expect(github.state.issues[0]?.title).toBe("GitHub title")
      expect((yield* activity("OVR")).filter((row) => row.action === "github.overwrite")).toHaveLength(1)
    }),
  )

  it.live("a close or reopen on GitHub asks Maestro and is never applied silently", () =>
    Effect.gen(function* () {
      github.reset()
      const board = yield* Board.Service
      yield* board.project({ key: "CLS", name: "Close", github_repo: "acme/widgets", reason: "Start." })
      yield* board.issue({ project: "CLS", title: "Still open here", reason: "Plan." })
      yield* board.sync("CLS")

      github.edit(1, { state: "closed" })
      yield* board.sync("CLS")
      const snapshot = yield* board.snapshot("CLS")
      expect(snapshot.issues[0]?.stage).toBe("backlog")
      expect(snapshot.questions).toHaveLength(1)
      expect(snapshot.questions[0]).toMatchObject({ blocking: false, recommended: "keep" })
      expect(snapshot.questions[0]?.text).toContain("closed on GitHub")
      // The board's stage stands, so GitHub is put back.
      expect(github.state.issues[0]?.state).toBe("open")

      yield* board.move({ project: "CLS", number: 1, stage: "shipped", reason: "Done." })
      yield* board.sync("CLS")
      github.edit(1, { state: "open" })
      yield* board.sync("CLS")
      expect((yield* board.snapshot("CLS")).questions.map((question) => question.text)).toEqual([
        expect.stringContaining("closed on GitHub"),
        expect.stringContaining("reopened on GitHub"),
      ])
      expect((yield* board.snapshot("CLS")).issues[0]?.stage).toBe("shipped")
    }),
  )

  it.live("signed out, rate limited and errors are shown as facts, the board keeps working, and a retry recovers", () =>
    Effect.gen(function* () {
      github.reset()
      const board = yield* Board.Service
      yield* board.project({ key: "OFF", name: "Offline", github_repo: "acme/widgets", reason: "Start." })
      yield* board.issue({ project: "OFF", title: "Keep going", reason: "Plan." })

      github.state.mode = "signed_out"
      const out = yield* board.sync("OFF")
      expect(out.state).toBe("signed_out")
      expect(out.error).toContain("not signed in")
      expect((yield* board.snapshot("OFF")).project).toMatchObject({ githubState: "signed_out", githubError: out.error })
      yield* board.issue({ project: "OFF", title: "Written while offline", reason: "Plan." })
      yield* board.sync("OFF")
      expect((yield* activity("OFF")).filter((row) => row.action === "github.state")).toHaveLength(1)

      github.state.mode = "rate_limited"
      expect((yield* board.sync("OFF")).state).toBe("rate_limited")

      github.state.mode = "leak"
      const failed = yield* board.sync("OFF")
      expect(failed.state).toBe("error")
      expect(failed.error).not.toContain("ghp_")
      expect(failed.error).not.toContain("github_pat_")

      github.state.mode = "ok"
      expect(yield* board.sync("OFF")).toEqual({ state: "ok", error: null })
      expect(github.state.issues.map((issue) => issue.title)).toEqual(["Keep going", "Written while offline"])
      expect((yield* board.snapshot("OFF")).project).toMatchObject({ githubState: "ok", githubError: null })
    }),
  )

  it.live("asks GitHub with the stored ETag and treats 304 as nothing new", () =>
    Effect.gen(function* () {
      github.reset()
      const board = yield* Board.Service
      yield* board.project({ key: "TAG", name: "Etag", github_repo: "acme/widgets", reason: "Start." })
      yield* board.issue({ project: "TAG", title: "One", reason: "Plan." })
      yield* board.sync("TAG")
      yield* board.sync("TAG")
      const before = github.state.notModified
      yield* board.sync("TAG")
      expect(github.state.notModified).toBeGreaterThan(before)
      expect(github.state.calls.some((call) => call.args.includes("-H"))).toBe(true)
      expect(yield* board.sync("TAG")).toEqual({ state: "ok", error: null })
    }),
  )

  it.live("sync refuses a project without a repository and one that does not exist", () =>
    Effect.gen(function* () {
      github.reset()
      const board = yield* Board.Service
      yield* board.project({ key: "NOR", name: "No repo", reason: "Start." })
      expect((yield* Effect.flip(board.sync("NOR"))).message).toContain("no GitHub repository")
      expect(yield* Effect.flip(board.sync("NOPE"))).toBeInstanceOf(Board.NotFoundError)
      expect(github.state.calls).toEqual([])
    }),
  )
})

function activity(key: string) {
  return Effect.gen(function* () {
    const database = yield* Database.Service
    const board = yield* Board.Service
    const project = (yield* board.snapshot(key)).project
    return yield* database.db
      .select()
      .from(BoardActivityTable)
      .where(eq(BoardActivityTable.project_id, project.id))
      .orderBy(BoardActivityTable.id)
      .all()
      .pipe(Effect.orDie)
  })
}
