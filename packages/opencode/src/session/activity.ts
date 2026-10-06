import { Database } from "@opencode-ai/core/database/database"
import { ProjectV2 } from "@opencode-ai/core/project"
import { SessionRunner } from "@opencode-ai/core/session/runner"
import { MessageTable, SessionMessageTable, SessionTable } from "@opencode-ai/core/session/sql"
import { and, eq, gte, inArray, lt, sql } from "drizzle-orm"
import { Effect, Schema } from "effect"
import type { SessionID } from "./schema"

export const Period = Schema.Literals(["7d", "30d", "90d", "all"])
export type Period = Schema.Schema.Type<typeof Period>

// At most this many messages are read for one request; beyond it the result is marked truncated.
export const MAX_MESSAGES = 200_000
// Session IDs per IN (...) list, well under SQLite's bound-variable limit.
const CHUNK = 500
const MAX_BARS = 8
const PERIOD_DAYS = { "7d": 7, "30d": 30, "90d": 90 } as const

export const Fact = Schema.Struct({
  bucket: Schema.Finite,
  sessionID: Schema.String,
  providerID: Schema.NullOr(Schema.String),
  modelID: Schema.NullOr(Schema.String),
  user: Schema.Finite,
  assistant: Schema.Finite,
  failed: Schema.Finite,
  tokens: Schema.Finite,
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
  period: Period,
  edges: Schema.Array(Schema.Finite).annotate({
    description: "Ascending bucket boundaries at server-local midnights; bucket i is [edges[i], edges[i + 1])",
  }),
  days: Schema.Array(Schema.String).annotate({ description: "Server-local YYYY-MM-DD of each edge" }),
  previous: Schema.Boolean.annotate({ description: "True when bucket 0 is the equal window before the period" }),
  activeMs: Schema.Array(Schema.Finite).annotate({
    description: "Per bucket, wall clock during which any root-session assistant turn was running",
  }),
  sessions: Schema.Array(ActivitySession),
  facts: Schema.Array(Fact),
  truncated: Schema.Boolean.annotate({ description: `True when more than ${MAX_MESSAGES} messages were in range` }),
}).annotate({ identifier: "SessionActivity" })
export type Activity = Schema.Schema.Type<typeof Activity>

// Sessions of one profile: the whole project, or one directory for the shared non-git project.
export type Scope = { readonly projectID: ProjectV2.ID } | { readonly directory: string }

type Turn = {
  sessionID: SessionID
  created: number
  role: "user" | "assistant"
  providerID: string | null
  modelID: string | null
  completed: number | null
  failed: boolean
  tokens: number
}

