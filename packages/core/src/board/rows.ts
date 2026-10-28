import { Board } from "@orchestra/schema/board"
import type { BoardAttachmentTable, BoardEpicTable, BoardNoteTable } from "./sql"
import type { ActivityRow, DecisionRow, ProjectRow, QuestionRow } from "./shared"

// Row to wire-shape mappers, with no database access.

/** Epics and questions are named by an `id` key in the row; issue changes by the row's issue. */
export function entity(row: ActivityRow) {
  return String(row.before?.id ?? row.after?.id ?? row.issue_id ?? "")
}

export function touched(row: ActivityRow) {
  return [...Object.keys(row.before ?? {}), ...Object.keys(row.after ?? {})].filter((key) => key !== "id")
}

export function toProject(row: ProjectRow): Board.Project {
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

export function toEpic(key: string, row: typeof BoardEpicTable.$inferSelect): Board.Epic {
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

export function toQuestion(
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

export function toDecision(row: DecisionRow, known: { readonly issues: Map<string, number>; readonly epics: Map<string, number> }): Board.Decision {
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

export function toNote(row: typeof BoardNoteTable.$inferSelect, issue: number): Board.Note {
  return { id: row.id, issue, kind: row.kind, author: row.author, body: row.body, timeCreated: row.time_created }
}

// Never the stored path or credential id.
export function toAttachment(row: typeof BoardAttachmentTable.$inferSelect, issue: number): Board.Attachment {
  return { id: row.id, issue, kind: row.kind, name: row.name, mime: row.mime, size: row.size, timeCreated: row.time_created }
}

export function toActivity(row: ActivityRow, issues: Map<string, number>): Board.Activity {
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

