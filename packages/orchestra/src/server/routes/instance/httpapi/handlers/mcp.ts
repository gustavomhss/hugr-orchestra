import { MCP } from "@/mcp"
import { McpProjectConfig } from "@/mcp/project-config"
import { InstanceState } from "@/effect/instance-state"
import { Effect, Schema } from "effect"
import { HttpApiBuilder, HttpApiError } from "effect/unstable/httpapi"
import { InstanceHttpApi } from "../api"
import { McpServerNotFoundError } from "../errors"
import {
  AddPayload,
  AuthCallbackPayload,
  ConfigPayload,
  McpConfigError,
  StatusMap,
  UnsupportedOAuthError,
} from "../groups/mcp"
import { markInstanceForDisposal } from "../lifecycle"

export const mcpHandlers = HttpApiBuilder.group(InstanceHttpApi, "mcp", (handlers) =>
  Effect.gen(function* () {
    const mcp = yield* MCP.Service

    const status = Effect.fn("McpHttpApi.status")(function* () {
      return yield* mcp.status()
    })

    const add = Effect.fn("McpHttpApi.add")(function* (ctx: { payload: typeof AddPayload.Type }) {
      const result = (yield* mcp.add(ctx.payload.name, ctx.payload.config)).status
      return yield* Schema.decodeUnknownEffect(StatusMap)(
        "status" in result ? { [ctx.payload.name]: result } : result,
      ).pipe(Effect.mapError(() => new HttpApiError.BadRequest({})))
    })

    // Keyed by server: prefixed tool names can collide across servers.
    const tools = Effect.fn("McpHttpApi.tools")(function* () {
      return Object.fromEntries(
        Object.entries(yield* mcp.catalog()).map(([name, defs]) => [name, defs.map((def) => def.name)]),
      )
    })

    const configList = Effect.fn("McpHttpApi.configList")(function* () {
      const instance = yield* InstanceState.context
      return yield* McpProjectConfig.entries(instance.directory).pipe(Effect.mapError(configError))
    })

    // Config writes target the instance's own files; disposal reloads config and reconnects MCP.
    const configUpdate = Effect.fn("McpHttpApi.configUpdate")(function* (ctx: {
      params: { name: string }
      payload: typeof ConfigPayload.Type
    }) {
      const instance = yield* InstanceState.context
      yield* validName(ctx.params.name)
      yield* McpProjectConfig.write(instance.directory, ctx.params.name, ctx.payload.config).pipe(
        Effect.mapError(configError),
      )
      yield* markInstanceForDisposal(instance)
      return true
    })

    const configRemove = Effect.fn("McpHttpApi.configRemove")(function* (ctx: { params: { name: string } }) {
      const instance = yield* InstanceState.context
      yield* validName(ctx.params.name)
      const removed = yield* McpProjectConfig.remove(instance.directory, ctx.params.name).pipe(
        Effect.mapError(configError),
      )
      if (!removed.length)
        return yield* new McpServerNotFoundError({
          name: ctx.params.name,
          message: `MCP server ${ctx.params.name} is not defined in this project's config`,
        })
      yield* markInstanceForDisposal(instance)
      return true
    })

    const authStart = Effect.fn("McpHttpApi.authStart")(function* (ctx: { params: { name: string } }) {
      return yield* Effect.gen(function* () {
        if (!(yield* mcp.supportsOAuth(ctx.params.name))) {
          return yield* new UnsupportedOAuthError({ error: `MCP server ${ctx.params.name} does not support OAuth` })
        }
        return yield* mcp.startAuth(ctx.params.name)
      }).pipe(
        Effect.catchTag("MCP.NotFoundError", (error) =>
          Effect.fail(new McpServerNotFoundError({ name: error.name, message: `MCP server not found: ${error.name}` })),
        ),
      )
    })

    const authCallback = Effect.fn("McpHttpApi.authCallback")(function* (ctx: {
      params: { name: string }
      payload: typeof AuthCallbackPayload.Type
    }) {
      return yield* mcp
        .finishAuth(ctx.params.name, ctx.payload.code)
        .pipe(
          Effect.catchTag("MCP.NotFoundError", (error) =>
            Effect.fail(
              new McpServerNotFoundError({ name: error.name, message: `MCP server not found: ${error.name}` }),
            ),
          ),
        )
    })

    const authAuthenticate = Effect.fn("McpHttpApi.authAuthenticate")(function* (ctx: { params: { name: string } }) {
      return yield* Effect.gen(function* () {
        if (!(yield* mcp.supportsOAuth(ctx.params.name))) {
          return yield* new UnsupportedOAuthError({ error: `MCP server ${ctx.params.name} does not support OAuth` })
        }
        return yield* mcp.authenticate(ctx.params.name)
      }).pipe(
        Effect.catchTag("MCP.NotFoundError", (error) =>
          Effect.fail(new McpServerNotFoundError({ name: error.name, message: `MCP server not found: ${error.name}` })),
        ),
      )
    })

    const authRemove = Effect.fn("McpHttpApi.authRemove")(function* (ctx: { params: { name: string } }) {
      const status = yield* mcp.status()
      if (!(ctx.params.name in status))
        return yield* new McpServerNotFoundError({
          name: ctx.params.name,
          message: `MCP server not found: ${ctx.params.name}`,
        })
      yield* mcp.removeAuth(ctx.params.name)
      return { success: true as const }
    })

    const connect = Effect.fn("McpHttpApi.connect")(function* (ctx: { params: { name: string } }) {
      yield* mcp
        .connect(ctx.params.name)
        .pipe(
          Effect.catchTag("MCP.NotFoundError", (error) =>
            Effect.fail(
              new McpServerNotFoundError({ name: error.name, message: `MCP server not found: ${error.name}` }),
            ),
          ),
        )
      return true
    })

    const disconnect = Effect.fn("McpHttpApi.disconnect")(function* (ctx: { params: { name: string } }) {
      yield* mcp
        .disconnect(ctx.params.name)
        .pipe(
          Effect.catchTag("MCP.NotFoundError", (error) =>
            Effect.fail(
              new McpServerNotFoundError({ name: error.name, message: `MCP server not found: ${error.name}` }),
            ),
          ),
        )
      return true
    })

    return handlers
      .handle("status", status)
      .handle("add", add)
      .handle("tools", tools)
      .handle("configList", configList)
      .handle("configUpdate", configUpdate)
      .handle("configRemove", configRemove)
      .handle("authStart", authStart)
      .handle("authCallback", authCallback)
      .handle("authAuthenticate", authAuthenticate)
      .handle("authRemove", authRemove)
      .handle("connect", connect)
      .handle("disconnect", disconnect)
  }),
)

function validName(name: string) {
  if (McpProjectConfig.validName(name)) return Effect.void
  return Effect.fail(new McpConfigError({ message: `Invalid MCP server name: ${JSON.stringify(name)}` }))
}

function configError(error: McpProjectConfig.FileError) {
  return new McpConfigError({ message: error.message })
}
