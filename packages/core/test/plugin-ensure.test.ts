import { expect } from "bun:test"
import { Cause, Context, Deferred, Effect, Exit, Fiber, Layer, Scheduler, Schema, Scope } from "effect"
import { AgentV2 } from "@orchestra/core/agent"
import { EventV2 } from "@orchestra/core/event"
import { PluginV2 } from "@orchestra/core/plugin"
import { State } from "@orchestra/core/state"
import { PluginTestLayer } from "./plugin/fixture"
import { testEffect } from "./lib/effect"

const it = testEffect(PluginTestLayer)

it.effect("ensure installs once without closing or reordering active transforms; add still replaces", () =>
  Effect.gen(function* () {
    const plugins = yield* PluginV2.Service
    const agents = yield* AgentV2.Service
    const id = PluginV2.ID.make("host-native")
    const agentID = AgentV2.ID.make("archie")
    const lifecycle: string[] = []
    const install = (description: string) => () =>
      Effect.gen(function* () {
        lifecycle.push(`open:${description}`)
        yield* Effect.addFinalizer(() =>
          Effect.sync(() => {
            lifecycle.push(`close:${description}`)
          }),
        )
        yield* agents.transform((draft) =>
          draft.update(agentID, (agent) => {
            agent.description = description
            agent.permissions = [{ action: "execute", resource: "*", effect: "allow" }]
          }),
        )
      })
    const waiting = yield* registeredWaiter(plugins, id)
    yield* plugins.ensure(id, install("native"))
    expect(Exit.isSuccess(yield* Fiber.join(waiting))).toBe(true)
    yield* plugins.wait(id)
    expect((yield* agents.get(agentID))?.description).toBe("native")
    const revokeID = PluginV2.ID.make("later-revocation")
    yield* plugins.add(revokeID, () =>
      agents
        .transform((draft) =>
          draft.update(agentID, (agent) => {
            agent.permissions.push({ action: "execute", resource: "*", effect: "deny" })
          }),
        )
        .pipe(Effect.asVoid),
    )
    const captured = yield* agents.get(agentID)
    yield* plugins.ensure(id, install("replacement-attempt"))
    expect(yield* agents.get(agentID)).toBe(captured)
    expect((yield* agents.get(agentID))?.permissions.at(-1)?.effect).toBe("deny")
    expect(lifecycle).toEqual(["open:native"])
    yield* plugins.add(id, install("replacement"))
    expect((yield* agents.get(agentID))?.description).toBe("replacement")
    expect((yield* agents.get(agentID))?.permissions).toEqual([{ action: "execute", resource: "*", effect: "allow" }])
    expect(lifecycle).toEqual(["open:native", "close:native", "open:replacement"])
    yield* plugins.remove(id)
    expect(lifecycle).toEqual(["open:native", "close:native", "open:replacement", "close:replacement"])
    yield* plugins.remove(revokeID)
    expect(yield* agents.get(agentID)).toBeUndefined()
  }),
)

it.effect("ensure shares activation failures, cleanup, waiters and retry with add", () =>
  Effect.gen(function* () {
    const plugins = yield* PluginV2.Service
    const agents = yield* AgentV2.Service
    const id = PluginV2.ID.make("ensure-failed")
    const agentID = AgentV2.ID.make("failed-record")
    const lifecycle: string[] = []
    const waiting = yield* registeredWaiter(plugins, id)
    const failed = yield* plugins
      .ensure(id, () =>
        Effect.gen(function* () {
          yield* Effect.addFinalizer(() =>
            Effect.sync(() => {
              lifecycle.push("closed")
            }),
          )
          yield* agents.transform((draft) =>
            draft.update(agentID, (agent) => {
              agent.description = "temporary"
            }),
          )
          return yield* Effect.die("ensure-boom")
        }),
      )
      .pipe(Effect.exit)
    const pending = yield* Fiber.join(waiting)
    const later = yield* plugins.wait(id).pipe(Effect.exit)
    ;[failed, pending, later].forEach((exit) => {
      expect(Exit.isFailure(exit)).toBe(true)
      if (Exit.isFailure(exit)) expect(Cause.pretty(exit.cause)).toContain("ensure-boom")
    })
    expect(lifecycle).toEqual(["closed"])
    expect(yield* agents.get(agentID)).toBeUndefined()
    yield* plugins.ensure(id, () =>
      agents
        .transform((draft) =>
          draft.update(agentID, (agent) => {
            agent.description = "recovered"
          }),
        )
        .pipe(Effect.asVoid),
    )
    yield* plugins.wait(id)
    expect((yield* agents.get(agentID))?.description).toBe("recovered")
    yield* plugins.ensure(id, () => Effect.die("active ensure must not run"))
  }),
)

