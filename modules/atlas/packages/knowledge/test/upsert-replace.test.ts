// @atlas/knowledge — test/upsert-replace.test.ts
import { describe, it, expect } from "vitest"
import { emptyStore, upsert, GovernanceAuthorityError } from "../src/write/upsert.js"
import type { WriteRequest } from "../src/write/router.js"

const write = (contentHash: string, claimNorm: string, extra: Partial<WriteRequest> = {}): WriteRequest => ({
  nodeKey: "nk-adv",
  contentHash,
  family: "advisory",
  claimNorm,
  tier: "T2",
  scope: "core",
  provenanceByClaim: { [claimNorm]: { source: `src-${contentHash}`, trusted: true } },
  ...extra,
})

describe("upsert — replace (R8)", () => {
  it("CONTROL: same tier, no replace unions claims", () => {
    const store = upsert(upsert(emptyStore(), write("h1", "old claim")).store, write("h2", "new claim")).store
    expect(store.current.get("nk-adv")!.claims).toEqual(["old claim", "new claim"])
  })

  it("REPLACE: same tier with replace drops prior claims", () => {
    const r1 = upsert(emptyStore(), write("h1", "old claim"))
    const r2 = upsert(r1.store, write("h2", "new claim", { replace: true }))
    const node = r2.store.current.get("nk-adv")!
    expect(r2.decision).toBe("UPDATE")
    expect(node.claims).toEqual(["new claim"])
    expect(node.contentHash).toBe("h2")
    expect(node.provenanceByClaim).toEqual({ "new claim": { source: "src-h2", trusted: true } })
    expect(node.tier).toBe("T2")
    expect(node.scope).toBe("core")
    expect(r2.store.cas.has("h1")).toBe(true)
    expect(r2.store.cas.has("h2")).toBe(true)
  })

  it("REPLACE ON CREATE: replace on create is CREATE with single claim", () => {
    const r = upsert(emptyStore(), write("h1", "only claim", { replace: true }))
    expect(r.decision).toBe("CREATE")
    expect(r.store.current.get("nk-adv")!.claims).toEqual(["only claim"])
  })

  it("AUTHORITY UNCHANGED: weaker tier with replace throws governance-downgrade", () => {
    const seeded = upsert(emptyStore(), write("h1", "t1 claim", { tier: "T1" })).store
    let thrown: GovernanceAuthorityError | undefined
    try {
      upsert(seeded, write("h2", "t2 claim", { replace: true }))
    } catch (e) {
      thrown = e as GovernanceAuthorityError
    }
    expect(thrown).toBeInstanceOf(GovernanceAuthorityError)
    expect(thrown!.reason).toBe("governance-downgrade")
  })

  it("RELOCATION UNCHANGED: scope change with replace throws governance-relocation", () => {
    const seeded = upsert(emptyStore(), write("h1", "seed", { tier: "T2" })).store
    let thrown: GovernanceAuthorityError | undefined
    try {
      upsert(seeded, write("h2", "x", { replace: true, scope: "other" }))
    } catch (e) {
      thrown = e as GovernanceAuthorityError
    }
    expect(thrown).toBeInstanceOf(GovernanceAuthorityError)
    expect(thrown!.reason).toBe("governance-relocation")
  })
})