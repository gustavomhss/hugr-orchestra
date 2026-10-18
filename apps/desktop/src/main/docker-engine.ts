export * as DockerEngine from "./docker-engine"

import http from "node:http"

export class ResponseError extends Error {
  constructor(readonly status: number, readonly body: string) {
    super("Docker API request failed")
    this.name = "DockerResponseError"
  }
}

// Metadata admits only local Unix sockets or Windows named pipes. This client
// never discovers a context, follows a redirect, or caches resource identity.
export function create(endpoint: string) {
  const socketPath = endpoint.startsWith("npipe://")
    ? endpoint.slice("npipe://".length).replaceAll("/", "\\")
    : decodeURIComponent(new URL(endpoint).pathname)
  const agent = new http.Agent({ keepAlive: true, maxSockets: 2, maxFreeSockets: 2, timeout: 20_000 })

  const send = async <T>(method: "GET" | "POST" | "PUT" | "DELETE", path: string, value?: unknown, timeout = 20_000) => {
    if (!Number.isSafeInteger(timeout) || timeout < 1 || timeout > 20_000) throw new Error("Invalid Docker API deadline")
    if (method === "PUT" && !(value instanceof Uint8Array)) throw new Error("Docker archive bytes are required")
    const input = value instanceof Uint8Array ? Buffer.from(value) : value === undefined ? undefined : JSON.stringify(value)
    if (input !== undefined && Buffer.byteLength(input) > 2 * 1024 * 1024) throw new Error("Docker API request exceeded the byte limit")
    const result = Promise.withResolvers<string>()
    const deadline = performance.now() + timeout
    const request = http.request({ socketPath, path, method, agent,
      ...(input === undefined ? {} : { headers: { "Content-Type": method === "PUT" ? "application/x-tar" : "application/json", "Content-Length": Buffer.byteLength(input) } }),
    }, response => {
      const chunks: Buffer[] = []
      const size = { bytes: 0 }
      response.on("data", (chunk: Buffer) => {
        size.bytes += chunk.length
        if (size.bytes > 2 * 1024 * 1024) {
          const failure = new Error("Docker API response exceeded the byte limit")
          result.reject(failure)
          request.destroy(failure)
          return
        }
        chunks.push(chunk)
      })
      response.once("error", result.reject)
      response.once("end", () => {
        if (performance.now() >= deadline) {
          result.reject(new Error("Docker API request timed out"))
          return
        }
        const text = Buffer.concat(chunks).toString("utf8")
        if (response.statusCode !== 200 && !(method !== "GET" && [201, 204].includes(response.statusCode ?? 0))) {
          result.reject(new ResponseError(response.statusCode ?? 0, text))
          return
        }
        result.resolve(response.statusCode === 204 || method === "PUT" && text === "" ? "null" : text)
      })
    })
    const timer = setTimeout(() => {
      const failure = new Error("Docker API request timed out")
      result.reject(failure)
      request.destroy(failure)
    }, timeout)
    request.once("error", result.reject)
    request.end(input)
    return JSON.parse(await result.promise.finally(() => clearTimeout(timer))) as T
  }
  return {
    get: <T>(path: string, timeout?: number) => send<T>("GET", path, undefined, timeout),
    post: <T>(path: string, value?: unknown, timeout?: number) => send<T>("POST", path, value, timeout),
    put: (path: string, bytes: Uint8Array, timeout?: number) => send<null>("PUT", path, bytes, timeout),
    delete: (path: string, timeout?: number) => send<null>("DELETE", path, undefined, timeout),
    close: () => agent.destroy(),
  }
}
