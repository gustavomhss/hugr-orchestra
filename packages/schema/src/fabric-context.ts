export * as FabricContext from "./fabric-context"

import { Schema } from "effect"
import { ascending } from "./identifier"
import { PositiveInt, statics } from "./schema"

export const ID = Schema.String.check(Schema.isPattern(/^fctx_[0-9A-Za-z]{26}(?![\s\S])/))
  .annotate({ identifier: "FabricContext.ID" })
  .pipe(
    Schema.brand("FabricContext.ID"),
    statics((schema) => ({ create: () => schema.make("fctx_" + ascending()) })),
  )
export type ID = typeof ID.Type

// A reference identifies a context; only its server-side owner/Location binding authorizes access.
export interface Ref extends Schema.Schema.Type<typeof Ref> {}
export const Ref = Schema.Struct({
  id: ID,
  generation: PositiveInt,
}).annotate({ identifier: "FabricContext.Ref", parseOptions: { onExcessProperty: "error" } })
