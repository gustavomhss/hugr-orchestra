export * as SessionLegacyImport from "./legacy-import"

import path from "node:path"
import { asc, eq, sql } from "drizzle-orm"
import { Effect, Option, Schema } from "effect"
import type {
  CompactionPart,
  FilePart,
  Info,
  Part,
  PatchPart,
  SubtaskPart,
  ToolPart,
} from "./legacy-transcript"
import { Database } from "../database/database"
import { SessionMessage } from "./message"
import { MessageTable, PartTable, SessionMessageTable, SessionTable } from "./sql"

// Legacy and V2 share the `session` table, but legacy keeps transcripts in `message`/`part` and V2 reads `session_message`.
// This copies each legacy transcript into V2 once: only Sessions with legacy messages and no V2 message are touched, legacy rows
// are never changed, and a rerun is a no-op. Imported rows take negative sequences, below every durable event
// sequence a later V2 turn on the same Session will project. Subtask, compaction and patch parts and tool-result
// attachments map onto their V2 shapes (user text and mentions, compaction messages, the assistant's snapshot).

const decode = Schema.decodeUnknownOption(SessionMessage.Message)
const encode = Schema.encodeSync(SessionMessage.Message)

/**
 * Imports every pending legacy transcript; returns how many Sessions actually gained V2 messages. A Session whose
 * messages all fail to decode stays pending (and is not counted), so it is retried, cheaply, on the next call.
 * Callers must finish this before anything can prompt a Session: eligibility is "no V2 message yet".
 */
export const run = Effect.fn("SessionLegacyImport.run")(function* (db: Database.Interface["db"]) {
  const pending = yield* db
    .select({ sessionID: MessageTable.session_id })
    .from(MessageTable)
    .where(
      sql`not exists (select 1 from ${SessionMessageTable} where ${SessionMessageTable.session_id} = ${MessageTable.session_id})`,
    )
    .groupBy(MessageTable.session_id)
    .all()
    .pipe(Effect.orDie)
  const results = yield* Effect.forEach(pending, (item) => importSession(db, item.sessionID))
  return results.filter(Boolean).length
})

const importSession = Effect.fnUntraced(function* (
  db: Database.Interface["db"],
  sessionID: (typeof MessageTable.$inferSelect)["session_id"],
) {
  const session = yield* db
    .select({ directory: SessionTable.directory })
    .from(SessionTable)
    .where(eq(SessionTable.id, sessionID))
    .get()
    .pipe(Effect.orDie)
  const messages = yield* db
    .select()
    .from(MessageTable)
    .where(eq(MessageTable.session_id, sessionID))
    .orderBy(asc(MessageTable.time_created), asc(MessageTable.id))
    .all()
    .pipe(Effect.orDie)
  const parts = yield* db
    .select()
    .from(PartTable)
    .where(eq(PartTable.session_id, sessionID))
    .orderBy(asc(PartTable.id))
    .all()
    .pipe(Effect.orDie)
  const rows: Row[] = messages.map((row) => ({
    info: { ...row.data, id: row.id, sessionID } as Info,
    parts: parts
      .filter((part) => part.message_id === row.id)
      .map((part) => ({ ...part.data, id: part.id, messageID: part.message_id, sessionID }) as Part),
  }))
  const converted = rows.flatMap((row) =>
    Option.toArray(
      decode(row.info.role === "user" ? user(row.info, row.parts, rows) : assistant(row.info, row.parts, rows, session?.directory)),
    ),
  )
  if (converted.length === 0) return false
  yield* db
    .transaction(
      () =>
        Effect.forEach(
          converted,
          (message, index) => {
            const { id, type, ...data } = encode(message)
            return db
              .insert(SessionMessageTable)
              .values({
                id: SessionMessage.ID.make(id),
                session_id: sessionID,
                type,
                seq: index - converted.length,
                time_created: data.time.created,
                data,
              })
              .onConflictDoNothing()
              .run()
          },
          { discard: true },
        ),
      { behavior: "immediate" },
    )
    .pipe(Effect.orDie)
  return true
})

type Row = { readonly info: Info; readonly parts: ReadonlyArray<Part> }

function user(info: Extract<Info, { role: "user" }>, parts: ReadonlyArray<Part>, rows: ReadonlyArray<Row>) {
  const compaction = parts.find((part): part is CompactionPart => part.type === "compaction")
  if (compaction) return checkpoint(info, compaction, rows)
  // A subtask is the owner's request for a subagent: its prompt joins the text and its agent the mentions.
  const subtasks = parts.filter((part): part is SubtaskPart => part.type === "subtask")
  const text = [
    ...parts.flatMap((part) => (part.type === "text" && !part.ignored ? [part.text] : [])),
    ...subtasks.map((part) => part.prompt),
  ].join("\n\n")
  const files = parts.flatMap((part) => (part.type === "file" ? [attachment(part)] : []))
  const agents = [
    ...parts.flatMap((part) =>
      part.type === "agent"
        ? [{ name: part.name, ...(part.source ? { source: { start: part.source.start, end: part.source.end, text: part.source.value } } : {}) }]
        : [],
    ),
    ...subtasks.map((part) => ({ name: part.agent })),
  ]
  if (!text && files.length === 0) return undefined
  return {
    type: "user",
    id: info.id,
    time: { created: info.time.created },
    text,
    ...(files.length ? { files } : {}),
    ...(agents.length ? { agents } : {}),
  }
}

