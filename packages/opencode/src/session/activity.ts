import { Database } from "@opencode-ai/core/database/database"
import { MessageTable, SessionMessageTable, SessionTable } from "@opencode-ai/core/session/sql"
import { and, eq, gte, inArray, lt } from "drizzle-orm"
import { Effect, Schema } from "effect"
import type { SessionID } from "./schema"

export const MAX_EDGES = 64

export const Fact = Schema.Struct({
  bucket: Schema.Finite,
  sessionID: Schema.String,
  providerID: Schema.NullOr(Schema.String),
  modelID: Schema.NullOr(Schema.String),
  user: Schema.Finite,
  assistant: Schema.Finite,
  failed: Schema.Finite,
  activeMs: Schema.Finite,
  tokens: Schema.Finite,
  cost: Schema.Finite,
}).annotate({ identifier: "SessionActivityFact" })
export type Fact = Schema.Schema.Type<typeof Fact>

export const ActivitySession = Schema.Struct({
  id: Schema.String,
  title: Schema.String,
  parentID: Schema.NullOr(Schema.String),
  created: Schema.Finite,
  updated: Schema.Finite,
  additions: Schema.NullOr(Schema.Finite),
  deletions: Schema.NullOr(Schema.Finite),
  files: Schema.NullOr(Schema.Finite),
}).annotate({ identifier: "SessionActivitySession" })

export const Activity = Schema.Struct({
  edges: Schema.Array(Schema.Finite),
  sessions: Schema.Array(ActivitySession),
  facts: Schema.Array(Fact),
}).annotate({ identifier: "SessionActivity" })
export type Activity = Schema.Schema.Type<typeof Activity>

// One message reduced to what the activity facts count. Both storages are read: legacy
// sessions keep messages in `message`, V2 sessions in `session_message`.
type Turn = {
  sessionID: SessionID
  created: number
  role: "user" | "assistant"
  providerID: string | null
  modelID: string | null
  completed: number | undefined
  failed: boolean
  tokens: number
  cost: number
}

// Aggregates the directory's user and assistant messages created in [edges[0], edges.at(-1))
// into one fact per bucket, session and model. `edges` are ascending bucket boundaries.
export const collect = Effect.fn("SessionActivity.collect")(function* (input: {
  directory: string
  edges: readonly number[]
}) {
  const { db } = yield* Database.Service
  const since = input.edges[0]
  const until = input.edges[input.edges.length - 1]
  const inDirectory = eq(SessionTable.directory, input.directory)
  const legacy = yield* db
    .select({ id: MessageTable.id, sessionID: MessageTable.session_id, created: MessageTable.time_created, data: MessageTable.data })
    .from(MessageTable)
    .innerJoin(SessionTable, eq(SessionTable.id, MessageTable.session_id))
    .where(and(inDirectory, gte(MessageTable.time_created, since), lt(MessageTable.time_created, until)))
    .all()
    .pipe(Effect.orDie)
  const current = yield* db
    .select({
      id: SessionMessageTable.id,
      sessionID: SessionMessageTable.session_id,
      created: SessionMessageTable.time_created,
      type: SessionMessageTable.type,
      data: SessionMessageTable.data,
    })
    .from(SessionMessageTable)
    .innerJoin(SessionTable, eq(SessionTable.id, SessionMessageTable.session_id))
    .where(
      and(
        inDirectory,
        inArray(SessionMessageTable.type, ["user", "assistant"]),
        gte(SessionMessageTable.time_created, since),
        lt(SessionMessageTable.time_created, until),
      ),
    )
    .all()
    .pipe(Effect.orDie)
  const turns = new Map<string, Turn>()
  legacy.forEach((row) => turns.set(row.id, legacyTurn(row)))
  current.forEach((row) => turns.set(row.id, currentTurn(row)))
  const facts = new Map<string, Fact>()
  turns.forEach((turn) => {
    const bucket = bucketOf(input.edges, turn.created)
    const key = [bucket, turn.sessionID, turn.providerID, turn.modelID].join("\0")
    const fact = facts.get(key) ?? {
      bucket,
      sessionID: turn.sessionID,
      providerID: turn.providerID,
      modelID: turn.modelID,
      user: 0,
      assistant: 0,
      failed: 0,
      activeMs: 0,
      tokens: 0,
      cost: 0,
    }
    facts.set(key, {
      ...fact,
      user: fact.user + (turn.role === "user" ? 1 : 0),
      assistant: fact.assistant + (turn.role === "assistant" ? 1 : 0),
      failed: fact.failed + (turn.failed ? 1 : 0),
      activeMs: fact.activeMs + (turn.completed !== undefined ? Math.max(0, turn.completed - turn.created) : 0),
      tokens: fact.tokens + turn.tokens,
      cost: fact.cost + turn.cost,
    })
  })
  const ids = [...new Set([...turns.values()].map((turn) => turn.sessionID))]
  const sessions =
    ids.length === 0
      ? []
      : yield* db
          .select({
            id: SessionTable.id,
            title: SessionTable.title,
            parentID: SessionTable.parent_id,
            created: SessionTable.time_created,
            updated: SessionTable.time_updated,
            additions: SessionTable.summary_additions,
            deletions: SessionTable.summary_deletions,
            files: SessionTable.summary_files,
          })
          .from(SessionTable)
          .where(inArray(SessionTable.id, ids))
          .all()
          .pipe(Effect.orDie)
  const result: Activity = {
    edges: [...input.edges],
    sessions: sessions.toSorted((a, b) => a.id.localeCompare(b.id)),
    facts: [...facts.values()].toSorted(
      (a, b) =>
        a.bucket - b.bucket ||
        a.sessionID.localeCompare(b.sessionID) ||
        (a.providerID ?? "").localeCompare(b.providerID ?? "") ||
        (a.modelID ?? "").localeCompare(b.modelID ?? ""),
    ),
  }
  return result
})

