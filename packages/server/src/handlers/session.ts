import { SessionTodo, SessionV2 } from "@orchestra/core/session"
import { SessionProcess } from "@orchestra/core/session-process"
import { SlashCommand } from "@orchestra/core/slash-command"
import { SessionSubagentModels } from "@orchestra/core/session/subagent-models"
import { DateTime, Effect, Stream } from "effect"
import { HttpApiBuilder, HttpApiSchema } from "effect/unstable/httpapi"
import { Api } from "../api"
import { SessionsCursor } from "@orchestra/protocol/groups/session"
import {
  ConflictError,
  InvalidCursorError,
  InvalidRequestError,
  MessageNotFoundError,
  ServiceUnavailableError,
  SessionNotFoundError,
  UnknownError,
} from "@orchestra/protocol/errors"
import { AbsolutePath } from "@orchestra/core/schema"
import { AppProcess } from "@orchestra/core/process"
import { FSUtil } from "@orchestra/core/fs-util"

const DefaultSessionsLimit = 50
const DefaultSessionHistoryLimit = 50
const typedNotFound = <A, R>(effect: Effect.Effect<A, SessionV2.NotFoundError, R>) =>
  Effect.catchTag(
    effect,
    "Session.NotFoundError",
    (error) =>
      new SessionNotFoundError({ sessionID: error.sessionID, message: `Session not found: ${error.sessionID}` }),
  )

// The errors the V2 Session operations share, mapped onto the public ones.
const operationErrors = {
  "Session.NotFoundError": (error: SessionV2.NotFoundError) =>
    Effect.fail(new SessionNotFoundError({ sessionID: error.sessionID, message: `Session not found: ${error.sessionID}` })),
  "Session.BusyError": (error: SessionV2.BusyError) =>
    Effect.fail(new ConflictError({ message: `Session is busy: ${error.sessionID}`, resource: error.sessionID })),
  // A model or history failure while compacting or generating reaches the caller in its own words.
  "Session.RunFailedError": (error: SessionV2.RunFailedError) => Effect.fail(new UnknownError({ message: error.message })),
}
const missingOrBusy = {
  "Session.NotFoundError": operationErrors["Session.NotFoundError"],
  "Session.BusyError": operationErrors["Session.BusyError"],
}

