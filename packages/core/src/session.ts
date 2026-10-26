export * as SessionV2 from "./session"
export * from "./session/schema"

import { Cause, DateTime, Effect, Layer, Option, Schema, Context, Stream } from "effect"
import { ListAnchor } from "@orchestra/schema/session"
import { and, asc, desc, eq, gt, lt } from "drizzle-orm"
import { ProjectV2 } from "./project"
import { WorkspaceV2 } from "./workspace"
import { ModelV2 } from "./model"
import { Location } from "./location"
import { SessionMessage } from "./session/message"
import { Prompt } from "./session/prompt"
import { PromptInput } from "@orchestra/schema/prompt-input"
import { EventV2 } from "./event"
import { Database } from "./database/database"
import { SessionProjector } from "./session/projector"
import { SessionMessageTable, SessionTable } from "./session/sql"
import { SessionSchema } from "./session/schema"
import { AbsolutePath, PositiveInt, RelativePath } from "./schema"
import { AgentV2 } from "./agent"
import path from "path"
import { existsSync } from "fs"
import { SessionRunner } from "./session/runner/index"
import { SessionStore } from "./session/store"
import { SessionExecution } from "./session/execution"
import { makeGlobalNode } from "./effect/app-node"
import { LocationServiceMap } from "./location-service-map"
import { MessageDecodeError } from "./session/error"
import { SessionEvent } from "./session/event"
import { SessionInput } from "./session/input"
import { Snapshot } from "./snapshot"
import { File } from "./file"
import { SessionRevert } from "./session/revert"
import { Revert } from "@orchestra/schema/revert"
import { FSUtil } from "./fs-util"
import { Global } from "./global"
import type { ToolSafety } from "./tool-safety"
import { SessionDurable } from "@orchestra/schema/durable-event-manifest"
import { SessionArchive } from "./session/archive"
import { SessionLifecycle } from "./session/lifecycle"
import { SessionSubagentModels } from "./session/subagent-models"
import type { Permission } from "@orchestra/schema/permission"

export const RevertState = Revert.State
export type RevertState = Revert.State

// get project -> project.locations
//
// get all sessions
//

// - by project
//   - by subpath
// - by workspace (home is special)

export { ListAnchor }
// Public through the session entry so product modules need no deep import (R7).
export { SessionStore }
export { SessionInput }
export { SessionLegacyImport } from "./session/legacy-import"
export { SessionActivity } from "./session/activity"
export { LeanProfilePreferences } from "./session/lean-profile-preferences"
export { LeanProject } from "./session/lean-project"
export { SessionMeeting } from "./session/meeting"
export { SessionTodo } from "./session/todo"
export { SessionCompaction } from "./session/compaction"
export { SessionHistory } from "./session/history"
export { SessionEvent, SessionMessage, SessionSubagentModels }

const ListInputBase = {
  workspaceID: WorkspaceV2.ID.pipe(Schema.optional),
  search: Schema.String.pipe(Schema.optional),
  limit: PositiveInt.pipe(Schema.optional),
  order: Schema.Literals(["asc", "desc"]).pipe(Schema.optional),
  anchor: ListAnchor.pipe(Schema.optional),
  includeArchived: Schema.Boolean.pipe(Schema.optional),
}

const ListDirectoryInput = Schema.Struct({
  ...ListInputBase,
  directory: AbsolutePath,
})

const ListProjectInput = Schema.Struct({
  ...ListInputBase,
  project: ProjectV2.ID,
  subpath: RelativePath.pipe(Schema.optional),
})

const ListAllInput = Schema.Struct(ListInputBase)

export const ListInput = Schema.Union([ListDirectoryInput, ListProjectInput, ListAllInput])
export type ListInput = typeof ListInput.Type

type CreateInput = {
  id?: SessionSchema.ID
  parentID?: SessionSchema.ID
  agent?: AgentV2.ID
  model?: ModelV2.Ref
  location: Location.Ref
}

export class NotFoundError extends Schema.TaggedErrorClass<NotFoundError>()("Session.NotFoundError", {
  sessionID: SessionSchema.ID,
}) {}

