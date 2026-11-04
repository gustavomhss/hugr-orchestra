export * as BoardExecution from "./execution"

import { and, asc, eq, inArray, sql } from "drizzle-orm"
import { Clock, Effect, Option, Schema } from "effect"
import { Board } from "@orchestra/schema/board"
import { Model } from "@orchestra/schema/model"
import { Event } from "@orchestra/schema/event"
import { SessionEvent } from "@orchestra/schema/session-event"
import { EventTable } from "../event/sql"
import { SessionMessageTable, MessageTable } from "../session/sql"
import { SessionSchema } from "../session/schema"
import { BoardActivityTable, BoardAttemptTable, BoardCiRunTable, BoardNoteTable } from "./sql"
import type { IssueRow, Tx } from "./shared"

type Turn = {
  sessionID: string
  seat: string
  provider: string
  model: string
  variant: string | null
  usd: number | null
  costSource: string | null
  usageKnown: boolean | number | null
  input: number | null
  output: number | null
  reasoning: number | null
  cacheRead: number | null
  cacheWrite: number | null
  providerMs: number | null
  toolUses: number
}

/** Reads only telemetry columns from provider turns, never transcript prose or current Session configuration. */
export const report = Effect.fnUntraced(function* (tx: Tx, issue: IssueRow, ref: string) {
  const now = yield* Clock.currentTimeMillis
  const attempts = yield* tx.select().from(BoardAttemptTable).where(eq(BoardAttemptTable.issue_id, issue.id)).orderBy(asc(BoardAttemptTable.n)).all()
  const activity = yield* tx.select().from(BoardActivityTable).where(eq(BoardActivityTable.issue_id, issue.id)).orderBy(asc(BoardActivityTable.id)).all()
  const notes = yield* tx.select({ session: BoardNoteTable.session_id, attempt: BoardNoteTable.attempt, kind: BoardNoteTable.kind }).from(BoardNoteTable).where(eq(BoardNoteTable.issue_id, issue.id)).all()
  // UNION (not UNION ALL) terminates even corrupt cyclic lineage and deduplicates overlapping roots.
  // All card claims participate: a different card's direct claim cannot be hidden by this card's ancestor.
  const ownership = yield* tx.all<{ session: string; owners: number; allocations: number; attempt: number }>(sql`
    WITH RECURSIVE roots(issue, attempt, session) AS (
      SELECT issue_id, n, session_id FROM board_attempt WHERE session_id IS NOT NULL
      UNION
      SELECT id, 0, session_id FROM board_issue i WHERE session_id IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM board_attempt a WHERE a.issue_id = i.id AND a.session_id = i.session_id)
      UNION
      SELECT issue_id, coalesce(attempt, 0), session_id FROM board_note WHERE session_id IS NOT NULL
    ), lineage(issue, attempt, session) AS (
      SELECT issue, attempt, session FROM roots
      UNION
      SELECT l.issue, l.attempt, s.id FROM lineage l JOIN session s ON s.parent_id = l.session
    )
    SELECT session, count(DISTINCT issue) AS owners,
      count(DISTINCT issue || ':' || attempt) AS allocations,
      max(CASE WHEN issue = ${issue.id} THEN attempt ELSE NULL END) AS attempt
    FROM lineage GROUP BY session HAVING sum(issue = ${issue.id}) > 0
  `)
  const eligible = ownership.filter((entry) => entry.owners === 1)
  const turns = (yield* Effect.forEach(
    Array.from({ length: Math.ceil(eligible.length / 200) }, (_, index) => eligible.slice(index * 200, (index + 1) * 200).map((entry) => entry.session)),
    (sessions) => providerTurns(tx, sessions),
  )).flat()
  const bySession = Map.groupBy(turns, (turn) => String(turn.sessionID))
  const ci = yield* tx.select().from(BoardCiRunTable).where(eq(BoardCiRunTable.issue_id, issue.id)).all()
  const excluded = ownership.filter((entry) => entry.owners !== 1).map((entry) => entry.session)
  const unassigned = eligible.filter((entry) => entry.allocations > 1 || !attempts.some((attempt) => attempt.n === entry.attempt)).map((entry) => entry.session)
  const metrics = measure(turns, eligible.length === 0 || excluded.length > 0 || eligible.some((entry) => !bySession.has(entry.session)))
  const created = activity.find((entry) => entry.action === "issue.create")
  const writer = Schema.decodeUnknownOption(Board.Writer)(created?.after?.writer)
  const participants = (sessions: string[]): Board.ExecutionParticipant[] => sessions.map((sessionID) => {
    const participating = bySession.get(sessionID) ?? []
    return {
      sessionID, seats: [...new Set(participating.flatMap((turn) => typeof turn.seat === "string" && turn.seat ? [turn.seat] : []))],
      role: notes.some((note) => note.session === sessionID && note.kind === "review") ? "review" : "execution",
      models: models(participating),
    }
  })
  return {
    ref, asOf: now,
    creator: created && Option.isSome(writer) ? { writer: writer.value, at: created.time_created } : null,
    models: models(turns),
    participants: participants(eligible.map((entry) => entry.session)),
    attempts: attempts.map((attempt): Board.ExecutionAttempt => {
      const sessions = eligible.filter((entry) => entry.attempt === attempt.n && entry.allocations === 1).map((entry) => entry.session)
      const found = sessions.flatMap((session) => bySession.get(session) ?? [])
      return {
        n: attempt.n, seat: attempt.seat, sessionID: attempt.session_id, branch: attempt.branch, prNumber: attempt.pr_number,
        startedAt: attempt.time_created, endedAt: attempt.outcome === null ? null : attempt.time_updated,
        outcome: attempt.outcome, cause: attempt.cause, models: models(found),
        participants: participants(sessions),
        // Cached CI runs belong to the card, not a guessed execution attempt.
        metrics: measure(found, excluded.length > 0 || unassigned.length > 0 || sessions.length === 0 || sessions.some((session) => !bySession.has(session))),
      }
    }),
    metrics: {
      ...metrics,
      ciUsd: ci.length > 0 && ci.every((run) => run.billing_known) ? ci.reduce((sum, run) => sum + run.cost_usd, 0) : null,
      ciMs: ci.length > 0 && ci.every((run) => run.billing_known) ? ci.reduce((sum, run) => sum + run.billable_ms, 0) : null,
      ciRuns: ci.length,
      ...(ci.length > 0 && ci.every((run) => run.billing_known) ? { ciRateBasis: "standard-x64-2026-11" as const } : {}),
      partial: metrics.partial || ci.some((run) => !run.billing_known) || (issue.pr_number !== null && ci.length === 0),
    },
    leadTimeMs: Math.max(0, now - issue.time_created),
    receipts: activity.flatMap((entry) => {
      const receipt = Schema.decodeUnknownOption(Board.Receipt)(entry.after?.receipt)
      return Option.isSome(receipt) ? [{ ...receipt.value, activityID: entry.id, undoneBy: entry.undone_by }] : []
    }),
    unattributedSessions: excluded,
    unassignedSessions: unassigned,
  } satisfies Board.ExecutionReport
})