it.live("ensure retains the existing same-ID load-cycle failure", () =>
  Effect.gen(function* () {
    const plugins = yield* PluginV2.Service
    const id = PluginV2.ID.make("ensure-cycle")
    const exit = yield* plugins
      .ensure(id, () => plugins.ensure(id, () => Effect.void))
      .pipe(
        Effect.timeoutOrElse({ duration: "2 seconds", orElse: () => Effect.die("SAME_ID_PLUGIN_DEADLOCK") }),
        Effect.exit,
      )
    expect(Exit.isFailure(exit)).toBe(true)
    if (Exit.isFailure(exit)) expect(Cause.pretty(exit.cause)).toContain("Plugin load cycle detected for ensure-cycle")
  }),
)
;(["add", "ensure"] as const).forEach((operation) => {
  it.effect(
    `${operation} rolls back late materialization before Added, activation or waiter success, including an outer batch`,
    () =>
      Effect.gen(function* () {
        const plugins = yield* PluginV2.Service
        const agents = yield* AgentV2.Service
        const events = yield* EventV2.Service
        const id = PluginV2.ID.make(`late-${operation}`)
        const agentID = AgentV2.ID.make(`late-${operation}-record`)
        const added: string[] = []
        const lifecycle: string[] = []
        yield* Effect.acquireRelease(
          events.listen((event) =>
            Effect.sync(() => {
              if (event.type !== PluginV2.Event.Added.type) return
              if (Schema.decodeUnknownSync(PluginV2.Event.Added.data)(event.data).id === id) added.push(id)
            }),
          ),
          (unsubscribe) => unsubscribe,
        )
        const returned = yield* Deferred.make<void>()
        const entered = yield* Deferred.make<void>()
        const release = yield* Deferred.make<void>()
        const waiting = yield* registeredWaiter(plugins, id)
        const installing = yield* State.batch(
          plugins[operation](id, (ctx) =>
            Effect.gen(function* () {
              yield* Effect.addFinalizer(() =>
                Effect.sync(() => {
                  lifecycle.push("closed:bad")
                }),
              )
              yield* ctx.agent.transform((draft) =>
                draft.update(agentID, (agent) => {
                  agent.description = "provisional"
                }),
              )
              yield* ctx.command.transform(() =>
                Effect.gen(function* () {
                  yield* Deferred.succeed(entered, undefined)
                  yield* Deferred.await(release)
                  return yield* Effect.die("late-transform-boom")
                }),
              )
              yield* Deferred.succeed(returned, undefined)
            }),
          ),
        ).pipe(Effect.exit, Effect.forkChild)
        yield* Deferred.await(entered)
        const beforeFlush = {
          returned: yield* Deferred.isDone(returned),
          description: (yield* agents.get(agentID))?.description,
          added: [...added],
          waiting: waiting.pollUnsafe(),
        }
        // Release every gate before assertions so a rejected mutant cannot strand sibling-fiber cleanup.
        yield* Deferred.succeed(release, undefined)
        const failed = yield* Fiber.join(installing)
        const pending = yield* Fiber.join(waiting)
        const later = yield* plugins.wait(id).pipe(Effect.exit)
        expect(beforeFlush.returned).toBe(true)
        expect(beforeFlush.description).toBe("provisional")
        expect(beforeFlush.added).toEqual([])
        expect(beforeFlush.waiting).toBeUndefined()
        ;[failed, pending, later].forEach((exit) => {
          expect(Exit.isFailure(exit)).toBe(true)
          if (Exit.isFailure(exit)) expect(Cause.pretty(exit.cause)).toContain("late-transform-boom")
        })
        expect(added).toEqual([])
        expect(lifecycle).toEqual(["closed:bad"])
        expect(yield* agents.get(agentID)).toBeUndefined()
        yield* plugins.ensure(id, (ctx) =>
          Effect.gen(function* () {
            lifecycle.push("open:retry")
            yield* ctx.agent.transform((draft) =>
              draft.update(agentID, (agent) => {
                agent.description = "recovered"
              }),
            )
          }),
        )
        yield* plugins.wait(id)
        expect((yield* agents.get(agentID))?.description).toBe("recovered")
        expect(added).toEqual([id])
        expect(lifecycle).toEqual(["closed:bad", "open:retry"])
        yield* plugins.ensure(id, () => Effect.die("healthy active retry must not run again"))
      }),
  )
})

