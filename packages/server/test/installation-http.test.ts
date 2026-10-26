import { describe, expect, test } from "bun:test"
import { Installation } from "@orchestra/core/installation/service"
import { InstallationGroup } from "@orchestra/protocol/groups/installation"
import { Authorization } from "@orchestra/protocol/middleware/authorization"
import { SchemaErrorMiddleware } from "@orchestra/protocol/middleware/schema-error"
import { Effect, Layer, Option } from "effect"
import { HttpRouter, HttpServer } from "effect/unstable/http"
import { HttpApi, HttpApiBuilder } from "effect/unstable/httpapi"
import { ServerAuth } from "../src/auth"
import { InstallationHandler } from "../src/handlers/installation"
import { authorizationLayer } from "../src/middleware/authorization"
import { schemaErrorLayer } from "../src/middleware/schema-error"

const api = HttpApi.make("server").add(InstallationGroup).middleware(Authorization).middleware(SchemaErrorMiddleware)

// The real handler over an Installation that records upgrades instead of running a package manager.
function serve(method: Installation.Method) {
  const upgrades: string[] = []
  const installation = Layer.succeed(
    Installation.Service,
    Installation.Service.of({
      info: () => Effect.succeed({ version: "1.0.0", latest: "1.0.0" }),
      method: () => Effect.succeed(method),
      latest: () => Effect.succeed("1.0.0"),
      upgrade: (method, target) => Effect.sync(() => void upgrades.push(`${method}@${target}`)),
    }),
  )
  const web = HttpRouter.toWebHandler(
    HttpApiBuilder.layer(api).pipe(
      Layer.provide(InstallationHandler),
      Layer.provide(installation),
      Layer.provide(authorizationLayer),
      Layer.provide(schemaErrorLayer),
      Layer.provide(ServerAuth.Config.configLayer({ username: "orchestra", password: Option.some("secret") })),
      Layer.provide(HttpServer.layerServices),
    ),
    { disableLogger: true },
  )
  const upgrade = (target: string) =>
    web.handler(
      new Request("http://orchestra.test/api/installation/upgrade", {
        method: "POST",
        headers: {
          ...ServerAuth.headers({ username: "orchestra", password: "secret" }),
          "content-type": "application/json",
        },
        body: JSON.stringify({ target }),
      }),
    )
  return { upgrade, upgrades, dispose: () => web.dispose() }
}

describe("installation routes", () => {
  test("upgrades with the detected package manager and reports the version", async () => {
    const server = serve("npm")
    const response = await server.upgrade("1.2.3")
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ success: true, version: "1.2.3" })
    expect(server.upgrades).toEqual(["npm@1.2.3"])
    await server.dispose()
  })

  test("refuses an install it cannot classify", async () => {
    const server = serve("unknown")
    const response = await server.upgrade("1.2.3")
    expect(response.status).toBe(400)
    expect(server.upgrades).toEqual([])
    await server.dispose()
  })
})