const providerTurns = Effect.fnUntraced(function* (tx: Tx, sessions: string[]) {
  const ids = sessions.map((id) => SessionSchema.ID.make(id))
  const current = yield* tx.select({
    sessionID: SessionMessageTable.session_id,
    seat: sql<string>`json_extract(${SessionMessageTable.data}, '$.agent')`,
    provider: sql<string>`json_extract(${SessionMessageTable.data}, '$.model.providerID')`,
    model: sql<string>`json_extract(${SessionMessageTable.data}, '$.model.id')`,
    variant: sql<string | null>`json_extract(${SessionMessageTable.data}, '$.model.variant')`,
    usd: sql<number | null>`json_extract(${SessionMessageTable.data}, '$.cost')`,
    costSource: sql<string | null>`json_extract(${SessionMessageTable.data}, '$.costSource')`,
    usageKnown: sql<number | null>`json_extract(${SessionMessageTable.data}, '$.usageKnown')`,
    messageID: SessionMessageTable.id,
    input: sql<number | null>`json_extract(${SessionMessageTable.data}, '$.tokens.input')`,
    output: sql<number | null>`json_extract(${SessionMessageTable.data}, '$.tokens.output')`,
    reasoning: sql<number | null>`json_extract(${SessionMessageTable.data}, '$.tokens.reasoning')`,
    cacheRead: sql<number | null>`json_extract(${SessionMessageTable.data}, '$.tokens.cache.read')`,
    cacheWrite: sql<number | null>`json_extract(${SessionMessageTable.data}, '$.tokens.cache.write')`,
    providerMs: sql<number | null>`json_extract(${SessionMessageTable.data}, '$.time.completed') - json_extract(${SessionMessageTable.data}, '$.time.created')`,
    toolUses: sql<number>`(SELECT count(*) FROM json_each(${SessionMessageTable.data}, '$.content') WHERE json_extract(value, '$.type') = 'tool')`,
  }).from(SessionMessageTable).where(and(inArray(SessionMessageTable.session_id, ids), eq(SessionMessageTable.type, "assistant"))).all()
  const legacy = yield* tx.select({
    sessionID: MessageTable.session_id,
    seat: sql<string>`json_extract(${MessageTable.data}, '$.agent')`,
    provider: sql<string>`json_extract(${MessageTable.data}, '$.providerID')`,
    model: sql<string>`json_extract(${MessageTable.data}, '$.modelID')`,
    variant: sql<string | null>`json_extract(${MessageTable.data}, '$.variant')`,
    usd: sql<number | null>`json_extract(${MessageTable.data}, '$.cost')`,
    costSource: sql<string | null>`json_extract(${MessageTable.data}, '$.costSource')`,
    usageKnown: sql<number | null>`json_extract(${MessageTable.data}, '$.usageKnown')`,
    input: sql<number | null>`json_extract(${MessageTable.data}, '$.tokens.input')`,
    output: sql<number | null>`json_extract(${MessageTable.data}, '$.tokens.output')`,
    reasoning: sql<number | null>`json_extract(${MessageTable.data}, '$.tokens.reasoning')`,
    cacheRead: sql<number | null>`json_extract(${MessageTable.data}, '$.tokens.cache.read')`,
    cacheWrite: sql<number | null>`json_extract(${MessageTable.data}, '$.tokens.cache.write')`,
    providerMs: sql<number | null>`json_extract(${MessageTable.data}, '$.time.completed') - json_extract(${MessageTable.data}, '$.time.created')`,
    // Explicit correlation: select projections may render Drizzle column references unqualified;
    // `id` inside this subquery would resolve to the part's id rather than the outer message.
    toolUses: sql<number>`(SELECT count(*) FROM part p WHERE p.message_id = message.id AND json_extract(p.data, '$.type') = 'tool')`,
  }).from(MessageTable).where(and(
    inArray(MessageTable.session_id, ids),
    sql`json_extract(${MessageTable.data}, '$.role') = 'assistant'`,
    // Migrated messages retain their id. Count the canonical V2 provider turn, not both projections.
    sql`NOT EXISTS (SELECT 1 FROM session_message sm WHERE sm.id = message.id)`,
  )).all()
  // Older projections discarded usageKnown even though the durable settlement retained it.
  // Fetch only settlement metadata once per Session batch, never the transcript or current provider configuration.
  const settlements = yield* tx.select({
    messageID: sql<string>`json_extract(${EventTable.data}, '$.assistantMessageID')`,
    usageKnown: sql<number | null>`json_extract(${EventTable.data}, '$.usageKnown')`,
    costSource: sql<string | null>`json_extract(${EventTable.data}, '$.costSource')`,
  }).from(EventTable).where(and(
    inArray(EventTable.aggregate_id, sessions),
    eq(EventTable.type, Event.versionedType(SessionEvent.Step.Ended.type, SessionEvent.Step.Ended.durable!.version)),
  )).orderBy(asc(EventTable.seq)).all()
  const byMessage = new Map(settlements.map((settlement) => [settlement.messageID, settlement]))
  return [...current.map((turn) => ({
    ...turn,
    usageKnown: turn.usageKnown ?? byMessage.get(turn.messageID)?.usageKnown ?? null,
    costSource: turn.costSource ?? byMessage.get(turn.messageID)?.costSource ?? null,
  })), ...legacy] satisfies Turn[]
})

