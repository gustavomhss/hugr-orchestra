export * as Board from "./board"

import fs from "fs/promises"
import path from "path"
import { and, asc, desc, eq, gt, inArray, isNull, ne, or, sql } from "drizzle-orm"
import { EffectDrizzleQueryError } from "drizzle-orm/effect-core/errors"
import { Clock, Context, Effect, Layer, Schedule, Schema } from "effect"
import { SqlError } from "effect/unstable/sql/SqlError"
import { Board } from "@orchestra/schema/board"
import { Integration } from "@orchestra/schema/integration"
import { Credential } from "../credential"
import { CredentialTable } from "../credential/sql"
import { Database } from "../database/database"
import { makeGlobalNode } from "../effect/app-node"
import { EventV2 } from "../event"
import { Global } from "../global"
import { Guardrail } from "../guardrail"
import { AppProcess } from "../process"
import { ProjectSchema } from "../project/schema"
import { ProjectTable } from "../project/sql"
import { PullRequest } from "../pull-request"
import { AbsolutePath } from "../schema"
import { SessionTable } from "../session/sql"
import {
  BoardActivityTable,
  BoardAttachmentTable,
  BoardCiRunTable,
  BoardDecisionTable,
  BoardDependencyTable,
  BoardEpicTable,
  BoardIssueTable,
  BoardNoteTable,
  BoardProjectTable,
  BoardQuestionTable,
  BoardStepTable,
} from "./sql"
import { BoardForecast } from "./forecast"
import { BoardSpend } from "./spend"
import { BoardGithub } from "./github"

// The board service enforces the contract's rules (docs/specs/projects-board/CONTRACT.md section 1). Every write runs
// in one immediate transaction that also appends its activity row, then publishes `board.changed` after commit.

/** A board project, epic, issue, question or activity row that does not exist. */
export class NotFoundError extends Schema.TaggedErrorClass<NotFoundError>()("Board.NotFoundError", {
  message: Schema.String,
}) {}

/** A write the contract refuses. The message says what to do instead. */
export class RefusedError extends Schema.TaggedErrorClass<RefusedError>()("Board.RefusedError", {
  message: Schema.String,
}) {}

/** The project spent its whole budget: the board starts no new work until the owner raises it. In-flight work continues. */
export class BudgetPausedError extends Schema.TaggedErrorClass<BudgetPausedError>()("Board.BudgetPausedError", {
  message: Schema.String,
}) {}

export type Error = NotFoundError | RefusedError | BudgetPausedError

export interface Interface {
  /** Archived projects are left out unless `archived` is true. */
  readonly summaries: (options?: { readonly archived?: boolean }) => Effect.Effect<Board.Summary[]>
  readonly snapshot: (key: string) => Effect.Effect<Board.Snapshot, NotFoundError>
  readonly read: (input: Board.ReadInput) => Effect.Effect<Board.Read, NotFoundError>
  readonly issuePage: (key: string, number: number) => Effect.Effect<Board.IssuePage, NotFoundError>
  /** Spend per card, epic, seat and project from session cost and cached CI minutes; never fetches GitHub. */
  readonly spend: (key: string) => Effect.Effect<Board.SpendReport, NotFoundError>
  /** Every answered question, newest first. */
  readonly decisions: (key: string) => Effect.Effect<Board.Decision[], NotFoundError>
  /** What backs a card's status: PR, checks, attempts, guardrail result, crash reason and when it was verified. */
  readonly proof: (key: string, number: number) => Effect.Effect<Board.Proof, NotFoundError>
  readonly activity: (key: string, since?: string) => Effect.Effect<Board.Activity[], NotFoundError>
  readonly project: (input: Board.ProjectInput) => Effect.Effect<Board.WriteResult, Error>
  readonly epic: (input: Board.EpicInput) => Effect.Effect<Board.WriteResult, Error>
  readonly issue: (input: Board.IssueInput) => Effect.Effect<Board.WriteResult, Error>
  readonly move: (input: Board.MoveInput) => Effect.Effect<Board.WriteResult, Error>
  readonly steps: (input: Board.StepsInput) => Effect.Effect<Board.WriteResult, Error>
  readonly question: (input: Board.QuestionInput) => Effect.Effect<Board.WriteResult, Error>
  readonly answer: (key: string, id: string, input: Board.AnswerInput) => Effect.Effect<Board.OwnerResult, Error>
  /** The owner overturns an earlier answer; the old decision stays, linked to the new one. */
  readonly changeDecision: (key: string, id: string, input: Board.DecisionChangeInput) => Effect.Effect<Board.OwnerResult, Error>
  /** Maestro records what came of a decision. */
  readonly decisionOutcome: (input: Board.DecisionOutcomeInput) => Effect.Effect<Board.OwnerResult, Error>
  /** Target date and budget; omitted fields stay, null clears one. */
  readonly settings: (
    key: string,
    input: { readonly target_date?: number | null; readonly budget_usd?: number | null; readonly reason?: string },
    actor: "owner" | "maestro",
  ) => Effect.Effect<Board.OwnerResult, Error>
  readonly note: (key: string, number: number, input: Board.NoteInput) => Effect.Effect<Board.OwnerResult, Error>
  readonly attach: (key: string, number: number, input: Board.AttachmentInput) => Effect.Effect<Board.OwnerResult, Error>
  /** Owner notes only; GitHub and Maestro notes stay as written. */
  readonly editNote: (key: string, number: number, id: string, input: Board.NoteInput) => Effect.Effect<Board.OwnerResult, Error>
  readonly deleteNote: (key: string, number: number, id: string) => Effect.Effect<Board.OwnerResult, Error>
  /** A secret's credential row goes with it; a file's stored copy is removed after commit. */
  readonly removeAttachment: (key: string, number: number, id: string) => Effect.Effect<Board.OwnerResult, Error>
  readonly undo: (key: string, id: string) => Effect.Effect<Board.OwnerResult, Error>
  readonly pause: (key: string, input: Board.PauseInput) => Effect.Effect<Board.OwnerResult, Error>
  readonly resume: (key: string) => Effect.Effect<Board.OwnerResult, Error>
  /** Only a shipped or paused project; unarchive brings it back paused. */
  readonly archive: (key: string) => Effect.Effect<Board.OwnerResult, Error>
  readonly unarchive: (key: string) => Effect.Effect<Board.OwnerResult, Error>
  readonly pauseIssue: (key: string, number: number) => Effect.Effect<Board.OwnerResult, Error>
  readonly resumeIssue: (key: string, number: number) => Effect.Effect<Board.OwnerResult, Error>
  readonly hold: (key: string, number: number, input: Board.HoldInput) => Effect.Effect<Board.OwnerResult, Error>
  readonly accept: (key: string, number: number) => Effect.Effect<Board.OwnerResult, Error>
  readonly decline: (key: string, number: number) => Effect.Effect<Board.OwnerResult, Error>
  /** Pulls from GitHub, pushes dirty cards and reports the sync state; the manual retry and the 60 second poll. */
  readonly sync: (key: string) => Effect.Effect<Board.GithubSync, Error>
}

export class Service extends Context.Service<Service, Interface>()("@orchestra/Board") {}

type Tx = Parameters<Parameters<Database.Interface["db"]["transaction"]>[0]>[0]
type ProjectRow = typeof BoardProjectTable.$inferSelect
type IssueRow = typeof BoardIssueTable.$inferSelect
type ActivityRow = typeof BoardActivityTable.$inferSelect
type QuestionRow = typeof BoardQuestionTable.$inferSelect
type DecisionRow = typeof BoardDecisionTable.$inferSelect
type Fields = Record<string, unknown>
type Changed = { readonly project: string; readonly issue?: string; readonly activity: string }

const TRAIL_MS = 30_000
const ATTEMPTS = 3
// Fields GitHub mirrors (slice B2); changing one marks the issue for the next push.
const MIRRORED = ["title", "body", "type", "epic_id", "stage", "steps"]
const UNDOABLE = ["issue.update", "issue.move", "steps.set", "epic.upsert", "question.withdraw"]
const ISSUE_COLUMNS = ["title", "body", "type", "epic_id", "estimate", "seat", "session_id", "branch", "pr_number", "stage", "position", "stage_entered_at", "attempts", "crash_reason", "guardrail_rule"]
const EPIC_COLUMNS = ["title", "goal", "position", "status"]

