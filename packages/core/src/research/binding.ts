export * as ResearchBinding from "./binding"

import { Research } from "@orchestra/schema/research"
import { MaestroEvent } from "@orchestra/schema/maestro-event"
import { Project } from "@orchestra/schema/project"
import { SessionID } from "@orchestra/schema/session-id"
import { SessionMessage } from "@orchestra/schema/session-message"
import { SessionLegacyTranscript } from "../session/legacy-transcript"
import { and, eq, sql } from "drizzle-orm"
import { Effect, Schema } from "effect"
import { isDeepStrictEqual } from "node:util"
import path from "node:path"
import { Database } from "../database/database"
import { EventV2 } from "../event"
import { EventTable } from "../event/sql"
import { CapabilityInvocation } from "../capability/invocation"
import { MessageTable, PartTable, SessionMessageTable, SessionTable } from "../session/sql"
import type { Tool } from "../tool/tool"
import { ProjectDirectoryTable, ProjectTable } from "../project/sql"

/** Human reads validate retained native placement; they do not issue a tool invocation. */
export const resolve = Effect.fn("ResearchBinding.resolve")(function* (sessionID: SessionID, projectID: Project.ID) {
  const database = yield* Database.Service
  const session = yield* database.db.select().from(SessionTable).where(eq(SessionTable.id, sessionID)).get().pipe(Effect.orDie)
  if (!session || session.project_id !== projectID || session.agent !== "jimmy")
    return yield* new Research.Error({ code: "not_found", message: "Research binding not found" })
  const rows = yield* database.db.select().from(EventTable).where(and(
    eq(EventTable.aggregate_id, sessionID),
    eq(EventTable.type, EventV2.versionedType(MaestroEvent.Task.Bound.type, 1)),
  )).all().pipe(Effect.orDie)
  if (rows.length !== 1)
    return yield* new Research.Error({ code: "binding_missing", message: "Retained task binding is missing or ambiguous" })
  const bound = yield* Schema.decodeUnknownEffect(MaestroEvent.Task.Bound.data)(rows[0].data).pipe(
    Effect.mapError(() => new Research.Error({ code: "binding_mismatch", message: "Invalid retained task binding" })),
  )
  const identities = yield* database.db.select({ id: EventTable.id }).from(EventTable).where(and(
    eq(EventTable.type, EventV2.versionedType(MaestroEvent.Task.Bound.type, 1)),
    sql`json_extract(${EventTable.data}, '$.projectID') = ${projectID}`,
    sql`json_extract(${EventTable.data}, '$.taskId') = ${bound.taskId}`,
  )).all().pipe(Effect.orDie)
  if (identities.length !== 1)
    return yield* new Research.Error({ code: "binding_mismatch", message: "Retained logical task identity is ambiguous" })
  const authorityID = yield* Schema.decodeUnknownEffect(SessionID)(bound.authoritySessionID).pipe(
    Effect.mapError(() => new Research.Error({ code: "binding_mismatch", message: "Invalid retained authority Session" })),
  )
  const authority = yield* database.db.select().from(SessionTable).where(
    eq(SessionTable.id, authorityID),
  ).get().pipe(Effect.orDie)
  if (bound.memberID !== "jimmy" || bound.projectID !== projectID || bound.executionSessionID !== sessionID ||
    !authority || authority.project_id !== projectID ||
    (session.parent_id ?? session.id) !== authority.id)
    return yield* new Research.Error({ code: "binding_mismatch", message: "Retained task placement does not match" })
  const project = yield* database.db.select().from(ProjectTable).where(eq(ProjectTable.id, projectID)).get().pipe(Effect.orDie)
  const directories = yield* database.db.select().from(ProjectDirectoryTable).where(eq(ProjectDirectoryTable.project_id, projectID)).all().pipe(Effect.orDie)
  const roots = [...directories.filter((entry) => entry.type === "git_worktree" || entry.type === "main").map((entry) => entry.directory),
    ...(project && project.worktree !== "/" ? [project.worktree] : [])]
    .filter((root) => session.directory === root || session.directory.startsWith(root + path.sep))
    .sort((a, b) => b.length - a.length)
  return yield* Schema.decodeUnknownEffect(Research.Binding)({
    projectID, memberID: "jimmy", taskId: bound.taskId, executionSessionID: sessionID,
    authoritySessionID: authority.id, directory: session.directory, worktree: roots[0] ?? session.directory,
  }).pipe(Effect.mapError(() => new Research.Error({ code: "binding_mismatch", message: "Invalid research placement" })))
})

export const require = Effect.fn("ResearchBinding.require")(function* (binding: Research.Binding, context: Tool.Context) {
  const frame = yield* CapabilityInvocation.require(context, {
    projectID: binding.projectID, location: { directory: binding.directory },
  }).pipe(Effect.mapError((error) => new Research.Error({
    code: error.code === "invocation_binding_missing" ? "binding_missing" : "binding_mismatch",
    message: "Research invocation is not bound",
  })))
  if (frame.owner.agentID !== "jimmy" || context.agent !== "jimmy" || context.sessionID !== binding.executionSessionID)
    return yield* new Research.Error({ code: "binding_mismatch", message: "Research invocation owner does not match" })
  const retained = yield* resolve(binding.executionSessionID, binding.projectID)
  if (!isDeepStrictEqual(retained, binding))
    return yield* new Research.Error({ code: "binding_mismatch", message: "Research binding does not match retained placement" })
  const database = yield* Database.Service
  // Both native runtimes share Session placement. Legacy parts and assistant message content remain distinct projections.
  const messages = yield* database.db.select().from(MessageTable).where(and(
    sql`${MessageTable.id} = ${context.assistantMessageID}`, eq(MessageTable.session_id, context.sessionID),
  )).all().pipe(Effect.orDie)
  if (messages.length) {
    const message = messages[0].data
    const parts = yield* database.db.select().from(PartTable).where(and(
      sql`${PartTable.message_id} = ${context.assistantMessageID}`, eq(PartTable.session_id, context.sessionID),
    )).all().pipe(Effect.orDie)
    if (message.role === "assistant" && message.agent === "jimmy" && parts.some((part) => {
      const tool = Schema.decodeUnknownOption(SessionLegacyTranscript.ToolPart)({ ...part.data, id: part.id, messageID: part.message_id, sessionID: part.session_id })
      return tool._tag === "Some" && tool.value.callID === context.toolCallID && tool.value.tool === frame.rootToolName
    }))
      return retained
    return yield* new Research.Error({ code: "binding_mismatch", message: "Native assistant/tool part does not match" })
  }
  const row = yield* database.db.select().from(SessionMessageTable).where(and(
    eq(SessionMessageTable.id, context.assistantMessageID), eq(SessionMessageTable.session_id, context.sessionID),
  )).get().pipe(Effect.orDie)
  const assistant = row ? yield* Schema.decodeUnknownEffect(SessionMessage.Message)({
    ...row.data, id: row.id, type: row.type,
  }).pipe(Effect.mapError(() => new Research.Error({ code: "binding_mismatch", message: "Invalid native assistant" }))) : undefined
  if (assistant?.type === "assistant" && assistant.agent === "jimmy" && assistant.content.some((part) =>
    part.type === "tool" && part.id === context.toolCallID && part.name === frame.rootToolName))
    return retained
  return yield* new Research.Error({ code: "binding_missing", message: "Native assistant/tool part is missing" })
})
