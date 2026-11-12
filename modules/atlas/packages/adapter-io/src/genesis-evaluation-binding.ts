import { OWNERSHIP_ADMISSION_CRITERIA } from "@atlas/knowledge"
import { nativeKeys, nativeRecord, nativeText, nativeStrings, nativeReference } from "./genesis-native-format.js"
import type { NativeReference } from "./genesis-native-format.js"
import type { PreparedEvaluation } from "./genesis-evaluation.js"

export interface EvaluationDecision {
  reviewer: string; decision_id: string; purpose: "isolated-evaluation-admission"; candidate_id: string; verdict: "PASS"
  entries: { key: string; contract: string; result: string; inputs: string; criteria: { id: string; verdict: "PASS" }[] }[]
  request_ref: NativeReference; response_ref: NativeReference
}
export interface EvaluationBinding {
  schema: "genesis-evaluation-binding/v1"; purpose: "isolated-evaluation-admission"; candidate_id: string
  reviewers: string[]; decisions: EvaluationDecision[]
}

/** Checks operator-supplied provenance and exact new decisions, not authenticated human identity. */
export function validateEvaluationBinding(value: unknown, prepared: PreparedEvaluation): EvaluationBinding {
  const b = nativeRecord(value, "evaluation binding")
  nativeKeys(b, ["schema", "purpose", "candidate_id", "reviewers", "decisions"], "evaluation binding")
  if (b.schema !== "genesis-evaluation-binding/v1" || b.purpose !== "isolated-evaluation-admission" || b.candidate_id !== prepared.candidate_id) throw new Error("evaluation-binding-identity")
  const reviewers = nativeStrings(b.reviewers, "reviewers")
  if (reviewers.length !== 2 || new Set(reviewers).size !== 2 || !Array.isArray(b.decisions) || b.decisions.length !== 2) throw new Error("evaluation-binding-two-decisions")
  const seen = new Set<string>(), responses = new Set<string>()
  for (const raw of b.decisions) {
    const d = nativeRecord(raw, "decision")
    nativeKeys(d, ["reviewer", "decision_id", "purpose", "candidate_id", "verdict", "entries", "request_ref", "response_ref"], "decision")
    const reviewer = nativeText(d.reviewer, "reviewer")
    if (!reviewers.includes(reviewer) || seen.has(reviewer) || d.purpose !== b.purpose || d.candidate_id !== b.candidate_id || d.verdict !== "PASS") throw new Error("evaluation-binding-decision")
    seen.add(reviewer)
    nativeReference(d.request_ref)
    const response = nativeReference(d.response_ref)
    if (d.decision_id !== `sha256:${response.sha256}` || responses.has(response.sha256)) throw new Error("evaluation-binding-provenance")
    responses.add(response.sha256)
    if (!Array.isArray(d.entries) || d.entries.length !== prepared.candidate.entries.length) throw new Error("evaluation-binding-coverage")
    const keys = new Set<string>()
    for (const rawEntry of d.entries) {
      const e = nativeRecord(rawEntry, "entry")
      nativeKeys(e, ["key", "contract", "result", "inputs", "criteria"], "entry")
      const key = nativeText(e.key, "key"), expected = prepared.candidate.entries.find((x) => x.key === key)
      if (!expected || keys.has(key) || e.contract !== expected.contract || e.result !== expected.artifact.result || e.inputs !== expected.inputs_id) throw new Error("evaluation-binding-entry")
      keys.add(key)
      if (!Array.isArray(e.criteria) || e.criteria.length !== OWNERSHIP_ADMISSION_CRITERIA.length) throw new Error("evaluation-binding-criteria")
      const ids = e.criteria.map((rawCriterion) => {
        const c = nativeRecord(rawCriterion, "criterion")
        nativeKeys(c, ["id", "verdict"], "criterion")
        if (c.verdict !== "PASS") throw new Error("evaluation-binding-criterion-hold")
        return nativeText(c.id, "criterion id")
      })
      if (new Set(ids).size !== ids.length || !OWNERSHIP_ADMISSION_CRITERIA.every((x) => ids.includes(x))) throw new Error("evaluation-binding-criteria")
    }
  }
  return value as EvaluationBinding
}

export const evaluationBindingUrl = import.meta.url
