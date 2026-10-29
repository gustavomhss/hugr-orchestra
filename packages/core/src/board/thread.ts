export * as BoardThread from "./thread"

import { and, desc, eq, isNotNull } from "drizzle-orm"
import { Effect } from "effect"
import { Board } from "@orchestra/schema/board"
import { BoardIssueTable, BoardNoteTable, BoardProjectTable } from "./sql"
import type { Database } from "../database/database"

// Callers pass either the database or an open transaction.
type Tx = Pick<Database.Interface["db"], "select" | "insert">

// Thread notes are written by the host only; they are read-only to people. Their ids are deterministic, so an exact
// retry of the same work hits the primary key and writes nothing twice.

export const card = Effect.fnUntraced(function* (tx: Tx, key: string) {
  if (!/^[A-Z][A-Z0-9]*-\d+$/.test(key)) return undefined
  const dash = key.lastIndexOf("-")
  const project = yield* tx.select().from(BoardProjectTable).where(eq(BoardProjectTable.key, key.slice(0, dash))).get()
  if (!project) return undefined
  return yield* tx
    .select()
    .from(BoardIssueTable)
    .where(and(eq(BoardIssueTable.project_id, project.id), eq(BoardIssueTable.number, Number(key.slice(dash + 1)))))
    .get()
})

export const bySession = Effect.fnUntraced(function* (tx: Tx, sessionID: string) {
  return yield* tx.select().from(BoardIssueTable).where(eq(BoardIssueTable.session_id, sessionID)).get()
})

export const last = Effect.fnUntraced(function* (tx: Tx, issue: Board.IssueID) {
  const note = yield* tx
    .select()
    .from(BoardNoteTable)
    .where(and(eq(BoardNoteTable.issue_id, issue), isNotNull(BoardNoteTable.kind)))
    .orderBy(desc(BoardNoteTable.time_created), desc(BoardNoteTable.id))
    .limit(1)
    .get()
  return note?.kind ?? undefined
})

export const write = Effect.fnUntraced(function* (
  tx: Tx,
  input: { readonly id: string; readonly issue: Board.IssueID; readonly kind: Board.NoteKind; readonly author: string; readonly body: string },
) {
  yield* tx
    .insert(BoardNoteTable)
    .values({
      id: Board.NoteID.make(input.id),
      issue_id: input.issue,
      author: input.author,
      body: input.body,
      kind: input.kind,
    })
    .onConflictDoNothing()
    .run()
})
