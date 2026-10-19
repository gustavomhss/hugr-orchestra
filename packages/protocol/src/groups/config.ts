import { Schema } from "effect"
import { HttpApiEndpoint, HttpApiGroup, HttpApiSchema, OpenApi } from "effect/unstable/httpapi"

export const ConfigPatch = Schema.Struct({
  model: Schema.optional(Schema.String),
  agents: Schema.optional(
    Schema.Record(Schema.String, Schema.Struct({ engine: Schema.optional(Schema.Literals(["orchestra", "claude-code"])) })),
  ),
  disabledProviders: Schema.optional(Schema.Array(Schema.String)).annotate({
    description: "The whole list of disabled providers, stored as `provider.use` deny policies. Replaces the previous list.",
  }),
}).annotate({ identifier: "ConfigPatch" })

export const ConfigSettings = Schema.Struct({
  model: Schema.optional(Schema.String),
  disabledProviders: Schema.Array(Schema.String),
}).annotate({ identifier: "ConfigSettings" })

export const ConfigGroup = HttpApiGroup.make("server.config")
  .add(
    HttpApiEndpoint.get("config.get", "/api/config", {
      success: ConfigSettings,
    }).annotateMerge(
      OpenApi.annotations({
        identifier: "v2.config.get",
        summary: "Read global settings",
        description: "Read the default model and disabled providers from the global config document.",
      }),
    ),
  )
  .add(
    HttpApiEndpoint.patch("config.update", "/api/config", {
      payload: ConfigPatch,
      success: HttpApiSchema.NoContent,
    }).annotateMerge(
      OpenApi.annotations({
        identifier: "v2.config.update",
        summary: "Update global settings",
        description:
          "Merge the default model, agent engines and disabled providers into the global config document, then reload the agents and catalog of every open location.",
      }),
    ),
  )
  .annotateMerge(OpenApi.annotations({ title: "config", description: "Global settings routes." }))