it.effect("failed add replacement flushes predecessor removal even when the replacement registers no transform", () =>
  Effect.gen(function* () {
    const plugins = yield* PluginV2.Service
    const agents = yield* AgentV2.Service
    const id = PluginV2.ID.make("failed-replacement")
    const agentID = AgentV2.ID.make("predecessor")
    const closed: string[] = []
    yield* plugins.add(id, (ctx) =>
      Effect.gen(function* () {
        yield* Effect.addFinalizer(() =>
          Effect.sync(() => {
            closed.push("old")
          }),
        )
        yield* ctx.agent.transform((draft) =>
          draft.update(agentID, (agent) => {
            agent.description = "old"
          }),
        )
      }),
    )
    expect((yield* agents.get(agentID))?.description).toBe("old")
    const failed = yield* plugins
      .add(id, () =>
        Effect.gen(function* () {
          yield* Effect.addFinalizer(() =>
            Effect.sync(() => {
              closed.push("new")
            }),
          )
          return yield* Effect.die("replacement-boom")
        }),
      )
      .pipe(Effect.exit)
    expect(Exit.isFailure(failed)).toBe(true)
    if (Exit.isFailure(failed)) expect(Cause.pretty(failed.cause)).toContain("replacement-boom")
    expect(closed).toEqual(["old", "new"])
    expect(yield* agents.get(agentID)).toBeUndefined()
    yield* plugins.ensure(id, (ctx) =>
      ctx.agent
        .transform((draft) =>
          draft.update(agentID, (agent) => {
            agent.description = "replacement-retry"
          }),
        )
        .pipe(Effect.asVoid),
    )
    expect((yield* agents.get(agentID))?.description).toBe("replacement-retry")
  }),
)
;(
  [
    ["ensure", "ensure"],
    ["ensure", "add"],
    ["add", "ensure"],
  ] as const
).forEach(([first, second]) => {
  it.effect(`independent overlapping ${first}/${second} callers serialize instead of reporting a load cycle`, () =>
    Effect.gen(function* () {
      const plugins = yield* PluginV2.Service
      const agents = yield* AgentV2.Service
      const id = PluginV2.ID.make(`overlap-${first}-${second}`)
      const agentID = AgentV2.ID.make(`overlap-${first}-${second}-record`)
      const lifecycle: string[] = []
      const entered = yield* Deferred.make<void>()
      const release = yield* Deferred.make<void>()
      const started = yield* Deferred.make<void>()
      const waiting = yield* registeredWaiter(plugins, id)
      const firstCall = yield* plugins[first](id, (ctx) =>
        Effect.gen(function* () {
          lifecycle.push("open:first")
          yield* Effect.addFinalizer(() =>
            Effect.sync(() => {
              lifecycle.push("close:first")
            }),
          )
          yield* ctx.agent.transform((draft) =>
            draft.update(agentID, (agent) => {
              agent.description = "first"
              agent.permissions = [{ action: "execute", resource: "*", effect: "allow" }]
            }),
          )
          yield* Deferred.succeed(entered, undefined)
          yield* Deferred.await(release)
        }),
      ).pipe(Effect.exit, Effect.forkChild)
      yield* Deferred.await(entered)
      const secondCall = yield* Effect.gen(function* () {
        yield* Deferred.succeed(started, undefined)
        yield* plugins[second](id, (ctx) =>
          Effect.gen(function* () {
            lifecycle.push("open:second")
            yield* ctx.agent.transform((draft) =>
              draft.update(agentID, (agent) => {
                agent.description = "second"
                agent.permissions = [{ action: "execute", resource: "*", effect: "allow" }]
              }),
            )
          }),
        )
      }).pipe(
        Effect.exit,
        Effect.forkChild({ startImmediately: true }),
        Effect.provideService(Scheduler.PreventSchedulerYield, true),
      )
      yield* Deferred.await(started)
      // The second fiber has entered the real call while the first holds its ID lock.
      const whileHeld = { second: secondCall.pollUnsafe(), lifecycle: [...lifecycle] }
      yield* Deferred.succeed(release, undefined)
      const firstExit = yield* Fiber.join(firstCall)
      const secondExit = yield* Fiber.join(secondCall)
      const waiterExit = yield* Fiber.join(waiting)
      expect(whileHeld.second).toBeUndefined()
      expect(whileHeld.lifecycle).toEqual(["open:first"])
      expect(Exit.isSuccess(firstExit)).toBe(true)
      expect(Exit.isSuccess(secondExit)).toBe(true)
      expect(Exit.isSuccess(waiterExit)).toBe(true)
      expect(lifecycle).toEqual(second === "add" ? ["open:first", "close:first", "open:second"] : ["open:first"])
      expect((yield* agents.get(agentID))?.description).toBe(second === "add" ? "second" : "first")
      yield* agents.transform((draft) =>
        draft.update(agentID, (agent) => {
          agent.permissions.push({ action: "execute", resource: "*", effect: "deny" })
        }),
      )
      const revoked = yield* agents.get(agentID)
      yield* plugins.ensure(id, () => Effect.die("active ensure must not replace the overlap winner"))
      expect(yield* agents.get(agentID)).toBe(revoked)
      expect((yield* agents.get(agentID))?.permissions.at(-1)?.effect).toBe("deny")
    }),
  )
})

