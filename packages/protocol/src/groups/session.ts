import { SessionMessage } from "@orchestra/schema/session-message"
import { SessionInput } from "@orchestra/schema/session-input"
import { SessionSubagentModels } from "@orchestra/schema/session-subagent-models"
import { PermissionV1 } from "@orchestra/schema/permission-v1"
import { PromptInput } from "@orchestra/schema/prompt-input"
import { Session } from "@orchestra/schema/session"
import { Project } from "@orchestra/schema/project"
import { AbsolutePath, NonNegativeInt, PositiveInt, RelativePath, statics } from "@orchestra/schema/schema"
import { Workspace } from "@orchestra/schema/workspace"
import { Context, Effect, Encoding, Result, Schema, SchemaGetter, Struct } from "effect"
import { HttpApiEndpoint, HttpApiGroup, HttpApiMiddleware, HttpApiSchema, OpenApi } from "effect/unstable/httpapi"
import {
  ConflictError,
  InvalidCursorError,
  InvalidRequestError,
  MessageNotFoundError,
  ServiceUnavailableError,
  SessionNotFoundError,
  UnknownError,
} from "../errors"
import { Agent } from "@orchestra/schema/agent"
import { Model } from "@orchestra/schema/model"
import { Location } from "@orchestra/schema/location"
import { Revert } from "@orchestra/schema/revert"
import { SessionEvent } from "@orchestra/schema/session-event"
import { SessionTodo } from "@orchestra/schema/session-todo"

const SessionsQueryFields = {
  workspace: Workspace.ID.pipe(Schema.optional),
  limit: Schema.NumberFromString.pipe(Schema.decodeTo(PositiveInt), Schema.optional).annotate({
    description: "Maximum number of sessions to return. Defaults to the newest 50 sessions.",
  }),
  order: Schema.optional(Schema.Union([Schema.Literal("asc"), Schema.Literal("desc")])).annotate({
    description: "Session order for the first page. Use desc for newest first or asc for oldest first.",
  }),
  search: Schema.optional(Schema.String),
  includeArchived: Schema.Literals(["true", "false"])
    .pipe(
      Schema.decodeTo(Schema.Boolean, {
        decode: SchemaGetter.transform((value) => value === "true"),
        encode: SchemaGetter.transform((value) => (value ? ("true" as const) : ("false" as const))),
      }),
      Schema.optional,
    )
    .annotate({ description: "Include archived sessions. Defaults to false; pagination cursors retain this setting." }),
}

const SessionsDirectoryQuery = Schema.Struct({
  ...SessionsQueryFields,
  directory: AbsolutePath,
})

const SessionsProjectQuery = Schema.Struct({
  ...SessionsQueryFields,
  project: Project.ID,
  subpath: RelativePath.pipe(Schema.optional),
})

const SessionsAllQuery = Schema.Struct(SessionsQueryFields)

const withCursor = <Fields extends Schema.Struct.Fields>(schema: Schema.Struct<Fields>) =>
  schema.mapFields((fields) => ({
    ...Struct.omit(fields, ["limit"]),
    anchor: Session.ListAnchor,
  }))

const SessionsCursorInput = Schema.Union([
  withCursor(SessionsDirectoryQuery),
  withCursor(SessionsProjectQuery),
  withCursor(SessionsAllQuery),
])
const SessionsCursorJson = Schema.fromJsonString(SessionsCursorInput)
const encodeSessionsCursor = Schema.encodeSync(SessionsCursorJson)
const decodeSessionsCursor = Schema.decodeUnknownEffect(SessionsCursorJson)
const invalidCursor = "Invalid cursor" as const

export const SessionsCursor = Schema.String.pipe(
  Schema.brand("SessionsCursor"),
  statics((schema) => {
    const make = schema.make.bind(schema)
    return {
      make: (input: typeof SessionsCursorInput.Type) => make(Encoding.encodeBase64Url(encodeSessionsCursor(input))),
      parse: (input: string) =>
        Effect.suspend(() => {
          const result = Encoding.decodeBase64UrlString(input)
          return Result.isFailure(result)
            ? Effect.fail(invalidCursor)
            : decodeSessionsCursor(result.success).pipe(Effect.mapError(() => invalidCursor))
        }),
    }
  }),
)
export type SessionsCursor = typeof SessionsCursor.Type

