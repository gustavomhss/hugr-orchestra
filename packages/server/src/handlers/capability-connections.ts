import { CapabilityConnectionManagement } from "@orchestra/core/capability/connection/management"
import { CapabilityConnectionStore } from "@orchestra/core/capability/connection/store"
import type { CapabilityConnectionStoreContract } from "@orchestra/core/capability/connection/store-contract"
import { Database } from "@orchestra/core/database/database"
import { Location } from "@orchestra/core/location"
import { ForbiddenError } from "@orchestra/protocol/errors"
import { Capability } from "@orchestra/schema/capability"
import { Cause, Context, Effect } from "effect"
import { HttpApiBuilder } from "effect/unstable/httpapi"
import { Api } from "../api"
import { capabilityError } from "../middleware/capability-authorization"
import { ServerOperator } from "../operator"

export const CapabilityConnectionsHandler = HttpApiBuilder.group(Api, "server.capability.connections", (handlers) =>
  Effect.gen(function* () {
    const operators = yield* ServerOperator.Service
    const database = yield* Database.Service
    const store = yield* CapabilityConnectionStore.make
    // Cursor encryption keys belong to this handler layer, never an individual request.
    const management = yield* CapabilityConnectionManagement.make({ operators, store }).pipe(
      Effect.provideService(Database.Service, database),
    )
    return handlers
      .handle("capability.connection.list", ({ query }) => Effect.gen(function* () {
        const location = yield* Location.Service
        return yield* management.list({ projectID: location.project.id,
          location: Location.Ref.make({ directory: location.directory, workspaceID: location.workspaceID }) },
          { ...(query.after === undefined ? {} : { after: query.after }),
            ...(query.limit === undefined ? {} : { limit: query.limit }) })
      }).pipe(connectionResponse))
      .handle("capability.connection.get", ({ params }) => management.get(params.connectionID).pipe(connectionResponse))
      .handle("capability.connection.targets", ({ params, query }) =>
        management.targets(params.connectionID, { ...(query.after === undefined ? {} : { after: query.after }),
          ...(query.limit === undefined ? {} : { limit: query.limit }) }).pipe(connectionResponse))
      .handle("capability.connection.disconnect", ({ payload }) => management.disconnect(payload).pipe(connectionResponse))
      .handle("capability.target.create", ({ payload }) => management.createTarget(payload).pipe(connectionResponse))
      .handle("capability.target.retarget", ({ payload }) => management.retargetTarget(payload).pipe(connectionResponse))
      .handle("capability.target.remove", ({ payload }) => management.removeTarget(payload).pipe(connectionResponse))
      .handle("capability.binding.put", ({ payload }) => management.bind(payload).pipe(connectionResponse))
      .handle("capability.binding.remove", ({ payload }) => management.unbind(payload).pipe(connectionResponse))
  }),
)

export function connectionResponse<A, R>(effect: Effect.Effect<A, CapabilityConnectionStoreContract.Error, R>) {
  return effect.pipe(Effect.catchCause((cause) => Effect.failCause(Cause.fromReasons(cause.reasons.flatMap((reason) => {
    if (reason._tag !== "Fail") return [reason]
    return Cause.fail(reason.error instanceof Capability.Failure
      ? capabilityError(reason.error)
      : new ForbiddenError({ message: "Request denied" })).reasons.map((next) =>
        next.annotate(Context.makeUnsafe(new Map(reason.annotations))))
  })))))
}
