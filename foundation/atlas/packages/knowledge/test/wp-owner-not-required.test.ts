// @atlas/knowledge — test/wp-owner-not-required.test.ts  (#187 · WP-SEC-3.KNOW, AMENDED by #186)
//
// #178/PR#105 folded an `isOwner` guard into `authz()`'s write branch and pinned it in
// `wp-fix-enforce-owner.test.ts`. #187 (owner-ratified 2026-08-03) reversed that fold-in — `owner` is
// removed from KNOW-11a's MUST; `scope` is the SOLE ownership anchor.
//
// ── WHAT #186 CHANGED IN THIS FILE, AND WHY THE DELETION IS THE POINT ────────────────────────────────────
// Five cases below used to assert the KNOW-11 fence through `authz('write', actor, fact)` / `inScope(actor,
// scope)`. Those two functions had ZERO production callers. Measured on the BUILT `dist` in a subprocess: a
// successful `atlas emit` reaches `actorInScope` (adapter-io/src/policy.ts) and `isScope` (this package) and
// reaches `authz`/`inScope` NEVER. So those five assertions were GREEN ABOUT A GATE THAT DID NOT RUN — and
// worse, they were green about a DIFFERENT gate: `inScope` decided `actor === scope` (nominal equality)
// while the shipped door decides admin-declared membership out of `.atlas/policy.json`. A suite passing on
// the nominal model would have kept passing had the real one been deleted.
//
// They are removed, not relocated, and NO real coverage is lost — the live fence is proven twice already,
// at both levels, and neither was touched:
//   · `packages/adapter-io/test/policy.test.ts` — `describe('actorInScope — fail-closed authz, THE
//     KNOW-11a gate (#186: no longer a mirror of a dead one)')`, six cases including the absent-scope and
//     prototype-name TEETH. (This same commit renamed that title; the old wording called it a "mirror" of
//     the `inScope` it deleted.)
//   · `packages/e2e-blackbox/test/s7-governance.blackbox.test.ts` — the same fence through the REAL `atlas`
//     binary: in-scope ALLOW (exit 0), out-of-scope / empty-actor DENY (exit 2, `reason: unauthorized`,
//     nothing persisted), absent-scope refused at gate 0 (`reason: malformed scope`).
//
// What is pinned HERE is what this package actually owns:
//   1. The coercion table for `isScope` — the surviving runtime SHAPE guard, re-run and printed.
//   2. A REGRESSION FENCE against #186 coming back: the package must NOT re-export a second authz decision.

import { describe, it, expect } from "vitest"
import * as knowledge from "@atlas/knowledge"
import { isScope } from "../src/write/authz.js"

describe("#187 — KNOW-11a scope fence: isScope coercion surface (re-pinned, unchanged by the amendment)", () => {
  // The coercion table — printed so a reviewer can read the whole validity product at a glance. Only a
  // non-empty string may pass; every coercion-hazard shape (property-key coercion, `toString`/`valueOf`
  // objects, falsy-but-typed values) must fail CLOSED. `isScope` itself is untouched by #187 and by #186 —
  // this table is a RE-RUN, not a new claim, so the surviving guard is pinned as tightly as `isOwner` was.
  const cases: ReadonlyArray<readonly [string, unknown, boolean]> = [
    ["undefined", undefined, false],
    ["null", null, false],
    ["''", "", false],
    ["0", 0, false],
    ["false", false, false],
    ["{}", {}, false],
    ["[]", [], false],
    ["['core']", ["core"], false], // array coercion hazard — reads as the string via property-key coercion elsewhere, must NOT pass isScope
    ["{toString:() => 'core'}", { toString: () => "core" }, false], // valueOf/toString coercion hazard
    ["'core'", "core", true], // the one legal shape
  ]

  it.each(cases)("isScope(%s) → %s", (_label, value, expected) => {
    expect(isScope(value)).toBe(expected)
  })

  it("prints the full coercion table (for the review record)", () => {
    const table = cases.map(([label, value, expected]) => ({ input: label, isScope: isScope(value), expected }))
    // eslint-disable-next-line no-console
    console.log(table)
    for (const row of table) expect(row.isScope).toBe(row.expected)
  })
})

describe("#186 — ONE authz implementation: the knowledge package publishes the SHAPE, never the DECISION", () => {
  // The regression this pins is not hypothetical — it is the state the tree was in until #186. A second,
  // nominal `authz()` sat in the barrel, fully tested, called by nothing, describing a fence the product did
  // not have. Re-adding any of these names to `@atlas/knowledge` re-creates two answers to one question, and
  // the reference-model-guard CANNOT catch it: that gate measures whole MODULES, and `write/authz.ts` is
  // live (three production call sites for `isScope`), so a dead export added beside a live one is invisible
  // to it. Its header states that limit in as many words. This test is the cover for it.
  //
  // NOTE ON WHAT THIS READS. `import * as knowledge from '@atlas/knowledge'` resolves through the workspace
  // package `exports` to the BUILT `dist/src/index.js`, not to `src/` — `vitest.config.ts` declares no alias.
  // That is deliberate here and it is the SHIPPED barrel, the same surface `atlas emit` loads. The practical
  // consequence, recorded because it bit the mutation run: a mutant re-adding `inScope` to `src/write/authz.ts`
  // SURVIVES until `tsc -b` runs. It was re-run with the rebuild and KILLED (suite exit 1). A mutant that
  // never reached the code under test is not a survivor, it is a mutant that did not apply.
  const FORBIDDEN = ["authz", "authzApi", "inScope"] as const

  it("the barrel exports isScope and NONE of the deleted decision surface", () => {
    const surface = Object.keys(knowledge as Record<string, unknown>).sort()
    const present = FORBIDDEN.filter((n) => n in (knowledge as Record<string, unknown>))
    // eslint-disable-next-line no-console
    console.log({
      forbiddenNamesFound: present,
      isScopeExported: "isScope" in (knowledge as Record<string, unknown>),
      surfaceSize: surface.length,
    })
    expect(present).toStrictEqual([]) // NAMES printed, never a bare count
    expect("isScope" in (knowledge as Record<string, unknown>)).toBe(true)
  })

  it("isScope answers a SHAPE question only — it says nothing about who may write", () => {
    // The whole reason `isScope` is not an authz decision: it passes any non-empty string, including a scope
    // no policy has ever declared. Authorization is `actorInScope(policy, actor, scope)` in adapter-io.
    expect(isScope("a-scope-no-policy-declares")).toBe(true)
    expect(isScope("core")).toBe(true)
  })
})
