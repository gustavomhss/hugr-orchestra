import { describe, expect, test } from "bun:test"
import { ClaudeCodeAccount } from "@orchestra/core/claude-code-account"
import { Credential } from "@orchestra/core/credential"
import { AppNodeBuilder } from "@orchestra/core/effect/app-node-builder"
import { LayerNode } from "@orchestra/core/effect/layer-node"
import { PermissionSaved } from "@orchestra/core/permission/saved"
import { NodeHttpServer } from "@effect/platform-node"
import { Context, Effect, Layer } from "effect"
import { mkdtemp, rm } from "node:fs/promises"
import { createServer, request } from "node:http"
import { createConnection } from "node:net"
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

function webRequest(path: string, init?: RequestInit) {
  return new Request(`http://localhost${path}`, init)
}

describe("HTTP extensions", () => {
  test("default without extensions preserves baseline", async () => {
    const server = app()
    try {
      expect(await (await server.handler(webRequest("/api/health"))).text()).toBe("baseline")
      expect((await server.handler(webRequest("/tools"))).status).toBe(404)
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
          const response = await server.handler(webRequest(path, { method, headers: { "x-input": "value" }, ...(method === "POST" ? { body: "payload" } : {}) }))
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
          const response = await server.handler(webRequest(path, { method }))
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
      const first = await within(reader.read(), "first streamed chunk")
      expect(first.done).toBe(false)
      expect(decoder.decode(first.value)).toBe("request-first")
      firstRequestChunk.resolve()
      const second = await within(reader.read(), "second streamed chunk")
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
    const pending = server.handler(webRequest("/tools/upload", init))
    try {
      // The producer cannot send its final chunk until the extension has read the first.
      await within(Promise.race([
        firstRequestChunk.promise,
        pending.then(() => { throw new Error("response returned before the first request chunk was read") }),
      ]), "first request chunk")
      requestTail.resolve()
      const response = await within(pending, "response headers")
      expect(response.status).toBe(206)
      expect(response.headers.get("x-stream-output")).toBe("response-header")
      expect(response.headers.get("content-type")).toBe("application/octet-stream")
      const reader = response.body!.getReader()
      const first = await within(reader.read(), "first streamed chunk")
      expect(first.done).toBe(false)
      expect(decoder.decode(first.value)).toBe("response-first")
      // Releasing this barrier only after read() proves the response was not buffered to completion.
      responseTail.resolve()
      const second = await within(reader.read(), "second streamed chunk")
      expect(second.done).toBe(false)
      expect(decoder.decode(second.value)).toBe("response-final")
      // Keep the response open while verifying cancellation still reaches the extension request.
      controller.abort()
      await within(aborted.promise, "extension request abort")
      responseEnd.resolve()
      await reader.cancel()
      reader.releaseLock()
    } finally {
      requestTail.resolve()
      responseTail.resolve()
      responseEnd.resolve()
      controller.abort()
      await server.dispose()
      await within(pending.catch(() => undefined), "stream cleanup")
    }
  })

  test("does not capture prefix lookalikes or API paths", async () => {
    const seen: string[] = []
    const server = app([{ mount: "/tools", handler: async (input) => {
      seen.push(input.url)
      return new Response("extension")
    } }])
    try {
      for (const path of ["/toolshed", "/tools-other", "/api/missing", "/openapi.json"]) expect((await server.handler(webRequest(path))).status).toBe(404)
      expect(await (await server.handler(webRequest("/api/health"))).text()).toBe("baseline")
      expect(seen).toEqual([])
    } finally { await server.dispose() }
  })

  test("undefined in an owned mount returns 404", async () => {
    const server = app([{ mount: "/tools", handler: async () => undefined }])
    try {
      for (const path of ["/tools", "/tools/missing"]) expect((await server.handler(webRequest(path))).status).toBe(404)
    } finally { await server.dispose() }
  })

  test.each([
    ["/"], [""], ["tools"], ["/tools/"], ["/tools//child"], ["/tools?x=1"], ["/tools/*"], ["/tools/../child"],
    ["/api"], ["/api/child"], ["/API"], ["/Api/child"], ["/Experimental/project"], ["/experimental/project/example/copy"], ["/openapi.json"], ["/OPENAPI.JSON/child"],
    ["/tools", "/tools"], ["/tools", "/Tools"], ["/tools", "/TOOLS/child"], ["/tools/child", "/Tools"],
  ].map((mounts) => [mounts] as const))("rejects invalid, reserved or overlapping mounts %j", async (mounts) => {
    await expect((async () => {
      const server = app(mounts.map((mount) => ({ mount, handler: async () => new Response("unexpected") })))
      try { await server.handler(webRequest("/api/health")) } finally { await server.dispose() }
    })()).rejects.toThrow()
  })

  test("allows sibling and prefix-lookalike mounts", async () => {
    const mounts = ["/tools/a", "/tools/b", "/toolshed", "/api-tools"]
    const server = app(mounts.map((mount) => ({ mount, handler: async () => new Response(mount) })))
    try {
      for (const mount of mounts) expect(await (await server.handler(webRequest(mount))).text()).toBe(mount)
    } finally { await server.dispose() }
  })

  test("promise errors return a sanitized 500", async () => {
    const server = app([{ mount: "/tools", handler: async () => { throw new Error("sentinel-private-extension-secret") } }])
    try {
      const response = await server.handler(webRequest("/tools"))
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
      expect((await server.handler(webRequest("/tools", { headers: { host: "untrusted.example" } }))).status).toBe(421)
      expect(seen).toEqual([])
      expect(await (await server.handler(webRequest("/tools", { headers: { host: "localhost" } }))).text()).toBe("allowed")
      expect(seen).toHaveLength(1)
    } finally { await server.dispose() }
  })

  test("request abort reaches the extension signal", async () => {
    const entered = Promise.withResolvers<void>()
    const aborted = Promise.withResolvers<void>()
    const release = Promise.withResolvers<void>()
    const controller = new AbortController()
    const server = app([{ mount: "/tools", handler: async (input) => {
      input.signal.addEventListener("abort", () => aborted.resolve(), { once: true })
      entered.resolve()
      await Promise.race([aborted.promise, release.promise])
      return new Response("cancelled")
    } }])
    const pending = server.handler(webRequest("/tools", { signal: controller.signal })).catch(() => undefined)
    try {
      await within(Promise.race([
        entered.promise,
        pending.then(() => { throw new Error("request completed before extension entry") }),
      ]), "extension handler entry")
      controller.abort()
      await within(aborted.promise, "extension request abort")
    } finally {
      controller.abort()
      release.resolve()
      await server.dispose()
      await within(pending, "request cleanup")
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
      return new Response(pathname, { status: 201 })
    } }],
  }).pipe(Layer.provide(HttpServer.layerServices)), { disableLogger: true, memoMap: Layer.makeMemoMapUnsafe() })
  const send = (pathname: string, init: RequestInit = {}) => {
    const headers = new Headers(init.headers)
    if (!headers.has("host")) headers.set("host", "localhost")
    return server.handler(webRequest(pathname, { ...init, headers }), Context.makeUnsafe(new Map()))
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
    expect(await owned.text()).toBe("/installation/upload")
    expect((await send("/api/health", { method: "POST", headers: { "content-length": size } })).status).toBe(413)
    expect((await send("/api/health")).status).toBe(401)
    const auth = `Basic ${Buffer.from(`orchestra:${password}`).toString("base64")}`
    expect((await send("/api/health", { headers: { authorization: auth } })).status).toBe(200)
    expect(await (await send("/")).text()).toBe("installation-ui")
    expect(await (await send("/installation/nested")).text()).toBe("/installation/nested")
    expect(await (await send("/installation-other")).text()).toBe("installation-ui")
    expect(seen).toEqual(["OPTIONS", "OPTIONS", "OPTIONS", "OPTIONS", "POST", "GET"])
  } finally {
    await server.dispose()
    await rm(webRoot, { recursive: true, force: true })
  }
})

