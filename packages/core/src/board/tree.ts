export * as BoardTree from "./tree"

import { and, eq, isNull, max } from "drizzle-orm"
import type { EffectDrizzleQueryError } from "drizzle-orm/effect-core/errors"
import { Effect, Schema } from "effect"
import { Board } from "@orchestra/schema/board"
import { readBoard, type BoardEvent, type BoardEventInput } from "@orchestra/atlas-boundary/record-log"
import {
  BoardActivityTable,
  BoardDecisionTable,
  BoardDependencyTable,
  BoardEpicTable,
  BoardIssueTable,
  BoardNoteTable,
  BoardProjectTable,
  BoardQuestionTable,
  BoardStepTable,
} from "./sql"
import type { ActivityRow, Fields, Tx } from "./shared"

// The board log in the record tree (`.atlas/board`) and the import that rebuilds the board from it. Import restores
// projects, epics, issues, steps, dependencies, questions, decisions, notes and the activity log itself. The queue,
// bundles, attempts, checks and GitHub sync state are re-derived from git, GitHub and the card records, so import leaves
// them empty. Attachments are left out on purpose: their bytes and secrets never enter the log.

export class UnknownActionError extends Schema.TaggedErrorClass<UnknownActionError>()("BoardTree.UnknownActionError", {
  activity: Schema.String,
  action: Schema.String,
}) {}

export class ReplayError extends Schema.TaggedErrorClass<ReplayError>()("BoardTree.ReplayError", {
  activity: Schema.String,
  message: Schema.String,
}) {}

// Free text a board write may hold; the log keeps it out of `before` and `after` so a public tree can drop it.
const PROSE = ["description", "body", "reason", "text", "question", "answer", "answer_text", "record", "cause", "options", "cost_of_waiting", "paused_reason", "crash_reason"]
// A prose value that is not a string travels as JSON under this suffix, so import can parse it back.
const JSON_SUFFIX = ".json"

/** The board event for one activity row; `issue` is the card key when the row names an issue. */
export function event(project: string, issue: string | undefined, row: ActivityRow): BoardEventInput {
  const text = prose(row)
  return {
    activity: row.id,
    project,
    ...(issue ? { issue } : {}),
    actor: row.actor,
    action: row.action,
    at: new Date(row.time_created).toISOString(),
    ...(row.before ? { before: structure(row.before) } : {}),
    ...(row.after ? { after: structure(row.after) } : {}),
    ...(row.undoes ? { undoes: row.undoes } : {}),
    ...(Object.keys(text).length > 0 ? { text } : {}),
  }
}

/** Rebuilds the board of an empty database from the record tree at `repoPath`. */
export const restore = Effect.fnUntraced(function* (tx: Tx, repoPath: string) {
  if (yield* tx.select({ id: BoardProjectTable.id }).from(BoardProjectTable).get())
    return yield* new ReplayError({ activity: "", message: "Import needs an empty board." })
  // Ids are minted in order within a millisecond, so they break ties inside one; across milliseconds they can wrap.
  const events = readBoard(repoPath).events.toSorted((a, b) => (a.at === b.at ? a.activity.localeCompare(b.activity) : a.at.localeCompare(b.at)))
  const cards = new Map<string, Board.IssueID>()
  for (const item of events) {
    const apply = APPLIERS[item.action as Board.Action]
    if (!apply) return yield* new UnknownActionError({ activity: item.activity, action: item.action })
    const redacted = item.text === undefined && item.textHash !== undefined
    const before = merge(item.before, item.text, "before")
    const after = merge(item.after, item.text, "after")
    const ctx = { tx, item, before, after, at: Date.parse(item.at), cards, project: yield* projectOf(tx, item) }
    yield* apply(ctx)
    const project = ctx.project ?? (yield* projectOf(tx, item))
    if (!project) return yield* new ReplayError({ activity: item.activity, message: `Project ${item.project} does not exist.` })
    yield* tx
      .insert(BoardActivityTable)
      .values({
        id: item.activity as Board.ActivityID,
        project_id: project.id,
        issue_id: item.issue ? (cards.get(item.issue) ?? null) : null,
        actor: item.actor as Board.Actor,
        action: item.action as Board.Action,
        // A public tree carries only the prose's hash; the gap stays visible in the log.
        reason: redacted ? `[redacted ${item.textHash}]` : (item.text?.reason ?? null),
        before,
        after,
        undoes: (item.undoes as Board.ActivityID | undefined) ?? null,
        time_created: ctx.at,
      })
      .run()
    if (item.undoes)
      yield* tx
        .update(BoardActivityTable)
        .set({ undone_by: item.activity as Board.ActivityID })
        .where(eq(BoardActivityTable.id, item.undoes as Board.ActivityID))
        .run()
  }
  return events.length
})

