import { Actions } from "@orchestra/schema/actions"
import { Location } from "@orchestra/schema/location"
import { Schema } from "effect"
import { HttpApiEndpoint, HttpApiGroup, HttpApiSchema } from "effect/unstable/httpapi"
import { ActionsApiError, BindingParams, BindingQuery, OptionalAttempt } from "./actions-common"
import { locationQueryOpenApi } from "./location"

export const TransferQuery = Schema.Struct({ ...BindingQuery.fields, ...Actions.TransferInput.fields, attempt: OptionalAttempt })

export const ActionsTransferGroup = HttpApiGroup.make("server.actionsTransfer")
  .add(HttpApiEndpoint.get("actions.transfer.info", "/api/actions/transfer/:bindingID/info", {
    params: BindingParams, query: TransferQuery, success: Location.response(Actions.TransferInfo), error: ActionsApiError,
  }).annotateMerge(locationQueryOpenApi))
  .add(HttpApiEndpoint.get("actions.transfer.read", "/api/actions/transfer/:bindingID", {
    params: BindingParams, query: TransferQuery,
    success: Schema.Uint8Array.pipe(HttpApiSchema.asUint8Array()), error: ActionsApiError,
  }).annotateMerge(locationQueryOpenApi))
