export * as MaestroSeats from "./seats-service"

import { Context, Effect, Layer } from "effect"
import { makeLocationNode } from "@orchestra/core/effect/app-node"
import { Seats } from "../seats"

export interface Interface {
  /** The agent ids this Location projects as native seats, in roster order. */
  readonly ids: readonly string[]
  readonly has: (id: string) => boolean
}

export class Service extends Context.Service<Service, Interface>()("@orchestra/maestro/v2/MaestroSeats") {}

export function make(ids: readonly string[]) {
  const set = new Set(ids)
  return Service.of({ ids: Object.freeze([...ids]), has: (id) => set.has(id) })
}

/**
 * Which agents are native seats, so seat-only tools can gate themselves on the seat rather than on an agent that merely
 * reuses its id. The roster loads lazily (see `v2/seats.ts`): where it cannot load, no agent is a seat.
 */
const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const loaded = yield* Effect.tryPromise(() => import("../roster")).pipe(Effect.option)
    if (loaded._tag === "None") {
      yield* Effect.logWarning("native seats unavailable: the seat roster could not load")
      return make([])
    }
    return make(
      loaded.value.roster
        .filter((member) => member.nativeProfile !== undefined && Seats.all[member.memberId] !== undefined)
        .map((member) => member.memberId),
    )
  }),
)

export const node = makeLocationNode({ service: Service, layer, deps: [] })