test("Node disconnect aborts the installation request after the first streamed response chunk", async () => {
  const aborted = Promise.withResolvers<unknown>()
  const cancelled = Promise.withResolvers<void>()
  const stopWaiting = Promise.withResolvers<void>()
  const extensions: HttpExtension[] = [{ mount: "/stream", async handler(input) {
    input.signal.addEventListener("abort", () => aborted.resolve(input.signal.reason), { once: true })
    return new Response(new ReadableStream({
      start(stream) {
        stream.enqueue(new TextEncoder().encode("installation-first"))
      },
      async cancel() {
        // Application cleanup may itself wait for the request to be aborted.
        await Promise.race([aborted.promise, stopWaiting.promise])
        cancelled.resolve()
      },
    }))
  } }]
  await withNodeRoutes(extensions, async (origin) => {
    const address = new URL(origin)
    const client = createConnection({ host: address.hostname, port: Number(address.port) })
    try {
      const first = Promise.withResolvers<string>()
      const received: Buffer[] = []
      client.once("error", first.reject)
      client.on("data", (chunk: Buffer) => {
        received.push(chunk)
        const content = Buffer.concat(received).toString("utf8")
        if (content.includes("installation-first")) first.resolve(content)
      })
      client.write(`GET /stream HTTP/1.1\r\nHost: ${address.host}\r\n\r\n`)
      expect(await within(first.promise, "first chunk over Node HTTP")).toContain("HTTP/1.1 200")
      client.destroy()
      const [reason] = await within(Promise.all([aborted.promise, cancelled.promise]), "Node stream cancellation")
      expect(reason).toBeInstanceOf(DOMException)
    } finally {
      client.destroy()
      stopWaiting.resolve()
    }
  })
})