it.live("fiber ancestry detects cross-plugin recursion and reentry during late materialization", () =>
  Effect.gen(function* () {
    const plugins = yield* PluginV2.Service
    const agents = yield* AgentV2.Service
    const outer = PluginV2.ID.make("ancestry-outer")
    const inner = PluginV2.ID.make("ancestry-inner")
    const cycle = yield* plugins
      .ensure(outer, () => plugins.add(inner, () => plugins.ensure(outer, () => Effect.void)))
      .pipe(
        Effect.timeoutOrElse({ duration: "2 seconds", orElse: () => Effect.die("CROSS_PLUGIN_DEADLOCK") }),
        Effect.exit,
      )
    expect(Exit.isFailure(cycle)).toBe(true)
    if (Exit.isFailure(cycle))
      expect(Cause.pretty(cycle.cause)).toContain("Plugin load cycle detected for ancestry-outer")
    const replay = PluginV2.ID.make("ancestry-replay")
    const agentID = AgentV2.ID.make("ancestry-replay-record")
    const late = yield* plugins
      .ensure(replay, (ctx) =>
        ctx.agent
          .transform((draft) => {
            draft.update(agentID, (agent) => {
              agent.description = "provisional"
            })
            return plugins.ensure(replay, () => Effect.void)
          })
          .pipe(Effect.asVoid),
      )
      .pipe(
        Effect.timeoutOrElse({ duration: "2 seconds", orElse: () => Effect.die("REPLAY_PLUGIN_DEADLOCK") }),
        Effect.exit,
      )
    expect(Exit.isFailure(late)).toBe(true)
    if (Exit.isFailure(late))
      expect(Cause.pretty(late.cause)).toContain("Plugin load cycle detected for ancestry-replay")
    expect(yield* agents.get(agentID)).toBeUndefined()
  }),
)

it.live("same-ancestry wait and remove fail instead of waiting on their own ID lock", () =>
  Effect.gen(function* () {
    const plugins = yield* PluginV2.Service
    yield* Effect.forEach(["wait", "remove"] as const, (operation) =>
      Effect.gen(function* () {
        const id = PluginV2.ID.make(`ancestry-${operation}`)
        const exit = yield* plugins
          .ensure(id, () => plugins[operation](id))
          .pipe(
            Effect.timeoutOrElse({ duration: "2 seconds", orElse: () => Effect.die("OWN_PLUGIN_LOCK_DEADLOCK") }),
            Effect.exit,
          )
        expect(Exit.isFailure(exit)).toBe(true)
        if (Exit.isFailure(exit))
          expect(Cause.pretty(exit.cause)).toContain(
            operation === "wait"
              ? `Plugin load cycle detected for ${id}`
              : `Cannot remove plugin ${id} while it is loading`,
          )
      }),
    )
  }),
)

