export * as FabricWorkspace from "./fabric-workspace"

import { Schema } from "effect"
import { FabricCapability } from "./fabric-capability"
import { FabricResource } from "./fabric-resource"
import { ascending } from "./identifier"
import { optional, PositiveInt, statics } from "./schema"

export const ID = Schema.String.check(Schema.isPattern(/^fwsp_[0-9A-Za-z]{26}(?![\s\S])/))
  .annotate({ identifier: "FabricWorkspace.ID" })
  .pipe(
    Schema.brand("FabricWorkspace.ID"),
    statics((schema) => ({ create: () => schema.make("fwsp_" + ascending()) })),
  )
export type ID = typeof ID.Type

export interface Ref extends Schema.Schema.Type<typeof Ref> {}
export const Ref = Schema.Struct({ id: ID, revision: PositiveInt })
  .annotate({ identifier: "FabricWorkspace.Ref", parseOptions: { onExcessProperty: "error" } })

export const Recipe = Schema.Literals(["explore", "investigate", "develop", "change", "compare"])
  .annotate({ identifier: "FabricWorkspace.Recipe" })
export type Recipe = typeof Recipe.Type
export const Slot = Schema.Literals(["main", "support", "inspect"])
  .annotate({ identifier: "FabricWorkspace.Slot" })
export type Slot = typeof Slot.Type

export interface Component extends Schema.Schema.Type<typeof Component> {}
export const Component = Schema.Struct({ id: Schema.NonEmptyString, revision: Schema.NonEmptyString })
  .annotate({ identifier: "FabricWorkspace.Component", parseOptions: { onExcessProperty: "error" } })

export interface Source extends Schema.Schema.Type<typeof Source> {}
export const Source = Schema.Struct({
  capability: FabricCapability.Ref,
  resourceAlias: optional(Schema.NonEmptyString),
  args: optional(Schema.Record(Schema.String, Schema.Json)),
}).annotate({ identifier: "FabricWorkspace.Source", parseOptions: { onExcessProperty: "error" } })

export interface Tool extends Schema.Schema.Type<typeof Tool> {}
export const Tool = Schema.Struct({
  id: Schema.NonEmptyString,
  component: Component,
  slot: Slot,
  props: Schema.Record(Schema.String, Schema.Json),
  source: optional(Source),
}).annotate({ identifier: "FabricWorkspace.Tool", parseOptions: { onExcessProperty: "error" } })

const endpoint = Schema.Struct({ tool: Schema.NonEmptyString, port: Schema.NonEmptyString })
  .annotate({ parseOptions: { onExcessProperty: "error" } })
export interface Binding extends Schema.Schema.Type<typeof Binding> {}
export const Binding = Schema.Struct({
  from: endpoint,
  to: endpoint,
  projection: optional(Schema.Literal("executionResource")),
}).annotate({ identifier: "FabricWorkspace.Binding", parseOptions: { onExcessProperty: "error" } })

export interface Overrides extends Schema.Schema.Type<typeof Overrides> {}
export const Overrides = Schema.Struct({
  order: optional(Schema.Struct({
    main: optional(Schema.Array(Schema.NonEmptyString)),
    support: optional(Schema.Array(Schema.NonEmptyString)),
    inspect: optional(Schema.Array(Schema.NonEmptyString)),
  }).annotate({ parseOptions: { onExcessProperty: "error" } })),
  activeTab: optional(Schema.Struct({
    main: optional(Schema.NonEmptyString),
    support: optional(Schema.NonEmptyString),
    inspect: optional(Schema.NonEmptyString),
  }).annotate({ parseOptions: { onExcessProperty: "error" } })),
  sizes: optional(Schema.Struct({
    main: optional(PositiveInt), support: optional(PositiveInt), inspect: optional(PositiveInt),
  }).annotate({ parseOptions: { onExcessProperty: "error" } })),
  collapsed: optional(Schema.Array(Slot)),
  toolPins: optional(Schema.Array(Schema.NonEmptyString)),
  resourcePins: optional(Schema.Record(Schema.String, Schema.NonEmptyString)),
  locked: optional(Schema.Boolean),
}).annotate({ identifier: "FabricWorkspace.Overrides", parseOptions: { onExcessProperty: "error" } })