/** `gh` replaces the GitHub runner (tests inject recorded responses); `poll` starts the 60 second sync of every mirrored project. */
export const layerWith = (options: { readonly env?: NodeJS.ProcessEnv; readonly gh?: BoardGithub.Gh; readonly poll?: boolean }) =>
  Layer.effect(
    Service,
    Effect.gen(function* () {
      const database = yield* Database.Service
      const events = yield* EventV2.Service
      const credentials = yield* Credential.Service
      const proc = yield* AppProcess.Service
      const global = yield* Global.Service
      const db = database.db
      const cache = new Map<string, { readonly at: number; readonly trail: Board.Trail }>()

      const quiet = <A, E>(work: (tx: Tx) => Effect.Effect<A, E>) =>
        db.transaction(work, { behavior: "immediate" }).pipe(dieOnStorage)

      // Every committed board write is one forecast evaluation of its project; GitHub mirror writes are not.
      const write = <A extends { readonly changed: Changed }, E>(work: (tx: Tx) => Effect.Effect<A, E>) =>
        quiet((tx) => work(tx).pipe(Effect.tap((result) => evaluate(tx, result.changed.project)))).pipe(
          Effect.tap((result) => events.publish(Board.Event.Changed, result.changed)),
        )

      const reading = <A, E>(work: (tx: Tx) => Effect.Effect<A, E>) =>
        db.transaction(work).pipe(dieOnStorage)

      const loadProject = Effect.fnUntraced(function* (tx: Tx, key: string) {
        const row = yield* tx.select().from(BoardProjectTable).where(eq(BoardProjectTable.key, key)).get()
        if (!row) return yield* new NotFoundError({ message: `There is no board project ${key}.` })
        return row
      })

      const loadIssue = Effect.fnUntraced(function* (tx: Tx, project: ProjectRow, number: number) {
        const row = yield* tx
          .select()
          .from(BoardIssueTable)
          .where(and(eq(BoardIssueTable.project_id, project.id), eq(BoardIssueTable.number, number)))
          .get()
        if (!row) return yield* new NotFoundError({ message: `${project.key}-${number} does not exist.` })
        return row
      })

      const loadEpic = Effect.fnUntraced(function* (tx: Tx, project: ProjectRow, number: number) {
        const row = yield* tx
          .select()
          .from(BoardEpicTable)
          .where(and(eq(BoardEpicTable.project_id, project.id), eq(BoardEpicTable.number, number)))
          .get()
        if (!row) return yield* new NotFoundError({ message: `${project.key}-E${number} does not exist.` })
        return row
      })

      const log = Effect.fnUntraced(function* (
        tx: Tx,
        input: {
          readonly project: Board.ProjectID
          readonly issue?: Board.IssueID | null
          readonly actor: Board.Actor
          readonly action: Board.Action
          readonly reason?: string | null
          readonly before?: Fields | null
          readonly after?: Fields | null
          readonly undoes?: Board.ActivityID
        },
      ) {
        const id = Board.ActivityID.create()
        yield* tx
          .insert(BoardActivityTable)
          .values({
            id,
            project_id: input.project,
            issue_id: input.issue ?? null,
            actor: input.actor,
            action: input.action,
            reason: input.reason ?? null,
            before: input.before ?? null,
            after: input.after ?? null,
            undoes: input.undoes ?? null,
          })
          .run()
        return id
      })

      const numbers = Effect.fnUntraced(function* (tx: Tx, project: ProjectRow) {
        const issues = yield* tx
          .select({ id: BoardIssueTable.id, number: BoardIssueTable.number })
          .from(BoardIssueTable)
          .where(eq(BoardIssueTable.project_id, project.id))
          .all()
        const epics = yield* tx
          .select({ id: BoardEpicTable.id, number: BoardEpicTable.number })
          .from(BoardEpicTable)
          .where(eq(BoardEpicTable.project_id, project.id))
          .all()
        return {
          issues: new Map<string, number>(issues.map((row) => [row.id, row.number])),
          epics: new Map<string, number>(epics.map((row) => [row.id, row.number])),
        }
      })

      const issueRecords = Effect.fnUntraced(function* (tx: Tx, project: ProjectRow, rows: IssueRow[]) {
        if (rows.length === 0) return []
        const ids = rows.map((row) => row.id)
        const known = yield* numbers(tx, project)
        const steps = yield* tx
          .select()
          .from(BoardStepTable)
          .where(inArray(BoardStepTable.issue_id, ids))
          .orderBy(asc(BoardStepTable.position))
          .all()
        const dependencies = yield* refs(tx, "depends", ids)
        return rows.map(
          (row): Board.Issue => ({
            id: row.id,
            number: row.number,
            ref: `${project.key}-${row.number}`,
            epic: row.epic_id ? (known.epics.get(row.epic_id) ?? null) : null,
            title: row.title,
            body: row.body,
            type: row.type,
            stage: row.stage,
            position: row.position,
            estimate: row.estimate,
            seat: row.seat,
            sessionID: row.session_id,
            branch: row.branch,
            prNumber: row.pr_number,
            holdBeforeMerge: row.hold_before_merge,
            paused: row.paused,
            stageEnteredAt: row.stage_entered_at,
            githubNumber: row.github_number,
            steps: steps
              .filter((step) => step.issue_id === row.id)
              .map((step) => ({ title: step.title, status: step.status, now: step.now })),
            dependsOn: dependencies.filter((item) => item.issue === row.id).map((item) => item.ref),
          }),
        )
      })

      // "depends": what each issue waits on. "blocks": which issues wait on each one.
      const refs = Effect.fnUntraced(function* (tx: Tx, direction: "depends" | "blocks", ids: Board.IssueID[]) {
        const self = direction === "depends" ? BoardDependencyTable.issue_id : BoardDependencyTable.depends_on_id
        const other = direction === "depends" ? BoardDependencyTable.depends_on_id : BoardDependencyTable.issue_id
        const rows = yield* tx
          .select({ issue: self, key: BoardProjectTable.key, number: BoardIssueTable.number })
          .from(BoardDependencyTable)
          .innerJoin(BoardIssueTable, eq(BoardIssueTable.id, other))
          .innerJoin(BoardProjectTable, eq(BoardProjectTable.id, BoardIssueTable.project_id))
          .where(inArray(self, ids))
          .orderBy(asc(BoardProjectTable.key), asc(BoardIssueTable.number))
          .all()
        return rows.map((row) => ({ issue: row.issue, ref: `${row.key}-${row.number}` }))
      })

      const questionRecords = Effect.fnUntraced(function* (tx: Tx, project: ProjectRow, rows: QuestionRow[]) {
        const known = yield* numbers(tx, project)
        return rows.map((row) => toQuestion(row, known))
      })

      const worktree = Effect.fnUntraced(function* (tx: Tx, project: ProjectRow) {
        if (!project.repo_project_id) return null
        const row = yield* tx
          .select({ worktree: ProjectTable.worktree })
          .from(ProjectTable)
          .where(eq(ProjectTable.id, project.repo_project_id))
          .get()
        return row?.worktree ?? null
      })

      // Read live through the pull-request plumbing and never stored. Only good reads are cached, briefly.
      const trail = Effect.fnUntraced(function* (issue: IssueRow, directory: string | null, fresh: boolean) {
        if (!issue.pr_number || !directory) return { state: "none", branch: issue.branch } satisfies Board.Trail
        const key = `${directory}#${issue.pr_number}`
        const now = yield* Clock.currentTimeMillis
        const hit = cache.get(key)
        if (!fresh && hit && now - hit.at < TRAIL_MS) return hit.trail
        cache.delete(key)
        const pulls = yield* PullRequest.make({ directory, env: options.env }).pipe(
          Effect.provideService(AppProcess.Service, proc),
        )
        return yield* pulls.read(issue.pr_number).pipe(
          Effect.map(
            (pr): Board.Trail => ({
              state: "ok",
              branch: pr.branch,
              pr,
              verifiedAt: now,
              commits: pr.commits.map((commit) => ({ hash: commit.hash, message: commit.message, seat: issue.seat })),
            }),
          ),
          Effect.tap((value) => Effect.sync(() => cache.set(key, { at: now, trail: value }))),
          Effect.catchTag("PullRequest.HostError", (error) =>
            Effect.succeed<Board.Trail>(
              error.kind === "not_authenticated"
                ? { state: "signed_out", message: "GitHub is signed out; sign in with gh to see the git trail." }
                : { state: "error", message: error.message },
            ),
          ),
        )
      })

      const forecastOf = Effect.fnUntraced(function* (tx: Tx, project: ProjectRow) {
        const issues = yield* tx
          .select({
            id: BoardIssueTable.id,
            number: BoardIssueTable.number,
            epic: BoardIssueTable.epic_id,
            stage: BoardIssueTable.stage,
            enteredAt: BoardIssueTable.stage_entered_at,
            paused: BoardIssueTable.paused,
          })
          .from(BoardIssueTable)
          .where(eq(BoardIssueTable.project_id, project.id))
          .all()
        const epics = yield* tx
          .select()
          .from(BoardEpicTable)
          .where(and(eq(BoardEpicTable.project_id, project.id), ne(BoardEpicTable.status, "cut")))
          .orderBy(asc(BoardEpicTable.position), asc(BoardEpicTable.number))
          .all()
        const known = yield* numbers(tx, project)
        const blocked = yield* tx
          .select({ issue: BoardQuestionTable.issue_id })
          .from(BoardQuestionTable)
          .where(
            and(
              eq(BoardQuestionTable.project_id, project.id),
              eq(BoardQuestionTable.status, "open"),
              eq(BoardQuestionTable.blocking, true),
            ),
          )
          .all()
        const upstream =
          issues.length === 0
            ? []
            : yield* tx
                .select({ issue: BoardDependencyTable.issue_id, key: BoardProjectTable.key, number: BoardIssueTable.number, stage: BoardIssueTable.stage })
                .from(BoardDependencyTable)
                .innerJoin(BoardIssueTable, eq(BoardIssueTable.id, BoardDependencyTable.depends_on_id))
                .innerJoin(BoardProjectTable, eq(BoardProjectTable.id, BoardIssueTable.project_id))
                .where(inArray(BoardDependencyTable.issue_id, issues.map((row) => row.id)))
                .orderBy(asc(BoardProjectTable.key), asc(BoardIssueTable.number))
                .all()
        return BoardForecast.plan({
          items: issues.map((row) => {
            const dependency = upstream.find((item) => item.issue === row.id && item.stage !== "shipped" && item.stage !== "cut")
            return {
              epic: row.epic ? (known.epics.get(row.epic) ?? null) : null,
              stage: row.stage,
              enteredAt: row.enteredAt,
              waitsOn: dependency
                ? `${dependency.key}-${dependency.number}`
                : row.paused || blocked.some((item) => item.issue === row.id)
                  ? `${project.key}-${row.number}`
                  : null,
            }
          }),
          epics: epics.map((row) => ({ number: row.number, ref: `${project.key}-E${row.number}` })),
          targetDate: project.target_date,
          now: yield* Clock.currentTimeMillis,
        })
      })

      // Spend reads rows only: session cost and the CI minutes the poll cached. `forecast` null leaves the finish unknown.
      const spendOf = Effect.fnUntraced(function* (tx: Tx, project: ProjectRow, forecast: Board.Forecast | null) {
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
      const evaluate = Effect.fnUntraced(function* (tx: Tx, id: string) {
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
        yield* tx
          .insert(BoardQuestionTable)
          .values({
            id: question,
            project_id: project.id,
            issue_id: null,
            epic_id: null,
            text,
            options: [
              { id: "raise", label: "Raise the budget", consequence: "Work continues; set the new amount in the project settings." },
              { id: "cut", label: "Cut scope to fit", consequence: "Maestro proposes which cards to cut; the budget stays." },
              { id: "continue", label: "Keep going as is", consequence: "Work continues until 100%, then new work stops." },
            ],
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
          after: { id: question, text, blocking: false },
        })
      })

      const snapshotOf = Effect.fnUntraced(function* (tx: Tx, project: ProjectRow) {
        const epics = yield* tx
          .select()
          .from(BoardEpicTable)
          .where(eq(BoardEpicTable.project_id, project.id))
          .orderBy(asc(BoardEpicTable.position), asc(BoardEpicTable.number))
          .all()
        const issues = yield* tx
          .select()
          .from(BoardIssueTable)
          .where(eq(BoardIssueTable.project_id, project.id))
          .orderBy(asc(BoardIssueTable.stage), asc(BoardIssueTable.position), asc(BoardIssueTable.number))
          .all()
        const questions = yield* tx
          .select()
          .from(BoardQuestionTable)
          .where(and(eq(BoardQuestionTable.project_id, project.id), eq(BoardQuestionTable.status, "open")))
          .orderBy(asc(BoardQuestionTable.time_created))
          .all()
        const latest = yield* tx
          .select({ id: BoardActivityTable.id })
          .from(BoardActivityTable)
          .where(eq(BoardActivityTable.project_id, project.id))
          .orderBy(desc(BoardActivityTable.id))
          .limit(1)
          .get()
        const history = yield* tx
          .select({ issue: BoardActivityTable.issue_id, reason: BoardActivityTable.reason, after: BoardActivityTable.after, at: BoardActivityTable.time_created })
          .from(BoardActivityTable)
          .where(eq(BoardActivityTable.project_id, project.id))
          .orderBy(asc(BoardActivityTable.id))
          .all()
        const forecast = yield* forecastOf(tx, project)
        return {
          project: toProject(project),
          epics: epics.map((row) => toEpic(project.key, row)),
          issues: yield* issueRecords(tx, project, issues),
          questions: yield* questionRecords(tx, project, questions),
          cursor: latest?.id ?? null,
          forecast: forecast.project,
          epicForecasts: forecast.epics,
          scope: BoardForecast.scope(history),
        } satisfies Board.Snapshot
      })

      const activityOf = Effect.fnUntraced(function* (tx: Tx, project: ProjectRow, rows: ActivityRow[]) {
        const known = yield* numbers(tx, project)
        return rows.map((row) => toActivity(row, known.issues))
      })

      const pageOf = Effect.fnUntraced(function* (key: string, number: number) {
        const loaded = yield* reading((tx) =>
          Effect.gen(function* () {
            const project = yield* loadProject(tx, key)
            const row = yield* loadIssue(tx, project, number)
            const known = yield* numbers(tx, project)
            const questions = yield* tx
              .select()
              .from(BoardQuestionTable)
              .where(eq(BoardQuestionTable.issue_id, row.id))
              .orderBy(asc(BoardQuestionTable.time_created))
              .all()
            const notes = yield* tx
              .select()
              .from(BoardNoteTable)
              .where(eq(BoardNoteTable.issue_id, row.id))
              .orderBy(asc(BoardNoteTable.time_created), asc(BoardNoteTable.id))
              .all()
            const attachments = yield* tx
              .select()
              .from(BoardAttachmentTable)
              .where(eq(BoardAttachmentTable.issue_id, row.id))
              .orderBy(asc(BoardAttachmentTable.time_created), asc(BoardAttachmentTable.id))
              .all()
            const activity = yield* tx
              .select()
              .from(BoardActivityTable)
              .where(eq(BoardActivityTable.issue_id, row.id))
              .orderBy(asc(BoardActivityTable.id))
              .all()
            const issue = (yield* issueRecords(tx, project, [row]))[0]
            return {
              row,
              directory: yield* worktree(tx, project),
              page: {
                issue,
                questions: questions.map((item) => toQuestion(item, known)),
                notes: notes.map((item) => toNote(item, number)),
                attachments: attachments.map((item) => toAttachment(item, number)),
                activity: activity.map((item) => toActivity(item, known.issues)),
                dependencies: {
                  dependsOn: issue.dependsOn,
                  blocks: (yield* refs(tx, "blocks", [row.id])).map((item) => item.ref),
                },
              },
            }
          }),
        )
        return { ...loaded.page, trail: yield* trail(loaded.row, loaded.directory, false) } satisfies Board.IssuePage
      })

      // The plain-language summary of a guardrail rule from the checkout's own engine; null when it cannot be read.
      const ruleSummary = Effect.fnUntraced(function* (directory: string | null, rule: string) {
        if (!directory) return null
        const guard = yield* Guardrail.make({ directory, env: options.env }).pipe(Effect.provideService(AppProcess.Service, proc))
        return yield* guard.rules().pipe(
          Effect.map((found) => found.rules.find((item) => item.id === rule)?.summary ?? null),
          Effect.catchTag("Guardrail.EngineError", () => Effect.succeed(null)),
        )
      })

      const requireActive = (project: ProjectRow, issue?: IssueRow): Effect.Effect<void, RefusedError> => {
        if (project.status === "archived") return Effect.fail(archived(project))
        if (project.status === "paused")
          return Effect.fail(
            new RefusedError({
              message: `${project.key} is paused by the owner${project.paused_reason ? ` (${project.paused_reason})` : ""}; only board_question works until they resume it.`,
            }),
          )
        if (issue?.paused)
          return Effect.fail(
            new RefusedError({
              message: `${project.key}-${issue.number} is paused by the owner; only board_question works until they resume it.`,
            }),
          )
        return Effect.void
      }

      const resolveRepo = Effect.fnUntraced(function* (tx: Tx, repo: string) {
        const row = yield* tx
          .select({ id: ProjectTable.id })
          .from(ProjectTable)
          .where(
            path.isAbsolute(repo)
              ? eq(ProjectTable.worktree, AbsolutePath.make(path.resolve(repo)))
              : eq(ProjectTable.id, ProjectSchema.ID.make(repo)),
          )
          .get()
        if (!row) return yield* new NotFoundError({ message: `No Orchestra project matches the repo ${repo}; open it in Orchestra first.` })
        return row.id
      })

      const resolveDependencies = Effect.fnUntraced(function* (tx: Tx, project: ProjectRow, list: readonly string[]) {
        return yield* Effect.forEach(list, (ref) =>
          Effect.gen(function* () {
            const match = /^(?:([A-Z]{2,6})-)?(\d+)$/.exec(ref.trim())
            if (!match) return yield* new RefusedError({ message: `"${ref}" is not an issue ref; use ${project.key}-12 or 12.` })
            const owner = match[1] && match[1] !== project.key ? yield* loadProject(tx, match[1]) : project
            return (yield* loadIssue(tx, owner, Number(match[2]))).id
          }),
        )
      })

      const setDependencies = Effect.fnUntraced(function* (tx: Tx, project: ProjectRow, issue: IssueRow, list: readonly string[]) {
        const ids = Array.from(new Set(yield* resolveDependencies(tx, project, list)))
        const edges = (yield* tx.select().from(BoardDependencyTable).all()).filter((edge) => edge.issue_id !== issue.id)
        const cycle = ids.find((id) => reaches(edges, id, issue.id, new Set()))
        if (cycle)
          return yield* new RefusedError({
            message:
              cycle === issue.id
                ? `${project.key}-${issue.number} cannot depend on itself.`
                : `That dependency would make a cycle: ${list.join(", ")} already waits on ${project.key}-${issue.number}.`,
          })
        yield* tx.delete(BoardDependencyTable).where(eq(BoardDependencyTable.issue_id, issue.id)).run()
        if (ids.length > 0)
          yield* tx
            .insert(BoardDependencyTable)
            .values(ids.map((id) => ({ issue_id: issue.id, depends_on_id: id })))
            .run()
      })

      const replaceSteps = Effect.fnUntraced(function* (tx: Tx, issue: Board.IssueID, steps: readonly Board.Step[]) {
        yield* tx.delete(BoardStepTable).where(eq(BoardStepTable.issue_id, issue)).run()
        if (steps.length > 0)
          yield* tx
            .insert(BoardStepTable)
            .values(
              steps.map((step, position) => ({
                id: Board.StepID.create(),
                issue_id: issue,
                position,
                title: step.title,
                status: step.status,
                now: step.now,
              })),
            )
            .run()
      })

      const stepsOf = Effect.fnUntraced(function* (tx: Tx, issue: Board.IssueID) {
        return (yield* tx
          .select()
          .from(BoardStepTable)
          .where(eq(BoardStepTable.issue_id, issue))
          .orderBy(asc(BoardStepTable.position))
          .all()).map((step): Board.Step => ({ title: step.title, status: step.status, now: step.now }))
      })

      const endOf = Effect.fnUntraced(function* (tx: Tx, project: Board.ProjectID, stage: Board.Stage) {
        const row = yield* tx
          .select({ position: sql<number | null>`max(${BoardIssueTable.position})` })
          .from(BoardIssueTable)
          .where(and(eq(BoardIssueTable.project_id, project), eq(BoardIssueTable.stage, stage)))
          .get()
        return (row?.position ?? 0) + 1
      })

      const issueResult = Effect.fnUntraced(function* (tx: Tx, project: ProjectRow, id: Board.IssueID, activity: Board.ActivityID) {
        const row = yield* tx.select().from(BoardIssueTable).where(eq(BoardIssueTable.id, id)).get()
        const issue = row ? (yield* issueRecords(tx, project, [row]))[0] : undefined
        return {
          result: issue ? { activity, issue } : { activity },
          changed: changed(project.id, activity, id),
        }
      })

      // Applies an activity row's fields to the current state; used by undo.
      const apply = Effect.fnUntraced(function* (tx: Tx, project: ProjectRow, row: ActivityRow, fields: Fields | null) {
        if (row.action === "question.withdraw") {
          yield* tx
            .update(BoardQuestionTable)
            .set({ status: fields?.status === "withdrawn" ? "withdrawn" : "open" })
            .where(eq(BoardQuestionTable.id, String(row.after?.id ?? row.before?.id) as Board.QuestionID))
            .run()
          return
        }
        if (row.action === "epic.upsert") {
          const id = String(row.after?.id ?? row.before?.id) as Board.EpicID
          if (!fields) {
            const used = yield* tx.select({ id: BoardIssueTable.id }).from(BoardIssueTable).where(eq(BoardIssueTable.epic_id, id)).get()
            if (used) return yield* new RefusedError({ message: "Issues belong to that epic now; it cannot be uncreated." })
            yield* tx.delete(BoardEpicTable).where(eq(BoardEpicTable.id, id)).run()
            return
          }
          yield* tx
            .update(BoardEpicTable)
            .set(pick(fields, EPIC_COLUMNS) as Partial<typeof BoardEpicTable.$inferInsert>)
            .where(eq(BoardEpicTable.id, id))
            .run()
          return
        }
        const issue = row.issue_id
        if (!issue || !fields) return
        if (Array.isArray(fields.steps)) yield* replaceSteps(tx, issue, fields.steps as Board.Step[])
        if (Array.isArray(fields.depends_on)) {
          const current = yield* tx.select().from(BoardIssueTable).where(eq(BoardIssueTable.id, issue)).get()
          if (current) yield* setDependencies(tx, project, current, fields.depends_on as string[])
        }
        const columns = pick(fields, ISSUE_COLUMNS) as Partial<typeof BoardIssueTable.$inferInsert>
        const dirty = Object.keys(fields).some((key) => MIRRORED.includes(key)) && project.github_repo !== null
        if (Object.keys(columns).length > 0 || dirty)
          yield* tx
            .update(BoardIssueTable)
            .set({ ...columns, ...(dirty ? { github_dirty: true } : {}) })
            .where(eq(BoardIssueTable.id, issue))
            .run()
      })

      const github = BoardGithub.make({
        quiet: (work) => quiet(work).pipe(Effect.orDie),
        publish: (changed) => events.publish(Board.Event.Changed, changed),
        log,
        gh: options.gh ?? BoardGithub.runner(proc, options.env),
      })

      if (options.poll)
        yield* reading((tx) =>
          tx
            .select({ key: BoardProjectTable.key, id: BoardProjectTable.id, github: BoardProjectTable.github_repo })
            .from(BoardProjectTable)
            .where(ne(BoardProjectTable.status, "archived"))
            .all(),
        ).pipe(
          Effect.flatMap((rows) =>
            Effect.forEach(rows, (row) =>
              Effect.gen(function* () {
                if (row.github) {
                  yield* github.sync(row.key)
                  yield* github.ci(row.key)
                }
                // CI minutes are spend too: a fetch can be what pushes the forecast past 90%.
                const raised = yield* quiet((tx) => evaluate(tx, row.id))
                if (raised) yield* events.publish(Board.Event.Changed, { project: row.id, activity: raised })
              }),
            ),
          ),
          Effect.ignore,
          Effect.repeat(Schedule.spaced("60 seconds")),
          Effect.forkScoped,
        )

      return Service.of({
        summaries: Effect.fn("Board.summaries")(function* (options) {
          return yield* reading((tx) =>
            Effect.gen(function* () {
              const projects = yield* tx
                .select()
                .from(BoardProjectTable)
                .where(options?.archived ? undefined : ne(BoardProjectTable.status, "archived"))
                .orderBy(asc(BoardProjectTable.key))
                .all()
              const stages = yield* tx
                .select({ project: BoardIssueTable.project_id, stage: BoardIssueTable.stage, count: sql<number>`count(*)` })
                .from(BoardIssueTable)
                .groupBy(BoardIssueTable.project_id, BoardIssueTable.stage)
                .all()
              const open = yield* tx
                .select({ project: BoardQuestionTable.project_id, blocking: BoardQuestionTable.blocking })
                .from(BoardQuestionTable)
                .where(eq(BoardQuestionTable.status, "open"))
                .all()
              return yield* Effect.forEach(projects, (project) =>
                Effect.gen(function* () {
                  const questions = open.filter((item) => item.project === project.id)
                  return {
                    project: toProject(project),
                    stages: Object.fromEntries(
                      stages.filter((item) => item.project === project.id).map((item) => [item.stage, item.count]),
                    ),
                    openQuestions: questions.length,
                    health:
                      project.status === "paused"
                        ? "paused"
                        : project.forecast_late_streak >= 2
                          ? "at_risk"
                          : questions.some((item) => item.blocking)
                            ? "waiting_on_owner"
                            : "on_track",
                    forecast: (yield* forecastOf(tx, project)).project,
                  } satisfies Board.Summary
                }),
              )
            }),
          )
        }),

        snapshot: Effect.fn("Board.snapshot")(function* (key) {
          return yield* reading((tx) => loadProject(tx, key).pipe(Effect.flatMap((project) => snapshotOf(tx, project))))
        }),

        read: Effect.fn("Board.read")(function* (input) {
          const loaded = yield* reading((tx) =>
            Effect.gen(function* () {
              const project = yield* loadProject(tx, input.project)
              const snapshot = yield* snapshotOf(tx, project)
              const rows = yield* tx
                .select()
                .from(BoardActivityTable)
                .where(
                  and(
                    eq(BoardActivityTable.project_id, project.id),
                    input.since ? gt(BoardActivityTable.id, input.since) : undefined,
                    ne(BoardActivityTable.actor, "maestro"),
                  ),
                )
                .orderBy(desc(BoardActivityTable.id))
                .limit(100)
                .all()
              const ordered = rows.toReversed()
              const noteIDs = ordered.flatMap((row) =>
                (row.action === "note.add" || row.action === "note.edit") && row.after?.id ? [String(row.after.id) as Board.NoteID] : [],
              )
              const answerIDs = ordered.flatMap((row) =>
                row.action === "question.answer" && row.after?.id ? [String(row.after.id) as Board.QuestionID] : [],
              )
              const known = yield* numbers(tx, project)
              const notes = noteIDs.length > 0 ? yield* tx.select().from(BoardNoteTable).where(inArray(BoardNoteTable.id, noteIDs)).all() : []
              const answers =
                answerIDs.length > 0 ? yield* tx.select().from(BoardQuestionTable).where(inArray(BoardQuestionTable.id, answerIDs)).all() : []
              const attachments = yield* tx
                .select()
                .from(BoardAttachmentTable)
                .innerJoin(BoardIssueTable, eq(BoardIssueTable.id, BoardAttachmentTable.issue_id))
                .where(eq(BoardIssueTable.project_id, project.id))
                .orderBy(asc(BoardAttachmentTable.id))
                .all()
              return {
                ...snapshot,
                since: {
                  activity: ordered.map((row) => toActivity(row, known.issues)),
                  notes: notes.map((row) => toNote(row, known.issues.get(row.issue_id) ?? 0)),
                  answers: answers.map((row) => toQuestion(row, known)),
                },
                attachments: attachments.map((row) => toAttachment(row.board_attachment, row.board_issue.number)),
              }
            }),
          )
          if (input.issue === undefined) return loaded satisfies Board.Read
          return { ...loaded, issue: yield* pageOf(input.project, input.issue) } satisfies Board.Read
        }),

        issuePage: Effect.fn("Board.issuePage")(function* (key, number) {
          return yield* pageOf(key, number)
        }),

        spend: Effect.fn("Board.spend")(function* (key) {
          return yield* reading((tx) =>
            Effect.gen(function* () {
              const project = yield* loadProject(tx, key)
              const forecast = yield* forecastOf(tx, project)
              return yield* spendOf(tx, project, forecast.project.forecast)
            }),
          )
        }),

        decisions: Effect.fn("Board.decisions")(function* (key) {
          return yield* reading((tx) =>
            Effect.gen(function* () {
              const project = yield* loadProject(tx, key)
              const known = yield* numbers(tx, project)
              const rows = yield* tx
                .select()
                .from(BoardDecisionTable)
                .where(eq(BoardDecisionTable.project_id, project.id))
                .orderBy(desc(BoardDecisionTable.answered_at), desc(BoardDecisionTable.id))
                .all()
              return rows.map((row) => toDecision(row, known))
            }),
          )
        }),

        proof: Effect.fn("Board.proof")(function* (key, number) {
          const loaded = yield* reading((tx) =>
            Effect.gen(function* () {
              const project = yield* loadProject(tx, key)
              const row = yield* loadIssue(tx, project, number)
              const known = yield* numbers(tx, project)
              const decided = yield* tx
                .select()
                .from(BoardDecisionTable)
                .where(and(eq(BoardDecisionTable.issue_id, row.id), isNull(BoardDecisionTable.overturned_by_id)))
                .orderBy(desc(BoardDecisionTable.answered_at), desc(BoardDecisionTable.id))
                .limit(1)
                .get()
              return { project, row, directory: yield* worktree(tx, project), decided: decided ? toDecision(decided, known) : null }
            }),
          )
          const live = yield* trail(loaded.row, loaded.directory, false)
          const rule = loaded.row.guardrail_rule
          return {
            issue: loaded.row.number,
            ref: `${key}-${loaded.row.number}`,
            banner:
              loaded.project.github_state === "signed_out" || live.state === "signed_out"
                ? "GitHub sign-in expired. Sign in with gh to refresh pull request and CI status."
                : null,
            pr:
              live.state === "ok"
                ? {
                    number: live.pr.number,
                    state: live.pr.state,
                    merged: live.pr.merged,
                    commits: live.pr.commits.length,
                    lastSha: live.pr.commits.at(-1)?.hash ?? null,
                  }
                : null,
            ci:
              live.state === "ok"
                ? { checks: live.pr.checks, failing: live.pr.checks.find((check) => failed(check.conclusion))?.name ?? null }
                : null,
            attempts: { n: loaded.row.attempts, of: ATTEMPTS },
            guardrail: rule ? { rule, summary: yield* ruleSummary(loaded.directory, rule) } : null,
            crashReason: loaded.row.crash_reason,
            verifiedAt: live.state === "ok" ? (live.verifiedAt ?? null) : null,
            decidedBy: loaded.decided,
          } satisfies Board.Proof
        }),

        activity: Effect.fn("Board.activity")(function* (key, since) {
          return yield* reading((tx) =>
            Effect.gen(function* () {
              const project = yield* loadProject(tx, key)
              const rows = yield* tx
                .select()
                .from(BoardActivityTable)
                .where(
                  and(
                    eq(BoardActivityTable.project_id, project.id),
                    since ? gt(BoardActivityTable.id, since as Board.ActivityID) : undefined,
                  ),
                )
                .orderBy(asc(BoardActivityTable.id))
                .all()
              return yield* activityOf(tx, project, rows)
            }),
          )
        }),

        project: Effect.fn("Board.project")(function* (input) {
          const done = yield* write((tx) =>
            Effect.gen(function* () {
              const existing = yield* tx.select().from(BoardProjectTable).where(eq(BoardProjectTable.key, input.key)).get()
              const repo = input.repo === undefined ? undefined : input.repo === null ? null : yield* resolveRepo(tx, input.repo)
              const next = {
                name: input.name,
                goal: input.goal,
                target_date: input.target_date,
                repo_project_id: repo,
                github_repo: input.github_repo,
              }
              if (!existing) {
                if (!input.name) return yield* new RefusedError({ message: `A new project needs a name; give ${input.key} one.` })
                const id = Board.ProjectID.create()
                const row = {
                  id,
                  key: input.key,
                  name: input.name,
                  goal: input.goal ?? "",
                  target_date: input.target_date ?? null,
                  budget_usd: null,
                  repo_project_id: repo ?? null,
                  github_repo: input.github_repo ?? null,
                  status: "active" as const,
                  github_state: "off" as const,
                  next_issue_number: 1,
                  next_epic_number: 1,
                }
                yield* tx.insert(BoardProjectTable).values(row).run()
                const activity = yield* log(tx, {
                  project: id,
                  actor: "maestro",
                  action: "project.upsert",
                  reason: input.reason,
                  after: pick(row, ["key", "name", "goal", "target_date", "repo_project_id", "github_repo"]),
                })
                return { result: { activity }, changed: changed(id, activity) }
              }
              yield* requireActive(existing)
              const change = diff(existing, next)
              if (!change) return yield* new RefusedError({ message: `Nothing to change on ${input.key}.` })
              yield* tx.update(BoardProjectTable).set(change.after).where(eq(BoardProjectTable.id, existing.id)).run()
              const activity = yield* log(tx, {
                project: existing.id,
                actor: "maestro",
                action: "project.upsert",
                reason: input.reason,
                ...change,
              })
              return { result: { activity }, changed: changed(existing.id, activity) }
            }),
          )
          return done.result
        }),

        epic: Effect.fn("Board.epic")(function* (input) {
          const done = yield* write((tx) =>
            Effect.gen(function* () {
              const project = yield* loadProject(tx, input.project)
              yield* requireActive(project)
              if (input.number === undefined) {
                if (!input.title) return yield* new RefusedError({ message: "A new epic needs a title." })
                const id = Board.EpicID.create()
                const last = yield* tx
                  .select({ position: sql<number | null>`max(${BoardEpicTable.position})` })
                  .from(BoardEpicTable)
                  .where(eq(BoardEpicTable.project_id, project.id))
                  .get()
                const row = {
                  title: input.title,
                  goal: input.goal ?? "",
                  position: input.position ?? (last?.position ?? 0) + 1,
                  status: input.status ?? ("open" as const),
                }
                yield* tx
                  .insert(BoardEpicTable)
                  .values({ id, project_id: project.id, number: project.next_epic_number, ...row })
                  .run()
                yield* tx
                  .update(BoardProjectTable)
                  .set({ next_epic_number: project.next_epic_number + 1 })
                  .where(eq(BoardProjectTable.id, project.id))
                  .run()
                const activity = yield* log(tx, {
                  project: project.id,
                  actor: "maestro",
                  action: "epic.upsert",
                  reason: input.reason,
                  after: { id, number: project.next_epic_number, ...row },
                })
                return { result: { activity }, changed: changed(project.id, activity) }
              }
              const epic = yield* loadEpic(tx, project, input.number)
              const change = diff(epic, { title: input.title, goal: input.goal, position: input.position, status: input.status })
              if (!change) return yield* new RefusedError({ message: `Nothing to change on ${project.key}-E${epic.number}.` })
              yield* tx.update(BoardEpicTable).set(change.after).where(eq(BoardEpicTable.id, epic.id)).run()
              const activity = yield* log(tx, {
                project: project.id,
                actor: "maestro",
                action: "epic.upsert",
                reason: input.reason,
                before: { id: epic.id, ...change.before },
                after: { id: epic.id, ...change.after },
              })
              return { result: { activity }, changed: changed(project.id, activity) }
            }),
          )
          return done.result
        }),

        issue: Effect.fn("Board.issue")(function* (input) {
          const done = yield* write((tx) =>
            Effect.gen(function* () {
              const project = yield* loadProject(tx, input.project)
              yield* requireActive(project)
              const epic =
                input.epic === undefined ? undefined : input.epic === null ? null : (yield* loadEpic(tx, project, input.epic)).id
              const now = yield* Clock.currentTimeMillis
              const fields = {
                title: input.title,
                body: input.body,
                type: input.type,
                epic_id: epic,
                estimate: input.estimate,
                seat: input.seat,
                session_id: input.session,
                branch: input.branch,
                pr_number: input.pr,
                attempts: input.attempts,
                crash_reason: input.crash_reason,
                guardrail_rule: input.guardrail_rule,
              }
              if (input.number === undefined) {
                if (!input.title) return yield* new RefusedError({ message: "A new issue needs a title." })
                const id = Board.IssueID.create()
                const row = {
                  id,
                  project_id: project.id,
                  number: project.next_issue_number,
                  title: input.title,
                  body: input.body ?? "",
                  type: input.type ?? ("feature" as const),
                  epic_id: epic ?? null,
                  stage: "backlog" as const,
                  position: yield* endOf(tx, project.id, "backlog"),
                  estimate: input.estimate ?? null,
                  seat: input.seat ?? null,
                  session_id: input.session ?? null,
                  branch: input.branch ?? null,
                  pr_number: input.pr ?? null,
                  attempts: input.attempts ?? 0,
                  crash_reason: input.crash_reason ?? null,
                  guardrail_rule: input.guardrail_rule ?? null,
                  stage_entered_at: now,
                  github_dirty: project.github_repo !== null,
                }
                yield* tx.insert(BoardIssueTable).values(row).run()
                yield* tx
                  .update(BoardProjectTable)
                  .set({ next_issue_number: project.next_issue_number + 1 })
                  .where(eq(BoardProjectTable.id, project.id))
                  .run()
                const created = yield* tx.select().from(BoardIssueTable).where(eq(BoardIssueTable.id, id)).get()
                if (created && input.depends_on) yield* setDependencies(tx, project, created, input.depends_on)
                const activity = yield* log(tx, {
                  project: project.id,
                  issue: id,
                  actor: "maestro",
                  action: "issue.create",
                  reason: input.reason,
                  after: {
                    ...pick(row, ["number", "title", "body", "type", "epic_id", "stage", "estimate", "seat", "session_id", "branch", "pr_number"]),
                    ...(input.depends_on ? { depends_on: input.depends_on } : {}),
                  },
                })
                return yield* issueResult(tx, project, id, activity)
              }
              const issue = yield* loadIssue(tx, project, input.number)
              yield* requireActive(project, issue)
              if (issue.stage === "review" && input.pr === null)
                return yield* new RefusedError({
                  message: `${project.key}-${issue.number} is in Review, which needs its PR; move it out of Review before unlinking the PR.`,
                })
              const change = diff(issue, fields)
              const before = input.depends_on ? (yield* refs(tx, "depends", [issue.id])).map((item) => item.ref) : undefined
              // Compare as full refs so "12" and "LCH-12" are the same dependency.
              const wanted = input.depends_on
                ?.map((ref) => (/^\d+$/.test(ref.trim()) ? `${project.key}-${ref.trim()}` : ref.trim()))
                .toSorted()
              const dependencies =
                wanted && before && JSON.stringify(before.toSorted()) !== JSON.stringify(wanted)
                  ? { before: { depends_on: before }, after: { depends_on: wanted } }
                  : undefined
              if (!change && !dependencies)
                return yield* new RefusedError({ message: `Nothing to change on ${project.key}-${issue.number}.` })
              if (dependencies) yield* setDependencies(tx, project, issue, dependencies.after.depends_on)
              const dirty = Object.keys(change?.after ?? {}).some((key) => MIRRORED.includes(key)) && project.github_repo !== null
              if (change || dirty)
                yield* tx
                  .update(BoardIssueTable)
                  .set({ ...change?.after, ...(dirty ? { github_dirty: true } : {}) })
                  .where(eq(BoardIssueTable.id, issue.id))
                  .run()
              const activity = yield* log(tx, {
                project: project.id,
                issue: issue.id,
                actor: "maestro",
                action: "issue.update",
                reason: input.reason,
                before: { ...change?.before, ...dependencies?.before },
                after: { ...change?.after, ...dependencies?.after },
              })
              return yield* issueResult(tx, project, issue.id, activity)
            }),
          )
          return done.result
        }),

        move: Effect.fn("Board.move")(function* (input) {
          if (input.stage === "intake")
            return yield* new RefusedError({ message: "Intake holds only GitHub-born issues; Maestro cannot move an issue into it." })
          const ref = `${input.project}-${input.number}`
          // A Shipped move with a PR needs a live, uncached proof that the PR is merged, read before the write lock.
          const checked = yield* reading((tx) =>
            Effect.gen(function* () {
              const project = yield* loadProject(tx, input.project)
              const issue = yield* loadIssue(tx, project, input.number)
              return { issue, directory: yield* worktree(tx, project) }
            }),
          )
          const proof =
            input.stage === "shipped" && checked.issue.pr_number && !checked.issue.hold_before_merge
              ? yield* trail(checked.issue, checked.directory, true)
              : undefined
          const done = yield* write((tx) =>
            Effect.gen(function* () {
              const project = yield* loadProject(tx, input.project)
              const issue = yield* loadIssue(tx, project, input.number)
              yield* requireActive(project, issue)
              if (issue.stage === "intake")
                return yield* new RefusedError({ message: `${ref} is in Intake; the owner accepts or declines it first.` })
              if (input.stage === "review" && !issue.pr_number)
                return yield* new RefusedError({ message: `${ref} has no PR; link one with board_issue before Review.` })
              if (input.stage === "shipped" && issue.hold_before_merge)
                return yield* new RefusedError({
                  message: `${ref} is on hold before merge; only the owner can release it. Do not merge its PR.`,
                })
              if (input.stage === "shipped" && issue.pr_number) {
                if (issue.pr_number !== checked.issue.pr_number || !proof)
                  return yield* new RefusedError({ message: `${ref}'s PR changed while it was being checked; try again.` })
                if (proof.state === "none")
                  return yield* new RefusedError({
                    message: `${input.project} has no repo linked, so PR #${issue.pr_number} cannot be checked as merged.`,
                  })
                if (proof.state === "signed_out")
                  return yield* new RefusedError({
                    message: `GitHub is signed out, so PR #${issue.pr_number} cannot be checked as merged; ${ref} stays where it is.`,
                  })
                if (proof.state === "error")
                  return yield* new RefusedError({ message: `PR #${issue.pr_number} could not be read: ${proof.message}` })
                if (!proof.pr.merged)
                  return yield* new RefusedError({ message: `PR #${issue.pr_number} for ${ref} is not merged yet.` })
              }
              if (input.stage === "building" && issue.stage !== "building" && project.budget_usd !== null) {
                const budget = (yield* spendOf(tx, project, null)).budget
                if (budget.state === "paused")
                  return yield* new BudgetPausedError({
                    message: `${project.key} has spent $${budget.spentUsd.toFixed(2)} of its $${project.budget_usd.toFixed(2)} budget, so no new work starts; ${ref} stays where it is. Work in progress continues. Ask the owner to raise the budget.`,
                  })
              }
              const now = yield* Clock.currentTimeMillis
              const moved = issue.stage !== input.stage
              const next = {
                stage: input.stage,
                position:
                  input.position ?? (moved ? yield* endOf(tx, project.id, input.stage) : issue.position),
                stage_entered_at: moved ? now : issue.stage_entered_at,
              }
              const change = diff(issue, next)
              if (!change) return yield* new RefusedError({ message: `${ref} is already there.` })
              yield* tx
                .update(BoardIssueTable)
                .set({ ...change.after, ...(moved && project.github_repo !== null ? { github_dirty: true } : {}) })
                .where(eq(BoardIssueTable.id, issue.id))
                .run()
              const activity = yield* log(tx, {
                project: project.id,
                issue: issue.id,
                actor: "maestro",
                action: "issue.move",
                reason: input.reason,
                ...change,
              })
              return yield* issueResult(tx, project, issue.id, activity)
            }),
          )
          return done.result
        }),

        steps: Effect.fn("Board.steps")(function* (input) {
          if (input.steps.filter((step) => step.status === "active").length > 1)
            return yield* new RefusedError({ message: "Only one step can be active at a time." })
          const done = yield* write((tx) =>
            Effect.gen(function* () {
              const project = yield* loadProject(tx, input.project)
              const issue = yield* loadIssue(tx, project, input.number)
              yield* requireActive(project, issue)
              const before = yield* stepsOf(tx, issue.id)
              const after = input.steps.map((step): Board.Step => ({ title: step.title, status: step.status, now: step.now ?? null }))
              if (JSON.stringify(before) === JSON.stringify(after))
                return yield* new RefusedError({ message: `${project.key}-${issue.number} already has these steps.` })
              yield* replaceSteps(tx, issue.id, after)
              if (project.github_repo !== null)
                yield* tx.update(BoardIssueTable).set({ github_dirty: true }).where(eq(BoardIssueTable.id, issue.id)).run()
              const activity = yield* log(tx, {
                project: project.id,
                issue: issue.id,
                actor: "maestro",
                action: "steps.set",
                reason: input.reason,
                before: { steps: before },
                after: { steps: after },
              })
              return yield* issueResult(tx, project, issue.id, activity)
            }),
          )
          return done.result
        }),

        // Questions stay open to Maestro while paused: asking is how it reaches the owner.
        question: Effect.fn("Board.question")(function* (input) {
          const done = yield* write((tx) =>
            Effect.gen(function* () {
              const project = yield* loadProject(tx, input.project)
              if (project.status === "archived") return yield* archived(project)
              if (input.action === "withdraw") {
                const question = yield* tx
                  .select()
                  .from(BoardQuestionTable)
                  .where(and(eq(BoardQuestionTable.id, input.id), eq(BoardQuestionTable.project_id, project.id)))
                  .get()
                if (!question) return yield* new NotFoundError({ message: `Question ${input.id} is not on ${project.key}.` })
                if (question.status !== "open")
                  return yield* new RefusedError({ message: `Question ${input.id} is already ${question.status}.` })
                yield* tx.update(BoardQuestionTable).set({ status: "withdrawn" }).where(eq(BoardQuestionTable.id, question.id)).run()
                const activity = yield* log(tx, {
                  project: project.id,
                  issue: question.issue_id,
                  actor: "maestro",
                  action: "question.withdraw",
                  reason: input.reason,
                  before: { id: question.id, status: "open" },
                  after: { id: question.id, status: "withdrawn" },
                })
                return { result: { activity }, changed: changed(project.id, activity, question.issue_id) }
              }
              const ids = input.options.map((option) => option.id)
              if (new Set(ids).size !== ids.length) return yield* new RefusedError({ message: "Option ids must be unique." })
              if (!ids.includes(input.recommended))
                return yield* new RefusedError({ message: `The recommended option must be one of: ${ids.join(", ")}.` })
              const issue = input.issue === undefined ? null : (yield* loadIssue(tx, project, input.issue)).id
              const epic = input.epic === undefined ? null : (yield* loadEpic(tx, project, input.epic)).id
              const id = Board.QuestionID.create()
              yield* tx
                .insert(BoardQuestionTable)
                .values({
                  id,
                  project_id: project.id,
                  issue_id: issue,
                  epic_id: epic,
                  text: input.text,
                  options: input.options,
                  recommended: input.recommended,
                  cost_of_waiting: input.cost_of_waiting ?? null,
                  blocking: input.blocking ?? false,
                  status: "open",
                })
                .run()
              const activity = yield* log(tx, {
                project: project.id,
                issue,
                actor: "maestro",
                action: "question.ask",
                reason: input.reason,
                after: { id, text: input.text, blocking: input.blocking ?? false },
              })
              return { result: { activity }, changed: changed(project.id, activity, issue) }
            }),
          )
          return done.result
        }),

        answer: Effect.fn("Board.answer")(function* (key, id, input) {
          const done = yield* write((tx) =>
            Effect.gen(function* () {
              const project = yield* loadProject(tx, key)
              const question = yield* tx
                .select()
                .from(BoardQuestionTable)
                .where(and(eq(BoardQuestionTable.id, id as Board.QuestionID), eq(BoardQuestionTable.project_id, project.id)))
                .get()
              if (!question) return yield* new NotFoundError({ message: `Question ${id} is not on ${key}.` })
              if (question.status !== "open") return yield* new RefusedError({ message: `That question is already ${question.status}.` })
              if (!question.options.some((option) => option.id === input.option))
                return yield* new RefusedError({
                  message: `Pick one of: ${question.options.map((option) => option.id).join(", ")}.`,
                })
              const now = yield* Clock.currentTimeMillis
              yield* tx
                .update(BoardQuestionTable)
                .set({ status: "answered", answer_option: input.option, answer_text: input.text ?? null, answered_at: now })
                .where(eq(BoardQuestionTable.id, question.id))
                .run()
              yield* tx
                .insert(BoardDecisionTable)
                .values({
                  id: Board.DecisionID.create(),
                  project_id: project.id,
                  issue_id: question.issue_id,
                  epic_id: question.epic_id,
                  question_id: question.id,
                  question: question.text,
                  options: question.options,
                  recommended: question.recommended,
                  chosen: input.option,
                  chosen_text: input.text ?? null,
                  answered_by: "owner",
                  answered_at: now,
                })
                .run()
              const activity = yield* log(tx, {
                project: project.id,
                issue: question.issue_id,
                actor: "owner",
                action: "question.answer",
                before: { id: question.id, status: "open" },
                after: { id: question.id, status: "answered", answer_option: input.option, answer_text: input.text ?? null },
              })
              return { result: { activity }, changed: changed(project.id, activity, question.issue_id) }
            }),
          )
          return done.result
        }),

        changeDecision: Effect.fn("Board.changeDecision")(function* (key, id, input) {
          const done = yield* write((tx) =>
            Effect.gen(function* () {
              const project = yield* loadProject(tx, key)
              const old = yield* tx
                .select()
                .from(BoardDecisionTable)
                .where(and(eq(BoardDecisionTable.id, id as Board.DecisionID), eq(BoardDecisionTable.project_id, project.id)))
                .get()
              if (!old) return yield* new NotFoundError({ message: `Decision ${id} is not on ${key}.` })
              if (old.overturned_by_id)
                return yield* new RefusedError({ message: "That decision was already overturned; change the newer one instead." })
              if (!old.options.some((option) => option.id === input.option))
                return yield* new RefusedError({ message: `Pick one of: ${old.options.map((option) => option.id).join(", ")}.` })
              const text = input.text ?? null
              if (old.chosen === input.option && old.chosen_text === text)
                return yield* new RefusedError({ message: "That is already the answer." })
              const now = yield* Clock.currentTimeMillis
              const next = Board.DecisionID.create()
              yield* tx
                .insert(BoardDecisionTable)
                .values({
                  id: next,
                  project_id: project.id,
                  issue_id: old.issue_id,
                  epic_id: old.epic_id,
                  question_id: old.question_id,
                  question: old.question,
                  options: old.options,
                  recommended: old.recommended,
                  chosen: input.option,
                  chosen_text: text,
                  answered_by: "owner",
                  answered_at: now,
                  supersedes_id: old.id,
                })
                .run()
              yield* tx.update(BoardDecisionTable).set({ overturned_by_id: next }).where(eq(BoardDecisionTable.id, old.id)).run()
              // Maestro reads the question's answer, so it carries the current one.
              yield* tx
                .update(BoardQuestionTable)
                .set({ answer_option: input.option, answer_text: text, answered_at: now })
                .where(eq(BoardQuestionTable.id, old.question_id))
                .run()
              const activity = yield* log(tx, {
                project: project.id,
                issue: old.issue_id,
                actor: "owner",
                action: "question.answer",
                before: { id: old.question_id, answer_option: old.chosen, answer_text: old.chosen_text },
                after: { id: old.question_id, status: "answered", answer_option: input.option, answer_text: text, decision: next },
              })
              return { result: { activity }, changed: changed(project.id, activity, old.issue_id) }
            }),
          )
          return done.result
        }),

        decisionOutcome: Effect.fn("Board.decisionOutcome")(function* (input) {
          const done = yield* write((tx) =>
            Effect.gen(function* () {
              const project = yield* loadProject(tx, input.project)
              const row = yield* tx
                .select()
                .from(BoardDecisionTable)
                .where(
                  and(
                    eq(BoardDecisionTable.project_id, project.id),
                    isNull(BoardDecisionTable.overturned_by_id),
                    or(eq(BoardDecisionTable.id, input.id as Board.DecisionID), eq(BoardDecisionTable.question_id, input.id as Board.QuestionID)),
                  ),
                )
                .orderBy(desc(BoardDecisionTable.answered_at))
                .get()
              if (!row) return yield* new NotFoundError({ message: `No standing decision ${input.id} on ${project.key}.` })
              if (row.outcome === input.outcome) return yield* new RefusedError({ message: "That outcome is already recorded." })
              const now = yield* Clock.currentTimeMillis
              yield* tx.update(BoardDecisionTable).set({ outcome: input.outcome, outcome_at: now }).where(eq(BoardDecisionTable.id, row.id)).run()
              const activity = yield* log(tx, {
                project: project.id,
                issue: row.issue_id,
                actor: "maestro",
                action: "question.answer",
                reason: input.reason,
                before: { id: row.question_id, outcome: row.outcome },
                after: { id: row.question_id, decision: row.id, outcome: input.outcome },
              })
              return { result: { activity }, changed: changed(project.id, activity, row.issue_id) }
            }),
          )
          return done.result
        }),

        settings: Effect.fn("Board.settings")(function* (key, input, actor) {
          const done = yield* write((tx) =>
            Effect.gen(function* () {
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
            }),
          )
          return done.result
        }),

        note: Effect.fn("Board.note")(function* (key, number, input) {
          const done = yield* write((tx) =>
            Effect.gen(function* () {
              const project = yield* loadProject(tx, key)
              const issue = yield* loadIssue(tx, project, number)
              const id = Board.NoteID.create()
              yield* tx.insert(BoardNoteTable).values({ id, issue_id: issue.id, author: "owner", body: input.body }).run()
              const activity = yield* log(tx, { project: project.id, issue: issue.id, actor: "owner", action: "note.add", after: { id } })
              return { result: { activity }, changed: changed(project.id, activity, issue.id) }
            }),
          )
          return done.result
        }),

        // A secret's value goes only to the credential store, inside the same transaction; the board keeps its label.
        attach: Effect.fn("Board.attach")(function* (key, number, input) {
          const id = Board.AttachmentID.create()
          const content = input.kind === "secret" ? input.value : input.data
          if (!content)
            return yield* new RefusedError({
              message: input.kind === "secret" ? "A secret needs a `value`." : "A file needs base64 `data`.",
            })
          const file =
            input.kind === "secret"
              ? undefined
              : { bytes: Buffer.from(content, "base64"), path: path.join(global.data, "board", id, path.basename(input.name)) }
          const done = yield* write((tx) =>
            Effect.gen(function* () {
              const project = yield* loadProject(tx, key)
              const issue = yield* loadIssue(tx, project, number)
              if (input.kind === "secret") {
                const credential = yield* credentials.create({
                  integrationID: Integration.ID.make("board"),
                  label: input.name,
                  value: { type: "key", key: content },
                })
                yield* tx
                  .insert(BoardAttachmentTable)
                  .values({ id, issue_id: issue.id, kind: "secret", name: input.name, credential_id: credential.id })
                  .run()
              }
              if (input.kind !== "secret" && file) {
                yield* Effect.promise(() => Bun.write(file.path, file.bytes))
                yield* tx
                  .insert(BoardAttachmentTable)
                  .values({
                    id,
                    issue_id: issue.id,
                    kind: input.kind,
                    name: input.name,
                    mime: input.mime ?? null,
                    size: file.bytes.length,
                    path: file.path,
                  })
                  .run()
              }
              const activity = yield* log(tx, {
                project: project.id,
                issue: issue.id,
                actor: "owner",
                action: "attachment.add",
                after: { id, kind: input.kind, name: input.name },
              })
              return { result: { activity }, changed: changed(project.id, activity, issue.id) }
            }),
          )
          return done.result
        }),

        editNote: Effect.fn("Board.editNote")(function* (key, number, id, input) {
          const done = yield* write((tx) =>
            Effect.gen(function* () {
              const found = yield* ownerNote(tx, key, number, id, "edited")
              if (found.note.body === input.body) return yield* new RefusedError({ message: "That note already says this." })
              yield* tx.update(BoardNoteTable).set({ body: input.body }).where(eq(BoardNoteTable.id, found.note.id)).run()
              const activity = yield* log(tx, {
                project: found.project.id,
                issue: found.issue.id,
                actor: "owner",
                action: "note.edit",
                before: { id: found.note.id, body: found.note.body },
                after: { id: found.note.id, body: input.body },
              })
              return { result: { activity }, changed: changed(found.project.id, activity, found.issue.id) }
            }),
          )
          return done.result
        }),

        deleteNote: Effect.fn("Board.deleteNote")(function* (key, number, id) {
          const done = yield* write((tx) =>
            Effect.gen(function* () {
              const found = yield* ownerNote(tx, key, number, id, "deleted")
              yield* tx.delete(BoardNoteTable).where(eq(BoardNoteTable.id, found.note.id)).run()
              const activity = yield* log(tx, {
                project: found.project.id,
                issue: found.issue.id,
                actor: "owner",
                action: "note.delete",
                before: { id: found.note.id, body: found.note.body },
              })
              return { result: { activity }, changed: changed(found.project.id, activity, found.issue.id) }
            }),
          )
          return done.result
        }),

        // The activity row keeps the label only; a secret's value never leaves the credential store, which loses it here.
        removeAttachment: Effect.fn("Board.removeAttachment")(function* (key, number, id) {
          const done = yield* write((tx) =>
            Effect.gen(function* () {
              const project = yield* loadProject(tx, key)
              const issue = yield* loadIssue(tx, project, number)
              const attachment = yield* tx
                .select()
                .from(BoardAttachmentTable)
                .where(and(eq(BoardAttachmentTable.id, id as Board.AttachmentID), eq(BoardAttachmentTable.issue_id, issue.id)))
                .get()
              if (!attachment) return yield* new NotFoundError({ message: `Attachment ${id} is not on ${key}-${number}.` })
              yield* tx.delete(BoardAttachmentTable).where(eq(BoardAttachmentTable.id, attachment.id)).run()
              if (attachment.credential_id)
                yield* tx.delete(CredentialTable).where(eq(CredentialTable.id, attachment.credential_id)).run()
              const activity = yield* log(tx, {
                project: project.id,
                issue: issue.id,
                actor: "owner",
                action: "attachment.remove",
                before: { id: attachment.id, kind: attachment.kind, name: attachment.name },
              })
              return { result: { activity }, changed: changed(project.id, activity, issue.id), file: attachment.path }
            }),
          )
          const file = done.file
          if (file) yield* Effect.promise(() => fs.rm(path.dirname(file), { recursive: true, force: true }))
          return done.result
        }),

        undo: Effect.fn("Board.undo")(function* (key, id) {
          const done = yield* write((tx) =>
            Effect.gen(function* () {
              const project = yield* loadProject(tx, key)
              const target = yield* tx
                .select()
                .from(BoardActivityTable)
                .where(and(eq(BoardActivityTable.id, id as Board.ActivityID), eq(BoardActivityTable.project_id, project.id)))
                .get()
              if (!target) return yield* new NotFoundError({ message: `Activity ${id} is not on ${key}.` })
              const undoable =
                target.action === "github.overwrite" || (target.actor === "maestro" && UNDOABLE.includes(target.action))
              if (!undoable)
                return yield* new RefusedError({
                  message: "Only Maestro's plan changes and GitHub overwrites can be undone; reverse owner actions by doing the opposite.",
                })
              if (target.undone_by) return yield* new RefusedError({ message: "That change was already undone." })
              const later = yield* tx
                .select()
                .from(BoardActivityTable)
                .where(and(eq(BoardActivityTable.project_id, project.id), gt(BoardActivityTable.id, target.id)))
                .all()
              const keys = touched(target)
              const conflict = later.find(
                (row) =>
                  !row.undone_by &&
                  !(row.undoes && row.undoes > target.id) &&
                  entity(row) === entity(target) &&
                  touched(row).some((item) => keys.includes(item)),
              )
              if (conflict)
                return yield* new RefusedError({
                  message: `Changed since: a later ${conflict.action} touched the same fields, so this undo would clobber newer work.`,
                })
              yield* apply(tx, project, target, target.before)
              const activity = yield* log(tx, {
                project: project.id,
                issue: target.issue_id,
                actor: "owner",
                action: "undo",
                before: target.after,
                after: target.before,
                undoes: target.id,
              })
              yield* tx.update(BoardActivityTable).set({ undone_by: activity }).where(eq(BoardActivityTable.id, target.id)).run()
              return { result: { activity }, changed: changed(project.id, activity, target.issue_id) }
            }),
          )
          return done.result
        }),

        pause: Effect.fn("Board.pause")(function* (key, input) {
          return yield* setProjectPause(key, true, input.reason)
        }),

        resume: Effect.fn("Board.resume")(function* (key) {
          return yield* setProjectPause(key, false)
        }),

        archive: Effect.fn("Board.archive")(function* (key) {
          return yield* setArchived(key, true)
        }),

        unarchive: Effect.fn("Board.unarchive")(function* (key) {
          return yield* setArchived(key, false)
        }),

        pauseIssue: Effect.fn("Board.pauseIssue")(function* (key, number) {
          return yield* ownerIssue(key, number, "pause.set", (issue) =>
            issue.paused ? `${key}-${number} is already paused.` : { paused: true },
          )
        }),

        resumeIssue: Effect.fn("Board.resumeIssue")(function* (key, number) {
          return yield* ownerIssue(key, number, "pause.set", (issue) =>
            issue.paused ? { paused: false } : `${key}-${number} is not paused.`,
          )
        }),

        hold: Effect.fn("Board.hold")(function* (key, number, input) {
          return yield* ownerIssue(key, number, "hold.set", (issue) =>
            issue.hold_before_merge === input.hold
              ? `${key}-${number} ${input.hold ? "is already on hold" : "has no hold"}.`
              : { hold_before_merge: input.hold },
          )
        }),

        accept: Effect.fn("Board.accept")(function* (key, number) {
          return yield* intake(key, number, "intake.accept", "backlog")
        }),

        decline: Effect.fn("Board.decline")(function* (key, number) {
          return yield* intake(key, number, "intake.decline", "cut")
        }),

        sync: Effect.fn("Board.sync")(function* (key) {
          const done = yield* github.sync(key)
          if (done.status === "missing") return yield* new NotFoundError({ message: `There is no board project ${key}.` })
          if (done.status === "off") return yield* new RefusedError({ message: `${key} has no GitHub repository to mirror.` })
          return { state: done.state, error: done.error }
        }),
      })

      function setProjectPause(key: string, paused: boolean, reason?: string) {
        return write((tx) =>
          Effect.gen(function* () {
            const project = yield* loadProject(tx, key)
            if (project.status === "archived") return yield* archived(project)
            if ((project.status === "paused") === paused)
              return yield* new RefusedError({ message: `${key} is ${paused ? "already paused" : "not paused"}.` })
            const next = paused
              ? { status: "paused" as const, paused_reason: reason ?? null }
              : { status: "active" as const, paused_reason: null }
            yield* tx.update(BoardProjectTable).set(next).where(eq(BoardProjectTable.id, project.id)).run()
            const activity = yield* log(tx, {
              project: project.id,
              actor: "owner",
              action: "pause.set",
              reason: reason ?? null,
              before: { status: project.status, paused_reason: project.paused_reason },
              after: next,
            })
            return { result: { activity }, changed: changed(project.id, activity) }
          }),
        ).pipe(Effect.map((done) => done.result))
      }

      function setArchived(key: string, archive: boolean) {
        return write((tx) =>
          Effect.gen(function* () {
            const project = yield* loadProject(tx, key)
            if (archive && project.status !== "shipped" && project.status !== "paused")
              return yield* new RefusedError({
                message:
                  project.status === "archived"
                    ? `${key} is already archived.`
                    : `${key} is ${project.status}; only a shipped or paused project can be archived.`,
              })
            if (!archive && project.status !== "archived") return yield* new RefusedError({ message: `${key} is not archived.` })
            const next = archive ? ("archived" as const) : ("paused" as const)
            yield* tx.update(BoardProjectTable).set({ status: next }).where(eq(BoardProjectTable.id, project.id)).run()
            const activity = yield* log(tx, {
              project: project.id,
              actor: "owner",
              action: "archive.set",
              before: { status: project.status },
              after: { status: next },
            })
            return { result: { activity }, changed: changed(project.id, activity) }
          }),
        ).pipe(Effect.map((done) => done.result))
      }

      function ownerNote(tx: Tx, key: string, number: number, id: string, verb: "edited" | "deleted") {
        return Effect.gen(function* () {
          const project = yield* loadProject(tx, key)
          const issue = yield* loadIssue(tx, project, number)
          const note = yield* tx
            .select()
            .from(BoardNoteTable)
            .where(and(eq(BoardNoteTable.id, id as Board.NoteID), eq(BoardNoteTable.issue_id, issue.id)))
            .get()
          if (!note) return yield* new NotFoundError({ message: `Note ${id} is not on ${key}-${number}.` })
          if (note.author !== "owner")
            return yield* new RefusedError({ message: `Only your own notes can be ${verb}; GitHub and Maestro notes stay as written.` })
          return { project, issue, note }
        })
      }

      function ownerIssue(
        key: string,
        number: number,
        action: Board.Action,
        next: (issue: IssueRow) => string | Partial<Pick<IssueRow, "paused" | "hold_before_merge">>,
      ) {
        return write((tx) =>
          Effect.gen(function* () {
            const project = yield* loadProject(tx, key)
            const issue = yield* loadIssue(tx, project, number)
            const fields = next(issue)
            if (typeof fields === "string") return yield* new RefusedError({ message: fields })
            yield* tx.update(BoardIssueTable).set(fields).where(eq(BoardIssueTable.id, issue.id)).run()
            const activity = yield* log(tx, {
              project: project.id,
              issue: issue.id,
              actor: "owner",
              action,
              before: pick(issue, Object.keys(fields)),
              after: fields,
            })
            return { result: { activity }, changed: changed(project.id, activity, issue.id) }
          }),
        ).pipe(Effect.map((done) => done.result))
      }

      function intake(key: string, number: number, action: "intake.accept" | "intake.decline", stage: "backlog" | "cut") {
        return write((tx) =>
          Effect.gen(function* () {
            const project = yield* loadProject(tx, key)
            const issue = yield* loadIssue(tx, project, number)
            if (issue.stage !== "intake") return yield* new RefusedError({ message: `${key}-${number} is not in Intake.` })
            const now = yield* Clock.currentTimeMillis
            const next = { stage, position: yield* endOf(tx, project.id, stage), stage_entered_at: now }
            yield* tx
              .update(BoardIssueTable)
              .set({ ...next, ...(project.github_repo !== null ? { github_dirty: true } : {}) })
              .where(eq(BoardIssueTable.id, issue.id))
              .run()
            const activity = yield* log(tx, {
              project: project.id,
              issue: issue.id,
              actor: "owner",
              action,
              before: pick(issue, ["stage", "position", "stage_entered_at"]),
              after: next,
            })
            return { result: { activity }, changed: changed(project.id, activity, issue.id) }
          }),
        ).pipe(Effect.map((done) => done.result))
      }
    }),
  )

export const layer = layerWith({ poll: true })

export const node = makeGlobalNode({
  service: Service,
  layer,
  deps: [Database.node, EventV2.node, Credential.node, AppProcess.node, Global.node],
})

// Storage failures are defects: the board has no recovery for a broken database.
function dieOnStorage<A, E, R>(effect: Effect.Effect<A, E, R>) {
  return effect.pipe(
    Effect.catchIf(
      (error): error is Extract<E, SqlError | EffectDrizzleQueryError> =>
        error instanceof SqlError || error instanceof EffectDrizzleQueryError,
      Effect.die,
    ),
  )
}

function archived(project: ProjectRow) {
  return new RefusedError({ message: `${project.key} is archived; the owner unarchives it before anything changes.` })
}

function changed(project: string, activity: string, issue?: string | null): Changed {
  return issue ? { project, issue, activity } : { project, activity }
}

/** The changed fields of `next` against `row`, or undefined when nothing changes. Undefined in `next` means untouched. */
function diff<T extends Fields>(row: Fields, next: T) {
  const keys = Object.keys(next).filter((key) => next[key] !== undefined && !Object.is(row[key], next[key]))
  if (keys.length === 0) return undefined
  return {
    before: Object.fromEntries(keys.map((key) => [key, row[key]])) as Fields,
    after: Object.fromEntries(keys.map((key) => [key, next[key]])) as Partial<T>,
  }
}

function pick(row: Fields, keys: readonly string[]) {
  return Object.fromEntries(keys.filter((key) => key in row).map((key) => [key, row[key]]))
}

/** Epics and questions are named by an `id` key in the row; issue changes by the row's issue. */
function entity(row: ActivityRow) {
  return String(row.before?.id ?? row.after?.id ?? row.issue_id ?? "")
}

function touched(row: ActivityRow) {
  return [...Object.keys(row.before ?? {}), ...Object.keys(row.after ?? {})].filter((key) => key !== "id")
}

function reaches(
  edges: ReadonlyArray<{ readonly issue_id: string; readonly depends_on_id: string }>,
  from: string,
  to: string,
  seen: Set<string>,
): boolean {
  if (from === to) return true
  if (seen.has(from)) return false
  seen.add(from)
  return edges.filter((edge) => edge.issue_id === from).some((edge) => reaches(edges, edge.depends_on_id, to, seen))
}

function toProject(row: ProjectRow): Board.Project {
  return {
    id: row.id,
    key: row.key,
    name: row.name,
    goal: row.goal,
    targetDate: row.target_date,
    budgetUsd: row.budget_usd,
    repoProjectID: row.repo_project_id,
    githubRepo: row.github_repo,
    status: row.status,
    pausedReason: row.paused_reason,
    autoAcceptIntake: row.auto_accept_intake,
    githubState: row.github_state,
    githubError: row.github_error,
    githubSyncedAt: row.github_synced_at,
  }
}

function toEpic(key: string, row: typeof BoardEpicTable.$inferSelect): Board.Epic {
  return {
    id: row.id,
    number: row.number,
    ref: `${key}-E${row.number}`,
    title: row.title,
    goal: row.goal,
    position: row.position,
    status: row.status,
    githubMilestone: row.github_milestone,
  }
}

function toQuestion(
  row: QuestionRow,
  known: { readonly issues: Map<string, number>; readonly epics: Map<string, number> },
): Board.Question {
  return {
    id: row.id,
    issue: row.issue_id ? (known.issues.get(row.issue_id) ?? null) : null,
    epic: row.epic_id ? (known.epics.get(row.epic_id) ?? null) : null,
    text: row.text,
    options: row.options,
    recommended: row.recommended,
    costOfWaiting: row.cost_of_waiting,
    blocking: row.blocking,
    status: row.status,
    answerOption: row.answer_option,
    answerText: row.answer_text,
    answeredAt: row.answered_at,
    timeCreated: row.time_created,
  }
}

function toDecision(row: DecisionRow, known: { readonly issues: Map<string, number>; readonly epics: Map<string, number> }): Board.Decision {
  const chosen = row.options.find((option) => option.id === row.chosen)
  return {
    id: row.id,
    issue: row.issue_id ? (known.issues.get(row.issue_id) ?? null) : null,
    epic: row.epic_id ? (known.epics.get(row.epic_id) ?? null) : null,
    date: row.answered_at,
    question: row.question,
    options: row.options,
    recommended: row.recommended,
    chosen: row.chosen,
    chosenLabel: chosen?.label ?? row.chosen,
    text: row.chosen_text,
    answeredBy: row.answered_by,
    outcome: row.outcome ?? "applied, no result yet",
    outcomeAt: row.outcome_at,
    supersedes: row.supersedes_id,
    overturnedBy: row.overturned_by_id,
  }
}

/** A check conclusion that is neither a pass nor a skip. */
function failed(conclusion: string | null) {
  return conclusion !== null && !["success", "neutral", "skipped"].includes(conclusion.toLowerCase())
}

function toNote(row: typeof BoardNoteTable.$inferSelect, issue: number): Board.Note {
  return { id: row.id, issue, author: row.author, body: row.body, timeCreated: row.time_created }
}

// Never the stored path or credential id.
function toAttachment(row: typeof BoardAttachmentTable.$inferSelect, issue: number): Board.Attachment {
  return { id: row.id, issue, kind: row.kind, name: row.name, mime: row.mime, size: row.size, timeCreated: row.time_created }
}

function toActivity(row: ActivityRow, issues: Map<string, number>): Board.Activity {
  return {
    id: row.id,
    issue: row.issue_id ? (issues.get(row.issue_id) ?? null) : null,
    actor: row.actor,
    action: row.action,
    reason: row.reason,
    before: row.before,
    after: row.after,
    undoes: row.undoes,
    undoneBy: row.undone_by,
    timeCreated: row.time_created,
  }
}
