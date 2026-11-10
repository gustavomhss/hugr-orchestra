export * as FabricIdentityListener from "./identity-listener"

import { createServer } from "node:http"
import { Effect } from "effect"
import { FabricIdentityAttemptAccess } from "./identity-attempt-access"
import { FabricIdentityProfile } from "./identity-profile"
import type { FabricIdentityListenerContract } from "./identity-listener-contract"

const callbackPath = "/api/fabric/oauth/callback"
const page = "<!doctype html><title>Fabric</title><p>You can close this window.</p>"

/** Loopback delivery only. The admitted redirect is the origin; Host is not. */
export const make: FabricIdentityListenerContract.Factory = (options) =>
  Effect.gen(function* () {
    const profile = options.profile
    const redirect = new URL(profile.redirectUri)
    if (
      !FabricIdentityProfile.isAdmitted(profile) ||
      profile.deployment !== "desktop" ||
      redirect.protocol !== "http:" ||
      redirect.hostname !== "localhost" ||
      redirect.pathname !== callbackPath ||
      !redirect.port
    )
      return yield* FabricIdentityAttemptAccess.failure("invalid-input")
    const port = Number(redirect.port)
    if (!Number.isInteger(port) || port < 1 || port > 65535)
      return yield* FabricIdentityAttemptAccess.failure("invalid-input")
    const callbacks = options.callbacks
    const state = { current: false, closed: false }
    const server = createServer((request, response) => {
      const finish = (status: number) => {
        response.writeHead(status, {
          "content-type": "text/html; charset=utf-8",
          "cache-control": "no-store",
          connection: "close",
          "content-length": String(status === 200 ? Buffer.byteLength(page) : 0),
        })
        response.end(status === 200 ? page : "")
      }
      if (state.closed || state.current) {
        finish(503)
        return
      }
      state.current = true
      request.resume()
      const target = request.url ?? ""
      const parsed = URL.canParse(target, "http://127.0.0.1") ? new URL(target, "http://127.0.0.1") : undefined
      if (request.method !== "GET" || !parsed || parsed.pathname !== callbackPath) {
        state.current = false
        finish(request.method === "GET" ? 404 : 405)
        return
      }
      if (!parsed.search.startsWith("?") || Buffer.byteLength(parsed.search) > 8192 || target.includes("#")) {
        state.current = false
        finish(400)
        return
      }
      callbacks.receive(profile.redirectUri + parsed.search)
      state.current = false
      finish(200)
    })
    yield* Effect.acquireRelease(
      Effect.callback<void, ReturnType<typeof FabricIdentityAttemptAccess.failure>>((resume) => {
        const fail = () => resume(Effect.fail(FabricIdentityAttemptAccess.failure("unavailable")))
        server.once("error", fail)
        server.listen({ port, host: "127.0.0.1", exclusive: true }, () => {
          server.off("error", fail)
          server.on("error", () => {})
          resume(Effect.void)
        })
      }),
      () =>
        Effect.callback((resume) => {
          state.closed = true
          server.close(() => resume(Effect.void))
          if ("closeAllConnections" in server) server.closeAllConnections()
        }),
    )
    return Object.freeze({ url: profile.redirectUri })
  })
