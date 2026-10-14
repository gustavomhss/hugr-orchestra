import { Actions } from "@orchestra/schema/actions"
import { Location } from "@orchestra/schema/location"
import { Schema } from "effect"
import { HttpApiEndpoint, HttpApiGroup } from "effect/unstable/httpapi"
import { ActionsApiError, BindingParams, BindingQuery, OptionalLimit } from "./actions-common"
import { locationQueryOpenApi } from "./location"

const Query = Schema.Struct({ ...BindingQuery.fields, ...Actions.ResourceListInput.fields, limit: OptionalLimit })
const CommandParams = Schema.Struct({ ...BindingParams.fields, resourceKind: Actions.ResourceKind,
  action: Schema.Literals(["create", "update", "delete", "play", "pause", "keep", "clear"]) })

export const ActionsResourceGroup = HttpApiGroup.make("server.actionsResource")
  .add(HttpApiEndpoint.get("actions.resource.list", "/api/actions/resource/:bindingID", {
    params: BindingParams, query: Query, success: Location.response(Actions.ResourcePage), error: ActionsApiError,
  }).annotateMerge(locationQueryOpenApi))
  .add(HttpApiEndpoint.post("actions.resource.command", "/api/actions/resource/:bindingID/:resourceKind/:action", {
    params: CommandParams, query: BindingQuery, payload: Actions.ResourceCommand,
    success: Location.response(Actions.CommandExecution), error: ActionsApiError,
  }).annotateMerge(locationQueryOpenApi))
