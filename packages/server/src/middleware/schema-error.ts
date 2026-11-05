import { Effect } from "effect"
import { HttpApiMiddleware } from "effect/unstable/httpapi"
import { InvalidRequestError } from "@orchestra/protocol/errors"
import { FabricContextsGroup } from "@orchestra/protocol/groups/fabric-contexts"
import { SchemaErrorMiddleware } from "@orchestra/protocol/middleware/schema-error"
export { SchemaErrorMiddleware } from "@orchestra/protocol/middleware/schema-error"

const REASON_LIMIT = 1024

function truncateReason(reason: string) {
  if (reason.length <= REASON_LIMIT) return reason
  return reason.slice(0, REASON_LIMIT) + `... (${reason.length - REASON_LIMIT} more chars)`
}

export const schemaErrorLayer = HttpApiMiddleware.layerSchemaErrorTransform(SchemaErrorMiddleware, (error, context) => {
  if (context.group.identifier === FabricContextsGroup.identifier) {
    // Rejected values can contain private paths; neither logs nor responses may repeat them.
    return Effect.logWarning("schema rejection").pipe(
      Effect.annotateLogs({ kind: error.kind }),
      Effect.andThen(Effect.fail(new InvalidRequestError({
        message: "Fabric context input is invalid",
        kind: error.kind,
      }))),
    )
  }
  const reason = truncateReason(error.cause.message)
  return Effect.logWarning("schema rejection").pipe(
    Effect.annotateLogs({ kind: error.kind, reason }),
    Effect.andThen(Effect.fail(new InvalidRequestError({ message: reason, kind: error.kind }))),
  )
})
