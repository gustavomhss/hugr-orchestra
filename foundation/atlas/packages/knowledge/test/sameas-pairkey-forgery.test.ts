// @atlas/knowledge — test/sameas-pairkey-forgery.test.ts  (task #144 · the pair-key is INJECTIVE)
//
// `read/sameas.ts` keys an unordered pair to decide `sameAsEdgeState`, and that key used to be a
// NUL-separated join whose safety was an assumption about PRODUCERS rather than a property of the encoding.
// It is now LENGTH-PREFIXED (`${lo.length}:${lo}${hi}`), which is injective over any two strings.
//
// THE LAW, stated once so every case below is visibly an instance of it: retracting the pair P must change
// the state of P AND OF NOTHING ELSE. A pair-key collision breaks it in the cruellest available direction —
// the victim pair is reported `retracted`, drops out of `deriveSameAs`, and is then LATCHED, because a
// retraction is by design irreversible. Nobody retracted it and nobody can put it back.
//
// WHY THE CONTROL (`a genuinely retracted pair is STILL retracted`) IS NOT PADDING: without it this file is
// vacuous under the laziest possible mutant. `const pairKey = () => Math.random()` collides with nothing, so
// every forgery case here passes — while retraction itself silently stops working. The forgery cases pin
// "no false positives"; the control pins "no false negatives". Neither is a property on its own.
//
// The separators are chosen adversarially against BOTH encodings — the NUL that the old one reserved, and
// the `:` and leading digits that the new one uses — so a future edit that swaps one bare separator for
// another bare separator cannot pass. That mutant was run; see the seat report.

import { describe, it, expect } from "vitest"
import fc from "fast-check"
import { deriveSameAs, sameAsEdgeState } from "../src/read/sameas.js"
import type { CurrentNode, StoreProjection } from "../src/write/router.js"
import { linkSameAs, unlinkSameAs } from "../src/write/link.js"

const NUL = "\u0000"

function node(key: string): CurrentNode {
  return { nodeKey: key, family: "advisory", contentHash: `ch-${key}`, claims: [] }
}

function proj(...keys: readonly string[]): StoreProjection {
  return { current: new Map(keys.map((k) => [k, node(k)])), cas: new Set() }
}

/** Is the unordered pair `{x,y}` present in the derived (retraction-aware) relation? */
function derived(p: StoreProjection, x: string, y: string): boolean {
  return deriveSameAs(p).some((e) => (e.a === x && e.b === y) || (e.a === y && e.b === x))
}

/**
 * The adversary's move, driven entirely through the REAL reducers: four current nodes, BOTH pairs asserted,
 * then the ATTACKER pair alone retracted. Nothing here hand-writes `sameAsRetracted`, so the fixture cannot
 * be accused of manufacturing a state no door can produce.
 */
function forge(atkX: string, atkY: string, vicX: string, vicY: string): StoreProjection {
  let p = proj(atkX, atkY, vicX, vicY)
  p = linkSameAs(p, atkX, atkY)
  p = linkSameAs(p, vicX, vicY)
  return unlinkSameAs(p, atkX, atkY)
}

/** Both halves of the law for one forgery attempt, so no case can assert only the convenient half. */
function expectNoCollateral(atkX: string, atkY: string, vicX: string, vicY: string, label: string): void {
  const p = forge(atkX, atkY, vicX, vicY)
  // ANTI-VACUITY FIRST: the attacker's OWN retraction must have landed. If it did not, the victim being
  // untouched proves nothing at all — it would just mean this fixture never retracted anything.
  expect(sameAsEdgeState(p, atkX, atkY), `${label}: the attacker's own pair must be retracted`).toBe("retracted")
  expect(derived(p, atkX, atkY), `${label}: the retracted pair must leave the fold`).toBe(false)
  // THE LEAK: the victim pair, which nobody retracted.
  expect(sameAsEdgeState(p, vicX, vicY), `${label}: the VICTIM pair must be untouched`).toBe("asserted")
  expect(derived(p, vicX, vicY), `${label}: the VICTIM pair must still derive`).toBe(true)
}

