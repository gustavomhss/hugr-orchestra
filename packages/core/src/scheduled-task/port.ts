export * as ScheduledTaskPort from "./port"

import { Context, Effect, Layer } from "effect"
import { makeGlobalNode } from "../effect/app-node"
import type { ScheduledTaskCapability } from "./capability"

// Capability tools reach the scheduler through this port so the Location graph never imports the
// Session graph (Session -> LocationServiceMap -> capability tools would close a type cycle). Location
// graphs hoist their own global nodes, so the running scheduler binds itself here for the process.
export class Service extends Context.Service<Service, ScheduledTaskCapability.Interface>()("@orchestra/v2/ScheduledTaskPort") {}

const state: { bound?: ScheduledTaskCapability.Interface } = {}

/** Called by the scheduler layer; the previous binding is restored when that layer's Scope closes. */
export const bind = (api: ScheduledTaskCapability.Interface) => Effect.acquireRelease(
  Effect.sync(() => {
    const previous = state.bound
    state.bound = api
    return previous
  }),
  (previous) => Effect.sync(() => {
    state.bound = previous
  }),
)

const current = Effect.suspend(() => state.bound ? Effect.succeed(state.bound) : Effect.die("schedule_manage requires the host scheduler"))
export const node = makeGlobalNode({
  service: Service,
  layer: Layer.succeed(Service, Service.of({
    create: (owner, input) => Effect.flatMap(current, (api) => api.create(owner, input)),
    list: (owner) => Effect.flatMap(current, (api) => api.list(owner)),
    get: (owner, id) => Effect.flatMap(current, (api) => api.get(owner, id)),
    update: (owner, id, input) => Effect.flatMap(current, (api) => api.update(owner, id, input)),
    pause: (owner, id) => Effect.flatMap(current, (api) => api.pause(owner, id)),
    resume: (owner, id) => Effect.flatMap(current, (api) => api.resume(owner, id)),
    remove: (owner, id) => Effect.flatMap(current, (api) => api.remove(owner, id)),
    run: (owner, id, key) => Effect.flatMap(current, (api) => api.run(owner, id, key)),
  })),
  deps: [],
})
