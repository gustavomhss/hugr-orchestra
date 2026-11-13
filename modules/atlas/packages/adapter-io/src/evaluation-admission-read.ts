import { readOwnership } from "@atlas/knowledge"
import type { OwnershipEvaluationContext } from "@atlas/knowledge"
import type { StoreApi } from "@atlas/kernel"
import type { Hash } from "@atlas/contracts"

/** Exact set, not length-only coverage; empty/duplicate requested or checked keys fail closed. */
export function assertAdmissionCoverage(expected: readonly string[], checked: readonly string[]): void {
  const wanted = new Set(expected), actual = new Set(checked)
  if (!expected.length || wanted.size !== expected.length || actual.size !== checked.length ||
    actual.size !== wanted.size || expected.some((key) => !actual.has(key)))
    throw new Error("evaluation-admission-coverage")
}

/** Evaluation readOwnership validates the entire manifest, including disconnected entries.
 * One fresh traversal per admission: never historical, never a cross-call observation cache.
 * This is not an atomic filesystem snapshot and does not replace subsequent check/emit gates. */
export function readEvaluationAdmission(
  store: StoreApi, manifest: Hash, scope: string, keys: readonly string[],
  current: (key: string) => string | undefined, context: OwnershipEvaluationContext,
) {
  assertAdmissionCoverage(keys, keys)
  const result = readOwnership(store, manifest, { scope, key: keys[0]!, maxBytes: Number.MAX_SAFE_INTEGER }, current, context)
  if (result.kind !== "hold") assertAdmissionCoverage(keys, result.checked)
  return result
}
