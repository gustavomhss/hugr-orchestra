// @atlas/index — test/territory.test.ts  (WP-2.9-a.INDEX)
//
// RED→GREEN transcription of the VISIBLE territory-assignment goldens SCN-INDEX-14a-1..14f-1
// (REQ-INDEX-14a..14f) + the governing ∀-law PROP-INDEX-14 (deterministic overlap resolution). Golden
// owners/tiers are SYMBOLIC ⇒ every assertion is RELATIONAL: assignment tracks the manifest (change the
// manifest → change the result), the longest-path glob wins over declaration order, a rebuild is
// byte-identical (via the kernel canonical seam), an unmatched path is a `uncovered` VERDICT and a
// T0-adjacent uncovered path defaults to `deny`. Held-out `-2` fixtures are NOT transcribed (GATE runs those).

import { describe, it, expect } from "vitest"
import fc from "fast-check"
import { canonicalForm } from "@atlas/kernel"
import type { Manifest } from "@atlas/index"
import type { Territory } from "@atlas/contracts"
import { assign, assignModelCalls, type Assignment } from "../src/territory.js"

const canon = (a: Assignment): string => new TextDecoder().decode(canonicalForm(a))
const T = (name: string, owner: string, tier: Territory["tier"], globs: string[]): Territory => ({
  name,
  owner,
  tier,
  globs,
})

describe("INDEX-14 — territory assignment & overlap resolution (visible goldens)", () => {
  it("SCN-INDEX-14a-1: assignment derives from the hashed manifest (not a hardcoded map)", () => {
    const path = "core/cas/cas.ts"
    const mA: Manifest = { territories: [T("cas", "charlie", "T1", ["core/cas/**"])] }
    const rA = assign(path, mA)
    expect(rA).toEqual({ kind: "assigned", owner: "charlie", tier: "T1" })
    // teeth: changing the manifest MUST change the assignment — it is read from the manifest, not a fixed map.
    const mB: Manifest = { territories: [T("cas", "dana", "T2", ["core/cas/**"])] }
    const rB = assign(path, mB)
    expect(rB).toEqual({ kind: "assigned", owner: "dana", tier: "T2" })
  })

  it("SCN-INDEX-14b-1: overlapping globs resolve by longest-path-match, then declaration order", () => {
    // T0 declared FIRST (shorter glob) — longest-path MUST still beat declaration order.
    const manifest: Manifest = {
      territories: [T("t0", "charlie", "T0", ["core/**"]), T("t1", "dana", "T1", ["core/cas/**"])],
    }
    const r = assign("core/cas/cas.ts", manifest)
    expect(r).toEqual({ kind: "assigned", owner: "dana", tier: "T1" }) // core/cas/** is the longer match
  })

  it("SCN-INDEX-14c-1: assignment is byte-identical across rebuilds", () => {
    const manifest: Manifest = {
      territories: [T("t0", "charlie", "T0", ["core/**"]), T("t1", "dana", "T1", ["core/cas/**"])],
    }
    for (const p of ["core/cas/cas.ts", "core/other.ts", "scripts/tmp.sh"]) {
      expect(canon(assign(p, manifest))).toBe(canon(assign(p, manifest)))
    }
  })

  it("SCN-INDEX-14d-1: a path matched by no glob is flagged uncovered (a verdict, not a silent pass)", () => {
    const manifest: Manifest = { territories: [T("cas", "charlie", "T1", ["core/cas/**"])] }
    const r = assign("scripts/tmp.sh", manifest)
    expect(r.kind).toBe("uncovered") // NOT assigned to a default owner
  })

  it("SCN-INDEX-14e-1: a T0-adjacent uncovered path defaults to deny", () => {
    // T0 member is the exact file core/cas/cas.ts; new.ts shares region core/cas but matches no glob.
    const manifest: Manifest = { territories: [T("cas", "charlie", "T0", ["core/cas/cas.ts"])] }
    const r = assign("core/cas/new.ts", manifest)
    expect(r).toEqual({ kind: "uncovered", verdict: "deny" })
    // a non-T0-adjacent uncovered path does NOT default to deny.
    expect(assign("scripts/tmp.sh", manifest)).toEqual({ kind: "uncovered", verdict: "open" })
  })

  it("SCN-INDEX-14f-1: assignment calls no model (model-call-count == 0)", () => {
    const manifest: Manifest = {
      territories: [T("t0", "charlie", "T0", ["core/**"]), T("t1", "dana", "T1", ["core/cas/**"])],
    }
    assign("core/cas/cas.ts", manifest)
    assign("scripts/tmp.sh", manifest)
    expect(assignModelCalls()).toBe(0)
  })
})

describe("PROP-INDEX-14 — deterministic overlap resolution (∀-law)", () => {
  const levels = ["a", "a/b", "a/b/c"] as const
  it("longest-path-match wins over declaration order; total, single-valued, byte-identical, $0-LLM", () => {
    fc.assert(
      fc.property(
        fc.uniqueArray(fc.constantFrom("u1", "u2", "u3", "u4", "u5"), { minLength: 3, maxLength: 3 }),
        fc.tuple(fc.integer(), fc.integer(), fc.integer()),
        (owners, ords) => {
          const terrs = levels.map((lvl, i) => T(lvl, owners[i]!, "T1", [`${lvl}/**`]))
          // impose an arbitrary declaration order via the random ord keys (stable sort).
          const ordered = terrs
            .map((t, i) => ({ t, o: ords[i]! }))
            .sort((x, y) => x.o - y.o)
            .map((x) => x.t)
          const manifest: Manifest = { territories: ordered }
          const covered = assign("a/b/c/x.ts", manifest)
          // longest literal prefix (a/b/c/**) wins REGARDLESS of declaration order → deepest owner.
          expect(covered).toEqual({ kind: "assigned", owner: owners[2], tier: "T1" })
          // determinism / byte-identity across reruns.
          expect(canon(assign("a/b/c/x.ts", manifest))).toBe(canon(assign("a/b/c/x.ts", manifest)))
          // a no-glob path is a uncovered verdict (single-valued, total).
          expect(assign("zzz/x.ts", manifest).kind).toBe("uncovered")
          expect(assignModelCalls()).toBe(0)
        },
      ),
      { numRuns: 200 },
    )
  })
})