type Context = {
  readonly tx: Tx
  readonly item: BoardEvent
  readonly before: Fields | null
  readonly after: Fields | null
  readonly at: number
  readonly cards: Map<string, Board.IssueID>
  project: typeof BoardProjectTable.$inferSelect | undefined
}

const PROJECT_COLUMNS = ["name", "goal", "target_date", "github_repo", "budget_usd", "status", "paused_reason"]
const EPIC_COLUMNS = ["title", "goal", "position", "status"]
const ISSUE_COLUMNS = [
  "title",
  "body",
  "type",
  "epic_id",
  "estimate",
  "seat",
  "session_id",
  "branch",
  "pr_number",
  "stage",
  "position",
  "stage_entered_at",
  "attempts",
  "crash_reason",
  "guardrail_rule",
  "area",
  "order",
  "record",
  "hold_before_merge",
  "paused",
  "github_number",
]

const nothing = (_: Context) => Effect.void

// One applier per action. An action missing here fails the import by name; none is skipped.
const APPLIERS: Record<Board.Action, (ctx: Context) => Effect.Effect<void, ReplayError | EffectDrizzleQueryError>> = {
  "project.upsert": Effect.fnUntraced(function* (ctx) {
    if (ctx.project) return yield* updateProject(ctx)
    yield* ctx.tx
      .insert(BoardProjectTable)
      .values({
        id: Board.ProjectID.create(),
        key: ctx.item.project,
        name: String(ctx.after?.name ?? ctx.item.project),
        goal: String(ctx.after?.goal ?? ""),
        target_date: (ctx.after?.target_date as number | null | undefined) ?? null,
        github_repo: (ctx.after?.github_repo as string | null | undefined) ?? null,
        status: "active",
        github_state: "off",
        next_issue_number: 1,
        next_epic_number: 1,
      })
      .run()
  }),
  "epic.upsert": Effect.fnUntraced(function* (ctx) {
    const project = yield* requireProject(ctx)
    const id = String(ctx.after?.id ?? ctx.before?.id) as Board.EpicID
    if (ctx.before) {
      yield* ctx.tx.update(BoardEpicTable).set(pick(ctx.after, EPIC_COLUMNS)).where(eq(BoardEpicTable.id, id)).run()
      return
    }
    const number = Number(ctx.after?.number)
    yield* ctx.tx
      .insert(BoardEpicTable)
      .values({
        id,
        project_id: project.id,
        number,
        title: String(ctx.after?.title ?? ""),
        goal: String(ctx.after?.goal ?? ""),
        position: Number(ctx.after?.position ?? number),
        status: (ctx.after?.status as Board.Epic["status"] | undefined) ?? "open",
      })
      .run()
    yield* ctx.tx
      .update(BoardProjectTable)
      .set({ next_epic_number: Math.max(project.next_epic_number, number + 1) })
      .where(eq(BoardProjectTable.id, project.id))
      .run()
  }),
  "issue.create": Effect.fnUntraced(function* (ctx) {
    const project = yield* requireProject(ctx)
    const number = Number(ctx.after?.number)
    const id = Board.IssueID.create()
    const stage = (ctx.after?.stage as Board.Stage | undefined) ?? "backlog"
    const last = yield* ctx.tx
      .select({ position: max(BoardIssueTable.position) })
      .from(BoardIssueTable)
      .where(and(eq(BoardIssueTable.project_id, project.id), eq(BoardIssueTable.stage, stage)))
      .get()
    yield* ctx.tx
      .insert(BoardIssueTable)
      .values({
        title: "",
        body: "",
        type: "feature",
        position: (last?.position ?? 0) + 1,
        stage_entered_at: ctx.at,
        ...pick(ctx.after, ISSUE_COLUMNS),
        id,
        project_id: project.id,
        number,
        stage,
      } as typeof BoardIssueTable.$inferInsert)
      .run()
    yield* ctx.tx
      .update(BoardProjectTable)
      .set({ next_issue_number: Math.max(project.next_issue_number, number + 1) })
      .where(eq(BoardProjectTable.id, project.id))
      .run()
    ctx.cards.set(`${project.key}-${number}`, id)
    if (Array.isArray(ctx.after?.depends_on)) yield* dependencies(ctx, id, ctx.after.depends_on)
  }),
  "issue.update": (ctx) => issueFields(ctx),
  "issue.move": (ctx) => issueFields(ctx),
  "intake.accept": (ctx) => issueFields(ctx),
  "intake.decline": (ctx) => issueFields(ctx),
  "hold.set": (ctx) => issueFields(ctx),
  "queue.add": (ctx) => issueFields(ctx),
  "queue.remove": (ctx) => issueFields(ctx),
  "bundle.merge": (ctx) => issueFields(ctx),
  // A dissolve by eject sends the card back to review; a plain dissolve names only the bundle.
  "bundle.dissolve": (ctx) => issueFields(ctx),
  "bundle.cut": nothing,
  "pause.set": (ctx) => (ctx.item.issue ? issueFields(ctx) : updateProject(ctx)),
  "archive.set": (ctx) => updateProject(ctx),
  "steps.set": Effect.fnUntraced(function* (ctx) {
    yield* steps(ctx, yield* requireIssue(ctx), ctx.after?.steps)
  }),
  "question.ask": Effect.fnUntraced(function* (ctx) {
    const project = yield* requireProject(ctx)
    yield* ctx.tx
      .insert(BoardQuestionTable)
      .values({
        id: String(ctx.after?.id) as Board.QuestionID,
        project_id: project.id,
        issue_id: ctx.item.issue ? yield* requireIssue(ctx) : null,
        epic_id: (ctx.after?.epic_id as Board.EpicID | null | undefined) ?? null,
        text: String(ctx.after?.text ?? ""),
        options: (ctx.after?.options as Board.Question["options"] | undefined) ?? [],
        recommended: String(ctx.after?.recommended ?? ""),
        cost_of_waiting: (ctx.after?.cost_of_waiting as string | null | undefined) ?? null,
        kind: (ctx.after?.kind as string | null | undefined) ?? null,
        blocking: Boolean(ctx.after?.blocking),
        status: "open",
      })
      .run()
  }),
  "question.withdraw": Effect.fnUntraced(function* (ctx) {
    yield* ctx.tx
      .update(BoardQuestionTable)
      .set({ status: ctx.after?.status === "withdrawn" ? "withdrawn" : "open" })
      .where(eq(BoardQuestionTable.id, String(ctx.after?.id ?? ctx.before?.id) as Board.QuestionID))
      .run()
  }),
  // One action, three writes: a first answer, a changed answer that supersedes the standing decision, and Maestro
  // recording a decision's outcome.
  "question.answer": Effect.fnUntraced(function* (ctx) {
    const question = String(ctx.after?.id) as Board.QuestionID
    const decision = String(ctx.after?.decision) as Board.DecisionID
    if (ctx.after && "outcome" in ctx.after) {
      yield* ctx.tx
        .update(BoardDecisionTable)
        .set({ outcome: (ctx.after.outcome as string | null) ?? null, outcome_at: ctx.at })
        .where(eq(BoardDecisionTable.id, decision))
        .run()
      return
    }
    const row = yield* ctx.tx.select().from(BoardQuestionTable).where(eq(BoardQuestionTable.id, question)).get()
    if (!row) return yield* new ReplayError({ activity: ctx.item.activity, message: `Question ${question} does not exist.` })
    const chosen = String(ctx.after?.answer_option ?? "")
    const chosenText = (ctx.after?.answer_text as string | null | undefined) ?? null
    const standing = yield* ctx.tx
      .select({ id: BoardDecisionTable.id })
      .from(BoardDecisionTable)
      .where(and(eq(BoardDecisionTable.question_id, question), isNull(BoardDecisionTable.overturned_by_id)))
      .get()
    yield* ctx.tx
      .update(BoardQuestionTable)
      .set({ status: "answered", answer_option: chosen, answer_text: chosenText, answered_at: ctx.at })
      .where(eq(BoardQuestionTable.id, question))
      .run()
    yield* ctx.tx
      .insert(BoardDecisionTable)
      .values({
        id: decision,
        project_id: row.project_id,
        issue_id: row.issue_id,
        epic_id: row.epic_id,
        question_id: question,
        question: row.text,
        options: row.options,
        recommended: row.recommended,
        chosen,
        chosen_text: chosenText,
        answered_by: "owner",
        answered_at: ctx.at,
        supersedes_id: standing?.id ?? null,
      })
      .run()
    if (standing)
      yield* ctx.tx.update(BoardDecisionTable).set({ overturned_by_id: decision }).where(eq(BoardDecisionTable.id, standing.id)).run()
  }),
  "note.add": Effect.fnUntraced(function* (ctx) {
    yield* ctx.tx
      .insert(BoardNoteTable)
      .values({
        id: String(ctx.after?.id) as Board.NoteID,
        issue_id: yield* requireIssue(ctx),
        author: String(ctx.after?.author ?? "owner"),
        body: String(ctx.after?.body ?? ""),
      })
      .run()
  }),
  "note.edit": Effect.fnUntraced(function* (ctx) {
    yield* ctx.tx
      .update(BoardNoteTable)
      .set({ body: String(ctx.after?.body ?? "") })
      .where(eq(BoardNoteTable.id, String(ctx.after?.id) as Board.NoteID))
      .run()
  }),
  "note.delete": Effect.fnUntraced(function* (ctx) {
    yield* ctx.tx
      .delete(BoardNoteTable)
      .where(eq(BoardNoteTable.id, String(ctx.before?.id) as Board.NoteID))
      .run()
  }),
  // Attachment bytes and secrets stay out of the log on purpose, so there is nothing to restore.
  "attachment.add": nothing,
  "attachment.remove": nothing,
  // An overwrite only marks the issue for the next push; the board's own fields did not change.
  "github.overwrite": nothing,
  // Sync state is re-derived by the next GitHub sync.
  "github.state": nothing,
  // An undo carries the target's earlier fields in `after`; it restores them the way the board's own undo does.
  undo: Effect.fnUntraced(function* (ctx) {
    const target = yield* ctx.tx
      .select({ action: BoardActivityTable.action, before: BoardActivityTable.before, after: BoardActivityTable.after })
      .from(BoardActivityTable)
      .where(eq(BoardActivityTable.id, String(ctx.item.undoes) as Board.ActivityID))
      .get()
    if (!target) return yield* new ReplayError({ activity: ctx.item.activity, message: `Undo target ${ctx.item.undoes} is not in the log.` })
    if (target.action === "question.withdraw") {
      yield* ctx.tx
        .update(BoardQuestionTable)
        .set({ status: ctx.after?.status === "withdrawn" ? "withdrawn" : "open" })
        .where(eq(BoardQuestionTable.id, String(target.after?.id ?? target.before?.id) as Board.QuestionID))
        .run()
      return
    }
    if (target.action === "epic.upsert") {
      const id = String(target.after?.id ?? target.before?.id) as Board.EpicID
      if (!ctx.after) return yield* Effect.asVoid(ctx.tx.delete(BoardEpicTable).where(eq(BoardEpicTable.id, id)).run())
      yield* ctx.tx.update(BoardEpicTable).set(pick(ctx.after, EPIC_COLUMNS)).where(eq(BoardEpicTable.id, id)).run()
      return
    }
    if (!ctx.item.issue || !ctx.after) return
    const issue = yield* requireIssue(ctx)
    if (Array.isArray(ctx.after.steps)) yield* steps(ctx, issue, ctx.after.steps)
    if (Array.isArray(ctx.after.depends_on)) yield* dependencies(ctx, issue, ctx.after.depends_on)
    yield* issueFields(ctx)
  }),
}

