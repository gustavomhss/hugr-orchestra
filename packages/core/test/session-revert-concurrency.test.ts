import { expect } from "bun:test"
import { ToolCall } from "@orchestra/llm"
import { Cause, Context, DateTime, Deferred, Effect, Exit, Fiber, Layer, Queue, Schema } from "effect"
import { AgentV2 } from "@orchestra/core/agent"
import { Database } from "@orchestra/core/database/database"
import { AppNodeBuilder } from "@orchestra/core/effect/app-node-builder"
import { LayerNode } from "@orchestra/core/effect/layer-node"
import { EventV2 } from "@orchestra/core/event"
import { Location } from "@orchestra/core/location"
import { LocationServiceMap } from "@orchestra/core/location-service-map"
import { ProjectV2 } from "@orchestra/core/project"
import { AbsolutePath } from "@orchestra/core/schema"
import { SessionV2 } from "@orchestra/core/session"
import { SessionEvent } from "@orchestra/core/session/event"
import { Prompt } from "@orchestra/core/session/prompt"
import { SessionExecution } from "@orchestra/core/session/execution"
import { SessionMessage } from "@orchestra/core/session/message"
import { SessionRunCoordinator } from "@orchestra/core/session/run-coordinator"
import { SessionStore } from "@orchestra/core/session/store"
import { Tool } from "@orchestra/core/tool/tool"
import { tmpdir } from "./fixture/tmpdir"
import { testEffect } from "./lib/effect"

const it = testEffect(Layer.empty)
const projects = Layer.succeed(
  ProjectV2.Service,
  ProjectV2.Service.of({
    resolve: (directory) => Effect.succeed({ id: ProjectV2.ID.global, directory }),
    list: () => Effect.succeed([]),
    directories: () => Effect.succeed([]),
    commit: () => Effect.void,
  }),
)

it.live("all revert operations report Busy before looking up a Session already owned by a blocked tool", () =>
  Effect.gen(function* () {
    const f = yield* fixture()
    yield* Effect.gen(function* () {
      const sessions = yield* SessionV2.Service
      const absent = SessionV2.ID.make("ses_owned_but_missing")
      const running = yield* f.coordinator.run(absent).pipe(Effect.forkChild)
      yield* Queue.take(f.started)
      const errors = yield* Effect.forEach(["stage", "clear", "commit"] as const, (kind) =>
        operation(sessions, kind, absent).pipe(
          Effect.match({ onSuccess: () => undefined, onFailure: (error) => error }),
        ),
      )
      yield* Deferred.succeed(f.release, undefined)
      yield* Fiber.join(running)
      errors.forEach((error) => expect(error).toMatchObject({ _tag: "Session.BusyError", sessionID: absent }))
    }).pipe(Effect.provide(f.layer), Effect.ensuring(Deferred.succeed(f.release, undefined)))
  }),
)

it.live("a running tool fences stage, clear and commit without changing files or projected history", () =>
  Effect.gen(function* () {
    const f = yield* fixture()
    yield* Effect.gen(function* () {
      const sessions = yield* SessionV2.Service
      const store = yield* SessionStore.Service
      const created = yield* sessions.create({ location: f.location })
      const boundary = yield* seedHistory(created.id)
      const staged = (yield* sessions.get(created.id)).revert
      const marker = `${f.location.directory}/marker.txt`
      yield* Effect.promise(() => Bun.write(marker, "untouched"))
      const before = yield* store.entries(created.id)
      const running = yield* f.coordinator.run(created.id).pipe(Effect.forkChild)
      yield* Queue.take(f.started)
      const errors = yield* Effect.forEach(["stage", "clear", "commit"] as const, (kind) =>
        operation(sessions, kind, created.id, boundary).pipe(
          Effect.match({ onSuccess: () => undefined, onFailure: (error) => error }),
        ),
      )
      const during = yield* store.entries(created.id)
      const content = yield* Effect.promise(() => Bun.file(marker).text())
      const duringRevert = (yield* sessions.get(created.id)).revert
      yield* Deferred.succeed(f.release, undefined)
      yield* Fiber.join(running)
      errors.forEach((error) => expect(error).toMatchObject({ _tag: "Session.BusyError" }))
      expect(before).toHaveLength(2)
      expect(during).toEqual(before)
      expect(duringRevert).toEqual(staged)
      expect(content).toBe("untouched")
      yield* sessions.revert.clear(created.id)
      yield* sessions.revert.stage({ sessionID: created.id, messageID: boundary, files: false })
      yield* sessions.revert.commit(created.id)
      expect((yield* store.entries(created.id)).map((entry) => entry.message.id)).toEqual([boundary])
    }).pipe(Effect.provide(f.layer), Effect.ensuring(Deferred.succeed(f.release, undefined)))
  }),
)