// Aggregates the profile's user and assistant messages for a period into one fact per bucket,
// session and model. Only the fields counted are read from each message.
export const collect = Effect.fn("SessionActivity.collect")(function* (input: {
  scope: Scope
  period: Period
  now: number
  limit?: number
}) {
  const limit = input.limit ?? MAX_MESSAGES
  const { db } = yield* Database.Service
  const sessions = yield* db
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
    .where(
      "projectID" in input.scope
        ? eq(SessionTable.project_id, input.scope.projectID)
        : eq(SessionTable.directory, input.scope.directory),
    )
    .all()
    .pipe(Effect.orDie)
  const chunks = Array.from({ length: Math.ceil(sessions.length / CHUNK) }, (_, index) =>
    sessions.slice(index * CHUNK, (index + 1) * CHUNK).map((session) => session.id),
  )
  const window =
    input.period === "all"
      ? allWindow(yield* firstMessage(db, chunks), input.now)
      : periodWindow(PERIOD_DAYS[input.period], input.now)
  const since = window.edges[0]
  const until = window.edges[window.edges.length - 1]
  const turns = new Map<string, Turn>()
  const state = { truncated: false }
  for (const ids of chunks) {
    const remaining = limit - turns.size
    if (remaining <= 0) {
      state.truncated = true
      break
    }
    const legacy = yield* db
      .select({
        id: MessageTable.id,
        sessionID: MessageTable.session_id,
        created: MessageTable.time_created,
        role: sql<string | null>`json_extract(${MessageTable.data}, '$.role')`,
        providerID: sql<string | null>`json_extract(${MessageTable.data}, '$.providerID')`,
        modelID: sql<string | null>`json_extract(${MessageTable.data}, '$.modelID')`,
        completed: sql<number | null>`json_extract(${MessageTable.data}, '$.time.completed')`,
        error: sql<string | null>`json_type(${MessageTable.data}, '$.error')`,
        errorName: sql<string | null>`json_extract(${MessageTable.data}, '$.error.name')`,
        tokens: tokenSum(MessageTable.data),
      })
      .from(MessageTable)
      .where(
        and(
          inArray(MessageTable.session_id, ids),
          gte(MessageTable.time_created, since),
          lt(MessageTable.time_created, until),
        ),
      )
      .limit(remaining + 1)
      .all()
      .pipe(Effect.orDie)
    legacy.forEach((row) => {
      const assistant = row.role === "assistant"
      turns.set(row.id, {
        sessionID: row.sessionID,
        created: row.created,
        role: assistant ? "assistant" : "user",
        providerID: assistant ? text(row.providerID) : null,
        modelID: assistant ? text(row.modelID) : null,
        completed: assistant ? finite(row.completed) : null,
        // A user stopping the turn is not a failure.
        failed: assistant && present(row.error) && row.errorName !== "MessageAbortedError",
        tokens: assistant ? (finite(row.tokens) ?? 0) : 0,
      })
    })
    const current = yield* db
      .select({
        id: SessionMessageTable.id,
        sessionID: SessionMessageTable.session_id,
        created: SessionMessageTable.time_created,
        type: SessionMessageTable.type,
        providerID: sql<string | null>`json_extract(${SessionMessageTable.data}, '$.model.providerID')`,
        modelID: sql<string | null>`json_extract(${SessionMessageTable.data}, '$.model.id')`,
        completed: sql<number | null>`json_extract(${SessionMessageTable.data}, '$.time.completed')`,
        error: sql<string | null>`json_type(${SessionMessageTable.data}, '$.error')`,
        errorMessage: sql<string | null>`json_extract(${SessionMessageTable.data}, '$.error.message')`,
        tokens: tokenSum(SessionMessageTable.data),
      })
      .from(SessionMessageTable)
      .where(
        and(
          inArray(SessionMessageTable.session_id, ids),
          inArray(SessionMessageTable.type, ["user", "assistant"]),
          gte(SessionMessageTable.time_created, since),
          lt(SessionMessageTable.time_created, until),
        ),
      )
      .limit(Math.max(0, remaining - legacy.length) + 1)
      .all()
      .pipe(Effect.orDie)
    current.forEach((row) => {
      const assistant = row.type === "assistant"
      turns.set(row.id, {
        sessionID: row.sessionID,
        created: row.created,
        role: assistant ? "assistant" : "user",
        providerID: assistant ? text(row.providerID) : null,
        modelID: assistant ? text(row.modelID) : null,
        completed: assistant ? finite(row.completed) : null,
        // An interrupted drain stops the turn on purpose; it is not a failure.
        failed: assistant && present(row.error) && row.errorMessage !== SessionRunner.INTERRUPTED_TURN,
        tokens: assistant ? (finite(row.tokens) ?? 0) : 0,
      })
    })
    if (legacy.length + current.length > remaining) state.truncated = true
  }
  const facts = new Map<string, Fact>()
  turns.forEach((turn) => {
    const bucket = bucketOf(window.edges, turn.created)
    const key = [bucket, turn.sessionID, turn.providerID, turn.modelID].join("\0")
    const fact = facts.get(key) ?? {
      bucket,
      sessionID: turn.sessionID,
      providerID: turn.providerID,
      modelID: turn.modelID,
      user: 0,
      assistant: 0,
      failed: 0,
      tokens: 0,
    }
    facts.set(key, {
      ...fact,
      user: fact.user + (turn.role === "user" ? 1 : 0),
      assistant: fact.assistant + (turn.role === "assistant" ? 1 : 0),
      failed: fact.failed + (turn.failed ? 1 : 0),
      tokens: fact.tokens + turn.tokens,
    })
  })
  const roots = new Set(sessions.filter((session) => session.parentID === null).map((session) => session.id))
  const active = new Set([...turns.values()].map((turn) => turn.sessionID))
  const result: Activity = {
    period: input.period,
    edges: window.edges,
    days: window.edges.map(dayOf),
    previous: window.previous,
    activeMs: wallClock(
      window.edges,
      [...turns.values()].flatMap((turn) =>
        turn.role === "assistant" &&
        roots.has(turn.sessionID) &&
        turn.completed !== null &&
        turn.completed > turn.created
          ? [[turn.created, turn.completed] as const]
          : [],
      ),
    ),
    sessions: sessions.filter((session) => active.has(session.id)).toSorted((a, b) => a.id.localeCompare(b.id)),
    facts: [...facts.values()].toSorted(
      (a, b) =>
        a.bucket - b.bucket ||
        a.sessionID.localeCompare(b.sessionID) ||
        (a.providerID ?? "").localeCompare(b.providerID ?? "") ||
        (a.modelID ?? "").localeCompare(b.modelID ?? ""),
    ),
    truncated: state.truncated,
  }
  return result
})

