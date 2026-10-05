import { describe, expect, test } from "bun:test"
import { createRoot } from "solid-js"
import { createMcpActions, mcpErrorDetail } from "./mcp-actions"
import {
  formatCommand,
  mcpBadges,
  mcpCards,
  mcpConfig,
  mcpEnabled,
  mcpEndpoint,
  mcpMatches,
  parseCommand,
} from "./mcp-model"

describe("MCP chapter actions", () => {
  test.each([
    [{ error: "MCP server secured does not support OAuth" }, "MCP server secured does not support OAuth"],
    [
      { _tag: "McpServerNotFoundError", name: "shared", message: "MCP server not found: shared" },
      "MCP server not found: shared",
    ],
    [
      {
        name: "UnknownError",
        data: { message: "Unexpected server error. Check server logs for details.", ref: "err_test" },
      },
      "Unexpected server error. Check server logs for details.",
    ],
  ])("preserves the HttpApi detail in raw and SDK-wrapped errors: %j", (body, detail) => {
    expect(mcpErrorDetail(body)).toBe(detail)
    expect(mcpErrorDetail(new Error("Request failed", { cause: { body, status: 400 } }))).toBe(detail)
  })

  test("keeps network error details and tolerates empty server errors", () => {
    expect(mcpErrorDetail(new Error("Network unreachable"))).toBe("Network unreachable")
    expect(mcpErrorDetail(new Error("Empty response", { cause: { body: {}, status: 500 } }))).toBe("Empty response")
    expect(mcpErrorDetail(undefined)).toBeUndefined()
  })

  test("pending actions block duplicate requests until completion", async () => {
    const calls: string[] = []
    const gate = Promise.withResolvers<void>()
    const owner = createRoot((dispose) => ({ dispose, actions: createMcpActions() }))
    const action = async () => {
      calls.push("shared")
      await gate.promise
    }
    const request = owner.actions.run("shared", action)
    const duplicate = owner.actions.run("shared", action)
    expect(calls).toEqual(["shared"])
    expect(owner.actions.state.pending.shared).toBe(true)
    gate.resolve()
    await Promise.all([request, duplicate])
    expect(owner.actions.state.pending.shared).toBe(false)
    await owner.actions.run("shared", action)
    expect(calls).toEqual(["shared", "shared"])
    owner.dispose()
  })

  test("failure remains visible after settling and an unrelated row succeeds", async () => {
    const owner = createRoot((dispose) => ({ dispose, actions: createMcpActions() }))
    await owner.actions.run("broken", () => Promise.reject({ error: "OAuth denied" }))
    await owner.actions.run("other", () => Promise.resolve())
    expect(owner.actions.state.pending.broken).toBe(false)
    expect(owner.actions.state.failures.broken).toEqual({ detail: "OAuth denied" })
    expect(owner.actions.state.failures.other).toBeUndefined()
    await owner.actions.run("broken", () => Promise.resolve())
    expect(owner.actions.state.failures.broken).toBeUndefined()
    owner.dispose()
  })

  test.each(["constructor", "toString", "__proto__"])("%s is a valid MCP name", async (name) => {
    const calls: string[] = []
    const owner = createRoot((dispose) => ({ dispose, actions: createMcpActions() }))
    expect(owner.actions.state.pending[name]).toBeUndefined()
    expect(owner.actions.state.failures[name]).toBeUndefined()
    await owner.actions.run(name, async () => {
      calls.push(name)
      throw new Error("Connection refused")
    })
    expect(calls).toEqual([name])
    expect(owner.actions.state.pending[name]).toBe(false)
    expect(owner.actions.state.failures[name]).toEqual({ detail: "Connection refused" })
    owner.dispose()
  })

  test("disposing a profile prevents late failures and further actions", async () => {
    const gate = Promise.withResolvers<void>()
    const calls: string[] = []
    const owner = createRoot((dispose) => ({ dispose, actions: createMcpActions() }))
    const request = owner.actions.run("shared", async () => {
      calls.push("shared")
      await gate.promise
    })
    owner.dispose()
    gate.reject(new Error("Old profile failed"))
    await request
    await owner.actions.run("other", async () => {
      calls.push("other")
    })
    expect(owner.actions.state.failures.shared).toBeUndefined()
    expect(calls).toEqual(["shared"])
  })
})

