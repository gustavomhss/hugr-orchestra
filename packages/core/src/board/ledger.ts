export * as BoardLedger from "./ledger"

import { and, asc, desc, eq, inArray, isNotNull } from "drizzle-orm"
import { Effect } from "effect"
import type { Board } from "@orchestra/schema/board"
import { BoardActivityTable, BoardAttemptTable, BoardCheckTable, BoardIssueTable } from "./sql"
import type { ProjectRow, Tx } from "./shared"

// The conveyor's numbers for one project's pool (merge-queue spec section 12). Each is null until its rows exist.
export const of = Effect.fnUntraced(function* (tx: Tx, project: ProjectRow) {
  const merges = yield* tx
    .select({ issue: BoardActivityTable.issue_id, at: BoardActivityTable.time_created })
    .from(BoardActivityTable)
    .where(
      and(eq(BoardActivityTable.project_id, project.id), eq(BoardActivityTable.action, "bundle.merge"), isNotNull(BoardActivityTable.issue_id)),
    )
    .all()
  const adds = yield* tx
    .select({ issue: BoardActivityTable.issue_id, at: BoardActivityTable.time_created })
    .from(BoardActivityTable)
    .where(and(eq(BoardActivityTable.project_id, project.id), eq(BoardActivityTable.action, "queue.add"), isNotNull(BoardActivityTable.issue_id)))
    .orderBy(asc(BoardActivityTable.time_created))
    .all()
  const checks = yield* tx
    .select({ issue: BoardCheckTable.issue_id, ended: BoardCheckTable.ended_at })
    .from(BoardCheckTable)
    .innerJoin(BoardIssueTable, eq(BoardIssueTable.id, BoardCheckTable.issue_id))
    .where(
      and(
        eq(BoardIssueTable.project_id, project.id),
        eq(BoardCheckTable.kind, "scoped"),
        eq(BoardCheckTable.outcome, "pass"),
        isNotNull(BoardCheckTable.ended_at),
      ),
    )
    .all()
  const settled = yield* tx
    .select({ outcome: BoardAttemptTable.outcome })
    .from(BoardAttemptTable)
    .innerJoin(BoardIssueTable, eq(BoardIssueTable.id, BoardAttemptTable.issue_id))
    .where(and(eq(BoardIssueTable.project_id, project.id), inArray(BoardAttemptTable.outcome, ["merged", "ejected"])))
    .orderBy(desc(BoardAttemptTable.time_updated))
    .limit(50)
    .all()
  const shipped = yield* tx
    .select({ id: BoardIssueTable.id })
    .from(BoardIssueTable)
    .where(and(eq(BoardIssueTable.project_id, project.id), eq(BoardIssueTable.stage, "shipped")))
    .all()
  const attempts =
    shipped.length === 0
      ? []
      : yield* tx
          .select({ issue: BoardAttemptTable.issue_id })
          .from(BoardAttemptTable)
          .where(inArray(BoardAttemptTable.issue_id, shipped.map((row) => row.id)))
          .all()

  const queueWait = median(
    merges.flatMap((merge) => {
      const added = adds.filter((add) => add.issue === merge.issue && add.at <= merge.at).at(-1)
      return added ? [merge.at - added.at] : []
    }),
  )
  const leadTime = median(
    merges.flatMap((merge) => {
      const passed = checks.flatMap((check) =>
        check.issue === merge.issue && check.ended !== null && check.ended <= merge.at ? [check.ended] : [],
      )
      return passed.length === 0 ? [] : [merge.at - Math.min(...passed)]
    }),
  )
  const ejected = settled.filter((row) => row.outcome === "ejected").length
  return {
    queueWait,
    redRate: settled.length === 0 ? null : ejected / settled.length,
    reworkRate: shipped.length === 0 ? null : attempts.length / shipped.length,
    leadTime,
  } satisfies Board.Ledger
})

function median(values: number[]) {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  if (sorted.length % 2 === 1) return sorted[middle]!
  return (sorted[middle - 1]! + sorted[middle]!) / 2
}
