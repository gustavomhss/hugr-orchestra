export * as CapabilityServiceContract from "./contract"

import type { Capability } from "@orchestra/schema/capability"
import type { Effect } from "effect"
import type { Tool } from "../../tool/tool"
import type { ToolRegistry } from "../../tool/registry"
import type { CapabilityArtifacts } from "../artifact/index"
import type { CapabilityDiscovery } from "../catalog/discovery"
import type { CapabilityConnections } from "../connection/index"
import type { CapabilityJobs } from "../job/index"
import type { CapabilityMcp } from "../mcp/index"
import type { CapabilityServiceSchema } from "./schema"

export type Locator = Readonly<{ provider: string; canonicalName: string; name: string }>
export type Discovery = CapabilityDiscovery.Interface & Readonly<{
  /** Host metadata only. The canonical leaf must still revalidate descriptor, policy and current selection. */
  locate: (context: Tool.Context, ref: Capability.DescriptorRef, materialization: ToolRegistry.Materialization) =>
    Effect.Effect<Locator, Capability.Failure>
}>

export type Options = Readonly<{
  transport: CapabilityMcp.Interface
  discovery: CapabilityDiscovery.Interface
  connections: CapabilityConnections.Interface
  jobs: Effect.Success<typeof CapabilityJobs.make>
  artifacts: Effect.Success<ReturnType<typeof CapabilityArtifacts.make>>
  filterCatalog: (provider: string, catalog: CapabilityDiscovery.VendorList) => CapabilityDiscovery.VendorList
}>

export type Execute = (provider: string, input: CapabilityServiceSchema.CallInput, context: Tool.Context) =>
  Effect.Effect<CapabilityServiceSchema.CallOutput, Capability.Failure | CapabilityArtifacts.Failure>