const issueFields = Effect.fnUntraced(function* (ctx: Context) {
  if (!ctx.item.issue) return
  const issue = yield* requireIssue(ctx)
  if (Array.isArray(ctx.after?.depends_on) && ctx.item.action === "issue.update") yield* dependencies(ctx, issue, ctx.after.depends_on)
  const columns = pick(ctx.after, ISSUE_COLUMNS)
  if (Object.keys(columns).length === 0) return
  yield* ctx.tx.update(BoardIssueTable).set(columns).where(eq(BoardIssueTable.id, issue)).run()
})

const updateProject = Effect.fnUntraced(function* (ctx: Context) {
  const project = yield* requireProject(ctx)
  const columns = pick(ctx.after, PROJECT_COLUMNS)
  if (Object.keys(columns).length === 0) return
  yield* ctx.tx.update(BoardProjectTable).set(columns).where(eq(BoardProjectTable.id, project.id)).run()
})

const steps = Effect.fnUntraced(function* (ctx: Context, issue: Board.IssueID, value: unknown) {
  yield* ctx.tx.delete(BoardStepTable).where(eq(BoardStepTable.issue_id, issue)).run()
  const list = Array.isArray(value) ? (value as Board.Step[]) : []
  if (list.length === 0) return
  yield* ctx.tx
    .insert(BoardStepTable)
    .values(
      list.map((step, position) => ({
        id: Board.StepID.create(),
        issue_id: issue,
        position,
        title: step.title,
        status: step.status,
        now: step.now ?? null,
      })),
    )
    .run()
})

