import { Actions } from "@orchestra/schema/actions"
import { Location } from "@orchestra/schema/location"
import { Schema } from "effect"
import { HttpApiEndpoint, HttpApiGroup } from "effect/unstable/httpapi"
import { ActionsApiError, BindingParams, BindingQuery } from "./actions-common"
import { locationQueryOpenApi } from "./location"

const Params = Schema.Struct({ ...BindingParams.fields, action: Schema.Literals(["branch", "write", "review"]) })
const Validation = Schema.Struct({ source: Actions.Source, draft: Schema.String })
  .annotate({ identifier: "Actions.SourceValidation", parseOptions: { onExcessProperty: "error" } })
const DraftValidation = Schema.Struct({ base: Actions.SourceBase, path: Schema.NonEmptyString, draft: Schema.String })
  .annotate({ identifier: "Actions.DraftValidation", parseOptions: { onExcessProperty: "error" } })

export const ActionsSourceGroup = HttpApiGroup.make("server.actionsSource")
  .add(HttpApiEndpoint.get("actions.source.base", "/api/actions/source/:bindingID/base", {
    params: BindingParams, query: Schema.Struct({ ...BindingQuery.fields, ref: Schema.optional(Schema.NonEmptyString) }),
    success: Location.response(Actions.SourceBase), error: ActionsApiError,
  }).annotateMerge(locationQueryOpenApi))
  .add(HttpApiEndpoint.post("actions.source.validateDraft", "/api/actions/source/:bindingID/validate-draft", {
    params: BindingParams, query: BindingQuery, payload: DraftValidation,
    success: Location.response(Actions.Graph), error: ActionsApiError,
  }).annotateMerge(locationQueryOpenApi))
  .add(HttpApiEndpoint.post("actions.source.validate", "/api/actions/source/:bindingID/validate", {
    params: BindingParams, query: BindingQuery, payload: Validation,
    success: Location.response(Actions.Graph), error: ActionsApiError,
  }).annotateMerge(locationQueryOpenApi))
  .add(HttpApiEndpoint.post("actions.source.command", "/api/actions/source/:bindingID/:action", {
    params: Params, query: BindingQuery, payload: Actions.ResourceCommand,
    success: Location.response(Actions.CommandExecution), error: ActionsApiError,
  }).annotateMerge(locationQueryOpenApi))
