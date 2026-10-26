import { describe, expect, test } from "bun:test"
import { EOL } from "os"
import { Orchestra } from "@orchestra/client"
import { clientUrl, stubServer } from "../test-support"
import type { Prompter } from "../prompt"
import { listServers } from "./list"
import { add, parse } from "./add"
import { authenticate } from "./auth"
import { logout } from "./logout"
import { debug } from "./debug"

const location = { directory: "/work", project: { id: "p", directory: "/work" } }
const servers = [
  { name: "files", status: { status: "connected" } },
  { name: "remote", status: { status: "needs_auth" } },
  { name: "off", status: { status: "disabled" } },
  { name: "bad", status: { status: "failed", error: "spawn ENOENT" } },
]

function script(answers: ReadonlyArray<string>): Prompter {
  const queue = [...answers]
  const next = (message: string) => {
    if (queue.length === 0) throw new Error(`unexpected question: ${message}`)
    return queue.shift()!
  }
  return { select: async (message) => next(message) as never, text: async (message) => next(message), secret: async (message) => next(message) }
}

function stub(callback: unknown = { status: "connected" }) {
  const calls: Array<{ route: string; body: unknown }> = []
  const server = stubServer(async (request) => {
    const route = `${request.method} ${new URL(request.url).pathname.replace(/^\/api/, "")}`
    calls.push({ route, body: request.method === "GET" || request.method === "DELETE" ? undefined : await request.json().catch(() => undefined) })
    if (route === "GET /mcp") return Response.json({ location, data: servers })
    if (route === "POST /mcp/remote/auth") return Response.json({ authorizationUrl: "https://idp.example/authorize", oauthState: "s" })
    if (route === "POST /mcp/remote/auth/callback") return Response.json(callback)
    if (request.method === "PUT" || request.method === "DELETE") return new Response(null, { status: 204 })
    return new Response("not found", { status: 404 })
  })
  return { server, calls, client: Orchestra.make({ baseUrl: clientUrl(server) }) }
}

describe("mcp list", () => {
  test("prints one line per server with its status", async () => {
    const s = stub()
    try {
      const lines = await listServers(s.client, "/work")
      expect(lines).toEqual([
        "✓ files connected",
        "⚠ remote needs authentication",
        "○ off disabled",
        `✗ bad failed${EOL}    spawn ENOENT`,
        "4 server(s)",
      ])
    } finally {
      s.server.stop(true)
    }
  })
})

describe("mcp add", () => {
  test("builds a remote config from --url and --header", () => {
    expect(parse({ url: "https://x.example/mcp", env: [], header: ["Authorization=Bearer a=b"], command: [] })).toEqual({
      type: "remote",
      url: "https://x.example/mcp",
      headers: { Authorization: "Bearer a=b" },
    })
  })

  test("builds a local config from a command and --env", () => {
    expect(parse({ env: ["TOKEN=1"], header: [], command: ["npx", "server"] })).toEqual({
      type: "local",
      command: ["npx", "server"],
      environment: { TOKEN: "1" },
    })
  })

  test("rejects invalid flag combinations", () => {
    expect(() => parse({ env: [], header: [], command: [] })).toThrow("Provide either --url <url> or a command after --")
    expect(() => parse({ url: "https://x.example", env: [], header: [], command: ["a"] })).toThrow("Provide either")
    expect(() => parse({ url: "not a url", env: [], header: [], command: [] })).toThrow("Invalid URL: not a url")
    expect(() => parse({ url: "https://x.example", env: ["A=1"], header: [], command: [] })).toThrow("--env is only valid for local MCP servers")
    expect(() => parse({ env: [], header: ["A=1"], command: ["a"] })).toThrow("--header is only valid for remote MCP servers")
    expect(() => parse({ env: ["bad"], header: [], command: ["a"] })).toThrow("Invalid environment variable: bad. Expected KEY=VALUE")
  })

  test("sends the config to the server under the given name", async () => {
    const s = stub()
    try {
      await add(s.client, script([]), "/work", { name: "files", env: [], header: [], command: ["npx", "fs"] })
      expect(s.calls.find((call) => call.route === "PUT /mcp/files")?.body).toEqual({ config: { type: "local", command: ["npx", "fs"] } })
      await expect(add(s.client, script([]), "/work", { url: "https://x.example", env: [], header: [], command: [] })).rejects.toThrow(
        "A server name is required",
      )
    } finally {
      s.server.stop(true)
    }
  })

  test("asks for everything when called without arguments", async () => {
    const s = stub()
    try {
      await add(s.client, script(["demo", "remote", "https://x.example/mcp"]), "/work", { env: [], header: [], command: [] })
      expect(s.calls.find((call) => call.route === "PUT /mcp/demo")?.body).toEqual({ config: { type: "remote", url: "https://x.example/mcp" } })
    } finally {
      s.server.stop(true)
    }
  })
})

