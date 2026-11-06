import type { Hash } from "@atlas/contracts"
import type { StoreApi } from "@atlas/kernel"
import type { OwnershipRefusal } from "./types.js"

export type OwnershipInputObservation =
  | { readonly kind: "present"; readonly version: string }
  | { readonly kind: "absent" }
  | { readonly kind: "unavailable" }

export type OwnershipUpdatePlan = OwnershipRefusal | {
  readonly kind: "ownership-update-plan"
  readonly manifest: Hash
  readonly scope: string
  readonly changes: readonly {
    readonly artifact: string
    readonly input: string
    readonly previous: string
    readonly observed: Exclude<OwnershipInputObservation, { readonly kind: "unavailable" }>
  }[]
  readonly affected: readonly string[]
  readonly frontier: readonly string[]
  readonly unaffected: readonly string[]
}

/** Acceptance-stage stub: analysis only; never publication, recipe execution or permission to spend. */
export function planOwnershipUpdate(
  _store: StoreApi,
  _manifest: Hash,
  _scope: string,
  _observe: (key: string) => OwnershipInputObservation,
): OwnershipUpdatePlan {
  throw new Error("ownership update planning is not implemented")
}
