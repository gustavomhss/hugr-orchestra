// Each interface open in the dock is its own MCP server: names follow the tab, look shows the whole outline with refs,
// find answers with a breadcrumb, and act answers with what changed, all from the dock's own tree reads.
import { describe, expect, test } from "bun:test"
import { Client } from "@modelcontextprotocol/sdk/client/index.js"
import { Effect } from "effect"
import { McpProvided } from "@orchestra/core/mcp/provided"
import { DockMcp } from "./dock-mcp"
import { control, fakePort, field, page, type Envelope, type Reply } from "./app-dock.fixture"

const tabs = [
  { tabID: "t1", generation: 1, url: "https://www.github.com/orchestra", title: "GitHub", active: true },
  { tabID: "t2", generation: 1, url: "https://github.com/other", title: "Other", active: false },
  { tabID: "linux", generation: 1, url: "orchestra://linux", title: "Linux", active: false, scopeKind: "workspace" },
]
const form = [
  { ref: 1, role: "form", name: "Sign in", parentRef: null },
  { ref: 2, role: "textbox", name: "Email", parentRef: 1, actionable: true },
  { ref: 3, role: "button", name: "Continue", parentRef: 1, actionable: true },
]

function dock(respond: (op: string, args: Record<string, unknown>) => Reply) {
  const f = fakePort()
  const calls: { op: string; args: Record<string, unknown> }[] = []
  f.port.postMessage = (message: unknown) => {
    const envelope = message as Envelope
    if (envelope.type !== "dock.rpc") return
    calls.push({ op: envelope.op, args: envelope.args })
    const reply = respond(envelope.op, envelope.args)
    queueMicrotask(() => f.deliver({ type: "dock.rpc.result", id: envelope.id, ...reply }))
  }
  const layer = DockMcp.layer(f.port)
  const servers = () => Effect.runPromise(McpProvided.Service.pipe(
    Effect.flatMap((service) => service.servers()),
    Effect.provide(layer),
  ))
  return { calls, servers }
}

async function connect(server: McpProvided.Server) {
  const client = new Client({ name: "test", version: "1.0.0" })
  await client.connect(server.connect())
  return client
}

const text = (result: unknown) => ((result as { content: { text: string }[] }).content[0]!.text)

describe("DockMcp", () => {
  test("names one server per tab and keeps a server while its tab is unchanged", async () => {
    const d = dock((op) => (op === "list" ? { ok: true, value: tabs } : { ok: false, error: { message: op } }))
    const first = await d.servers()
    expect(first.map((server) => server.name)).toEqual(["dock-github-com", "dock-github-com-2", "dock-linux"])
    expect((await d.servers())[0]).toBe(first[0]!)
  })

  test("look, find and act on a browser tab", async () => {
    const clicked = { value: false }
    const d = dock((op, args) => {
      if (op === "list") return { ok: true, value: tabs }
      if (op === "click") {
        clicked.value = true
        return { ok: true, value: { clicked: args.ref } }
      }
      if (op === "read") return { ok: true, value: { url: "https://github.com/orchestra", title: "GitHub",
        items: clicked.value ? [...form, { ref: 4, role: "alert", name: "Check your email", parentRef: 1 }] : form } }
      return { ok: false, error: { message: `unexpected ${op}` } }
    })
    const client = await connect((await d.servers())[0]!)

    expect((await client.listTools()).tools.map((tool) => tool.name)).toEqual(["look", "find", "act", "wait", "navigate"])
    expect(text(await client.callTool({ name: "look", arguments: {} }))).toBe(
      'GitHub — https://github.com/orchestra\nform "Sign in" [1]\n  textbox "Email" [2]\n  button "Continue" [3]')
    expect(text(await client.callTool({ name: "find", arguments: { query: "continue" } }))).toBe('form "Sign in" › button "Continue" [3]')
    // A guessed or stale scope answers with the whole outline instead of failing.
    const guessed = await client.callTool({ name: "look", arguments: { scope: 8 } })
    expect(guessed.isError).toBe(false)
    expect(text(guessed)).toStartWith("no line [8] in the current outline; here is all of it\nGitHub — https://github.com/orchestra\n")

    const acted = text(await client.callTool({ name: "act", arguments: { name: "Continue", role: "button" } }))
    expect(d.calls.find((call) => call.op === "click")?.args).toMatchObject({ ref: 3, world: "browser", tabID: "t1" })
    expect(acted).toContain('appeared:\n+ alert "Check your email" [4]')

    const missing = await client.callTool({ name: "act", arguments: { ref: 99 } })
    expect(missing.isError).toBe(true)
    expect(text(missing)).toContain("no line [99]")
    await client.close()
  })

  test("look on the Linux workspace numbers its own lines", async () => {
    const d = dock((op) => {
      if (op === "list") return { ok: true, value: tabs }
      if (op === "read") return page([control("n:1", "Save", { states: [8, 24, 30] }), control("n:2", "Quit", { states: [8, 24, 30] }),
        { ...field("n:3", ""), role: 61, roleName: "text", states: [7, 8, 24, 30] }])
      return { ok: false, error: { message: `unexpected ${op}` } }
    })
    const client = await connect((await d.servers())[2]!)
    expect((await client.listTools()).tools.map((tool) => tool.name)).toEqual(["look", "find", "act", "wait"])
    const outline = text(await client.callTool({ name: "look", arguments: {} }))
    expect(outline).toStartWith("Linux workspace\n")
    // The editor's unnamed text view stays: it is where typing goes.
    expect(outline).toMatch(/"Save" \[1\]\n.*"Quit" \[2\]\ntext.* \[3\]$/)
    expect(d.calls.find((call) => call.op === "read")?.args).toMatchObject({ world: "linux", budget: 500 })
    await client.close()
  })
})