const lifetime = testEffect(Layer.empty)
lifetime.effect("ensure plugin and transforms close with their owning service layer", () =>
  Effect.gen(function* () {
    const closed: string[] = []
    const owner = yield* Scope.Scope
    const outer = yield* Layer.buildWithScope(AgentV2.locationLayer, owner)
    const agents = Context.get(outer, AgentV2.Service)
    const agentID = AgentV2.ID.make("outer-owned-agent-state")
    yield* Effect.gen(function* () {
      const plugins = yield* PluginV2.Service
      const actualAgents = yield* AgentV2.Service
      expect(actualAgents).toBe(agents)
      yield* plugins.ensure(PluginV2.ID.make("location-owned"), (ctx) =>
        Effect.gen(function* () {
          yield* Effect.addFinalizer(() =>
            Effect.sync(() => {
              closed.push("location-closed")
            }),
          )
          yield* ctx.agent.transform((draft) =>
            draft.update(agentID, (agent) => {
              agent.description = "owned by plugin scope"
            }),
          )
        }),
      )
      expect((yield* agents.get(agentID))?.description).toBe("owned by plugin scope")
      expect(closed).toEqual([])
    }).pipe(Effect.provide(PluginTestLayer), Effect.provide(outer))
    expect(closed).toEqual(["location-closed"])
    expect(yield* agents.get(agentID)).toBeUndefined()
  }),
)

it.live("retired activation ancestry permits same-ID ensure and wait from its surviving background child", () =>
  Effect.gen(function* () {
    const plugins = yield* PluginV2.Service
    const id = PluginV2.ID.make("retired-background")
    const go = yield* Deferred.make<void>()
    const done = yield* Deferred.make<Exit.Exit<void, never>>()
    const entered: string[] = []
    yield* plugins.ensure(id, () =>
      Effect.gen(function* () {
        const owner = yield* Scope.Scope
        yield* Effect.gen(function* () {
          yield* Deferred.await(go)
          entered.push("background")
          const exit = yield* Effect.gen(function* () {
            yield* plugins.ensure(id, () => Effect.die("completed activation must not be replaced"))
            yield* plugins.wait(id)
          }).pipe(Effect.exit)
          yield* Deferred.succeed(done, exit)
        }).pipe(Effect.forkIn(owner))
      }),
    )
    yield* Deferred.succeed(go, undefined)
    const exit = yield* Deferred.await(done).pipe(
      Effect.timeoutOrElse({
        duration: "2 seconds",
        orElse: () => Effect.die("RETIRED_BACKGROUND_DEADLOCK"),
      }),
    )
    expect(entered).toEqual(["background"])
    expect(exit).toEqual(Exit.void)
  }),
)

it.live("retired ancestry in a captured outer-scope finalizer permits same-ID ensure and wait", () =>
  Effect.gen(function* () {
    const plugins = yield* PluginV2.Service
    const id = PluginV2.ID.make("retired-finalizer")
    const owner = yield* Effect.acquireRelease(Scope.make(), (scope) => Scope.close(scope, Exit.void))
    const completed: string[] = []
    yield* plugins.ensure(id, () =>
      Effect.addFinalizer(() =>
        Effect.gen(function* () {
          yield* plugins.ensure(id, () => Effect.die("captured finalizer must not replace an active plugin"))
          yield* plugins.wait(id)
          completed.push("finalizer")
        }),
      ).pipe(Scope.provide(owner)),
    )
    const exit = yield* Scope.close(owner, Exit.void).pipe(
      Effect.timeoutOrElse({ duration: "2 seconds", orElse: () => Effect.die("RETIRED_FINALIZER_DEADLOCK") }),
      Effect.exit,
    )
    expect(exit).toEqual(Exit.void)
    expect(completed).toEqual(["finalizer"])
  }),
)

