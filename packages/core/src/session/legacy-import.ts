export * as SessionLegacyImport from "./legacy-import"

import { asc, eq, sql } from "drizzle-orm"
import { Effect, Option, Schema } from "effect"
import type { Info, Part, ToolPart } from "@orchestra/schema/session-v1"
import { Database } from "../database/database"
import { SessionMessage } from "./message"
import { MessageTable, PartTable, SessionMessageTable } from "./sql"

// V1 and V2 share the `session` table, but V1 keeps transcripts in `message`/`part` and V2 reads `session_message`.
// This copies each V1 transcript into V2 once: only Sessions with V1 messages and no V2 message are touched, V1 rows
// are never changed, and a rerun is a no-op. Imported rows take negative sequences, below every durable event
// sequence a later V2 turn on the same Session will project.

const decode = Schema.decodeUnknownOption(SessionMessage.Message)
const encode = Schema.encodeSync(SessionMessage.Message)

/** Imports every pending V1 transcript; returns how many Sessions were imported. */
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
  yield* Effect.forEach(pending, (item) => importSession(db, item.sessionID), { discard: true })
  return pending.length
})

const importSession = Effect.fnUntraced(function* (
  db: Database.Interface["db"],
  sessionID: (typeof MessageTable.$inferSelect)["session_id"],
) {
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
  const converted = messages.flatMap((row) => {
    const info = { ...row.data, id: row.id, sessionID } as Info
    const own = parts
      .filter((part) => part.message_id === row.id)
      .map((part) => ({ ...part.data, id: part.id, messageID: part.message_id, sessionID }) as Part)
    return Option.toArray(decode(info.role === "user" ? user(info, own) : assistant(info, own)))
  })
  if (converted.length === 0) return
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
})

function user(info: Extract<Info, { role: "user" }>, parts: ReadonlyArray<Part>) {
  const text = parts.flatMap((part) => (part.type === "text" && !part.ignored ? [part.text] : [])).join("\n\n")
  const files = parts.flatMap((part) =>
    part.type === "file" ? [{ uri: part.url, mime: part.mime, ...(part.filename ? { name: part.filename } : {}) }] : [],
  )
  if (!text && files.length === 0) return undefined
  return {
    type: "user",
    id: info.id,
    time: { created: info.time.created },
    text,
    ...(files.length ? { files } : {}),
  }
}

function assistant(info: Extract<Info, { role: "assistant" }>, parts: ReadonlyArray<Part>) {
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
