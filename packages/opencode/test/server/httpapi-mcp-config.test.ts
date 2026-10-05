import { describe, expect } from "bun:test"
import path from "path"
import { Context, Effect, Layer } from "effect"
import { HttpApiApp } from "../../src/server/routes/instance/httpapi/server"
import { McpPaths } from "../../src/server/routes/instance/httpapi/groups/mcp"
import { resetDatabase } from "../fixture/db"
import { TestInstance } from "../fixture/fixture"
import { testEffect } from "../lib/effect"

const context = Context.empty() as Context.Context<unknown>
const it = testEffect(
  Layer.effectDiscard(
    Effect.gen(function* () {
      yield* Effect.promise(() => resetDatabase())
      yield* Effect.addFinalizer(() => Effect.promise(() => resetDatabase()).pipe(Effect.ignore))
    }),
  ),
)

const request = Effect.fnUntraced(function* (route: string, directory: string, init?: RequestInit) {
  const headers = new Headers(init?.headers)
  headers.set("x-opencode-directory", directory)
  if (init?.body) headers.set("content-type", "application/json")
  const response = yield* Effect.promise(() =>
    Promise.resolve(
      HttpApiApp.webHandler().handler(new Request(`http://localhost${route}`, { ...init, headers }), context),
    ),
  )
  return { status: response.status, body: yield* Effect.promise(() => response.json() as Promise<unknown>) }
})

const demo = { type: "local", command: ["echo", "demo"], enabled: false } as const

describe("mcp config HttpApi", () => {
  it.instance(
    "saves, reloads, and removes a profile MCP server through the project config",
    () =>
      Effect.gen(function* () {
        const tmp = yield* TestInstance
        const file = path.join(tmp.directory, "opencode.json")

        expect(yield* request(McpPaths.tools, tmp.directory)).toEqual({ status: 200, body: {} })

        const saved = yield* request("/mcp/docs/config", tmp.directory, {
          method: "PUT",
          body: JSON.stringify({ config: { type: "remote", url: "https://mcp.example.test/docs", enabled: false } }),
        })
        expect(saved).toEqual({ status: 200, body: true })
        const written = yield* Effect.promise(() => Bun.file(file).json())
        expect(written.mcp).toEqual({
          demo,
          docs: { type: "remote", url: "https://mcp.example.test/docs", enabled: false },
        })

        // The write disposes the instance, so the next read loads the new config.
        expect(yield* request(McpPaths.status, tmp.directory)).toEqual({
          status: 200,
          body: { demo: { status: "disabled" }, docs: { status: "disabled" } },
        })

        expect(yield* request("/mcp/docs/config", tmp.directory, { method: "DELETE" })).toEqual({
          status: 200,
          body: true,
        })
        expect((yield* Effect.promise(() => Bun.file(file).json())).mcp).toEqual({ demo })
        expect(yield* request(McpPaths.status, tmp.directory)).toEqual({
          status: 200,
          body: { demo: { status: "disabled" } },
        })
      }),
    { config: { mcp: { demo } } },
  )

  it.instance(
    "rejects invalid configs and servers that are not defined in the project",
    () =>
      Effect.gen(function* () {
        const tmp = yield* TestInstance

        const invalid = yield* request("/mcp/bad/config", tmp.directory, {
          method: "PUT",
          body: JSON.stringify({ config: { type: "remote" } }),
        })
        expect(invalid.status).toBe(400)

        expect(yield* request("/mcp/missing/config", tmp.directory, { method: "DELETE" })).toEqual({
          status: 404,
          body: {
            _tag: "McpServerNotFoundError",
            name: "missing",
            message: "MCP server missing is not defined in this project's config",
          },
        })
      }),
    { config: { mcp: {} } },
  )
})
