import { expect, test } from "bun:test"
import { createServer, type IncomingMessage } from "node:http"
import type { LeanDashboard } from "@orchestra/schema/lean-dashboard"
import { Orchestra } from "@orchestra/client"
import { createSdkForServer } from "@/utils/server"
import { createLeanAPI, LeanAPIError } from "./lean-api"

const info: LeanDashboard.Info = {
  scope: { profileID: "native-directory", projectID: "shared-git-id", directory: "/repo one" },
  engine: "fixture", enabled: true, coverage: "saved-profile-history", complete: false,
  savings: { bytesSaved: 80, tokensSaved: null, calls: 2, tokenCalls: 1 },
  items: [{ id: "cargo", enabled: false, savings: { bytesSaved: 80, tokensSaved: null, calls: 2, tokenCalls: 1 } }],
}
const history: LeanDashboard.History = {
  scope: info.scope, itemID: "cargo", complete: false,
  executions: [{ sessionID: "session", messageID: "message", partID: "part", callID: "call", itemID: "cargo",
    command: "cargo test --package 'actual input'", commandTruncated: false, status: "error", exit: null,
    time: 123, bytesSaved: null, tokensSaved: null }],
}

async function endpoint(handle: (request: IncomingMessage) => { body: unknown; status?: number } | Promise<{ body: unknown; status?: number }>) {
  // App preload installs browser Response globally; use Node's actual HTTP server boundary.
  const server = createServer(async (request, response) => {
    response.setHeader("access-control-allow-origin", "*")
    response.setHeader("access-control-allow-headers", "authorization,content-type,x-orchestra-directory")
    response.setHeader("access-control-allow-methods", "GET,PATCH,OPTIONS")
    if (request.method === "OPTIONS") { response.writeHead(204); response.end(); return }
    const result = await handle(request)
    response.writeHead(result.status ?? 200, { "content-type": "application/json" })
    response.end(JSON.stringify(result.body))
  })
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
  const address = server.address()
  if (!address || typeof address === "string") throw new Error("HTTP fixture has no port")
  return { url: `http://127.0.0.1:${address.port}`, stop: () => new Promise<void>((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve())
  }) }
}

test("v2 reads the dashboard from the Location-scoped Orchestra route and unwraps its data", async () => {
  const location = { directory: "/repo one", project: { id: "shared-git-id", directory: "/repo one" } }
  const requests: { method: string; path: string; directory: string | null; body: unknown }[] = []
  const server = await endpoint(async (request) => {
    const url = new URL(request.url!, "http://fixture")
    const chunks: Buffer[] = []
    for await (const chunk of request) chunks.push(Buffer.from(chunk))
    requests.push({ method: request.method!, path: url.pathname, directory: url.searchParams.get("location[directory]"),
      body: request.method === "PATCH" ? JSON.parse(Buffer.concat(chunks).toString()) : undefined })
    return { body: { location, data: url.pathname.includes("history") ? history : info } }
  })
  const api = createLeanAPI(
    { client: createSdkForServer({ server: { url: server.url } }), directory: "/repo one", protocol: Promise.resolve("v2") },
    Orchestra.make({ baseUrl: server.url }),
  )
  try {
    expect(await api.read()).toEqual(info)
    expect(await api.update({ itemID: "cargo", enabled: false })).toEqual(info)
    expect(await api.history("cargo")).toEqual(history)
    expect(requests.map((request) => [request.method, request.path, request.directory])).toEqual([
      ["GET", "/api/lean", "/repo one"], ["PATCH", "/api/lean", "/repo one"], ["GET", "/api/lean/history/cargo", "/repo one"],
    ])
    expect(requests[1]?.body).toEqual({ itemID: "cargo", enabled: false })
  } finally { await server.stop() }
})
