import { get } from "node:http"
import { createConnection, createServer } from "node:net"
import { describe, expect, spyOn, test } from "bun:test"
import { Deferred, Effect, Exit, Fiber, Option, Scope } from "effect"
import { authorizeBrowser } from "@orchestra/core/plugin/provider/openai"

function callback(url: URL) {
  return new Promise<{ status: number; body: string }>((resolve, reject) => {
    get(url, { agent: false }, (response) => {
      const chunks: Buffer[] = []
      response.on("data", (chunk) => chunks.push(chunk))
      response.on("end", () => resolve({ status: response.statusCode!, body: Buffer.concat(chunks).toString() }))
    }).on("error", reject)
  })
}

async function attempt() {
  const scope = Scope.makeUnsafe()
  const flow = await Effect.runPromise(authorizeBrowser(0).pipe(Effect.provideService(Scope.Scope, scope)))
  const auth = new URL(flow.url)
  const url = new URL(auth.searchParams.get("redirect_uri")!)
  const state = auth.searchParams.get("state")!
  return { scope, flow, url, state, close: () => Effect.runPromise(Scope.close(scope, Exit.void)) }
}

function tokenExchange() {
  return spyOn(globalThis, "fetch").mockImplementation(Object.assign(async (url: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
    expect(String(url)).toBe("https://auth.openai.com/oauth/token")
    const body = new URLSearchParams(String(init?.body))
    expect(body.get("code")).toBe("dummy-code")
    expect(body.get("code_verifier")?.length).toBe(43)
    expect(body.get("redirect_uri")).toMatch(/^http:\/\/localhost:\d+\/auth\/callback$/)
    return Response.json({ access_token: "dummy-access", refresh_token: "dummy-refresh", id_token: "" })
  }, { preconnect: fetch.preconnect }))
}

async function heldRequest(url: URL) {
  const socket = createConnection({ port: Number(url.port), host: url.hostname })
  // Seeing the 404 proves the server accepted this request. Its declared body
  // remains incomplete while another connection delivers the real OAuth callback.
  await new Promise<void>((resolve, reject) => {
    socket.once("error", reject)
    socket.once("data", () => resolve())
    socket.once("connect", () => socket.write(
      "POST /favicon.ico HTTP/1.1\r\nHost: localhost\r\nContent-Length: 100\r\nConnection: keep-alive\r\n\r\nx",
    ))
  })
  expect(socket.destroyed).toBe(false)
  return { socket, closed: new Promise<void>((resolve) => socket.once("close", () => resolve())) }
}

function bounded<T>(promise: Promise<T>) {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("OAuth cleanup waited for an unrelated request")), 2000)
    promise.then((value) => { clearTimeout(timer); resolve(value) }, (error) => { clearTimeout(timer); reject(error) })
  })
}

