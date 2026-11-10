export * as FabricConnection from "./fabric-connection"

import { Schema } from "effect"
import { FabricContext } from "./fabric-context"
import { FabricIdentityAttempt } from "./fabric-identity-attempt"
import { FabricResource } from "./fabric-resource"
import { PositiveInt } from "./schema"

// Exact existing canonical connection identity, not a new brand, generator or Capability connection.
export const ID = FabricResource.ConnectionID
export type ID = FabricResource.ConnectionID
export interface Ref extends Schema.Schema.Type<typeof Ref> {}
export const Ref = Schema.Struct({ id: ID, generation: PositiveInt }).annotate({
  identifier: "FabricConnection.Ref",
  parseOptions: { onExcessProperty: "error" },
})
export interface Selection extends Schema.Schema.Type<typeof Selection> {}
export const Selection = Schema.Struct({ context: FabricContext.Ref, connection: Ref }).annotate({
  identifier: "FabricConnection.Selection",
  parseOptions: { onExcessProperty: "error" },
})
const uuid = Schema.String.check(
  Schema.isPattern(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(?![\s\S])/),
)
export interface Info extends Schema.Schema.Type<typeof Info> {}
export const Info = Schema.Struct({
  connection: Ref,
  context: FabricContext.Ref,
  state: Schema.Literal("connected"),
  cloud: Schema.Literal("public"),
  tenantID: uuid,
  objectID: uuid,
  homeAccountID: Schema.String.check(Schema.isPattern(/^[A-Za-z0-9._-]{1,512}(?![\s\S])/)),
  scopes: FabricIdentityAttempt.Scopes,
}).annotate({ identifier: "FabricConnection.Info", parseOptions: { onExcessProperty: "error" } })
export interface Published extends Schema.Schema.Type<typeof Published> {}
export const Published = Schema.Struct({ attempt: FabricIdentityAttempt.Ref, connection: Ref }).annotate({
  identifier: "FabricConnection.Published",
  parseOptions: { onExcessProperty: "error" },
})
export class Failure extends Schema.TaggedErrorClass<Failure>()("FabricConnection.Failure", {
  code: Schema.Literals(["invalid-input", "denied", "expired", "conflict", "unavailable", "limit"]),
  message: Schema.String,
}) {}