export const SessionHandler = HttpApiBuilder.group(Api, "server.session", (handlers) =>
  Effect.gen(function* () {
    const session = yield* SessionV2.Service
    const subagentModels = yield* SessionSubagentModels.Service
    const appProcess = yield* AppProcess.Service
    const sessionProcess = yield* SessionProcess.Service
    const fs = yield* FSUtil.Service

    const admit = (input: Parameters<SessionV2.Interface["prompt"]>[0]) =>
      session.prompt(input).pipe(
        Effect.catchTag("Session.NotFoundError", (error) =>
          Effect.fail(
            new SessionNotFoundError({
              sessionID: error.sessionID,
              message: `Session not found: ${error.sessionID}`,
            }),
          ),
        ),
        Effect.catchTag("Session.PromptConflictError", (error) =>
          Effect.fail(
            new ConflictError({
              message: `Prompt message ID conflicts with an existing durable record: ${error.messageID}`,
              resource: error.messageID,
            }),
          ),
        ),
        // A hook refused the prompt before admission; nothing was recorded, and the hook's words say why.
        Effect.catchTag("Session.PromptBlockedError", (error) =>
          Effect.fail(new ConflictError({ message: error.detail, resource: error.sessionID })),
        ),
      )

    const policyResult = <A>(effect: Effect.Effect<A, SessionSubagentModels.Error>) => effect.pipe(
      Effect.catchTag("SessionSubagentModels.NotFoundError", (error) =>
        new SessionNotFoundError({ sessionID: error.sessionID, message: `Session not found: ${error.sessionID}` }),
      ),
      Effect.catchTags({
        "SessionSubagentModels.StorageError": () => new ServiceUnavailableError({ service: "session-subagent-models", message: "Session model policy storage is unavailable" }),
        "SessionSubagentModels.InvalidChainError": () => new ServiceUnavailableError({ service: "session-subagent-models", message: "Session model policy ancestry is invalid" }),
        "SessionSubagentModels.ModelDeniedError": () => new ServiceUnavailableError({ service: "session-subagent-models", message: "Session model policy could not be evaluated" }),
      }),
    )

    return handlers
      .handle("session.getSubagentModels", Effect.fn(function* (ctx) {
        return { data: yield* policyResult(subagentModels.get(ctx.params.sessionID)) }
      }))
      .handle("session.setSubagentModels", Effect.fn(function* (ctx) {
        return { data: yield* policyResult(subagentModels.set(ctx.params.sessionID, ctx.payload.policy)) }
      }))
      .handle("session.getPermission", Effect.fn(function* (ctx) {
        return { data: yield* typedNotFound(session.getPermission(ctx.params.sessionID)) }
      }))
      .handle("session.setPermission", Effect.fn(function* (ctx) {
        return { data: yield* typedNotFound(session.setPermission({ sessionID: ctx.params.sessionID, permission: ctx.payload.permission })) }
      }))
      .handle(
        "session.list",
        Effect.fn(function* (ctx) {
          const query =
            ctx.query.cursor !== undefined
              ? yield* SessionsCursor.parse(ctx.query.cursor).pipe(
                  Effect.mapError(() => new InvalidCursorError({ message: "Invalid cursor" })),
                )
              : ctx.query
          const sessions = yield* session.list({
            ...query,
            workspaceID: query.workspace,
            limit: ctx.query.limit ?? DefaultSessionsLimit,
          })
          const first = sessions[0]
          const last = sessions.at(-1)
          return {
            data: sessions,
            cursor: {
              previous: first
                ? SessionsCursor.make({
                    ...query,
                    anchor: {
                      id: first.id,
                      time: DateTime.toEpochMillis(first.time.created),
                      direction: "previous",
                    },
                  })
                : undefined,
              next: last
                ? SessionsCursor.make({
                    ...query,
                    anchor: {
                      id: last.id,
                      time: DateTime.toEpochMillis(last.time.created),
                      direction: "next",
                    },
                  })
                : undefined,
            },
          }
        }),
      )
      .handle(
        "session.create",
        Effect.fn(function* (ctx) {
          return {
            data: yield* session
              .create({
                id: ctx.payload.id,
                agent: ctx.payload.agent,
                model: ctx.payload.model,
                location: ctx.payload.location ?? { directory: AbsolutePath.make(process.cwd()) },
              })
              .pipe(typedNotFound),
          }
        }),
      )
      .handle(
        "session.active",
        Effect.fn(function* () {
          return {
            data: Object.fromEntries(
              Array.from(yield* session.active, (sessionID) => [sessionID, { type: "running" as const }]),
            ),
          }
        }),
      )
      .handle(
        "session.get",
        Effect.fn(function* (ctx) {
          return {
            data: yield* session.get(ctx.params.sessionID).pipe(
              Effect.catchTag(
                "Session.NotFoundError",
                (error) =>
                  new SessionNotFoundError({
                    sessionID: error.sessionID,
                    message: `Session not found: ${error.sessionID}`,
                  }),
              ),
            ),
          }
        }),
      )
      .handle(
        "session.archive",
        Effect.fn(function* (ctx) {
          yield* session
            .archive({ sessionID: ctx.params.sessionID, archived: ctx.payload.archived })
            .pipe(typedNotFound)
          return HttpApiSchema.NoContent.make()
        }),
      )
      .handle(
        "session.rename",
        Effect.fn(function* (ctx) {
          yield* session.rename({ sessionID: ctx.params.sessionID, title: ctx.payload.title }).pipe(typedNotFound)
          return HttpApiSchema.NoContent.make()
        }),
      )
      .handle(
        "session.remove",
        Effect.fn(function* (ctx) {
          yield* session.remove(ctx.params.sessionID).pipe(typedNotFound)
          return HttpApiSchema.NoContent.make()
        }),
      )
      .handle(
        "session.switchAgent",
        Effect.fn(function* (ctx) {
          yield* session.switchAgent({ sessionID: ctx.params.sessionID, agent: ctx.payload.agent }).pipe(
            Effect.catchTag("Session.NotFoundError", (error) =>
              Effect.fail(
                new SessionNotFoundError({
                  sessionID: error.sessionID,
                  message: `Session not found: ${error.sessionID}`,
                }),
              ),
            ),
          )
          return HttpApiSchema.NoContent.make()
        }),
      )
      .handle(
        "session.switchModel",
        Effect.fn(function* (ctx) {
          yield* session.switchModel({ sessionID: ctx.params.sessionID, model: ctx.payload.model }).pipe(
            Effect.catchTag("Session.NotFoundError", (error) =>
              Effect.fail(
                new SessionNotFoundError({
                  sessionID: error.sessionID,
                  message: `Session not found: ${error.sessionID}`,
                }),
              ),
            ),
          )
          return HttpApiSchema.NoContent.make()
        }),
      )
      .handle(
        "session.prompt",
        Effect.fn(function* (ctx) {
          return {
            data: yield* admit({
              sessionID: ctx.params.sessionID,
              id: ctx.payload.id,
              prompt: ctx.payload.prompt,
              delivery: ctx.payload.delivery,
              resume: ctx.payload.resume,
            }),
          }
        }),
      )
      .handle(
        "session.command",
        Effect.fn(function* (ctx) {
          const resolved = yield* SlashCommand.render(ctx.payload.command, ctx.payload.arguments ?? "").pipe(
            Effect.flatMap(SlashCommand.resolve),
            Effect.provideService(AppProcess.Service, appProcess),
            Effect.provideService(FSUtil.Service, fs),
            Effect.catchTags({
              "SlashCommand.NotFoundError": (error) =>
                Effect.fail(new InvalidRequestError({ message: `Command not found: ${error.name}`, field: "command" })),
              "Mcp.NotFoundError": (error) =>
                Effect.fail(new UnknownError({ message: `MCP server is not connected: ${error.name}` })),
              "Mcp.RequestError": (error) => Effect.fail(new UnknownError({ message: error.message })),
            }),
          )
          // A command's own agent and model are the Session's from this prompt on, as the app's own choice would be.
          if (resolved.agent)
            yield* session.switchAgent({ sessionID: ctx.params.sessionID, agent: resolved.agent }).pipe(typedNotFound)
          if (resolved.model)
            yield* session.switchModel({ sessionID: ctx.params.sessionID, model: resolved.model }).pipe(typedNotFound)
          return {
            data: yield* admit({
              sessionID: ctx.params.sessionID,
              id: ctx.payload.id,
              prompt: {
                text: resolved.prompt.text,
                files: [...resolved.prompt.files, ...(ctx.payload.files ?? [])],
                agents: [...resolved.prompt.agents, ...(ctx.payload.agents ?? [])],
              },
              delivery: ctx.payload.delivery,
              resume: ctx.payload.resume,
            }),
          }
        }),
      )
      .handle(
        "session.compact",
        Effect.fn(function* (ctx) {
          const compacted = yield* session
            .compact({ sessionID: ctx.params.sessionID })
            .pipe(Effect.catchTags(operationErrors))
          return { data: { compacted } }
        }),
      )
      .handle(
        "session.fork",
        Effect.fn(function* (ctx) {
          return {
            data: yield* session.fork({ sessionID: ctx.params.sessionID, messageID: ctx.payload.messageID }).pipe(
              Effect.catchTags({
                "Session.NotFoundError": operationErrors["Session.NotFoundError"],
                "Session.MessageNotFoundError": (error) =>
                  Effect.fail(
                    new MessageNotFoundError({
                      sessionID: error.sessionID,
                      messageID: error.messageID,
                      message: `Message not found: ${error.messageID}`,
                    }),
                  ),
              }),
            ),
          }
        }),
      )
      .handle(
        "session.move",
        Effect.fn(function* (ctx) {
          yield* session.move({ sessionID: ctx.params.sessionID, location: ctx.payload.location }).pipe(
            Effect.catchTags({
              "Session.NotFoundError": operationErrors["Session.NotFoundError"],
              "Session.BusyError": operationErrors["Session.BusyError"],
              "Session.MoveError": (error) =>
                Effect.fail(
                  new InvalidRequestError({
                    message: `${error.directory} is not in the Session's project`,
                    field: "location",
                  }),
                ),
            }),
          )
          return HttpApiSchema.NoContent.make()
        }),
      )
      .handle(
        "session.shell",
        Effect.fn(function* (ctx) {
          yield* session
            .shell({ sessionID: ctx.params.sessionID, id: ctx.payload.id, command: ctx.payload.command })
            .pipe(Effect.catchTags(missingOrBusy))
          return HttpApiSchema.NoContent.make()
        }),
      )
      .handle(
        "session.skill",
        Effect.fn(function* (ctx) {
          yield* session
            .skill({ sessionID: ctx.params.sessionID, skill: ctx.payload.skill, resume: ctx.payload.resume })
            .pipe(
              Effect.catchTags({
                "Session.NotFoundError": operationErrors["Session.NotFoundError"],
                "Session.BusyError": operationErrors["Session.BusyError"],
                "Session.SkillNotFoundError": (error) =>
                  Effect.fail(new InvalidRequestError({ message: `Skill not found: ${error.skill}`, field: "skill" })),
              }),
            )
          return HttpApiSchema.NoContent.make()
        }),
      )
      .handle(
        "session.synthetic",
        Effect.fn(function* (ctx) {
          const id = yield* session
            .synthetic({
              sessionID: ctx.params.sessionID,
              id: ctx.payload.id,
              text: ctx.payload.text,
              resume: ctx.payload.resume,
            })
            .pipe(Effect.catchTags(missingOrBusy))
          return { data: { id } }
        }),
      )
      .handle(
        "session.generate",
        Effect.fn(function* (ctx) {
          const text = yield* session
            .generate({ sessionID: ctx.params.sessionID, prompt: ctx.payload.prompt })
            .pipe(
              Effect.catchTags({
                "Session.NotFoundError": operationErrors["Session.NotFoundError"],
                "Session.RunFailedError": operationErrors["Session.RunFailedError"],
              }),
            )
          return { data: { text } }
        }),
      )
      .handle(
        "session.todo",
        Effect.fn(function* (ctx) {
          yield* session.get(ctx.params.sessionID).pipe(typedNotFound)
          const todos = yield* SessionTodo.Service
          return { data: yield* todos.get(ctx.params.sessionID) }
        }),
      )
      .handle(
        "session.wait",
        Effect.fn(function* (ctx) {
          yield* session.wait(ctx.params.sessionID).pipe(typedNotFound)
          return HttpApiSchema.NoContent.make()
        }),
      )
      .handle(
        "session.message.diff",
        Effect.fn(function* (ctx) {
          return {
            data: yield* session.diff(ctx.params).pipe(
              Effect.catchTag(
                "Session.NotFoundError",
                (error) =>
                  new SessionNotFoundError({
                    sessionID: error.sessionID,
                    message: `Session not found: ${error.sessionID}`,
                  }),
              ),
              Effect.catchTag(
                "Session.MessageNotFoundError",
                (error) =>
                  new MessageNotFoundError({
                    sessionID: error.sessionID,
                    messageID: error.messageID,
                    message: `Message not found: ${error.messageID}`,
                  }),
              ),
              Effect.catchTag("Snapshot.Error", (error) => {
                const ref = `err_${crypto.randomUUID().slice(0, 8)}`
                return Effect.logError("failed to diff session turn", { cause: error }).pipe(
                  Effect.andThen(
                    Effect.fail(
                      new UnknownError({
                        message: "Unexpected server error. Check server logs for details.",
                        ref,
                      }),
                    ),
                  ),
                )
              }),
            ),
          }
        }),
      )
      .handle(
        "session.revert.stage",
        Effect.fn(function* (ctx) {
          return {
            data: yield* session.revert.stage({ ...ctx.params, ...ctx.payload }).pipe(
              Effect.catchTag(
                "Session.NotFoundError",
                (error) =>
                  new SessionNotFoundError({
                    sessionID: error.sessionID,
                    message: `Session not found: ${error.sessionID}`,
                  }),
              ),
              Effect.catchTag(
                "Session.MessageNotFoundError",
                (error) =>
                  new MessageNotFoundError({
                    sessionID: error.sessionID,
                    messageID: error.messageID,
                    message: `Message not found: ${error.messageID}`,
                  }),
              ),
              Effect.catchTag("Snapshot.Error", (error) => {
                const ref = `err_${crypto.randomUUID().slice(0, 8)}`
                return Effect.logError("failed to stage session revert", { cause: error }).pipe(
                  Effect.andThen(
                    Effect.fail(
                      new UnknownError({
                        message: "Unexpected server error. Check server logs for details.",
                        ref,
                      }),
                    ),
                  ),
                )
              }),
            ),
          }
        }),
      )
      .handle(
        "session.revert.clear",
        Effect.fn(function* (ctx) {
          yield* session.revert.clear(ctx.params.sessionID).pipe(
            Effect.catchTag(
              "Session.NotFoundError",
              (error) =>
                new SessionNotFoundError({
                  sessionID: error.sessionID,
                  message: `Session not found: ${error.sessionID}`,
                }),
            ),
            Effect.catchTag("Snapshot.Error", (error) => {
              const ref = `err_${crypto.randomUUID().slice(0, 8)}`
              return Effect.logError("failed to clear session revert", { cause: error }).pipe(
                Effect.andThen(
                  Effect.fail(
                    new UnknownError({
                      message: "Unexpected server error. Check server logs for details.",
                      ref,
                    }),
                  ),
                ),
              )
            }),
          )
          return HttpApiSchema.NoContent.make()
        }),
      )
      .handle(
        "session.revert.commit",
        Effect.fn(function* (ctx) {
          yield* session.revert.commit(ctx.params.sessionID).pipe(
            Effect.catchTag(
              "Session.NotFoundError",
              (error) =>
                new SessionNotFoundError({
                  sessionID: error.sessionID,
                  message: `Session not found: ${error.sessionID}`,
                }),
            ),
          )
          return HttpApiSchema.NoContent.make()
        }),
      )
      .handle(
        "session.context",
        Effect.fn(function* (ctx) {
          return {
            data: yield* session.context(ctx.params.sessionID).pipe(
              Effect.catchTag("Session.NotFoundError", (error) =>
                Effect.fail(
                  new SessionNotFoundError({
                    sessionID: error.sessionID,
                    message: `Session not found: ${error.sessionID}`,
                  }),
                ),
              ),
              Effect.catchTag("Session.MessageDecodeError", (error) => {
                const ref = `err_${crypto.randomUUID().slice(0, 8)}`
                return Effect.logError("failed to decode session message").pipe(
                  Effect.annotateLogs({ ref, sessionID: error.sessionID, messageID: error.messageID }),
                  Effect.andThen(
                    Effect.fail(
                      new UnknownError({ message: "Unexpected server error. Check server logs for details.", ref }),
                    ),
                  ),
                )
              }),
            ),
          }
        }),
      )
      .handle(
        "session.history",
        Effect.fn(function* (ctx) {
          return yield* session
            .history({
              sessionID: ctx.params.sessionID,
              after: ctx.query.after,
              limit: ctx.query.limit ?? DefaultSessionHistoryLimit,
            })
            .pipe(
              Effect.map((page) => ({
                data: page.events,
                hasMore: page.hasMore,
              })),
              Effect.catchTag(
                "Session.NotFoundError",
                (error) =>
                  new SessionNotFoundError({
                    sessionID: error.sessionID,
                    message: `Session not found: ${error.sessionID}`,
                  }),
              ),
            )
        }),
      )
      .handle(
        "session.events",
        Effect.fn((ctx) =>
          Effect.succeed(
            session.events({ sessionID: ctx.params.sessionID, after: ctx.query.after }).pipe(Stream.orDie),
          ),
        ),
      )
      .handle(
        "session.interrupt",
        Effect.fn(function* (ctx) {
          yield* session.interrupt(ctx.params.sessionID)
          return HttpApiSchema.NoContent.make()
        }),
      )
      .handle(
        "session.processes",
        Effect.fn(function* (ctx) {
          yield* session.get(ctx.params.sessionID).pipe(typedNotFound)
          const items = yield* sessionProcess.list(ctx.params.sessionID, ctx.query.tail)
          return {
            data: items.map((item) => ({
              id: item.id,
              pid: item.pid,
              title: item.title,
              started: item.started,
              processes: item.processes.map((node) => ({
                pid: node.pid,
                ...(node.parentPid === null ? {} : { parentPid: node.parentPid }),
                ...(node.name === null ? {} : { name: node.name }),
              })),
              output: item.output,
              written: item.written,
            })),
          }
        }),
      )
      .handle(
        "session.processStop",
        Effect.fn(function* (ctx) {
          yield* session.get(ctx.params.sessionID).pipe(typedNotFound)
          const stopped = yield* sessionProcess.cancel(ctx.params.sessionID, ctx.params.processID)
          if (!stopped) return yield* Effect.fail(new SessionNotFoundError({ sessionID: ctx.params.sessionID, message: `Process not found: ${ctx.params.processID}` }))
          return { data: true }
        }),
      )
      .handle(
        "session.message",
        Effect.fn(function* (ctx) {
          const message = yield* session.message(ctx.params)
          if (message) return { data: message }
          return yield* new MessageNotFoundError({
            sessionID: ctx.params.sessionID,
            messageID: ctx.params.messageID,
            message: `Message not found: ${ctx.params.messageID}`,
          })
        }),
      )
  }),
)
