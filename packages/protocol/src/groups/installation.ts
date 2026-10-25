import { Schema } from "effect"
import { HttpApiEndpoint, HttpApiGroup, OpenApi } from "effect/unstable/httpapi"
import { InvalidRequestError, UnknownError } from "../errors"

export const InstallationGroup = HttpApiGroup.make("server.installation").add(
  HttpApiEndpoint.post("installation.upgrade", "/api/installation/upgrade", {
    payload: Schema.Struct({ target: Schema.String }),
    success: Schema.Struct({ success: Schema.Literal(true), version: Schema.String }),
    error: [InvalidRequestError, UnknownError],
  }).annotateMerge(
    OpenApi.annotations({
      identifier: "v2.installation.upgrade",
      summary: "Upgrade Orchestra",
      description: "Install the given Orchestra release with the package manager that installed this server.",
    }),
  ),
)
