import { Database } from "@orchestra/core/database/database"
import { EventV2 } from "@orchestra/core/event"
import { Location } from "@orchestra/core/location"
import { ProjectV2 } from "@orchestra/core/project"
import { Effect } from "effect"
import { HttpApiBuilder } from "effect/unstable/httpapi"
import { Api } from "../api"

export const LocationHandler = HttpApiBuilder.group(Api, "server.location", (handlers) =>
  Effect.gen(function* () {
    const database = yield* Database.Service
    const events = yield* EventV2.Service
    return handlers.handle(
      "location.get",
      Effect.fn(function* () {
        const location = yield* Location.Service
        // Opening a directory makes its project known, with its repository, before any Session exists in it.
        yield* ProjectV2.record(database.db, events, {
          id: location.project.id,
          directory: location.project.directory,
          vcs: location.vcs,
        })
        return new Location.Info({
          directory: location.directory,
          workspaceID: location.workspaceID,
          project: location.project,
        })
      }),
    )
  }),
)
