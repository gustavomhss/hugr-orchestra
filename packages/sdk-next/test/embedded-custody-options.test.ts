import { expect } from "bun:test"
import { join } from "node:path"
import { Cause, Deferred, Effect, Exit, Fiber, Latch, Layer, Option, Scope, Stream } from "effect"
import { Database } from "@orchestra/core/database/database"
import { SessionExecution } from "@orchestra/core/session/execution"
import { PermissionSaved } from "@orchestra/core/permission/saved"
import type { Host } from "@orchestra/core/host"
import { testEffect } from "@orchestra/core/test/lib/effect"
import { AbsolutePath, Agent, Location, Orchestra, Prompt, Session, type OrchestraEvent } from "../src"
import { directory, host, provider, resource } from "./fixture/embedded-custody"

const it = testEffect(Layer.empty)

for (const memory of [false, true]) {
  it.live(
    memory
      ? "new API: private memory hosts isolate SQL and notifications"
      : "new API: separate files isolate SQL and notifications",
    () =>
      Effect.gen(function* () {
        const tmp = yield* directory()
        const firstState = { builds: 0, files: [] as string[] }
        const secondState = { builds: 0, files: [] as string[] }
        const firstFile = memory ? ":memory:" : join(tmp.path, "first.sqlite")
        const secondFile = memory ? ":memory:" : join(tmp.path, "second.sqlite")
        const first = yield* host(firstFile, [resource({ state: firstState })])
        const second = yield* host(secondFile, [resource({ state: secondState })])
        expect(firstState.builds, "API RED: host contribution was not installed").toBe(1)
        expect(secondState.builds).toBe(1)
        if (memory) expect([firstState.files, secondState.files]).toEqual([[""], [""]])
        if (!memory) expect([firstState.files, secondState.files]).toEqual([[firstFile], [secondFile]])
        const id = Session.ID.make("ses_custody_isolated")
        const placement = Location.Ref.make({ directory: AbsolutePath.make(tmp.path) })
        yield* first.client.sessions.create({ id, location: placement })
        const missing = yield* second.client.sessions.get({ sessionID: id }).pipe(Effect.flip)
        expect(missing._tag).toBe("SessionNotFoundError")
        yield* second.client.sessions.create({ id, location: placement })
        const firstReady = yield* Latch.make(false)
        const secondReady = yield* Latch.make(false)
        const firstEvent = yield* Latch.make(false)
        const secondEvent = yield* Latch.make(false)
        const observe = (ready: Latch.Latch, event: Latch.Latch) =>
          Stream.runForEach((notification: OrchestraEvent) =>
            notification.type === "server.connected"
              ? ready.open
              : notification.type === "session.next.agent.switched" && notification.data.sessionID === id
                ? event.open
                : Effect.void,
          )
        yield* first.client.events.subscribe().pipe(observe(firstReady, firstEvent), Effect.forkScoped)
        yield* second.client.events.subscribe().pipe(observe(secondReady, secondEvent), Effect.forkScoped)
        yield* Effect.all([firstReady.await, secondReady.await])
        yield* first.client.sessions.switchAgent({ sessionID: id, agent: Agent.ID.make("reviewer") })
        yield* firstEvent.await.pipe(Effect.timeout("2 seconds"))
        expect(Option.isNone(yield* secondEvent.await.pipe(Effect.timeoutOption("50 millis")))).toBe(true)
      }),
    10000,
  )
}

