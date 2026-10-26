import { describe, expect } from "bun:test"
import { Effect, Exit } from "effect"
import { Board } from "@orchestra/core/board/board"
import { Database } from "@orchestra/core/database/database"
import { AppNodeBuilder } from "@orchestra/core/effect/app-node-builder"
import { makeGlobalNode } from "@orchestra/core/effect/app-node"
import { LayerNode } from "@orchestra/core/effect/layer-node"
import { EventV2 } from "@orchestra/core/event"
import { Credential } from "@orchestra/core/credential"
import { Global } from "@orchestra/core/global"
import { AppProcess } from "@orchestra/core/process"
import { Project } from "@orchestra/core/project"
import { ProjectTable } from "@orchestra/core/project/sql"
import { AbsolutePath } from "@orchestra/core/schema"
import { SessionTable } from "@orchestra/core/session/sql"
import { SessionV2 } from "@orchestra/core/session"
import { testEffect } from "./lib/effect"

const it = testEffect(
  AppNodeBuilder.build(LayerNode.group([Board.node, Database.node, EventV2.node, Credential.node]), [
    [
      Board.node,
      makeGlobalNode({
        service: Board.Service,
        layer: Board.layerWith({ env: { PATH: "/nonexistent" } }),
        deps: [Database.node, EventV2.node, Credential.node, AppProcess.node, Global.node],
      }),
    ],
  ]),
)

const options = [
  { id: "a", label: "Option A", consequence: "Does A." },
  { id: "b", label: "Option B", consequence: "Does B." },
]

