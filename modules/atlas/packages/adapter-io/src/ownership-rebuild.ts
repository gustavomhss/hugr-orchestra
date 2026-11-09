// @atlas/adapter-io — src/ownership-rebuild.ts (G2.2 F1)
//
// Incremental rebuild executor. Accepts a verified baseline, an explicit recipe registry and host
// observation access; calls `planOwnershipUpdate` internally; returns a complete validated private
// candidate OR an `OwnershipRefusal` (HOLD). It never accepts `affected` from the caller, never
// publishes, and never mutates the projection. Activation / recovery / migration stay in F3.
// Contract: modules/atlas/docs/design/genesis-g2.2-contract.md §2 (Astra decision 2026-11-09).

import type { Hash } from "@atlas/contracts"
import type { StoreApi } from "@atlas/kernel"
import type { OwnershipInputObservation, OwnershipRefusal } from "@atlas/knowledge"

/** Captured inputs and resolved prerequisite results handed to one recipe invocation. The recipe
 *  consumes ONLY these captured values — never a live reopened host path (TC-05). */
export interface OwnershipRecipeInput {
  readonly captured: ReadonlyMap<string, OwnershipInputObservation>
  readonly dependencies: ReadonlyMap<string, Hash>
}

/** Deterministic recipe output: the reviewed body plus optional result decorations. `void` steps
 *  (evaluation/revalidation) are driven by the executor after production (contract §2.3 step 8);
 *  a `blocked` validity is a HOLD, never a candidate. */
export interface OwnershipRecipeOutput {
  readonly body: string
  readonly authorityBasis?: string
  readonly validity?: "supported" | "blocked"
  readonly gaps?: readonly string[]
  readonly evidence?: readonly string[]
}

/** One artifact's explicitly declared recipe + identity of the implementation that may run. */
export interface OwnershipRecipe {
  /** Artifact key this recipe rebuilds. */
  readonly key: string
  /** Recipe implementation input, e.g. `file:recipe-a.ts`; its observed version binds the
   *  implementation identity into the receipt. */
  readonly recipeInputKey: string
  /** Implementation identity executed; must equal the version bound from the baseline declaration
   *  (RB-07/RB-16) — scalar, because F1 keeps recipes fixed. */
  readonly recipeVersion: string
  /** Obligatory input keys the baseline receipt must bind (contract §2.2). A receipt omitting one
   *  is a HOLD (RB-14); the executor never invents a binding for an invisible dependency. */
  readonly declaredInputs: readonly string[]
  /** Prerequisite artifact keys whose result binding the baseline receipt must carry (RB-15). */
  readonly required: readonly string[]
  /** Deterministic transform of the captured inputs + resolved prerequisite results. */
  readonly run: (input: OwnershipRecipeInput) => OwnershipRecipeOutput
}

/** Full request. The baseline is authoritative for reuse; no new global cache. */
export interface OwnershipRebuildRequest {
  readonly store: StoreApi
  readonly manifest: Hash
  readonly scope: string
  readonly observe: (key: string) => OwnershipInputObservation
  /** Effective member list per `members:` dir (without prefix), for consuming new/removed members
   *  (RB-03/RB-04, contract §2.3 step 3). Absent ⇒ no membership delta is consumed. */
  readonly listMembers?: (dir: string) => readonly string[]
  readonly recipes: ReadonlyMap<string, OwnershipRecipe>
  readonly contract: Hash
}

export type OwnershipRebuildResult =
  | OwnershipRefusal
  | {
      readonly kind: "candidate"
      readonly manifest: Hash
      /** Affected artifacts in dependency order (planner order). */
      readonly affected: readonly string[]
      /** Artifacts whose recipe actually executed, in execution order. */
      readonly calls: readonly string[]
    }

/** Planner → capture → reuse/revalidation → candidate (contract §2.3 steps 1..11). */
export function rebuildOwnershipUpdate(request: OwnershipRebuildRequest): OwnershipRebuildResult {
  void request
  throw new Error("rebuildOwnershipUpdate not implemented (G2.2 red baseline)")
}
