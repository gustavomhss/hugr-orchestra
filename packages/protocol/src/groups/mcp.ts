import { ConfigMCP } from "@orchestra/schema/config-mcp"
import { Location } from "@orchestra/schema/location"
import { Mcp } from "@orchestra/schema/mcp"
import { Schema } from "effect"
import { HttpApiEndpoint, HttpApiGroup, HttpApiSchema, OpenApi } from "effect/unstable/httpapi"
import { InvalidRequestError, McpServerNotFoundError } from "../errors"
import { LocationQuery, locationQueryOpenApi } from "./location"

const ServerParams = { server: Schema.String }

export const McpGroup = HttpApiGroup.make("server.mcp")
  .add(
    HttpApiEndpoint.get("mcp.list", "/api/mcp", {
      query: LocationQuery,
      success: Location.response(Schema.Array(Mcp.Server)),
    })
      .annotateMerge(locationQueryOpenApi)
      .annotateMerge(
        OpenApi.annotations({
          identifier: "v2.mcp.list",
          summary: "List MCP servers",
          description: "List the Location's configured MCP servers and their connection state.",
        }),
      ),
  )
  .add(
    HttpApiEndpoint.get("mcp.resource.catalog", "/api/mcp/resource", {
      query: LocationQuery,
      success: Location.response(Mcp.ResourceCatalog),
    })
      .annotateMerge(locationQueryOpenApi)
      .annotateMerge(
        OpenApi.annotations({
          identifier: "v2.mcp.resource.catalog",
          summary: "List MCP resources",
          description: "List the resources and resource templates of the Location's connected MCP servers.",
        }),
      ),
  )
  .add(
    HttpApiEndpoint.get("mcp.config", "/api/mcp/config", {
      query: LocationQuery,
      success: Location.response(Schema.Record(Schema.String, Mcp.Entry)),
    })
      .annotateMerge(locationQueryOpenApi)
      .annotateMerge(
        OpenApi.annotations({
          identifier: "v2.mcp.config",
          summary: "Read resolved MCP config",
          description:
            "Read each configured MCP server's resolved transport and endpoint. Headers, environment and OAuth settings are never returned.",
        }),
      ),
  )
  .add(
    HttpApiEndpoint.get("mcp.entries", "/api/mcp/entries", {
      query: LocationQuery,
      success: Location.response(Schema.Record(Schema.String, Mcp.Entry)),
      error: InvalidRequestError,
    })
      .annotateMerge(locationQueryOpenApi)
      .annotateMerge(
        OpenApi.annotations({
          identifier: "v2.mcp.entries",
          summary: "Read MCP profile entries",
          description:
            "Read the MCP servers of the Location's own config files exactly as written, with `{env:...}` references unresolved.",
        }),
      ),
  )
  .add(
    HttpApiEndpoint.get("mcp.tools", "/api/mcp/tools", {
      query: LocationQuery,
      success: Location.response(Schema.Record(Schema.String, Schema.Array(Schema.String))),
    })
      .annotateMerge(locationQueryOpenApi)
      .annotateMerge(
        OpenApi.annotations({
          identifier: "v2.mcp.tools",
          summary: "List MCP tool names",
          description: "List the tool names of each connected MCP server that lists tools.",
        }),
      ),
  )
  .add(
    HttpApiEndpoint.put("mcp.add", "/api/mcp/:server", {
      params: ServerParams,
      query: LocationQuery,
      payload: Schema.Struct({ config: ConfigMCP.Server }),
      success: HttpApiSchema.NoContent,
      error: InvalidRequestError,
    })
      .annotateMerge(locationQueryOpenApi)
      .annotateMerge(
        OpenApi.annotations({
          identifier: "v2.mcp.add",
          summary: "Add MCP server",
          description: "Write an MCP server into the Location's own config file and connect it.",
        }),
      ),
  )
  .add(
    HttpApiEndpoint.delete("mcp.remove", "/api/mcp/:server", {
      params: ServerParams,
      query: LocationQuery,
      success: HttpApiSchema.NoContent,
      error: [McpServerNotFoundError, InvalidRequestError],
    })
      .annotateMerge(locationQueryOpenApi)
      .annotateMerge(
        OpenApi.annotations({
          identifier: "v2.mcp.remove",
          summary: "Remove MCP server",
          description: "Remove an MCP server from the Location's own config files and disconnect it.",
        }),
      ),
  )
  .add(
    HttpApiEndpoint.post("mcp.connect", "/api/mcp/:server/connect", {
      params: ServerParams,
      query: LocationQuery,
      success: HttpApiSchema.NoContent,
      error: McpServerNotFoundError,
    })
      .annotateMerge(locationQueryOpenApi)
      .annotateMerge(
        OpenApi.annotations({
          identifier: "v2.mcp.connect",
          summary: "Connect MCP server",
          description: "Connect, or reconnect, one configured MCP server.",
        }),
      ),
  )
  .add(
    HttpApiEndpoint.post("mcp.disconnect", "/api/mcp/:server/disconnect", {
      params: ServerParams,
      query: LocationQuery,
      success: HttpApiSchema.NoContent,
      error: McpServerNotFoundError,
    })
      .annotateMerge(locationQueryOpenApi)
      .annotateMerge(
        OpenApi.annotations({
          identifier: "v2.mcp.disconnect",
          summary: "Disconnect MCP server",
          description: "Disconnect one configured MCP server and remove its tools.",
        }),
      ),
  )
  .add(
    HttpApiEndpoint.get("mcp.debug", "/api/mcp/:server/debug", {
      params: ServerParams,
      query: LocationQuery,
      success: Location.response(Mcp.Debug),
      error: [McpServerNotFoundError, InvalidRequestError],
    })
      .annotateMerge(locationQueryOpenApi)
      .annotateMerge(
        OpenApi.annotations({
          identifier: "v2.mcp.debug",
          summary: "Debug MCP server",
          description:
            "Probe a remote MCP server with an unauthenticated initialize request and report stored sign-in state, the HTTP answer and the OAuth discovery result. Secrets are masked.",
        }),
      ),
  )
  .add(
    HttpApiEndpoint.post("mcp.auth.start", "/api/mcp/:server/auth", {
      params: ServerParams,
      query: LocationQuery,
      success: Mcp.AuthStart,
      error: [McpServerNotFoundError, InvalidRequestError],
    })
      .annotateMerge(locationQueryOpenApi)
      .annotateMerge(
        OpenApi.annotations({
          identifier: "v2.mcp.auth.start",
          summary: "Start MCP OAuth",
          description:
            "Start an OAuth sign-in for a remote MCP server and return the authorization URL to open. The local callback completes the sign-in and reconnects the server; an empty URL means it was already authorized.",
        }),
      ),
  )
  .add(
    HttpApiEndpoint.post("mcp.auth.callback", "/api/mcp/:server/auth/callback", {
      params: ServerParams,
      query: LocationQuery,
      payload: Schema.Struct({ code: Schema.String }),
      success: Mcp.Status,
      error: [McpServerNotFoundError, InvalidRequestError],
    })
      .annotateMerge(locationQueryOpenApi)
      .annotateMerge(
        OpenApi.annotations({
          identifier: "v2.mcp.auth.callback",
          summary: "Complete MCP OAuth",
          description: "Complete a started OAuth sign-in with its authorization code and reconnect the server.",
        }),
      ),
  )
  .add(
    HttpApiEndpoint.delete("mcp.auth.remove", "/api/mcp/:server/auth", {
      params: ServerParams,
      query: LocationQuery,
      success: HttpApiSchema.NoContent,
      error: McpServerNotFoundError,
    })
      .annotateMerge(locationQueryOpenApi)
      .annotateMerge(
        OpenApi.annotations({
          identifier: "v2.mcp.auth.remove",
          summary: "Remove MCP OAuth",
          description: "Forget an MCP server's stored OAuth credentials and cancel a sign-in in progress.",
        }),
      ),
  )
  .annotateMerge(
    OpenApi.annotations({
      title: "mcp",
      description: "MCP server routes.",
    }),
  )