const nodePassword = "installation-node-password"

function withNodeRoutes(extensions: readonly HttpExtension[], check: (origin: string) => Promise<void>) {
  const server = createServer()
  const routes = HttpRouter.serve(createRoutes({
    password: nodePassword,
    allowedHosts: ["127.0.0.1"],
    httpExtensions: extensions,
  }), { disableListenLog: true, disableLogger: true }).pipe(
    Layer.provideMerge(NodeHttpServer.layer(() => server, { host: "127.0.0.1", port: 0 })),
    Layer.provide(AppNodeBuilder.build(LayerNode.group([Credential.node, PermissionSaved.node, ClaudeCodeAccount.node]))),
  )
  return Effect.runPromise(Effect.scoped(Effect.gen(function* () {
    const context = yield* Layer.build(routes)
    yield* Effect.addFinalizer(() => Effect.sync(() => server.closeAllConnections?.()))
    const address = Context.get(context, HttpServer.HttpServer).address
    yield* Effect.promise(() => check(HttpServer.formatAddress(address)))
  })))
}

async function within<A>(promise: Promise<A>, phase: string): Promise<A> {
  const deadline = Promise.withResolvers<never>()
  const timer = setTimeout(() => deadline.reject(new Error(`Timed out waiting for ${phase}`)), 5_000)
  try {
    return await Promise.race([promise, deadline.promise])
  } finally {
    clearTimeout(timer)
  }
}

test("Node forwards OPTIONS bodies and exact cookie fields and keeps the admitted authority", async () => {
  const cookies = ["session=one; Path=/installation; HttpOnly", "session=two; Path=/installation/nested; SameSite=Strict"]
  await withNodeRoutes([{ mount: "/installation", async handler(input) {
    const headers = new Headers()
    for (const cookie of cookies) headers.append("set-cookie", cookie)
    const url = new URL(input.url)
    return Response.json({ url: url.href, body: await input.text() }, { headers })
  } }], async (origin) => {
    const response = await sendSocket(origin, "OPTIONS", "//installation/nested", 12, "options body")
    expect(response.status).toBe(200)
    expect(response.cookies).toEqual(cookies)
    const installed = JSON.parse(response.body)
    const url = new URL(installed.url)
    expect(url.origin).toBe(origin)
    expect(url.pathname.replace(/^\/+/, "/")).toBe("/installation/nested")
    expect(installed.body).toBe("options body")
  })
})

test("Node leaves chunked installation payload limits to the extension and still caps the API", async () => {
  const chunk = new Uint8Array(1024 * 1024).fill(32)
  const body = () => {
    const chunks = Array.from({ length: 17 }, () => chunk).values()
    return new ReadableStream<Uint8Array>({
      pull(stream) {
        const next = chunks.next()
        if (next.done) stream.close()
        else stream.enqueue(next.value)
      },
    })
  }
  await withNodeRoutes([{ mount: "/installation", async handler(input) {
    const reader = input.body!.getReader()
    let size = 0
    for (;;) {
      const next = await reader.read()
      if (next.done) break
      size += next.value.byteLength
    }
    return Response.json({ size, length: input.headers.get("content-length") })
  } }], async (origin) => {
    const options: RequestInit & { duplex: "half" } = {
      method: "POST", body: body(), duplex: "half", signal: AbortSignal.timeout(15_000),
    }
    const installed = await fetch(`${origin}/installation/upload`, options)
    expect(installed.status).toBe(200)
    expect(await installed.json()).toEqual({ size: 17 * chunk.byteLength, length: null })

    const authorization = `Basic ${Buffer.from(`orchestra:${nodePassword}`).toString("base64")}`
    const api = await fetch(`${origin}/api/skill`, {
      ...options,
      method: "PUT",
      body: body(),
      signal: AbortSignal.timeout(15_000),
      headers: { authorization, "content-type": "application/json" },
    })
    expect(api.status).toBe(413)
    expect(await api.json()).toMatchObject({ _tag: "PayloadTooLargeError" })
  })
})

