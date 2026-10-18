// @atlas/tools — test/guard-fail-closed.test.ts   (INV-TOOLS-15 — the FAIL-CLOSED leg of the write door)
//
// THE PROPERTY, STATED: *a row whose canonical form cannot be COMPUTED is refused — at the write door and at
// the read-integrity leg — and nothing is admitted.* `src/guard.ts` publishes it in prose ("Total: a
// canonical-form violation (float / bigint / symbol / cyclic value) can never be a grounded row, so it fails
// closed") and implements it as `catch { return false; }`. Before this file NOTHING asserted it: the mutant
// `catch { return true; }` — every uncanonicalizable row ADMITTED AS GROUNDED, which is exactly the
// unscoped-CLI hole TOOLS-15 exists to close — left `packages/tools/test` 79/79 green (measured).
//
// The only red in the whole 1802-test suite was a WALL-CLOCK budget in `e2e-blackbox/s10-node-door`, and
// that attribution does not reproduce (3/3 green under the mutant on a quiet box; a stderr probe inside
// `contentAddressed` fired ZERO times across the whole black-box story, i.e. the CLI never reaches this
// function at all). A performance budget is not a statement of a fail-closed law; this file is.
//
// EVERY fixture below carries its PREMISE as an assertion (`id(value)` really does throw). Without that a
// fixture that silently became canonicalizable would turn this whole file green for the wrong reason — the
// same failure mode as an assertion on a string the code rewrites.
//
// Refusals are compared on the DISCRIMINANT (the text before the first `:`) for EQUALITY, never by
// substring: the two refusal constants in `guard.ts` each quote the OTHER leg's vocabulary ("content
// address", "TOOLS-15"), so `toContain('TOOLS-15')` cannot tell the write leg from the read leg.

import { describe, expect, it } from "vitest"
import { id } from "@atlas/kernel"
import type { CasObject } from "@atlas/kernel"
import { createGuard, createGovernedStore } from "../src/guard.js"
import type { StoreRow } from "../src/guard.js"

/** THE DISCRIMINANT — everything before the first `:`. Mirrors `reasonOf` (adapter-io door-regression
 *  support, ADR-0007), restated locally because `tools` carries ZERO edges to the ring (ARCH-1). */
const reasonOf = (rejected: string | undefined): string => (rejected ?? "").split(":")[0]!

/** The write leg's refusal name and the read leg's rejection name — DISTINCT, so asserting one for equality
 *  proves WHICH leg refused (a substring assertion on either prose would not). */
const REFUSED_WRITE = "append-only/permission"
const REJECTED_READ = "integrity-check"

/** A cyclic value — `serialize` recurses into it forever, so the canonicalizer dies with a `RangeError`
 *  rather than an `Error`. Built here (not a literal) because a cycle cannot be written as one. */
function cyclic(): Record<string, unknown> {
  const c: Record<string, unknown> = { kind: "claim" }
  c.self = c
  return c
}

/** An NFC key collision — 'café' spelled PRECOMPOSED and DECOMPOSED. Two distinct JS keys that normalize to
 *  one, so the canonical preimage would depend on insertion order (KERNEL-1). Written with escapes on
 *  purpose: the two spellings are byte-different and indistinguishable by eye in a source file. */
function nfcCollision(): Record<string, unknown> {
  const o: Record<string, unknown> = {}
  o["café"] = 1 // NFC  — U+00E9
  o["café"] = 2 // NFD — 'e' + U+0301
  return o
}

/** The values a grounded row can NEVER hold: `id` cannot compute a canonical form for any of them. */
const UNCANONICALIZABLE: readonly (readonly [string, unknown])[] = [
  ["a float (KERNEL: floats forbidden)", { kind: "claim", ratio: 1.5 }],
  ["a non-finite number", { kind: "claim", n: Number.POSITIVE_INFINITY }],
  ["NaN", { kind: "claim", n: Number.NaN }],
  ["a bigint", { kind: "claim", n: 1n }],
  ["a symbol", { kind: "claim", s: Symbol("not-json") }],
  ["a function", { kind: "claim", f: (): number => 1 }],
  ["a cyclic value", cyclic()],
  ["an NFC key collision", nfcCollision()],
]

/** A GROUNDED control row: key IS `id(value)`, exactly what `atlas-emit`'s content-addressed path produces.
 *  Its key is ALSO the address every hostile row below is handed — so a refusal can never be explained by
 *  the key merely "looking wrong". */
const CONTROL = { kind: "claim", claim: "ACME ARR 2024 = $4.2M" }
const CONTROL_ADDR = id(CONTROL as CasObject)

