import { DegenerateAnchorError, isKnownRelationKind, isKnownSlot, isScope, negationKey, testVacuityKey } from "@atlas/knowledge"
import type { Candidate, CurrentNode, GroundedFact } from "@atlas/knowledge"
import { claimNormOf, familyOf, resolveWriteIdentity } from "./governed-emit-identity.js"

/** Original fact bytes plus the minimal projection its actual writer describes. Reproof belongs to the caller. */
export type ReplayFact = {
  readonly fact: GroundedFact
  readonly row: CurrentNode
  readonly scope: string
  readonly anchor: string
  readonly claim: string
}

export function describeReplayFact(value: unknown, hash: string): ReplayFact | undefined {
  if (!record(value) || !jsonValue(value) || value.tier !== "T2" || value.seal !== "proven" ||
    !isScope(value.scope) || typeof value.id !== "string" || !grounding(value.grounding) ||
    !Array.isArray(value.claims) || (value.freshness !== "FRESH" && value.freshness !== "DRIFTED") ||
    value.check !== undefined || (value.provenance !== undefined && !provenance(value.provenance)) ||
    (value.witness !== undefined && !record(value.witness))) return undefined
  const fact = value as unknown as GroundedFact
  const shared = { contentHash: hash, scope: value.scope, tier: "T2" as const }
  const witness = value.witness

  if (fact.kind === "advisory") {
    if (!text(fact.claimNorm) || !["ADVISORY", "SUPERSEDED"].includes(fact.authoring) ||
      (fact.predicateSlot !== undefined && !isKnownSlot(fact.predicateSlot))) return undefined
    if (witness !== undefined && (!record(witness) || !isKnownSlot(witness.slot) ||
      witness.slot !== fact.predicateSlot || !text(witness.target) || !text(witness.scope) ||
      (witness.atLeast !== undefined && typeof witness.atLeast !== "number"))) return undefined
    const candidate = { ...fact, slot: fact.predicateSlot } as unknown as Candidate
    const family = familyOf(fact)
    if (family !== "advisory") return undefined
    // This is the documented identity refusal; unrelated internal faults must remain visible.
    try {
      const identity = resolveWriteIdentity(fact, candidate)
      const claim = claimNormOf(fact, family)
      return { fact, scope: shared.scope, anchor: identity.primaryAnchor, claim,
        row: { ...shared, nodeKey: identity.targetKey, family, claims: [claim], primaryAnchor: identity.primaryAnchor,
          ...(fact.predicateSlot === undefined ? {} : { slot: fact.predicateSlot }), seal: "proven",
          ...(fact.provenance === undefined ? {} : { provenanceByClaim: { [claim]: fact.provenance } }) } }
    } catch (error) {
      if (error instanceof DegenerateAnchorError) return undefined
      throw error
    }
  }

  if (fact.kind === "relation") {
    if (!text(fact.endpointA) || !text(fact.endpointB) || fact.endpointA === fact.endpointB ||
      !isKnownRelationKind(fact.relationKind) || !["RELATED", "SUPERSEDED"].includes(fact.authoring)) return undefined
    if (witness !== undefined && (!record(witness) || witness.relationKind !== fact.relationKind ||
      !text(witness.target) || !text(witness.sourceScope))) return undefined
    const identity = resolveWriteIdentity(fact, fact as unknown as Candidate)
    const claim = claimNormOf(fact, "relation")
    return { fact, scope: shared.scope, anchor: identity.primaryAnchor, claim,
      row: { ...shared, nodeKey: identity.targetKey, family: "relation", claims: [claim], primaryAnchor: identity.primaryAnchor,
        endpointA: fact.endpointA, endpointB: fact.endpointB, relationKind: fact.relationKind, seal: "proven" } }
  }

  if (fact.kind === "negation") {
    if (!text(fact.target) || !isKnownRelationKind(fact.relationKind) || typeof fact.edgeModel !== "string" ||
      !["NEGATED", "SUPERSEDED"].includes(fact.authoring) ||
      (fact.authzScope !== undefined && !isScope(fact.authzScope))) return undefined
    const claim = claimNormOf(fact, "negation")
    // The production negation writer intentionally omits the row seal, even when the fact carries proven.
    return { fact, scope: shared.scope, anchor: shared.scope, claim,
      row: { ...shared, nodeKey: String(negationKey(fact.relationKind, fact.target, shared.scope)), family: "negation",
        claims: [claim], primaryAnchor: shared.scope, endpointB: fact.target, relationKind: fact.relationKind } }
  }

  if (fact.kind === "test-vacuity") {
    if (!text(fact.unitKey) || !text(fact.testName) || !text(fact.shape) ||
      !["PROVEN", "SUPERSEDED"].includes(fact.authoring)) return undefined
    if (witness !== undefined && (!record(witness) || witness.testName !== fact.testName || witness.shape !== fact.shape))
      return undefined
    const claim = `${fact.shape} test '${fact.testName}' @ ${fact.unitKey}`
    return { fact, scope: shared.scope, anchor: fact.unitKey, claim,
      row: { ...shared, nodeKey: String(testVacuityKey(fact.unitKey, fact.testName)), family: "test-vacuity", claims: [claim],
        primaryAnchor: fact.unitKey, unitKey: fact.unitKey, testName: fact.testName, shape: fact.shape, seal: "proven" } }
  }
  return undefined
}

