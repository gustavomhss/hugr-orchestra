import { stat } from "node:fs/promises"
import { Location } from "@orchestra/core/location"
import { LocationServiceMap } from "@orchestra/core/location-services"
import { AbsolutePath } from "@orchestra/core/schema"
import { WorkspaceV2 } from "@orchestra/core/workspace"
import { InvalidRequestError } from "@orchestra/protocol/errors"
import { Effect, Layer } from "effect"
import { HttpServerRequest } from "effect/unstable/http"
import { HttpApiMiddleware } from "effect/unstable/httpapi"

export type LocationServices = Layer.Success<ReturnType<(typeof LocationServiceMap.Service)["get"]>>

export class LocationMiddleware extends HttpApiMiddleware.Service<LocationMiddleware, { provides: LocationServices }>()(
  "@orchestra/HttpApiLocation",
  { error: InvalidRequestError },
) {}

export function response<A, E, R>(data: Effect.Effect<A, E, R>) {
  return Effect.gen(function* () {
    const location = yield* Location.Service
    return {
      location: new Location.Info({
        directory: location.directory,
        workspaceID: location.workspaceID,
        project: location.project,
      }),
      data: yield* data,
    }
  })
}

/** The Location a request names: `location[...]` query, the legacy `directory` query or header, else the server cwd. */
export function ref(request: HttpServerRequest.HttpServerRequest) {
  const query = new URL(request.url, "http://localhost").searchParams
  // Legacy routes take a plain `directory` query; honor it when `location[directory]` is absent so v2 routes do not
  // silently fall back to the default Location. `location[directory]` wins: legacy SDK clients add `directory` to every request.
  const workspaceID = query.get("location[workspace]") || request.headers["x-orchestra-workspace"]
  const directory =
    query.get("location[directory]") ||
    query.get("directory") ||
    (request.headers["x-orchestra-directory"] ? decode(request.headers["x-orchestra-directory"]) : process.cwd())
  return Location.Ref.make({
    directory: AbsolutePath.make(directory),
    workspaceID: workspaceID ? WorkspaceV2.ID.make(workspaceID) : undefined,
  })
}

/**
 * A Location must name an existing directory. Booting its services on a missing one fails with an error no route
 * declares, which the HttpApi answers as an empty 500 on every route of a project whose directory was removed.
 */
export function requireDirectory(location: Location.Ref) {
  return Effect.promise(() =>
    stat(location.directory).then(
      (info) => info.isDirectory(),
      () => false,
    ),
  ).pipe(
    Effect.flatMap((exists) =>
      exists
        ? Effect.succeed(location)
        : Effect.fail(
            new InvalidRequestError({
              message: `Directory not found: ${location.directory}`,
              kind: "location_not_found",
              field: "location.directory",
            }),
          ),
    ),
  )
}

function decode(input: string) {
  try {
    return decodeURIComponent(input)
  } catch {
    return input
  }
}

export const layer = Layer.effect(
  LocationMiddleware,
  Effect.gen(function* () {
    const locations = yield* LocationServiceMap.Service
    return LocationMiddleware.of((effect) =>
      Effect.gen(function* () {
        const request = yield* HttpServerRequest.HttpServerRequest
        const location = yield* requireDirectory(ref(request))
        return yield* effect.pipe(Effect.provide(locations.get(location)))
      }),
    )
  }),
)
