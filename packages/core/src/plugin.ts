export * as PluginV2 from "./plugin"

import { makeLocationNode } from "./effect/app-node"
import { Cause, Context, Deferred, Effect, Exit, Layer, Scope } from "effect"
import type { Plugin as PluginRuntime } from "@orchestra/plugin/v2/effect"
import { Plugin } from "@orchestra/schema/plugin"
import { AgentV2 } from "./agent"
import { AISDK } from "./aisdk"
import { Catalog } from "./catalog"
import { CommandV2 } from "./command"
import { EventV2 } from "./event"
import { Integration } from "./integration"
import { KeyedMutex } from "./effect/keyed-mutex"
import { PluginHost } from "./plugin/host"
import { Reference } from "./reference"
import { SkillV2 } from "./skill"
import { State } from "./state"

export const ID = Plugin.ID
export type ID = typeof ID.Type
export const Event = Plugin.Event

/**
 * Live activations fail fast on another in-flight activation target with PLUGIN_DEPENDENCY_BLOCKED.
 * Independent callers queue; retired ancestry is ignored. Own live ancestry retains the load-cycle failure.
 * This is a conservative dependency policy, not a general wait-for graph or cycle proof.
 */
export interface Interface {
  readonly add: (id: ID, effect: PluginRuntime["effect"]) => Effect.Effect<void>
  /** Install once for this Location lifetime, preserving active plugin scope and transform order. */
  readonly ensure: (id: ID, effect: PluginRuntime["effect"]) => Effect.Effect<void>
  readonly remove: (id: ID) => Effect.Effect<void>
  readonly wait: (id: ID) => Effect.Effect<void>
}

export class Service extends Context.Service<Service, Interface>()("@orchestra/v2/Plugin") {}

const LoadingAncestry = Context.Reference<readonly { readonly scope: Scope.Scope; readonly id: ID; live: boolean }[]>(
  "@orchestra/Plugin/LoadingAncestry",
  { defaultValue: () => [] },
)

// Reuse State.batch's fiber-local queue protocol. Activation owns its queue even inside an enclosing batch,
// and retains it for rollback when the effect or a later materialization fails. Earlier parent registrations
// may replay during this flush and again in the parent flush; this does not provide outer-batch atomicity.
const StateBatch = Context.Reference<Set<State.Reload> | undefined>("@orchestra/State/CurrentBatch", {
  defaultValue: () => undefined,
})