/**
 * A legacy compaction is a user message with a compaction part answered by a summary assistant message. On V2 it is one
 * compaction message whose summary is that answer and whose recent context is the tail legacy kept verbatim; the summary
 * assistant is folded into it. A compaction that never produced a summary restores nothing.
 */
function checkpoint(info: Extract<Info, { role: "user" }>, part: CompactionPart, rows: ReadonlyArray<Row>) {
  const answer = rows.find((row) => row.info.role === "assistant" && row.info.summary && row.info.parentID === info.id)
  const summary = answer ? textOf(answer.parts) : ""
  if (!summary) return undefined
  const self = rows.findIndex((row) => row.info.id === info.id)
  const tail = part.tail_start_id ? rows.findIndex((row) => row.info.id === part.tail_start_id) : -1
  const recent = (tail === -1 ? [] : rows.slice(tail, self))
    .flatMap((row) => {
      const text = textOf(row.parts)
      return text ? [`${row.info.role === "user" ? "User" : "Assistant"}: ${text}`] : []
    })
    .join("\n\n")
  return {
    type: "compaction",
    id: info.id,
    reason: part.auto ? "auto" : "manual",
    summary,
    recent,
    time: { created: info.time.created },
  }
}

function assistant(
  info: Extract<Info, { role: "assistant" }>,
  parts: ReadonlyArray<Part>,
  rows: ReadonlyArray<Row>,
  directory: string | undefined,
) {
  if (info.summary && rows.some((row) => row.info.id === info.parentID && row.parts.some((part) => part.type === "compaction")))
    return undefined
  return {
    type: "assistant",
    id: info.id,
    agent: info.agent,
    model: { id: info.modelID, providerID: info.providerID, ...(info.variant ? { variant: info.variant } : {}) },
    content: parts.flatMap((part): unknown[] => {
      if (part.type === "text") return [{ type: "text", id: part.id, text: part.text }]
      if (part.type === "reasoning")
        return [
          {
            type: "reasoning",
            id: part.id,
            text: part.text,
            time: { created: part.time.start, ...(part.time.end ? { completed: part.time.end } : {}) },
          },
        ]
      if (part.type === "tool") return [tool(part, info.time.created)]
      return []
    }),
    ...snapshot(parts, directory),
    ...(info.finish ? { finish: info.finish } : {}),
    cost: info.cost,
    tokens: {
      input: info.tokens.input,
      output: info.tokens.output,
      reasoning: info.tokens.reasoning,
      cache: info.tokens.cache,
    },
    ...(info.error ? { error: { type: "unknown", message: errorMessage(info.error) } } : {}),
    time: { created: info.time.created, ...(info.time.completed ? { completed: info.time.completed } : {}) },
  }
}

/**
 * The legacy runtime records a turn's changes as patch parts (the step's start snapshot and the files it changed) between step parts
 * that carry the snapshots; V2 keeps the same facts on the assistant's `snapshot`, with Location-relative files.
 */
function snapshot(parts: ReadonlyArray<Part>, directory: string | undefined) {
  const patches = parts.filter((part): part is PatchPart => part.type === "patch")
  const start =
    parts.flatMap((part) => (part.type === "step-start" && part.snapshot ? [part.snapshot] : []))[0] ?? patches[0]?.hash
  const end = parts.flatMap((part) => (part.type === "step-finish" && part.snapshot ? [part.snapshot] : [])).at(-1)
  const files = Array.from(
    new Set(
      patches.flatMap((part) =>
        part.files.map((file) =>
          directory && path.isAbsolute(file) ? path.relative(directory, file).split(path.sep).join("/") : file,
        ),
      ),
    ),
  )
  if (!start && !end && files.length === 0) return {}
  return {
    snapshot: { ...(start ? { start } : {}), ...(end ? { end } : {}), ...(files.length ? { files } : {}) },
  }
}

function attachment(part: FilePart) {
  return {
    uri: part.url,
    mime: part.mime,
    ...(part.filename ? { name: part.filename } : {}),
    ...(part.source ? { source: { start: part.source.text.start, end: part.source.text.end, text: part.source.text.value } } : {}),
  }
}

function textOf(parts: ReadonlyArray<Part>) {
  return parts
    .flatMap((part) => (part.type === "text" && !part.synthetic && !part.ignored ? [part.text] : []))
    .join("\n\n")
    .trim()
}

function tool(part: ToolPart, created: number) {
  const state = part.state
  const time = {
    created: "time" in state ? state.time.start : created,
    ...(state.status === "completed" || state.status === "error" ? { completed: state.time.end } : {}),
  }
  const base = { type: "tool", id: part.callID, name: part.tool, time }
  if (state.status === "pending") return { ...base, state: { status: "pending", input: state.raw } }
  if (state.status === "running")
    return { ...base, state: { status: "running", input: state.input, structured: state.metadata ?? {}, content: [] } }
  if (state.status === "completed")
    return {
      ...base,
      state: {
        status: "completed",
        input: state.input,
        ...(state.attachments?.length ? { attachments: state.attachments.map(attachment) } : {}),
        content: [{ type: "text", text: state.output }],
        structured: state.metadata,
      },
    }
  return {
    ...base,
    state: {
      status: "error",
      input: state.input,
      content: [],
      structured: state.metadata ?? {},
      error: { type: "unknown", message: state.error },
    },
  }
}

function errorMessage(error: { name: string; data?: unknown }) {
  const data = error.data
  if (data !== null && typeof data === "object" && "message" in data && typeof data.message === "string")
    return data.message
  return error.name
}
