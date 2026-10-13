import { Context, Effect, Layer, LayerMap, Scope } from "effect"
import { LayerNode } from "./effect/layer-node"
import { Node } from "./effect/app-node"
import { Location } from "./location"
import type { LocationError, LocationServices } from "./location-services"

export class Service extends Context.Service<
  Service,
  LayerMap.LayerMap<Location.Ref, LocationServices, LocationError>
>()("@orchestra/example/LocationServiceMap") {
  static get(ref: Location.Ref) {
    return Layer.unwrap(Effect.map(Service, (locations) => locations.get(ref)))
  }
}

export const node = LayerNode.unbound(Service, Node.tags.values.global)

/** Lazy acquisitions must see the completed application's exports, not a constructor's partial context. */
export function withGlobalContext(layer: Layer.Layer<Service>, globalContext: Effect.Effect<Context.Context<never>>) {
  return layer.pipe(
    Layer.flatMap((context) => {
      const locations = Context.get(context, Service)
      const contextEffect = (ref: Location.Ref) =>
        // Wait before entering the cache: early constructor forks must not retain a partial acquisition.
        globalContext.pipe(
          Effect.flatMap((globals) =>
            locations.contextEffect(ref).pipe(
              Effect.updateContext((current: Context.Context<Scope.Scope>) => Context.merge(current, globals)),
            ),
          ),
        )
      return Layer.succeed(Service, {
        ...locations,
        get: (ref) => Layer.effectContext(contextEffect(ref)),
        contextEffect,
      })
    }),
  )
}

export * as LocationServiceMap from "./location-service-map"
