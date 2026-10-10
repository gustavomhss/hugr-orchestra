import { randomUUID } from "node:crypto"
import { ForbiddenError, UnauthorizedError } from "@orchestra/protocol/errors"
import { CapabilityAuthorization } from "@orchestra/protocol/middleware/capability-authorization"
export { CapabilityAuthorization } from "@orchestra/protocol/middleware/capability-authorization"
import { Capability } from "@orchestra/schema/capability"
import { Cause, Context, Effect, Encoding, Layer, Redacted, Result } from "effect"
import { HttpServerRequest } from "effect/unstable/http"
import { ServerAuth } from "../auth"
import { ServerOperator } from "../operator"

export const capabilityAuthorizationLayer = Layer.effect(
  CapabilityAuthorization,
  Effect.gen(function* () {
    const config = yield* ServerAuth.Config
    const operator = yield* ServerOperator.Service

    return CapabilityAuthorization.of((effect) =>
      Effect.gen(function* () {
        const request = yield* HttpServerRequest.HttpServerRequest
        const authority = yield* Effect.gen(function* () {
          if (ServerAuth.required(config)) {
            const credential = decodeBasic(request.headers.authorization ?? "")
            if (!credential || !ServerAuth.authorized(credential, config)) {
              return yield* new UnauthorizedError({ message: "Authentication required" })
            }
            return operator.configured
          }

          const bearer = /^Bearer ([A-Za-z0-9_-]{43})(?![\s\S])/.exec(request.headers.authorization ?? "")
          if (!bearer) return yield* new UnauthorizedError({ message: "Authentication required" })
          return yield* operator.authenticate(bearer[1])
        })

        const idempotencyKey = request.headers["idempotency-key"]
        if (idempotencyKey !== undefined && !/^[A-Za-z0-9_-]{1,128}(?![\s\S])/.test(idempotencyKey)) {
          return yield* new ForbiddenError({ message: "Request denied" })
        }

        // Only Core's private request frame carries authority. Caller-supplied IDs are not grants.
        return yield* operator.withRequest(authority, { requestID: randomUUID(), idempotencyKey }, effect)
      }).pipe(
        // Keep every defect, interrupt and failure annotation, including mixed lifecycle causes.
        Effect.catchCause((cause) =>
          Effect.failCause(
            Cause.fromReasons(
              cause.reasons.flatMap((reason) => {
                if (reason._tag !== "Fail") return [reason]
                return Cause.fail(
                  reason.error instanceof Capability.Failure ? capabilityError(reason.error) : reason.error,
                ).reasons.map((next) => next.annotate(Context.makeUnsafe(new Map(reason.annotations))))
              }),
            ),
          ),
        ),
      ),
    )
  }),
)

function decodeBasic(header: string) {
  const match = /^Basic ([A-Za-z0-9+/]+={0,2})(?![\s\S])/i.exec(header)
  if (!match) return undefined
  const decoded = Encoding.decodeBase64String(match[1])
  if (Result.isFailure(decoded) || Encoding.encodeBase64(decoded.success) !== match[1]) return undefined
  const separator = decoded.success.indexOf(":")
  if (separator === -1) return undefined
  return {
    username: decoded.success.slice(0, separator),
    password: Redacted.make(decoded.success.slice(separator + 1)),
  }
}

function capabilityError(error: Capability.Failure) {
  if (error.code === "authentication_required" || error.code === "authentication_revoked") {
    return new UnauthorizedError({ message: "Authentication required" })
  }
  return new ForbiddenError({ message: "Request denied" })
}
