import { expect, test } from "bun:test"
import { ReviewRouting } from "@orchestra/core/review/routing"
import { ReviewResultV2 } from "../src/v2/governance/review-result"
import { ReviewRoundV2 } from "../src/v2/tools/review-round"

// Pure host-round checks. No private store, no Unix skip, no Session double.
// A Deep request that ran Standard stays Standard without reading ReviewCatalog.current.

const catalog = "b".repeat(64)
const budget = {
  lensChildren: 1, samples: 1, verifiers: 1, itemsPerLens: 1, loadsPerSession: 1,
  candidatesPerChild: 1, candidatesPerVerifier: 1, toolCallsPerSession: 1, probeAttempts: 1,
}
const routing = {
  version: "route-v1" as const,
  catalog,
  profile: { id: "code", source: "request" as const },
  tier: { id: "deep", source: "request" as const, requested: "deep", signals: [] },
  overlays: [], languages: [], lenses: [], packs: [], budget, deviations: [],
}
const finding = {
  id: "C1", path: "src/alpha.ts", line: 1, message: "The export claim is not held.",
  severity: "P1" as const, confidence: "high" as const, lens: "correctness-logic", class: "logic.invariant",
  node: "lucy-review-prove-quote", rule: "logic.invariant", trigger: "replaced export",
  rungs: ["quote"], evidence: { kind: "quote" as const, path: "src/alpha.ts", startLine: 1, endLine: 1 },
  status: "open" as const,
}
const bound = {
  reviewMethodVersion: ReviewResultV2.method({ profile: "code", tier: "standard" }),
  routingDigest: ReviewRouting.digest(routing),
  catalogDigest: catalog,
  executionTier: "standard",
}

test("a Deep request that ran Standard replays that execution tier without the catalog", () => {
  const published = ReviewRoundV2.publish(routing, bound)
  expect(published.status).toBe("ok")
  if (published.status !== "ok") return
  expect(published.hostRound).toEqual({
    version: ReviewRoundV2.VERSION,
    executionTier: "standard",
    routing: published.hostRound.routing,
  })
  expect(published.hostRound.routing).not.toContain("ReviewCatalog")
  const read = ReviewRoundV2.read({ ...bound, hostRound: published.hostRound, findings: [finding] })
  expect(read).toMatchObject({ status: "ok", executionTier: "standard" })
  if (read.status !== "ok") return
  expect(read.routing.tier.id).toBe("deep")
  expect(read.findings).toEqual([finding])
  expect(ReviewRoundV2.publish(routing, { ...bound, executionTier: "deep" }).status).toBe("mismatch")
})

test("publish refuses a bad method, digest, catalog, extra field, or oversized routing", () => {
  expect(ReviewRoundV2.publish(routing, { ...bound, reviewMethodVersion: "review-v2/code/deep" }).status).toBe("mismatch")
  expect(ReviewRoundV2.publish(routing, { ...bound, routingDigest: "e".repeat(64) }).status).toBe("mismatch")
  expect(ReviewRoundV2.publish(routing, { ...bound, catalogDigest: `sha256:${"e".repeat(64)}` }).status).toBe("mismatch")
  expect(ReviewRoundV2.publish({ ...routing, extra: true } as typeof routing, bound).status).toBe("corrupt")
  const huge = { ...routing, deviations: [{ kind: "cap-dropped", stage: "finish" as const, detail: "x".repeat(ReviewRoundV2.LIMIT) }] }
  expect(ReviewRoundV2.publish(huge, { ...bound, routingDigest: ReviewRouting.digest(huge) }).status).toBe("too-large")
})

test("read refuses an absent, unknown, or unbound host round and does not use a private store", () => {
  const published = ReviewRoundV2.publish(routing, bound)
  if (published.status !== "ok") throw new Error(published.status)
  expect(ReviewRoundV2.read({ ...bound, findings: [finding] }).status).toBe("unavailable")
  expect(ReviewRoundV2.read({ ...bound, findings: [finding], hostRound: { ...published.hostRound, version: "host-round-v0" } }).status).toBe("corrupt")
  expect(ReviewRoundV2.read({ ...bound, findings: [finding], hostRound: published.hostRound, reviewMethodVersion: "review-v2/code/quick" }).status).toBe("mismatch")
  const { confidence, ...missing } = finding
  void confidence
  expect(ReviewRoundV2.read({ ...bound, findings: [missing], hostRound: published.hostRound }).status).toBe("corrupt")
})
