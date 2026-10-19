import { Schema } from "effect"
import { HttpApiEndpoint, HttpApiGroup, HttpApiSchema, OpenApi } from "effect/unstable/httpapi"

export const ConfigPatch = Schema.Struct({
  model: Schema.optional(Schema.String),
  agents: Schema.optional(
    Schema.Record(Schema.String, Schema.Struct({ engine: Schema.optional(Schema.Literals(["orchestra", "claude-code"])) })),
  ),
}).annotate({ identifier: "ConfigPatch" })

export const ConfigGroup = HttpApiGroup.make("server.config")
  .add(
    HttpApiEndpoint.patch("config.update", "/api/config", {
      payload: ConfigPatch,
      success: HttpApiSchema.NoContent,
    }).annotateMerge(
      OpenApi.annotations({
        identifier: "v2.config.update",
        summary: "Update global settings",
        description:
          "Merge the default model and agent engines into the global config document, then reload the agents and catalog of every open location.",
      }),
    ),
  )
  .annotateMerge(OpenApi.annotations({ title: "config", description: "Global settings routes." }))
