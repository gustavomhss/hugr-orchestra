import { afterEach, describe, expect, it } from "vitest"
import { asHash, id } from "@atlas/kernel"
import type { OwnershipArtifact, OwnershipContract, OwnershipManifest, OwnershipNeed, OwnershipReceipt, OwnershipResult, OwnershipReview } from "@atlas/knowledge"
import { ownershipFixture } from "./harness/ownership-fixture.js"

const prior = { actor: process.env.ATLAS_ACTOR, token: process.env.ATLAS_RATIFY_TOKEN }
const cleanups: (() => void)[] = []
afterEach(() => {
  cleanups.splice(0).forEach((cleanup) => cleanup())
  if (prior.actor === undefined) delete process.env.ATLAS_ACTOR
  else process.env.ATLAS_ACTOR = prior.actor
  if (prior.token === undefined) delete process.env.ATLAS_RATIFY_TOKEN
  else process.env.ATLAS_RATIFY_TOKEN = prior.token
})

// artifact() hardcodes layer 4 and one entry. The shape accepts layers 1–4, so these are put directly.
// Eight claims for one scope hold ownership-ambiguous. A root map names one key per need, and four of
// these keys share "evidence", so one claim carries all eight entries.
const direct = [
  { key: "L1:entry-execution", need: "evidence", layer: 1, section: "section:L1:entry-execution" },
  { key: "L1:identity", need: "evidence", layer: 1, section: "section:L1:identity" },
  { key: "L1:promotion-reuse", need: "evidence", layer: 1, section: "section:L1:promotion-reuse" },
  { key: "L2:component-execution", need: "component", layer: 2, section: "section:L2:component-execution" },
  { key: "L3:integrated-evidence-boundaries", need: "flow", layer: 3, section: "section:L3:integrated-evidence-boundaries" },
  { key: "L3-supplement:operational-interface", need: "evidence", layer: 3, section: "section:L3-supplement:operational-interface" },
  { key: "L4:ownership", need: "ownership", layer: 4, section: "section:L4:ownership" },
  { key: "L4:maintenance", need: "maintenance", layer: 4, section: "section:L4:maintenance" },
] as const satisfies readonly { key: string; need: OwnershipNeed; layer: 1 | 2 | 3 | 4; section: string }[]

describe("AC-03 direct-use reader proof", () => {
  it("reads each published key body and holds a missing key", () => {
    process.env.ATLAS_ACTOR = "alice"
    process.env.ATLAS_RATIFY_TOKEN = "fixture-explicit-ratifier"
    const f = ownershipFixture()
    cleanups.push(f.cleanup)
    const contract: OwnershipContract = { kind: "ownership-contract", version: 1, criteria: ["fixture-support"] }
    const contractRef = f.store.put(contract)
    const entries = direct.map((spec) => putEntry(f.store, contract, contractRef, spec))
    const manifest: OwnershipManifest = {
      kind: "ownership-manifest", version: 1, scope: "core",
      entries: entries.map((entry) => ({ key: entry.key, artifact: entry.artifact })),
      roots: {
        evidence: "L1:entry-execution",
        component: "L2:component-execution",
        flow: "L3:integrated-evidence-boundaries",
        ownership: "L4:ownership",
        maintenance: "L4:maintenance",
      },
    }
    const emitted = f.runtime().handler.handle("atlas-emit", { node: f.carrier(f.store.put(manifest)), at: asHash("ac03-direct-use") })
    expect(emitted.data).toMatchObject({ emitted: true })
    for (const spec of direct) {
      const read = f.runtime().ownership.read({ scope: "core", key: spec.key, maxBytes: 4096 })
      expect(read).toMatchObject({ kind: "ready", key: spec.key, layer: spec.layer, need: spec.need })
      if (read.kind !== "ready") throw new Error(`expected ready read for ${spec.key}`)
      expect(read.body.split("\n")).toContain(spec.section)
    }
    expect(f.runtime().ownership.read({ scope: "core", key: "L9:absent", maxBytes: 4096 }))
      .toMatchObject({ kind: "hold", reason: "ownership-missing" })
  })
})

function putEntry(
  store: ReturnType<typeof ownershipFixture>["store"],
  contract: OwnershipContract,
  contractRef: OwnershipReceipt["contract"],
  spec: (typeof direct)[number],
) {
  const inputs: OwnershipReceipt["inputs"] = []
  const dependencies: OwnershipReceipt["dependencies"] = []
  const result: OwnershipResult = {
    kind: "ownership-result", version: 1,
    body: store.put({ kind: "ownership-body", version: 1, bytes: Array.from(new TextEncoder().encode(`section:${spec.key}\n`)) }),
    authority: { scope: "core", basis: "explicit test fixture only" }, validity: "supported", gaps: [], evidence: ["fixture"],
  }
  const resultRef = store.put(result)
  const reviews = ["fixture-1", "fixture-2"].map((reviewer) => {
    const review: OwnershipReview = {
      kind: "ownership-review", version: 1, reviewer, contract: contractRef, inputs: id({ inputs, dependencies }),
      result: resultRef, criteria: contract.criteria, verdict: "pass", provenance: "synthetic fixture, not a real judge decision",
    }
    return store.put(review)
  })
  const receipt: OwnershipReceipt = { kind: "ownership-receipt", version: 1, contract: contractRef, inputs, dependencies, reviews }
  const value: OwnershipArtifact = {
    kind: "ownership-artifact", version: 1, key: spec.key, scope: "core", title: spec.key, layer: spec.layer,
    need: spec.need, result: resultRef, receipt: store.put(receipt), navigation: [],
  }
  return { key: spec.key, artifact: store.put(value) }
}