describe("mcp auth", () => {
  test("shows the authorization URL and exchanges the pasted code", async () => {
    const s = stub()
    const said: string[] = []
    try {
      await authenticate(s.client, script(["the-code"]), { directory: "/work", name: "remote", say: (line) => said.push(line) })
      expect(said[0]).toContain("https://idp.example/authorize")
      expect(s.calls.find((call) => call.route === "POST /mcp/remote/auth/callback")?.body).toEqual({ code: "the-code" })
      expect(said.at(-1)).toBe("Authentication successful!")
    } finally {
      s.server.stop(true)
    }
  })

  test("reports a failed exchange, an unknown server and a disabled server", async () => {
    const s = stub({ status: "needs_client_registration", error: "no dynamic registration" })
    try {
      await expect(authenticate(s.client, script(["c"]), { directory: "/work", name: "remote", say: () => {} })).rejects.toThrow(
        "no dynamic registration",
      )
      await expect(authenticate(s.client, script([]), { directory: "/work", name: "ghost", say: () => {} })).rejects.toThrow("MCP server not found: ghost")
      await expect(authenticate(s.client, script([]), { directory: "/work", name: "off", say: () => {} })).rejects.toThrow("MCP server off is disabled")
    } finally {
      s.server.stop(true)
    }
  })
})

describe("mcp logout", () => {
  test("removes the stored auth of a known server only", async () => {
    const s = stub()
    try {
      expect(await logout(s.client, script([]), "/work", "remote")).toBe("remote")
      expect(s.calls.some((call) => call.route === "DELETE /mcp/remote/auth")).toBe(true)
      await expect(logout(s.client, script([]), "/work", "ghost")).rejects.toThrow("MCP server not found: ghost")
    } finally {
      s.server.stop(true)
    }
  })
})

describe("mcp debug", () => {
  test("renders the server's report: masked tokens, the HTTP answer and the OAuth discovery", async () => {
    const reports: Record<string, unknown> = {
      remote: {
        name: "remote",
        url: "https://mcp.example/mcp",
        oauth: true,
        tokens: { access: "abcd***wxyz", expiresAt: 1, refreshToken: true },
        client: { id: "client-1" },
        http: { status: 401, statusText: "Unauthorized", wwwAuthenticate: 'Bearer realm="x"' },
        flow: { result: "unauthorized", message: "needs sign-in", clientRegistered: true },
      },
      plain: { name: "plain", url: "https://mcp.example/mcp", oauth: false },
    }
    const server = stubServer(async (request) => {
      const match = new URL(request.url).pathname.match(/^\/api\/mcp\/([^/]+)\/debug$/)
      const report = match ? reports[match[1]] : undefined
      return report ? Response.json({ location, data: report }) : new Response("not found", { status: 404 })
    })
    const client = Orchestra.make({ baseUrl: clientUrl(server) })
    try {
      const lines = await debug(client, "/work", "remote")
      expect(lines).toContain("URL: https://mcp.example/mcp")
      expect(lines).toContain("  Access token: abcd***wxyz")
      expect(lines.some((line) => line.startsWith("  Expires: 1970-01-01T00:00:01.000Z") && line.endsWith("(EXPIRED)"))).toBe(true)
      expect(lines).toContain("  Refresh token: present")
      expect(lines).toContain("HTTP response: 401 Unauthorized")
      expect(lines).toContain('WWW-Authenticate: Bearer realm="x"')
      expect(lines).toContain("OAuth flow triggered: needs sign-in")
      expect(lines).toContain("Client ID available")
      expect(await debug(client, "/work", "plain")).toEqual(["MCP server plain has OAuth explicitly disabled"])
    } finally {
      server.stop(true)
    }
  })
})
