export * as FabricRecord from "./fabric-record"

import { Schema } from "effect"
import { PositiveInt, optional, statics } from "./schema"
import { FabricContext } from "./fabric-context"

export const ID = Schema.String.check(
  Schema.isPattern(/^frec_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(?![\s\S])/),
)
  .annotate({ identifier: "FabricRecord.ID" })
  .pipe(
    Schema.brand("FabricRecord.ID"),
    statics((schema) => ({ create: () => schema.make(`frec_${crypto.randomUUID()}`) })),
  )
export type ID = typeof ID.Type

export const Kind = Schema.Literals(["composition", "draft", "evidence", "receipt", "environment", "definition"])
export type Kind = typeof Kind.Type

export interface Ref extends Schema.Schema.Type<typeof Ref> {}
export const Ref = Schema.Struct({ id: ID, kind: Kind, revision: PositiveInt }).annotate({
  identifier: "FabricRecord.Ref",
  parseOptions: { onExcessProperty: "error" },
})

export interface Query extends Schema.Schema.Type<typeof Query> {}
export const Query = Schema.Struct({
  context: FabricContext.Ref,
  kind: Kind,
  after: optional(ID),
  limit: optional(PositiveInt.check(Schema.isLessThanOrEqualTo(32))),
}).annotate({ identifier: "FabricRecord.Query", parseOptions: { onExcessProperty: "error" } })

export interface Page extends Schema.Schema.Type<typeof Page> {}
export const Page = Schema.Struct({
  items: Schema.Array(Ref).check(Schema.isMaxLength(32)),
  after: optional(ID),
}).annotate({ identifier: "FabricRecord.Page", parseOptions: { onExcessProperty: "error" } })

export class Failure extends Schema.TaggedErrorClass<Failure>()("FabricRecord.Failure", {
  code: Schema.Literals(["invalid-input", "denied", "expired", "conflict", "unavailable", "limit"]),
  message: Schema.String,
}) {}
