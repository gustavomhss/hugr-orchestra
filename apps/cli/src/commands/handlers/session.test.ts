import { EOL } from "os"
import { describe, expect, test } from "bun:test"
import { Effect } from "effect"
import { Daemon } from "../../services/daemon"
import { clientUrl, fakeDaemon, stubServer, withCapturedStdout } from "./test-support"
import list from "./session/list"
import del from "./session/delete"

const sessions = [
  {
    id: "ses/abc",
    projectID: "proj/1",
    time: { created: 1710000000000, updated: 1710000000000 },
    tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
    title: "First session",
    cost: 0,
    location: { directory: "/work" },
  },
  {
    id: "ses/def",
    projectID: "proj/1",
    time: { created: 1710000001000, updated: 1710000001000 },
    tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
    title: "Model selection tinkering",
    cost: 0,
    location: { directory: "/work" },
  },
] as const

const runWith = <A>(effect: Effect.Effect<A, unknown, Daemon.Service>, baseUrl: string) =>
  effect.pipe(Effect.provideService(Daemon.Service, fakeDaemon(baseUrl)), Effect.runPromise)

describe("session list", () => {
  test("prints a table with session ids and titles", async () => {
    const server = stubServer((request) => {
      if (request.method === "GET" && new URL(request.url).pathname === "/api/session")
        return Response.json({ data: [...sessions], cursor: {} }, { status: 200 })
      return new Response("not found", { status: 404 })
    })
    try {
      const out = await withCapturedStdout(() => runWith(list({ limit: 50, format: "table" }), clientUrl(server)))
      expect(out).toContain("ses/abc")
      expect(out).toContain("First session")
      expect(out).toContain("Model selection tinkering")
    } finally {
      server.stop(true)
    }
  })

  test("prints JSON when requested", async () => {
    const server = stubServer((request) => {
      if (request.method === "GET" && new URL(request.url).pathname === "/api/session")
        return Response.json({ data: [...sessions], cursor: {} }, { status: 200 })
      return new Response("not found", { status: 404 })
    })
    try {
      const out = await withCapturedStdout(() => runWith(list({ limit: 50, format: "json" }), clientUrl(server)))
      expect(JSON.parse(out)).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ id: "ses/abc", title: "First session", directory: "/work" }),
        ]),
      )
    } finally {
      server.stop(true)
    }
  })
})

describe("session list when empty", () => {
  test("prints an empty JSON array for --format json and nothing for the table", async () => {
    const server = stubServer(() => Response.json({ data: [], cursor: {} }))
    try {
      expect(await withCapturedStdout(() => runWith(list({ limit: 50, format: "json" }), clientUrl(server)))).toBe("[]" + EOL)
      expect(await withCapturedStdout(() => runWith(list({ limit: 50, format: "table" }), clientUrl(server)))).toBe("")
    } finally {
      server.stop(true)
    }
  })
})

describe("session delete", () => {
  test("deletes the session and confirms", async () => {
    const server = stubServer((request) => {
      if (request.method === "DELETE" && new URL(request.url).pathname === "/api/session/ses%2Fabc")
        return new Response(null, { status: 204 })
      return new Response("not found", { status: 404 })
    })
    try {
      const out = await withCapturedStdout(() => runWith(del({ sessionID: "ses/abc" }), clientUrl(server)))
      expect(out).toContain("Session ses/abc deleted")
    } finally {
      server.stop(true)
    }
  })

  test("fails when the server answers 404", async () => {
    const server = stubServer(() =>
      Response.json(
        { _tag: "SessionNotFoundError", sessionID: "ses/missing", message: "Session not found: ses/missing" },
        { status: 404 },
      ),
    )
    try {
      await expect(runWith(del({ sessionID: "ses/missing" }), clientUrl(server))).rejects.toThrow(
        "Session not found: ses/missing",
      )
    } finally {
      server.stop(true)
    }
  })

  test("does not call an undeclared 404 a missing session", async () => {
    const server = stubServer(() => new Response("not found", { status: 404 }))
    try {
      const failure = await runWith(del({ sessionID: "ses/abc" }), clientUrl(server)).then(
        () => undefined,
        (error: unknown) => error,
      )
      expect(failure).toBeDefined()
      expect(String(failure)).not.toContain("Session not found")
    } finally {
      server.stop(true)
    }
  })
})
