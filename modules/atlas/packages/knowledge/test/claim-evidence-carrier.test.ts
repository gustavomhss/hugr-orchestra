// Reducer-only opaque handles here; real CAS-addressed individual facts are covered in the CLI seam test.
import { expect, it } from "vitest"
import { emptyStore, upsert } from "../src/write/upsert.js"
import type { CurrentNode, WriteRequest } from "../src/write/upsert.js"

const first = {
  nodeKey: "same-place",
  contentHash: "fact-first",
  family: "advisory" as const,
  claimNorm: "first normalized claim",
  tier: "T2" as const,
  scope: "core",
  claimEvidenceByClaim: { "first normalized claim": { factRef: "fact-first", answerRef: "answer-shared" } },
}
const second = {
  ...first,
  contentHash: "fact-second",
  claimNorm: "second normalized claim",
  claimEvidenceByClaim: { "second normalized claim": { factRef: "fact-second", answerRef: "answer-shared" } },
}

function expectEvidence(
  row: CurrentNode | undefined,
  expected: Readonly<Record<string, { readonly factRef: string; readonly answerRef?: string }>>,
) {
  expect(row).toMatchObject({ claimEvidenceByClaim: expected })
  expect((row as unknown as { readonly claimEvidenceByClaim: typeof expected }).claimEvidenceByClaim).toEqual(expected)
}

it("same-tier UPDATE unions claim evidence at one key; raise, replace and SUPERSEDE prune dropped claims without deleting CAS history", () => {
  // Request variables carry the additive field structurally: baseline types need no stub or cast.
  const created = upsert(emptyStore(), first)
  expect(created.decision).toBe("CREATE")
  const merged = upsert(created.store, second)
  expect(merged.decision).toBe("UPDATE")
  expect([...merged.store.current.keys()]).toEqual([first.nodeKey])
  expect(merged.store.current.get(first.nodeKey)!.claims).toEqual([first.claimNorm, second.claimNorm])
  expectEvidence(merged.store.current.get(first.nodeKey), { ...first.claimEvidenceByClaim, ...second.claimEvidenceByClaim })

  const replacement = {
    ...first,
    contentHash: "fact-replacement",
    claimNorm: "replacement normalized claim",
    // No answerRef is required on an individual receipt. Stale supplied keys must also be pruned.
    claimEvidenceByClaim: {
      ...first.claimEvidenceByClaim,
      "replacement normalized claim": { factRef: "fact-replacement" },
    },
  }
  for (const request of [{ ...replacement, tier: "T1" as const }, { ...replacement, replace: true as const }]) {
    const result = upsert(merged.store, request)
    expect(result.decision).toBe("UPDATE")
    expect([...result.store.current.keys()]).toEqual([first.nodeKey])
    expect(result.store.current.get(first.nodeKey)!.claims).toEqual([replacement.claimNorm])
    expectEvidence(result.store.current.get(first.nodeKey), {
      [replacement.claimNorm]: { factRef: replacement.contentHash },
    })
    expect(result.store.cas).toEqual(new Set([first.contentHash, second.contentHash, replacement.contentHash]))
  }

  const predicate = { ...first, family: "predicate" as const }
  const prior = upsert(emptyStore(), predicate)
  const reEvidence = { ...replacement, family: "predicate" as const }
  const superseded = upsert(prior.store, reEvidence)
  expect(superseded.decision).toBe("SUPERSEDE")
  expect([...superseded.store.current.keys()]).toEqual([first.nodeKey])
  expect(superseded.store.current.get(first.nodeKey)).toMatchObject({
    claims: [replacement.claimNorm], supersededBy: first.contentHash,
  })
  expectEvidence(superseded.store.current.get(first.nodeKey), {
    [replacement.claimNorm]: { factRef: replacement.contentHash },
  })
  expect(superseded.store.cas).toEqual(new Set([first.contentHash, replacement.contentHash]))
  expect(merged.store.current.get(first.nodeKey)!.claims).toEqual([first.claimNorm, second.claimNorm])
  expectEvidence(merged.store.current.get(first.nodeKey), { ...first.claimEvidenceByClaim, ...second.claimEvidenceByClaim })
})

it("legacy rows and requests without the optional carrier preserve absence and the existing union/dedup/replacement behavior", () => {
  const legacy: WriteRequest = {
    nodeKey: "legacy-place", contentHash: "legacy-first", family: "advisory", claimNorm: "legacy first", tier: "T2", scope: "core",
  }
  const next: WriteRequest = { ...legacy, contentHash: "legacy-second", claimNorm: "legacy second" }
  const created = upsert(emptyStore(), legacy)
  const merged = upsert(created.store, next)
  const deduped = upsert(merged.store, next)
  expect(created.decision).toBe("CREATE")
  expect(merged.decision).toBe("UPDATE")
  expect(deduped.decision).toBe("DEDUP")
  expect(deduped.store.current.get(legacy.nodeKey)!.claims).toEqual([legacy.claimNorm, next.claimNorm])
  for (const result of [created, merged, deduped]) {
    expect(result.store.current.get(legacy.nodeKey)).not.toHaveProperty("claimEvidenceByClaim")
  }
  for (const request of [
    { ...legacy, contentHash: "legacy-raise", tier: "T1" as const },
    { ...legacy, contentHash: "legacy-replace", replace: true as const },
  ]) {
    const result = upsert(merged.store, request)
    expect(result.store.current.get(legacy.nodeKey)!.claims).toEqual([legacy.claimNorm])
    expect(result.store.current.get(legacy.nodeKey)).not.toHaveProperty("claimEvidenceByClaim")
    expect(result.store.cas.has(legacy.contentHash)).toBe(true)
    expect(result.store.cas.has(next.contentHash)).toBe(true)
  }
  const predicate = { ...legacy, family: "predicate" as const }
  const superseded = upsert(upsert(emptyStore(), predicate).store, { ...next, family: "predicate" as const })
  expect(superseded.decision).toBe("SUPERSEDE")
  expect(superseded.store.current.get(legacy.nodeKey)!.claims).toEqual([next.claimNorm])
  expect(superseded.store.current.get(legacy.nodeKey)).not.toHaveProperty("claimEvidenceByClaim")
})