it.live(
  "new API: duplicate refusal leaves the real HTTP provider turn and owning client alive",
  () =>
    Effect.gen(function* () {
      const tmp = yield* directory()
      const network = yield* provider()
      return yield* Effect.gen(function* () {
        const database = join(tmp.path, "live.sqlite")
        const state = { builds: 0, files: [] as string[] }
        const contributions = [network.contribution, resource({ state })]
        const first = yield* host(database, contributions)
        expect(state.builds).toBe(1)
        const session = yield* first.client.sessions.create({
          agent: Agent.ID.make("maestro"),
          location: Location.Ref.make({ directory: AbsolutePath.make(tmp.path) }),
        })
        yield* first.client.sessions.prompt({
          sessionID: session.id,
          prompt: Prompt.make({ text: "Keep the provider alive" }),
        })
        yield* Deferred.await(network.started).pipe(Effect.timeout("3 seconds"))
        const contenderScope = yield* Scope.make()
        const contender = yield* Orchestra.create({ database, host: contributions }).pipe(
          Effect.provideService(Scope.Scope, contenderScope),
          Effect.exit,
        )
        yield* Scope.close(contenderScope, Exit.void)
        expect(errorTag(contender)).toBe("Orchestra.StoreInUseError")
        if (Exit.isFailure(contender)) expect(Cause.squash(contender.cause)).toBeInstanceOf(Orchestra.StoreInUseError)
        expect(state.builds).toBe(1)
        expect(network.requests).toHaveLength(1)
        expect((yield* first.client.sessions.get({ sessionID: session.id })).id).toBe(session.id)
        network.release()
        yield* first.client.sessions.wait({ sessionID: session.id }).pipe(Effect.timeout("3 seconds"))
        expect(JSON.stringify(yield* first.client.sessions.context({ sessionID: session.id }))).toContain(
          "custody survived",
        )
        expect(network.requests).toHaveLength(1)
      }).pipe(Effect.ensuring(Effect.sync(network.release)))
    }),
  10000,
)

it.live(
  "new API: construction failure releases custody before a caught outer Scope ends and retains its DB",
  () =>
    Effect.gen(function* () {
      const tmp = yield* directory()
      const database = join(tmp.path, "failure.sqlite")
      const state = { builds: 0, files: [] as string[], fail: true }
      const contributions = [resource({ state })]
      const failed = yield* Orchestra.create({ database, host: contributions }).pipe(Effect.exit)
      expect(state.builds, "API RED: failing resource was ignored").toBe(1)
      expect(Exit.isFailure(failed)).toBe(true)
      expect(yield* Effect.promise(() => Bun.file(database).exists())).toBe(true)
      state.fail = false
      const retry = yield* host(database, contributions)
      expect(state.builds).toBe(2)
      expect(yield* retry.client.sessions.active()).toEqual({})
    }),
  10000,
)

it.live(
  "new API: custody outlives a gated resource teardown and a rejected contender cannot release it",
  () =>
    Effect.gen(function* () {
      const tmp = yield* directory()
      const entered = yield* Deferred.make<void>()
      const release = yield* Deferred.make<void>()
      return yield* Effect.gen(function* () {
        const database = join(tmp.path, "teardown.sqlite")
        const state = { builds: 0, files: [] as string[] }
        const contributions = [
          resource({
            state,
            close: Deferred.succeed(entered, undefined).pipe(Effect.andThen(Deferred.await(release))),
          }),
        ]
        const first = yield* host(database, contributions)
        expect(state.builds).toBe(1)
        const closing = yield* Scope.close(first.scope, Exit.void).pipe(Effect.forkChild)
        yield* Deferred.await(entered)
        const rejectedScope = yield* Scope.make()
        const rejected = yield* Orchestra.create({ database }).pipe(
          Effect.provideService(Scope.Scope, rejectedScope),
          Effect.exit,
        )
        yield* Scope.close(rejectedScope, Exit.void)
        expect(errorTag(rejected)).toBe("Orchestra.StoreInUseError")
        const stillRejected = yield* Orchestra.create({ database }).pipe(Effect.exit)
        expect(errorTag(stillRejected)).toBe("Orchestra.StoreInUseError")
        yield* Deferred.succeed(release, undefined)
        yield* Fiber.join(closing)
        const next = yield* host(database, contributions)
        expect(state.builds).toBe(2)
        expect(yield* next.client.sessions.active()).toEqual({})
      }).pipe(Effect.ensuring(Deferred.succeed(release, undefined)))
    }),
  10000,
)