export interface Layout extends Schema.Schema.Type<typeof Layout> {}
export const Layout = Schema.Struct({ recipe: Recipe, revision: PositiveInt, overrides: Overrides })
  .annotate({ identifier: "FabricWorkspace.Layout", parseOptions: { onExcessProperty: "error" } })

export interface Document extends Schema.Schema.Type<typeof Document> {}
export const Document = Schema.Struct({
  format: Schema.Literal("fabric-studio.workspace"),
  version: Schema.Literal(1),
  title: Schema.NonEmptyString,
  context: Schema.Struct({ resourceAliases: Schema.Array(Schema.NonEmptyString) })
    .annotate({ parseOptions: { onExcessProperty: "error" } }),
  layout: Layout,
  tools: Schema.Array(Tool).check(Schema.isMinLength(1), Schema.isMaxLength(24)),
  bindings: Schema.Array(Binding).check(Schema.isMaxLength(64)),
}).annotate({ identifier: "FabricWorkspace.Document", parseOptions: { onExcessProperty: "error" } })

export interface Origin extends Schema.Schema.Type<typeof Origin> {}
export const Origin = Schema.Struct({ templateID: Schema.NonEmptyString, templateRevision: Schema.NonEmptyString })
  .annotate({ identifier: "FabricWorkspace.Origin", parseOptions: { onExcessProperty: "error" } })

// Hints identify suggestions to rebind, never the sender's connection or authority.
export interface ResourceHint extends Schema.Schema.Type<typeof ResourceHint> {}
export const ResourceHint = Schema.Struct({
  alias: Schema.NonEmptyString,
  resourceType: FabricResource.Ref.fields.resourceType,
  tenantID: optional(FabricResource.Ref.fields.tenantID),
  workspaceID: optional(FabricResource.Ref.fields.workspaceID),
  resourceID: optional(FabricResource.Ref.fields.resourceID),
}).annotate({ identifier: "FabricWorkspace.ResourceHint", parseOptions: { onExcessProperty: "error" } })

export interface RequiredVersions extends Schema.Schema.Type<typeof RequiredVersions> {}
export const RequiredVersions = Schema.Struct({
  workspaceVersion: Schema.Literal(1),
  components: Schema.Array(Component).check(Schema.isMaxLength(24)),
  capabilities: Schema.Array(FabricCapability.Ref).check(Schema.isMaxLength(24)),
}).annotate({ identifier: "FabricWorkspace.RequiredVersions", parseOptions: { onExcessProperty: "error" } })

// These categories exclude runtime state; they do not classify arbitrary user strings as secret-free.
export interface Exclusions extends Schema.Schema.Type<typeof Exclusions> {}
export const Exclusions = Schema.Struct({
  credentials: Schema.Literal(true),
  authority: Schema.Literal(true),
  activations: Schema.Literal(true),
  results: Schema.Literal(true),
  approvals: Schema.Literal(true),
  "remote-data": Schema.Literal(true),
  environment: Schema.Literal(true),
}).annotate({ identifier: "FabricWorkspace.Exclusions", parseOptions: { onExcessProperty: "error" } })

export interface Package extends Schema.Schema.Type<typeof Package> {}
export const Package = Schema.Struct({
  format: Schema.Literal("fabric-studio.workspace-package"),
  version: Schema.Literal(1),
  workspace: Document,
  origin: optional(Origin),
  requiredVersions: RequiredVersions,
  resourceHints: optional(Schema.Array(ResourceHint).check(Schema.isMaxLength(64))),
  exclusions: Exclusions,
}).annotate({ identifier: "FabricWorkspace.Package", parseOptions: { onExcessProperty: "error" } })
