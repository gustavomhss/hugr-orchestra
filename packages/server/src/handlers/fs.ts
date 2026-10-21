import { FileSystem } from "@orchestra/core/filesystem"
import { FSUtil } from "@orchestra/core/fs-util"
import { Location } from "@orchestra/core/location"
import { ProjectV2 } from "@orchestra/core/project"
import { RelativePath } from "@orchestra/core/schema"
import { Effect } from "effect"
import { HttpServerRequest, HttpServerResponse } from "effect/unstable/http"
import { HttpApiBuilder } from "effect/unstable/httpapi"
import { Api } from "../api"
import { ref, response } from "../location"

export const FileSystemHandler = HttpApiBuilder.group(Api, "server.fs", (handlers) =>
  Effect.gen(function* () {
    const fsUtil = yield* FSUtil.Service
    const projects = yield* ProjectV2.Service
    return handlers
      .handleRaw("fs.read", (ctx) =>
        Effect.gen(function* () {
          const file = yield* (yield* FileSystem.Service).read({
            path: RelativePath.make(ctx.query.path),
          })
          return HttpServerResponse.uint8Array(file.content, { contentType: file.mime })
        }),
      )
      .handle("fs.list", (ctx) =>
        Effect.gen(function* () {
          const location = ref(yield* HttpServerRequest.HttpServerRequest)
          const project = yield* projects.resolve(location.directory)
          return {
            location: new Location.Info({
              directory: location.directory,
              workspaceID: location.workspaceID,
              project: { id: project.id, directory: project.directory },
            }),
            data: yield* FileSystem.list(fsUtil, location.directory, { path: ctx.query.path }),
          }
        }),
      )
      .handle("fs.find", (ctx) =>
        response(
          Effect.gen(function* () {
            const fs = yield* FileSystem.Service
            // The API declares no search error; ripgrep's reason (missing, still downloading) reaches the server log.
            return yield* fs.find(ctx.query).pipe(Effect.orDie)
          }),
        ),
      )
  }),
)
