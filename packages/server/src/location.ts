import { stat } from "node:fs/promises"
import { Location } from "@orchestra/core/location"
import { LocationServiceMap } from "@orchestra/core/location-services"
import { AbsolutePath } from "@orchestra/core/schema"
import { WorkspaceV2 } from "@orchestra/core/workspace"
import { InvalidRequestError } from "@orchestra/protocol/errors"
import { Cause, Context, Effect, Layer } from "effect"
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
 * The Location's services, failing with a declared 400 when they cannot boot. A failed boot (most often a project whose
 * directory was removed) otherwise surfaces as an error no route declares, which the HttpApi answers as an empty 500 on
 * every route of that Location. Only booting is mapped: a Location already booted keeps serving from the map's cache,
 * so database-backed routes such as removing a session stay usable after its directory goes away.
 */
export function bootLocation<E, R>(services: Layer.Layer<LocationServices, E, R>, location: Location.Ref) {
  return services.pipe(Layer.catchCause((cause) => Layer.effectContext(bootFailure(cause, location))))
}

function bootFailure<E>(
  cause: Cause.Cause<E>,
  location: Location.Ref,
): Effect.Effect<Context.Context<LocationServices>, E | InvalidRequestError> {
  return Effect.gen(function* () {
    yield* Effect.logError("location services failed to boot", {
      directory: location.directory,
      cause: Cause.pretty(cause),
    })
    const missing = yield* Effect.promise(() =>
      stat(location.directory).then(
        (info) => !info.isDirectory(),
        (error: NodeJS.ErrnoException) => error.code === "ENOENT" || error.code === "ENOTDIR",
      ),
    )
    if (missing)
      return yield* new InvalidRequestError({
        message: `Directory not found: ${location.directory}`,
        kind: "location_not_found",
        field: "location.directory",
      })
    // A defect is a bug, not a bad request: it stays a 500, now logged above.
    if (!Cause.hasFails(cause)) return yield* Effect.failCause(cause)
    return yield* new InvalidRequestError({
      message: `Location could not start: ${location.directory}`,
      kind: "location_unavailable",
      field: "location.directory",
    })
  })
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
        const location = ref(request)
        return yield* effect.pipe(Effect.provide(bootLocation(locations.get(location), location)))
      }),
    )
  }),
)
