export * as BoardDecision from "./decision"

import { and, desc, eq, isNull, or } from "drizzle-orm"
import { Clock, Effect } from "effect"
import { Board } from "@orchestra/schema/board"
import { BoardDecisionTable, BoardQuestionTable } from "./sql"
import { toDecision } from "./rows"
import { NotFoundError, RefusedError, changed, loadProject, log, numbers } from "./shared"
import type { ProjectRow, QuestionRow, Tx } from "./shared"

// Every answered question is kept as a decision; overturning one links the old to the new instead of editing it.

export const list = Effect.fnUntraced(function* (tx: Tx, key: string) {
  const project = yield* loadProject(tx, key)
  const known = yield* numbers(tx, project)
  const rows = yield* tx
    .select()
    .from(BoardDecisionTable)
    .where(eq(BoardDecisionTable.project_id, project.id))
    .orderBy(desc(BoardDecisionTable.answered_at), desc(BoardDecisionTable.id))
    .all()
  return rows.map((row) => toDecision(row, known))
})

/** The decision row an answer leaves behind. */
export const record = Effect.fnUntraced(function* (tx: Tx, project: ProjectRow, question: QuestionRow, input: Board.AnswerInput, now: number) {
  const id = Board.DecisionID.create()
  yield* tx
    .insert(BoardDecisionTable)
    .values({
      id,
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
  return id
})

export const change = Effect.fnUntraced(function* (tx: Tx, key: string, id: string, input: Board.DecisionChangeInput) {
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
})

export const outcome = Effect.fnUntraced(function* (tx: Tx, input: Board.DecisionOutcomeInput) {
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
})
