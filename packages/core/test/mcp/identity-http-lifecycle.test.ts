import { expect, test } from "bun:test"
import { Client } from "@modelcontextprotocol/sdk/client/index.js"
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js"
import { ToolListChangedNotificationSchema } from "@modelcontextprotocol/sdk/types.js"
import { remote } from "./identity-fixture"

const peer = (url: string) => {
  const client = new Client({ name: "identity-http-lifecycle", version: "1" }, { capabilities: {} })
  const transport = new StreamableHTTPClientTransport(new URL(url))
  return { client, transport, [Symbol.asyncDispose]: () => client.close() }
}

test("isolated SDK HTTP lifecycle keeps B live after A terminates and disposes B after ordinary client close", async () => {
  const completed = await (async () => {
    await using server = remote(["probe"], "LIFECYCLE")
    await using a = peer(server.url)
    await using b = peer(server.url)
    await a.client.connect(a.transport)
    await b.client.connect(b.transport)
    expect(a.transport.sessionId).toMatch(/^[0-9a-f-]{36}$/)
    expect(b.transport.sessionId).toMatch(/^[0-9a-f-]{36}$/)
    expect(a.transport.sessionId).not.toBe(b.transport.sessionId)
    expect((await a.client.listTools()).tools.map((tool) => tool.name)).toEqual(["probe"])
    expect((await b.client.listTools()).tools.map((tool) => tool.name)).toEqual(["probe"])
    expect(await a.client.callTool({ name: "probe", arguments: {} })).toMatchObject({
      content: [{ type: "text", text: "LIFECYCLE" }],
    })
    expect(await b.client.callTool({ name: "probe", arguments: {} })).toMatchObject({
      content: [{ type: "text", text: "LIFECYCLE" }],
    })
    await a.transport.terminateSession()
    await a.client.close()
    expect((await b.client.listTools()).tools.map((tool) => tool.name)).toEqual(["probe"])
    const changed = Promise.withResolvers<void>()
    b.client.setNotificationHandler(ToolListChangedNotificationSchema, async () => {
      changed.resolve()
    })
    await server.changed(["next"])
    await changed.promise
    expect((await b.client.listTools()).tools.map((tool) => tool.name)).toEqual(["next"])
    expect(await b.client.callTool({ name: "next", arguments: {} })).toMatchObject({
      content: [{ type: "text", text: "LIFECYCLE" }],
    })
    // Production Mcp.release closes its client without a DELETE; the fixture owns B's remaining server transport.
    await b.client.close()
    expect(server.calls.filter((call) => call.method === "initialize")).toHaveLength(2)
    expect(server.calls.some((call) => call.method === "GET" || call.method === "DELETE")).toBe(false)
    return true
  })()
  // Async disposal completes before the enclosing scope returns, including the real HTTP server's awaited stop.
  expect(completed).toBe(true)
}, 20_000)