const SessionActive = Schema.Struct({
  type: Schema.Literal("running"),
}).annotate({ identifier: "SessionActive" })

const SessionHistoryLimit = PositiveInt.check(Schema.isLessThanOrEqualTo(100))

export const SessionHistoryQuery = Schema.Struct({
  limit: Schema.NumberFromString.pipe(Schema.decodeTo(SessionHistoryLimit), Schema.optional),
  after: Schema.NumberFromString.pipe(Schema.decodeTo(NonNegativeInt), Schema.optional),
})

export const ProcessNode = Schema.Struct({
  pid: Schema.Int,
  parentPid: Schema.optional(Schema.Int),
  name: Schema.optional(Schema.String),
}).annotate({ identifier: "SessionProcessNode" })

export const SessionProcess = Schema.Struct({
  id: Schema.String,
  pid: Schema.Int,
  title: Schema.String,
  started: Schema.Finite,
  processes: Schema.Array(ProcessNode),
  output: Schema.String,
  written: Schema.Finite,
}).annotate({ identifier: "SessionProcess" })

const SessionsQueryCursor = SessionsCursor.annotate({
  description: "Opaque pagination cursor returned as cursor.previous or cursor.next in the previous response.",
})

export const SessionsQuery = Schema.Struct({
  ...SessionsQueryFields,
  directory: AbsolutePath.pipe(Schema.optional),
  project: Project.ID.pipe(Schema.optional),
  subpath: RelativePath.pipe(Schema.optional),
  cursor: SessionsQueryCursor.pipe(Schema.optional),
}).annotate({ identifier: "SessionsQuery" })

