export * as SystemContextRegistry from "./registry"

import { Context, Effect, Layer, Ref, Scope } from "effect"
import { SystemContext } from "./index"
import { makeLocationNode } from "../effect/app-node"

export interface Entry {
  readonly key: SystemContext.Key
  readonly load: Effect.Effect<SystemContext.SystemContext>
}

export interface Interface {
  readonly register: (entry: Entry) => Effect.Effect<void, never, Scope.Scope>
  /** Loads every entry; a provider turn passes its Session and agent, which entries read through `Turn`. */
  readonly load: (turn?: TurnInfo) => Effect.Effect<SystemContext.SystemContext>
}

export interface TurnInfo {
  readonly sessionID: string
  readonly agent: string
}

/**
 * The Session and agent whose provider turn is loading system context, or undefined outside a turn. It is set only while
 * entries load, so a per-agent or per-Session entry reads it in its `load` and closes its sources over the value.
 */
export const Turn = Context.Reference<TurnInfo | undefined>("@orchestra/v2/SystemContextRegistry/Turn", {
  defaultValue: () => undefined,
})

export class Service extends Context.Service<Service, Interface>()("@orchestra/v2/SystemContextRegistry") {}

const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const entries = yield* Ref.make<ReadonlyArray<Entry>>([])

    return Service.of({
      register: Effect.fn("SystemContextRegistry.register")(function* (entry) {
        yield* Effect.acquireRelease(
          Ref.modify(entries, (current) => {
            if (current.some((item) => item.key === entry.key)) return [false, current]
            return [true, [...current, entry]]
          }).pipe(
            Effect.flatMap((added) =>
              added ? Effect.void : Effect.die(`Duplicate system context entry key: ${entry.key}`),
            ),
            Effect.as(entry),
          ),
          (entry) => Ref.update(entries, (current) => current.filter((item) => item !== entry)),
        )
      }),
      load: Effect.fn("SystemContextRegistry.load")(function* (turn) {
        const current = (yield* Ref.get(entries)).toSorted((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0))
        return SystemContext.combine(
          yield* Effect.forEach(current, (entry) => entry.load, { concurrency: "unbounded" }).pipe(
            Effect.provideService(Turn, turn),
          ),
        )
      }),
    })
  }),
)

export const node = makeLocationNode({ service: Service, layer, deps: [] })
