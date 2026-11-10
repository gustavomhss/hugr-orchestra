import { expect, test } from "bun:test"
import { createServer } from "node:http"
import { Effect, Exit, Scope } from "effect"
import { FabricIdentityListener } from "../src/identity-listener"
import { fixtures } from "./fixture/context"
import { layers } from "./fixture/identity-preparation"
import { callbackSetup, response } from "./fixture/identity-callback"

const cases = fixtures()
const layer = layers

function freePort() {
  return Effect.promise(
    () =>
      new Promise<number>((resolve, reject) => {
        const server = createServer()
        server.once("error", reject)
        server.listen(0, "127.0.0.1", () => {
          const address = server.address()
          if (!address || typeof address === "string") {
            server.close()
            reject(new Error("No loopback port"))
            return
          }
          server.close(() => resolve(address.port))
        })
      }),
  )
}

test("LST01 a real loopback GET delivers one callback code and the response does not echo it", () => {
  const f = cases.box()
  return Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const port = yield* freePort()
        const redirectUri = `http://localhost:${port}/api/fabric/oauth/callback`
        const s = yield* callbackSetup(f.root, { redirectUri })
        const listener = yield* FabricIdentityListener.make({ callbacks: s.callbacks, profile: s.host })
        expect(listener.url).toBe(redirectUri)
        const ready = yield* s.run(s.callbacks.register(s.selection))
        const target = response(ready.authorizationURL, redirectUri, "SYNTHETIC_LISTENER_CODE")
        const page = yield* Effect.promise(() => fetch(target))
        expect(page.status).toBe(200)
        expect(yield* Effect.promise(() => page.text())).not.toContain("SYNTHETIC_LISTENER_CODE")
        const claimed = yield* s.run(s.callbacks.claim({ context: s.info.context, attempt: ready.attempt }))
        if (claimed.outcome !== "claimed") throw new Error("Expected the loopback callback to be claimed")
        expect(
          yield* s.run(
            s.callbacks.consume({ context: s.info.context, attempt: claimed.attempt, ticket: claimed.ticket }),
          ),
        ).toEqual({
          code: "SYNTHETIC_LISTENER_CODE",
        })
      }),
    ).pipe(Effect.provide(layer(f.filename))),
  )
})

test("LST02 a foreign host, method or path cannot deliver, and one valid GET still can", () => {
  const f = cases.box()
  return Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const port = yield* freePort()
        const redirectUri = `http://localhost:${port}/api/fabric/oauth/callback`
        const s = yield* callbackSetup(f.root, { redirectUri })
        yield* FabricIdentityListener.make({ callbacks: s.callbacks, profile: s.host })
        const ready = yield* s.run(s.callbacks.register(s.selection))
        const state = new URL(ready.authorizationURL).searchParams.get("state")
        const refused = yield* Effect.promise(() =>
          fetch(`http://127.0.0.1:${port}/other`, {
            method: "POST",
            headers: { host: "evil.example" },
            body: "code=SYNTHETIC_LISTENER_REJECTED",
          }),
        )
        expect(refused.status).not.toBe(200)
        expect(yield* Effect.promise(() => refused.text())).not.toContain("SYNTHETIC_LISTENER_REJECTED")
        const target = response(ready.authorizationURL, redirectUri, "SYNTHETIC_LISTENER_ACCEPTED")
        expect(state).toBeTruthy()
        const page = yield* Effect.promise(() => fetch(target, { headers: { host: "evil.example" } }))
        expect(page.status).toBe(200)
        const claimed = yield* s.run(s.callbacks.claim({ context: s.info.context, attempt: ready.attempt }))
        if (claimed.outcome !== "claimed") throw new Error("Expected only the valid callback to be claimed")
        expect(
          yield* s.run(
            s.callbacks.consume({ context: s.info.context, attempt: claimed.attempt, ticket: claimed.ticket }),
          ),
        ).toEqual({
          code: "SYNTHETIC_LISTENER_ACCEPTED",
        })
      }),
    ).pipe(Effect.provide(layer(f.filename))),
  )
})

test("LST03 closing the listener scope rejects a later connection after a positive callback", () => {
  const f = cases.box()
  return Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const port = yield* freePort()
        const redirectUri = `http://localhost:${port}/api/fabric/oauth/callback`
        const s = yield* callbackSetup(f.root, { redirectUri })
        const scope = yield* Scope.make()
        yield* FabricIdentityListener.make({ callbacks: s.callbacks, profile: s.host }).pipe(
          Effect.provideService(Scope.Scope, scope),
        )
        const ready = yield* s.run(s.callbacks.register(s.selection))
        const target = response(ready.authorizationURL, redirectUri, "SYNTHETIC_LISTENER_POSITIVE")
        expect((yield* Effect.promise(() => fetch(target))).status).toBe(200)
        yield* Scope.close(scope, yield* Effect.exit(Effect.void))
        expect(Exit.isFailure(yield* Effect.exit(Effect.promise(() => fetch(target))))).toBe(true)
        const claimed = yield* s.run(s.callbacks.claim({ context: s.info.context, attempt: ready.attempt }))
        if (claimed.outcome !== "claimed") throw new Error("Expected the positive callback to remain claimed")
        expect(
          yield* s.run(
            s.callbacks.consume({ context: s.info.context, attempt: claimed.attempt, ticket: claimed.ticket }),
          ),
        ).toEqual({
          code: "SYNTHETIC_LISTENER_POSITIVE",
        })
      }),
    ).pipe(Effect.provide(layer(f.filename))),
  )
})
