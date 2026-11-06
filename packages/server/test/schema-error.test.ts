import { expect, test } from "bun:test"
import { Effect, Layer, Schema } from "effect"
import { HttpRouter, HttpServer } from "effect/unstable/http"
import { HttpApi, HttpApiBuilder, HttpApiEndpoint, HttpApiGroup } from "effect/unstable/httpapi"
import { SchemaErrorMiddleware, schemaErrorLayer } from "../src/middleware/schema-error"

const api = HttpApi.make("schema-error-control").add(HttpApiGroup.make("other-product")
  .add(HttpApiEndpoint.get("read", "/control", {
    query: Schema.Struct({ value: Schema.Literal("allowed") }), success: Schema.String,
  }))).middleware(SchemaErrorMiddleware)

test("SEM01 non-Fabric schema rejection keeps its existing public reason and valid requests still execute", () =>
  Effect.runPromise(Effect.scoped(Effect.gen(function* () {
    const web = HttpRouter.toWebHandler(HttpApiBuilder.layer(api).pipe(
      Layer.provide(HttpApiBuilder.group(api, "other-product", (handlers) =>
        handlers.handle("read", (ctx) => Effect.succeed(ctx.query.value)))),
      Layer.provide(schemaErrorLayer), Layer.provide(HttpServer.layerServices),
    ), { disableLogger: true })
    yield* Effect.addFinalizer(() => Effect.promise(() => web.dispose()))
    const valid = yield* Effect.promise(() => web.handler(new Request("http://schema.fixture/control?value=allowed")))
    expect(valid.status).toBe(200)
    expect(yield* Effect.promise(() => valid.json())).toBe("allowed")
    const invalid = yield* Effect.promise(() => web.handler(new Request("http://schema.fixture/control?value=control-non-fabric")))
    expect(invalid.status).toBe(400)
    const body = yield* Effect.promise(() => invalid.json()).pipe(Effect.flatMap(Schema.decodeUnknownEffect(
      Schema.Struct({ _tag: Schema.Literal("InvalidRequestError"), message: Schema.String, kind: Schema.String }),
    )))
    expect(body.message).toContain("allowed")
    expect(body.message).not.toContain("Fabric context input is invalid")
  }))))