it.effect(
  "activation, finalizer and rollback replay causes all reach the caller, pending waiter and failure cache",
  () =>
    Effect.gen(function* () {
      const plugins = yield* PluginV2.Service
      const agents = yield* AgentV2.Service
      const id = PluginV2.ID.make("combined-causes")
      const agentID = AgentV2.ID.make("combined-provisional")
      const faults = { replay: false }
      const replayFault = yield* agents.transform(() => (faults.replay ? Effect.die("rollback-replay") : Effect.void))
      const waiting = yield* registeredWaiter(plugins, id)
      const failed = yield* plugins
        .ensure(id, (ctx) =>
          Effect.gen(function* () {
            yield* ctx.agent.transform((draft) =>
              draft.update(agentID, (agent) => {
                agent.description = "provisional"
              }),
            )
            yield* Effect.addFinalizer(() => Effect.die("cleanup-finalizer"))
            faults.replay = true
            return yield* Effect.die("activation-primary")
          }),
        )
        .pipe(Effect.exit)
      faults.replay = false
      const pending = yield* Fiber.join(waiting)
      const cached = yield* plugins.wait(id).pipe(Effect.exit)
      ;[failed, pending, cached].forEach((exit) => {
        expect(Exit.isFailure(exit)).toBe(true)
        if (Exit.isFailure(exit)) {
          expect(exit.cause.reasons.filter(Cause.isDieReason).map((reason) => reason.defect)).toEqual([
            "activation-primary",
            "cleanup-finalizer",
            "rollback-replay",
          ])
        }
      })
      yield* replayFault.dispose
      expect(yield* agents.get(agentID)).toBeUndefined()
      yield* plugins.ensure(id, (ctx) =>
        ctx.agent
          .transform((draft) =>
            draft.update(agentID, (agent) => {
              agent.description = "healthy retry"
            }),
          )
          .pipe(Effect.asVoid),
      )
      expect((yield* agents.get(agentID))?.description).toBe("healthy retry")
    }),
)

it.live(
  "two independent activations with mutual nested installs fail named dependency policy instead of deadlocking",
  () =>
    Effect.gen(function* () {
      const plugins = yield* PluginV2.Service
      const a = PluginV2.ID.make("mutual-a")
      const b = PluginV2.ID.make("mutual-b")
      const aEntered = yield* Deferred.make<void>()
      const bEntered = yield* Deferred.make<void>()
      const go = yield* Deferred.make<void>()
      const finish = yield* Deferred.make<void>()
      const aAttempted = yield* Deferred.make<Exit.Exit<void, never>>()
      const bAttempted = yield* Deferred.make<Exit.Exit<void, never>>()
      const start = (
        id: PluginV2.ID,
        target: PluginV2.ID,
        entered: Deferred.Deferred<void>,
        attempted: Deferred.Deferred<Exit.Exit<void, never>>,
      ) =>
        plugins
          .ensure(id, () =>
            Effect.gen(function* () {
              yield* Deferred.succeed(entered, undefined)
              yield* Deferred.await(go)
              const exit = yield* plugins
                .ensure(target, () => Effect.die("nested busy target must not install"))
                .pipe(
                  Effect.timeoutOrElse({
                    duration: "2 seconds",
                    orElse: () => Effect.die("DEPENDENCY_POLICY_DEADLOCK"),
                  }),
                  Effect.exit,
                )
              yield* Deferred.succeed(attempted, exit)
              // Keep both activations live until both nested decisions have been observed.
              yield* Deferred.await(finish)
              return yield* exit
            }),
          )
          .pipe(Effect.exit, Effect.forkChild)
      const first = yield* start(a, b, aEntered, aAttempted)
      const second = yield* start(b, a, bEntered, bAttempted)
      yield* Deferred.await(aEntered)
      yield* Deferred.await(bEntered)
      yield* Deferred.succeed(go, undefined)
      const aNested = yield* Deferred.await(aAttempted)
      const bNested = yield* Deferred.await(bAttempted)
      yield* Deferred.succeed(finish, undefined)
      const aExit = yield* Fiber.join(first)
      const bExit = yield* Fiber.join(second)
      ;[
        { exit: aNested, target: b },
        { exit: aExit, target: b },
        { exit: bNested, target: a },
        { exit: bExit, target: a },
      ].forEach(({ exit, target }) => {
        expect(Exit.isFailure(exit)).toBe(true)
        if (Exit.isFailure(exit)) {
          expect(exit.cause.reasons.filter(Cause.isDieReason).map((reason) => reason.defect)).toEqual([
            `PLUGIN_DEPENDENCY_BLOCKED: ${target}`,
          ])
        }
      })
    }),
)

