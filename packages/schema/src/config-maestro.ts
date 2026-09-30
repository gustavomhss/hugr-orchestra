export * as ConfigMaestro from "./config-maestro"

import { Schema } from "effect"
import { optional } from "./schema"

export interface Info extends Schema.Schema.Type<typeof Info> {}
export const Info = Schema.Struct({
  atlas: optional(
    Schema.Struct({
      projectID: Schema.NonEmptyString,
      directory: Schema.NonEmptyString,
      sourceDirectory: optional(Schema.NonEmptyString),
    }),
  ),
}).annotate({ identifier: "Config.Maestro" })
