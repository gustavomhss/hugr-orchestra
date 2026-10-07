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
const toolsFixture = path.join(import.meta.dir, "../fixture/mcp-tools-stdio.ts")

const request = Effect.fnUntraced(function* (route: string, directory: string, init?: RequestInit) {
  const headers = new Headers(init?.headers)
  headers.set("x-opencode-directory", directory)
  if (init?.body) headers.set("content-type", "application/json")
  const response = yield* Effect.promise(() =>
    Promise.resolve(
      HttpApiApp.webHandler().handler(new Request(`http://localhost${route}`, { ...init, headers }), context),
    ),
  )
  const text = yield* Effect.promise(() => response.text())
  return { status: response.status, body: text ? (JSON.parse(text) as unknown) : text }
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
    "lists raw project entries so variables are never resolved for the client",
    () =>
      Effect.gen(function* () {
        const tmp = yield* TestInstance
        process.env.OPENCODE_MCP_PAGE_SECRET = "resolved-secret"
        yield* Effect.addFinalizer(() => Effect.sync(() => delete process.env.OPENCODE_MCP_PAGE_SECRET))

        const config = yield* request("/config", tmp.directory)
        expect(JSON.stringify(config.body)).toContain("resolved-secret")

        const listed = yield* request(McpPaths.entries, tmp.directory)
        expect(listed).toEqual({
          status: 200,
          body: {
            cli: { type: "local", command: ["bunx", "server", "--token", "{env:OPENCODE_MCP_PAGE_SECRET}"] },
            web: { type: "remote", url: "https://mcp.example.test/?key={env:OPENCODE_MCP_PAGE_SECRET}" },
          },
        })
        expect(JSON.stringify(listed.body)).not.toContain("resolved-secret")
        expect(JSON.stringify(listed.body)).not.toContain("X-Secret")

        // Saving the unresolved values back keeps the references and the fields the client never saw.
        expect(
          yield* request("/mcp/web/config", tmp.directory, {
            method: "PUT",
            body: JSON.stringify({
              config: { type: "remote", url: "https://mcp.example.test/?key={env:OPENCODE_MCP_PAGE_SECRET}" },
            }),
          }),
        ).toEqual({ status: 200, body: true })
        const text = yield* Effect.promise(() => Bun.file(path.join(tmp.directory, "opencode.json")).text())
        expect(text).not.toContain("resolved-secret")
        expect(JSON.parse(text).mcp.web).toEqual({
          type: "remote",
          url: "https://mcp.example.test/?key={env:OPENCODE_MCP_PAGE_SECRET}",
          headers: { "X-Secret": "{env:OPENCODE_MCP_PAGE_SECRET}" },
          enabled: false,
        })
      }),
    {
      config: {
        mcp: {
          cli: {
            type: "local",
            command: ["bunx", "server", "--token", "{env:OPENCODE_MCP_PAGE_SECRET}"],
            environment: { TOKEN: "{env:OPENCODE_MCP_PAGE_SECRET}" },
            enabled: false,
          },
          web: {
            type: "remote",
            url: "https://mcp.example.test/?key={env:OPENCODE_MCP_PAGE_SECRET}",
            headers: { "X-Secret": "{env:OPENCODE_MCP_PAGE_SECRET}" },
            enabled: false,
          },
        },
      },
    },
  )

  it.instance(
    "reports each connected server's tools even when prefixed names collide",
    () =>
      Effect.gen(function* () {
        const tmp = yield* TestInstance
        expect(yield* request(McpPaths.status, tmp.directory)).toEqual({
          status: 200,
          body: { a: { status: "connected" }, a_b: { status: "connected" }, off: { status: "disabled" } },
        })
        // Both servers expose a tool that the session registry would name "a_b_c".
        expect(yield* request(McpPaths.tools, tmp.directory)).toEqual({
          status: 200,
          body: { a: ["b_c", "read"], a_b: ["c"] },
        })
      }),
    {
      config: {
        mcp: {
          a: { type: "local", command: ["bun", toolsFixture, "b_c", "read"] },
          a_b: { type: "local", command: ["bun", toolsFixture, "c"] },
          off: { type: "local", command: ["bun", toolsFixture, "hidden"], enabled: false },
        },
      },
    },
  )

  it.instance(
    "rejects invalid names, configs, files, and servers outside the project",
    () =>
      Effect.gen(function* () {
        const tmp = yield* TestInstance
        const put = (name: string, body: unknown) =>
          request(`/mcp/${encodeURIComponent(name)}/config`, tmp.directory, {
            method: "PUT",
            body: JSON.stringify(body),
          })
        const local = { config: { type: "local", command: ["echo"] } }

        expect((yield* put("bad", { config: { type: "remote" } })).status).toBe(400)
        // ".." never reaches the route: URL normalization resolves the dot segment first.
        for (const name of [" ", "__proto__", "a/b", "a\\b", "tab\tname"])
          expect(yield* put(name, local)).toEqual({
            status: 400,
            body: { message: `Invalid MCP server name: ${JSON.stringify(name)}` },
          })

        expect(yield* request("/mcp/missing/config", tmp.directory, { method: "DELETE" })).toEqual({
          status: 404,
          body: {
            _tag: "McpServerNotFoundError",
            name: "missing",
            message: "MCP server missing is not defined in this project's config",
          },
        })

        const file = path.join(tmp.directory, "opencode.json")
        yield* Effect.promise(() => Bun.write(file, `{ "mcp": "nope" }`))
        expect(yield* put("ok", local)).toEqual({
          status: 400,
          body: { message: `"mcp" in ${file} must be an object` },
        })
        yield* Effect.promise(() => Bun.write(file, `{ "mcp": { "ok": `))
        const broken = yield* put("ok", local)
        expect(broken.status).toBe(400)
        expect(JSON.stringify(broken.body)).toContain("is not valid JSONC")
        expect(yield* Effect.promise(() => Bun.file(file).text())).toBe(`{ "mcp": { "ok": `)
      }),
    { config: { mcp: {} } },
  )
})
