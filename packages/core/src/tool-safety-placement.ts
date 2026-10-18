export * as ToolSafetyPlacement from "./tool-safety-placement"

import { Context, Effect, Exit, Layer, Option, Scope } from "effect"
import type { Location } from "./location"
import type { LocationServiceMap } from "./location-service-map"
import { AbsolutePath } from "./schema"

/**
 * Where a V1 host's hook decisions belong (ToolSafetyHooks.Placement): the Session's Location, whose Relay service is
 * opened in `scope` only once an enabled hook is in play, for its checks and receipts. The V1 prompt host and the
 * Claude-mode gate share it, so it lives outside both modes.
 */
export function make(
  locations: Context.Service.Shape<typeof LocationServiceMap.Service> | undefined,
  session: { readonly directory: string; readonly workspaceID?: Location.Ref["workspaceID"] },
  scope: Scope.Scope,
) {
  const location = {
    directory: AbsolutePath.make(session.directory),
    ...(session.workspaceID ? { workspaceID: session.workspaceID } : {}),
  }
  return {
    location,
    relay: Effect.gen(function* () {
      if (!locations) return undefined
      const { Relay } = yield* Effect.promise(() => import("./relay"))
      const services = yield* Layer.buildWithScope(locations.get(location), scope).pipe(Effect.exit)
      if (Exit.isFailure(services)) return undefined
      return Option.getOrUndefined(Context.getOption(services.value, Relay.Service))
    }),
  }
}
