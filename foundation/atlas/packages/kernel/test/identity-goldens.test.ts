// @atlas/kernel — test/identity-goldens.test.ts  (#104: the PINNED-HASH goldens for the digest FLOOR)
//
// ╔══════════════════════════════════════════════════════════════════════════════════════════════════════╗
// ║  A CHANGE HERE IS A MIGRATION EVENT, NOT A TEST TO UPDATE.                                            ║
// ║                                                                                                       ║
// ║  `id` is the floor every other identity in Atlas stands on: the node fold, the state root, `nodeKey`,  ║
// ║  the CAS key of every stored fact. Move one byte of `canonicalForm`'s output or one bit of the encoder ║
// ║  and EVERY hash in EVERY on-disk store moves at once — not a subset, all of them.                      ║
// ║                                                                                                       ║
// ║  The correct response to a RED here is NEVER to paste in the new value. It is:                         ║
// ║    1. Decide whether the re-key is worth it. It costs every user a full re-derive of everything.       ║
// ║    2. If it is: BUMP `IDENTITY_SCHEMA` in `packages/adapter-io/src/identity-schema.ts`, so an existing  ║
// ║       store is DETECTED and refused with a legible reason instead of silently mis-read (#112).         ║
// ║    3. Update the pin in the SAME commit as the bump, and name what moved in the message.               ║
// ║  Note that a change to KERNEL-1 is additionally a SPEC AMENDMENT (canonical.ts's own header: the NFC   ║
// ║  rule is RATIFIED by REQ-KERNEL-1a and a held-out gate), so step 1 is not a local decision.            ║
// ╚══════════════════════════════════════════════════════════════════════════════════════════════════════╝
//
// ── WHY (#104) ───────────────────────────────────────────────────────────────────────────────────────────
// No golden anywhere in this repository pinned a hash constant, which is how two whole-store re-keyings
// (`0b65b42`, `f2a8659`) shipped with 1346 tests green. Every existing kernel test asserts PROPERTIES —
// determinism, order-independence, NFC equivalence, float rejection — and every one of them is preserved by
// any injective change to the preimage or the digest. They cannot see a re-key. These can.
//
// THE PREIMAGE IS PINNED AS TEXT, NOT ONLY AS A HASH, and that is the more useful half: when this file goes
// red, the preimage assertion says WHAT changed (a key order, an escape, a dropped side-index, an NFC form)
// in a diff a human can read, instead of leaving two 64-character strings to stare at.

import { describe, it, expect } from "vitest"
import { canonicalForm, id } from "../src/canonical.js"
import type { CasObject } from "../src/types.js"

/** The remediation, attached to every assertion so a RED reads as an instruction rather than a diff. */
const MIGRATION =
  "MIGRATION EVENT — this digest is the floor under every hash in every on-disk store. Do NOT paste the new " +
  "value: bump `IDENTITY_SCHEMA` in packages/adapter-io/src/identity-schema.ts in the SAME commit (#112), " +
  "or every existing store silently reads DRIFTED with no explanation."

/**
 * The fixture, chosen so that every rule KERNEL-1 names is actually EXERCISED — a pin over `{a:1}` would be
 * blind to most of them:
 *   · `kind`/`claim`/`n`/`nested` are DECLARED out of sorted order, so the key sort is in the preimage.
 *   · `nested` recurses, so the sort is proven to apply at every level and not just the top.
 *   · `café` is written as an ESCAPE, in COMPOSED form. Spelling it as a literal `é` would leave the
 *     fixture at the mercy of whatever normalization an editor, a filesystem or a patch tool applied to THIS
 *     FILE — which is the exact class of invisible byte change the pin exists to catch, so it must not be
 *     possible to introduce one here by accident.
 *   · `42` is an integer, because a float is a canonical-form violation and would throw instead of hashing.
 *   · an array is present, because array order is SIGNIFICANT and must not be sorted with the keys.
 */
const OBJ: CasObject = {
  kind: "advisory",
  claim: "the door is the only writer",
  n: 42,
  nested: { b: [1, 2], a: "caf\u00e9" }, // COMPOSED (U+00E9)
} as unknown as CasObject

describe("#104 — PINNED IDENTITY GOLDENS: the kernel digest floor (a RED here is a MIGRATION EVENT)", () => {
  it("canonicalForm — the exact preimage BYTES, so a red says WHAT moved and not just THAT it moved", () => {
    expect(new TextDecoder().decode(canonicalForm(OBJ)), MIGRATION).toBe(
      '{"claim":"the door is the only writer","kind":"advisory","n":42,"nested":{"a":"caf\u00e9","b":[1,2]}}',
    )
  })

  it("id — the content address of that preimage", () => {
    expect(String(id(OBJ)), MIGRATION).toBe("2777c1642a90102199b2986bed6b9ff6a6aa36b39572b1ab3fee369a53fbe9d5")
  })

  // The NFC rule is the one place `id` is deliberately NON-injective over JS strings, and it is RATIFIED
  // (REQ-KERNEL-1a). Pinning the decomposed presentation to the SAME literal makes that a fact about a
  // number rather than a fact about itself: the existing property test asserts `id(nfd) === id(nfc)`, which
  // stays true if both move together — this does not.
  it("id — the DECOMPOSED presentation lands on the SAME pinned address (KERNEL-1a, NFC)", () => {
    // DECOMPOSED: `e` + COMBINING ACUTE (U+0065 U+0301) — `!==` the composed form in JavaScript.
    const decomposed = { ...(OBJ as Record<string, unknown>), nested: { b: [1, 2], a: "cafe\u0301" } } as CasObject
    expect((decomposed as unknown as { nested: { a: string } }).nested.a).not.toBe("caf\u00e9") // really distinct
    expect(String(id(decomposed)), MIGRATION).toBe("2777c1642a90102199b2986bed6b9ff6a6aa36b39572b1ab3fee369a53fbe9d5")
  })

  // KERNEL-8: `grounding`/`status`/`freshness` are DELETED from every preimage at every level. The existing
  // tests assert the deletion relationally ("with and without them agree"), which survives any re-key. This
  // pins the survivor to the literal above, so removing a name from the side-index set — which would fold a
  // mutable field into every identity in the product — moves this and nothing else would notice.
  it("id — the KERNEL-8 side-indexes are excluded, landing on the SAME pinned address", () => {
    const withSideIndexes = {
      ...(OBJ as Record<string, unknown>),
      grounding: { entries: [] },
      status: "HOLDS",
      freshness: "FRESH",
      nested: { b: [1, 2], a: "caf\u00e9", status: "NA" },
    } as CasObject
    expect(String(id(withSideIndexes)), MIGRATION).toBe(
      "2777c1642a90102199b2986bed6b9ff6a6aa36b39572b1ab3fee369a53fbe9d5",
    )
  })
})
