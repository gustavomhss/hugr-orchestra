import { Actions } from "@orchestra/schema/actions"
import { Location } from "@orchestra/schema/location"
import { Schema } from "effect"
import { HttpApiEndpoint, HttpApiGroup } from "effect/unstable/httpapi"
import { ActionsApiError, BindingParams, BindingQuery } from "./actions-common"
import { locationQueryOpenApi } from "./location"

const MergeRequestParams = Schema.Struct({ ...BindingParams.fields, mergeRequestID: Schema.NonEmptyString })

export const ActionsPipelineGroup = HttpApiGroup.make("server.actionsPipeline")
  .add(HttpApiEndpoint.post("actions.pipeline.mergeRequest", "/api/actions/pipeline/:bindingID/merge-request/:mergeRequestID", {
    params: MergeRequestParams, query: BindingQuery, payload: Actions.MergeRequestCommand,
    success: Location.response(Actions.CommandExecution), error: ActionsApiError,
  }).annotateMerge(locationQueryOpenApi))
  .add(HttpApiEndpoint.post("actions.pipeline.trigger", "/api/actions/pipeline/:bindingID/trigger", {
    params: BindingParams, query: BindingQuery, payload: Actions.TriggerPipelineCommand,
    success: Location.response(Actions.CommandExecution), error: ActionsApiError,
  }).annotateMerge(locationQueryOpenApi))
