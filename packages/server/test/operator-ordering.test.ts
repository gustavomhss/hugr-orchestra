import { expect, test } from "bun:test"
import { CapabilityOperator } from "@orchestra/core/capability/operator/index"
import { Location } from "@orchestra/core/location"
import { Project } from "@orchestra/core/project"
import { AbsolutePath } from "@orchestra/core/schema"
import { Effect, Layer, Option } from "effect"
import { HttpRouter, HttpServer } from "effect/unstable/http"
import { HttpApi, HttpApiBuilder, HttpApiMiddleware } from "effect/unstable/httpapi"
import { makeCapabilityOperatorGroup } from "@orchestra/protocol/groups/capability-operator"
import { ServerAuth } from "../src/auth"
import { ServerOperator } from "../src/operator"
import { authorizationLayer } from "../src/middleware/authorization"
import { capabilityAuthorizationLayer } from "../src/middleware/capability-authorization"
import { schemaErrorLayer } from "../src/middleware/schema-error"
import { inspect } from "../src/handlers/capability-operator"

class FixtureLocation extends HttpApiMiddleware.Service<FixtureLocation, { provides: Location.Service }>()("test/OperatorLocation") {}

test("actual operator endpoint authenticates before Location construction and returns only request provenance", async () => {
  await Effect.runPromise(Effect.scoped(Effect.gen(function* () {
    const operator = yield* CapabilityOperator.make({ principal: "ordering-host", scope: { placements: "instance", actions: ["*"] } })
    const issued = yield* operator.issue({ origin: "cli" })
    const entered = { count: 0 }
    const group = makeCapabilityOperatorGroup(FixtureLocation)
    const api = HttpApi.make("operator-ordering").add(group)
    const web = HttpRouter.toWebHandler(HttpApiBuilder.layer(api).pipe(
      Layer.provide(HttpApiBuilder.group(api, "server.capability.operator", (handlers) =>
        handlers.handle("capability.operator.inspect", () => inspect(operator)))),
      Layer.provide(Layer.succeed(FixtureLocation, FixtureLocation.of((effect) => Effect.suspend(() => {
        entered.count++
        return effect.pipe(Effect.provideService(Location.Service, Location.Service.of({
          directory: AbsolutePath.make("/operator-order"), project: { id: Project.ID.global, directory: AbsolutePath.make("/operator-order") },
        })))
      })))),
      Layer.provide(capabilityAuthorizationLayer), Layer.provide(authorizationLayer), Layer.provide(schemaErrorLayer),
      Layer.provide(Layer.succeed(ServerOperator.Service, operator)),
      Layer.provide(ServerAuth.Config.configLayer({ username: "orchestra", password: Option.none() })),
      Layer.provide(HttpServer.layerServices),
    ), { disableLogger: true })
    yield* Effect.addFinalizer(() => Effect.promise(() => web.dispose()))
    const rejected = yield* Effect.promise(() => web.handler(new Request("http://localhost/api/capability/operator?location[directory]=/caller-chosen")))
    expect(rejected.status).toBe(401)
    expect(entered.count).toBe(0)
    const accepted = yield* Effect.promise(() => web.handler(new Request("http://localhost/api/capability/operator", {
      headers: { Authorization: `Bearer ${issued.bearer}`, "x-request-id": "forged" },
    })))
    expect(accepted.status).toBe(200)
    expect(entered.count).toBe(1)
    const body = yield* Effect.promise(() => accepted.json())
    expect(body).toMatchObject({ principal: "ordering-host", origin: "cli" })
    expect(body.requestID).not.toBe("forged")
    expect(JSON.stringify(body)).not.toContain(issued.bearer)
  })))
})