it.live("a failing revert releases ownership and a different Session remains independent", () =>
  Effect.gen(function* () {
    const f = yield* fixture()
    yield* Effect.gen(function* () {
      const sessions = yield* SessionV2.Service
      const first = yield* sessions.create({ location: f.location })
      const other = yield* sessions.create({ location: f.location })
      const running = yield* f.coordinator.run(first.id).pipe(Effect.forkChild)
      yield* Queue.take(f.started)
      yield* sessions.revert.clear(other.id)
      yield* Deferred.succeed(f.release, undefined)
      yield* Fiber.join(running)
      expect(
        yield* sessions.revert
          .stage({ sessionID: first.id, messageID: SessionMessage.ID.make("msg_missing") })
          .pipe(Effect.flip),
      ).toMatchObject({ _tag: "Session.MessageNotFoundError" })
      yield* sessions.revert.clear(first.id)
      expect((yield* sessions.get(first.id)).revert).toBeUndefined()
    }).pipe(Effect.provide(f.layer), Effect.ensuring(Deferred.succeed(f.release, undefined)))
  }),
)

it.live("cancelling the caller keeps its owned revert alive and the Session busy until it finishes", () =>
  Effect.gen(function* () {
    const f = yield* fixture()
    yield* Effect.gen(function* () {
      const sessions = yield* SessionV2.Service
      const created = yield* sessions.create({ location: f.location })
      const boundary = yield* seedHistory(created.id)
      const held = yield* heldRevertRead(f.execution)
      yield* Effect.gen(function* () {
        const caller = yield* held.session.revert
          .stage({ sessionID: created.id, messageID: boundary })
          .pipe(Effect.forkChild)
        yield* Deferred.await(held.entered)
        yield* Fiber.interrupt(caller)
        const activeBeforeRelease = yield* f.coordinator.active
        const retry = yield* sessions.revert
          .clear(created.id)
          .pipe(Effect.match({ onSuccess: () => undefined, onFailure: (error) => error }))
        const readsBeforeRelease = held.progress.afterGate
        yield* Deferred.succeed(held.release, undefined)
        yield* sessions.wait(created.id)
        expect(activeBeforeRelease.has(created.id)).toBe(true)
        expect(retry).toMatchObject({ _tag: "Session.BusyError", sessionID: created.id })
        expect(readsBeforeRelease).toBe(0)
        expect(held.progress.afterGate).toBe(1)
        expect((yield* sessions.get(created.id)).revert).toMatchObject({ messageID: boundary, diff: "" })
        expect(yield* f.coordinator.active).toEqual(new Set())
      }).pipe(Effect.ensuring(Deferred.succeed(held.release, undefined)))
    }).pipe(Effect.provide(f.layer))
  }),
)

it.live("explicit execution interruption stops the revert owner before its read gate opens without late work", () =>
  Effect.gen(function* () {
    const f = yield* fixture()
    yield* Effect.gen(function* () {
      const sessions = yield* SessionV2.Service
      const execution = yield* SessionExecution.Service
      const created = yield* sessions.create({ location: f.location })
      const boundary = yield* seedHistory(created.id)
      const before = (yield* sessions.get(created.id)).revert
      const held = yield* heldRevertRead(f.execution)
      yield* Effect.gen(function* () {
        const caller = yield* held.session.revert
          .stage({ sessionID: created.id, messageID: boundary })
          .pipe(Effect.forkChild)
        yield* Deferred.await(held.entered)
        yield* execution.interrupt(created.id)
        const activeBeforeRelease = yield* f.coordinator.active
        const readsBeforeRelease = held.progress.afterGate
        yield* Deferred.succeed(held.release, undefined)
        const callerExit = yield* Fiber.await(caller)
        expect(activeBeforeRelease.has(created.id)).toBe(false)
        expect(readsBeforeRelease).toBe(0)
        expect(held.progress.afterGate).toBe(0)
        expect(Exit.isFailure(callerExit) && Cause.hasInterruptsOnly(callerExit.cause)).toBe(true)
        expect((yield* sessions.get(created.id)).revert).toEqual(before)
        expect(yield* f.coordinator.active).toEqual(new Set())
      }).pipe(Effect.ensuring(Deferred.succeed(held.release, undefined)))
    }).pipe(Effect.provide(f.layer))
  }),
)

