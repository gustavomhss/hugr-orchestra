import { Actions } from "@orchestra/schema/actions"
import { Location } from "@orchestra/schema/location"
import { Schema } from "effect"
import { HttpApiEndpoint, HttpApiGroup } from "effect/unstable/httpapi"
import { ActionsApiError, BindingParams, BindingQuery } from "./actions-common"
import { locationQueryOpenApi } from "./location"

const Params = Schema.Struct({ ...BindingParams.fields, operationID: Actions.OperationID })

// Admission and readback are common; provider writes retain domain-specific payloads/endpoints.
export const ActionsOperationGroup = HttpApiGroup.make("server.actionsOperation")
  .add(HttpApiEndpoint.post("actions.operation.prepare", "/api/actions/operation/:bindingID", {
    params: BindingParams, query: BindingQuery, payload: Actions.OperationIntent,
    success: Location.response(Actions.Operation), error: ActionsApiError,
  }).annotateMerge(locationQueryOpenApi))
  .add(HttpApiEndpoint.get("actions.operation.get", "/api/actions/operation/:bindingID/:operationID", {
    params: Params, query: BindingQuery, success: Location.response(Actions.Operation), error: ActionsApiError,
  }).annotateMerge(locationQueryOpenApi))
  .add(HttpApiEndpoint.post("actions.operation.reconcile", "/api/actions/operation/:bindingID/:operationID/reconcile", {
    params: Params, query: BindingQuery, success: Location.response(Actions.Operation), error: ActionsApiError,
  }).annotateMerge(locationQueryOpenApi))
