import { stat } from "node:fs/promises"
import { Credential } from "@orchestra/core/credential"
import { Database } from "@orchestra/core/database/database"
import { Inbox } from "@orchestra/core/inbox"
import { Location } from "@orchestra/core/location"
import { LocationServiceMap } from "@orchestra/core/location-service-map"
import { AbsolutePath } from "@orchestra/core/schema"
import { WorkspaceV2 } from "@orchestra/core/workspace"
import { InvalidRequestError } from "@orchestra/protocol/errors"
import { Effect, Layer } from "effect"
import { HttpServerRequest } from "effect/unstable/http"
import { HttpApiMiddleware } from "effect/unstable/httpapi"
import { bootLocation } from "./location"

type InstallationServices = Inbox.Service | Inbox.HandoffService | Location.Service

export class InboxLocationMiddleware extends HttpApiMiddleware.Service<
  InboxLocationMiddleware,
  { provides: InstallationServices }
>()("@orchestra/HttpApiInboxLocation", { error: InvalidRequestError }) {}

/**
 * Inbox storage is the installation, not the open folder. A named directory that boots still projects that
 * project's Board. An empty directory (Home) or a directory that cannot boot lists stored rows and does not
 * hand off. Other routes keep failing closed through LocationMiddleware.
 */
export const layer = Layer.effect(
  InboxLocationMiddleware,
  Effect.gen(function* () {
    const locations = yield* LocationServiceMap.Service
    const database = yield* Database.Service
    const credentials = yield* Credential.Service
    const install = yield* Inbox.unmounted(database, credentials)
    return InboxLocationMiddleware.of((effect) =>
      Effect.gen(function* () {
        const request = yield* HttpServerRequest.HttpServerRequest
        const named = namedDirectory(request)
        if (!named || (yield* missingDirectory(named.directory))) return yield* effect.pipe(Effect.provide(install))
        return yield* effect.pipe(
          Effect.provide(bootLocation(locations.get(named), named)),
          Effect.catchTag("InvalidRequestError", (error) =>
            Effect.gen(function* () {
              if (error.kind !== "location_not_found" && error.kind !== "location_unavailable")
                return yield* Effect.fail(error)
              yield* Effect.logWarning("inbox serving installation store; location did not boot", {
                directory: named.directory,
                kind: error.kind,
              })
              return yield* effect.pipe(Effect.provide(install))
            }),
          ),
        )
      }),
    )
  }),
)

function missingDirectory(directory: string) {
  return Effect.promise(() =>
    stat(directory).then(
      (info) => !info.isDirectory(),
      (error: NodeJS.ErrnoException) => error.code === "ENOENT" || error.code === "ENOTDIR",
    ),
  )
}

function namedDirectory(request: HttpServerRequest.HttpServerRequest) {
  const query = new URL(request.url, "http://localhost").searchParams
  const directory = query.get("location[directory]")
  if (!directory) return undefined
  const workspaceID = query.get("location[workspace]") || request.headers["x-orchestra-workspace"]
  return Location.Ref.make({
    directory: AbsolutePath.make(directory),
    workspaceID: workspaceID ? WorkspaceV2.ID.make(workspaceID) : undefined,
  })
}