describe("ChatGPT OAuth loopback callback", () => {
  test("unknown state and unrelated requests leave the real login pending before a valid callback", async () => {
    const exchange = tokenExchange()
    const login = await attempt()
    const settled = Effect.runSync(Deferred.make<Exit.Exit<unknown, unknown>>())
    const waiting = Effect.runFork(login.flow.callback.pipe(Effect.exit, Effect.flatMap((exit) => Deferred.succeed(settled, exit))))
    try {
      for (const query of [
        "error=denied",
        "error=denied&state=wrong",
        "error_description=denied&state=wrong",
        "code=dummy-code",
        "code=dummy-code&state=wrong",
        "",
        `state=${login.state}`,
      ]) {
        const url = new URL(login.url)
        url.search = query
        expect((await callback(url)).status).toBe(400)
        await Effect.runPromise(Effect.yieldNow)
        expect(Option.isNone(Effect.runSync(Deferred.poll(settled)))).toBe(true)
        expect(exchange).not.toHaveBeenCalled()
      }
      const unrelated = new URL("/favicon.ico", login.url)
      expect((await callback(unrelated)).status).toBe(404)
      expect(Option.isNone(Effect.runSync(Deferred.poll(settled)))).toBe(true)
      login.url.search = new URLSearchParams({ code: "dummy-code", state: login.state }).toString()
      expect((await callback(login.url)).status).toBe(200)
      const result = await Effect.runPromise(Deferred.await(settled))
      expect(Exit.isSuccess(result)).toBe(true)
      expect(exchange).toHaveBeenCalledTimes(1)
      await Effect.runPromise(login.flow.callback)
      expect(exchange).toHaveBeenCalledTimes(1)
      await expect(callback(login.url)).rejects.toBeDefined()
    } finally {
      await Effect.runPromise(Fiber.interrupt(waiting))
      await login.close()
      exchange.mockRestore()
    }
  })

  test("only an error bound to the expected state fails the login and closes the listener", async () => {
    const exchange = tokenExchange()
    const login = await attempt()
    try {
      login.url.search = new URLSearchParams({ error: "access_denied", state: login.state }).toString()
      expect((await callback(login.url)).status).toBe(400)
      login.url.search = new URLSearchParams({ code: "dummy-code", state: login.state }).toString()
      expect((await callback(login.url)).status).toBe(200)
      const result = await Effect.runPromise(Effect.exit(login.flow.callback))
      expect(Exit.isFailure(result)).toBe(true)
      expect(String(result)).toContain("access_denied")
      expect(exchange).not.toHaveBeenCalled()
      await expect(callback(login.url)).rejects.toBeDefined()
    } finally {
      await login.close()
      exchange.mockRestore()
    }
  })

  test("closing the authorization scope releases an unused listener", async () => {
    const login = await attempt()
    await login.close()
    await expect(callback(login.url)).rejects.toBeDefined()
  })

  test("a held incomplete request cannot withhold credentials or listener cleanup", async () => {
    const exchange = tokenExchange()
    const login = await attempt()
    const held = await heldRequest(login.url)
    try {
      login.url.search = new URLSearchParams({ code: "dummy-code", state: login.state }).toString()
      const page = await callback(login.url)
      expect(page.status).toBe(200)
      expect(page.body).toContain("</html>")
      const credential = await bounded(Effect.runPromise(login.flow.callback))
      expect(credential.access).toBe("dummy-access")
      expect(exchange).toHaveBeenCalledTimes(1)
      await bounded(held.closed)
      await expect(callback(login.url)).rejects.toBeDefined()
    } finally {
      held.socket.destroy()
      await login.close()
      exchange.mockRestore()
    }
  })

  test("scope shutdown closes a held incomplete request and the listener", async () => {
    const login = await attempt()
    const held = await heldRequest(login.url)
    try {
      await bounded(login.close())
      await bounded(held.closed)
      await expect(callback(login.url)).rejects.toBeDefined()
    } finally {
      held.socket.destroy()
      await login.close()
    }
  })

  test("an occupied port retains the actionable sign-in conflict error", async () => {
    const listener = createServer()
    // Reserve both IPv6 and IPv4 loopback bindings: Bun HTTP and net can
    // resolve localhost to different families, so a single-family bind is insufficient.
    await new Promise<void>((resolve, reject) => {
      listener.once("error", reject)
      listener.listen({ port: 0, host: "::", ipv6Only: false, exclusive: true }, resolve)
    })
    const address = listener.address()
    if (!address || typeof address === "string") throw new Error("Missing test listener address")
    const scope = Scope.makeUnsafe()
    try {
      const result = await Effect.runPromise(
        authorizeBrowser(address.port).pipe(Effect.provideService(Scope.Scope, scope), Effect.exit),
      )
      expect(Exit.isFailure(result)).toBe(true)
      expect(String(result)).toContain("already in use, likely by another ChatGPT or Codex sign-in")
    } finally {
      await Effect.runPromise(Scope.close(scope, Exit.void))
      await new Promise<void>((resolve) => listener.close(() => resolve()))
    }
  })
})