describe("MCP chapter model", () => {
  test.each([
    ["connected", true, "orchestra.mcp.connected", "good"],
    ["failed", true, "orchestra.mcp.error", "bad"],
    ["disabled", false, "orchestra.mcp.disabled", undefined],
    ["needs_auth", true, "orchestra.mcp.needsAuth", "bad"],
    ["needs_client_registration", true, "orchestra.mcp.needsClientRegistration", "bad"],
    ["pending", true, "orchestra.mcp.pending", undefined],
  ] as const)("%s is enabled=%s with the %s badge", (status, enabled, label, tone) => {
    expect(mcpEnabled(status)).toBe(enabled)
    expect<{ label: string; tone?: string }>(mcpBadges[status]).toEqual({ label, tone })
  })

  test("cards come from status and pick up configured endpoints and reported tools", () => {
    const cards = mcpCards(
      {
        web: { status: "connected" },
        fs: { status: "failed", error: "spawn ENOENT" },
        runtime: { status: "disabled" },
        toString: { status: "disabled" as const },
      },
      {
        fs: { type: "local", command: ["bunx", "@modelcontextprotocol/server-filesystem", "."] },
        web: { type: "remote", url: "https://mcp.example.test/docs" },
        global: { type: "remote", url: "https://ignored.example.test" },
      },
      { web: ["search_docs", "read_page"] },
    )
    expect(cards).toEqual([
      {
        name: "fs",
        status: { status: "failed", error: "spawn ENOENT" },
        transport: "stdio",
        endpoint: "bunx @modelcontextprotocol/server-filesystem .",
        tools: undefined,
      },
      { name: "runtime", status: { status: "disabled" }, tools: undefined },
      { name: "toString", status: { status: "disabled" }, tools: undefined },
      {
        name: "web",
        status: { status: "connected" },
        transport: "http",
        endpoint: "https://mcp.example.test/docs",
        tools: ["search_docs", "read_page"],
      },
    ])
  })

  test("endpoints ignore entries that only toggle a server", () => {
    expect(mcpEndpoint({ enabled: false })).toEqual({})
    expect(mcpEndpoint({ type: "local", command: ["ok", 1] })).toEqual({})
    expect(mcpEndpoint(undefined)).toEqual({})
  })

  test("search matches name, endpoint, transport and status label", () => {
    const card = {
      name: "Docs",
      status: { status: "connected" as const },
      transport: "http" as const,
      endpoint: "https://x.test",
    }
    expect(mcpMatches(card, "  DOCS ", "Connected")).toBe(true)
    expect(mcpMatches(card, "x.test", "Connected")).toBe(true)
    expect(mcpMatches(card, "HTTP", "Connected")).toBe(true)
    expect(mcpMatches(card, "connected", "Connected")).toBe(true)
    expect(mcpMatches(card, "stdio", "Connected")).toBe(false)
  })

  test("http drafts need an http(s) URL", () => {
    expect(mcpConfig("http", " https://mcp.example.test/docs ")).toEqual({
      config: { type: "remote", url: "https://mcp.example.test/docs" },
    })
    expect(mcpConfig("http", "http://127.0.0.1:9000/mcp")).toEqual({
      config: { type: "remote", url: "http://127.0.0.1:9000/mcp" },
    })
    for (const value of ["not a url", "mcp.example.test", "ftp://mcp.example.test", ""])
      expect(mcpConfig("http", value)).toEqual({ error: "url" })
  })

  test("stdio drafts split into a command array", () => {
    expect(mcpConfig("stdio", "bunx @modelcontextprotocol/server-filesystem .")).toEqual({
      config: { type: "local", command: ["bunx", "@modelcontextprotocol/server-filesystem", "."] },
    })
    expect(mcpConfig("stdio", "   ")).toEqual({ error: "command" })
    expect(mcpConfig("stdio", 'node "unclosed')).toEqual({ error: "command" })
  })

  test.each([
    ["node server.js --port 3000", ["node", "server.js", "--port", "3000"]],
    [`python "my server.py" 'single quoted' ""`, ["python", "my server.py", "single quoted", ""]],
    [String.raw`run a\ b "x\"y" 'c\d'`, ["run", "a b", 'x"y', String.raw`c\d`]],
  ])("parses %s", (text, command) => {
    expect(parseCommand(text)).toEqual(command)
    expect(parseCommand(formatCommand(command))).toEqual(command)
  })

  test("formats plain arguments without quotes", () => {
    expect(formatCommand(["bunx", "@modelcontextprotocol/server-filesystem", "."])).toBe(
      "bunx @modelcontextprotocol/server-filesystem .",
    )
    expect(formatCommand(["it's", "a b"])).toBe(`'it'"'"'s' 'a b'`)
  })
})
