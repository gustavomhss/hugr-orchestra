import { expect, test } from "bun:test"
import { createServer, type IncomingMessage } from "node:http"
import type { LeanDashboard } from "@orchestra/schema/lean-dashboard"
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

test("real generated Project SDK uses native directory/auth, PATCH shape and paired nullable measurements", async () => {
  const requests: { method: string; path: string; directory: string | null; auth: string | null; body: unknown }[] = []
  const server = await endpoint(async (request) => {
    const url = new URL(request.url!, "http://fixture")
    const chunks: Buffer[] = []
    for await (const chunk of request) chunks.push(Buffer.from(chunk))
    requests.push({ method: request.method!, path: url.pathname, directory: url.searchParams.get("directory"),
      auth: request.headers.authorization ?? null,
      body: request.method === "PATCH" ? JSON.parse(Buffer.concat(chunks).toString()) : undefined })
    return { body: { ...(url.pathname.includes("history") ? history : info), futureField: "ignored" } }
  })
  const client = createSdkForServer({ server: { url: server.url, username: "fixture", password: "fixture" }, directory: "/repo one", throwOnError: true })
  const api = createLeanAPI({ client, directory: "/repo one", protocol: Promise.resolve("v1") })
  try {
    expect(await api.read()).toEqual(info)
    expect(await api.update({ itemID: "cargo", enabled: false })).toEqual(info)
    expect(await api.history("cargo")).toEqual(history)
    expect(requests.map((request) => [request.method, request.path, request.directory])).toEqual([
      ["GET", "/project/lean", "/repo one"], ["PATCH", "/project/lean", "/repo one"],
      ["GET", "/project/lean/history/cargo", "/repo one"],
    ])
    expect(requests.every((request) => request.auth === `Basic ${btoa("fixture:fixture")}`)).toBe(true)
    expect(requests[1]?.body).toEqual({ itemID: "cargo", enabled: false })
  } finally { await server.stop() }
})

test("HTTP Schema decoding rejects phantom counters/time and missing nullable fields; no numeric casts", async () => {
  let body: unknown = info
  const server = await endpoint(() => ({ body }))
  const api = createLeanAPI({ client: createSdkForServer({ server: { url: server.url } }),
    directory: "/repo one", protocol: Promise.resolve("v1") })
  try {
    for (const calls of ["2", -1, 1.5, null]) {
      body = { ...info, savings: { ...info.savings, calls } }
      await expect(api.read()).rejects.toBeInstanceOf(LeanAPIError)
    }
    body = { ...info, savings: { ...info.savings, tokenCalls: "1" } }
    await expect(api.update({ enabled: false })).rejects.toBeInstanceOf(LeanAPIError)
    body = { ...info, savings: { calls: 2, tokenCalls: 1, bytesSaved: 80 } }
    await expect(api.read()).rejects.toBeInstanceOf(LeanAPIError)
    body = { ...history, executions: [{ ...history.executions[0], time: "123" }] }
    await expect(api.history("cargo")).rejects.toBeInstanceOf(LeanAPIError)
    body = history
    expect(await api.history("cargo")).toEqual(history)
  } finally { await server.stop() }
})

test("v2 and missing endpoints are unavailable; protocol wait honors disposal; ordinary HTTP error remains intact", async () => {
  let status = 404
  let requests = 0
  const server = await endpoint(() => { requests++; return { body: { message: "denied" }, status } })
  const client = createSdkForServer({ server: { url: server.url } })
  try {
    const v2 = createLeanAPI({ client, directory: "/repo one", protocol: Promise.resolve("v2") })
    await expect(v2.read()).rejects.toMatchObject({ reason: "unsupported" })
    expect(requests).toBe(0)
    const protocol = Promise.withResolvers<"v1">()
    const abort = new AbortController()
    const pending = createLeanAPI({ client, directory: "/repo one", protocol: protocol.promise }).read(abort.signal)
    abort.abort(); protocol.resolve("v1")
    await expect(pending).rejects.toMatchObject({ name: "AbortError" })
    expect(requests).toBe(0)
    const api = createLeanAPI({ client, directory: "/repo one", protocol: Promise.resolve("v1") })
    for (status of [404, 405, 501]) await expect(api.read()).rejects.toMatchObject({ reason: "unsupported" })
    status = 500
    await expect(api.read()).rejects.toMatchObject({ message: "denied" })
  } finally { await server.stop() }
})