export const makeSessionGroup = <I extends HttpApiMiddleware.AnyId, S>(sessionLocationMiddleware: Context.Key<I, S>) =>
  HttpApiGroup.make("server.session")
    .add(
      HttpApiEndpoint.get("session.list", "/api/session", {
        query: SessionsQuery,
        success: Schema.Struct({
          data: Schema.Array(Session.Info),
          cursor: Schema.Struct({
            previous: SessionsCursor.pipe(Schema.optional),
            next: SessionsCursor.pipe(Schema.optional),
          }),
        }).annotate({ identifier: "SessionsResponse" }),
        error: [InvalidCursorError, InvalidRequestError],
      }).annotateMerge(
        OpenApi.annotations({
          identifier: "v2.session.list",
          summary: "List sessions",
          description:
            "Retrieve sessions in the requested order. Items keep that order across pages; use cursor.next or cursor.previous to move through the ordered list.",
        }),
      ),
    )
    .add(
      HttpApiEndpoint.post("session.create", "/api/session", {
        payload: Schema.Struct({
          id: Session.ID.pipe(Schema.optional),
          agent: Agent.ID.pipe(Schema.optional),
          model: Model.Ref.pipe(Schema.optional),
          location: Location.Ref.pipe(Schema.optional),
        }),
        success: Schema.Struct({ data: Session.Info }),
        error: SessionNotFoundError,
      }).annotateMerge(
        OpenApi.annotations({
          identifier: "v2.session.create",
          summary: "Create session",
          description: "Create a session at the requested location.",
        }),
      ),
    )
    .add(
      HttpApiEndpoint.get("session.active", "/api/session/active", {
        success: Schema.Struct({ data: Schema.Record(Session.ID, SessionActive) }),
      }).annotateMerge(
        OpenApi.annotations({
          identifier: "v2.session.active",
          summary: "List active sessions",
          description:
            "Retrieve foreground Session drains currently owned by this Orchestra process. Sessions absent from the result are inactive.",
        }),
      ),
    )
    .add(
      HttpApiEndpoint.get("session.get", "/api/session/:sessionID", {
        params: { sessionID: Session.ID },
        success: Schema.Struct({ data: Session.Info }),
        error: SessionNotFoundError,
      })
        .middleware(sessionLocationMiddleware)
        .annotateMerge(
          OpenApi.annotations({
            identifier: "v2.session.get",
            summary: "Get session",
            description: "Retrieve a session by ID.",
          }),
        ),
    )
    .add(
      HttpApiEndpoint.post("session.archive", "/api/session/:sessionID/archive", {
        params: { sessionID: Session.ID },
        payload: Schema.Struct({ archived: Schema.Boolean }),
        success: HttpApiSchema.NoContent,
        error: SessionNotFoundError,
      })
        .middleware(sessionLocationMiddleware)
        .annotateMerge(
          OpenApi.annotations({
            identifier: "v2.session.archive",
            summary: "Archive or restore session",
            description: "Change session visibility without stopping execution or removing session history.",
          }),
      ),
    )
    .add(
      HttpApiEndpoint.post("session.rename", "/api/session/:sessionID/rename", {
        params: { sessionID: Session.ID },
        payload: Schema.Struct({ title: Schema.NonEmptyString }),
        success: HttpApiSchema.NoContent,
        error: SessionNotFoundError,
      })
        .middleware(sessionLocationMiddleware)
        .annotateMerge(
          OpenApi.annotations({
            identifier: "v2.session.rename",
            summary: "Rename session",
            description: "Replace the session title.",
          }),
        ),
    )
    .add(
      HttpApiEndpoint.delete("session.remove", "/api/session/:sessionID", {
        params: { sessionID: Session.ID },
        success: HttpApiSchema.NoContent,
        error: SessionNotFoundError,
      })
        .middleware(sessionLocationMiddleware)
        .annotateMerge(
          OpenApi.annotations({
            identifier: "v2.session.remove",
            summary: "Delete session",
            description: "Interrupt the session, then permanently delete it with its child sessions and history.",
          }),
        ),
    )
    .add(
      HttpApiEndpoint.get("session.getSubagentModels", "/api/session/:sessionID/subagent-models", {
        params: { sessionID: Session.ID },
        success: Schema.Struct({ data: SessionSubagentModels.Policy }),
        error: [SessionNotFoundError, ServiceUnavailableError],
      })
        .middleware(sessionLocationMiddleware)
        .annotateMerge(OpenApi.annotations({
          identifier: "v2.session.getSubagentModels",
          summary: "Get session subagent model policy",
          description: "Read the stored outgoing subagent model policy. Corrupt stored policy is refused.",
        })),
    )
    .add(
      HttpApiEndpoint.post("session.setSubagentModels", "/api/session/:sessionID/subagent-models", {
        params: { sessionID: Session.ID },
        payload: Schema.Struct({ policy: SessionSubagentModels.Policy }),
        success: Schema.Struct({ data: SessionSubagentModels.Policy }),
        error: [SessionNotFoundError, ServiceUnavailableError],
      })
        .middleware(sessionLocationMiddleware)
        .annotateMerge(OpenApi.annotations({
          identifier: "v2.session.setSubagentModels",
          summary: "Set session subagent model policy",
          description: "Durably replace the outgoing subagent model policy; inheritance and an empty allowlist are distinct.",
        })),
    )
    .add(
      HttpApiEndpoint.get("session.getPermission", "/api/session/:sessionID/permission-rules", {
        params: { sessionID: Session.ID },
        success: Schema.Struct({ data: PermissionV1.Ruleset }),
        error: SessionNotFoundError,
      })
        .middleware(sessionLocationMiddleware)
        .annotateMerge(OpenApi.annotations({
          identifier: "v2.session.getPermission",
          summary: "Get session permission rules",
        })),
    )
    .add(
      HttpApiEndpoint.post("session.setPermission", "/api/session/:sessionID/permission-rules", {
        params: { sessionID: Session.ID },
        payload: Schema.Struct({ permission: PermissionV1.Ruleset }),
        success: Schema.Struct({ data: PermissionV1.Ruleset }),
        error: SessionNotFoundError,
      })
        .middleware(sessionLocationMiddleware)
        .annotateMerge(OpenApi.annotations({
          identifier: "v2.session.setPermission",
          summary: "Set session permission rules",
        })),
    )
    .add(
      HttpApiEndpoint.post("session.switchAgent", "/api/session/:sessionID/agent", {
        params: { sessionID: Session.ID },
        payload: Schema.Struct({ agent: Agent.ID }),
        success: HttpApiSchema.NoContent,
        error: SessionNotFoundError,
      })
        .middleware(sessionLocationMiddleware)
        .annotateMerge(
          OpenApi.annotations({
            identifier: "v2.session.switchAgent",
            summary: "Switch session agent",
            description: "Switch the agent used by subsequent provider turns.",
          }),
        ),
    )
    .add(
      HttpApiEndpoint.post("session.switchModel", "/api/session/:sessionID/model", {
        params: { sessionID: Session.ID },
        payload: Schema.Struct({ model: Model.Ref }),
        success: HttpApiSchema.NoContent,
        error: SessionNotFoundError,
      })
        .middleware(sessionLocationMiddleware)
        .annotateMerge(
          OpenApi.annotations({
            identifier: "v2.session.switchModel",
            summary: "Switch session model",
            description: "Switch the model used by subsequent provider turns.",
          }),
        ),
    )
    .add(
      HttpApiEndpoint.post("session.prompt", "/api/session/:sessionID/prompt", {
        params: { sessionID: Session.ID },
        payload: Schema.Struct({
          id: SessionMessage.ID.pipe(Schema.optional),
          prompt: PromptInput.Prompt,
          delivery: SessionInput.Delivery.pipe(Schema.optional),
          resume: Schema.Boolean.pipe(Schema.optional),
        }),
        success: Schema.Struct({ data: SessionInput.Admitted }),
        error: [ConflictError, SessionNotFoundError],
      })
        .middleware(sessionLocationMiddleware)
        .annotateMerge(
          OpenApi.annotations({
            identifier: "v2.session.prompt",
            summary: "Send message",
            description: "Durably admit one session input and schedule agent-loop execution unless resume is false.",
          }),
        ),
    )
    .add(
      HttpApiEndpoint.post("session.command", "/api/session/:sessionID/command", {
        params: { sessionID: Session.ID },
        payload: Schema.Struct({
          id: SessionMessage.ID.pipe(Schema.optional),
          command: Schema.String,
          arguments: Schema.String.pipe(Schema.optional),
          files: PromptInput.Prompt.fields.files,
          agents: PromptInput.Prompt.fields.agents,
          delivery: SessionInput.Delivery.pipe(Schema.optional),
          resume: Schema.Boolean.pipe(Schema.optional),
        }),
        success: Schema.Struct({ data: SessionInput.Admitted }),
        error: [ConflictError, SessionNotFoundError, InvalidRequestError, UnknownError],
      })
        .middleware(sessionLocationMiddleware)
        .annotateMerge(
          OpenApi.annotations({
            identifier: "v2.session.command",
            summary: "Run command",
            description:
              "Render a configured command or an MCP prompt (`server:prompt`) with its arguments and admit the result as one session input.",
          }),
        ),
    )
    .add(
      HttpApiEndpoint.post("session.compact", "/api/session/:sessionID/compact", {
        params: { sessionID: Session.ID },
        success: Schema.Struct({ data: Schema.Struct({ compacted: Schema.Boolean }) }).annotate({
          identifier: "SessionCompactResult",
        }),
        error: [SessionNotFoundError, ConflictError, UnknownError],
      })
        .middleware(sessionLocationMiddleware)
        .annotateMerge(
          OpenApi.annotations({
            identifier: "v2.session.compact",
            summary: "Compact session",
            description:
              "Summarize the conversation now into a compaction checkpoint. `compacted` is false when there was nothing to summarize. A running Session is refused as busy.",
          }),
        ),
    )
    .add(
      HttpApiEndpoint.post("session.fork", "/api/session/:sessionID/fork", {
        params: { sessionID: Session.ID },
        payload: Schema.Struct({ messageID: SessionMessage.ID.pipe(Schema.optional) }),
        success: Schema.Struct({ data: Session.Info }),
        error: [SessionNotFoundError, MessageNotFoundError],
      })
        .middleware(sessionLocationMiddleware)
        .annotateMerge(
          OpenApi.annotations({
            identifier: "v2.session.fork",
            summary: "Fork session",
            description:
              "Create a Session at the same location with a copy of the history before `messageID` (all of it when omitted), stopping at a staged revert.",
          }),
        ),
    )
    .add(
      HttpApiEndpoint.post("session.move", "/api/session/:sessionID/move", {
        params: { sessionID: Session.ID },
        payload: Schema.Struct({ location: Location.Ref, moveChanges: Schema.optional(Schema.Boolean) }),
        success: HttpApiSchema.NoContent,
        error: [SessionNotFoundError, ConflictError, InvalidRequestError],
      })
        .middleware(sessionLocationMiddleware)
        .annotateMerge(
          OpenApi.annotations({
            identifier: "v2.session.move",
            summary: "Move session",
            description:
              "Move the Session to another directory or workspace of its project. With `moveChanges`, the source's uncommitted changes are applied at the destination and discarded at the source.",
          }),
        ),
    )
    .add(
      HttpApiEndpoint.post("session.shell", "/api/session/:sessionID/shell", {
        params: { sessionID: Session.ID },
        payload: Schema.Struct({ id: Schema.String.pipe(Schema.optional), command: Schema.NonEmptyString }),
        success: HttpApiSchema.NoContent,
        error: [SessionNotFoundError, ConflictError],
      })
        .middleware(sessionLocationMiddleware)
        .annotateMerge(
          OpenApi.annotations({
            identifier: "v2.session.shell",
            summary: "Run shell command",
            description:
              "Run a shell command in the Session's location and record it with its output for the next turn. No turn starts.",
          }),
        ),
    )
    .add(
      HttpApiEndpoint.post("session.skill", "/api/session/:sessionID/skill", {
        params: { sessionID: Session.ID },
        payload: Schema.Struct({ skill: Schema.String, resume: Schema.Boolean.pipe(Schema.optional) }),
        success: HttpApiSchema.NoContent,
        error: [SessionNotFoundError, ConflictError, InvalidRequestError],
      })
        .middleware(sessionLocationMiddleware)
        .annotateMerge(
          OpenApi.annotations({
            identifier: "v2.session.skill",
            summary: "Load skill",
            description: "Record a skill's instructions as context, then run a turn unless resume is false.",
          }),
        ),
    )
    .add(
      HttpApiEndpoint.post("session.synthetic", "/api/session/:sessionID/synthetic", {
        params: { sessionID: Session.ID },
        payload: Schema.Struct({
          id: SessionMessage.ID.pipe(Schema.optional),
          text: Schema.String,
          resume: Schema.Boolean.pipe(Schema.optional),
        }),
        success: Schema.Struct({ data: Schema.Struct({ id: SessionMessage.ID }) }),
        error: [SessionNotFoundError, ConflictError],
      })
        .middleware(sessionLocationMiddleware)
        .annotateMerge(
          OpenApi.annotations({
            identifier: "v2.session.synthetic",
            summary: "Add synthetic context",
            description: "Record text as synthetic context, then run a turn unless resume is false.",
          }),
        ),
    )
    .add(
      HttpApiEndpoint.post("session.generate", "/api/session/:sessionID/generate", {
        params: { sessionID: Session.ID },
        payload: Schema.Struct({ prompt: Schema.String }),
        success: Schema.Struct({ data: Schema.Struct({ text: Schema.String }) }),
        error: [SessionNotFoundError, UnknownError],
      })
        .middleware(sessionLocationMiddleware)
        .annotateMerge(
          OpenApi.annotations({
            identifier: "v2.session.generate",
            summary: "Generate text",
            description:
              "Run one tool-less completion of the prompt after the Session's history with its model. Nothing is recorded.",
          }),
        ),
    )
    .add(
      HttpApiEndpoint.get("session.todo", "/api/session/:sessionID/todo", {
        params: { sessionID: Session.ID },
        success: Schema.Struct({ data: Schema.Array(SessionTodo.Info) }),
        error: SessionNotFoundError,
      })
        .middleware(sessionLocationMiddleware)
        .annotateMerge(
          OpenApi.annotations({
            identifier: "v2.session.todo",
            summary: "Get session todos",
            description: "The Session's current todo list, as its agent last wrote it.",
          }),
        ),
    )
    .add(
      HttpApiEndpoint.post("session.wait", "/api/session/:sessionID/wait", {
        params: { sessionID: Session.ID },
        success: HttpApiSchema.NoContent,
        error: SessionNotFoundError,
      })
        .middleware(sessionLocationMiddleware)
        .annotateMerge(
          OpenApi.annotations({
            identifier: "v2.session.wait",
            summary: "Wait for session",
            description: "Wait for a session agent loop to become idle.",
          }),
        ),
    )
    .add(
      HttpApiEndpoint.post("session.revert.stage", "/api/session/:sessionID/revert/stage", {
        params: { sessionID: Session.ID },
        payload: Schema.Struct({ messageID: SessionMessage.ID, files: Schema.Boolean.pipe(Schema.optional) }),
        success: Schema.Struct({ data: Revert.State }),
        error: [MessageNotFoundError, SessionNotFoundError, UnknownError],
      })
        .middleware(sessionLocationMiddleware)
        .annotateMerge(
          OpenApi.annotations({
            identifier: "v2.session.revert.stage",
            summary: "Stage session revert",
            description: "Stage or move a reversible session boundary and optionally apply its file changes.",
          }),
        ),
    )
    .add(
      HttpApiEndpoint.post("session.revert.clear", "/api/session/:sessionID/revert/clear", {
        params: { sessionID: Session.ID },
        success: HttpApiSchema.NoContent,
        error: [SessionNotFoundError, UnknownError],
      })
        .middleware(sessionLocationMiddleware)
        .annotateMerge(OpenApi.annotations({ identifier: "v2.session.revert.clear", summary: "Clear staged revert" })),
    )
    .add(
      HttpApiEndpoint.post("session.revert.commit", "/api/session/:sessionID/revert/commit", {
        params: { sessionID: Session.ID },
        success: HttpApiSchema.NoContent,
        error: SessionNotFoundError,
      })
        .middleware(sessionLocationMiddleware)
        .annotateMerge(
          OpenApi.annotations({ identifier: "v2.session.revert.commit", summary: "Commit staged revert" }),
        ),
    )
    .add(
      HttpApiEndpoint.get("session.context", "/api/session/:sessionID/context", {
        params: { sessionID: Session.ID },
        success: Schema.Struct({ data: Schema.Array(SessionMessage.Message) }),
        error: [SessionNotFoundError, UnknownError],
      })
        .middleware(sessionLocationMiddleware)
        .annotateMerge(
          OpenApi.annotations({
            identifier: "v2.session.context",
            summary: "Get session context",
            description: "Retrieve the active context messages for a session (all messages after the last compaction).",
          }),
        ),
    )
    .add(
      HttpApiEndpoint.get("session.diff", "/api/session/:sessionID/diff", {
        params: { sessionID: Session.ID },
        query: Schema.Struct({
          messageID: SessionMessage.ID,
          context: Schema.NumberFromString.pipe(Schema.decodeTo(NonNegativeInt), Schema.optional),
        }),
        success: Schema.Struct({ data: Schema.Array(Revert.FileDiff) }),
        error: [SessionNotFoundError, UnknownError],
      })
        .middleware(sessionLocationMiddleware)
        .annotateMerge(
          OpenApi.annotations({
            identifier: "v2.session.diff",
            summary: "Get turn diff",
            description:
              "Diff the files changed by the turn that answered a user message, from its first to its last snapshot. Returns an empty list when the message is not a user message or the turn has no snapshots.",
          }),
        ),
    )
    .add(
      HttpApiEndpoint.post("session.background", "/api/session/:sessionID/background", {
        params: { sessionID: Session.ID },
        success: Schema.Struct({ data: Schema.Number }),
        error: [SessionNotFoundError],
      })
        .middleware(sessionLocationMiddleware)
        .annotateMerge(
          OpenApi.annotations({
            identifier: "v2.session.background",
            summary: "Background subagents",
            description:
              "Move the Session's foreground subagent tasks to the background so the parent turn continues. Returns how many tasks were moved.",
          }),
        ),
    )
    .add(
      HttpApiEndpoint.get("session.history", "/api/session/:sessionID/history", {
        params: { sessionID: Session.ID },
        query: SessionHistoryQuery,
        success: Schema.Struct({
          data: Schema.Array(SessionEvent.Durable),
          hasMore: Schema.Boolean,
        }).annotate({ identifier: "SessionHistory" }),
        error: SessionNotFoundError,
      })
        .middleware(sessionLocationMiddleware)
        .annotateMerge(
          OpenApi.annotations({
            identifier: "v2.session.history",
            summary: "Get session history",
            description:
              "Read one finite page of public durable Session events after an exclusive aggregate sequence. Newly committed events may appear on later pages.",
          }),
        ),
    )
    .add(
      HttpApiEndpoint.get("session.events", "/api/session/:sessionID/event", {
        params: { sessionID: Session.ID },
        query: {
          after: Schema.NumberFromString.pipe(Schema.decodeTo(NonNegativeInt), Schema.optional),
        },
        success: HttpApiSchema.StreamSse({ data: SessionEvent.Durable }),
        error: SessionNotFoundError,
      })
        .middleware(sessionLocationMiddleware)
        .annotateMerge(
          OpenApi.annotations({
            identifier: "v2.session.events",
            summary: "Subscribe to session events",
            description: "Replay durable events after an aggregate sequence, then continue with new durable events.",
          }),
        ),
    )
    .add(
      HttpApiEndpoint.post("session.interrupt", "/api/session/:sessionID/interrupt", {
        params: { sessionID: Session.ID },
        success: HttpApiSchema.NoContent,
        error: SessionNotFoundError,
      })
        .middleware(sessionLocationMiddleware)
        .annotateMerge(
          OpenApi.annotations({
            identifier: "v2.session.interrupt",
            summary: "Interrupt session execution",
            description: "Interrupt active execution owned by this Orchestra process. Idle interruption is a no-op.",
          }),
        ),
    )
    .add(
      HttpApiEndpoint.get("session.message", "/api/session/:sessionID/message/:messageID", {
        params: { sessionID: Session.ID, messageID: SessionMessage.ID },
        success: Schema.Struct({ data: SessionMessage.Message }),
        error: [SessionNotFoundError, MessageNotFoundError],
      })
        .middleware(sessionLocationMiddleware)
        .annotateMerge(
          OpenApi.annotations({
            identifier: "v2.session.message",
            summary: "Get session message",
            description: "Retrieve one projected message owned by the Session.",
          }),
        ),
    )
    .add(
      HttpApiEndpoint.get("session.processes", "/api/session/:sessionID/processes", {
        params: { sessionID: Session.ID },
        query: Schema.Struct({
          tail: Schema.NumberFromString.pipe(Schema.optional),
        }),
        success: Schema.Struct({ data: Schema.Array(SessionProcess) }),
        error: SessionNotFoundError,
      })
        .middleware(sessionLocationMiddleware)
        .annotateMerge(
          OpenApi.annotations({
            identifier: "v2.session.processes",
            summary: "List background processes",
            description: "List the process trees a session's shell tool left running.",
          }),
        ),
    )
    .add(
      HttpApiEndpoint.post("session.processStop", "/api/session/:sessionID/processes/:processID/stop", {
        params: { sessionID: Session.ID, processID: Schema.String },
        success: Schema.Struct({ data: Schema.Boolean }),
        error: SessionNotFoundError,
      })
        .middleware(sessionLocationMiddleware)
        .annotateMerge(
          OpenApi.annotations({
            identifier: "v2.session.processStop",
            summary: "Stop background process",
            description: "Stop one background process tree of a session.",
          }),
        ),
    )
    .annotateMerge(
      OpenApi.annotations({
        title: "sessions",
        description: "Experimental session routes.",
      }),
    )
