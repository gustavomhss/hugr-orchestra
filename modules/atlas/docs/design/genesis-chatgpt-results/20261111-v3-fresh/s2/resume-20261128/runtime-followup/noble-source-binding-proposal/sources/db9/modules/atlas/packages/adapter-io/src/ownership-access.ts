import { assertEvaluationComposition } from "./ownership-evaluation-policy.js"
import { evaluationManifestRefusal } from "./evaluation-manifest-binding.js"
import { indexOwnership, isRetired, readOwnership } from "@atlas/knowledge"
import type { OwnershipIndex, OwnershipNeed, OwnershipQuery, OwnershipRead, OwnershipRefusal } from "@atlas/knowledge"
import { prepareClaimReceipts } from "./claim-receipt.js"
import type { EvaluationAccess } from "./ownership-evaluation-policy.js"
import type { Hash } from "@atlas/contracts"
import type { ReadAccess } from "./read-access.js"

/** A stable, one-line reference claim; explanation bodies never enter the query's fact bands. */
export function ownershipClaim(scope: string): string {
  return `Scoped ownership manifest for ${scope}`
}

export function evaluationOwnershipClaim(scope: string, candidate: Hash): string {
  return `Evaluation-only ownership manifest for ${scope}: ${candidate}`
}

export type OwnershipAccess = ReturnType<typeof createOwnershipAccess>

/** The read side sees only the existing provenance-filtered, governed projection; a CAS put cannot publish. */
export function createOwnershipAccess(deps: {
  readonly access: ReadAccess
  readonly evaluation?: EvaluationAccess
  readonly current: (key: string) => string | undefined
}) {
  const fail = (reason: OwnershipRefusal["reason"], evidence: readonly string[]): OwnershipRefusal => ({ kind: "hold", reason, evidence,
    ...(deps.evaluation === undefined ? {} : { evaluation_context: { ...deps.evaluation.context, phase: "evaluation", manifest: null } }) })
  const published = (scope: string, operation: "read" | "index" = "read") => {
    if (deps.evaluation !== undefined) {
      try { assertEvaluationComposition(deps.evaluation.root, deps.evaluation); deps.evaluation.assert(operation) } catch { return fail("ownership-untrusted", ["evaluation-policy-denied"]) }
      if (scope !== deps.evaluation.scope) return fail("ownership-scope", [scope])
    }
    const claim = deps.evaluation === undefined ? ownershipClaim(scope) : evaluationOwnershipClaim(scope, deps.evaluation.context.evaluationCandidate)
    const slot = "ownership"
    if (deps.access.refusal !== undefined) return fail("ownership-untrusted", [deps.access.refusal])
    const projection = deps.access.store.loadProjection()
    if (projection === undefined) return fail("ownership-store-unavailable", [scope])
    const rows = [...projection.current.values()].filter((row) => row.scope === scope && row.claims.includes(claim))
    const refs = []
    for (const row of rows) {
      const prepared = prepareClaimReceipts(deps.access.store, row)
      if ("rejected" in prepared) return fail("ownership-carrier", [prepared.rejected])
      for (const entry of prepared.claims) {
        const fact = entry.fact
        if (fact.kind !== "advisory" || fact.claimNorm !== claim || isRetired(fact)) continue
        if (fact.scope !== scope || fact.tier !== row.tier || fact.predicateSlot !== slot || fact.ownership === undefined)
          return fail("ownership-carrier", [row.nodeKey])
        refs.push(fact.ownership)
      }
    }
    if (refs.length === 0) return fail("ownership-unpublished", [scope])
    if (refs.length !== 1) return fail("ownership-ambiguous", [scope])
    if (deps.evaluation !== undefined) {
      const refused = evaluationManifestRefusal(deps.access.store, refs[0]!, deps.evaluation, deps.current)
      if (refused !== undefined) return fail("ownership-untrusted", [refused])
    }
    return { manifest: refs[0]! }
  }

  return {
    read(query: OwnershipQuery): OwnershipRead {
      try { deps.evaluation?.charge("read") } catch { return fail("ownership-limit", ["evaluation-budget-refused"]) }
      const selected = published(query.scope)
      const result = "kind" in selected ? selected : readOwnership(deps.access.store, selected.manifest, query, deps.current, deps.evaluation?.context)
      if (result.kind !== "hold") try { deps.evaluation?.charge("body", new TextEncoder().encode(result.body).length) } catch { return fail("ownership-limit", ["evaluation-budget-refused"]) }
      return result
    },
    index(scope: string, need: OwnershipNeed): OwnershipIndex {
      try { deps.evaluation?.assert("index"); deps.evaluation?.charge("index") } catch { return fail("ownership-untrusted", ["evaluation-policy-denied"]) }
      const selected = published(scope, "index")
      return "kind" in selected ? selected : indexOwnership(deps.access.store, selected.manifest, { scope, need }, deps.current, deps.evaluation?.context)
    },
  }
}