function tokens(turn: Turn): Board.Usage | null {
  if (turn.usageKnown !== true && turn.usageKnown !== 1) return null
  const values = [turn.input, turn.output, turn.reasoning, turn.cacheRead, turn.cacheWrite]
  if (values.some((value) => value === null || !Number.isSafeInteger(value) || value < 0)) return null
  return { input: turn.input!, output: turn.output!, reasoning: turn.reasoning!, cacheRead: turn.cacheRead!, cacheWrite: turn.cacheWrite! }
}

function usage(turns: Turn[]) {
  const measured = turns.map(tokens).filter((entry) => entry !== null)
  if (measured.length === 0) return null
  return measured.reduce((sum, entry) => ({
    input: sum.input + entry.input, output: sum.output + entry.output, reasoning: sum.reasoning + entry.reasoning,
    cacheRead: sum.cacheRead + entry.cacheRead, cacheWrite: sum.cacheWrite + entry.cacheWrite,
  }), { input: 0, output: 0, reasoning: 0, cacheRead: 0, cacheWrite: 0 })
}

function cost(turn: Turn) {
  // A stored zero does not prove a priced API invocation: OAuth and subscription engines also emit it.
  // Catalog prices, hosted-engine estimates and historical amounts without a recorded source are not provider charges.
  return turn.costSource === "provider" && turn.provider !== "claude-code" && turn.usd !== null && Number.isFinite(turn.usd) && turn.usd > 0 ? turn.usd : null
}