test("Node sends early installation responses before uploads finish", async () => {
  await withNodeRoutes([{ mount: "/installation", async handler(input) {
    if (new URL(input.url).pathname.endsWith("/partial")) {
      const reader = input.body!.getReader()
      const chunk = await reader.read()
      if (new TextDecoder().decode(chunk.value) !== "partial") return new Response(null, { status: 400 })
    }
    return new Response("installation limit", { status: 413, headers: { connection: "close" } })
  } }], async (origin) => {
    for (const [pathname, chunk] of [["/installation/unread", ""], ["/installation/partial", "partial"]]) {
      const response = await sendSocket(origin, "POST", pathname!, 1_000, chunk!)
      expect(response).toMatchObject({ status: 413, body: "installation limit" })
    }
  })
})

test("Node can close a disconnected request even if the handler promise is still pending", async () => {
  const entered = Promise.withResolvers<void>()
  const aborted = Promise.withResolvers<void>()
  const pending = Promise.withResolvers<Response>()
  const lateBodyCancelled = Promise.withResolvers<void>()

  const running = withNodeRoutes([{ mount: "/pending", async handler(input) {
    input.signal.addEventListener("abort", () => aborted.resolve(), { once: true })
    entered.resolve()
    return pending.promise
  } }], async (origin) => {
    const client = request(`${origin}/pending`)
    client.once("error", entered.reject)
    try {
      client.end()
      await within(entered.promise, "Node handler entry")
      client.destroy()
      await within(aborted.promise, "Node handler request abort")
    } finally {
      client.destroy()
    }
  })
  try {
    await within(running, "Node teardown with pending extension handler")
    pending.resolve(new Response(new ReadableStream({ cancel: () => lateBodyCancelled.resolve() })))
    await within(lateBodyCancelled.promise, "late extension response cancellation")
  } finally {
    pending.resolve(new Response(null))
    await running.catch(() => undefined)
  }
})

async function sendSocket(origin: string, method: string, pathname: string, size: number, content: string) {
  const address = new URL(origin)
  const end = Promise.withResolvers<Buffer>()
  const chunks: Buffer[] = []
  const client = createConnection({ host: address.hostname, port: Number(address.port) })
  client.on("data", (chunk: Buffer) => chunks.push(chunk))
  client.once("error", end.reject)
  client.once("end", () => end.resolve(Buffer.concat(chunks)))
  try {
    client.write(`${method} ${pathname} HTTP/1.1\r\nHost: ${address.host}\r\nConnection: close\r\nContent-Length: ${size}\r\n\r\n${content}`)
    const received = await within(end.promise, "HTTP response from loopback socket")
    const boundary = received.indexOf("\r\n\r\n")
    const headers = received.subarray(0, boundary).toString("utf8").split("\r\n")
    const status = Number(headers[0]?.split(" ")[1])
    const cookies = headers.filter((header) => header.toLowerCase().startsWith("set-cookie:")).map((header) => header.slice(11).trimStart())
    const payload = received.subarray(boundary + 4)
    if (!headers.some((header) => header.toLowerCase() === "transfer-encoding: chunked")) {
      return { status, cookies, body: payload.toString("utf8") }
    }
    const data: Buffer[] = []
    let offset = 0
    while (offset < payload.length) {
      const lineEnd = payload.indexOf("\r\n", offset)
      if (lineEnd < 0) throw new Error("Missing chunk length")
      const length = Number.parseInt(payload.subarray(offset, lineEnd).toString("ascii"), 16)
      if (!Number.isFinite(length) || length < 0) throw new Error("Invalid chunk length")
      if (length === 0) return { status, cookies, body: Buffer.concat(data).toString("utf8") }
      const start = lineEnd + 2
      data.push(payload.subarray(start, start + length))
      offset = start + length + 2
    }
    throw new Error("Missing final HTTP chunk")
  } finally {
    client.destroy()
  }
}

test("the Web adapter preserves cookies and module headers on streamed responses", async () => {
  const values = ["session=one; Path=/tools; HttpOnly", "session=two; Path=/tools/history; SameSite=Strict"]
  const server = app([{ mount: "/tools", async handler() {
    const headers = new Headers({ "access-control-allow-origin": "https://module.example", "x-extension": "owned" })
    for (const value of values) headers.append("set-cookie", value)
    return new Response(new ReadableStream({
      start(stream) {
        stream.enqueue(new TextEncoder().encode("streamed"))
        stream.close()
      },
    }), { headers })
  } }])
  try {
    for (const method of ["GET", "HEAD"]) {
      const response = await server.handler(webRequest("/tools", { method }))
      expect(response.headers.getSetCookie()).toEqual(values)
      expect(response.headers.get("access-control-allow-origin")).toBe("https://module.example")
      expect(response.headers.get("x-extension")).toBe("owned")
      expect(await response.text()).toBe(method === "GET" ? "streamed" : "")
    }
  } finally {
    await server.dispose()
  }
})
