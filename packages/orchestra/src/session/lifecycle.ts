export * as SessionLifecycle from "./lifecycle"

import { Context, Effect, Layer, type Scope } from "effect"
import { LayerNode } from "@orchestra/core/effect/layer-node"
import type { Session } from "./session"
import type { MessageID, SessionID } from "./schema"

type Owner = {
  remove: (sessionID: SessionID) => Effect.Effect<void>
  fork: (input: { source: Session.Info; messageID?: MessageID; ids: ReadonlyMap<string, MessageID> }) => Effect.Effect<Session.Info["metadata"]>
}

/** Optional execution owners, called before durable deletion or fork publication. No dependency on either loop. */
export class Service extends Context.Service<Service, {
  register: (owner: Owner) => Effect.Effect<void, never, Scope.Scope>
  remove: Owner["remove"]
  fork: Owner["fork"]
}>()("@orchestra/SessionLifecycle") {}

const layer = Layer.effect(Service, Effect.gen(function* () {
  const owners = new Set<Owner>()
  return Service.of({
    register: (owner) => Effect.acquireRelease(Effect.sync(() => { owners.add(owner) }), () => Effect.sync(() => { owners.delete(owner) })),
    remove: (sessionID) => Effect.forEach(owners, (owner) => owner.remove(sessionID), { discard: true }),
    fork: (input) => Effect.gen(function* () {
      const patches = yield* Effect.forEach(owners, (owner) => owner.fork(input))
      return patches.find((patch) => patch !== undefined) ?? structuredClone(input.source.metadata)
    }),
  })
}))

export const node = LayerNode.make({ service: Service, layer, deps: [] })