describe("task #144 — a retraction can never be forged onto another pair through the pair key", () => {
  it("the REPRODUCED exploit: retracting {a, b<NUL>c} leaves {a<NUL>b, c} asserted", () => {
    // The exact shape measured against the built product before the fix, where the victim came back
    // `retracted` and vanished from `deriveSameAs`. Old key for both pairs: `a<NUL>b<NUL>c`.
    expectNoCollateral("a", `b${NUL}c`, `a${NUL}b`, "c", "NUL")
  })

  it("the SAME attack against the NEW separator: retracting {a, b:c} leaves {a:b, c} asserted", () => {
    // The mutant this kills is a regression to any BARE separator, `:` included — i.e. someone "simplifying"
    // `${lo.length}:${lo}${hi}` to `${lo}:${hi}` because the colon is already there. Under that key both
    // pairs are `a:b:c`. Length-prefixing is what makes the colon safe; the colon is not what makes it safe.
    expectNoCollateral("a", "b:c", "a:b", "c", "colon")
  })

  it("a DIGIT-PREFIX attack cannot fake the length header either", () => {
    // Adversarial against the new encoding specifically: keys that themselves begin with digits and a colon,
    // so a decoder that trusted the payload instead of the prefix would mis-split. `{'1:x', 'yy'}` and
    // `{'1:x', 'zz'}` must stay distinct, and neither may borrow the other's retraction.
    expectNoCollateral("1:x", "yy", "1:x", "zz", "digit-prefix")
    expectNoCollateral("2:ab", "c", "2:a", "bc", "digit-prefix-split")
  })

  it("the COLON ITSELF is load-bearing — dropping it re-opens the exploit at operand length ≥ 11", () => {
    // ADDED BY COLD REVIEW (billy, task #144). The docstring on `pairKey` grounds injectivity on "the leading
    // run of DIGITS ends at the first `:`" — and NOTHING above tested that claim. The mutant
    // `${lo.length}${lo}${hi}` (colon dropped, length prefix kept) survived all 9 relevant files / 91 tests,
    // and it is NOT equivalent: the header is written in base 10, so a two-DIGIT length is indistinguishable
    // from a one-digit length followed by a payload digit.
    //
    //     pairKey('1', 'aaaaaaaaaaab')  ==  pairKey('aaaaaaaaaaa', 'b')  ==  '11aaaaaaaaaaab'
    //
    // Every case above stays distinct under the mutant because the smallest collision needs an operand of
    // length ≥ 11, and the property's alphabet is capped at maxLength 4 — the cap that makes the property
    // reach its collision region is exactly the cap that blinds it to this one. So the case is written
    // DETERMINISTICALLY here rather than by widening the generator, which would trade one blind spot for
    // another (long random keys never collide under any encoding — the vacuity trap the small alphabet
    // exists to avoid). Same threat model, same harm as the NUL leak this file was opened for.
    const eleven = "a".repeat(11)
    expectNoCollateral("1", `${eleven}b`, eleven, "b", "no-colon")
  })

  it("PROPERTY — retracting one pair never changes the state of any OTHER pair (fast-check)", () => {
    // The alphabet is the whole point: it contains the OLD separator, the NEW one, and the digits the new
    // prefix is written in, so the generator actually reaches the region the law quantifies over. Drawn from
    // a small alphabet ON PURPOSE — long random keys never collide under ANY encoding, which is exactly the
    // vacuity trap. Short strings over {a, NUL, :, 1, 2} collide constantly under a bare separator.
    const key = fc.stringOf(fc.constantFrom("a", NUL, ":", "1", "2"), { minLength: 0, maxLength: 4 })
    let reachedDistinctPairs = 0
    fc.assert(
      fc.property(key, key, key, key, (w, x, y, z) => {
        // Four keys ⇒ two pairs. Skip anything degenerate: a node never pairs with itself, and the two
        // pairs must be genuinely DIFFERENT pairs or the law says nothing.
        if (w === x || y === z) return true
        const atk = [w, x].sort().join("")
        const vic = [y, z].sort().join("")
        if (atk === vic) return true
        reachedDistinctPairs += 1
        const p = forge(w, x, y, z)
        // The attacker's retraction lands…
        expect(sameAsEdgeState(p, w, x)).toBe("retracted")
        // …and the victim pair is untouched. Under the NUL key this fails within a handful of runs.
        expect(sameAsEdgeState(p, y, z)).toBe("asserted")
        return true
      }),
      { numRuns: 3000 },
    )
    // ANTI-VACUITY: prove the generator did not spend 3000 runs in the `return true` skips above.
    expect(reachedDistinctPairs).toBeGreaterThan(500)
  })

  it("CONTROL — a genuinely retracted pair is STILL retracted (no false negatives)", () => {
    // Kills `pairKey = () => Math.random()` / any key that collides with nothing INCLUDING ITSELF, under
    // which every forgery case above passes while retraction quietly stops working entirely.
    let p = proj("kA", "kB")
    p = linkSameAs(p, "kA", "kB")
    expect(sameAsEdgeState(p, "kA", "kB")).toBe("asserted")
    expect(derived(p, "kA", "kB")).toBe(true)
    p = unlinkSameAs(p, "kA", "kB")
    expect(sameAsEdgeState(p, "kA", "kB")).toBe("retracted")
    expect(derived(p, "kA", "kB")).toBe(false)
    // …and symmetric: the pair is unordered, so the argument order may not change the answer.
    expect(sameAsEdgeState(p, "kB", "kA")).toBe("retracted")
  })

  it("the key is SYMMETRIC — a HALF-WRITTEN retraction is honoured from EITHER endpoint", () => {
    // ADDED AFTER A SURVIVING MUTANT, recorded as such. `pairKey` dropped to `${x.length}:${x}${y}` — no
    // canonical `lo`/`hi` ordering — survives EVERY collision case above, because a well-formed retraction
    // is written to BOTH rows, so the fold inserts BOTH orderings into the set and the asymmetry is masked.
    // It is only observable on a HALF-WRITTEN marker, which is exactly the input `retractedPairs` documents
    // its "EITHER, NOT BOTH" rule for: under the mutant, the missing mirror makes the pair read `asserted`
    // from one side, so a withdrawn edge stays merged and stays transitively contagious — the harm A-D3 was
    // opened about. Hand-written on purpose: no door emits this state; a partially-written projection is
    // untrusted input, which this module's header names in as many words.
    const half: StoreProjection = {
      current: new Map([
        ["kA", { ...node("kA"), sameAs: ["kB"], sameAsRetracted: ["kB"] }],
        ["kB", { ...node("kB"), sameAs: ["kA"] }], // the mirror never landed
      ]),
      cas: new Set(),
    }
    expect(sameAsEdgeState(half, "kA", "kB")).toBe("retracted")
    expect(sameAsEdgeState(half, "kB", "kA")).toBe("retracted") // THE MUTANT DIES HERE
    expect(derived(half, "kA", "kB")).toBe(false) // …and the class actually splits
  })

  it("CONTROL — keys containing the separators still round-trip through assert AND retract", () => {
    // The encoding must not merely avoid collisions; it must still WORK for keys that contain `:`, NUL and
    // digits. A `pairKey` that threw, truncated or normalised such a key would pass every case above.
    for (const [x, y] of [
      ["a", `b${NUL}c`],
      ["1:x", "yy"],
      ["", "a"],
      [`${NUL}`, ":"],
    ] as const) {
      let p = proj(x, y)
      p = linkSameAs(p, x, y)
      expect(sameAsEdgeState(p, x, y), `assert ${JSON.stringify([x, y])}`).toBe("asserted")
      p = unlinkSameAs(p, x, y)
      expect(sameAsEdgeState(p, x, y), `retract ${JSON.stringify([x, y])}`).toBe("retracted")
    }
  })
})
