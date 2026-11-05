export * as FabricContext from "./fabric-context"

import { Schema } from "effect"
import { ascending } from "./identifier"
import { Location } from "./location"
import { PositiveInt, optional, statics } from "./schema"

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

// Only routing metadata is projected; credentials, store and principal remain host-owned.
export interface Info extends Schema.Schema.Type<typeof Info> {}
export const Info = Schema.Struct({ context: Ref, location: Location.Info })
  .annotate({ identifier: "FabricContext.Info", parseOptions: { onExcessProperty: "error" } })

export interface Create extends Schema.Schema.Type<typeof Create> {}
export const Create = Schema.Struct({})
  .annotate({ identifier: "FabricContext.Create", parseOptions: { onExcessProperty: "error" } })

export interface Query extends Schema.Schema.Type<typeof Query> {}
export const Query = Schema.Struct({ after: optional(ID), limit: optional(PositiveInt.check(Schema.isLessThanOrEqualTo(32))) })
  .annotate({ identifier: "FabricContext.Query", parseOptions: { onExcessProperty: "error" } })

export interface Page extends Schema.Schema.Type<typeof Page> {}
export const Page = Schema.Struct({ items: Schema.Array(Ref).check(Schema.isMaxLength(32)), after: optional(ID) })
  .annotate({ identifier: "FabricContext.Page", parseOptions: { onExcessProperty: "error" } })

export class Failure extends Schema.TaggedErrorClass<Failure>()("FabricContext.Failure", {
  code: Schema.Literals(["invalid-input", "denied", "expired", "conflict", "unavailable", "limit"]),
  message: Schema.String,
}) {}