it.live(
  "new API: an ordinary HTTP failure retains the live host's custody",
  () =>
    Effect.gen(function* () {
      const tmp = yield* directory()
      const database = join(tmp.path, "request.sqlite")
      const owner = yield* host(database)
      expect(
        (yield* owner.client.sessions.get({ sessionID: Session.ID.make("ses_missing_custody") }).pipe(Effect.flip))
          ._tag,
      ).toBe("SessionNotFoundError")
      expect(errorTag(yield* Orchestra.create({ database }).pipe(Effect.exit))).toBe("Orchestra.StoreInUseError")
      const created = yield* owner.client.sessions.create({
        location: Location.Ref.make({ directory: AbsolutePath.make(tmp.path) }),
      })
      expect((yield* owner.client.sessions.get({ sessionID: created.id })).id).toBe(created.id)
    }),
  10000,
)

it.live(
  "new API: concurrent file contenders admit exactly one complete host",
  () =>
    Effect.gen(function* () {
      const tmp = yield* directory()
      const database = join(tmp.path, "contended.sqlite")
      const outcomes = yield* Effect.all(
        [0, 1].map(() => Orchestra.create({ database }).pipe(Effect.exit)),
        { concurrency: "unbounded" },
      )
      expect(yield* Effect.promise(() => Bun.file(database).exists()), "API RED: ignored explicit database").toBe(true)
      expect(outcomes.filter(Exit.isSuccess)).toHaveLength(1)
      expect(outcomes.filter((outcome) => errorTag(outcome) === "Orchestra.StoreInUseError")).toHaveLength(1)
    }),
  10000,
)

for (const database of ["", "relative.sqlite", "file::memory:?cache=shared", "file:/tmp/custody.sqlite?mode=memory"]) {
  it.live("new API: unsupported database spelling is rejected before acquisition: " + database, () =>
    Effect.gen(function* () {
      const result = yield* Orchestra.create({ database }).pipe(Effect.exit)
      expect(errorTag(result)).toBe("Orchestra.UnsupportedStoreError")
      if (Exit.isFailure(result)) expect(Cause.squash(result.cause)).toBeInstanceOf(Orchestra.UnsupportedStoreError)
    }),
  )
}

it.live("new API: user host contributions cannot claim Database or reserved Session execution", () =>
  Effect.gen(function* () {
    const tmp = yield* directory()
    const database = join(tmp.path, "denied.sqlite")
    const cases: Host.Contribution[] = [
      {
        id: "database-replacement",
        replacements: [[Database.node, Database.layerFromPath(join(tmp.path, "other.sqlite"))]],
      },
      { id: "database-node", nodes: [Database.node] },
      { id: "execution-replacement", replacements: [[SessionExecution.node, SessionExecution.noopLayer]] },
    ]
    for (const contribution of cases) {
      const result = yield* Orchestra.create({ database, host: [contribution] }).pipe(Effect.exit)
      expect(Exit.isFailure(result)).toBe(true)
      expect(yield* Effect.promise(() => Bun.file(database).exists())).toBe(false)
    }
    expect(yield* Effect.promise(() => Bun.file(join(tmp.path, "other.sqlite")).exists())).toBe(false)
  }),
)

function errorTag(exit: Exit.Exit<unknown, unknown>) {
  if (Exit.isSuccess(exit)) return undefined
  const cause = Cause.squash(exit.cause)
  return cause && typeof cause === "object" && "_tag" in cause ? cause._tag : undefined
}

it.live(
  "new API: replacing PermissionSaved without dependencies cannot remove eager Database acquisition",
  () =>
    Effect.gen(function* () {
      const tmp = yield* directory()
      const database = join(tmp.path, "explicit-database.sqlite")
      const alternative = Layer.succeed(
        PermissionSaved.Service,
        PermissionSaved.Service.of({
          list: () => Effect.succeed([]),
          add: () => Effect.void,
          remove: () => Effect.void,
        }),
      )
      const owner = yield* host(database, [
        { id: "independent-permissions", replacements: [[PermissionSaved.node, alternative]] },
      ])
      const session = yield* owner.client.sessions.create({
        location: Location.Ref.make({ directory: AbsolutePath.make(tmp.path) }),
      })
      expect((yield* owner.client.sessions.get({ sessionID: session.id })).id).toBe(session.id)
    }),
  10000,
)
