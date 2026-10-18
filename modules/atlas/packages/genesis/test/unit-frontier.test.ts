// @atlas/genesis — test/unit-frontier.test.ts  (#182 S1 — the frontier emits sub-file sites, ordered by a
// PRIOR that is never a hash)
//
// THE CEILING THIS REMOVES. `seeds.ts` emitted exactly one `kind` literal — `'file'` — so one fact per file
// was a ceiling BY CONSTRUCTION, while `foldAstUnits` had already parsed, keyed and Merkle-hashed the
// sub-file units on the same production path. MEASURED on this repository through the built `dist`: 520
// file sites against 5283 sub-file units (3798 item + 1485 block), ratio 10.2×.
//
// WHAT DECIDES WHICH UNITS GET MINED, and why it is the whole of S1. `deriveEdges` keys BOTH endpoints of
// every dependency edge by DOCUMENT, so no sub-file unit has a vertex in the dependency graph and none can
// ever have a PPR of its own. A unit therefore inherits its file's score and TIES with the file and with
// every sibling — which makes the tie-break, not the score, the thing that spends the owner's money. On
// master that tie-break was `cmp(subtreeHash)`: a hash. MEASURED on this repository before the change: 40
// of the 200 sites inside the shipped budget window were ALREADY being ordered by it (14 tie groups,
// largest 10), so this is not a hypothetical branch.
//
// THE FIXTURES ARE BUILT BY `@atlas/index` `build`, never hand-written as axes — the same reason
// `seeds-qualified-path.test.ts` gives: only the real build has a spatial axis keyed by PATH with a
// content-fold subtreeHash and a dependency axis keyed by `id({file: path})`, which is the seam every claim
// below lives on. The sub-file nodes are written into the FileTree directly (rather than produced by
// `foldAstUnits`) because @atlas/genesis is INNER to adapter-io and may not import it — the shape is the
// one `ast.ts` `unitPath` mints, and `symbol-frontier.test.ts` over in adapter-io drives the real fold.

import { describe, expect, it } from "vitest"
import { build, nodeHashOfPath } from "@atlas/index"
import type { FileTree, ScipOutput } from "@atlas/index"
import type { Skeleton, UnitPrior } from "../src/index.js"
import {
  canonicalizeSkeleton,
  compareSiteOrder,
  rank,
  siteOrderKeys,
  structuralFrontier,
  structuralSeeds,
} from "../src/rank.js"

const SYM_GREET = "util/greet()."

// ── the corpus ────────────────────────────────────────────────────────────────────────────────────────
// `src/util.ts` carries THREE items and one block, spelled exactly as `ast.ts` `unitPath` mints them
// (`<file>::<kind>:<ordinal>[:<name>]`, `<item>::<block>` for the nested level).
const U = "src/util.ts"
const GREET = `${U}::function_declaration:0:greet`
const HELPER = `${U}::function_declaration:1:helper`
const ZETA = `${U}::function_declaration:2:zeta`
const CLOSURE = `${GREET}::arrow_function:0`
// ALPHA and OMEGA are the `path asc` PAIR: identical `exported` AND identical `bytes`, so the third leg
// of the comparator is the only thing that can separate them. Without such a pair the leg is unreachable
// in this fixture and a mutant reversing it survives the entire suite while reordering 488 of the real
// repository's 5816 emitted records — measured, and the reason this pair exists.
const ALPHA = `${U}::function_declaration:0:alpha`
const OMEGA = `${U}::function_declaration:0:omega`

const leaf = (path: string, content: string): FileTree => ({ path, children: [], content })

const TREE: FileTree = {
  path: ".",
  children: [
    {
      path: "src",
      children: [
        leaf("src/app.ts", "import { greet } from './util';\n"),
        {
          path: U,
          content: "export function greet(){} function helper(){} export function zeta(){}\n",
          children: [
            { path: GREET, content: "export function greet(){}", children: [leaf(CLOSURE, "() => 1")] },
            leaf(HELPER, "function helper(){}"),
            leaf(ZETA, "export function zeta(){}"),
            leaf(ALPHA, "export function alpha(){}"),
            leaf(OMEGA, "export function omega(){}"),
          ],
        },
      ],
    },
  ],
}

const SCIP: ScipOutput = {
  documents: [
    { relativePath: U, occurrences: [{ symbol: SYM_GREET, role: "definition" }] },
    { relativePath: "src/app.ts", occurrences: [{ symbol: SYM_GREET, role: "reference" }] },
  ],
}

