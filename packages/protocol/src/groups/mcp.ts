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
  .annotateMerge(
    OpenApi.annotations({
      title: "mcp",
      description: "MCP server routes.",
    }),
  )
