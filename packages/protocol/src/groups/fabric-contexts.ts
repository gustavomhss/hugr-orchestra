import { FabricContext } from "@orchestra/schema/fabric-context"
import { Schema } from "effect"
import { HttpApiEndpoint, HttpApiGroup } from "effect/unstable/httpapi"
import { ConflictError, ForbiddenError, InvalidRequestError, ServiceUnavailableError } from "../errors"
import { CapabilityAuthorization } from "../middleware/capability-authorization"

const PageQuery = Schema.Struct({
  after: FabricContext.Query.fields.after,
  limit: Schema.NumberFromString.pipe(Schema.decodeTo(FabricContext.Query.fields.limit), Schema.optionalKey),
}).annotate({ parseOptions: { onExcessProperty: "error" } })
const ResolveQuery = Schema.Struct({
  generation: Schema.NumberFromString.pipe(Schema.decodeTo(FabricContext.Ref.fields.generation)),
}).annotate({ parseOptions: { onExcessProperty: "error" } })
const MutationHeaders = Schema.Struct({ "idempotency-key": Schema.NonEmptyString })
const errors = [InvalidRequestError, ForbiddenError, ConflictError, ServiceUnavailableError]

// Bootstrap is authenticated but has no caller-selected Location to construct.
export const FabricContextsGroup = HttpApiGroup.make("server.fabric.context")
  .add(
    HttpApiEndpoint.get("fabric.context.list", "/api/fabric/contexts", {
      query: PageQuery, success: FabricContext.Page, error: errors,
    }),
    HttpApiEndpoint.get("fabric.context.preparing", "/api/fabric/contexts/preparing", {
      query: PageQuery, success: FabricContext.Page, error: errors,
    }),
    HttpApiEndpoint.post("fabric.context.create", "/api/fabric/contexts", {
      query: FabricContext.Create, headers: MutationHeaders, payload: FabricContext.Create,
      success: FabricContext.Info, error: errors,
    }),
    HttpApiEndpoint.get("fabric.context.resolve", "/api/fabric/contexts/:id", {
      params: { id: FabricContext.ID }, query: ResolveQuery, success: FabricContext.Info, error: errors,
    }),
    HttpApiEndpoint.post("fabric.context.remove", "/api/fabric/contexts/remove", {
      query: FabricContext.Create, headers: MutationHeaders, payload: FabricContext.Ref,
      success: FabricContext.Ref, error: errors,
    }),
  )
  .middleware(CapabilityAuthorization)