function heldRevertRead(execution: Layer.Layer<SessionExecution.Service>) {
  return Effect.gen(function* () {
    const store = yield* SessionStore.Service
    const database = yield* Database.Service
    const events = yield* EventV2.Service
    const locations = yield* LocationServiceMap.Service
    const entered = yield* Deferred.make<void>()
    const release = yield* Deferred.make<void>()
    const progress = { afterGate: 0 }
    const heldStore = Layer.succeed(
      SessionStore.Service,
      SessionStore.Service.of({
        ...store,
        get: (sessionID) =>
          Deferred.succeed(entered, undefined).pipe(
            Effect.andThen(Deferred.await(release)),
            Effect.andThen(
              Effect.sync(() => {
                progress.afterGate++
              }),
            ),
            Effect.andThen(store.get(sessionID)),
          ),
      }),
    )
    const context = yield* Layer.build(
      Layer.fresh(
        AppNodeBuilder.build(LayerNode.group([SessionV2.node, SessionExecution.node]), [
          [Database.node, Layer.succeed(Database.Service, database)],
          [EventV2.node, Layer.succeed(EventV2.Service, events)],
          [SessionStore.node, heldStore],
          [SessionExecution.node, execution],
          [LocationServiceMap.node, Layer.succeed(LocationServiceMap.Service, locations)],
          [ProjectV2.node, projects],
        ]),
      ),
    )
    return { session: Context.get(context, SessionV2.Service), entered, release, progress }
  })
}

function operation(
  sessions: SessionV2.Interface,
  kind: "stage" | "clear" | "commit",
  sessionID: SessionV2.ID,
  messageID = SessionMessage.ID.make("msg_missing"),
): Effect.Effect<unknown, unknown> {
  if (kind === "stage") return sessions.revert.stage({ sessionID, messageID })
  if (kind === "clear") return sessions.revert.clear(sessionID)
  return sessions.revert.commit(sessionID)
}

function fixture() {
  return Effect.gen(function* () {
    const tmp = yield* Effect.acquireRelease(
      Effect.promise(() => tmpdir()),
      (tmp) => Effect.promise(() => tmp[Symbol.asyncDispose]()),
    )
    const location = Location.Ref.make({ directory: AbsolutePath.make(tmp.path) })
    const started = yield* Queue.unbounded<SessionV2.ID>()
    const release = yield* Deferred.make<void>()
    const tool = Tool.make({
      description: "Blocked operation",
      input: Schema.Struct({}),
      output: Schema.Struct({}),
      execute: (_, context) =>
        Queue.offer(started, context.sessionID).pipe(Effect.andThen(Deferred.await(release)), Effect.as({})),
    })
    const coordinator = yield* SessionRunCoordinator.make<SessionV2.ID, never>({
      drain: (sessionID) =>
        Tool.settle(tool, ToolCall.make({ type: "tool-call", id: "call_busy", name: "blocked", input: {} }), {
          sessionID,
          agent: AgentV2.ID.make("general"),
          assistantMessageID: SessionMessage.ID.make("msg_busy"),
          toolCallID: "call_busy",
        }).pipe(Effect.orDie, Effect.asVoid),
    })
    const execution = Layer.succeed(
      SessionExecution.Service,
      SessionExecution.Service.of({
        active: coordinator.active,
        resume: coordinator.run,
        wake: coordinator.wake,
        interrupt: coordinator.interrupt,
        exclusive: coordinator.exclusive,
        withRunner: () => Effect.die("unused by revert"),
      }),
    )
    const layer = AppNodeBuilder.build(
      LayerNode.group([
        Database.node,
        EventV2.node,
        SessionStore.node,
        LocationServiceMap.node,
        SessionExecution.node,
        SessionV2.node,
      ]),
      [
        [ProjectV2.node, projects],
        [SessionExecution.node, execution],
      ],
    )
    return { location, started, release, coordinator, execution, layer }
  })
}

function seedHistory(sessionID: SessionV2.ID) {
  return Effect.gen(function* () {
    const events = yield* EventV2.Service
    const boundary = SessionMessage.ID.make(`msg_${sessionID}_boundary`)
    const later = SessionMessage.ID.make(`msg_${sessionID}_later`)
    yield* events.publish(SessionEvent.Prompted, {
      sessionID,
      messageID: boundary,
      timestamp: DateTime.makeUnsafe(1),
      prompt: Prompt.make({ text: "boundary" }),
      delivery: "steer",
    })
    yield* events.publish(SessionEvent.Prompted, {
      sessionID,
      messageID: later,
      timestamp: DateTime.makeUnsafe(2),
      prompt: Prompt.make({ text: "later" }),
      delivery: "steer",
    })
    yield* events.publish(SessionEvent.RevertEvent.Staged, {
      sessionID,
      timestamp: DateTime.makeUnsafe(3),
      revert: { messageID: boundary, diff: "retain prior revert", files: [] },
    })
    return boundary
  })
}
