import { Actions } from "@orchestra/schema/actions"
import { Location } from "@orchestra/schema/location"
import { Schema } from "effect"
import { HttpApiEndpoint, HttpApiGroup } from "effect/unstable/httpapi"
import { ActionsApiError, BindingParams, BindingQuery } from "./actions-common"
import { LocationQuery, locationQueryOpenApi } from "./location"

export const ActionsBindingGroup = HttpApiGroup.make("server.actionsBinding")
  .add(HttpApiEndpoint.get("actions.binding.list", "/api/actions/binding", {
    query: LocationQuery, success: Location.response(Schema.Array(Actions.Binding)), error: ActionsApiError,
  }).annotateMerge(locationQueryOpenApi))
  .add(HttpApiEndpoint.post("actions.binding.create", "/api/actions/binding", {
    query: LocationQuery, payload: Actions.BindingInput, success: Location.response(Actions.Binding), error: ActionsApiError,
  }).annotateMerge(locationQueryOpenApi))
  .add(HttpApiEndpoint.get("actions.binding.get", "/api/actions/binding/:bindingID", {
    params: BindingParams, query: BindingQuery, success: Location.response(Actions.Binding), error: ActionsApiError,
  }).annotateMerge(locationQueryOpenApi))
  .add(HttpApiEndpoint.patch("actions.binding.update", "/api/actions/binding/:bindingID", {
    params: BindingParams, query: BindingQuery, payload: Actions.BindingInput,
    success: Location.response(Actions.Binding), error: ActionsApiError,
  }).annotateMerge(locationQueryOpenApi))
  .add(HttpApiEndpoint.delete("actions.binding.remove", "/api/actions/binding/:bindingID", {
    params: BindingParams, query: BindingQuery, success: Location.response(Schema.Void), error: ActionsApiError,
  }).annotateMerge(locationQueryOpenApi))
  .add(HttpApiEndpoint.get("actions.binding.capabilities", "/api/actions/binding/:bindingID/capabilities", {
    params: BindingParams, query: BindingQuery, success: Location.response(Schema.Array(Actions.Capability)), error: ActionsApiError,
  }).annotateMerge(locationQueryOpenApi))
  .add(HttpApiEndpoint.get("actions.binding.policy", "/api/actions/binding/:bindingID/policy", {
    params: BindingParams, query: BindingQuery, success: Location.response(Actions.PolicyState), error: ActionsApiError,
  }).annotateMerge(locationQueryOpenApi))
  .add(HttpApiEndpoint.put("actions.binding.updatePolicy", "/api/actions/binding/:bindingID/policy", {
    params: BindingParams, query: BindingQuery, payload: Actions.Policy,
    success: Location.response(Actions.PolicyState), error: ActionsApiError,
  }).annotateMerge(locationQueryOpenApi))