it("carrierless raise/replace/SUPERSEDE over evidenced rows drops the old receipts, preserves absence, and retains CAS history", () => {
  const merged = upsert(upsert(emptyStore(), first).store, second).store
  expectEvidence(merged.current.get(first.nodeKey), { ...first.claimEvidenceByClaim, ...second.claimEvidenceByClaim })
  // Deliberately not spread from an evidenced request: this new writer supplies no carrier at all.
  const legacy: WriteRequest = {
    nodeKey: first.nodeKey, contentHash: "fact-carrierless", family: "advisory",
    claimNorm: "new carrierless claim", tier: "T2", scope: first.scope,
  }
  for (const request of [{ ...legacy, tier: "T1" as const }, { ...legacy, replace: true as const }]) {
    const result = upsert(merged, request)
    expect(result.decision).toBe("UPDATE")
    expect(result.store.current.get(first.nodeKey)!.claims).toEqual([legacy.claimNorm])
    expect(result.store.current.get(first.nodeKey)).not.toHaveProperty("claimEvidenceByClaim")
    expect(result.store.cas).toEqual(new Set([first.contentHash, second.contentHash, legacy.contentHash]))
  }
  const prior = upsert(emptyStore(), { ...first, family: "predicate" as const }).store
  expectEvidence(prior.current.get(first.nodeKey), first.claimEvidenceByClaim)
  const result = upsert(prior, { ...legacy, family: "predicate" as const })
  expect(result.decision).toBe("SUPERSEDE")
  expect(result.store.current.get(first.nodeKey)!.claims).toEqual([legacy.claimNorm])
  expect(result.store.current.get(first.nodeKey)).not.toHaveProperty("claimEvidenceByClaim")
  expect(result.store.cas).toEqual(new Set([first.contentHash, legacy.contentHash]))
})

it("own __proto__/constructor claim receipts survive without laundering off-claim or inherited-only evidence or changing prototypes", () => {
  const protoReceipt = { factRef: "fact-own-proto" }
  const constructorReceipt = { factRef: "fact-own-constructor" }
  const inheritedClaim = "surviving claim with inherited-only evidence"
  const supplied: Record<string, { readonly factRef: string }> = Object.fromEntries([
    ["__proto__", protoReceipt], ["constructor", constructorReceipt], ["off-claim", { factRef: "fact-off-claim" }],
  ])
  const inherited = Object.fromEntries([[inheritedClaim, { factRef: "fact-inherited-only" }]])
  Object.setPrototypeOf(supplied, inherited)
  const inputDescriptors = Object.getOwnPropertyDescriptors(supplied)
  const inheritedDescriptors = Object.getOwnPropertyDescriptors(inherited)
  const objectDescriptors = Object.getOwnPropertyDescriptors(Object.prototype)
  const requests = ["__proto__", "constructor", inheritedClaim].map((claimNorm, index) => ({
    ...first, claimNorm, contentHash: `poison-boundary-${index}`, claimEvidenceByClaim: supplied,
  }))
  const store = requests.reduce((prior, request) => upsert(prior, request).store, emptyStore())
  const row = store.current.get(first.nodeKey)
  // An inherited-only receipt must not remove the otherwise valid, surviving claim itself.
  expect(row!.claims).toEqual(["__proto__", "constructor", inheritedClaim])
  const expected = Object.fromEntries([["__proto__", protoReceipt], ["constructor", constructorReceipt]])
  expectEvidence(row, expected)
  const evidence = (row as unknown as { readonly claimEvidenceByClaim: typeof expected }).claimEvidenceByClaim
  expect(Object.keys(evidence).sort()).toEqual(["__proto__", "constructor"].sort())
  expect(Object.hasOwn(evidence, "__proto__")).toBe(true)
  expect(Object.hasOwn(evidence, "constructor")).toBe(true)
  expect(Object.hasOwn(evidence, "off-claim")).toBe(false)
  expect(Object.hasOwn(evidence, inheritedClaim)).toBe(false)
  expect(Object.getPrototypeOf(evidence) === null || Object.getPrototypeOf(evidence) === Object.prototype).toBe(true)
  expect(Object.getPrototypeOf(supplied)).toBe(inherited)
  expect(Object.getOwnPropertyDescriptors(supplied)).toEqual(inputDescriptors)
  expect(Object.getOwnPropertyDescriptors(inherited)).toEqual(inheritedDescriptors)
  expect(Object.getOwnPropertyDescriptors(Object.prototype)).toEqual(objectDescriptors)
})
