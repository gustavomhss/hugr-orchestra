export * as FabricContextDirectoryContract from "./context-directory-contract"

import type { FabricContext } from "@orchestra/schema/fabric-context"
import type { AbsolutePath } from "@orchestra/schema/schema"
import type { Effect } from "effect"

export type Record = Readonly<{ id: FabricContext.ID; nonce: string }>
export type Interface = Readonly<{
  /** Canonical private root, resolved once from trusted host configuration. */
  root: AbsolutePath
  /** Prepare only this admitted ID, or resume its exact existing marker. Never repairs mismatches. */
  prepare: (input: Record) => Effect.Effect<AbsolutePath, FabricContext.Failure>
  /** Read-only verification, including bounded marker reads and rejection of symlinks. */
  observe: (input: Record) => Effect.Effect<AbsolutePath, FabricContext.Failure>
}>
export type Factory = (root: AbsolutePath) => Effect.Effect<Interface, FabricContext.Failure>