const SK: Skeleton = canonicalizeSkeleton({ axes: build(TREE, SCIP), manifest: { territories: [] } })

/**
 * The injected `UnitPriorSource`. The numbers are chosen so that EVERY leg of the comparator is
 * discriminating and each one alone would produce a DIFFERENT order — a fixture where two legs agree
 * cannot tell which one is doing the work:
 *   exported-only ⇒ {greet, zeta} before helper       size-only ⇒ helper, greet, zeta
 *   path-only     ⇒ greet, helper, zeta               the real order ⇒ greet, zeta, helper
 * ALPHA/OMEGA additionally tie on BOTH of the first two legs, so `path asc` is the only leg that can
 * order them and a mutation of that leg alone has somewhere to show.
 */
const PRIORS: Readonly<Record<string, UnitPrior>> = {
  [GREET]: { exported: true, bytes: 60 },
  [HELPER]: { exported: false, bytes: 200 },
  [ZETA]: { exported: true, bytes: 20 },
  [CLOSURE]: { exported: false, bytes: 7 },
  [ALPHA]: { exported: true, bytes: 40 }, // ties with OMEGA on (exported, bytes) …
  [OMEGA]: { exported: true, bytes: 40 }, // … so only `path asc` separates them
}
const prior = (p: string): UnitPrior | undefined => PRIORS[p]

const pathsOf = (sites: readonly { readonly qualifiedPath: string }[]): string[] => sites.map((s) => s.qualifiedPath)

// ── I6 — arm FILE is the shipped frontier, byte for byte ──────────────────────────────────────────────

describe("#182 I6 — the sub-file frontier is OPT-IN; the default is master, byte for byte", () => {
  it("no options ⇒ the exact shipped seed list, every leg of every seed identical", () => {
    // teeth (breaks-on "sub-file seeding becomes the default"): the mutant returns 6 seeds here. Asserted
    // as EXACT records — kind, path AND subtreeHash — never by count and never by `toContain`, which
    // cannot tell `src/util.ts` from `src/util.ts::function_declaration:0:greet`.
    expect([...structuralSeeds(SK)]).toEqual([
      { kind: "file", qualifiedPath: U, subtreeHash: String(nodeHashOfPath(U)) },
      { kind: "file", qualifiedPath: "src/app.ts", subtreeHash: String(nodeHashOfPath("src/app.ts")) },
    ])
    expect(structuralFrontier(SK).droppedNoPath).toBe(0)
  })

  it("`subFile: false` is the same list as no options at all — one behaviour, not two", () => {
    expect([...structuralSeeds(SK, { subFile: false, prior })]).toEqual([...structuralSeeds(SK)])
  })
})

// ── S1 — the units are emitted, with the kinds the contract already declared ───────────────────────────

describe("#182 S1 — `subFile: true` seeds the symbol and block units inside each frontier file", () => {
  it("emits `symbol` for an item and `block` for a sub-item unit, each at its `::` address", () => {
    // C2 — BOTH kinds are covered here, and by exact records rather than by a kind histogram: a producer
    // that emitted `symbol` for the closure would satisfy any count-based assertion.
    const seeds = structuralSeeds(SK, { subFile: true, prior })
    const byPath = new Map(seeds.map((s) => [s.qualifiedPath, s.kind]))

    expect(byPath.get(GREET)).toBe("symbol")
    expect(byPath.get(HELPER)).toBe("symbol")
    expect(byPath.get(ZETA)).toBe("symbol")
    expect(byPath.get(CLOSURE)).toBe("block") // `file::item::block` — one level deeper, a different kind
    expect(byPath.get(U)).toBe("file") //        the coarse anchor stays: the arms differ ONLY in granularity
  })

  it("I1 — every emitted sub-file seed addresses a node that really exists in the folded tree", () => {
    // A seed for a key nothing can resolve is a site that can only ever take the `source-unreadable`
    // refusal. teeth (breaks-on "the frontier invents a unit address"): a fabricated `::` suffix is absent
    // from this set and fails.
    const inTree = new Set<string>()
    const walk = (n: FileTree): void => {
      inTree.add(n.path)
      n.children.forEach(walk)
    }
    walk(TREE)

    const subFileSeeds = structuralSeeds(SK, { subFile: true, prior }).filter((s) => s.kind !== "file")
    expect(subFileSeeds.length).toBe(6) // 5 items + 1 block — the whole of what the tree holds
    for (const s of subFileSeeds) expect(inTree.has(s.qualifiedPath)).toBe(true)
  })

  it("a unit carries the unit's OWN content subtreeHash, never the file's identity hash", () => {
    // The grounding leg has to address the unit or the drift oracle is watching the wrong bytes.
    const seeds = structuralSeeds(SK, { subFile: true, prior })
    const greet = seeds.find((s) => s.qualifiedPath === GREET)!
    const file = seeds.find((s) => s.qualifiedPath === U)!

    expect(String(greet.subtreeHash)).not.toBe(String(file.subtreeHash))
    expect(String(greet.subtreeHash)).not.toBe(String(nodeHashOfPath(U)))
  })
})