/** The Session is running; the operation would interleave with its drain. */
export class BusyError extends Schema.TaggedErrorClass<BusyError>()("Session.BusyError", {
  sessionID: SessionSchema.ID,
}) {}

export class SkillNotFoundError extends Schema.TaggedErrorClass<SkillNotFoundError>()("Session.SkillNotFoundError", {
  sessionID: SessionSchema.ID,
  skill: Schema.String,
}) {}

/** Compaction or generation could not run: no model, an unsupported API, a provider failure. */
export class RunFailedError extends Schema.TaggedErrorClass<RunFailedError>()("Session.RunFailedError", {
  sessionID: SessionSchema.ID,
  message: Schema.String,
}) {}

/** A Session moves only within its own project. */
export class MoveError extends Schema.TaggedErrorClass<MoveError>()("Session.MoveError", {
  sessionID: SessionSchema.ID,
  directory: Schema.String,
}) {}

export { ContextSnapshotDecodeError, MessageDecodeError } from "./session/error"

export class PromptConflictError extends Schema.TaggedErrorClass<PromptConflictError>()("Session.PromptConflictError", {
  sessionID: SessionSchema.ID,
  messageID: SessionMessage.ID,
}) {}
/** An installed `prompt` hook refused the prompt before admission; `detail` is what the person reads. */
export class PromptBlockedError extends Schema.TaggedErrorClass<PromptBlockedError>()("Session.PromptBlockedError", {
  sessionID: SessionSchema.ID,
  reason: Schema.String,
  detail: Schema.String,
}) {}
export const MessageNotFoundError = SessionRevert.MessageNotFoundError
export type MessageNotFoundError = SessionRevert.MessageNotFoundError

export type Error =
  | NotFoundError
  | MessageDecodeError
  | BusyError
  | SkillNotFoundError
  | MoveError
  | RunFailedError
  | PromptConflictError
  | PromptBlockedError

