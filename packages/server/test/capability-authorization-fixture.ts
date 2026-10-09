export * as CapabilityAuthorizationFixture from "./capability-authorization-fixture"

import { CapabilityOperator } from "@orchestra/core/capability/operator/index"
import type { CapabilityOperatorContract } from "@orchestra/core/capability/operator/contract"
import { InvalidRequestError } from "@orchestra/protocol/errors"
import { CapabilityAuthorization } from "@orchestra/protocol/middleware/capability-authorization"
import { Capability } from "@orchestra/schema/capability"
import { Project } from "@orchestra/schema/project"
import { AbsolutePath } from "@orchestra/schema/schema"
import { Cause, Context, Effect, Exit, Layer, Option, Schema, Scope } from "effect"
import { HttpRouter, HttpServer } from "effect/unstable/http"
import { HttpApi, HttpApiBuilder, HttpApiEndpoint, HttpApiGroup, HttpApiMiddleware } from "effect/unstable/httpapi"
import { ServerAuth } from "../src/auth"
import { capabilityAuthorizationLayer } from "../src/middleware/capability-authorization"
import { ServerOperator } from "../src/operator"

export const placement = {
  projectID: Project.ID.make("operator-http-project"),
  location: { directory: AbsolutePath.make("/operator-http") },
}
export const resource = { kind: "connection", id: "connection-one" }
export const target = { action: "connection.read", placement, resource }
export const scope: CapabilityOperatorContract.GrantScope = {
  placements: [placement], actions: [target.action], resources: [resource],
}

const Binding = Schema.Struct({
  principal: Schema.String,
  origin: Schema.String,
  scopeHash: Schema.String,
  requestID: Schema.String,
  idempotencyKey: Schema.optional(Schema.String),
})

// Observe the real middleware boundary before HttpApiBuilder encodes typed endpoint errors.
class Observe extends HttpApiMiddleware.Service<Observe>()("test/CapabilityAuthorizationObserve") {}

const Api = HttpApi.make("test.operator-http").add(HttpApiGroup.make("fixture").add(
  HttpApiEndpoint.post("guarded", "/guarded", {
    payload: Schema.Unknown,
    success: Binding,
    error: [Capability.Failure, InvalidRequestError],
  }).middleware(CapabilityAuthorization).middleware(Observe),
  HttpApiEndpoint.get("health", "/health", { success: Schema.Boolean }),
))

export function make(options?: {
  password?: Option.Option<string>
  scope?: CapabilityOperatorContract.GrantScope
  now?: () => number
  onBinding?: (binding: CapabilityOperatorContract.Binding, operator: CapabilityOperatorContract.Interface) =>
    Effect.Effect<void, Capability.Failure | InvalidRequestError>
}) {
  return Effect.gen(function* () {
    const authorityScope = yield* Scope.make()
    yield* Effect.addFinalizer(() => Scope.close(authorityScope, Exit.void))
    const operator = yield* CapabilityOperator.make({
      principal: "host-operator",
      scope: options?.scope ?? scope,
      now: options?.now,
      ttlMillis: 3_600_000,
    }).pipe(Scope.provide(authorityScope))
    const domain: { target: CapabilityOperatorContract.Target; entered: number; reads: number; effects: number } = {
      target, entered: 0, reads: 0, effects: 0,
    }
    const causes: Cause.Cause<unknown>[] = []
    const services = Layer.mergeAll(
      ServerAuth.Config.configLayer({ username: "operator-basic", password: options?.password ?? Option.none() }),
      Layer.succeed(ServerOperator.Service, operator),
    )
    const handlers = HttpApiBuilder.group(Api, "fixture", (handlers) =>
      Effect.gen(function* () {
        const facade = yield* ServerOperator.Service
        return handlers.handle("guarded", () => Effect.gen(function* () {
          domain.entered += 1
          const binding = yield* facade.require(domain.target)
          if (options?.onBinding) yield* options.onBinding(binding, facade)
          yield* facade.validate(binding, domain.target)
          domain.reads += 1
          domain.effects += 1
          return {
            principal: binding.principal,
            origin: binding.origin,
            scopeHash: binding.scopeHash,
            requestID: binding.requestID,
            ...(binding.idempotencyKey === undefined ? {} : { idempotencyKey: binding.idempotencyKey }),
          }
        })).handle("health", () => Effect.succeed(true))
      }),
    )
    const web = HttpRouter.toWebHandler(HttpApiBuilder.layer(Api).pipe(
      Layer.provide(handlers),
      Layer.provide(Layer.succeed(Observe, Observe.of((effect) => effect.pipe(
        Effect.tapCause((cause) => Effect.sync(() => { causes.push(cause) })),
      )))),
      Layer.provide(capabilityAuthorizationLayer),
      Layer.provide(services),
      Layer.provide(HttpServer.layerServices),
    ), { disableLogger: true })
    yield* Effect.addFinalizer(() => Effect.promise(() => web.dispose()))

    return {
      operator, domain, causes,
      closeAuthority: Scope.close(authorityScope, Exit.void),
      health: Effect.promise(() => web.handler(new Request("http://localhost/health"))),
      request: (input?: { headers?: HeadersInit; query?: string; payload?: unknown; context?: Context.Context<never> }) =>
        Effect.promise(() => web.handler(new Request("http://localhost/guarded" + (input?.query ?? ""), {
          method: "POST",
          headers: new Headers({ "content-type": "application/json", ...Object.fromEntries(new Headers(input?.headers)) }),
          body: JSON.stringify(input?.payload ?? {}),
        }), input?.context)),
    }
  })
}

export function binding(response: Response) {
  return Effect.promise(() => response.text()).pipe(
    Effect.flatMap(Schema.decodeUnknownEffect(Schema.UnknownFromJsonString.pipe(Schema.decodeTo(Binding)))),
  )
}
