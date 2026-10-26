export * as BoardProof from "./proof"

import { and, desc, eq, isNull } from "drizzle-orm"
import { Effect } from "effect"
import { Board } from "@orchestra/schema/board"
import { BoardDecisionTable } from "./sql"
import { toDecision } from "./rows"
import { loadIssue, loadProject, numbers, worktree } from "./shared"
import type { Tx } from "./shared"

// What backs a card's status. The stored half is read in a transaction; the live half (PR, checks) comes from the trail.

const ATTEMPTS = 3

export const load = Effect.fnUntraced(function* (tx: Tx, key: string, number: number) {
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
})

type Loaded = Effect.Success<ReturnType<typeof load>>

export function build(key: string, loaded: Loaded, live: Board.Trail, summary: string | null) {
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
    guardrail: rule ? { rule, summary } : null,
    crashReason: loaded.row.crash_reason,
    verifiedAt: live.state === "ok" ? (live.verifiedAt ?? null) : null,
    decidedBy: loaded.decided,
  } satisfies Board.Proof
}

/** A check conclusion that is neither a pass nor a skip. */
export function failed(conclusion: string | null) {
  return conclusion !== null && !["success", "neutral", "skipped"].includes(conclusion.toLowerCase())
}
