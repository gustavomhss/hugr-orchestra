import { FileSystem } from "@orchestra/core/filesystem"
import { FSUtil } from "@orchestra/core/fs-util"
import { Location } from "@orchestra/core/location"
import { ProjectV2 } from "@orchestra/core/project"
import { RelativePath } from "@orchestra/core/schema"
import { Effect } from "effect"
import { HttpServerRequest, HttpServerResponse } from "effect/unstable/http"
import { HttpApiBuilder } from "effect/unstable/httpapi"
import { InvalidRequestError } from "@orchestra/protocol/errors"
import { Api } from "../api"
import { ref, response } from "../location"

// The declared 400 for a path fs.read cannot serve, so the client sees why instead of an empty 500.
const readFailure = {
  outside: { kind: "path_outside_location", message: "Path is outside the location" },
  missing: { kind: "file_not_found", message: "File not found" },
  "not-file": { kind: "not_a_file", message: "Not a file" },
  "too-large": { kind: "file_too_large", message: "File is too large to read" },
}

export const FileSystemHandler = HttpApiBuilder.group(Api, "server.fs", (handlers) =>
  Effect.gen(function* () {
    const fsUtil = yield* FSUtil.Service
    const projects = yield* ProjectV2.Service
    return handlers
      .handleRaw("fs.read", (ctx) =>
        Effect.gen(function* () {
          const fs = yield* FileSystem.Service
          const file = yield* fs.read({ path: RelativePath.make(ctx.query.path) }).pipe(
            Effect.mapError(
              (error) =>
                new InvalidRequestError({
                  message: `${readFailure[error.reason].message}: ${error.path}`,
                  kind: readFailure[error.reason].kind,
                  field: "path",
                }),
            ),
          )
          // The bytes are project content in whatever type the extension names. nosniff stops the browser from guessing
          // a more dangerous type, and the sandbox CSP keeps an HTML or SVG file opened directly from running scripts
          // with this server's origin.
          return HttpServerResponse.uint8Array(file.content, {
            contentType: file.mime,
            headers: { "x-content-type-options": "nosniff", "content-security-policy": "sandbox" },
          })
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