// ── I4 — the within-file order is a strict total order and it is NOT a hash ────────────────────────────

describe("#182 I4 — the within-file order is `(exported desc, size desc, path asc)`", () => {
  it("ranks the units of one file by the PRIOR, and the file itself first", () => {
    // THE LOAD-BEARING ASSERTION OF S1. All four units tie with their file at one PPR score, so this order
    // is produced entirely by the tie-break. teeth: `size desc` alone gives helper first; `path asc` alone
    // gives greet, helper, zeta; the shipped `cmp(subtreeHash)` gives an order unrelated to all three.
    const ranked = rank(SK, structuralSeeds(SK, { subFile: true, prior }), { prior })
    const util = pathsOf(ranked.map((c) => c.site)).filter((p) => p.startsWith(U))

    expect(util).toEqual([U, GREET, ALPHA, OMEGA, ZETA, HELPER, CLOSURE])
  })

  it("every unit of a file really does tie with it — the score is not doing the ordering", () => {
    // If the units did NOT tie, the assertion above would be witnessing the PPR and not the prior, and the
    // whole "a hash is spending the money" finding would be about a branch nothing reaches.
    const ranked = rank(SK, structuralSeeds(SK, { subFile: true, prior }), { prior })
    const scores = new Set(ranked.filter((c) => c.site.qualifiedPath.startsWith(U)).map((c) => c.ppr))

    expect(scores.size).toBe(1)
  })

  it("`path asc` is the DECIDING leg for two units that tie on `(exported, bytes)`", () => {
    // teeth (breaks-on "the third leg is reversed"): ALPHA and OMEGA are indistinguishable to legs 1 and 2,
    // so this pair is the ONLY place in the suite where the direction of leg 3 is observable. Asserted on
    // BOTH order-producing paths, because the emission comparator (`byUnitPrior`, which orders
    // `structuralSeeds`) and the rank comparator (`compareSiteOrder`) are two different functions carrying
    // the same three legs, and a mutant of either alone must have somewhere to fail.
    const emitted = structuralSeeds(SK, { subFile: true, prior }).map((x) => x.qualifiedPath)
    const ranked = rank(SK, structuralSeeds(SK, { subFile: true, prior }), { prior }).map((c) => c.site.qualifiedPath)

    expect(PRIORS[ALPHA]).toEqual(PRIORS[OMEGA]) // NOT VACUOUS: the pair really does tie on legs 1 and 2
    expect(ALPHA < OMEGA).toBe(true) //             …and `path asc` puts ALPHA first
    expect(emitted.indexOf(ALPHA)).toBeLessThan(emitted.indexOf(OMEGA))
    expect(ranked.indexOf(ALPHA)).toBeLessThan(ranked.indexOf(OMEGA))
  })

  it("is a STRICT TOTAL ORDER: antisymmetric, irreflexive off the diagonal, and transitive", () => {
    const keys = siteOrderKeys(SK, structuralSeeds(SK, { subFile: true, prior }), prior)
    for (const a of keys) {
      expect(compareSiteOrder(a, a)).toBe(0) // reflexive on the diagonal
      for (const b of keys) {
        // `+ 0` rather than `=== -sign`: `Math.sign(0)` is `+0` and its negation is `-0`, which
        // `Object.is` separates — an artefact of IEEE zero, not of the comparator.
        expect(Math.sign(compareSiteOrder(a, b)) + Math.sign(compareSiteOrder(b, a))).toBe(0)
        if (a !== b) expect(compareSiteOrder(a, b)).not.toBe(0) // total: no two distinct sites are equal
        for (const c of keys) {
          if (compareSiteOrder(a, b) < 0 && compareSiteOrder(b, c) < 0) {
            expect(compareSiteOrder(a, c)).toBeLessThan(0) // transitive
          }
        }
      }
    }
  })

  it("the HASH is reachable only as the last term — the priors decide first", () => {
    // Two keys differing ONLY in hash compare by hash (the total-order guarantee); as soon as any prior
    // differs, the hash is irrelevant even when it points the other way.
    const base = { group: "g", sub: true, exported: false, bytes: 10, path: "p", hash: "aaa" } as const
    expect(compareSiteOrder(base, { ...base, hash: "bbb" })).toBeLessThan(0) // last resort, and it works
    // `zzz` sorts AFTER `aaa`, so a hash-first comparator would put this one second; `exported` wins.
    expect(compareSiteOrder({ ...base, exported: true, hash: "zzz" }, base)).toBeLessThan(0)
    expect(compareSiteOrder({ ...base, bytes: 11, hash: "zzz" }, base)).toBeLessThan(0)
    expect(compareSiteOrder({ ...base, path: "a", hash: "zzz" }, base)).toBeLessThan(0)
  })

  it("`structuralSeeds` EMITS the units of a file already in prior order", () => {
    // `structuralSeeds` is a public surface that oracles and tests read directly, so its ORDER is a claim
    // in its own right and not merely an input to `rank` (which re-sorts totally). Pinned here because a
    // mutation dropping `byUnitPrior`'s size leg survived every other golden in this file: the emission
    // order was doing real work that nothing was watching.
    const emitted = structuralSeeds(SK, { subFile: true, prior })
      .map((s) => s.qualifiedPath)
      .filter((p) => p.startsWith(U))

    expect(emitted).toEqual([U, GREET, ALPHA, OMEGA, ZETA, HELPER, CLOSURE])
  })

  it("a `::` address the TREE DOES NOT KNOW is ordered as an opaque site, not as a unit", () => {
    // A unit is a site the folded tree holds, never a string containing `::`. The transcribed goldens
    // address their sites as `pkg/<id>.ts::<id>` over skeletons with no sub-file node at all; treating
    // those as units would re-group them under a file hash that indexes nothing. teeth (breaks-on
    // "siteOrderKeys tests the string instead of the tree").
    const ghost = {
      kind: "symbol",
      qualifiedPath: `${U}::function_declaration:9:ghost`,
      subtreeHash: "st-ghost",
    } as never
    const [key] = siteOrderKeys(SK, [ghost], prior)

    expect(key!.sub).toBe(false) //           not a unit: the tree has no such node
    expect(key!.group).toBe("st-ghost") //    its own hash, exactly as a file site is keyed
    expect(key!.bytes).toBe(0)
  })

  it("WITH NO PRIOR SUPPLIED the order degrades to `path asc` — stated, never a silent zero", () => {
    // The honest failure mode of an unwired seam. Still a strict total order, still not a hash, but NOT
    // the ranked order the comparator documents — which is why `mine-frontier.ts` resolves the seam from
    // the same skeleton source that folded the tree.
    const ranked = rank(SK, structuralSeeds(SK, { subFile: true }), {})
    const util = pathsOf(ranked.map((c) => c.site)).filter((p) => p.startsWith(U))

    expect(util).toEqual([U, ALPHA, GREET, CLOSURE, OMEGA, HELPER, ZETA]) // address order, not (exported, size)
  })
})

// ── the file-site order is UNTOUCHED — a refinement, not a replacement ─────────────────────────────────

describe("#182 — refining the tie-break moves no FILE site", () => {
  it("two file sites still compare exactly as `cmp(subtreeHash)` did", () => {
    const keys = siteOrderKeys(SK, structuralSeeds(SK), prior)
    expect(keys.map((k) => k.group)).toEqual(keys.map((k) => k.hash)) // group === own hash for a file
    expect(keys.every((k) => !k.sub)).toBe(true)
  })

  it("GEN-11 order-independence survives: `rank(g, f)` ≡ `rank(g, reverse(f))` WITH sub-file sites", () => {
    // The property SCN-GEN-11c-1 pins, re-asserted on the wider frontier. An "input position" tie-break —
    // the obvious way to let the producer choose the order — would silently destroy exactly this.
    const seeds = structuralSeeds(SK, { subFile: true, prior })
    const a = rank(SK, seeds, { prior })
    const b = rank(SK, [...seeds].reverse(), { prior })

    expect(JSON.stringify(a)).toBe(JSON.stringify(b))
  })
})
