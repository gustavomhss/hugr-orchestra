import { Actions } from "@orchestra/schema/actions"
import { PositiveInt } from "@orchestra/schema/schema"
import { Schema } from "effect"
import { LocationQuery } from "./location"

export class ActionsApiError extends Schema.TaggedErrorClass<ActionsApiError>()(
  "ActionsError", Actions.ErrorData.fields, { httpApiStatus: 400 },
) {}

export const BindingParams = Schema.Struct({ bindingID: Actions.BindingID })
export const BindingQuery = Schema.Struct({
  ...LocationQuery.fields,
  revision: Schema.NumberFromString.pipe(Schema.decodeTo(PositiveInt)),
})

export const OptionalLimit = Schema.NumberFromString.pipe(Schema.decodeTo(PositiveInt), Schema.optional)
export const OptionalAttempt = OptionalLimit
