export * as BoardMoney from "./money"

import { and, asc, eq, inArray, ne, or, sql } from "drizzle-orm"
import { Clock, Effect } from "effect"
import { Board } from "@orchestra/schema/board"
import { SessionTable } from "../session/sql"
import { BoardCiRunTable, BoardIssueTable, BoardProjectTable, BoardQuestionTable } from "./sql"
import { BoardForecast } from "./forecast"
import { BoardSpend } from "./spend"
import { BudgetPausedError, RefusedError, archived, changed, diff, forecastOf, loadProject, log, numbers } from "./shared"
import type { IssueRow, ProjectRow, Tx } from "./shared"

// Money on the board: spend, the 90% budget question, the budget pause and the project settings.

export const report = Effect.fnUntraced(function* (tx: Tx, key: string) {
  const project = yield* loadProject(tx, key)
  const forecast = yield* forecastOf(tx, project)
  return yield* spendOf(tx, project, forecast.project.forecast)
})

// Spend reads rows only: session cost and the CI minutes the poll cached. `forecast` null leaves the finish unknown.
export const spendOf = Effect.fnUntraced(function* (tx: Tx, project: ProjectRow, forecast: Board.Forecast | null) {
  const issues = yield* tx
    .select()
    .from(BoardIssueTable)
    .where(and(eq(BoardIssueTable.project_id, project.id), ne(BoardIssueTable.stage, "cut")))
    .orderBy(asc(BoardIssueTable.number))
    .all()
  const known = yield* numbers(tx, project)
  const linked = issues.flatMap((row) => (row.session_id ? [row.session_id] : []))
  const ids = linked as (typeof SessionTable.$inferSelect)["id"][]
  const sessions =
    linked.length === 0
      ? []
      : yield* tx
          .select({
            id: SessionTable.id,
            parent: SessionTable.parent_id,
            cost: SessionTable.cost,
            model: SessionTable.model,
            tokens:
              sql<number>`${SessionTable.tokens_input} + ${SessionTable.tokens_output} + ${SessionTable.tokens_reasoning} + ${SessionTable.tokens_cache_read} + ${SessionTable.tokens_cache_write}`,
          })
          .from(SessionTable)
          .where(or(inArray(SessionTable.id, ids), inArray(SessionTable.parent_id, ids)))
          .all()
  const runs = yield* tx
    .select({ issue: BoardCiRunTable.issue_id, usd: sql<number>`sum(${BoardCiRunTable.cost_usd})` })
    .from(BoardCiRunTable)
    .where(eq(BoardCiRunTable.project_id, project.id))
    .groupBy(BoardCiRunTable.issue_id)
    .all()
  const spends = issues.map((row) => {
    const own = sessions.filter((item) => row.session_id !== null && (item.id === row.session_id || item.parent === row.session_id))
    const ci: BoardSpend.Ci =
      !row.pr_number || !project.github_repo
        ? { kind: "none" }
        : project.ci_synced_at === null
          ? { kind: "pending" }
          : { kind: "ok", usd: runs.find((item) => item.issue === row.id)?.usd ?? 0 }
    return BoardSpend.card({
      sessions: own.map((item) => ({ model: item.model?.id ?? null, provider: item.model?.providerID ?? null, cost: item.cost, tokens: item.tokens })),
      ci,
    })
  })
  const epicOf = (row: IssueRow) => (row.epic_id ? (known.epics.get(row.epic_id) ?? null) : null)
  const flagged = BoardSpend.flags(issues.map((row, index) => ({ epic: epicOf(row), spend: spends[index]! })))
  const cards = issues.map(
    (row, index): Board.CardSpend => ({
      ...spends[index]!,
      issue: row.number,
      ref: `${project.key}-${row.number}`,
      epic: epicOf(row),
      seat: row.seat,
      flagged: flagged[index]!.flagged,
      epicMedianUsd: flagged[index]!.median,
    }),
  )
  const epics = Array.from(new Set(cards.flatMap((card) => (card.epic === null ? [] : [card.epic]))))
    .toSorted((a, b) => a - b)
    .map((number): Board.EpicSpend => ({ ...BoardSpend.total(cards.filter((card) => card.epic === number)), epic: number, ref: `${project.key}-E${number}` }))
  const seats = Array.from(new Set(cards.flatMap((card) => (card.seat === null ? [] : [card.seat]))))
    .toSorted()
    .map((seat): Board.SeatSpend => ({ ...BoardSpend.total(cards.filter((card) => card.seat === seat)), seat }))
  const total = BoardSpend.total(spends)
  const now = yield* Clock.currentTimeMillis
  return {
    project: total,
    budget: BoardSpend.budget({
      budgetUsd: project.budget_usd,
      spentUsd: total.usd,
      forecastUsd: forecast ? BoardSpend.finish({ spentUsd: total.usd, since: project.time_created, now, forecast }) : null,
    }),
    cards,
    epics,
    seats,
    infraSyncedAt: project.ci_synced_at,
  } satisfies Board.SpendReport
})

