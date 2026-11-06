import type { Hash } from "@atlas/contracts"
import { id } from "@atlas/kernel"
import type { StoreApi } from "@atlas/kernel"
import { readOwnership } from "./read.js"
import { isOwnershipManifest, isOwnershipNeed, isOwnershipReceipt } from "./shape.js"
import type { OwnershipReceipt, OwnershipRefusal } from "./types.js"

export type OwnershipInputObservation =
  | { readonly kind: "present"; readonly version: string }
  | { readonly kind: "absent" }
  | { readonly kind: "unavailable" }

type UpdatePlan = {
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

export type OwnershipUpdatePlan = OwnershipRefusal | UpdatePlan

/** Analyze a complete prior generation; affected descendants are not permission to run their recipes. */
export function planOwnershipUpdate(
  store: StoreApi,
  manifestRef: Hash,
  scope: string,
  observe: (key: string) => OwnershipInputObservation,
): OwnershipUpdatePlan {
  const manifest = store.get(manifestRef)
  if (manifest === undefined) return hold("ownership-missing", [manifestRef])
  if (!isOwnershipManifest(manifest)) return hold("malformed-ownership", [manifestRef])
  if (id(manifest) !== manifestRef) return hold("ownership-integrity", [manifestRef])
  if (manifest.scope !== scope) return hold("ownership-scope", [scope])

  // Historical mode permits source drift, not invalid roots, reviews, result bindings or body bytes.
  for (const need of Object.keys(manifest.roots)) {
    if (!isOwnershipNeed(need)) return hold("ownership-selection", [need])
    const read = readOwnership(store, manifestRef, { scope, need, historical: true, maxBytes: Number.MAX_SAFE_INTEGER }, () => undefined)
    if (read.kind === "hold") return read
  }
  const receipts = new Map<string, OwnershipReceipt>()
  for (const key of manifest.entries.map((entry) => entry.key).sort()) {
    const read = readOwnership(store, manifestRef, { scope, key, historical: true, maxBytes: Number.MAX_SAFE_INTEGER }, () => undefined)
    if (read.kind === "hold") return read
    const receipt = store.get(read.receipt)
    if (!isOwnershipReceipt(receipt)) return hold("malformed-ownership", [read.receipt])
    if (id(receipt) !== read.receipt) return hold("ownership-integrity", [read.receipt])
    receipts.set(key, receipt)
  }

  const observations = new Map<string, Exclude<OwnershipInputObservation, { readonly kind: "unavailable" }>>()
  const changes: UpdatePlan["changes"][number][] = []
  for (const [key, receipt] of receipts) {
    for (const input of receipt.inputs.slice().sort((a, b) => a.key < b.key ? -1 : a.key > b.key ? 1 : 0)) {
      const observed = observations.get(input.key) ?? observe(input.key)
      if (observed.kind === "unavailable" || (observed.kind === "present" &&
        (!observed.version.trim() || observed.version.normalize("NFC") !== observed.version)))
        return hold("ownership-input-unavailable", [key, input.key])
      // Copy the host's observation: later callbacks cannot mutate an earlier captured version.
      const captured = observed.kind === "present" ? { kind: "present" as const, version: observed.version } : { kind: "absent" as const }
      observations.set(input.key, captured)
      if (captured.kind === "absent" || captured.version !== input.version)
        changes.push({ artifact: key, input: input.key, previous: input.version, observed: captured })
    }
  }

  const order = dependencyOrder(receipts.keys(), receipts)
  if (!Array.isArray(order)) return order
  const direct = new Set(changes.map((change) => change.artifact))
  const affected = new Set<string>()
  for (const key of order) {
    if (direct.has(key) || receipts.get(key)!.dependencies.some((dependency) => affected.has(dependency.key))) affected.add(key)
  }
  // Unchanged prerequisites are already satisfied; they cannot delay lexicographic affected ordering.
  const affectedOrder = dependencyOrder(affected, receipts)
  if (!Array.isArray(affectedOrder)) return affectedOrder
  return {
    kind: "ownership-update-plan", manifest: manifestRef, scope, changes,
    affected: affectedOrder,
    frontier: [...direct].filter((key) => !receipts.get(key)!.dependencies.some((dependency) => affected.has(dependency.key))).sort(),
    unaffected: [...receipts.keys()].filter((key) => !affected.has(key)).sort(),
  }
}

function dependencyOrder(keys: Iterable<string>, receipts: ReadonlyMap<string, OwnershipReceipt>): string[] | OwnershipRefusal {
  const remaining = new Set(keys)
  const order: string[] = []
  while (remaining.size > 0) {
    const ready = [...remaining].sort().find((key) => receipts.get(key)!.dependencies.every((dependency) => !remaining.has(dependency.key)))
    if (ready === undefined) return hold("ownership-cycle", [...remaining].sort())
    remaining.delete(ready)
    order.push(ready)
  }
  return order
}

function hold(reason: OwnershipRefusal["reason"], evidence: readonly string[]): OwnershipRefusal {
  return { kind: "hold", reason, evidence }
}