export function validReplayRow(value: unknown): value is CurrentNode {
  if (!record(value) || !jsonValue(value) || typeof value.nodeKey !== "string" || typeof value.contentHash !== "string" ||
    typeof value.family !== "string" ||
    !["advisory", "predicate", "relation", "negation", "transition", "test-vacuity"].includes(value.family) ||
    !strings(value.claims)) return false
  if (!["supersededBy", "primaryAnchor", "scope", "derivedAt", "endpointA", "endpointB", "relationKind", "unitKey",
    "shaBefore", "shaAfter", "testName", "shape", "answerRef"].every((key) =>
    value[key] === undefined || typeof value[key] === "string")) return false
  if ((value.slot !== undefined && !isKnownSlot(value.slot)) ||
    (value.tier !== undefined && value.tier !== "T0" && value.tier !== "T1" && value.tier !== "T2") ||
    (value.seal !== undefined && value.seal !== "proven" && value.seal !== "justified") ||
    (value.sameAs !== undefined && !strings(value.sameAs)) ||
    (value.sameAsRetracted !== undefined && !strings(value.sameAsRetracted))) return false
  return value.provenanceByClaim === undefined ||
    (record(value.provenanceByClaim) && Object.values(value.provenanceByClaim).every(provenance))
}

export function sameReplayRow(held: CurrentNode | undefined, row: CurrentNode): boolean {
  if (held === undefined) return false
  const { derivedAt: _heldWatermark, ...previous } = held
  const { derivedAt: _rowWatermark, ...next } = row
  return equalJson(previous, next)
}

export function bindReplayRow(
  row: CurrentNode,
  current: ReplayFact,
  support: ReadonlyMap<string, readonly ReplayFact[]>,
): boolean {
  if (!validReplayRow(row) || row.claims.length === 0 || !row.claims.every(text) || new Set(row.claims).size !== row.claims.length ||
    !row.claims.includes(current.claim)) return false
  const matching = (claim: string) => [current, ...(support.get(claim) ?? [])].filter((item) =>
    item.claim === claim && item.row.nodeKey === current.row.nodeKey && item.scope === current.scope &&
    item.row.scope === current.scope && item.fact.scope === current.scope && item.row.tier === "T2" && item.fact.tier === "T2" &&
    (claim === current.claim || item.row.contentHash !== current.row.contentHash))
  if (!row.claims.every((claim) => matching(claim).length > 0)) return false
  if (row.provenanceByClaim !== undefined && !Object.entries(row.provenanceByClaim).every(([claim, receipt]) =>
    row.claims.includes(claim) && matching(claim).some((item) =>
      "provenance" in item.fact && equalJson(item.fact.provenance, receipt)))) return false
  return equalJson(assertion(row), assertion(current.row))
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value) &&
    (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null)
}

