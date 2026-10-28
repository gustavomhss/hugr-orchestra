import { and, asc, eq, inArray, ne } from "drizzle-orm"
import { Clock, Effect, Schema } from "effect"
import { ChildProcess } from "effect/unstable/process"
import { Board } from "@orchestra/schema/board"
import type { Database } from "../database/database"
import type { AppProcess } from "../process"
import { ProjectTable } from "../project/sql"
import {
  BoardActivityTable,
  BoardDecisionTable,
  BoardDependencyTable,
  BoardEpicTable,
  BoardIssueTable,
  BoardProjectTable,
  BoardQuestionTable,
} from "./sql"
import { BoardForecast } from "./forecast"

// What the board service and its slice modules (money, decision, proof) share: errors, row types and the lookups that
// need nothing but a transaction.

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

export type Tx = Parameters<Parameters<Database.Interface["db"]["transaction"]>[0]>[0]
export type ProjectRow = typeof BoardProjectTable.$inferSelect
export type IssueRow = typeof BoardIssueTable.$inferSelect
export type ActivityRow = typeof BoardActivityTable.$inferSelect
export type QuestionRow = typeof BoardQuestionTable.$inferSelect
export type DecisionRow = typeof BoardDecisionTable.$inferSelect
export type Fields = Record<string, unknown>
export type Changed = { readonly project: string; readonly issue?: string; readonly activity: string }
export type Git = ReturnType<typeof gitRunner>

/** Runs git in `cwd` and never fails: a git that could not start reads as exit 1 with its message on `err`. */
export function gitRunner(proc: AppProcess.Interface, base?: NodeJS.ProcessEnv) {
  return (cwd: string, args: ReadonlyArray<string>, env?: Record<string, string>) =>
    proc
      .run(
        ChildProcess.make("git", ["--no-optional-locks", "-C", cwd, "-c", "core.fsmonitor=false", ...args], {
          cwd,
          env: { ...base, ...env },
          extendEnv: true,
          stdin: "ignore",
        }),
        { maxOutputBytes: 4 * 1024 * 1024, maxErrorBytes: 16 * 1024, timeout: "120 seconds" },
      )
      .pipe(
        Effect.map((result) => ({ code: result.exitCode, out: result.stdout.toString("utf8").trim(), err: result.stderr.toString("utf8").trim() })),
        Effect.catch((error) => Effect.succeed({ code: 1, out: "", err: error.message })),
      )
}


export function archived(project: ProjectRow) {
  return new RefusedError({ message: `${project.key} is archived; the owner unarchives it before anything changes.` })
}

export function changed(project: string, activity: string, issue?: string | null): Changed {
  return issue ? { project, issue, activity } : { project, activity }
}

/** The changed fields of `next` against `row`, or undefined when nothing changes. Undefined in `next` means untouched. */
export function diff<T extends Fields>(row: Fields, next: T) {
  const keys = Object.keys(next).filter((key) => next[key] !== undefined && !Object.is(row[key], next[key]))
  if (keys.length === 0) return undefined
  return {
    before: Object.fromEntries(keys.map((key) => [key, row[key]])) as Fields,
    after: Object.fromEntries(keys.map((key) => [key, next[key]])) as Partial<T>,
  }
}

export const loadProject = Effect.fnUntraced(function* (tx: Tx, key: string) {
  const row = yield* tx.select().from(BoardProjectTable).where(eq(BoardProjectTable.key, key)).get()
  if (!row) return yield* new NotFoundError({ message: `There is no board project ${key}.` })
  return row
})

export const loadIssue = Effect.fnUntraced(function* (tx: Tx, project: ProjectRow, number: number) {
  const row = yield* tx
    .select()
    .from(BoardIssueTable)
    .where(and(eq(BoardIssueTable.project_id, project.id), eq(BoardIssueTable.number, number)))
    .get()
  if (!row) return yield* new NotFoundError({ message: `${project.key}-${number} does not exist.` })
  return row
})

export const loadEpic = Effect.fnUntraced(function* (tx: Tx, project: ProjectRow, number: number) {
  const row = yield* tx
    .select()
    .from(BoardEpicTable)
    .where(and(eq(BoardEpicTable.project_id, project.id), eq(BoardEpicTable.number, number)))
    .get()
  if (!row) return yield* new NotFoundError({ message: `${project.key}-E${number} does not exist.` })
  return row
})

export const log = Effect.fnUntraced(function* (
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

export const numbers = Effect.fnUntraced(function* (tx: Tx, project: ProjectRow) {
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

export const worktree = Effect.fnUntraced(function* (tx: Tx, project: ProjectRow) {
  if (!project.repo_project_id) return null
  const row = yield* tx
    .select({ worktree: ProjectTable.worktree })
    .from(ProjectTable)
    .where(eq(ProjectTable.id, project.repo_project_id))
    .get()
  return row?.worktree ?? null
})

export const forecastOf = Effect.fnUntraced(function* (tx: Tx, project: ProjectRow) {
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
