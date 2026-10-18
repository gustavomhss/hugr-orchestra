import { check, object } from "./assertions"
import { http, route } from "./dsl"
import { type Scenario } from "./types"

// MCP routes, split from index.ts so the route-coverage harness stays under the file size cap.
export const mcpScenarios: Scenario[] = [
  http.protected.get("/mcp", "mcp.status").json(),
  http.protected
    .post("/mcp", "mcp.add")
    .mutating()
    .at((ctx) => ({
      path: "/mcp",
      headers: ctx.headers(),
      body: { name: "httpapi-disabled", config: { type: "local", command: ["bun", "--version"], enabled: false } },
    }))
    .json(
      200,
      (body) => {
        object(body)
        object(body["httpapi-disabled"])
        check(body["httpapi-disabled"].status === "disabled", "disabled MCP server should be added without spawning")
      },
      "status",
    ),
  http.protected
    .post("/mcp", "mcp.add.invalid")
    .at((ctx) => ({
      path: "/mcp",
      headers: ctx.headers(),
      body: { name: "httpapi-invalid", config: { type: "invalid" } },
    }))
    .status(400),
  http.protected
    .post("/mcp/{name}/auth", "mcp.auth.start")
    .at((ctx) => ({ path: route("/mcp/{name}/auth", { name: "httpapi-missing" }), headers: ctx.headers() }))
    .json(404, object, "status"),
  http.protected
    .delete("/mcp/{name}/auth", "mcp.auth.remove")
    .mutating()
    .at((ctx) => ({ path: route("/mcp/{name}/auth", { name: "httpapi-missing" }), headers: ctx.headers() }))
    .json(404, object, "status"),
  http.protected
    .post("/mcp/{name}/auth/authenticate", "mcp.auth.authenticate")
    .at((ctx) => ({
      path: route("/mcp/{name}/auth/authenticate", { name: "httpapi-missing" }),
      headers: ctx.headers(),
    }))
    .json(404, object, "status"),
  http.protected
    .post("/mcp/{name}/auth/callback", "mcp.auth.callback")
    .at((ctx) => ({
      path: route("/mcp/{name}/auth/callback", { name: "httpapi-missing" }),
      headers: ctx.headers(),
      body: { code: "code" },
    }))
    .json(404, object, "status"),
  http.protected
    .post("/mcp/{name}/connect", "mcp.connect")
    .mutating()
    .at((ctx) => ({ path: route("/mcp/{name}/connect", { name: "httpapi-missing" }), headers: ctx.headers() }))
    .json(404, object, "status"),
  http.protected
    .post("/mcp/{name}/disconnect", "mcp.disconnect")
    .mutating()
    .at((ctx) => ({ path: route("/mcp/{name}/disconnect", { name: "httpapi-missing" }), headers: ctx.headers() }))
    .json(404, object, "status"),
  http.protected.get("/mcp/tools", "mcp.tools").json(200, object, "status"),
  http.protected.get("/mcp/config", "mcp.config.list").json(200, object, "status"),
  http.protected
    .put("/mcp/{name}/config", "mcp.config.update")
    .mutating()
    .at((ctx) => ({
      path: route("/mcp/{name}/config", { name: "httpapi-saved" }),
      headers: ctx.headers(),
      body: { config: { type: "local", command: ["bun", "--version"], enabled: false } },
    }))
    .json(200, (body) => check(body === true, "saving an MCP server config should return true"), "status"),
  http.protected
    .put("/mcp/{name}/config", "mcp.config.update.invalid")
    .at((ctx) => ({
      path: route("/mcp/{name}/config", { name: "httpapi-invalid" }),
      headers: ctx.headers(),
      body: { config: { type: "invalid" } },
    }))
    .status(400),
  http.protected
    .delete("/mcp/{name}/config", "mcp.config.remove")
    .mutating()
    .at((ctx) => ({ path: route("/mcp/{name}/config", { name: "httpapi-missing" }), headers: ctx.headers() }))
    .json(404, object, "status"),
]
