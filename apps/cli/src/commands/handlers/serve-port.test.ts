import { describe, expect, test } from "bun:test"
import { Effect, Exit, Scope } from "effect"
import { createServer } from "node:net"
import { request } from "node:http"
import { addressInUse } from "./serve-port"

describe("serve port retry", () => {
  test("recognizes a taken port, also inside wrapped causes", async () => {
    const first = createServer()
    await new Promise<void>((resolve) => first.listen(0, "127.0.0.1", resolve))
    const port = (first.address() as { port: number }).port
    const error = await new Promise<unknown>((resolve) => {
      const second = createServer()
      second.once("error", resolve)
      second.listen(port, "127.0.0.1")
    })
    first.close()

    expect(addressInUse(error)).toBe(true)
    expect(addressInUse({ _tag: "ServeError", cause: error })).toBe(true)
  })

  test("does not treat other bind failures as a taken port", () => {
    expect(addressInUse(Object.assign(new Error("denied"), { code: "EACCES" }))).toBe(false)
    expect(addressInUse({ cause: { cause: new Error("boom") } })).toBe(false)
    expect(addressInUse(undefined)).toBe(false)
  })
})

test("installation transport closes requests accepted before routes are ready", async () => {
  const { serveTransport } = await import("./serve")
  const scope = Scope.makeUnsafe()
  const server = await Effect.runPromise(serveTransport(true).pipe(Scope.provide(scope)))
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
  const port = (server.address() as { port: number }).port
  const client = request(`http://127.0.0.1:${port}/installation`)
  const accepted = Promise.withResolvers<void>()
  const closed = Promise.withResolvers<void>()
  const deadline = Promise.withResolvers<never>()
  const timeout = setTimeout(() => deadline.reject(new Error("Installation transport did not close during startup")), 5_000)
  client.on("error", () => undefined)
  server.once("request", () => accepted.resolve())
  try {
    client.end()
    await Promise.race([accepted.promise, deadline.promise])
    server.close((error) => error ? closed.reject(error) : closed.resolve())
    await Promise.race([closed.promise, deadline.promise])
  } finally {
    clearTimeout(timeout)
    client.destroy()
    await Effect.runPromise(Scope.close(scope, Exit.void))
  }
})

test("installation transport releases the bind before Bun reports listening", async () => {
  const { serveTransport } = await import("./serve")
  const scope = Scope.makeUnsafe()
  const server = await Effect.runPromise(serveTransport(true).pipe(Scope.provide(scope)))
  try {
    server.listen(0, "127.0.0.1")
    const address = server.address()
    if (!address || typeof address === "string") throw new Error("Missing bound loopback address")
    expect(server.listening).toBe(false)
    await Effect.runPromise(Scope.close(scope, Exit.void))
    expect(server.address()).toBeNull()

    const replacement = createServer()
    try {
      await new Promise<void>((resolve, reject) => {
        replacement.once("error", reject)
        replacement.listen(address.port, "127.0.0.1", resolve)
      })
    } finally {
      if (replacement.listening) await new Promise<void>((resolve) => replacement.close(() => resolve()))
    }
  } finally {
    await Effect.runPromise(Scope.close(scope, Exit.void))
  }
})
