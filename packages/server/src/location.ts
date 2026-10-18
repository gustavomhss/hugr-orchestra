import { Location } from "@orchestra/core/location"
import { LocationServiceMap } from "@orchestra/core/location-services"
import { AbsolutePath } from "@orchestra/core/schema"
import { WorkspaceV2 } from "@orchestra/core/workspace"
import { Effect, Layer } from "effect"
import { HttpServerRequest } from "effect/unstable/http"
import { HttpApiMiddleware } from "effect/unstable/httpapi"
import { InvalidRequestError } from "@orchestra/protocol/errors"

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

function ref(request: HttpServerRequest.HttpServerRequest) {
  const query = new URL(request.url, "http://localhost").searchParams
  const nested = query.get("location[directory]") || undefined
  // Legacy routes take a plain `directory` query; honor it here so v2 routes do not silently fall back to the default Location.
  const plain = query.get("directory") || undefined
  if (nested && plain && nested !== plain)
    return new InvalidRequestError({
      message: "Conflicting directory and location[directory] queries",
      field: "directory",
    })
  const workspaceID = query.get("location[workspace]") || request.headers["x-orchestra-workspace"]
  const directory =
    nested ??
    plain ??
    (request.headers["x-orchestra-directory"] ? decode(request.headers["x-orchestra-directory"]) : process.cwd())
  return Location.Ref.make({
    directory: AbsolutePath.make(directory),
    workspaceID: workspaceID ? WorkspaceV2.ID.make(workspaceID) : undefined,
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
        if (location instanceof InvalidRequestError) return yield* location
        return yield* effect.pipe(Effect.provide(locations.get(location)))
      }),
    )
  }),
)
