import { Lsp } from "@orchestra/schema"
import { Location } from "@orchestra/schema/location"
import { Schema } from "effect"
import { HttpApiEndpoint, HttpApiGroup, OpenApi } from "effect/unstable/httpapi"
import { LocationQuery, locationQueryOpenApi } from "./location"

export const LspGroup = HttpApiGroup.make("server.lsp")
  .add(
    HttpApiEndpoint.get("lsp.status", "/api/lsp", {
      query: LocationQuery,
      success: Location.response(Schema.Array(Lsp.Status)),
    })
      .annotateMerge(locationQueryOpenApi)
      .annotateMerge(
        OpenApi.annotations({
          identifier: "v2.lsp.status",
          summary: "LSP status",
          description: "List the Location's connected language servers and their status.",
        }),
      ),
  )
  .annotateMerge(
    OpenApi.annotations({
      title: "lsp",
      description: "LSP routes.",
    }),
  )
