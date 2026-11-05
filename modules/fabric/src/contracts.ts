import type { Schema } from "effect"
import type { FabricCapability } from "@orchestra/schema/fabric-capability"
import type { FabricObservation } from "@orchestra/schema/fabric-observation"
import type { FabricWorkspace } from "@orchestra/schema/fabric-workspace"

export type Diagnostic = Readonly<{
  path: string
  code: FabricObservation.Problem["code"]
  messageKey: string
}>

export type Limits = Readonly<{ maxBytes: number; maxDepth: number }>
export type Admission =
  | Readonly<{ ok: true; value: Schema.Json }>
  | Readonly<{ ok: false; diagnostics: readonly Diagnostic[] }>

export type Port = Readonly<{
  type: "ResourceRef" | "ExecutionRef" | "ResourceSet" | "ResultHandle" | "FilterSet"
  revision: string
  nullable: boolean
}>

export type Component = Readonly<{
  id: string
  revision: string
  slots: readonly FabricWorkspace.Slot[]
  props: Schema.Decoder<unknown>
  inputs: Readonly<Record<string, Port>>
  outputs: Readonly<Record<string, Port>>
  sourceResult?: string
}>

export type Capability = Readonly<{
  ref: FabricCapability.Ref
  effect: "metadata-read" | "data-read" | "consumed-execution" | "definition-write" | "data-write" | "access-change" | "destructive"
  args: Schema.Decoder<unknown>
  result: string
}>

// Trusted, service-free metadata only. Neither descriptors nor a declaration carry executors or grants.
export type Catalog = Readonly<{
  components: readonly Component[]
  capabilities: readonly Capability[]
}>

export type Normalization = Readonly<{
  path: string
  before?: Schema.Json
  after: Schema.Json
  messageKey: string
}>

export type Compilation =
  | Readonly<{
      ok: true
      document: FabricWorkspace.Document
      order: readonly string[]
      normalizations: readonly Normalization[]
      availability: Readonly<Record<string, FabricCapability.Availability>>
    }>
  | Readonly<{ ok: false; diagnostics: readonly Diagnostic[] }>

export type PackageResult =
  | Readonly<{
      ok: true
      package: FabricWorkspace.Package
      text: string
      normalizations: readonly Normalization[]
    }>
  | Readonly<{ ok: false; diagnostics: readonly Diagnostic[] }>
