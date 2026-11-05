export * as FabricContextsContract from "./context-contract"

import type { CapabilityOperatorContract } from "@orchestra/core/capability/operator/contract"
import type { Database } from "@orchestra/core/database/database"
import type { Project } from "@orchestra/core/project"
import type { Capability } from "@orchestra/schema/capability"
import type { FabricContext } from "@orchestra/schema/fabric-context"
import type { AbsolutePath } from "@orchestra/schema/schema"
import type { Effect } from "effect"

export type Error = FabricContext.Failure | Capability.Failure
export type Interface = Readonly<{
  list: (input: FabricContext.Query) => Effect.Effect<FabricContext.Page, Error>
  create: (input: FabricContext.Create) => Effect.Effect<FabricContext.Info, Error>
  resolve: (ref: FabricContext.Ref) => Effect.Effect<FabricContext.Info, Error>
  remove: (ref: FabricContext.Ref) => Effect.Effect<FabricContext.Ref, Error>
}>
export type Options = Readonly<{
  operators: CapabilityOperatorContract.Interface
  /** Trusted host-owned root; never accepted from a request or imported workspace. */
  root: AbsolutePath
  /** Active plus preparing reservations per owner/store. Defaults to 64; 1..64. */
  maxContexts?: number
}>
export type Factory = (input: Options) => Effect.Effect<Interface, Error, Database.Service | Project.Service>