// Valid edges are 2..MAX_EDGES strictly ascending non-negative integers.
export function parseEdges(text: string) {
  const edges = text.split(",").map(Number)
  if (edges.length < 2 || edges.length > MAX_EDGES) return
  if (!edges.every((edge, index) => Number.isSafeInteger(edge) && edge >= 0 && (index === 0 || edge > edges[index - 1])))
    return
  return edges
}

function bucketOf(edges: readonly number[], time: number) {
  return edges.findLastIndex((edge, index) => index < edges.length - 1 && edge <= time)
}

function legacyTurn(row: { sessionID: SessionID; created: number; data: unknown }): Turn {
  const data = record(row.data)
  const role = data.role === "assistant" ? "assistant" : "user"
  const error = record(data.error)
  return {
    sessionID: row.sessionID,
    created: row.created,
    role,
    providerID: role === "assistant" ? text(data.providerID) : null,
    modelID: role === "assistant" ? text(data.modelID) : null,
    completed: role === "assistant" ? number(record(data.time).completed) : undefined,
    // A user stopping the turn is not a failure.
    failed: role === "assistant" && data.error != null && error.name !== "MessageAbortedError",
    tokens: role === "assistant" ? tokenTotal(data.tokens) : 0,
    cost: role === "assistant" ? (number(data.cost) ?? 0) : 0,
  }
}

function currentTurn(row: { sessionID: SessionID; created: number; type: string; data: unknown }): Turn {
  const data = record(row.data)
  const role = row.type === "assistant" ? "assistant" : "user"
  const model = record(data.model)
  return {
    sessionID: row.sessionID,
    created: row.created,
    role,
    providerID: role === "assistant" ? text(model.providerID) : null,
    modelID: role === "assistant" ? text(model.id) : null,
    completed: role === "assistant" ? number(record(data.time).completed) : undefined,
    failed: role === "assistant" && data.error != null,
    tokens: role === "assistant" ? tokenTotal(data.tokens) : 0,
    cost: role === "assistant" ? (number(data.cost) ?? 0) : 0,
  }
}

function tokenTotal(value: unknown) {
  const tokens = record(value)
  const cache = record(tokens.cache)
  return [tokens.input, tokens.output, tokens.reasoning, cache.read, cache.write]
    .map((item) => number(item) ?? 0)
    .reduce((total, item) => total + item, 0)
}

function record(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {}
}

function number(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined
}

function text(value: unknown) {
  return typeof value === "string" && value.length > 0 ? value : null
}

export * as SessionActivity from "./activity"
