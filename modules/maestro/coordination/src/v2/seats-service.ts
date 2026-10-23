export * as MaestroSeats from "./seats-service"

import { Effect, Layer, Context } from "effect"
import { makeLocationNode } from "@orchestra/core/effect/app-node"
import { Seats } from "../seats"

export interface Interface {
  readonly ids: () => Effect.Effect<ReadonlySet<string>>
}

export class Service extends Context.Service<Service, Interface>()("@orchestra/maestro/v2/Seats") {}

const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const loaded = yield* Effect.tryPromise(() => import("../roster")).pipe(Effect.option)
    const ids =
      loaded._tag === "None"
        ? new Set<string>()
        : new Set(
            loaded.value.roster
              .filter((member: { memberId: string }) => Seats.all[member.memberId] !== undefined)
              .map((member: { memberId: string }) => member.memberId),
          )
    return Service.of({ ids: () => Effect.succeed(ids) })
  }),
)

export const node = makeLocationNode({ name: "maestro/seats-service", layer, deps: [] })