describe("Board spend, budget and decisions", () => {
  it.live("settings set, clear and refuse a no-op, and log the change", () =>
    Effect.gen(function* () {
      const board = yield* Board.Service
      yield* board.project({ key: "SET", name: "Settings", reason: "Start." })
      yield* board.settings("SET", { budget_usd: 40, target_date: 1_900_000_000_000 }, "owner")
      const project = (yield* board.snapshot("SET")).project
      expect(project).toMatchObject({ budgetUsd: 40, targetDate: 1_900_000_000_000 })
      expect(Exit.isFailure(yield* Effect.exit(board.settings("SET", { budget_usd: 40 }, "owner")))).toBe(true)
      yield* board.settings("SET", { budget_usd: null, reason: "No cap." }, "maestro")
      expect((yield* board.snapshot("SET")).project.budgetUsd).toBeNull()
    }),
  )

  it.live("spend reports session cost per card and says not-metered without a session", () =>
    Effect.gen(function* () {
      const board = yield* Board.Service
      yield* board.project({ key: "SPD", name: "Spend", reason: "Start." })
      yield* board.issue({ project: "SPD", title: "Priced", session: "ses_spend_one", reason: "Plan." })
      yield* board.issue({ project: "SPD", title: "Bare", reason: "Plan." })
      yield* session("ses_spend_one", 2.5, { id: "gpt-x", providerID: "openai" })
      yield* session("ses_spend_child", 0.5, { id: "gpt-x", providerID: "openai" }, "ses_spend_one")
      const report = yield* board.spend("SPD")
      expect(report.cards.find((card) => card.issue === 1)?.models).toEqual({ kind: "usd", usd: 3 })
      expect(report.cards.find((card) => card.issue === 2)?.models).toEqual({ kind: "not-metered", source: "no session linked" })
      expect(report.project.usd).toBe(3)
      expect(report.budget.state).toBe("none")
    }),
  )

  it.live("at 100% of the budget new work is refused, work in flight is not", () =>
    Effect.gen(function* () {
      const board = yield* Board.Service
      yield* board.project({ key: "BUD", name: "Budget", reason: "Start." })
      yield* board.issue({ project: "BUD", title: "Running", session: "ses_budget_one", reason: "Plan." })
      yield* board.issue({ project: "BUD", title: "Waiting", reason: "Plan." })
      yield* board.move({ project: "BUD", number: 1, stage: "building", reason: "Start." })
      yield* board.settings("BUD", { budget_usd: 10 }, "owner")
      yield* session("ses_budget_one", 9, { id: "m", providerID: "openai" })
      expect((yield* board.spend("BUD")).budget.state).toBe("warn")
      yield* session("ses_budget_two", 1.5, { id: "m", providerID: "openai" }, "ses_budget_one")
      expect((yield* board.spend("BUD")).budget.state).toBe("paused")

      const refused = yield* Effect.flip(board.move({ project: "BUD", number: 2, stage: "building", reason: "Next." }))
      expect(refused._tag).toBe("Board.BudgetPausedError")
      // The running card keeps its stage.
      expect((yield* board.snapshot("BUD")).issues.find((item) => item.number === 1)?.stage).toBe("building")
      yield* board.settings("BUD", { budget_usd: 100 }, "owner")
      yield* board.move({ project: "BUD", number: 2, stage: "building", reason: "Next." })
    }),
  )

  it.live("an answered question becomes a decision; overturning keeps both, linked", () =>
    Effect.gen(function* () {
      const board = yield* Board.Service
      yield* board.project({ key: "DEC", name: "Decisions", reason: "Start." })
      yield* board.issue({ project: "DEC", title: "Pick", reason: "Plan." })
      yield* board.question({ action: "ask", project: "DEC", issue: 1, text: "A or B?", options, recommended: "a", reason: "Blocks." })
      const question = (yield* board.snapshot("DEC")).questions[0]!
      yield* board.answer("DEC", question.id, { option: "b" })

      const first = (yield* board.decisions("DEC"))[0]!
      expect(first).toMatchObject({
        issue: 1,
        question: "A or B?",
        recommended: "a",
        chosen: "b",
        chosenLabel: "Option B",
        answeredBy: "owner",
        outcome: "applied, no result yet",
        supersedes: null,
        overturnedBy: null,
      })

      yield* board.decisionOutcome({ project: "DEC", id: question.id, outcome: "B shipped in the first week.", reason: "It landed." })
      expect((yield* board.decisions("DEC"))[0]?.outcome).toBe("B shipped in the first week.")

      yield* board.changeDecision("DEC", first.id, { option: "a", text: "On reflection A." })
      const all = yield* board.decisions("DEC")
      expect(all).toHaveLength(2)
      const current = all.find((item) => item.supersedes === first.id)!
      expect(current).toMatchObject({ chosen: "a", text: "On reflection A.", overturnedBy: null })
      expect(all.find((item) => item.id === first.id)?.overturnedBy).toBe(current.id)
      expect(Exit.isFailure(yield* Effect.exit(board.changeDecision("DEC", first.id, { option: "b" })))).toBe(true)
      expect(Exit.isFailure(yield* Effect.exit(board.changeDecision("DEC", current.id, { option: "zzz" })))).toBe(true)
      // The card names the decision that moved it.
      expect((yield* board.proof("DEC", 1)).decidedBy?.id).toBe(current.id)
    }),
  )

  it.live("proof shows attempts and the crash reason, and no PR for a card without one", () =>
    Effect.gen(function* () {
      const board = yield* Board.Service
      yield* board.project({ key: "PRF", name: "Proof", reason: "Start." })
      yield* board.issue({ project: "PRF", title: "Flaky", attempts: 2, crash_reason: "Out of memory.", guardrail_rule: "no-secrets", reason: "Plan." })
      const proof = yield* board.proof("PRF", 1)
      expect(proof).toMatchObject({ ref: "PRF-1", pr: null, ci: null, attempts: { n: 2, of: 3 }, crashReason: "Out of memory." })
      expect(proof.guardrail?.rule).toBe("no-secrets")
      expect(proof.banner).toBeNull()
    }),
  )
})

function session(id: string, cost: number, model: { id: string; providerID: string }, parent?: string) {
  return Effect.gen(function* () {
    const database = yield* Database.Service
    yield* database.db
      .insert(ProjectTable)
      .values({ id: Project.ID.global, worktree: AbsolutePath.make("/project"), sandboxes: [] })
      .onConflictDoNothing()
      .run()
      .pipe(Effect.orDie)
    yield* database.db
      .insert(SessionTable)
      .values({
        id: SessionV2.ID.make(id),
        parent_id: parent ? SessionV2.ID.make(parent) : undefined,
        project_id: Project.ID.global,
        slug: id,
        directory: "/project",
        title: id,
        version: "test",
        cost,
        tokens_input: 1000,
        model,
      })
      .run()
      .pipe(Effect.orDie)
  })
}