// Persists how many evaluations in a row put P50 past the target date, and raises the one pre-emptive budget
// question when the forecast finish crosses 90% of the budget. Returns the activity of a question it raised.
export const evaluate = Effect.fnUntraced(function* (tx: Tx, id: string) {
  const project = yield* tx.select().from(BoardProjectTable).where(eq(BoardProjectTable.id, id as Board.ProjectID)).get()
  if (!project) return undefined
  const forecast = yield* forecastOf(tx, project)
  const streak = BoardForecast.late(forecast.project) ? project.forecast_late_streak + 1 : 0
  if (streak !== project.forecast_late_streak)
    yield* tx.update(BoardProjectTable).set({ forecast_late_streak: streak }).where(eq(BoardProjectTable.id, project.id)).run()
  if (project.budget_usd === null || project.status === "archived" || forecast.project.forecast.kind === "done") return undefined
  const budget = (yield* spendOf(tx, project, forecast.project.forecast)).budget
  if (budget.forecastUsd === null || budget.forecastPercent === null || budget.forecastPercent < BoardSpend.QUESTION * 100) return undefined
  // One question per budget figure: raising the budget makes a new one possible, answering never re-asks.
  const kind = `budget:${project.budget_usd}`
  const asked = yield* tx
    .select({ id: BoardQuestionTable.id })
    .from(BoardQuestionTable)
    .where(and(eq(BoardQuestionTable.project_id, project.id), eq(BoardQuestionTable.kind, kind)))
    .get()
  if (asked) return undefined
  const question = Board.QuestionID.create()
  const text = `${project.key} is forecast to spend about $${budget.forecastUsd.toFixed(2)} by its finish, ${Math.round(budget.forecastPercent)}% of its $${project.budget_usd.toFixed(2)} budget. What should happen?`
  const options = [
    { id: "raise", label: "Raise the budget", consequence: "Work continues; set the new amount in the project settings." },
    { id: "cut", label: "Cut scope to fit", consequence: "Maestro proposes which cards to cut; the budget stays." },
    { id: "continue", label: "Keep going as is", consequence: "Work continues until 100%, then new work stops." },
  ]
  yield* tx
    .insert(BoardQuestionTable)
    .values({
      id: question,
      project_id: project.id,
      issue_id: null,
      epic_id: null,
      text,
      options,
      recommended: "cut",
      cost_of_waiting: "At 100% of the budget the board stops starting new work.",
      kind,
      blocking: false,
      status: "open",
    })
    .run()
  return yield* log(tx, {
    project: project.id,
    actor: "maestro",
    action: "question.ask",
    reason: "The forecast finish crossed 90% of the budget.",
    after: {
      id: question,
      epic_id: null,
      text,
      options,
      recommended: "cut",
      cost_of_waiting: "At 100% of the budget the board stops starting new work.",
      kind,
      blocking: false,
    },
  })
})

/** A project at its whole budget starts no new work; a card already building keeps going. */
export const requireRoom = Effect.fnUntraced(function* (tx: Tx, project: ProjectRow, issue: IssueRow, stage: Board.Stage, ref: string) {
  if (stage !== "building" || issue.stage === "building" || project.budget_usd === null) return
  const budget = (yield* spendOf(tx, project, null)).budget
  if (budget.state !== "paused") return
  return yield* new BudgetPausedError({
    message: `${project.key} has spent $${budget.spentUsd.toFixed(2)} of its $${project.budget_usd.toFixed(2)} budget, so no new work starts; ${ref} stays where it is. Work in progress continues. Ask the owner to raise the budget.`,
  })
})

export const settings = Effect.fnUntraced(function* (
  tx: Tx,
  key: string,
  input: { readonly target_date?: number | null; readonly budget_usd?: number | null; readonly reason?: string },
  actor: "owner" | "maestro",
) {
  const project = yield* loadProject(tx, key)
  if (project.status === "archived") return yield* archived(project)
  const change = diff(project, { target_date: input.target_date, budget_usd: input.budget_usd })
  if (!change) return yield* new RefusedError({ message: `Nothing to change on ${key}.` })
  yield* tx.update(BoardProjectTable).set(change.after).where(eq(BoardProjectTable.id, project.id)).run()
  const activity = yield* log(tx, {
    project: project.id,
    actor,
    action: "project.upsert",
    reason: input.reason ?? null,
    ...change,
  })
  return { result: { activity }, changed: changed(project.id, activity) }
})
