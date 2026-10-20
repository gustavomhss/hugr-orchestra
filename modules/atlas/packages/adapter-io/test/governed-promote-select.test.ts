import { describe, it, expect } from "vitest"
import { asHash } from "@atlas/kernel"
import type { GroundedFact } from "@atlas/knowledge"
import type { EmitOut } from "@atlas/tools"
import { createGovernedPromote } from "../src/governed-promote.js"
import { makePromoteFixture, minedFact } from "./harness/promote-fixtures.js"

const AT = asHash("deadbeef")
function setup() {
  const fx = makePromoteFixture()
  const a = fx.stage(minedFact({ anchor: "src/a.ts::f", claimNorm: "a holds" })).nodeKey
  const b = fx.stage(minedFact({ anchor: "src/b.ts::g", claimNorm: "b holds" })).nodeKey
  const c = fx.stage(minedFact({ anchor: "src/c.ts::h", claimNorm: "c holds" })).nodeKey
  const seen: GroundedFact[] = []
  const emit = (f: GroundedFact): EmitOut => {
    seen.push(f)
    return { emitted: true, id: asHash(`id-${seen.length}`) }
  }
  return { promote: createGovernedPromote({ store: fx.store, emit }).promote, seen, a, b, c }
}

describe("governed promote selection", () => {
  it("no selection presents every staged row", () => {
    const { promote, seen } = setup()
    const out = promote(AT)
    expect(out.candidates).toBe(3)
    expect(out.promoted).toBe(3)
    expect(seen.map((f) => (f as { claimNorm: string }).claimNorm)).toEqual(["a holds", "b holds", "c holds"])
    expect("held" in out).toBe(false)
    expect("unknown" in out).toBe(false)
  })

  it("only one presents that row only", () => {
    const { promote, seen, b } = setup()
    const out = promote(AT, { only: [b], held: new Set() })
    expect(out.candidates).toBe(1)
    expect(out.rows[0]?.nodeKey).toBe(b)
    expect(seen.map((f) => (f as { claimNorm: string }).claimNorm)).toEqual(["b holds"])
  })

  it("held rows are skipped", () => {
    const { promote, seen, a } = setup()
    const out = promote(AT, { held: new Set([a]) })
    expect(out.candidates).toBe(2)
    expect(out.held).toEqual([a])
    expect(seen.map((f) => (f as { claimNorm: string }).claimNorm)).toEqual(["b holds", "c holds"])
  })

  it("held wins over named", () => {
    const { promote, seen, a, c } = setup()
    const out = promote(AT, { only: [a, c], held: new Set([a]) })
    expect(out.candidates).toBe(1)
    expect(out.held).toEqual([a])
    expect(seen.map((f) => (f as { claimNorm: string }).claimNorm)).toEqual(["c holds"])
  })

  it("reports unknown keys", () => {
    const { promote, b } = setup()
    const out = promote(AT, { only: [b, "nk-missing"], held: new Set() })
    expect(out.unknown).toEqual(["nk-missing"])
    expect(out.candidates).toBe(1)
    expect(out.refused).toBe(0)
  })

  it("everything held presents nothing", () => {
    const { promote, seen, a, b, c } = setup()
    const out = promote(AT, { held: new Set([a, b, c]) })
    expect(out.candidates).toBe(0)
    expect(out.promoted).toBe(0)
    expect(out.held).toHaveLength(3)
    expect(seen).toEqual([])
  })
})
