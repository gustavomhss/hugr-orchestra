export * as AppDockURLBridge from "./app-dock-url-bridge"

import { randomBytes, timingSafeEqual } from "node:crypto"
import { createServer } from "node:http"

export async function create(open: (url: string) => Promise<void>) {
  const token = randomBytes(32).toString("hex")
  const server = createServer((request, response) => {
    const authorization = Buffer.from(request.headers.authorization ?? "")
    const expected = Buffer.from(`Bearer ${token}`)
    if (request.method !== "POST" || request.url !== "/open-url" || authorization.length !== expected.length || !timingSafeEqual(authorization, expected)) {
      request.resume()
      response.writeHead(403).end()
      return
    }
    const chunks: Buffer[] = []
    const size = { bytes: 0 }
    new Promise<unknown>((resolve, reject) => {
      request.on("data", (chunk: Buffer) => {
        size.bytes += chunk.length
        if (size.bytes > 16384) {
          reject(new Error("Bridge request exceeded byte limit"))
          request.destroy()
          return
        }
        chunks.push(chunk)
      })
      request.once("error", reject)
      request.once("end", () => resolve(Buffer.concat(chunks).toString("utf8")))
    }).then(body => JSON.parse(String(body)) as unknown).then(async value => {
      if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).length !== 1 || !("url" in value) || typeof value.url !== "string" || value.url.length > 8192 || !URL.canParse(value.url))
        throw new Error("Invalid bridge request")
      const url = new URL(value.url)
      if (url.protocol !== "https:" || !url.hostname || url.username || url.password) throw new Error("Invalid bridge URL")
      await open(url.href)
      response.writeHead(204).end()
    }).catch(() => {
      if (!response.destroyed) response.writeHead(400).end()
    })
  })
  server.requestTimeout = 20_000
  server.headersTimeout = 5_000
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject)
    server.listen(0, "127.0.0.1", resolve)
  })
  const address = server.address()
  if (!address || typeof address === "string") throw new Error("Bridge listener unavailable")
  server.unref()
  return {
    endpoint: `http://host.docker.internal:${address.port}/open-url`,
    token,
    port: address.port,
    close: () => { server.closeAllConnections(); server.close() },
  }
}
