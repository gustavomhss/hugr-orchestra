import { describe, expect, test } from "bun:test"
import { createRoot } from "solid-js"
import { toggleMcp } from "@/context/global-sync/mcp"
import { createMcpActions, createMcpAuth, mcpErrorDetail } from "./mcp-actions"
import {
  formatCommand,
  maskCommand,
  maskUrl,
  mcpAction,
  mcpBadges,
  mcpCards,
  mcpConfig,
  mcpDraft,
  mcpEntry,
  mcpMatches,
  mcpNameValid,
  mcpTransport,
  mcpUnchanged,
  parseCommand,
  trustedDirectory,
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

describe("MCP OAuth sign-in wait", () => {
  test("Cancel aborts the request, ends the wait and reports no failure", async () => {
    const owner = createRoot((dispose) => ({ dispose, auth: createMcpAuth() }))
    const seen: AbortSignal[] = []
    const request = owner.auth.run(
      "secured",
      (signal) =>
        new Promise<void>((_, reject) => {
          seen.push(signal)
          signal.addEventListener("abort", () => reject(signal.reason))
        }),
    )
    expect(owner.auth.state.waiting.secured).toEqual({})
    owner.auth.cancel("secured")
    await request
    expect(seen[0].aborted).toBe(true)
    expect(owner.auth.state.waiting.secured).toBeUndefined()
    owner.auth.cancel("secured")
    owner.dispose()
  })

  test("a failure that is not a Cancel still rejects and ends the wait", async () => {
    const owner = createRoot((dispose) => ({ dispose, auth: createMcpAuth() }))
    await expect(owner.auth.run("secured", () => Promise.reject(new Error("OAuth denied")))).rejects.toThrow(
      "OAuth denied",
    )
    expect(owner.auth.state.waiting.secured).toBeUndefined()
    owner.dispose()
  })
})

describe("MCP chapter model", () => {
  test.each([
    ["connected", "disconnect", "orchestra.mcp.connected", "good"],
    ["disabled", "connect", "orchestra.mcp.disabled", undefined],
    ["failed", "connect", "orchestra.mcp.error", "bad"],
    ["needs_client_registration", "connect", "orchestra.mcp.needsClientRegistration", "bad"],
    ["needs_auth", "authenticate", "orchestra.mcp.needsAuth", "bad"],
    ["pending", undefined, "orchestra.mcp.pending", undefined],
  ] as const)("%s dispatches %s through the shared toggle with the %s badge", async (status, action, label, tone) => {
    const calls: string[] = []
    expect(mcpAction(status)).toBe(action)
    expect<{ label: string; tone?: string }>(mcpBadges[status]).toEqual({ label, tone })
    await toggleMcp({
      status,
      connect: async () => {
        calls.push("connect")
      },
      disconnect: async () => {
        calls.push("disconnect")
      },
      authenticate: async () => {
        calls.push("authenticate")
      },
      refresh: async () => {
        calls.push("refresh")
      },
    })
    expect(calls).toEqual(action ? [action, "refresh"] : [])
  })

  test("cards prefer the profile's raw entry, mask credentials, and add reported tools", () => {
    const cards = mcpCards(
      {
        web: { status: "connected" },
        fs: { status: "failed" as const, error: "spawn ENOENT" },
        runtime: { status: "disabled" },
        toString: { status: "disabled" as const },
      },
      {
        fs: { type: "local", command: ["bunx", "server", "--token", "resolved-secret"] },
        web: { type: "remote", url: "https://user:pw@mcp.example.test/docs?key=resolved-secret" },
        global: { type: "remote", url: "https://ignored.example.test" },
      },
      { fs: { type: "local", command: ["bunx", "server", "--token", "{env:TOKEN}"] } },
      { web: ["search_docs", "read_page"] },
    )
    expect(cards).toEqual([
      {
        name: "fs",
        status: { status: "failed", error: "spawn ENOENT" },
        transport: "stdio",
        endpoint: "bunx server --token •••",
        entry: { type: "local", command: ["bunx", "server", "--token", "{env:TOKEN}"] },
        tools: undefined,
      },
      { name: "runtime", status: { status: "disabled" }, entry: undefined, tools: undefined },
      { name: "toString", status: { status: "disabled" }, entry: undefined, tools: undefined },
      {
        name: "web",
        status: { status: "connected" },
        transport: "http",
        endpoint: "https://•••@mcp.example.test/docs?key=•••",
        entry: undefined,
        tools: ["search_docs", "read_page"],
      },
    ])
    expect(JSON.stringify(cards)).not.toContain("resolved-secret")
    expect(JSON.stringify(cards)).not.toContain("pw@")
  })

  test("entries keep only type, command and url", () => {
    expect(
      mcpEntry({
        type: "remote",
        url: "https://x.test",
        headers: { Authorization: "Bearer secret" },
        oauth: { clientSecret: "secret" },
        environment: { TOKEN: "secret" },
      }),
    ).toEqual({ type: "remote", url: "https://x.test" })
    expect(mcpEntry({ enabled: false })).toEqual({})
    expect(mcpEntry({ type: "local", command: ["ok", 1] })).toEqual({ type: "local" })
    expect(mcpEntry(undefined)).toEqual({})
  })

  test.each([
    ["https://mcp.example.test/docs", "https://mcp.example.test/docs"],
    [
      "https://user:pass@mcp.example.test/a?token=abc&q=1&q=2#frag",
      "https://•••@mcp.example.test/a?token=•••&q=•••#•••",
    ],
    ["https://mcp.example.test/?k={env:K}", "https://mcp.example.test/?k=•••"],
    ["not a url", "not a url"],
  ])("maskUrl(%s)", (input, output) => {
    expect(maskUrl(input)).toBe(output)
  })

  test("maskCommand hides secret flag values, secret pairs and URL credentials", () => {
    expect(
      maskCommand([
        "server",
        "--token",
        "abc",
        "--api-key=xyz",
        "-p",
        "3000",
        "GITHUB_TOKEN=ghp_1",
        "--url",
        "https://u:p@x.test/?k=v",
        "--auth",
        "--verbose",
        ".",
      ]),
    ).toEqual([
      "server",
      "--token",
      "•••",
      "--api-key=•••",
      "-p",
      "3000",
      "GITHUB_TOKEN=•••",
      "--url",
      "https://•••@x.test/?k=•••",
      "--auth",
      "--verbose",
      ".",
    ])
  })

  test("drafts come from the raw entry and an unedited save is detected", () => {
    const entry = { type: "local" as const, command: ["bunx", "my server", "--token", "{env:TOKEN}"] }
    const draft = mcpDraft(entry)
    expect(draft).toBe(`bunx 'my server' --token {env:TOKEN}`)
    const result = mcpConfig(draft!)
    expect(result).toEqual({ config: entry })
    expect("config" in result && mcpUnchanged(entry, result.config)).toBe(true)
    expect(mcpUnchanged(entry, { type: "local", command: ["bunx", "my server"] })).toBe(false)
    expect(mcpUnchanged(entry, { type: "remote", url: "https://x.test" })).toBe(false)
    const remote = { type: "remote" as const, url: "https://x.test/?k={env:K}" }
    expect(mcpDraft(remote)).toBe("https://x.test/?k={env:K}")
    expect(mcpUnchanged(remote, { type: "remote", url: "https://x.test/?k={env:K}" })).toBe(true)
    expect(mcpUnchanged(undefined, { type: "remote", url: "https://x.test" })).toBe(false)
    expect(mcpDraft({ enabled: false } as never)).toBeUndefined()
  })

  test("typed environment or headers count as an edit even when the endpoint is unchanged", () => {
    const entry = { type: "local" as const, command: ["node", "server.js"] }
    expect(mcpUnchanged(entry, { type: "local", command: ["node", "server.js"], environment: { A: "1" } })).toBe(false)
    const remote = { type: "remote" as const, url: "https://x.test" }
    expect(mcpUnchanged(remote, { type: "remote", url: "https://x.test", headers: { A: "1" } })).toBe(false)
  })

  test("a project is trusted when it or a parent folder is listed", () => {
    expect(trustedDirectory(["/Users/me/work"], "/Users/me/work")).toBe(true)
    expect(trustedDirectory(["/Users/me/work/"], "/Users/me/work/app")).toBe(true)
    expect(trustedDirectory(["/Users/me/work"], "/Users/me/work-two")).toBe(false)
    expect(trustedDirectory(["/Users/me/other"], "/Users/me/work")).toBe(false)
    expect(trustedDirectory([], "/Users/me/work")).toBe(false)
  })

  test.each([
    ["docs", true],
    ["Docs Server", true],
    ["toString", true],
    ["", false],
    ["  ", false],
    [".", false],
    ["..", false],
    ["__proto__", false],
    ["a/b", false],
    ["a\\b", false],
    ["tab\tname", false],
  ])("mcpNameValid(%j) is %s", (name, valid) => {
    expect(mcpNameValid(name)).toBe(valid)
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

  test("the typed endpoint decides the transport", () => {
    expect(mcpTransport(" https://mcp.example.test/docs ")).toBe("http")
    expect(mcpTransport("HTTP://127.0.0.1:9000/mcp")).toBe("http")
    expect(mcpTransport("bunx @modelcontextprotocol/server-filesystem .")).toBe("stdio")
    expect(mcpTransport("C:\\tools\\server.exe")).toBe("stdio")
    expect(mcpTransport("")).toBe("stdio")
  })

  test("a URL becomes a remote server and needs http(s)", () => {
    expect(mcpConfig(" https://mcp.example.test/docs ")).toEqual({
      config: { type: "remote", url: "https://mcp.example.test/docs" },
    })
    expect(mcpConfig("http://127.0.0.1:9000/mcp")).toEqual({
      config: { type: "remote", url: "http://127.0.0.1:9000/mcp" },
    })
    for (const value of ["ftp://mcp.example.test", "https://"]) expect(mcpConfig(value)).toEqual({ error: "url" })
  })

  test("anything else becomes a local command", () => {
    expect(mcpConfig("bunx @modelcontextprotocol/server-filesystem .")).toEqual({
      config: { type: "local", command: ["bunx", "@modelcontextprotocol/server-filesystem", "."] },
    })
    expect(mcpConfig("   ")).toEqual({ error: "command" })
    expect(mcpConfig('node "unclosed')).toEqual({ error: "command" })
  })

  test("typed headers and environment go with their transport only", () => {
    expect(mcpConfig("https://mcp.example.test", { headers: "Authorization: Bearer a:b\nX-Trace: 1" })).toEqual({
      config: {
        type: "remote",
        url: "https://mcp.example.test",
        headers: { Authorization: "Bearer a:b", "X-Trace": "1" },
      },
    })
    expect(mcpConfig("https://mcp.example.test", { headers: "no separator" })).toEqual({ error: "headers" })
    expect(mcpConfig("https://mcp.example.test", { environment: "TOKEN=x" })).toEqual({
      config: { type: "remote", url: "https://mcp.example.test" },
    })
    expect(mcpConfig("node server.js", { environment: "TOKEN=abc=def\n\nMODE=" })).toEqual({
      config: { type: "local", command: ["node", "server.js"], environment: { TOKEN: "abc=def", MODE: "" } },
    })
    expect(mcpConfig("node server.js", { environment: "=x" })).toEqual({ error: "environment" })
    expect(mcpConfig("node server.js", { headers: "X-Trace: 1" })).toEqual({
      config: { type: "local", command: ["node", "server.js"] },
    })
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
