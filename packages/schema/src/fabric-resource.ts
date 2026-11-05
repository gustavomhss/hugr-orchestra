export * as FabricResource from "./fabric-resource"

import { Schema } from "effect"
import { ascending } from "./identifier"
import { PositiveInt, statics } from "./schema"

// The future connection domain reuses this canonical ID; generic Capability connections are a different domain.
export const ConnectionID = Schema.String.check(Schema.isPattern(/^fconn_[0-9A-Za-z]{26}(?![\s\S])/))
  .annotate({ identifier: "FabricResource.ConnectionID" })
  .pipe(
    Schema.brand("FabricResource.ConnectionID"),
    statics((schema) => ({ create: () => schema.make("fconn_" + ascending()) })),
  )
export type ConnectionID = typeof ConnectionID.Type

export interface Ref extends Schema.Schema.Type<typeof Ref> {}
export const Ref = Schema.Struct({
  connectionID: ConnectionID,
  connectionGeneration: PositiveInt,
  tenantID: Schema.NonEmptyString,
  workspaceID: Schema.NonEmptyString,
  resourceType: Schema.NonEmptyString,
  resourceID: Schema.NonEmptyString,
}).annotate({ identifier: "FabricResource.Ref", parseOptions: { onExcessProperty: "error" } })

export interface ConnectionScope extends Schema.Schema.Type<typeof ConnectionScope> {}
export const ConnectionScope = Schema.Struct({
  kind: Schema.Literal("connection"),
  connectionID: ConnectionID,
  connectionGeneration: PositiveInt,
  tenantID: Schema.NonEmptyString,
}).annotate({ identifier: "FabricResource.ConnectionScope", parseOptions: { onExcessProperty: "error" } })

export interface WorkspaceScope extends Schema.Schema.Type<typeof WorkspaceScope> {}
export const WorkspaceScope = Schema.Struct({
  kind: Schema.Literal("workspace"),
  connectionID: ConnectionID,
  connectionGeneration: PositiveInt,
  tenantID: Schema.NonEmptyString,
  workspaceID: Schema.NonEmptyString,
}).annotate({ identifier: "FabricResource.WorkspaceScope", parseOptions: { onExcessProperty: "error" } })

export interface ResourceScope extends Schema.Schema.Type<typeof ResourceScope> {}
export const ResourceScope = Schema.Struct({
  kind: Schema.Literal("resource"),
  resource: Ref,
}).annotate({ identifier: "FabricResource.ResourceScope", parseOptions: { onExcessProperty: "error" } })

// Root discovery has a real connection/workspace scope, not a synthetic item or a tenant-wide grant.
export const Scope = Schema.Union([ConnectionScope, WorkspaceScope, ResourceScope]).annotate({
  identifier: "FabricResource.Scope",
})
export type Scope = typeof Scope.Type
