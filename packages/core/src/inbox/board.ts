import { and, eq, ne, or } from "drizzle-orm"
import { createHash } from "node:crypto"
import { Effect } from "effect"
import { BoardIssueTable, BoardProjectTable, BoardQuestionTable } from "../board/sql"
import type { Database } from "../database/database"
import type { Location } from "../location"
import type { Pulled } from "./types"

type Db = Database.Interface["db"]
type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0]

/** Ids that belong to this location's Board, open or not. Another location's rows are not in this set. */
export const boardScope = Effect.fn("InboxBoard.scope")(function* (db: Db | Tx, location: Location.Interface) {
  const questions = yield* db
    .select({ id: BoardQuestionTable.id })
    .from(BoardQuestionTable)
    .innerJoin(BoardProjectTable, eq(BoardQuestionTable.project_id, BoardProjectTable.id))
    .where(eq(BoardProjectTable.repo_project_id, location.project.id))
    .all()
  const issues = yield* db
    .select({ id: BoardIssueTable.id })
    .from(BoardIssueTable)
    .innerJoin(BoardProjectTable, eq(BoardIssueTable.project_id, BoardProjectTable.id))
    .where(eq(BoardProjectTable.repo_project_id, location.project.id))
    .all()
  return new Set([
    ...questions.map((question) => `question:${question.id}`),
    ...issues.map((issue) => `approval:${issue.id}`),
  ])
})

/** A read-only projection of owner questions/intake/held deliveries; never invokes the Board runner or Maestro. */
export const boardItems = Effect.fn("InboxBoard.items")(function* (db: Db | Tx, location: Location.Interface) {
  const questions = yield* db
    .select({
      id: BoardQuestionTable.id,
      text: BoardQuestionTable.text,
      options: BoardQuestionTable.options,
      recommended: BoardQuestionTable.recommended,
      key: BoardProjectTable.key,
    })
    .from(BoardQuestionTable)
    .innerJoin(BoardProjectTable, eq(BoardQuestionTable.project_id, BoardProjectTable.id))
    .where(
      and(
        eq(BoardProjectTable.repo_project_id, location.project.id),
        ne(BoardProjectTable.status, "archived"),
        eq(BoardQuestionTable.status, "open"),
      ),
    )
    .all()
  const issues = yield* db
    .select({
      id: BoardIssueTable.id,
      title: BoardIssueTable.title,
      number: BoardIssueTable.number,
      stage: BoardIssueTable.stage,
      held: BoardIssueTable.hold_before_merge,
      key: BoardProjectTable.key,
    })
    .from(BoardIssueTable)
    .innerJoin(BoardProjectTable, eq(BoardIssueTable.project_id, BoardProjectTable.id))
    .where(
      and(
        eq(BoardProjectTable.repo_project_id, location.project.id),
        ne(BoardProjectTable.status, "archived"),
        or(
          and(eq(BoardIssueTable.stage, "intake"), eq(BoardProjectTable.auto_accept_intake, false)),
          and(eq(BoardIssueTable.stage, "review"), eq(BoardIssueTable.hold_before_merge, true)),
        ),
      ),
    )
    .all()
  return [
    ...questions.map(
      (question): Pulled => ({
        source: "board",
        externalId: `question:${question.id}`,
        actor: question.key,
        snippet: question.text,
        threadId: question.id,
        reply: false,
        revision: createHash("sha256")
          .update(JSON.stringify([question.text, question.options, question.recommended]))
          .digest("hex"),
      }),
    ),
    ...issues.map(
      (issue): Pulled => ({
        source: "board",
        externalId: `approval:${issue.id}`,
        actor: `${issue.key}-${issue.number}`,
        snippet: issue.title,
        threadId: issue.id,
        reply: false,
        revision: `${issue.stage}:${issue.held}:${issue.title}`,
      }),
    ),
  ]
})
