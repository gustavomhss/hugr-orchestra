import { indexOwnership, isRetired, readOwnership } from "@atlas/knowledge"
import type { OwnershipIndex, OwnershipNeed, OwnershipQuery, OwnershipRead, OwnershipRefusal } from "@atlas/knowledge"
import { prepareClaimReceipts } from "./claim-receipt.js"
import type { ReadAccess } from "./read-access.js"

/** A stable, one-line reference claim; explanation bodies never enter the query's fact bands. */
export function ownershipClaim(scope: string): string {
  return `Scoped ownership manifest for ${scope}`
}

export type OwnershipAccess = ReturnType<typeof createOwnershipAccess>

/** The read side sees only the existing provenance-filtered, governed projection; a CAS put cannot publish. */
export function createOwnershipAccess(deps: {
  readonly access: ReadAccess
  readonly current: (key: string) => string | undefined
}) {
  const published = (scope: string) => {
    const fail = (reason: OwnershipRefusal["reason"], evidence: readonly string[]): OwnershipRefusal => ({ kind: "hold", reason, evidence })
    if (deps.access.refusal !== undefined) return fail("ownership-untrusted", [deps.access.refusal])
    const projection = deps.access.store.loadProjection()
    if (projection === undefined) return fail("ownership-store-unavailable", [scope])
    const rows = [...projection.current.values()].filter((row) => row.scope === scope && row.claims.includes(ownershipClaim(scope)))
    const refs = []
    for (const row of rows) {
      const prepared = prepareClaimReceipts(deps.access.store, row)
      if ("rejected" in prepared) return fail("ownership-carrier", [prepared.rejected])
      for (const entry of prepared.claims) {
        const fact = entry.fact
        if (fact.kind !== "advisory" || fact.claimNorm !== ownershipClaim(scope) || isRetired(fact)) continue
        if (fact.scope !== scope || fact.tier !== row.tier || fact.predicateSlot !== "ownership" || fact.ownership === undefined)
          return fail("ownership-carrier", [row.nodeKey])
        refs.push(fact.ownership)
      }
    }
    if (refs.length === 0) return fail("ownership-unpublished", [scope])
    if (refs.length !== 1) return fail("ownership-ambiguous", [scope])
    return { manifest: refs[0]! }
  }

  return {
    read(query: OwnershipQuery): OwnershipRead {
      const selected = published(query.scope)
      return "kind" in selected ? selected : readOwnership(deps.access.store, selected.manifest, query, deps.current)
    },
    index(scope: string, need: OwnershipNeed): OwnershipIndex {
      const selected = published(scope)
      return "kind" in selected ? selected : indexOwnership(deps.access.store, selected.manifest, { scope, need }, deps.current)
    },
  }
}
