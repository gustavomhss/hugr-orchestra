import { Actions } from "@orchestra/core/actions"
import { ActionsApiError } from "@orchestra/protocol/groups/actions-common"
import type { BindingID } from "@orchestra/schema/actions"
import { Effect } from "effect"
import { response } from "../location"

export function bindingRef(input: { params: { bindingID: BindingID }; query: { revision: number } }) {
  return { id: input.params.bindingID, revision: input.query.revision }
}

export function result<A, R>(data: Effect.Effect<A, Actions.ActionsError, R>) {
  return response(data.pipe(Effect.mapError(apiError)))
}

export function apiError(error: Actions.ActionsError) {
  return new ActionsApiError({
    kind: error.kind, message: error.message, bindingID: error.bindingID, provider: error.provider,
    resourceID: error.resourceID, retryAfter: error.retryAfter, operationID: error.operationID,
    disposition: error.disposition,
  })
}
