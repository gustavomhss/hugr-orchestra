import { Actions } from "@orchestra/schema/actions"
import { Location } from "@orchestra/schema/location"
import { Schema } from "effect"
import { HttpApiEndpoint, HttpApiGroup } from "effect/unstable/httpapi"
import { ActionsApiError, BindingParams, BindingQuery, OptionalLimit } from "./actions-common"
import { locationQueryOpenApi } from "./location"

const ListQuery = Schema.Struct({ ...BindingQuery.fields, ...Actions.ListInput.fields, limit: OptionalLimit })
const SourceQuery = Schema.Struct({ ...BindingQuery.fields, path: Schema.NonEmptyString, ref: Schema.NonEmptyString })
const WorkflowParams = Schema.Struct({ ...BindingParams.fields, workflowID: Schema.NonEmptyString })

export const ActionsWorkflowGroup = HttpApiGroup.make("server.actionsWorkflow")
  .add(HttpApiEndpoint.get("actions.workflow.list", "/api/actions/workflow/:bindingID", {
    params: BindingParams, query: ListQuery, success: Location.response(Actions.WorkflowPage), error: ActionsApiError,
  }).annotateMerge(locationQueryOpenApi))
  .add(HttpApiEndpoint.get("actions.workflow.source", "/api/actions/workflow/:bindingID/source", {
    params: BindingParams, query: SourceQuery, success: Location.response(Actions.Source), error: ActionsApiError,
  }).annotateMerge(locationQueryOpenApi))
  .add(HttpApiEndpoint.get("actions.workflow.graph", "/api/actions/workflow/:bindingID/graph", {
    params: BindingParams, query: SourceQuery, success: Location.response(Actions.Graph), error: ActionsApiError,
  }).annotateMerge(locationQueryOpenApi))
  .add(HttpApiEndpoint.post("actions.workflow.dispatch", "/api/actions/workflow/:bindingID/:workflowID/dispatch", {
    params: WorkflowParams, query: BindingQuery, payload: Actions.DispatchCommand,
    success: Location.response(Actions.CommandExecution), error: ActionsApiError,
  }).annotateMerge(locationQueryOpenApi))
  .add(HttpApiEndpoint.put("actions.workflow.state", "/api/actions/workflow/:bindingID/:workflowID/state", {
    params: WorkflowParams, query: BindingQuery, payload: Actions.WorkflowStateCommand,
    success: Location.response(Actions.CommandExecution), error: ActionsApiError,
  }).annotateMerge(locationQueryOpenApi))