describe("INV-TOOLS-15 — an uncanonicalizable row is REFUSED at the write door (nothing is admitted)", () => {
  it.each(UNCANONICALIZABLE)("%s is refused by admitOnWrite, under a REAL CAS address", (_name, value) => {
    // PREMISE: this value genuinely has no canonical form. If this ever stops throwing the fixture is dead
    // and every assertion under it would pass vacuously.
    expect(() => id(value as CasObject)).toThrow()

    const row: StoreRow = { key: CONTROL_ADDR, value } // a real 64-hex CAS address — not a "wrong-looking" key
    const verdict = createGuard().admitOnWrite(row)

    // THE PROPERTY: no canonical form ⇒ not grounded ⇒ refused. `admitted` is the machine value, and the
    // refusal NAMES the write leg (compared for equality, so the read leg's reason cannot satisfy it).
    expect(verdict.admitted).toBe(false)
    expect(reasonOf(verdict.rejected)).toBe(REFUSED_WRITE)
  })

  it.each(UNCANONICALIZABLE)("%s is rejected by admitOnRead — never served", (_name, value) => {
    expect(() => id(value as CasObject)).toThrow()

    const verdict = createGuard().admitOnRead({ key: CONTROL_ADDR, value })

    expect(verdict.admitted).toBe(false)
    expect(reasonOf(verdict.rejected)).toBe(REJECTED_READ) // the READ leg, by name
  })

  it("CONTROL: a canonicalizable row whose key IS its content address is still ADMITTED on both legs", () => {
    // Without this the whole file is satisfied by a guard that refuses EVERYTHING — a fail-closed assertion
    // set with no positive control cannot tell "closed" from "bricked".
    const guard = createGuard()
    const row: StoreRow = { key: CONTROL_ADDR, value: CONTROL }

    expect(guard.admitOnWrite(row).admitted).toBe(true)
    expect(guard.admitOnRead(row).admitted).toBe(true)
    expect(guard.admitOnWrite(row).rejected).toBeUndefined()
  })
})

describe("INV-TOOLS-15 — NOTHING is admitted: the governed store never stores or serves such a row", () => {
  it("every uncanonicalizable row is turned away at the door — the medium stays EMPTY", () => {
    const medium = new Map<string, StoreRow>()
    const store = createGovernedStore(medium)

    for (const [, value] of UNCANONICALIZABLE) {
      const verdict = store.write({ key: CONTROL_ADDR, value })
      expect(verdict.admitted).toBe(false)
      expect(reasonOf(verdict.rejected)).toBe(REFUSED_WRITE)
    }

    // THE "nothing is admitted" half, stated on the medium itself rather than inferred from the verdicts:
    // not one row landed, and the address they all contended for resolves to nothing.
    expect(medium.size).toBe(0)
    expect([...medium.keys()]).toEqual([])
    expect(store.read(CONTROL_ADDR)).toBeUndefined()
    expect(store.project(CONTROL_ADDR).read()).toBeUndefined()
  })

  it("a BACK-CHANNEL row that skipped the door (already in the medium) is never SERVED", () => {
    // The second leg of TOOLS-15: a shell that mutates the backing medium directly cannot be stopped at
    // write time, so read-time integrity is the gate. An uncanonicalizable value cannot be re-addressed at
    // all, so it must be rejected there.
    for (const [, value] of UNCANONICALIZABLE) {
      const medium = new Map<string, StoreRow>()
      const injected: StoreRow = { key: CONTROL_ADDR, value }
      medium.set(injected.key, injected) // straight into the medium — the write door never ran
      const store = createGovernedStore(medium)

      expect(medium.size).toBe(1) // it IS there — the read gate is what has to hold
      expect(store.read(CONTROL_ADDR)).toBeUndefined() // …and it is never served
      expect(store.project(CONTROL_ADDR).read()).toBeUndefined() // …through the read projection either
    }
  })

  it("an uncanonicalizable write cannot DISPLACE a grounded row already admitted (append-only holds)", () => {
    const medium = new Map<string, StoreRow>()
    const store = createGovernedStore(medium)
    expect(store.write({ key: CONTROL_ADDR, value: CONTROL }).admitted).toBe(true)
    const bytesBefore = JSON.stringify(medium.get(CONTROL_ADDR))

    for (const [, value] of UNCANONICALIZABLE) {
      expect(store.write({ key: CONTROL_ADDR, value }).admitted).toBe(false)
    }

    expect(medium.size).toBe(1)
    expect(JSON.stringify(medium.get(CONTROL_ADDR))).toBe(bytesBefore) // byte-identical — nothing displaced
    expect(store.read(CONTROL_ADDR)).toEqual({ key: CONTROL_ADDR, value: CONTROL })
  })
})
