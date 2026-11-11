import type { PreparedNativePackage } from "./genesis-native.js"
import { nativeDigest, nativeKeys, nativeRecord, nativeReference, nativeReferenceKey, nativeStrings, nativeText } from "./genesis-native-format.js"
import type { NativeReference } from "./genesis-native-format.js"

export const nativeBindingUrl = import.meta.url
export type NativeBinding = {
  schema: "genesis-native-binding-approval/v1"; purpose: "runtime-import-binding"
  candidate_id: string; contract: string; reviewers: string[]
  decisions: {
    reviewer: string; decision_id: string; decision_id_kind: "host-message" | "response-sha256"; purpose: "runtime-import-binding"
    candidate_id: string; contract: string; verdict: "PASS"
    criteria: { id: string; verdict: "PASS" }[]
    entries: { key: string; result: string; inputs: string }[]
    request_ref: NativeReference; response_ref: NativeReference
  }[]
}

/** This verifies an operator-supplied record, not the identity of its author. Original responses
 * remain evidence; a semantic approval cannot satisfy this distinct purpose or exact binding. */
export function validateNativeBinding(value: unknown, prepared: PreparedNativePackage): NativeBinding {
  const binding = nativeRecord(value, "binding")
  nativeKeys(binding, ["schema", "purpose", "candidate_id", "contract", "reviewers", "decisions"], "binding")
  if (binding.schema !== "genesis-native-binding-approval/v1" || binding.purpose !== "runtime-import-binding") throw new Error("native-binding-purpose")
  if (binding.candidate_id !== prepared.candidate_id || binding.contract !== prepared.candidate.contract) throw new Error("native-binding-candidate")
  const reviewers = nativeStrings(binding.reviewers, "binding.reviewers")
  if (reviewers.length !== 2) throw new Error("native-binding-two-reviewers")
  if (!Array.isArray(binding.decisions) || binding.decisions.length !== 2) throw new Error("native-binding-two-decisions")
  const seen = new Set<string>()
  const hostMessages = new Set<string>()
  const responses = new Set<string>()
  for (const value of binding.decisions) {
    const decision = nativeRecord(value, "binding decision")
    nativeKeys(decision, ["reviewer", "decision_id", "decision_id_kind", "purpose", "candidate_id", "contract", "verdict", "criteria", "entries", "request_ref", "response_ref"], "binding decision")
    const reviewer = nativeText(decision.reviewer, "reviewer")
    if (!reviewers.includes(reviewer) || seen.has(reviewer)) throw new Error("native-binding-reviewer")
    seen.add(reviewer)
    const decisionID = nativeText(decision.decision_id, "decision_id")
    if (decision.purpose !== "runtime-import-binding" || decision.verdict !== "PASS" || decision.candidate_id !== prepared.candidate_id || decision.contract !== prepared.candidate.contract)
      throw new Error("native-binding-exact-decision")
    nativeReference(decision.request_ref)
    const response = nativeReference(decision.response_ref)
    if (decision.decision_id_kind === "response-sha256") {
      if (decisionID !== `sha256:${response.sha256}`) throw new Error("native-binding-decision-digest")
    }
    if (decision.decision_id_kind === "host-message") {
      if (hostMessages.has(decisionID)) throw new Error("native-binding-duplicate-message")
      hostMessages.add(decisionID)
    }
    if (decision.decision_id_kind !== "response-sha256" && decision.decision_id_kind !== "host-message") throw new Error("native-binding-decision-id-kind")
    if (responses.has(nativeReferenceKey(response))) throw new Error("native-binding-duplicate-response")
    responses.add(nativeReferenceKey(response))
    if (!Array.isArray(decision.criteria) || decision.criteria.length !== prepared.candidate.criteria.length) throw new Error("native-binding-criteria")
    const criteria = decision.criteria.map((value) => {
      const criterion = nativeRecord(value, "binding criterion")
      nativeKeys(criterion, ["id", "verdict"], "binding criterion")
      if (criterion.verdict !== "PASS") throw new Error("native-binding-criterion-hold")
      return nativeText(criterion.id, "criterion.id")
    })
    if (new Set(criteria).size !== criteria.length || !prepared.candidate.criteria.every((criterion) => criteria.includes(criterion))) throw new Error("native-binding-criteria")
    if (!Array.isArray(decision.entries) || decision.entries.length !== prepared.candidate.entries.length) throw new Error("native-binding-entries")
    const keys = new Set<string>()
    for (const value of decision.entries) {
      const entry = nativeRecord(value, "binding entry")
      nativeKeys(entry, ["key", "result", "inputs"], "binding entry")
      const key = nativeText(entry.key, "binding entry.key")
      if (keys.has(key)) throw new Error("native-binding-duplicate-entry")
      keys.add(key)
      nativeDigest(entry.result, 64, "binding result")
      nativeDigest(entry.inputs, 64, "binding inputs")
      const expected = prepared.candidate.entries.find((entry) => entry.key === key)
      if (!expected || entry.result !== expected.artifact.result || entry.inputs !== expected.inputs_id) throw new Error(`native-binding-entry-drift: ${key}`)
    }
  }
  return binding as unknown as NativeBinding
}