export interface Interface {
  readonly list: (input?: ListInput) => Effect.Effect<SessionSchema.Info[]>
  readonly create: (input: CreateInput) => Effect.Effect<SessionSchema.Info, NotFoundError>
  readonly get: (sessionID: SessionSchema.ID) => Effect.Effect<SessionSchema.Info, NotFoundError>
  readonly archive: (input: { sessionID: SessionSchema.ID; archived: boolean }) => Effect.Effect<void, NotFoundError>
  readonly rename: (input: { sessionID: SessionSchema.ID; title: string }) => Effect.Effect<void, NotFoundError>
  /** Interrupts the Session, then deletes it with its children and history. */
  readonly remove: (sessionID: SessionSchema.ID) => Effect.Effect<void, NotFoundError>
  readonly messages: (input: {
    sessionID: SessionSchema.ID
    limit?: number
    order?: "asc" | "desc"
    cursor?: {
      id: SessionMessage.ID
      direction: "previous" | "next"
    }
  }) => Effect.Effect<SessionMessage.Message[], NotFoundError | MessageDecodeError>
  readonly message: (input: {
    sessionID: SessionSchema.ID
    messageID: SessionMessage.ID
  }) => Effect.Effect<SessionMessage.Message | undefined>
  readonly context: (
    sessionID: SessionSchema.ID,
  ) => Effect.Effect<SessionMessage.Message[], NotFoundError | MessageDecodeError>
  readonly events: (input: {
    sessionID: SessionSchema.ID
    after?: number
  }) => Stream.Stream<SessionEvent.DurableEvent, NotFoundError>
  readonly history: (input: {
    sessionID: SessionSchema.ID
    after?: number
    limit: number
  }) => Effect.Effect<{ events: ReadonlyArray<SessionEvent.DurableEvent>; hasMore: boolean }, NotFoundError>
  readonly switchAgent: (input: { sessionID: SessionSchema.ID; agent: string }) => Effect.Effect<void, NotFoundError>
  readonly switchModel: (input: {
    sessionID: SessionSchema.ID
    model: ModelV2.Ref
  }) => Effect.Effect<void, NotFoundError>
  readonly getPermission: (sessionID: SessionSchema.ID) => Effect.Effect<Permission.SessionRuleset, NotFoundError>
  readonly setPermission: (input: { sessionID: SessionSchema.ID; permission: Permission.SessionRuleset }) => Effect.Effect<Permission.SessionRuleset, NotFoundError>
  readonly prompt: (input: {
    id?: SessionMessage.ID
    sessionID: SessionSchema.ID
    prompt: PromptInput.Prompt
    delivery?: SessionInput.Delivery
    resume?: boolean
  }) => Effect.Effect<SessionInput.Admitted, NotFoundError | PromptConflictError | PromptBlockedError>
  /** Copies the history before `messageID` (and before a staged revert) into a new Session. */
  readonly fork: (input: {
    sessionID: SessionSchema.ID
    messageID?: SessionMessage.ID
  }) => Effect.Effect<SessionSchema.Info, NotFoundError | MessageNotFoundError>
  /** Moves the Session to another directory or workspace of its project. */
  readonly move: (input: {
    sessionID: SessionSchema.ID
    location: Location.Ref
  }) => Effect.Effect<void, NotFoundError | BusyError | MoveError>
  /** Runs a person's shell command in the Session's Location and records it with its output; no turn follows. */
  readonly shell: (input: {
    id?: string
    sessionID: SessionSchema.ID
    command: string
  }) => Effect.Effect<void, NotFoundError | BusyError>
  /** Records a skill's instructions as context, then runs a turn unless `resume` is false. */
  readonly skill: (input: {
    sessionID: SessionSchema.ID
    skill: string
    resume?: boolean
  }) => Effect.Effect<void, NotFoundError | BusyError | SkillNotFoundError>
  /** Records text as synthetic context, then runs a turn unless `resume` is false. */
  readonly synthetic: (input: {
    id?: SessionMessage.ID
    sessionID: SessionSchema.ID
    text: string
    resume?: boolean
  }) => Effect.Effect<SessionMessage.ID, NotFoundError | BusyError>
  /** One tool-less completion of `prompt` after the Session's history; nothing is recorded. */
  readonly generate: (input: {
    sessionID: SessionSchema.ID
    prompt: string
  }) => Effect.Effect<string, NotFoundError | RunFailedError>
  /** Summarizes the history now; false when there was nothing to summarize. */
  readonly compact: (input: {
    sessionID: SessionSchema.ID
  }) => Effect.Effect<boolean, NotFoundError | BusyError | RunFailedError>
  /** Waits until the Session has no active execution. */
  readonly wait: (id: SessionSchema.ID) => Effect.Effect<void, NotFoundError>
  readonly active: Effect.Effect<ReadonlySet<SessionSchema.ID>>
  readonly resume: (sessionID: SessionSchema.ID) => Effect.Effect<void, NotFoundError | SessionRunner.RunError>
  readonly interrupt: (sessionID: SessionSchema.ID) => Effect.Effect<void>
  /** File changes made by the assistant turns that answer the user message `messageID`. */
  readonly diff: (input: {
    sessionID: SessionSchema.ID
    messageID: SessionMessage.ID
    /** Unchanged lines kept around each hunk. */
    context?: number
  }) => Effect.Effect<readonly File.Diff[], NotFoundError | MessageNotFoundError | Snapshot.Error>
  readonly revert: {
    readonly stage: (input: {
      sessionID: SessionSchema.ID
      messageID: SessionMessage.ID
      files?: boolean
    }) => Effect.Effect<Revert.State, NotFoundError | MessageNotFoundError | Snapshot.Error>
    readonly clear: (sessionID: SessionSchema.ID) => Effect.Effect<void, NotFoundError | Snapshot.Error>
    readonly commit: (sessionID: SessionSchema.ID) => Effect.Effect<void, NotFoundError>
  }
}

export class Service extends Context.Service<Service, Interface>()("@orchestra/v2/Session") {}

