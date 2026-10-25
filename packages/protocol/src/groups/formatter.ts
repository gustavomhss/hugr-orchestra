import { Formatter } from "@orchestra/schema"
import { Location } from "@orchestra/schema/location"
import { Schema } from "effect"
import { HttpApiEndpoint, HttpApiGroup, OpenApi } from "effect/unstable/httpapi"
import { LocationQuery, locationQueryOpenApi } from "./location"

export const FormatterGroup = HttpApiGroup.make("server.formatter")
  .add(
    HttpApiEndpoint.get("formatter.status", "/api/formatter", {
      query: LocationQuery,
      success: Location.response(Schema.Array(Formatter.Status)),
    })
      .annotateMerge(locationQueryOpenApi)
      .annotateMerge(
        OpenApi.annotations({
          identifier: "v2.formatter.status",
          summary: "Formatter status",
          description: "List the Location's configured formatters and whether each one is available.",
        }),
      ),
  )
  .annotateMerge(
    OpenApi.annotations({
      title: "formatter",
      description: "Formatter routes.",
    }),
  )