it.live("live nested ensure, wait and remove reject another in-flight target with the named dependency policy", () =>
  Effect.gen(function* () {
    const plugins = yield* PluginV2.Service
    yield* Effect.forEach(["ensure", "wait", "remove"] as const, (operation) =>
      Effect.gen(function* () {
        const target = PluginV2.ID.make(`busy-target-${operation}`)
        const caller = PluginV2.ID.make(`nested-caller-${operation}`)
        const entered = yield* Deferred.make<void>()
        const release = yield* Deferred.make<void>()
        const busy = yield* plugins
          .ensure(target, () =>
            Effect.gen(function* () {
              yield* Deferred.succeed(entered, undefined)
              yield* Deferred.await(release)
            }),
          )
          .pipe(Effect.exit, Effect.forkChild)
        yield* Deferred.await(entered)
        const rejected = yield* plugins
          .ensure(caller, () =>
            operation === "ensure"
              ? plugins.ensure(target, () => Effect.die("nested ensure must not replace target"))
              : plugins[operation](target),
          )
          .pipe(
            Effect.timeoutOrElse({ duration: "2 seconds", orElse: () => Effect.die("NESTED_TARGET_DEADLOCK") }),
            Effect.exit,
          )
        yield* Deferred.succeed(release, undefined)
        expect(yield* Fiber.join(busy)).toEqual(Exit.void)
        expect(Exit.isFailure(rejected)).toBe(true)
        if (Exit.isFailure(rejected))
          expect(rejected.cause.reasons.filter(Cause.isDieReason).map((reason) => reason.defect)).toEqual([
            `PLUGIN_DEPENDENCY_BLOCKED: ${target}`,
          ])
      }),
    )
  }),
)

it.effect("acyclic nested dependencies on an already active target remain available", () =>
  Effect.gen(function* () {
    const plugins = yield* PluginV2.Service
    const active = PluginV2.ID.make("already-active-target")
    const entered: string[] = []
    yield* plugins.ensure(active, () =>
      Effect.sync(() => {
        entered.push("target")
      }),
    )
    yield* plugins.ensure(PluginV2.ID.make("acyclic-caller"), () =>
      Effect.gen(function* () {
        yield* plugins.ensure(active, () => Effect.die("already-active target must not be replaced"))
        yield* plugins.wait(active)
        entered.push("caller")
      }),
    )
    expect(entered).toEqual(["target", "caller"])
  }),
)

it.effect(
  "populated parent State.batch retains pending registrations and accurate replay order across activation",
  () =>
    Effect.gen(function* () {
      const plugins = yield* PluginV2.Service
      const agents = yield* AgentV2.Service
      const agentID = AgentV2.ID.make("parent-batch-order")
      const replay: string[] = []
      yield* State.batch(
        Effect.gen(function* () {
          yield* agents.transform((draft) => {
            replay.push("parent-before")
            draft.update(agentID, (agent) => {
              agent.description = "parent-before"
            })
          })
          expect(yield* agents.get(agentID)).toBeUndefined()
          yield* plugins.ensure(PluginV2.ID.make("parent-batch-plugin"), (ctx) =>
            ctx.agent
              .transform((draft) => {
                replay.push("plugin")
                draft.update(agentID, (agent) => {
                  agent.description = "plugin"
                })
              })
              .pipe(Effect.asVoid),
          )
          expect(replay).toEqual(["parent-before", "plugin"])
          expect((yield* agents.get(agentID))?.description).toBe("plugin")
          yield* agents.transform((draft) => {
            replay.push("parent-after")
            draft.update(agentID, (agent) => {
              agent.description = "parent-after"
            })
          })
          expect((yield* agents.get(agentID))?.description).toBe("plugin")
        }),
      )
      // Plugin activation flushes immediately; the original parent queue still performs its own ordered replay.
      expect(replay).toEqual(["parent-before", "plugin", "parent-before", "plugin", "parent-after"])
      expect((yield* agents.get(agentID))?.description).toBe("parent-after")
    }),
)

const registeredWaiter = Effect.fn("PluginEnsureTest.registeredWaiter")(function* (
  plugins: PluginV2.Interface,
  id: PluginV2.ID,
) {
  // With an idle ID lock, immediate execution without scheduler yields reaches wait's Deferred suspension
  // only after the real waiter map entry exists. No test hook or assumed fork ordering is involved.
  const waiter = yield* plugins
    .wait(id)
    .pipe(
      Effect.exit,
      Effect.forkChild({ startImmediately: true }),
      Effect.provideService(Scheduler.PreventSchedulerYield, true),
    )
  expect(waiter.pollUnsafe()).toBeUndefined()
  return waiter
})