const dependencies = Effect.fnUntraced(function* (ctx: Context, issue: Board.IssueID, refs: ReadonlyArray<unknown>) {
  const project = yield* requireProject(ctx)
  yield* ctx.tx.delete(BoardDependencyTable).where(eq(BoardDependencyTable.issue_id, issue)).run()
  // Older rows logged a bare number; the board resolved it inside the card's own project.
  const targets = refs.flatMap((ref) => {
    const key = /^\d+$/.test(String(ref)) ? `${project.key}-${ref}` : String(ref)
    const id = ctx.cards.get(key)
    return id && id !== issue ? [{ issue_id: issue, depends_on_id: id }] : []
  })
  if (targets.length > 0) yield* ctx.tx.insert(BoardDependencyTable).values(targets).run()
})

const projectOf = Effect.fnUntraced(function* (tx: Tx, item: BoardEvent) {
  return yield* tx.select().from(BoardProjectTable).where(eq(BoardProjectTable.key, item.project)).get()
})

const requireProject = Effect.fnUntraced(function* (ctx: Context) {
  const project = yield* projectOf(ctx.tx, ctx.item)
  if (!project) return yield* new ReplayError({ activity: ctx.item.activity, message: `Project ${ctx.item.project} does not exist.` })
  return project
})

const requireIssue = Effect.fnUntraced(function* (ctx: Context) {
  const issue = ctx.item.issue ? ctx.cards.get(ctx.item.issue) : undefined
  if (!issue) return yield* new ReplayError({ activity: ctx.item.activity, message: `Card ${ctx.item.issue} does not exist.` })
  return issue
})