// Fixed periods are whole server-local days ending today, split into at most eight bars, with the
// equal window before them as a leading bucket.
export function periodWindow(days: number, now: number) {
  const end = addDays(dayStart(now), 1)
  const start = addDays(end, -days)
  return { edges: [addDays(start, -days), ...barEdges(start, days)], previous: true }
}

// "All" starts on the day of the profile's first recorded message and has no previous window.
export function allWindow(first: number | undefined, now: number) {
  const end = addDays(dayStart(now), 1)
  const start = dayStart(Math.min(first ?? now, now))
  return { edges: barEdges(start, Math.max(1, Math.round((end - start) / 86_400_000))), previous: false }
}

// Union of the turn intervals, measured inside each bucket, so parallel turns count once.
export function wallClock(edges: readonly number[], intervals: readonly (readonly [number, number])[]) {
  const merged = intervals
    .toSorted((a, b) => a[0] - b[0])
    .reduce<[number, number][]>((list, [start, end]) => {
      const last = list[list.length - 1]
      if (last && start <= last[1]) {
        last[1] = Math.max(last[1], end)
        return list
      }
      list.push([start, end])
      return list
    }, [])
  return edges
    .slice(1)
    .map((end, index) =>
      merged.reduce(
        (total, interval) => total + Math.max(0, Math.min(end, interval[1]) - Math.max(edges[index], interval[0])),
        0,
      ),
    )
}

const firstMessage = Effect.fnUntraced(function* (db: Database.Interface["db"], chunks: readonly SessionID[][]) {
  const firsts = yield* Effect.forEach(chunks, (ids) =>
    Effect.all([
      db
        .select({ first: sql<number | null>`min(${MessageTable.time_created})` })
        .from(MessageTable)
        .where(inArray(MessageTable.session_id, ids))
        .get()
        .pipe(Effect.orDie),
      db
        .select({ first: sql<number | null>`min(${SessionMessageTable.time_created})` })
        .from(SessionMessageTable)
        .where(
          and(inArray(SessionMessageTable.session_id, ids), inArray(SessionMessageTable.type, ["user", "assistant"])),
        )
        .get()
        .pipe(Effect.orDie),
    ]),
  )
  return firsts
    .flat()
    .flatMap((row) => (typeof row?.first === "number" ? [row.first] : []))
    .reduce<number | undefined>((first, time) => (first === undefined || time < first ? time : first), undefined)
})

function tokenSum(data: typeof MessageTable.data | typeof SessionMessageTable.data) {
  return sql<
    number | null
  >`coalesce(json_extract(${data}, '$.tokens.input'), 0) + coalesce(json_extract(${data}, '$.tokens.output'), 0) + coalesce(json_extract(${data}, '$.tokens.reasoning'), 0) + coalesce(json_extract(${data}, '$.tokens.cache.read'), 0) + coalesce(json_extract(${data}, '$.tokens.cache.write'), 0)`
}

function barEdges(start: number, days: number) {
  const count = Math.min(MAX_BARS, days)
  return Array.from({ length: count + 1 }, (_, index) => addDays(start, Math.floor((index * days) / count)))
}

function bucketOf(edges: readonly number[], time: number) {
  return edges.findLastIndex((edge, index) => index < edges.length - 1 && edge <= time)
}

function dayStart(time: number) {
  const date = new Date(time)
  date.setHours(0, 0, 0, 0)
  return date.getTime()
}

function addDays(time: number, days: number) {
  const date = new Date(time)
  date.setDate(date.getDate() + days)
  return date.getTime()
}

function dayOf(time: number) {
  const date = new Date(time)
  return [date.getFullYear(), date.getMonth() + 1, date.getDate()]
    .map((part) => String(part).padStart(2, "0"))
    .join("-")
}

// json_type is SQL NULL for a missing path and 'null' for an explicit JSON null.
function present(type: string | null) {
  return type !== null && type !== "null"
}

function finite(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null
}

function text(value: unknown) {
  return typeof value === "string" && value.length > 0 ? value : null
}

export * as SessionActivity from "./activity"
