import { Mcp } from "@orchestra/core/mcp"
import { InvalidRequestError, McpServerNotFoundError } from "@orchestra/protocol/errors"
import { Effect } from "effect"
import { HttpApiBuilder } from "effect/unstable/httpapi"
import { Api } from "../api"
import { response } from "../location"

export const McpHandler = HttpApiBuilder.group(Api, "server.mcp", (handlers) =>
  handlers
    .handle("mcp.list", () => response(Mcp.Service.use((mcp) => mcp.list())))
    .handle("mcp.resource.catalog", () => response(Mcp.Service.use((mcp) => mcp.resources())))
    .handle("mcp.config", () => response(Mcp.Service.use((mcp) => mcp.config())))
    .handle("mcp.entries", () =>
      response(Mcp.Service.use((mcp) => mcp.entries()).pipe(Effect.mapError(invalid))),
    )
    .handle("mcp.tools", () => response(Mcp.Service.use((mcp) => mcp.tools())))
    .handle(
      "mcp.add",
      Effect.fn(function* (ctx) {
        const mcp = yield* Mcp.Service
        yield* mcp.add(ctx.params.server, ctx.payload.config).pipe(Effect.mapError(invalid))
      }),
    )
    .handle(
      "mcp.remove",
      Effect.fn(function* (ctx) {
        const mcp = yield* Mcp.Service
        yield* mcp.remove(ctx.params.server).pipe(
          Effect.catchTag("Mcp.NotFoundError", notFound),
          Effect.catchTag("Mcp.ConfigError", (error) => Effect.fail(invalid(error))),
        )
      }),
    )
    .handle(
      "mcp.connect",
      Effect.fn(function* (ctx) {
        const mcp = yield* Mcp.Service
        yield* mcp.connect(ctx.params.server).pipe(Effect.catchTag("Mcp.NotFoundError", notFound))
      }),
    )
    .handle(
      "mcp.disconnect",
      Effect.fn(function* (ctx) {
        const mcp = yield* Mcp.Service
        yield* mcp.disconnect(ctx.params.server).pipe(Effect.catchTag("Mcp.NotFoundError", notFound))
      }),
    )
    .handle(
      "mcp.debug",
      Effect.fn(function* (ctx) {
        const mcp = yield* Mcp.Service
        return yield* response(
          mcp.debug(ctx.params.server).pipe(
            Effect.catchTag("Mcp.NotFoundError", notFound),
            Effect.catchTag("Mcp.ConfigError", (error) => Effect.fail(invalid(error))),
          ),
        )
      }),
    )
    .handle(
      "mcp.auth.start",
      Effect.fn(function* (ctx) {
        const mcp = yield* Mcp.Service
        return yield* mcp.startAuth(ctx.params.server).pipe(
          Effect.catchTag("Mcp.NotFoundError", notFound),
          Effect.catchTag("Mcp.AuthError", (error) => Effect.fail(invalid(error))),
        )
      }),
    )
    .handle(
      "mcp.auth.callback",
      Effect.fn(function* (ctx) {
        const mcp = yield* Mcp.Service
        return yield* mcp.finishAuth(ctx.params.server, ctx.payload.code).pipe(
          Effect.catchTag("Mcp.NotFoundError", notFound),
          Effect.catchTag("Mcp.AuthError", (error) => Effect.fail(invalid(error))),
        )
      }),
    )
    .handle(
      "mcp.auth.remove",
      Effect.fn(function* (ctx) {
        const mcp = yield* Mcp.Service
        yield* mcp.removeAuth(ctx.params.server).pipe(Effect.catchTag("Mcp.NotFoundError", notFound))
      }),
    ),
)

function notFound(error: Mcp.NotFoundError) {
  return Effect.fail(new McpServerNotFoundError({ server: error.name, message: `MCP server not found: ${error.name}` }))
}

function invalid(error: Mcp.ConfigError | Mcp.AuthError) {
  return new InvalidRequestError({ message: error.message })
}
