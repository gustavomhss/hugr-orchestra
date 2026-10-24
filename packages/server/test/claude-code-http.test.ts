import { describe, expect, test } from "bun:test"
import { ClaudeAccount } from "@orchestra/core/claude-account"
import { ClaudeCodeGroup } from "@orchestra/protocol/groups/claude-code"
import { Authorization } from "@orchestra/protocol/middleware/authorization"
import { SchemaErrorMiddleware } from "@orchestra/protocol/middleware/schema-error"
import { Effect, Layer, Option } from "effect"
import { HttpRouter, HttpServer } from "effect/unstable/http"
import { HttpApi, HttpApiBuilder } from "effect/unstable/httpapi"
import { ServerAuth } from "../src/auth"
import { ClaudeCodeHandler } from "../src/handlers/claude-code"
import { authorizationLayer } from "../src/middleware/authorization"
import { schemaErrorLayer } from "../src/middleware/schema-error"

const api = HttpApi.make("server").add(ClaudeCodeGroup).middleware(Authorization).middleware(SchemaErrorMiddleware)
const auth = ServerAuth.headers({ username: "orchestra", password: "secret" })

// The routes over a scripted sign-in: the handler is the whole unit, the Claude Code process is the engine module's.
function serve(claude: ClaudeAccount.Interface) {
  const routes = HttpApiBuilder.layer(api).pipe(
    Layer.provide(ClaudeCodeHandler),
    Layer.provide(Layer.succeed(ClaudeAccount.Service, ClaudeAccount.Service.of(claude))),
    Layer.provide(authorizationLayer),
    Layer.provide(schemaErrorLayer),
    Layer.provide(ServerAuth.Config.configLayer({ username: "orchestra", password: Option.some("secret") })),
    Layer.provide(HttpServer.layerServices),
  )
  return Effect.acquireRelease(
    Effect.sync(() => HttpRouter.toWebHandler(routes, { disableLogger: true })),
    (web) => Effect.promise(() => web.dispose()),
  ).pipe(
    Effect.map((web) => (pathname: string, init: RequestInit = {}) =>
      Effect.promise(() =>
        web.handler(
          new Request(new URL(pathname, "http://orchestra.test"), {
            ...init,
            headers: { ...auth, "content-type": "application/json" },
          }),
        ),
      ),
    ),
  )
}

describe("claude code sign-in routes", () => {
  test("reports the account the engine reads", () =>
    Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const request = yield* serve({
            ...ClaudeAccount.unavailable,
            account: Effect.succeed({ signedIn: true, email: "me@example.com", subscription: "max" }),
          })
          const response = yield* request("/api/claude-code/account")
          expect(response.status).toBe(200)
          expect(yield* Effect.promise(() => response.json())).toEqual({
            signedIn: true,
            email: "me@example.com",
            subscription: "max",
          })
        }),
      ),
    ))

  test("starts the sign-in and returns its fallback URL", () =>
    Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const request = yield* serve({ ...ClaudeAccount.unavailable, login: Effect.succeed({ url: "https://claude.test/login" }) })
          const response = yield* request("/api/claude-code/login", { method: "POST" })
          expect(response.status).toBe(200)
          expect(yield* Effect.promise(() => response.json())).toEqual({ url: "https://claude.test/login" })
        }),
      ),
    ))

  test("answers a failed sign-in with the declared error and the process's own words", () =>
    Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const request = yield* serve(ClaudeAccount.unavailable)
          const response = yield* request("/api/claude-code/login", { method: "POST" })
          expect(response.status).toBe(400)
          expect(yield* Effect.promise(() => response.json())).toMatchObject({
            _tag: "ClaudeCodeLoginError",
            message: "Claude Code is not available on this server",
          })
        }),
      ),
    ))

  test("hands the pasted code to the running sign-in", () =>
    Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const codes: string[] = []
          const request = yield* serve({
            ...ClaudeAccount.unavailable,
            loginCode: (code) => Effect.sync(() => codes.push(code) > 0),
          })
          const response = yield* request("/api/claude-code/login/code", {
            method: "POST",
            body: JSON.stringify({ code: "abc#state" }),
          })
          expect(response.status).toBe(200)
          expect(yield* Effect.promise(() => response.json())).toBe(true)
          expect(codes).toEqual(["abc#state"])
        }),
      ),
    ))
})
