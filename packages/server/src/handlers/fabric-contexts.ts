import { ConflictError, ForbiddenError, InvalidRequestError, ServiceUnavailableError } from "@orchestra/protocol/errors"
import { FabricContext } from "@orchestra/schema/fabric-context"
import { Effect } from "effect"
import { HttpApiBuilder } from "effect/unstable/httpapi"
import { Api } from "../api"

// Acceptance scaffold only. Authentication/schema decoding are real, but no domain
// acquisition or context operation is implemented until the transport suite closes.
const unavailable = () => Effect.fail(new ServiceUnavailableError({ message: "Fabric context transport is not available" }))
export const FabricContextsHandler = HttpApiBuilder.group(Api, "server.fabric.context", (handlers) => handlers
  .handle("fabric.context.list", unavailable)
  .handle("fabric.context.preparing", unavailable)
  .handle("fabric.context.create", unavailable)
  .handle("fabric.context.resolve", unavailable)
  .handle("fabric.context.remove", unavailable))

/** Fixed public projection; never copy internal messages, paths or causes. */
export function fabricContextError(error: FabricContext.Failure) {
  switch (error.code) {
    case "invalid-input": return new InvalidRequestError({ message: "Fabric context input is invalid" })
    case "denied": return new ForbiddenError({ message: "Fabric context access is denied" })
    case "expired": return new ConflictError({ message: "Fabric context reference has expired" })
    case "conflict": return new ConflictError({ message: "Fabric context request conflicts" })
    case "limit": return new ConflictError({ message: "Fabric context limit is reached" })
    case "unavailable": return new ServiceUnavailableError({ message: "Fabric context is unavailable" })
  }
}
