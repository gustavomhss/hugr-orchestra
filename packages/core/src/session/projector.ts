export * as SessionProjector from "./projector"

import { and, desc, eq, gt, or, sql } from "drizzle-orm"
import { isDeepStrictEqual } from "node:util"
import { DateTime, Effect, Layer, Schema } from "effect"
import { Database } from "../database/database"
import { EventV2 } from "../event"
import { makeGlobalNode } from "../effect/app-node"
import { SessionEvent } from "./event"
import { SessionLegacyTranscript } from "./legacy-transcript"
import { WorkspaceTable } from "../control-plane/workspace.sql"
import { ProjectTable } from "../project/sql"
import { SessionMessage } from "./message"
import { SessionMessageUpdater } from "./message-updater"
import { fromRow } from "./info"
import { SessionInput } from "./input"
import { WorkspaceV2 } from "../workspace"
import { MessageTable, PartTable, SessionInputTable, SessionMessageTable, SessionTable } from "./sql"

type DatabaseService = Database.Interface["db"]

const decodeMessage = Schema.decodeUnknownSync(SessionMessage.Message)
const encodeMessage = Schema.encodeSync(SessionMessage.Message)

export class SessionAlreadyProjected extends Error {}

function run(db: DatabaseService, event: SessionEvent.Event, replay = false) {
  return Effect.gen(function* () {
    const decodeRow = (row: typeof SessionMessageTable.$inferSelect) =>
      decodeMessage({ ...row.data, id: row.id, type: row.type })
    const updateMessage = (message: SessionMessage.Message) => {
      if (event.durable === undefined) return Effect.die("Durable Session event is missing aggregate sequence")
      const encoded = encodeMessage(message)
      const { id, type, ...data } = encoded
      return db
        .update(SessionMessageTable)
        .set({ type, time_created: DateTime.toEpochMillis(message.time.created), data })
        .where(
          and(
            eq(SessionMessageTable.id, SessionMessage.ID.make(id)),
            eq(SessionMessageTable.session_id, event.data.sessionID),
          ),
        )
        .run()
        .pipe(Effect.orDie)
    }
    const appendMessage = (message: SessionMessage.Message) => insertMessage(db, event, message)
    const adapter: SessionMessageUpdater.Adapter = {
      validateTaskObservation(input) {
        return Effect.gen(function* () {
          const parent = yield* db.select().from(SessionTable).where(eq(SessionTable.id, input.sessionID)).get().pipe(Effect.orDie)
          const child = yield* db.select().from(SessionTable).where(eq(SessionTable.id, input.childSessionID)).get().pipe(Effect.orDie)
          const owner = yield* db.select().from(SessionMessageTable).where(eq(SessionMessageTable.id, input.assistant.id)).get().pipe(Effect.orDie)
          if (!parent || !child || !owner || owner.session_id !== parent.id || child.parent_id !== parent.id ||
            child.project_id !== parent.project_id || child.directory !== parent.directory ||
            child.workspace_id !== parent.workspace_id || child.agent !== input.memberID) return false
          const project = yield* db.select().from(ProjectTable).where(eq(ProjectTable.id, parent.project_id)).get().pipe(Effect.orDie)
          if (!project) return false
          const retained = decodeRow(owner)
          const calls = retained.type === "assistant" && retained.agent === "maestro"
            ? retained.content.filter((part) => part.type === "tool" && part.id === input.call.id) : []
          const call = calls[0]
          if (calls.length !== 1 || call?.type !== "tool" || call.name !== "task" || call.provider?.executed ||
            call.state.status !== "completed" || input.call.state.status !== "completed" ||
            !isDeepStrictEqual(call.state.input, input.call.state.input)) return false
          const record = Schema.decodeUnknownOption(Schema.Record(Schema.String, Schema.Unknown))
          const metadata = record(call.state.structured.metadata).valueOrUndefined
          const observed = record(input.call.state.structured.metadata).valueOrUndefined
          if (!metadata || !observed || metadata.upstreamSettlement !== undefined ||
            metadata.parentSessionId !== parent.id || metadata.sessionId !== child.id ||
            !isDeepStrictEqual(metadata.workResult, observed.workResult)) return false
          // Any retained original view is a veto, not a fallback to the favorable native Task.
          const original = yield* db.select().from(MessageTable).where(eq(MessageTable.id,
            SessionLegacyTranscript.MessageID.make(input.assistant.id))).get().pipe(Effect.orDie)
          const parts = yield* db.select().from(PartTable).where(and(eq(PartTable.message_id,
            SessionLegacyTranscript.MessageID.make(input.assistant.id)), sql`json_extract(${PartTable.data}, '$.callID') = ${input.call.id}`))
            .limit(2).all().pipe(Effect.orDie)
          if (original || parts.length) {
            const legacyOwner = original ? Schema.decodeUnknownOption(SessionLegacyTranscript.Info)({ ...original.data,
              id: original.id, sessionID: original.session_id }).valueOrUndefined : undefined
            const row = parts[0]
            const part = row ? Schema.decodeUnknownOption(SessionLegacyTranscript.Part)({ ...row.data,
              id: row.id, messageID: row.message_id, sessionID: row.session_id }).valueOrUndefined : undefined
            if (!original || !legacyOwner || original.session_id !== parent.id || legacyOwner.role !== "assistant" ||
              legacyOwner.agent !== "maestro" || parts.length !== 1 || !part || part.type !== "tool" ||
              part.tool !== "task" || part.callID !== input.call.id || part.sessionID !== parent.id ||
              part.messageID !== SessionLegacyTranscript.MessageID.make(input.assistant.id) || part.metadata?.providerExecuted || part.state.status !== "completed" ||
              !isDeepStrictEqual(part.state.input, call.state.input)) return false
            const legacyMetadata = record(part.state.metadata).valueOrUndefined
            if (!legacyMetadata || legacyMetadata.parentSessionId !== parent.id || legacyMetadata.sessionId !== child.id ||
              legacyMetadata.upstreamSettlement !== undefined ||
              legacyMetadata.interrupted === true && metadata.interrupted !== true ||
              !isDeepStrictEqual(legacyMetadata.workResult, metadata.workResult)) return false
          }
          const modern = yield* db.select().from(SessionMessageTable).where(eq(SessionMessageTable.id, input.authorMessageID)).get().pipe(Effect.orDie)
          const legacy = yield* db.select().from(MessageTable).where(eq(MessageTable.id, SessionLegacyTranscript.MessageID.make(input.authorMessageID))).get().pipe(Effect.orDie)
          if (!modern && !legacy) return false
          if (modern) {
            const author = decodeRow(modern)
            if (modern.session_id !== child.id || author.type !== "assistant" || author.agent !== child.agent || author.time.completed === undefined) return false
          }
          if (legacy) {
            const author = Schema.decodeUnknownSync(SessionLegacyTranscript.Info)({ ...legacy.data, id: legacy.id, sessionID: legacy.session_id })
            if (legacy.session_id !== child.id || author.role !== "assistant" || author.agent !== child.agent || author.time.completed === undefined) return false
          }
          // Replay origin is supplied only by EventV2's internal commit path, never event payload or metadata.
          const location = replay ? fromRow(parent).location : input.location
          return location?.directory === parent.directory && (location?.workspaceID ?? null) === parent.workspace_id
        })
      },
      getCurrentAssistant() {
        return Effect.gen(function* () {
          // A newer turn supersedes stale incomplete rows; never resume an older assistant projection.
          const row = yield* db
            .select()
            .from(SessionMessageTable)
            .where(
              and(eq(SessionMessageTable.session_id, event.data.sessionID), eq(SessionMessageTable.type, "assistant")),
            )
            .orderBy(desc(SessionMessageTable.seq))
            .limit(1)
            .get()
            .pipe(Effect.orDie)
          if (!row) return
          const message = decodeRow(row)
          return message.type === "assistant" && !message.time.completed ? message : undefined
        })
      },
      getAssistant(messageID) {
        return Effect.gen(function* () {
          const row = yield* db
            .select()
            .from(SessionMessageTable)
            .where(
              and(
                eq(SessionMessageTable.id, messageID),
                eq(SessionMessageTable.session_id, event.data.sessionID),
                eq(SessionMessageTable.type, "assistant"),
              ),
            )
            .get()
            .pipe(Effect.orDie)
          if (!row) return
          const message = decodeRow(row)
          return message.type === "assistant" ? message : undefined
        })
      },
      getCurrentShell(callID) {
        return Effect.gen(function* () {
          // The newest matching row wins. SQLite walks the (session, type, seq) index backwards and stops at the first
          // match, and only that row is decoded, so a Shell end costs the same however many shells the Session ran.
          const row = yield* db
            .select()
            .from(SessionMessageTable)
            .where(
              and(
                eq(SessionMessageTable.session_id, event.data.sessionID),
                eq(SessionMessageTable.type, "shell"),
                sql`json_extract(${SessionMessageTable.data}, '$.callID') = ${callID}`,
              ),
            )
            .orderBy(desc(SessionMessageTable.seq))
            .limit(1)
            .get()
            .pipe(Effect.orDie)
          if (!row) return
          const message = decodeRow(row)
          return message.type === "shell" ? message : undefined
        })
      },
      updateAssistant: updateMessage,
      updateShell: updateMessage,
      appendMessage,
    }
    yield* SessionMessageUpdater.update(adapter, event).pipe(Effect.orDie)
  })
}

