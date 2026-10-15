import { Location } from "@orchestra/core/location"
import { Cause, Context, Effect, Exit } from "effect"
import { HttpApiBuilder } from "effect/unstable/httpapi"
import { Api } from "../api"
import { ServerOperator } from "../operator"
import { capabilityError } from "../middleware/capability-authorization"
import type { CapabilityOperatorContract } from "@orchestra/core/capability/operator/contract"

export const CapabilityOperatorHandler = HttpApiBuilder.group(Api, "server.capability.operator", (handlers) =>
  Effect.gen(function* () {
    const operator = yield* ServerOperator.Service
    return handlers.handle("capability.operator.inspect", () => inspect(operator))
  }),
)

export const inspect = (operator: CapabilityOperatorContract.Interface) => Effect.gen(function* () {
  const location = yield* Location.Service
  const binding = yield* operator.require({ action: "operator.inspect", placement: { projectID: location.project.id,
    location: Location.Ref.make({ directory: location.directory, workspaceID: location.workspaceID }) } }).pipe(
    Effect.exit, Effect.flatMap((exit) => Exit.isSuccess(exit) ? Effect.succeed(exit.value) : Effect.failCause(
      Cause.fromReasons(exit.cause.reasons.flatMap((reason) => reason._tag === "Fail"
        ? Cause.fail(capabilityError(reason.error)).reasons.map((next) => next.annotate(Context.makeUnsafe(new Map(reason.annotations))))
        : [reason])),
    )),
  )
  return { requestID: binding.requestID, principal: binding.principal, origin: binding.origin, scopeHash: binding.scopeHash }
})
