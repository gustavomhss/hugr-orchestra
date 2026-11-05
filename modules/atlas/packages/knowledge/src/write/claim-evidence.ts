import type { CurrentNode, WriteRequest } from "./projection-types.js"

/** Filter to surviving claims, taking the first own receipt (request before incumbent). */
export function claimEvidenceOf(
  claims: readonly string[],
  ...sources: readonly WriteRequest["claimEvidenceByClaim"][]
): Pick<CurrentNode, "claimEvidenceByClaim"> {
  const entries = claims.flatMap((claim) => {
    const source = sources.find(
      (source) => source !== undefined && Object.hasOwn(source, claim) && source[claim] !== undefined,
    )
    const receipt = source?.[claim]
    return receipt !== undefined ? [[claim, receipt] as const] : []
  })
  // fromEntries defines own data properties, including __proto__, without invoking prototype setters.
  return entries.length > 0 ? { claimEvidenceByClaim: Object.fromEntries(entries) } : {}
}
