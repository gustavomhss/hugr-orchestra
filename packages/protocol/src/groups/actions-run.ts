import { Actions } from "@orchestra/schema/actions"
import { Location } from "@orchestra/schema/location"
import { Schema } from "effect"
import { HttpApiEndpoint, HttpApiGroup } from "effect/unstable/httpapi"
import { ActionsApiError, BindingParams, BindingQuery, OptionalAttempt, OptionalLimit } from "./actions-common"
import { locationQueryOpenApi } from "./location"

const Params = Schema.Struct({ ...BindingParams.fields, runID: Schema.NonEmptyString })
const ListQuery = Schema.Struct({ ...BindingQuery.fields, ...Actions.RunListInput.fields, limit: OptionalLimit })
const JobsQuery = Schema.Struct({ ...BindingQuery.fields, attempt: OptionalAttempt, cursor: Schema.optional(Schema.String) })

export const ActionsRunGroup = HttpApiGroup.make("server.actionsRun")
  .add(HttpApiEndpoint.get("actions.run.list", "/api/actions/run/:bindingID", {
    params: BindingParams, query: ListQuery, success: Location.response(Actions.RunPage), error: ActionsApiError,
  }).annotateMerge(locationQueryOpenApi))
  .add(HttpApiEndpoint.get("actions.run.get", "/api/actions/run/:bindingID/:runID", {
    params: Params, query: BindingQuery, success: Location.response(Actions.Run), error: ActionsApiError,
  }).annotateMerge(locationQueryOpenApi))
  .add(HttpApiEndpoint.get("actions.run.jobs", "/api/actions/run/:bindingID/:runID/jobs", {
    params: Params, query: JobsQuery, success: Location.response(Actions.JobPage), error: ActionsApiError,
  }).annotateMerge(locationQueryOpenApi))
  .add(HttpApiEndpoint.post("actions.run.retry", "/api/actions/run/:bindingID/:runID/retry", {
    params: Params, query: BindingQuery, payload: Actions.RetryCommand,
    success: Location.response(Actions.CommandExecution), error: ActionsApiError,
  }).annotateMerge(locationQueryOpenApi))
  .add(HttpApiEndpoint.post("actions.run.cancel", "/api/actions/run/:bindingID/:runID/cancel", {
    params: Params, query: BindingQuery, payload: Actions.ProviderCommand,
    success: Location.response(Actions.CommandExecution), error: ActionsApiError,
  }).annotateMerge(locationQueryOpenApi))
  .add(HttpApiEndpoint.post("actions.run.forceCancel", "/api/actions/run/:bindingID/:runID/force-cancel", {
    params: Params, query: BindingQuery, payload: Actions.GitHubCommand,
    success: Location.response(Actions.CommandExecution), error: ActionsApiError,
  }).annotateMerge(locationQueryOpenApi))
  .add(HttpApiEndpoint.delete("actions.run.remove", "/api/actions/run/:bindingID/:runID", {
    params: Params, query: BindingQuery, payload: Actions.ProviderCommand,
    success: Location.response(Actions.CommandExecution), error: ActionsApiError,
  }).annotateMerge(locationQueryOpenApi))
  .add(HttpApiEndpoint.post("actions.run.approveFork", "/api/actions/run/:bindingID/:runID/approve-fork", {
    params: Params, query: BindingQuery, payload: Actions.GitHubCommand,
    success: Location.response(Actions.CommandExecution), error: ActionsApiError,
  }).annotateMerge(locationQueryOpenApi))
  .add(HttpApiEndpoint.put("actions.run.rename", "/api/actions/run/:bindingID/:runID/name", {
    params: Params, query: BindingQuery, payload: Actions.RenameCommand,
    success: Location.response(Actions.CommandExecution), error: ActionsApiError,
  }).annotateMerge(locationQueryOpenApi))