function measure(turns: Turn[], partial: boolean): Board.Metrics {
  const costs = turns.map(cost).filter((value) => value !== null)
  const durations = turns.flatMap((turn) => turn.providerMs !== null && Number.isFinite(turn.providerMs) && turn.providerMs >= 0 ? [turn.providerMs] : [])
  return {
    tokens: usage(turns), modelUsd: costs.length > 0 ? costs.reduce((sum, value) => sum + value, 0) : null,
    providerMs: durations.length > 0 ? durations.reduce((sum, value) => sum + value, 0) : null,
    toolUses: turns.length > 0 ? turns.reduce((sum, turn) => sum + turn.toolUses, 0) : null,
    ciUsd: null, ciMs: null, ciRuns: 0,
    partial: partial || turns.length === 0 || turns.some((turn) => tokens(turn) === null || cost(turn) === null || turn.providerMs === null || turn.providerMs < 0),
  }
}

function models(turns: Turn[]): Board.ExecutionModel[] {
  const groups = Map.groupBy(turns, (turn) => JSON.stringify([turn.provider, turn.model, turn.variant]))
  return [...groups.values()].flatMap((group) => {
    const first = group[0]
    const model = Schema.decodeUnknownOption(Model.Ref)({ id: first.model, providerID: first.provider, ...(first.variant ? { variant: first.variant } : {}) })
    if (Option.isNone(model)) return []
    const metrics = measure(group, false)
    return [{ model: model.value, tokens: metrics.tokens, usd: metrics.modelUsd, partial: group.some((turn) => cost(turn) === null), billing: first.provider === "claude-code" ? "subscription" : metrics.modelUsd === null ? "unavailable" : "reported" }]
  })
}
