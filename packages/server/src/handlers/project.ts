import { Database } from "@orchestra/core/database/database"
import { EventV2 } from "@orchestra/core/event"
import { GitCli } from "@orchestra/core/git-cli"
import { Location } from "@orchestra/core/location"
import { ProjectV2 } from "@orchestra/core/project"
import { InvalidRequestError } from "@orchestra/protocol/errors"
import { Effect } from "effect"
import { HttpServerRequest } from "effect/unstable/http"
import { HttpApiBuilder } from "effect/unstable/httpapi"
import { Api } from "../api"
import { ref } from "../location"

export const ProjectHandler = HttpApiBuilder.group(Api, "server.project", (handlers) =>
  Effect.gen(function* () {
    const projects = yield* ProjectV2.Service
    const database = yield* Database.Service
    const events = yield* EventV2.Service
    const git = yield* GitCli.Service
    return handlers
      .handle("project.list", () => projects.list())
      .handle("project.directories", (ctx) => projects.directories({ projectID: ctx.params.projectID }))
      .handle(
        "project.update",
        Effect.fn(function* (ctx) {
          const updated = yield* ProjectV2.update(database.db, events, { projectID: ctx.params.projectID, ...ctx.payload })
          if (!updated)
            return yield* new InvalidRequestError({ message: `Project not found: ${ctx.params.projectID}`, field: "projectID" })
          return updated
        }),
      )
      // Served without the Location middleware: the folder has no project yet, and its services start once it has one.
      .handle(
        "project.initGit",
        Effect.fn(function* () {
          const location = ref(yield* HttpServerRequest.HttpServerRequest)
          const project = yield* ProjectV2.initGit({ db: database.db, events, git, projects }, location.directory)
          const resolved = yield* projects.resolve(location.directory)
          return {
            location: new Location.Info({
              directory: location.directory,
              workspaceID: location.workspaceID,
              project: { id: resolved.id, directory: resolved.directory },
            }),
            data: project ?? null,
          }
        }),
      )
  }),
)
