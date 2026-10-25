import { array, check, locationData, object } from "./assertions"
import { http, route } from "./dsl"
import { type Scenario } from "./types"

// MCP routes, split from index.ts so the route-coverage harness stays under the file size cap.
export const mcpScenarios: Scenario[] = [
  // V2 routes: the Location's MCP service.
  // A session command runs a configured command or an MCP prompt; an unknown name is refused before admission.
  http.protected
    .post("/api/session/{sessionID}/command", "v2.session.command.missing")
    .seeded((ctx) => ctx.session({ title: "Missing command owner" }))
    .at((ctx) => ({
      path: route("/api/session/{sessionID}/command", { sessionID: ctx.state.id }),
      headers: ctx.headers(),
      body: { command: "httpapi-missing" },
    }))
    .json(400, object, "status"),
  http.protected.get("/api/mcp", "v2.mcp.list").json(200, locationData(array)),
  http.protected.get("/api/mcp/resource", "v2.mcp.resource.catalog").json(200, locationData(object)),
  http.protected.get("/api/mcp/config", "v2.mcp.config").json(200, locationData(object)),
  http.protected.get("/api/mcp/entries", "v2.mcp.entries").json(200, locationData(object)),
  http.protected.get("/api/mcp/tools", "v2.mcp.tools").json(200, locationData(object)),
  http.protected
    .post("/api/mcp/{server}/auth", "v2.mcp.auth.start")
    .at((ctx) => ({ path: route("/api/mcp/{server}/auth", { server: "httpapi-missing" }), headers: ctx.headers() }))
    .json(404, object, "status"),
  http.protected
    .post("/api/mcp/{server}/auth/callback", "v2.mcp.auth.callback")
    .at((ctx) => ({
      path: route("/api/mcp/{server}/auth/callback", { server: "httpapi-missing" }),
      headers: ctx.headers(),
      body: { code: "code" },
    }))
    .json(404, object, "status"),
  http.protected
    .delete("/api/mcp/{server}/auth", "v2.mcp.auth.remove")
    .mutating()
    .at((ctx) => ({ path: route("/api/mcp/{server}/auth", { server: "httpapi-missing" }), headers: ctx.headers() }))
    .json(404, object, "status"),
  http.protected
    .put("/api/mcp/{server}", "v2.mcp.add")
    .mutating()
    .at((ctx) => ({
      path: route("/api/mcp/{server}", { server: "httpapi-disabled" }),
      headers: ctx.headers(),
      body: { config: { type: "local", command: ["bun", "--version"], disabled: true } },
    }))
    .status(204, undefined, "none"),
  http.protected
    .delete("/api/mcp/{server}", "v2.mcp.remove")
    .mutating()
    .at((ctx) => ({ path: route("/api/mcp/{server}", { server: "httpapi-missing" }), headers: ctx.headers() }))
    .json(404, object, "status"),
  http.protected
    .post("/api/mcp/{server}/connect", "v2.mcp.connect")
    .mutating()
    .at((ctx) => ({ path: route("/api/mcp/{server}/connect", { server: "httpapi-missing" }), headers: ctx.headers() }))
    .json(404, object, "status"),
  http.protected
    .post("/api/mcp/{server}/disconnect", "v2.mcp.disconnect")
    .mutating()
    .at((ctx) => ({
      path: route("/api/mcp/{server}/disconnect", { server: "httpapi-missing" }),
      headers: ctx.headers(),
    }))
    .json(404, object, "status"),
]
