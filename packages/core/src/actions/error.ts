export * as ActionsErrors from "./error"

import { Actions } from "@orchestra/schema/actions"
import { Schema } from "effect"

export class ActionsError extends Schema.TaggedErrorClass<ActionsError>()("ActionsError", Actions.ErrorData.fields) {}
