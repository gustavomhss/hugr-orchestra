import { Integration } from "@orchestra/core/integration"
import { Effect } from "effect"
import { HttpApiBuilder, HttpApiSchema } from "effect/unstable/httpapi"
import { Api } from "../api"
import { ConflictError, InvalidRequestError } from "@orchestra/protocol/errors"
import { response } from "../location"

const authorize = <A, R>(effect: Effect.Effect<A, Integration.AuthorizationError, R>) =>
  effect.pipe(
    Effect.mapError(
      () =>
        new InvalidRequestError({
          message: "Authentication failed",
          kind: "integration_authorization",
        }),
    ),
  )

const complete = <R>(effect: Effect.Effect<void, Integration.CodeRequiredError | Integration.AuthorizationError, R>) =>
  effect.pipe(
    Effect.mapError(
      (error) =>
        new InvalidRequestError({
          message:
            error._tag === "Integration.CodeRequired" ? "Authorization code is required" : "Authentication failed",
          kind: error._tag === "Integration.CodeRequired" ? "integration_code_required" : "integration_authorization",
        }),
    ),
  )

const status = <A, R>(effect: Effect.Effect<A, Integration.AuthorizationError, R>) =>
  effect.pipe(
    Effect.mapError(
      () =>
        new InvalidRequestError({
          message: "OAuth attempt not found",
          kind: "integration_attempt_not_found",
        }),
    ),
  )

const requireOwner = Effect.fn("IntegrationHandler.requireOwner")(function* (
  service: Integration.Interface,
  params: { attemptID: Integration.AttemptID; integrationID: Integration.ID },
) {
  const current = yield* status(service.attempt.status(params.attemptID))
  if (yield* service.attempt.ownedBy(params.attemptID, params.integrationID)) return current
  return yield* new InvalidRequestError({
    message: "OAuth attempt does not belong to this integration",
    kind: "integration_attempt_owner",
  })
})

export const IntegrationHandler = HttpApiBuilder.group(Api, "server.integration", (handlers) =>
  Effect.gen(function* () {
    return handlers
      .handle(
        "integration.list",
        Effect.fn(function* () {
          const service = yield* Integration.Service
          return yield* response(service.list())
        }),
      )
      .handle(
        "integration.get",
        Effect.fn(function* (ctx) {
          const service = yield* Integration.Service
          return yield* response(service.get(ctx.params.integrationID))
        }),
      )
      .handle(
        "integration.disconnect",
        Effect.fn(function* (ctx) {
          const service = yield* Integration.Service
          yield* service.connection.disconnect(ctx.params.integrationID).pipe(
            Effect.catchTag("Credential.InheritedError", (error) =>
              Effect.fail(new ConflictError({ message: error.message, resource: "credential" })),
            ),
          )
          return HttpApiSchema.NoContent.make()
        }),
      )
      .handle(
        "integration.connect.key",
        Effect.fn(function* (ctx) {
          const service = yield* Integration.Service
          yield* authorize(
            service.connection.key({
              integrationID: ctx.params.integrationID,
              key: ctx.payload.key,
              label: ctx.payload.label,
            }),
          )
          return HttpApiSchema.NoContent.make()
        }),
      )
      .handle(
        "integration.connect.oauth",
        Effect.fn(function* (ctx) {
          const service = yield* Integration.Service
          return yield* response(
            authorize(
              service.connection.oauth({
                integrationID: ctx.params.integrationID,
                methodID: ctx.payload.methodID,
                inputs: ctx.payload.inputs,
                label: ctx.payload.label,
              }),
            ),
          )
        }),
      )
      .handle(
        "integration.oauth.status",
        Effect.fn(function* (ctx) {
          const service = yield* Integration.Service
          return yield* response(requireOwner(service, ctx.params))
        }),
      )
      .handle(
        "integration.oauth.complete",
        Effect.fn(function* (ctx) {
          const service = yield* Integration.Service
          yield* requireOwner(service, ctx.params)
          yield* complete(service.attempt.complete({ attemptID: ctx.params.attemptID, code: ctx.payload.code }))
          return HttpApiSchema.NoContent.make()
        }),
      )
      .handle(
        "integration.oauth.cancel",
        Effect.fn(function* (ctx) {
          const service = yield* Integration.Service
          yield* requireOwner(service, ctx.params)
          yield* service.attempt.cancel(ctx.params.attemptID)
          return HttpApiSchema.NoContent.make()
        }),
      )
      .handle(
        "integration.attempt.status",
        Effect.fn(function* (ctx) {
          const service = yield* Integration.Service
          return yield* response(status(service.attempt.status(ctx.params.attemptID)))
        }),
      )
      .handle(
        "integration.attempt.complete",
        Effect.fn(function* (ctx) {
          const service = yield* Integration.Service
          yield* complete(service.attempt.complete({ attemptID: ctx.params.attemptID, code: ctx.payload.code }))
          return HttpApiSchema.NoContent.make()
        }),
      )
      .handle(
        "integration.attempt.cancel",
        Effect.fn(function* (ctx) {
          const service = yield* Integration.Service
          yield* service.attempt.cancel(ctx.params.attemptID)
          return HttpApiSchema.NoContent.make()
        }),
      )
  }),
)
