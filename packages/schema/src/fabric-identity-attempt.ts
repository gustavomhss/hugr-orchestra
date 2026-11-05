export * as FabricIdentityAttempt from "./fabric-identity-attempt"

import { Schema } from "effect"
import { FabricContext } from "./fabric-context"
import { PositiveInt, statics } from "./schema"

export const ID = Schema.String.check(Schema.isPattern(/^foat_[0-9a-f]{64}(?![\s\S])/))
  .annotate({ identifier: "FabricIdentityAttempt.ID" })
  .pipe(
    Schema.brand("FabricIdentityAttempt.ID"),
    statics((schema) => ({
      create: () =>
        schema.make(
          "foat_" +
            Array.from(crypto.getRandomValues(new Uint8Array(32)), (byte) => byte.toString(16).padStart(2, "0")).join(
              "",
            ),
        ),
    })),
  )
export type ID = typeof ID.Type

export interface Ref extends Schema.Schema.Type<typeof Ref> {}
export const Ref = Schema.Struct({ id: ID, revision: PositiveInt }).annotate({
  identifier: "FabricIdentityAttempt.Ref",
  parseOptions: { onExcessProperty: "error" },
})

// This initial admission subset is not an executable scope/capability registry or evidence of Microsoft consent.
export const Scopes = Schema.Tuple([Schema.Literal("https://api.fabric.microsoft.com/Workspace.Read.All")]).annotate({
  identifier: "FabricIdentityAttempt.Scopes",
})
export type Scopes = typeof Scopes.Type

export interface Begin extends Schema.Schema.Type<typeof Begin> {}
export const Begin = Schema.Struct({ context: FabricContext.Ref, scopes: Scopes }).annotate({
  identifier: "FabricIdentityAttempt.Begin",
  parseOptions: { onExcessProperty: "error" },
})

export interface Selection extends Schema.Schema.Type<typeof Selection> {}
export const Selection = Schema.Struct({ context: FabricContext.Ref, attempt: Ref }).annotate({
  identifier: "FabricIdentityAttempt.Selection",
  parseOptions: { onExcessProperty: "error" },
})

export interface Info extends Schema.Schema.Type<typeof Info> {}
export const Info = Schema.Struct({
  attempt: Ref,
  state: Schema.Literals(["preparing", "pending", "cancelled", "expired"]),
  expiresAt: PositiveInt,
}).annotate({ identifier: "FabricIdentityAttempt.Info", parseOptions: { onExcessProperty: "error" } })

export class Failure extends Schema.TaggedErrorClass<Failure>()("FabricIdentityAttempt.Failure", {
  code: Schema.Literals(["invalid-input", "denied", "expired", "conflict", "unavailable", "limit"]),
  message: Schema.String,
}) {}
