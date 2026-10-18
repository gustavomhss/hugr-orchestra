import { Actions } from "@orchestra/schema/actions"
import { Location } from "@orchestra/schema/location"
import { Schema } from "effect"
import { HttpApiEndpoint, HttpApiGroup } from "effect/unstable/httpapi"
import { ActionsApiError, BindingParams, BindingQuery } from "./actions-common"
import { locationQueryOpenApi } from "./location"

const Params = Schema.Struct({ ...BindingParams.fields, jobID: Schema.NonEmptyString })

export const ActionsJobGroup = HttpApiGroup.make("server.actionsJob")
  .add(HttpApiEndpoint.post("actions.job.retry", "/api/actions/job/:bindingID/:jobID/retry", {
    params: Params, query: BindingQuery, payload: Actions.JobRetryCommand,
    success: Location.response(Actions.CommandExecution), error: ActionsApiError,
  }).annotateMerge(locationQueryOpenApi))
  .add(HttpApiEndpoint.post("actions.job.play", "/api/actions/job/:bindingID/:jobID/play", {
    params: Params, query: BindingQuery, payload: Actions.JobPlayCommand,
    success: Location.response(Actions.CommandExecution), error: ActionsApiError,
  }).annotateMerge(locationQueryOpenApi))
  .add(HttpApiEndpoint.post("actions.job.cancel", "/api/actions/job/:bindingID/:jobID/cancel", {
    params: Params, query: BindingQuery, payload: Actions.GitLabCommand,
    success: Location.response(Actions.CommandExecution), error: ActionsApiError,
  }).annotateMerge(locationQueryOpenApi))
  .add(HttpApiEndpoint.post("actions.job.erase", "/api/actions/job/:bindingID/:jobID/erase", {
    params: Params, query: BindingQuery, payload: Actions.GitLabCommand,
    success: Location.response(Actions.CommandExecution), error: ActionsApiError,
  }).annotateMerge(locationQueryOpenApi))