const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const events = yield* EventV2.Service
    const locks = KeyedMutex.makeUnsafe<ID>()
    const scope = yield* Scope.make()
    const active = new Map<ID, Scope.Closeable>()
    const loading = new Set<ID>()
    const waiters = new Map<ID, Set<Deferred.Deferred<void>>>()
    const failures = new Map<ID, Exit.Exit<void, never>>()
    let host: Parameters<PluginRuntime["effect"]>[0]

    const checkAccess = Effect.fnUntraced(function* (id: ID, operation: "install" | "wait" | "remove") {
      const ancestry = (yield* LoadingAncestry).filter((entry) => entry.live)
      if (ancestry.some((entry) => entry.scope === scope && entry.id === id))
        return yield* Effect.die(
          operation === "remove"
            ? `Cannot remove plugin ${id} while it is loading`
            : `Plugin load cycle detected for ${id}`,
        )
      if (ancestry.length > 0 && loading.has(id)) return yield* Effect.die(`PLUGIN_DEPENDENCY_BLOCKED: ${id}`)
      return ancestry
    })

    const flush = (reloads: Set<State.Reload>) =>
      Effect.forEach(reloads, (reload) => reload(), { discard: true }).pipe(
        Effect.provideService(StateBatch, undefined),
      )

    const closeAndReplay = Effect.fn("Plugin.closeAndReplay")(function* (
      child: Scope.Closeable,
      primary: Exit.Exit<void, never>,
      reloads: Set<State.Reload>,
    ) {
      const closed = yield* Scope.close(child, primary).pipe(Effect.exit)
      const replayed = yield* flush(reloads).pipe(Effect.exit)
      const cause = [primary, closed, replayed].reduce(
        (cause, exit) => (Exit.isFailure(exit) ? Cause.combine(cause, exit.cause) : cause),
        Cause.empty,
      )
      return cause.reasons.length === 0 ? Exit.void : Exit.failCause(cause)
    })

    const install = Effect.fnUntraced(function* (id: ID, effect: PluginRuntime["effect"], retain: boolean) {
      const ancestry = yield* checkAccess(id, "install")

      yield* locks.withLock(id)(
        Effect.gen(function* () {
          if (retain && active.has(id)) return
          const child = yield* Scope.fork(scope)
          const reloads = new Set<State.Reload>()
          const token = { scope, id, live: true }
          loading.add(id)
          failures.delete(id)
          const activate = Effect.gen(function* () {
            const existing = active.get(id)
            active.delete(id)
            if (existing) yield* Scope.close(existing, Exit.void)
            yield* effect(host).pipe(
              Scope.provide(child),
              Effect.withSpan("Plugin.load", { attributes: { "plugin.id": id } }),
            )
            yield* flush(reloads).pipe(Scope.provide(child))
            yield* Effect.uninterruptible(
              Effect.gen(function* () {
                yield* events.publish(Event.Added, { id })
                active.set(id, child)
                yield* Effect.forEach(waiters.get(id) ?? [], (waiter) => Deferred.succeed(waiter, undefined), {
                  discard: true,
                })
                waiters.delete(id)
              }),
            ).pipe(Effect.provideService(StateBatch, undefined))
          })
          yield* Effect.uninterruptibleMask((restore) =>
            Effect.gen(function* () {
              const primary = yield* restore(activate).pipe(Effect.exit)
              if (Exit.isSuccess(primary)) return
              active.delete(id)
              const combined = yield* closeAndReplay(child, primary, reloads)
              failures.set(id, combined)
              yield* Effect.forEach(waiters.get(id) ?? [], (waiter) => Deferred.done(waiter, combined), {
                discard: true,
              }).pipe(Effect.ensuring(Effect.sync(() => waiters.delete(id))))
              return yield* combined
            }),
          ).pipe(
            Effect.provideService(StateBatch, reloads),
            Effect.provideService(LoadingAncestry, [...ancestry, token]),
            Effect.ensuring(
              Effect.sync(() => {
                token.live = false
                loading.delete(id)
              }),
            ),
          )
        }),
      )
    })

    const remove = Effect.fn("Plugin.remove")(function* (id: ID) {
      yield* checkAccess(id, "remove")

      yield* locks.withLock(id)(
        Effect.uninterruptible(
          Effect.gen(function* () {
            const current = active.get(id)
            active.delete(id)
            failures.delete(id)
            if (!current) return
            const reloads = new Set<State.Reload>()
            const combined = yield* closeAndReplay(current, Exit.void, reloads).pipe(
              Effect.provideService(StateBatch, reloads),
            )
            return yield* combined
          }),
        ),
      )
    })

    const wait = Effect.fn("Plugin.wait")(function* (id: ID) {
      yield* checkAccess(id, "wait")
      const waiter = yield* Deferred.make<void>()
      const pending = yield* locks.withLock(id)(
        Effect.sync(() => {
          if (active.has(id)) return false
          const failure = failures.get(id)
          if (failure) return failure
          const current = waiters.get(id) ?? new Set()
          current.add(waiter)
          waiters.set(id, current)
          return true
        }),
      )
      if (!pending) return
      if (typeof pending !== "boolean") return yield* pending
      yield* Deferred.await(waiter).pipe(
        Effect.ensuring(
          locks.withLock(id)(
            Effect.sync(() => {
              const current = waiters.get(id)
              current?.delete(waiter)
              if (current?.size === 0) waiters.delete(id)
            }),
          ),
        ),
      )
    })

    yield* Effect.addFinalizer((exit) =>
      Effect.gen(function* () {
        active.clear()
        yield* State.batch(Scope.close(scope, exit))
      }),
    )

    const service = Service.of({
      add: Effect.fn("Plugin.add")((id, effect) => install(id, effect, false)),
      ensure: Effect.fn("Plugin.ensure")((id, effect) => install(id, effect, true)),
      remove,
      wait,
    })
    host = yield* PluginHost.make(service)
    return service
  }),
)

export const locationLayer = layer.pipe(
  Layer.provideMerge(AgentV2.locationLayer),
  Layer.provideMerge(AISDK.locationLayer),
  Layer.provideMerge(Catalog.locationLayer),
  Layer.provideMerge(CommandV2.locationLayer),
  Layer.provideMerge(Integration.locationLayer),
  Layer.provideMerge(Reference.locationLayer),
)

export const node = makeLocationNode({
  service: Service,
  layer,
  deps: [
    EventV2.node,
    AgentV2.node,
    AISDK.node,
    Catalog.node,
    CommandV2.node,
    Integration.node,
    Reference.node,
    SkillV2.node,
  ],
})