const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const database = yield* Database.Service
    const db = database.db
    const events = yield* EventV2.Service
    const projects = yield* ProjectV2.Service
    const execution = yield* SessionExecution.Service
    const store = yield* SessionStore.Service
    const locations = yield* LocationServiceMap.Service
    const global = yield* Global.Service
    const decodeMessage = Schema.decodeUnknownEffect(SessionMessage.Message)
    const encodeMessage = Schema.encodeSync(SessionMessage.Message)
    const isDurableSessionEvent = Schema.is(SessionEvent.Durable)
    const decode = (row: typeof SessionMessageTable.$inferSelect) =>
      decodeMessage({ ...row.data, id: row.id, type: row.type }).pipe(
        Effect.mapError(
          () =>
            new MessageDecodeError({
              sessionID: SessionSchema.ID.make(row.session_id),
              messageID: SessionMessage.ID.make(row.id),
            }),
        ),
      )

    // Installed hooks on a Session event, through its Location's tool registry: the profile loader and ToolSafety its
    // tool calls use. Only a project with a hooks.json opens its Location for them.
    const hook = Effect.fnUntraced(function* (
      session: SessionSchema.Info,
      event: Pick<ToolSafety.SessionEvent, "operation" | "text" | "messageID">,
    ) {
      const { RelayHookInstall } = yield* Effect.promise(() => import("./relay-hook-install"))
      if (!existsSync(RelayHookInstall.file(global.data, session.projectID))) return []
      const { ToolRegistry } = yield* Effect.promise(() => import("./tool/registry"))
      return yield* ToolRegistry.Service.use((registry) =>
        registry.session({ ...event, sessionID: session.id, ...(session.agent ? { agent: session.agent } : {}) }),
      ).pipe(Effect.provide(locations.get(session.location)))
    })

    // Before admission and interruptible, since an Ask waits for a person: a refused prompt is never admitted. A message
    // ID that already names a durable prompt is left to admission, which reconciles an exact retry or refuses a
    // conflict, without asking again. It reads the Session first, as admission did.
    const promptHooks = Effect.fnUntraced(function* (input: {
      readonly id: SessionMessage.ID
      readonly sessionID: SessionSchema.ID
      readonly prompt: PromptInput.Prompt
    }) {
      const session = yield* result.get(input.sessionID)
      if ((yield* SessionInput.find(db, input.id)) || (yield* store.message(input.id))) return []
      return yield* hook(session, { operation: "prompt", text: input.prompt.text, messageID: input.id }).pipe(
        Effect.catch((error) => {
          const err = error as { _tag?: string; reason?: string; message?: string }
          return Effect.fail(
            new PromptBlockedError({
              sessionID: session.id,
              reason: err._tag === "ToolSafety.Denied" ? (err.reason ?? "relay-hook-location-acquisition") : "relay-hook-location-acquisition",
              detail: err._tag === "ToolSafety.Denied" ? (err.message ?? "Prompt hooks could not be evaluated.") : "Prompt hooks could not be evaluated.",
            }),
          )
        }),
      )
    })

    // Session execution places the Session and hands over its Location's runner.
    const runner = <A, E>(session: SessionSchema.Info, use: (runner: SessionRunner.Interface) => Effect.Effect<A, E>) =>
      execution.withRunner(session.id, use)

    // Session operations hold the Session as a drain would, so none interleaves with a running turn.
    const exclusive = <A, E>(session: SessionSchema.Info, effect: Effect.Effect<A, E>) =>
      execution
        .exclusive(session.id, effect)
        .pipe(
          Effect.flatMap(
            Option.match({
              onNone: () => Effect.fail(new BusyError({ sessionID: session.id })),
              onSome: Effect.succeed,
            }),
          ),
        )

    // A turn after recorded context runs in the background; the request that recorded it does not wait for the turn.
    const resumeDetached = (sessionID: SessionSchema.ID) =>
      execution.resume(sessionID).pipe(
        Effect.catchCause((cause) =>
          Cause.hasInterruptsOnly(cause)
            ? Effect.void
            : Effect.logError("Failed to resume Session", cause).pipe(Effect.annotateLogs({ sessionID })),
        ),
        Effect.forkDetach,
        Effect.asVoid,
      )

    const result = Service.of({
      create: Effect.fn("V2Session.create")(function* (input) {
        const sessionID = input.id ?? SessionSchema.ID.create()
        const recorded = yield* store.get(sessionID)
        if (recorded) return recorded
        if (input.parentID) yield* result.get(input.parentID)
        const project = yield* projects.resolve(input.location.directory)
        yield* ProjectV2.record(db, events, project)
        const timestamp = yield* DateTime.now
        const projected = yield* events
          .publish(
            SessionEvent.Created,
            {
              sessionID,
              timestamp,
              projectID: project.id,
              location: input.location,
              subdirectory: RelativePath.make(
                path.relative(project.directory, input.location.directory).replaceAll("\\", "/"),
              ),
              title: `New session - ${DateTime.formatIso(timestamp)}`,
              // Optional event keys must be absent, not undefined, to encode.
              ...(input.parentID ? { parentID: input.parentID } : {}),
              ...(input.agent ? { agent: input.agent } : {}),
              ...(input.model
                ? {
                    model: {
                      id: ModelV2.ID.make(input.model.id),
                      providerID: input.model.providerID,
                      ...(input.model.variant ? { variant: input.model.variant } : {}),
                    },
                  }
                : {}),
            },
            { location: input.location },
          )
          .pipe(
            Effect.as({ type: "created" } as const),
            Effect.catchDefect((defect) => {
              if (!(defect instanceof SessionProjector.SessionAlreadyProjected)) {
                return Effect.die(defect)
              }
              // Concurrent creation lost the projection race. The existing Session identity wins.
              return store
                .get(sessionID)
                .pipe(
                  Effect.flatMap((session) =>
                    session ? Effect.succeed({ type: "existing", session } as const) : Effect.die(defect),
                  ),
                )
            }),
          )
        if (projected.type === "existing") return projected.session
        // TODO: Restore recorded sessions onto replacement synchronized workspaces in a future API slice.
        const created = yield* result.get(sessionID).pipe(Effect.orDie)
        // `session-start` hooks run once a new Session is stored; their outcome never undoes it.
        yield* hook(created, { operation: "session-start" }).pipe(Effect.exit)
        return created
      }),
      get: Effect.fn("V2Session.get")(function* (sessionID) {
        const session = yield* store.get(sessionID)
        if (!session) return yield* new NotFoundError({ sessionID })
        return session
      }),
      archive: Effect.fn("V2Session.archive")(function* (input) {
        if (!(yield* SessionArchive.set(db, events, input)))
          return yield* new NotFoundError({ sessionID: input.sessionID })
      }),
      rename: Effect.fn("V2Session.rename")(function* (input) {
        if (!(yield* SessionLifecycle.rename(db, events, input)))
          return yield* new NotFoundError({ sessionID: input.sessionID })
      }),
      remove: Effect.fn("V2Session.remove")(function* (sessionID) {
        yield* result.get(sessionID)
        yield* Effect.uninterruptible(execution.interrupt(sessionID))
        if (!(yield* SessionLifecycle.remove(db, events, sessionID))) return yield* new NotFoundError({ sessionID })
      }),
      list: (input) => SessionArchive.list(db, input),
      messages: Effect.fn("V2Session.messages")(function* (input) {
        yield* result.get(input.sessionID)
        const direction = input.cursor?.direction ?? "next"
        const requestedOrder = input.order ?? "desc"
        const order = direction === "previous" ? (requestedOrder === "asc" ? "desc" : "asc") : requestedOrder
        const anchor = input.cursor
          ? yield* db
              .select({ seq: SessionMessageTable.seq })
              .from(SessionMessageTable)
              .where(
                and(eq(SessionMessageTable.session_id, input.sessionID), eq(SessionMessageTable.id, input.cursor.id)),
              )
              .get()
              .pipe(Effect.orDie)
          : undefined
        if (input.cursor && !anchor) return []
        const boundary = anchor
          ? order === "asc"
            ? gt(SessionMessageTable.seq, anchor.seq)
            : lt(SessionMessageTable.seq, anchor.seq)
          : undefined
        const where = boundary
          ? and(eq(SessionMessageTable.session_id, input.sessionID), boundary)
          : eq(SessionMessageTable.session_id, input.sessionID)
        const query = db
          .select()
          .from(SessionMessageTable)
          .where(where)
          .orderBy(order === "asc" ? asc(SessionMessageTable.seq) : desc(SessionMessageTable.seq))
        const rows = yield* (input.limit === undefined ? query.all() : query.limit(input.limit).all()).pipe(
          Effect.orDie,
        )
        return yield* Effect.forEach(direction === "previous" ? rows.toReversed() : rows, decode)
      }),
      message: Effect.fn("V2Session.message")(function* (input) {
        const stored = yield* store.message(input.messageID)
        return stored?.sessionID === input.sessionID ? stored.message : undefined
      }),
      context: Effect.fn("V2Session.context")(function* (sessionID) {
        yield* result.get(sessionID)
        return yield* store.context(sessionID)
      }),
      events: (input) =>
        Stream.unwrap(
          result
            .get(input.sessionID)
            .pipe(Effect.as(events.durable({ aggregateID: input.sessionID, after: input.after }))),
        ).pipe(Stream.filter((event): event is SessionEvent.DurableEvent => isDurableSessionEvent(event))),
      history: Effect.fn("V2Session.history")(function* (input) {
        yield* result.get(input.sessionID)
        return yield* EventV2.readAggregate(db, {
          ...input,
          aggregateID: input.sessionID,
          manifest: SessionDurable,
        })
      }),
      prompt: Effect.fn("V2Session.prompt")((input) =>
        Effect.uninterruptibleMask((restore) =>
          Effect.gen(function* () {
            const messageID = input.id ?? SessionMessage.ID.create()
            const notes = yield* restore(promptHooks({ ...input, id: messageID }))
            const prompt = resolvePrompt(input.prompt)
            const delivery = input.delivery ?? "steer"
            const expected = { sessionID: input.sessionID, messageID, prompt, delivery }
            const admitted = yield* SessionInput.admit(db, events, {
              id: messageID,
              sessionID: input.sessionID,
              prompt,
              ...(notes.length === 0 ? {} : { promptContext: { reminders: [...notes] } }),
              delivery,
            }).pipe(
              Effect.catchDefect((defect) =>
                defect instanceof SessionInput.LifecycleConflict
                  ? new PromptConflictError({ sessionID: input.sessionID, messageID })
                  : Effect.die(defect),
              ),
            )
            if (!SessionInput.equivalent(admitted, expected))
              return yield* new PromptConflictError({ sessionID: input.sessionID, messageID })
            if (input.resume !== false) yield* execution.wake(admitted.sessionID)
            return admitted
          }),
        ),
      ),
      fork: Effect.fn("V2Session.fork")(function* (input) {
        const source = yield* result.get(input.sessionID)
        const rows = yield* db
          .select()
          .from(SessionMessageTable)
          .where(eq(SessionMessageTable.session_id, source.id))
          .orderBy(asc(SessionMessageTable.seq))
          .all()
          .pipe(Effect.orDie)
        const target = input.messageID ? rows.findIndex((row) => row.id === input.messageID) : rows.length
        if (target < 0) return yield* new MessageNotFoundError({ sessionID: source.id, messageID: input.messageID! })
        const reverted = source.revert ? rows.findIndex((row) => row.id === source.revert?.messageID) : -1
        const kept = rows.slice(0, reverted < 0 ? target : Math.min(target, reverted))
        const forked = yield* result.create({ location: source.location, agent: source.agent, model: source.model })
        yield* SessionLifecycle.rename(db, events, { sessionID: forked.id, title: forkedTitle(source.title) })
        // As the legacy import does: copied rows take negative sequences below every event the fork will project.
        yield* db
          .transaction(
            () =>
              Effect.forEach(
                kept,
                (row, index) =>
                  decode(row).pipe(
                    Effect.orDie,
                    Effect.flatMap((message) => {
                      const { id, type, ...data } = encodeMessage({
                        ...message,
                        id: SessionMessage.ID.create(),
                        ...(message.type === "synthetic" ? { sessionID: forked.id } : {}),
                      })
                      return db
                        .insert(SessionMessageTable)
                        .values({
                          id: SessionMessage.ID.make(id),
                          session_id: forked.id,
                          type,
                          seq: index - kept.length,
                          time_created: row.time_created,
                          data,
                        })
                        .run()
                    }),
                  ),
                { discard: true },
              ),
            { behavior: "immediate" },
          )
          .pipe(Effect.orDie)
        return yield* result.get(forked.id)
      }),
      move: Effect.fn("V2Session.move")(function* (input) {
        const session = yield* result.get(input.sessionID)
        const project = yield* projects.resolve(input.location.directory)
        if (project.id !== session.projectID)
          return yield* new MoveError({ sessionID: session.id, directory: input.location.directory })
        const subdirectory = path.relative(project.directory, input.location.directory).replaceAll("\\", "/")
        yield* exclusive(
          session,
          Effect.gen(function* () {
            yield* events.publish(
              SessionEvent.Moved,
              {
                sessionID: session.id,
                timestamp: yield* DateTime.now,
                location: input.location,
                ...(subdirectory ? { subdirectory: RelativePath.make(subdirectory) } : {}),
              },
              { location: input.location },
            )
          }),
        )
      }),
      shell: Effect.fn("V2Session.shell")(function* (input) {
        const session = yield* result.get(input.sessionID)
        // An interrupt aborts the command, which the runner records as its end; the request itself still succeeds.
        yield* exclusive(
          session,
          runner(session, (runner) => runner.shell({ sessionID: session.id, command: input.command, callID: input.id })),
        ).pipe(Effect.catchCause((cause) => (Cause.hasInterruptsOnly(cause) ? Effect.void : Effect.failCause(cause))))
      }),
      skill: Effect.fn("V2Session.skill")(function* (input) {
        const session = yield* result.get(input.sessionID)
        const found = yield* exclusive(
          session,
          runner(session, (runner) => runner.skill({ sessionID: session.id, skill: input.skill })),
        )
        if (!found) return yield* new SkillNotFoundError({ sessionID: session.id, skill: input.skill })
        if (input.resume !== false) yield* resumeDetached(session.id)
      }),
      synthetic: Effect.fn("V2Session.synthetic")(function* (input) {
        const session = yield* result.get(input.sessionID)
        const messageID = input.id ?? SessionMessage.ID.create()
        yield* exclusive(
          session,
          Effect.gen(function* () {
            yield* events.publish(SessionEvent.Synthetic, {
              sessionID: session.id,
              messageID,
              timestamp: yield* DateTime.now,
              text: input.text,
            })
          }),
        )
        if (input.resume !== false) yield* resumeDetached(session.id)
        return messageID
      }),
      generate: Effect.fn("V2Session.generate")(function* (input) {
        const session = yield* result.get(input.sessionID)
        return yield* runner(session, (runner) => runner.generate({ sessionID: session.id, prompt: input.prompt })).pipe(
          Effect.mapError((error) => new RunFailedError({ sessionID: session.id, message: messageOf(error) })),
        )
      }),
      switchAgent: Effect.fn("V2Session.switchAgent")(function* (input) {
        // As a model switch: choosing the agent the Session already has records nothing.
        if ((yield* result.get(input.sessionID)).agent === input.agent) return
        yield* events.publish(SessionEvent.AgentSwitched, {
          sessionID: input.sessionID,
          messageID: SessionMessage.ID.create(),
          timestamp: yield* DateTime.now,
          agent: input.agent,
        })
      }),
      switchModel: Effect.fn("V2Session.switchModel")(function* (input) {
        const session = yield* result.get(input.sessionID)
        if (
          session.model?.providerID === input.model.providerID &&
          session.model.id === input.model.id &&
          (session.model.variant ?? "default") === (input.model.variant ?? "default")
        )
          return
        yield* events.publish(SessionEvent.ModelSwitched, {
          sessionID: input.sessionID,
          messageID: SessionMessage.ID.create(),
          timestamp: yield* DateTime.now,
          model: input.model,
        })
      }),
      getPermission: Effect.fn("V2Session.getPermission")(function* (sessionID) {
        yield* result.get(sessionID)
        const row = yield* db.select({ permission: SessionTable.permission }).from(SessionTable).where(eq(SessionTable.id, sessionID)).get().pipe(Effect.orDie)
        return row?.permission ?? []
      }),
      setPermission: Effect.fn("V2Session.setPermission")(function* (input) {
        yield* result.get(input.sessionID)
        const permission = [...input.permission]
        yield* events.publish(SessionEvent.PermissionChanged, { sessionID: input.sessionID, timestamp: yield* DateTime.now, permission })
        return permission
      }),
      compact: Effect.fn("V2Session.compact")(function* (input) {
        const session = yield* result.get(input.sessionID)
        return yield* exclusive(
          session,
          runner(session, (runner) => runner.compact(session.id)).pipe(
            Effect.mapError((error) => new RunFailedError({ sessionID: session.id, message: messageOf(error) })),
          ),
        )
      }),
      wait: Effect.fn("V2Session.wait")(function* (sessionID) {
        yield* result.get(sessionID)
        yield* execution.exclusive(sessionID, Effect.void, { wait: true })
      }),
      active: execution.active,
      resume: Effect.fn("V2Session.resume")(function* (sessionID) {
        yield* result.get(sessionID)
        yield* execution.resume(sessionID)
      }),
      interrupt: Effect.fn("V2Session.interrupt")((sessionID) =>
        Effect.uninterruptible(execution.interrupt(sessionID)),
      ),
      diff: Effect.fn("V2Session.diff")(function* (input) {
        const session = yield* result.get(input.sessionID)
        return yield* SessionRevert.diff(input).pipe(
          Effect.provideService(Database.Service, database),
          Effect.provide(locations.get(session.location)),
          Effect.mapError((error) => error as NotFoundError | MessageNotFoundError | Snapshot.Error),
        )
      }),
      revert: {
        stage: Effect.fn("V2Session.revert.stage")(function* (input) {
          const session = yield* result.get(input.sessionID)
          return yield* SessionRevert.stage({ session, messageID: input.messageID, files: input.files }).pipe(
            Effect.provideService(Database.Service, database),
            Effect.provideService(EventV2.Service, events),
            Effect.provide(locations.get(session.location)),
            Effect.mapError((error) => error as NotFoundError | MessageNotFoundError | Snapshot.Error),
          )
        }),
        clear: Effect.fn("V2Session.revert.clear")(function* (sessionID) {
          const session = yield* result.get(sessionID)
          yield* SessionRevert.clear(session).pipe(
            Effect.provideService(EventV2.Service, events),
            Effect.provide(locations.get(session.location)),
            Effect.mapError((error) => error as NotFoundError | Snapshot.Error),
          )
        }),
        commit: Effect.fn("V2Session.revert.commit")(function* (sessionID) {
          const session = yield* result.get(sessionID)
          yield* SessionRevert.commit(session).pipe(Effect.provideService(EventV2.Service, events))
        }),
      },
    })

    return result
  }),
)

function messageOf(error: unknown) {
  return error instanceof Error && error.message ? error.message : String(error)
}

function forkedTitle(title: string) {
  const match = title.match(/^(.+) \(fork #(\d+)\)$/)
  if (!match) return `${title} (fork #1)`
  return `${match[1]} (fork #${Number(match[2]) + 1})`
}

const resolvePrompt = (input: PromptInput.Prompt) =>
  Prompt.make({
    text: input.text,
    agents: input.agents,
    files: input.files?.map((file) => {
      const dataMime = file.uri.match(/^data:([^;,]+)[;,]/i)?.[1]
      const target = URL.canParse(file.uri) ? new URL(file.uri).pathname : (file.name ?? file.uri)
      return {
        ...file,
        mime: dataMime ?? (target.endsWith("/") ? "application/x-directory" : FSUtil.mimeType(target)),
      }
    }),
  })

export const node = makeGlobalNode({
  service: Service,
  layer: layer.pipe(Layer.orDie),
  deps: [
    Database.node,
    EventV2.node,
    ProjectV2.node,
    SessionExecution.node,
    SessionStore.node,
    LocationServiceMap.node,
    SessionProjector.node,
    SessionArchive.node,
    SessionSubagentModels.node,
    Global.node,
  ],
})
