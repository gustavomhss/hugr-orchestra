import { afterAll, expect, test } from "bun:test"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { Flag } from "@orchestra/core/flag/flag"
import { Deferred, Effect, Latch, Option, Schema, Stream } from "effect"
import type { OrchestraEvent } from "../src"

// Core resolves the database path once, when the first test imports ../src, so every host in this file shares one
// database. A per-test path would be ignored after the first import, and removing it would break the later tests.
const database = await mkdtemp(join(tmpdir(), "orchestra-embedded-db-"))
const previousDatabase = Flag.ORCHESTRA_DB
Flag.ORCHESTRA_DB = join(database, "orchestra.sqlite")
afterAll(async () => {
  Flag.ORCHESTRA_DB = previousDatabase
  await rm(database, { recursive: true, force: true })
})

// The first host boots the whole Core graph, and the test itself waits up to 10 seconds for the prompted event.
test("embedded client uses the real router and handlers", async () => {
  const directory = await mkdtemp(join(tmpdir(), "orchestra-embedded-"))
  const { AbsolutePath, Agent, Location, Model, Orchestra, Prompt, Provider, Session, Tool } = await import("../src")
  const sessionID = Session.ID.make(`ses_embedded_${crypto.randomUUID()}`)
  const model = Model.Ref.make({ id: Model.ID.make("embedded"), providerID: Provider.ID.make("test") })

  try {
    const program = Effect.gen(function* () {
      const orchestra = yield* Orchestra.create()
      const operator = yield* orchestra.operator.inspect({ location: { directory } })
      const nextOperator = yield* orchestra.operator.inspect({ location: { directory } })
      expect(operator.origin).toBe("sdk")
      expect(operator.requestID).not.toBe(nextOperator.requestID)
      expect(operator.scopeHash).toBe(nextOperator.scopeHash)
      yield* orchestra.tools.register({
        embedded_tool: Tool.make({
          description: "Embedded test tool",
          input: Schema.Struct({}),
          output: Schema.Struct({ ok: Schema.Boolean }),
          execute: () => Effect.succeed({ ok: true }),
        }),
      })

      const created = yield* orchestra.sessions.create({
        id: sessionID,
        agent: Agent.ID.make("maestro"),
        location: Location.Ref.make({ directory: AbsolutePath.make(directory) }),
      })
      yield* orchestra.sessions.switchModel({ sessionID, model })
      const selected = yield* orchestra.sessions.get({ sessionID })
      const page = yield* orchestra.sessions.list({ directory: AbsolutePath.make(directory) })
      const active = yield* orchestra.sessions.active()
      const admitted = yield* orchestra.sessions.prompt({
        sessionID,
        prompt: Prompt.make({ text: "Do not run" }),
        resume: false,
      })
      const context = yield* orchestra.sessions.context({ sessionID })
      const wake = yield* orchestra.sessions.prompt({
        sessionID,
        prompt: Prompt.make({ text: "Promote this input" }),
      })
      const prompted = yield* orchestra.sessions.events({ sessionID }).pipe(
        Stream.filter((event) => event.type === "session.next.prompted" && event.data.messageID === wake.id),
        Stream.runHead,
        Effect.timeout("10 seconds"),
        Effect.map(Option.getOrThrow),
      )
      const wakeContext = yield* orchestra.sessions.context({ sessionID })
      const event = yield* orchestra.sessions
        .events({ sessionID })
        .pipe(Stream.take(1), Stream.runHead, Effect.map(Option.getOrUndefined))
      const modelMessage = Option.fromNullishOr(context.find((message) => message.type === "model-switched")).pipe(
        Option.getOrThrow,
      )
      const message = yield* orchestra.sessions.message({ sessionID, messageID: modelMessage.id })
      yield* orchestra.sessions.interrupt({ sessionID })
      const other = yield* orchestra.sessions.create({
        location: Location.Ref.make({ directory: AbsolutePath.make(directory) }),
      })
      const missingSessionID = Session.ID.make(`ses_missing_${crypto.randomUUID()}`)
      const missing = yield* Effect.all(
        [
          orchestra.sessions.events({ sessionID: missingSessionID }).pipe(Stream.runHead, Effect.flip),
          orchestra.sessions.interrupt({ sessionID: missingSessionID }).pipe(Effect.flip),
          orchestra.sessions.message({ sessionID: missingSessionID, messageID: modelMessage.id }).pipe(Effect.flip),
        ],
        { concurrency: "unbounded" },
      )
      const missingMessage = yield* Effect.flip(
        orchestra.sessions.message({
          sessionID: other.id,
          messageID: modelMessage.id,
        }),
      )

      expect(created.id).toBe(sessionID)
      expect(selected.model?.id).toBe(model.id)
      expect(selected.model?.providerID).toBe(model.providerID)
      expect(page.data.some((session) => session.id === sessionID)).toBe(true)
      expect(active).toEqual({})
      expect(admitted.sessionID).toBe(sessionID)
      expect(prompted.type).toBe("session.next.prompted")
      expect(wakeContext).toContainEqual(expect.objectContaining({ id: wake.id, type: "user" }))
      expect(context.some((message) => message.type === "model-switched")).toBe(true)
      expect(event).toMatchObject({ type: "session.next.model.switched", durable: { seq: 1 } })
      expect(message).toEqual(modelMessage)
      expect(missing.map((error) => error._tag)).toEqual([
        "SessionNotFoundError",
        "SessionNotFoundError",
        "SessionNotFoundError",
      ])
      expect(missingMessage._tag).toBe("MessageNotFoundError")
    })
    await Effect.runPromise(Effect.scoped(program))
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
}, 10_000)

test("Location-owned runner events reach the ready global client", async () => {
  const directory = await mkdtemp(join(tmpdir(), "orchestra-embedded-events-"))
  const { AbsolutePath, Location, Orchestra, Prompt, Session } = await import("../src")
  const sessionID = Session.ID.make(`ses_embedded_${crypto.randomUUID()}`)

  try {
    const program = Effect.gen(function* () {
      const orchestra = yield* Orchestra.create()
      const connected = yield* Latch.make(false)
      const prompted = yield* Deferred.make<OrchestraEvent>()
      yield* orchestra.events.subscribe().pipe(
        Stream.runForEach((event) =>
          event.type === "server.connected"
            ? connected.open
            : event.type === "session.next.prompted" && event.data.sessionID === sessionID
              ? Deferred.succeed(prompted, event).pipe(Effect.asVoid)
              : Effect.void,
        ),
        Effect.forkScoped,
      )
      yield* connected.await
      yield* orchestra.sessions.create({
        id: sessionID,
        location: Location.Ref.make({ directory: AbsolutePath.make(directory) }),
      })
      yield* orchestra.sessions.prompt({ sessionID, prompt: Prompt.make({ text: "Observe this input" }) })

      const event = yield* Deferred.await(prompted).pipe(Effect.timeout("4 seconds"))
      expect(event.durable).toEqual(expect.objectContaining({ aggregateID: sessionID, seq: expect.any(Number) }))
    })
    await Effect.runPromise(Effect.scoped(program))
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
}, 10_000)

test("independent embedded hosts do not share live notifications", async () => {
  const directory = await mkdtemp(join(tmpdir(), "orchestra-embedded-hosts-"))
  const { AbsolutePath, Agent, Location, Orchestra, Session } = await import("../src")
  const sessionID = Session.ID.make(`ses_embedded_${crypto.randomUUID()}`)

  try {
    const program = Effect.gen(function* () {
      const first = yield* Orchestra.create()
      const second = yield* Orchestra.create()
      const firstReady = yield* Latch.make(false)
      const secondReady = yield* Latch.make(false)
      const firstEvent = yield* Latch.make(false)
      const secondEvent = yield* Latch.make(false)
      const observe = (ready: Latch.Latch, event: Latch.Latch) =>
        Stream.runForEach((notification: OrchestraEvent) =>
          notification.type === "server.connected"
            ? ready.open
            : notification.type === "session.next.agent.switched" && notification.data.sessionID === sessionID
              ? event.open
              : Effect.void,
        )

      yield* first.events.subscribe().pipe(observe(firstReady, firstEvent), Effect.forkScoped)
      yield* second.events.subscribe().pipe(observe(secondReady, secondEvent), Effect.forkScoped)
      yield* Effect.all([firstReady.await, secondReady.await], { discard: true })
      yield* first.sessions.create({
        id: sessionID,
        location: Location.Ref.make({ directory: AbsolutePath.make(directory) }),
      })
      yield* first.sessions.switchAgent({ sessionID, agent: Agent.ID.make("reviewer") })

      yield* firstEvent.await.pipe(Effect.timeout("2 seconds"))
      expect(Option.isNone(yield* secondEvent.await.pipe(Effect.timeoutOption("100 millis")))).toBe(true)
    })
    await Effect.runPromise(Effect.scoped(program))
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
}, 10_000)

test("embedded client is available as a Layer service", async () => {
  const directory = await mkdtemp(join(tmpdir(), "orchestra-embedded-layer-"))
  const { AbsolutePath, Location, Orchestra, Session } = await import("../src")
  const sessionID = Session.ID.make(`ses_embedded_${crypto.randomUUID()}`)

  try {
    const created = await Effect.runPromise(
      Effect.gen(function* () {
        const orchestra = yield* Orchestra.Service
        return yield* orchestra.sessions.create({
          id: sessionID,
          location: Location.Ref.make({ directory: AbsolutePath.make(directory) }),
        })
      }).pipe(Effect.provide(Orchestra.layer), Effect.scoped),
    )

    expect(created.id).toBe(sessionID)
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})
