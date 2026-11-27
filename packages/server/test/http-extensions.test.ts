import "./httpapi-exercise/environment"
import { describe, expect, test } from "bun:test"
import { NodeHttpServer } from "@effect/platform-node"
import { Context, Effect, Layer } from "effect"
import { mkdtemp, rm } from "node:fs/promises"
import { createServer } from "node:http"
import { tmpdir } from "node:os"
import path from "node:path"
import { HttpRouter, HttpServer, HttpServerResponse } from "effect/unstable/http"
import { httpExtensionsLayer } from "../src/http-extensions"
import { createRoutes, type HttpExtension } from "../src/routes"
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
    ["/api"], ["/api/child"], ["/API"], ["/Api/child"], ["/openapi.json"], ["/OPENAPI.JSON/child"],
    ["/tools", "/tools"], ["/tools", "/Tools"], ["/tools", "/TOOLS/child"], ["/tools/child", "/Tools"],
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

test("production routes keep Host global and give installation routes their own preflights and limits", async () => {
  const webRoot = await mkdtemp(path.join(tmpdir(), "orchestra-installation-web-"))
  await Bun.write(path.join(webRoot, "index.html"), "installation-ui")
  const seen: string[] = []
  const password = "installation-synthetic-password"
  const server = HttpRouter.toWebHandler(createRoutes({
    password,
    webRoot,
    allowedHosts: ["localhost"],
    httpExtensions: [{ mount: "/installation", async handler(input) {
      const pathname = new URL(input.url).pathname
      seen.push(input.method)
      if (pathname.endsWith("/missing")) return undefined
      if (input.method === "OPTIONS") {
        return new Response(null, { status: 202, headers: { "access-control-allow-origin": "https://module.example" } })
      }
      return new Response(input.headers.get("content-length"), { status: 201 })
    } }],
  }).pipe(Layer.provide(HttpServer.layerServices)), { disableLogger: true, memoMap: Layer.makeMemoMapUnsafe() })
  const send = (pathname: string, init: RequestInit = {}) => {
    const headers = new Headers(init.headers)
    if (!headers.has("host")) headers.set("host", "localhost")
    return server.handler(request(pathname, { ...init, headers }), Context.makeUnsafe(new Map()))
  }
  const preflight = { origin: "oc://renderer", "access-control-request-method": "POST" }
  try {
    for (const pathname of ["/installation", "/INSTALLATION//child", "/%69nstallation/child"]) {
      const owned = await send(pathname, { method: "OPTIONS", headers: preflight })
      expect(owned.status).toBe(202)
      expect(owned.headers.get("access-control-allow-origin")).toBe("https://module.example")
      expect(owned.headers.get("vary")).toBeNull()
    }
    expect((await send("/installation/missing", { method: "OPTIONS", headers: preflight })).status).toBe(404)
    expect((await send("/installation", {
      method: "OPTIONS", headers: { ...preflight, host: "unrecognized.example" },
    })).status).toBe(421)

    const apiPreflight = await send("/api/health", { method: "OPTIONS", headers: preflight })
    expect(apiPreflight.status).toBe(204)
    expect(apiPreflight.headers.get("access-control-allow-origin")).toBe("oc://renderer")
    const lookalike = await send("/installation-other", { method: "OPTIONS", headers: preflight })
    expect(lookalike.status).toBe(204)
    expect(lookalike.headers.get("access-control-allow-origin")).toBe("oc://renderer")

    const size = String(16 * 1024 * 1024 + 1)
    const owned = await send("/installation/upload", { method: "POST", headers: { "content-length": size } })
    expect(owned.status).toBe(201)
    expect(await owned.text()).toBe(size)
    expect((await send("/api/health", { method: "POST", headers: { "content-length": size } })).status).toBe(413)
    expect((await send("/api/health")).status).toBe(401)
    const auth = `Basic ${Buffer.from(`orchestra:${password}`).toString("base64")}`
    expect((await send("/api/health", { headers: { authorization: auth } })).status).toBe(200)
    expect(await (await send("/")).text()).toBe("installation-ui")
    expect(seen).toEqual(["OPTIONS", "OPTIONS", "OPTIONS", "OPTIONS", "POST"])
  } finally {
    await server.dispose()
    await rm(webRoot, { recursive: true, force: true })
  }
})

test("Node disconnect aborts the installation request after the first streamed response chunk", async () => {
  const aborted = Promise.withResolvers<unknown>()
  const cancelled = Promise.withResolvers<void>()
  const stopWaiting = Promise.withResolvers<void>()
  const server = createServer()
  const middleware = HttpRouter.serve(createRoutes({
    allowedHosts: ["127.0.0.1"],
    httpExtensions: [{ mount: "/stream", async handler(input) {
      input.signal.addEventListener("abort", () => aborted.resolve(input.signal.reason), { once: true })
      return new Response(new ReadableStream({
        start(stream) {
          stream.enqueue(new TextEncoder().encode("first"))
        },
        async cancel() {
          // Application cleanup may itself wait for the request to be aborted.
          await Promise.race([aborted.promise, stopWaiting.promise])
          cancelled.resolve()
        },
      }))
    } }],
  }), { disableListenLog: true, disableLogger: true }).pipe(
    Layer.provideMerge(NodeHttpServer.layer(() => server, { host: "127.0.0.1", port: 0 })),
  )

  await Effect.runPromise(Effect.scoped(Effect.gen(function* () {
    const context = yield* Layer.build(middleware)
    yield* Effect.addFinalizer(() => Effect.sync(() => server.closeAllConnections()))
    const address = Context.get(context, HttpServer.HttpServer).address
    yield* Effect.promise(async () => {
      const controller = new AbortController()
      try {
        const response = await fetch(`${HttpServer.formatAddress(address)}/stream`, {
          signal: AbortSignal.any([controller.signal, AbortSignal.timeout(5_000)]),
        })
        expect(response.status).toBe(200)
        const first = await response.body!.getReader().read()
        expect(new TextDecoder().decode(first.value)).toBe("first")
        controller.abort()
        const timeout = Bun.sleep(5_000).then(() => { throw new Error("client disconnect did not abort and cancel the response") })
        const [reason] = await Promise.race([Promise.all([aborted.promise, cancelled.promise]), timeout])
        expect(reason).toBeInstanceOf(DOMException)
      } finally {
        controller.abort()
        stopWaiting.resolve()
      }
    })
  })))
})
