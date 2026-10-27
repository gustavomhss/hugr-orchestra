import { Schema } from "effect"
import { HttpApiEndpoint, HttpApiGroup, HttpApiSchema, OpenApi } from "effect/unstable/httpapi"
import { InvalidRequestError } from "../errors"

const DirectoryPayload = Schema.Struct({ directory: Schema.String })

// Trust is a user decision stored in the global config, so these routes are not scoped to a Location.
export const TrustGroup = HttpApiGroup.make("server.trust")
  .add(
    HttpApiEndpoint.get("trust.list", "/api/trust", {
      success: Schema.Array(Schema.String),
    }).annotateMerge(
      OpenApi.annotations({
        identifier: "v2.trust.list",
        summary: "List trusted projects",
        description:
          "List the project folders the global config approves to run their own MCP servers, plugins, formatters and LSP commands.",
      }),
    ),
  )
  .add(
    HttpApiEndpoint.post("trust.approve", "/api/trust/approve", {
      payload: DirectoryPayload,
      success: HttpApiSchema.NoContent,
      error: InvalidRequestError,
    }).annotateMerge(
      OpenApi.annotations({
        identifier: "v2.trust.approve",
        summary: "Trust project",
        description:
          "Store an existing absolute project folder, resolved to its real path, in the global config's trusted_projects, then start its blocked MCP servers. Approving a folder that is already trusted changes nothing.",
      }),
    ),
  )
  .add(
    HttpApiEndpoint.post("trust.revoke", "/api/trust/revoke", {
      payload: DirectoryPayload,
      success: HttpApiSchema.NoContent,
    }).annotateMerge(
      OpenApi.annotations({
        identifier: "v2.trust.revoke",
        summary: "Revoke project trust",
        description:
          "Remove a folder's own entry from the global config's trusted_projects, then stop its running local MCP servers. A folder trusted only through a parent folder stays trusted.",
      }),
    ),
  )
  .annotateMerge(OpenApi.annotations({ title: "trust", description: "Project trust routes." }))