function pick(fields: Fields | null, columns: ReadonlyArray<string>) {
  return Object.fromEntries(Object.entries(fields ?? {}).filter((entry) => columns.includes(entry[0])))
}

function structure(value: Fields) {
  return Object.fromEntries(Object.entries(value).filter((entry) => !PROSE.includes(entry[0])))
}

function prose(row: Pick<ActivityRow, "reason" | "before" | "after">) {
  const sides = [
    ["before", row.before],
    ["after", row.after],
  ] as const
  return Object.fromEntries([
    ...(row.reason ? [["reason", row.reason]] : []),
    ...sides.flatMap((side) =>
      Object.entries(side[1] ?? {})
        .filter((entry) => PROSE.includes(entry[0]) && entry[1] !== undefined)
        .map((entry) =>
          typeof entry[1] === "string" ? [`${side[0]}.${entry[0]}`, entry[1]] : [`${side[0]}.${entry[0]}${JSON_SUFFIX}`, JSON.stringify(entry[1])],
        ),
    ),
  ])
}

// Puts a side's prose back into its structure. Without text (a public tree) the prose keys stay absent.
function merge(side: BoardEvent["before"], text: BoardEvent["text"], name: "before" | "after"): Fields | null {
  if (!side && !Object.keys(text ?? {}).some((key) => key.startsWith(`${name}.`))) return null
  const prefix = `${name}.`
  return {
    ...side,
    ...Object.fromEntries(
      Object.entries(text ?? {})
        .filter((entry) => entry[0].startsWith(prefix))
        .map((entry) => {
          const key = entry[0].slice(prefix.length)
          return key.endsWith(JSON_SUFFIX) ? [key.slice(0, -JSON_SUFFIX.length), JSON.parse(entry[1])] : [key, entry[1]]
        }),
    ),
  }
}