function text(value: unknown): value is string {
  return typeof value === "string" && value.length > 0
}

function strings(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string")
}

function provenance(value: unknown): boolean {
  return record(value) && typeof value.source === "string" && typeof value.trusted === "boolean" &&
    (value.sha === undefined || typeof value.sha === "string")
}

function grounding(value: unknown): boolean {
  return record(value) && Array.isArray(value.entries) && value.entries.every((entry: unknown) =>
    record(entry) && typeof entry.path === "string" && record(entry.anchor) &&
    typeof entry.anchor.kind === "string" &&
    ["symbol", "block", "file", "directory", "repo", "project"].includes(entry.anchor.kind) &&
    typeof entry.anchor.qualifiedPath === "string" && typeof entry.anchor.subtreeHash === "string")
}

/** Validate JSON without invoking accessors or overflowing the call stack on nested/cyclic input. */
function jsonValue(value: unknown): boolean {
  const pending: { value: unknown; exit?: boolean }[] = [{ value }]
  const ancestors = new Set<object>()
  while (pending.length > 0) {
    const item = pending.pop()!
    if (item.value === null || typeof item.value === "string" || typeof item.value === "boolean" ||
      (typeof item.value === "number" && Number.isFinite(item.value))) continue
    if (typeof item.value !== "object" || (!Array.isArray(item.value) && !record(item.value))) return false
    if (item.exit) {
      ancestors.delete(item.value)
      continue
    }
    if (ancestors.has(item.value)) return false
    if (Array.isArray(item.value) && (Object.keys(item.value).length !== item.value.length ||
      !Object.keys(item.value).every((key) => String(Number(key)) === key && Number.isInteger(Number(key)) &&
        Number(key) >= 0 && Number(key) < (item.value as unknown[]).length))) return false
    ancestors.add(item.value)
    pending.push({ value: item.value, exit: true })
    for (const [key, descriptor] of Object.entries(Object.getOwnPropertyDescriptors(item.value))) {
      if (Array.isArray(item.value) && key === "length") continue
      if (!descriptor.enumerable || !("value" in descriptor)) return false
      pending.push({ value: descriptor.value })
    }
    if (Object.getOwnPropertySymbols(item.value).length > 0) return false
  }
  return true
}

/** Object key order is irrelevant; every nested JSON value participates, including provenance metadata. */
function equalJson(left: unknown, right: unknown): boolean {
  if (!jsonValue(left) || !jsonValue(right)) return false
  const pending: { left: unknown; right: unknown }[] = [{ left, right }]
  while (pending.length > 0) {
    const pair = pending.pop()!
    if (pair.left === pair.right) continue
    if (Array.isArray(pair.left) !== Array.isArray(pair.right)) return false
    if (typeof pair.left !== "object" || pair.left === null || typeof pair.right !== "object" || pair.right === null)
      return false
    const left = pair.left as Record<string, unknown>
    const right = pair.right as Record<string, unknown>
    if (Object.keys(left).length !== Object.keys(right).length) return false
    for (const key of Object.keys(left)) {
      if (!Object.hasOwn(right, key)) return false
      pending.push({ left: left[key], right: right[key] })
    }
  }
  return true
}

function assertion(row: CurrentNode) {
  const { claims: _claims, provenanceByClaim: _provenanceByClaim, derivedAt: _derivedAt, ...rest } = row
  return Object.fromEntries(Object.entries(rest).filter(([key, value]) =>
    !((key === "sameAs" || key === "sameAsRetracted") && Array.isArray(value) && value.length === 0)))
}
