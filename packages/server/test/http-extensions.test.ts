import { describe, expect, test } from "bun:test"
import { Context, Layer } from "effect"
import { HttpRouter, HttpServer, HttpServerResponse } from "effect/unstable/http"
import { httpExtensionsLayer } from "../src/http-extensions"
import type { HttpExtension } from "../src/routes"
import { hostPolicyLayer } from "../src/host-policy"

function app(extensions: readonly HttpExtension[] = [], allowedHosts?: readonly string[]) {
  const server = HttpRouter.toWebHandler(Layer.mergeAll(
    HttpRouter.add("GET", "/api/health", HttpServerResponse.text("baseline")),
    httpExtensionsLayer(extensions),
  ).pipe(Layer.provide(hostPolicyLayer(allowedHosts)), Layer.provide(HttpServer.layerServices)), { disableLogger: true })
  return { handler: (input: Request) => server.handler(input, Context.empty()), dispose: server.dispose }
}

function request(path: string, init?: RequestInit) {
  return new Request(`http://localhost${path}`, init)
}

describe("HTTP extensions", () => {
  test("default without extensions preserves baseline", async () => {
    const server = app()
    try {
      expect(await (await server.handler(request("/api/health"))).text()).toBe("baseline")
      expect((await server.handler(request("/tools"))).status).toBe(404)
    } finally { await server.dispose() }
  })

  test("exact and nested GET POST HEAD preserve bodies, query and headers", async () => {
    const seen: string[] = []
    const server = app([{ mount: "/tools", handler: async (input) => {
      seen.push(`${input.method} ${new URL(input.url).pathname}${new URL(input.url).search}`)
      return new Response(`${input.headers.get("x-input")}:${await input.text()}`, { status: 202, headers: { "x-output": "present" } })
    } }])
    try {
      for (const path of ["/tools", "/tools/nested?key=value"]) {
        for (const method of ["GET", "POST", "HEAD"]) {
          const response = await server.handler(request(path, { method, headers: { "x-input": "value" }, ...(method === "POST" ? { body: "payload" } : {}) }))
          expect(response.status).toBe(202)
          expect(response.headers.get("x-output")).toBe("present")
          expect(await response.text()).toBe(method === "HEAD" ? "" : `value:${method === "POST" ? "payload" : ""}`)
        }
      }
      expect(seen).toEqual(["GET /tools", "POST /tools", "HEAD /tools", "GET /tools/nested?key=value", "POST /tools/nested?key=value", "HEAD /tools/nested?key=value"])
    } finally { await server.dispose() }
  })

  test("wildcard registration serves exact and nested mounts for all methods without duplicate routes", async () => {
    const server = app([{ mount: "/tools", handler: async (input) => new Response(input.method, {
      status: 202,
      headers: { "x-extension-path": new URL(input.url).pathname },
    }) }])
    try {
      for (const method of ["PUT", "PATCH", "DELETE", "OPTIONS", "PROPFIND"]) {
        for (const path of ["/tools", "/tools/nested"]) {
          const response = await server.handler(request(path, { method }))
          expect(response.status).toBe(202)
          expect(response.headers.get("x-extension-path")).toBe(path)
          expect(await response.text()).toBe(method)
        }
      }
    } finally { await server.dispose() }
  })

  test("streams request and response chunks incrementally and preserves abort", async () => {
    const requestTail = Promise.withResolvers<void>()
    const firstRequestChunk = Promise.withResolvers<void>()
    const responseTail = Promise.withResolvers<void>()
    const responseEnd = Promise.withResolvers<void>()
    const aborted = Promise.withResolvers<void>()
    const controller = new AbortController()
    const encoder = new TextEncoder()
    const decoder = new TextDecoder()
    const server = app([{ mount: "/tools", handler: async (input) => {
      expect(input.headers.get("x-stream-input")).toBe("request-header")
      expect(input.signal.aborted).toBe(false)
      input.signal.addEventListener("abort", () => aborted.resolve(), { once: true })
      const reader = input.body!.getReader()
      const first = await reader.read()
      expect(first.done).toBe(false)
      expect(decoder.decode(first.value)).toBe("request-first")
      firstRequestChunk.resolve()
      const second = await reader.read()
      expect(second.done).toBe(false)
      expect(decoder.decode(second.value)).toBe("request-final")
      expect((await reader.read()).done).toBe(true)
      reader.releaseLock()
      return new Response(new ReadableStream<Uint8Array>({
        async start(stream) {
          stream.enqueue(encoder.encode("response-first"))
          await responseTail.promise
          stream.enqueue(encoder.encode("response-final"))
          await responseEnd.promise
          stream.close()
        },
      }), { status: 206, headers: { "x-stream-output": "response-header", "content-type": "application/octet-stream" } })
    } }])
    const init: RequestInit & { duplex: "half" } = {
      method: "POST",
      duplex: "half",
      signal: controller.signal,
      headers: { "x-stream-input": "request-header" },
      body: new ReadableStream<Uint8Array>({
        async start(stream) {
          stream.enqueue(encoder.encode("request-first"))
          await requestTail.promise
          stream.enqueue(encoder.encode("request-final"))
          stream.close()
        },
      }),
    }
    const pending = server.handler(request("/tools/upload", init))
    try {
      // The producer cannot send its final chunk until the extension has read the first.
      await Promise.race([
        firstRequestChunk.promise,
        pending.then(() => { throw new Error("response returned before the first request chunk was read") }),
      ])
      requestTail.resolve()
      const response = await pending
      expect(response.status).toBe(206)
      expect(response.headers.get("x-stream-output")).toBe("response-header")
      expect(response.headers.get("content-type")).toBe("application/octet-stream")
      const reader = response.body!.getReader()
      const first = await reader.read()
      expect(first.done).toBe(false)
      expect(decoder.decode(first.value)).toBe("response-first")
      // Releasing this barrier only after read() proves the response was not buffered to completion.
      responseTail.resolve()
      const second = await reader.read()
      expect(second.done).toBe(false)
      expect(decoder.decode(second.value)).toBe("response-final")
      // Keep the response open while verifying cancellation still reaches the extension request.
      controller.abort()
      await aborted.promise
      responseEnd.resolve()
      await reader.cancel()
      reader.releaseLock()
    } finally {
      requestTail.resolve()
      responseTail.resolve()
      responseEnd.resolve()
      controller.abort()
      await server.dispose()
      await pending.catch(() => undefined)
    }
  })

  test("does not capture prefix lookalikes or API paths", async () => {
    const seen: string[] = []
    const server = app([{ mount: "/tools", handler: async (input) => {
      seen.push(input.url)
      return new Response("extension")
    } }])
    try {
      for (const path of ["/toolshed", "/tools-other", "/api/missing", "/openapi.json"]) expect((await server.handler(request(path))).status).toBe(404)
      expect(await (await server.handler(request("/api/health"))).text()).toBe("baseline")
      expect(seen).toEqual([])
    } finally { await server.dispose() }
  })

  test("undefined in an owned mount returns 404", async () => {
    const server = app([{ mount: "/tools", handler: async () => undefined }])
    try {
      for (const path of ["/tools", "/tools/missing"]) expect((await server.handler(request(path))).status).toBe(404)
    } finally { await server.dispose() }
  })

  test.each([
    ["/"], [""], ["tools"], ["/tools/"], ["/tools//child"], ["/tools?x=1"], ["/tools/*"], ["/tools/../child"],
    ["/api"], ["/api/child"], ["/openapi.json"], ["/openapi.json/child"],
    ["/tools", "/tools"], ["/tools", "/tools/child"], ["/tools/child", "/tools"],
  ].map((mounts) => [mounts] as const))("rejects invalid, reserved or overlapping mounts %j", async (mounts) => {
    await expect((async () => {
      const server = app(mounts.map((mount) => ({ mount, handler: async () => new Response("unexpected") })))
      try { await server.handler(request("/api/health")) } finally { await server.dispose() }
    })()).rejects.toThrow()
  })

  test("allows sibling and prefix-lookalike mounts", async () => {
    const mounts = ["/tools/a", "/tools/b", "/toolshed", "/api-tools"]
    const server = app(mounts.map((mount) => ({ mount, handler: async () => new Response(mount) })))
    try {
      for (const mount of mounts) expect(await (await server.handler(request(mount))).text()).toBe(mount)
    } finally { await server.dispose() }
  })

  test("promise errors return a sanitized 500", async () => {
    const server = app([{ mount: "/tools", handler: async () => { throw new Error("sentinel-private-extension-secret") } }])
    try {
      const response = await server.handler(request("/tools"))
      expect(response.status).toBe(500)
      expect(await response.text()).not.toContain("sentinel-private-extension-secret")
      expect(JSON.stringify([...response.headers])).not.toContain("sentinel-private-extension-secret")
    } finally { await server.dispose() }
  })

  test("real shared global Host middleware protects extensions", async () => {
    const seen: string[] = []
    const server = app([{ mount: "/tools", handler: async (input) => {
      seen.push(input.url)
      return new Response("allowed")
    } }], ["localhost"])
    try {
      expect((await server.handler(request("/tools", { headers: { host: "untrusted.example" } }))).status).toBe(421)
      expect(seen).toEqual([])
      expect(await (await server.handler(request("/tools", { headers: { host: "localhost" } }))).text()).toBe("allowed")
      expect(seen).toHaveLength(1)
    } finally { await server.dispose() }
  })

  test("request abort reaches the extension signal", async () => {
    const entered = Promise.withResolvers<void>()
    const aborted = Promise.withResolvers<void>()
    const controller = new AbortController()
    const server = app([{ mount: "/tools", handler: async (input) => {
      entered.resolve()
      return new Promise<Response>((resolve) => {
        input.signal.addEventListener("abort", () => { aborted.resolve(); resolve(new Response("cancelled")) }, { once: true })
      })
    } }])
    const pending = server.handler(request("/tools", { signal: controller.signal })).catch(() => undefined)
    try {
      await Promise.race([entered.promise, pending.then(() => { throw new Error("request completed before extension entry") })])
      controller.abort()
      await aborted.promise
    } finally {
      controller.abort()
      await server.dispose()
      await pending
    }
  })
})