function insertMessage(db: DatabaseService, event: SessionEvent.Event, message: SessionMessage.Message) {
  if (event.durable === undefined) return Effect.die("Durable Session event is missing aggregate sequence")
  const encoded = encodeMessage(message)
  const { id, type, ...data } = encoded
  return db
    .insert(SessionMessageTable)
    .values({
      id: SessionMessage.ID.make(id),
      session_id: event.data.sessionID,
      type,
      seq: event.durable.seq,
      time_created: DateTime.toEpochMillis(message.time.created),
      data,
    })
    .run()
    .pipe(Effect.orDie)
}

const layer = Layer.effectDiscard(
  Effect.gen(function* () {
    const events = yield* EventV2.Service
    const { db } = yield* Database.Service
    yield* events.project(SessionEvent.Created, (event) =>
      Effect.gen(function* () {
        const time = DateTime.toEpochMillis(event.data.timestamp)
        const workspaceID = event.data.location.workspaceID ? WorkspaceV2.ID.make(event.data.location.workspaceID) : null
        const stored = yield* db
          .insert(SessionTable)
          .values({
            id: event.data.sessionID,
            project_id: event.data.projectID,
            workspace_id: workspaceID,
            parent_id: event.data.parentID,
            // `slug` and `version` are unread columns that existing databases still require.
            slug: event.data.sessionID,
            version: "",
            directory: event.data.location.directory,
            path: event.data.subdirectory,
            title: event.data.title,
            agent: event.data.agent,
            model: event.data.model,
            time_created: time,
            time_updated: time,
          })
          .onConflictDoNothing()
          .returning({ sessionID: SessionTable.id })
          .get()
          .pipe(Effect.orDie)
        if (!stored) return yield* Effect.die(new SessionAlreadyProjected())
        if (workspaceID) {
          yield* db
            .update(WorkspaceTable)
            .set({ time_used: Date.now() })
            .where(eq(WorkspaceTable.id, workspaceID))
            .run()
            .pipe(Effect.orDie)
        }
      }),
    )
    yield* events.project(SessionEvent.Renamed, (event) =>
      db
        .update(SessionTable)
        .set({ title: event.data.title, time_updated: DateTime.toEpochMillis(event.data.timestamp) })
        .where(eq(SessionTable.id, event.data.sessionID))
        .run()
        .pipe(Effect.orDie),
    )
    yield* events.project(SessionEvent.Moved, (event) =>
      Effect.gen(function* () {
        yield* db
          .update(SessionTable)
          .set({
            directory: event.data.location.directory,
            path: event.data.subdirectory,
            workspace_id: event.data.location.workspaceID ? WorkspaceV2.ID.make(event.data.location.workspaceID) : null,
            time_updated: DateTime.toEpochMillis(event.data.timestamp),
          })
          .where(eq(SessionTable.id, event.data.sessionID))
          .run()
          .pipe(Effect.orDie)
      }),
    )
    yield* events.project(SessionEvent.Deleted, (event) =>
      db.delete(SessionTable).where(eq(SessionTable.id, event.data.sessionID)).run().pipe(Effect.orDie),
    )
    yield* events.project(SessionEvent.AgentSwitched, (event) =>
      db
        .update(SessionTable)
        .set({ agent: event.data.agent, time_updated: DateTime.toEpochMillis(event.data.timestamp) })
        .where(eq(SessionTable.id, event.data.sessionID))
        .run()
        .pipe(Effect.orDie, Effect.andThen(run(db, event))),
    )
    yield* events.project(SessionEvent.ModelSwitched, (event) =>
      Effect.gen(function* () {
        yield* db
          .update(SessionTable)
          .set({ model: event.data.model, time_updated: DateTime.toEpochMillis(event.data.timestamp) })
          .where(eq(SessionTable.id, event.data.sessionID))
          .run()
          .pipe(Effect.orDie)
        yield* run(db, event)
      }),
    )
    yield* events.project(SessionEvent.PermissionChanged, (event) =>
      Effect.gen(function* () {
        yield* db.update(SessionTable)
          .set({ permission: [...event.data.permission], time_updated: DateTime.toEpochMillis(event.data.timestamp) })
          .where(eq(SessionTable.id, event.data.sessionID))
          .run()
          .pipe(Effect.orDie)
      }),
    )
    yield* events.project(SessionEvent.Prompted, (event) =>
      Effect.gen(function* () {
        if (event.durable === undefined) return yield* Effect.die("Durable Session event is missing aggregate sequence")
        yield* SessionInput.projectPrompted(db, {
          id: event.data.messageID,
          sessionID: event.data.sessionID,
          prompt: event.data.prompt,
          promptContext: event.data.promptContext,
          delivery: event.data.delivery,
          timeCreated: event.data.timestamp,
          promotedSeq: event.durable.seq,
        })
        yield* run(db, event)
      }),
    )
    yield* events.project(SessionEvent.PromptAdmitted, (event) =>
      Effect.gen(function* () {
        if (event.durable === undefined) return yield* Effect.die("Durable Session event is missing aggregate sequence")
        yield* SessionInput.projectAdmitted(db, {
          admittedSeq: event.durable.seq,
          id: event.data.messageID,
          sessionID: event.data.sessionID,
          prompt: event.data.prompt,
          promptContext: event.data.promptContext,
          delivery: event.data.delivery,
          timeCreated: event.data.timestamp,
        })
      }),
    )
    yield* events.project(SessionEvent.ContextUpdated, (event) => run(db, event))
    yield* events.project(SessionEvent.Synthetic, (event) => run(db, event))
    yield* events.project(SessionEvent.Shell.Started, (event) => run(db, event))
    yield* events.project(SessionEvent.Shell.Ended, (event) => run(db, event))
    yield* events.project(SessionEvent.Step.Started, (event) => run(db, event))
    yield* events.project(SessionEvent.Step.Ended, (event) => run(db, event))
    yield* events.project(SessionEvent.Step.Failed, (event) => run(db, event))
    yield* events.project(SessionEvent.Text.Started, (event) => run(db, event))
    yield* events.project(SessionEvent.Text.Ended, (event) => run(db, event))
    yield* events.project(SessionEvent.Tool.Input.Started, (event) => run(db, event))
    yield* events.project(SessionEvent.Tool.Input.Ended, (event) => run(db, event))
    yield* events.project(SessionEvent.Tool.Called, (event) => run(db, event))
    yield* events.project(SessionEvent.Tool.Progress, (event, origin) => run(db, event, origin.replay))
    yield* events.project(SessionEvent.Tool.Success, (event) => run(db, event))
    yield* events.project(SessionEvent.Tool.Failed, (event) => run(db, event))
    yield* events.project(SessionEvent.Reasoning.Started, (event) => run(db, event))
    yield* events.project(SessionEvent.Reasoning.Ended, (event) => run(db, event))
    // yield* events.project(SessionEvent.Retried, (event) => run(db, event))
    yield* events.project(SessionEvent.Compaction.Ended, (event) => run(db, event))
    yield* events.project(SessionEvent.RevertEvent.Staged, (event) =>
      db
        .update(SessionTable)
        .set({
          revert: { ...event.data.revert, files: event.data.revert.files ? [...event.data.revert.files] : undefined },
          time_updated: DateTime.toEpochMillis(event.data.timestamp),
        })
        .where(eq(SessionTable.id, event.data.sessionID))
        .run()
        .pipe(Effect.orDie, Effect.asVoid),
    )
    yield* events.project(SessionEvent.RevertEvent.Cleared, (event) =>
      db
        .update(SessionTable)
        .set({ revert: null, time_updated: DateTime.toEpochMillis(event.data.timestamp) })
        .where(eq(SessionTable.id, event.data.sessionID))
        .run()
        .pipe(Effect.orDie, Effect.asVoid),
    )
    yield* events.project(SessionEvent.RevertEvent.Committed, (event) =>
      Effect.gen(function* () {
        const boundary = yield* db
          .select({ seq: SessionMessageTable.seq })
          .from(SessionMessageTable)
          .where(
            and(
              eq(SessionMessageTable.session_id, event.data.sessionID),
              eq(SessionMessageTable.id, event.data.messageID),
            ),
          )
          .get()
          .pipe(Effect.orDie)
        if (!boundary) return yield* Effect.die(`Revert boundary message not found: ${event.data.messageID}`)
        yield* db
          .delete(SessionMessageTable)
          .where(
            and(eq(SessionMessageTable.session_id, event.data.sessionID), gt(SessionMessageTable.seq, boundary.seq)),
          )
          .run()
          .pipe(Effect.orDie)
        yield* db
          .delete(SessionInputTable)
          .where(
            and(
              eq(SessionInputTable.session_id, event.data.sessionID),
              or(gt(SessionInputTable.admitted_seq, boundary.seq), gt(SessionInputTable.promoted_seq, boundary.seq)),
            ),
          )
          .run()
          .pipe(Effect.orDie)
        yield* db
          .update(SessionTable)
          .set({ revert: null, time_updated: DateTime.toEpochMillis(event.data.timestamp) })
          .where(eq(SessionTable.id, event.data.sessionID))
          .run()
          .pipe(Effect.orDie)
      }),
    )
  }),
)

export const node = makeGlobalNode({ name: "session-projector", layer, deps: [EventV2.node, Database.node] })
