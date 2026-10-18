// @atlas/adapter-io — test/anchor-identity.test.ts   (ANCHOR-IDENTITY · findings A/B/C/D)
//
// The anchor is BOTH the product's identity leg (`nodeKey = hash(primaryAnchorId ‖ slot[‖ check])`) and
// its freshness leg (`driftDetect` resolves an anchor's `qualifiedPath` in the built index). Every law
// below is exercised through the REAL production pipeline — `foldAstUnits(walkFileTree(...)) → build(...)`
// (rev-index.ts:142, wire.ts:118) — never through a hand-held fixture that holds the key constant. That
// distinction is load-bearing: the visible golden SCN-GROUND-5b-1 asserts an import-above stays FRESH and
// is VACUOUS, because its fixture pins `qualifiedPath` by hand and so can never reach the mint it quantifies
// over. These tests reach it.
//
// This suite lives in adapter-io because it is the only layer allowed to see the whole chain
// (adapter-io → {index, grounding, knowledge}); the mints it pins are owned by @atlas/index `build.ts`
// (node keys) and `ast.ts` (unit keys).

import { describe, it, expect, beforeAll } from "vitest"
import { build, type FileTree, type ScipOutput } from "@atlas/index"
import { driftDetect } from "@atlas/grounding"
import { nodeKey, primaryAnchorId } from "@atlas/knowledge"
import type { SubtreeHash } from "@atlas/contracts"
import { foldAstUnits, initAst } from "../src/ast.js"

const NO_SCIP: ScipOutput = { documents: [] }
/** The sanctioned sub-file refinement separator (`file::item::block`). */
const UNIT_SEP = "::"

/** The REAL pipeline shape: fold AST units onto the walked tree, then build the axes. */
const indexOf = (files: ReadonlyArray<readonly [string, string]>, scip: ScipOutput = NO_SCIP) =>
  build(
    foldAstUnits({
      path: ".",
      children: [
        {
          path: "src",
          children: files.map(([p, c]) => ({ path: p, children: [], content: c })),
        },
      ],
    }),
    scip,
  )

const keys = (n: { key: string; children: readonly { key: string }[] }, out: string[] = []): string[] => {
  out.push(n.key)
  for (const c of n.children) keys(c as never, out)
  return out
}
const nodeAt = (
  n: { key: string; subtreeHash: SubtreeHash; children: readonly unknown[] },
  key: string,
): { key: string; subtreeHash: SubtreeHash } | undefined => {
  if (n.key === key) return n
  for (const c of n.children) {
    const hit = nodeAt(c as never, key)
    if (hit !== undefined) return hit
  }
  return undefined
}
/** The one sub-file unit key in a single-symbol fixture. */
const unitKeyOf = (axes: ReturnType<typeof build>): string => {
  const k = keys(axes.spatial).filter((x) => x.includes("::"))
  expect(k).toHaveLength(1)
  return k[0] as string
}
const groundingAt = (qualifiedPath: string, subtreeHash: SubtreeHash) => ({
  entries: [{ anchor: { kind: "symbol" as const, qualifiedPath, subtreeHash }, path: qualifiedPath }],
})
/** A candidate whose identity is COMPUTED from its citations (KNOW-15) — the real front-door shape. */
const candidate = (qualifiedPaths: readonly string[]) => ({
  slot: "invariant",
  grounding: {
    entries: qualifiedPaths.map((qp) => ({
      anchor: { kind: "symbol" as const, qualifiedPath: qp, subtreeHash: "sh" as unknown as SubtreeHash },
      path: qp,
    })),
  },
})

/** The real minted `nodeKey`, or the string `REFUSED` when the write door refuses to address the
 *  candidate at all (`DegenerateAnchorError` — a grounding that names no single containing unit). */
const mintedKeyOrRefusal = (c: ReturnType<typeof candidate>): string => {
  try {
    return String(nodeKey(c as never))
  } catch {
    return "REFUSED"
  }
}

beforeAll(async () => {
  await initAst()
})

// ── A — the drift oracle must not resolve an anchor onto a hash that commits to no content ─────────────
describe("ANCHOR-A — the freshness oracle cannot be defeated by CHOOSING the anchor", () => {
  const SCIP: ScipOutput = {
    documents: [
      { relativePath: "src/a.ts", occurrences: [{ symbol: "S#f", role: "definition" }] },
      { relativePath: "src/b.ts", occurrences: [{ symbol: "S#f", role: "reference" }] },
    ],
  } as unknown as ScipOutput

  it("A: a fact anchored at a DEPENDENCY-axis key does not read FRESH after the file is fully rewritten", () => {
    const before = indexOf([["src/a.ts", "export const x = 42;\n"]], SCIP)
    const depLeaf = before.dependency.children[0]
    expect(depLeaf).toBeDefined()
    const g = groundingAt(depLeaf!.key, depLeaf!.subtreeHash)
    const after = indexOf([["src/a.ts", 'export const x = "pwned"; export function evil() { return 1; }\n']], SCIP)

    // PREMISE — the file's real (content-committing) spatial hash DID move; only the anchor is at issue.
    const spatialBefore = nodeAt(before.spatial, "src/a.ts")?.subtreeHash
    const spatialAfter = nodeAt(after.spatial, "src/a.ts")?.subtreeHash
    expect(String(spatialBefore)).not.toBe(String(spatialAfter))

    // teeth (breaks-on "the oracle resolves onto a node whose subtreeHash is its own identity — an author
    // picks that anchor and the fact CAN NEVER DRIFT, defeating the freshness leg of the truth door"):
    expect(driftDetect(g, after)).toBe("DRIFTED")
  })

  it("A: no node reachable by the freshness oracle certifies itself (subtreeHash ≠ its own key)", () => {
    const axes = indexOf([["src/a.ts", "export const x = 42;\n"]], SCIP)
    const selfCertifying = (
      n: { key: string; subtreeHash: SubtreeHash; children: readonly unknown[] },
      out: string[] = [],
    ): string[] => {
      if (String(n.subtreeHash) === n.key) out.push(n.key)
      for (const c of n.children) selfCertifying(c as never, out)
      return out
    }
    // teeth (breaks-on "a self-certifying node is reachable by driftDetect — its hash is a constant of the
    // PATH, so replacing the whole file leaves it byte-identical"):
    for (const root of [axes.spatial, axes.territory]) expect(selfCertifying(root as never)).toEqual([])
    // the dependency axis is a GRAPH view whose leaf hash IS the node identity; the oracle must refuse it.
    const depKey = axes.dependency.children[0]?.key as string
    const depHash = axes.dependency.children[0]?.subtreeHash as SubtreeHash
    expect(driftDetect(groundingAt(depKey, depHash), axes)).toBe("DRIFTED")
  })
})

// ── B — `::` is a STRUCTURAL delimiter; nothing may fabricate a segment boundary ───────────────────────
describe("ANCHOR-B — a path/name may not forge a `::` segment boundary", () => {
  it("B: two files sharing a fake `::` ancestor do NOT mint the nodeKey of that ancestor", () => {
    const axes = indexOf([
      ["src/x::alpha.ts", "export function a() { return 1; }\n"],
      ["src/x::beta.ts", "export function b() { return 2; }\n"],
    ])
    const symbolKeys = keys(axes.spatial).filter((k) => k.includes(UNIT_SEP))
    expect(symbolKeys).toHaveLength(2) // one symbol per file, reached through the real mint

    const both = candidate(symbolKeys)
    // `src/x` is a unit that DOES NOT EXIST — it is the `::`-common prefix the two forged file names create.
    const fake = candidate(["src/x"])
    // The two symbols live in two DIFFERENT files, so they share NO containing unit and the write door's
    // degenerate-anchor refusal is the correct answer. What must never happen is the two agreeing.
    // teeth (breaks-on "the file path fabricates a `::` segment, so `primaryAnchorId` names a non-existent
    // unit and `nodeKey` collides with a fact anchored there — identity capture with no hash weakness"):
    expect(mintedKeyOrRefusal(both)).not.toBe(mintedKeyOrRefusal(fake))
    expect(mintedKeyOrRefusal(both)).toBe("REFUSED")
    expect(mintedKeyOrRefusal(fake)).toMatch(/^[0-9a-f]{64}$/) // the honest anchor still mints
  })

  it("B: a `::` inside a symbol NAME does not fabricate ancestry (segment arity = real depth)", () => {
    const axes = indexOf([["src/m.ts", 'const { "a::b": v } = o;\n']])
    const unit = unitKeyOf(axes)
    // file::item — EXACTLY two segments. A `::` inside the declarator name minted three.
    // teeth (breaks-on "a name containing `::` mints a fake ancestor segment"):
    expect(unit.split("::")).toHaveLength(2)
  })

  it("B: no minted key has a `::`-adjacent `:` (the join is injective, so no two trees collide)", () => {
    const axes = indexOf([
      ["src/m.ts", "export function f() { const g = () => 1; return g; }\n"],
      ["src/n.ts", 'const { "z:": w } = o;\n'],
    ])
    for (const k of keys(axes.spatial)) {
      for (const seg of k.split("::")) {
        // teeth (breaks-on "an empty/colon-tailed component makes `a::b` and `a:` + `:b` the same string"):
        expect(seg.startsWith(":")).toBe(false)
        expect(seg.endsWith(":")).toBe(false)
      }
    }
  })
})

// ── C — the no-false-drift promise, MEASURED (not asserted from a hand-held fixture) ───────────────────
//
// DELIBERATE DECISION (finding C): the promise is CORRECTED, not delivered. `subtree.ts:6-7`, the
// `SubtreeApi.subtreeHash` docstring and REQ-GROUND-5b all say a reformat leaves the oracle byte-invariant.
// It does not: `index/src/build.ts` folds `content` — the RAW source slice `ast.ts` sliced — through the
// kernel `id`, whose only normalization is NFC. Reproduced below: one extra space inside a function body
// moves the hash and the fact reads DRIFTED.
//
// Delivering the promise would mean normalizing before hashing, and every cheap way to do that over raw
// text also erases whitespace that is SEMANTIC in TS/TSX — inside string and template literals, regex
// literals, JSX text, and at ASI boundaries (`return\n42` is not `return 42`). A normalizer that swallowed
// those would answer FRESH for a unit that genuinely changed. That trade is not symmetric: a false ALARM
// costs an author one re-ground, a false NEGATIVE lets the truth gate serve HOLDS on a stale fact, which
// is the one failure this product exists to prevent. So the oracle stays byte-exact and the DOCS are wrong.
// The honest statement already lives in `grounding/src/drift.ts` ("a REFORMAT does NOT stay FRESH");
// `grounding/src/subtree.ts`, `grounding/src/types.ts` and `docs/requirements/goldens-grd.md` still
// overclaim and are OUTSIDE this seat's ownership — flagged for the lead, NOT edited here.
describe("ANCHOR-C — a reformat DRIFTS (the no-false-drift promise is corrected, not delivered)", () => {
  it("C: `return 42;` → `return  42;` keeps the KEY but moves the hash ⇒ DRIFTED", () => {
    const before = indexOf([["src/billing.ts", "export function computeArr() { return 42; }\n"]])
    const k = unitKeyOf(before)
    const g = groundingAt(k, nodeAt(before.spatial, k)!.subtreeHash)
    const after = indexOf([["src/billing.ts", "export function computeArr() { return  42; }\n"]])
    // the ANCHOR survives the reformat — the false drift is the HASH's, not the key's (that is finding D).
    expect(unitKeyOf(after)).toBe(k)
    // teeth (breaks-on "someone lands a whitespace normalizer to satisfy REQ-GROUND-5b" — which would also
    // erase a change inside a string/template/regex/JSX literal and answer FRESH for a real edit):
    expect(driftDetect(g, after)).toBe("DRIFTED")
  })

  it("C: the whitespace a normalizer would have to erase is not always noise", () => {
    const before = indexOf([["src/msg.ts", "export function greet() { return `hello  world`; }\n"]])
    const k = unitKeyOf(before)
    const g = groundingAt(k, nodeAt(before.spatial, k)!.subtreeHash)
    // ONE space removed — inside a template literal, so the VALUE the function returns changed.
    const after = indexOf([["src/msg.ts", "export function greet() { return `hello world`; }\n"]])
    // teeth (breaks-on "the oracle became whitespace-insensitive — a changed return value reads FRESH"):
    expect(driftDetect(g, after)).toBe("DRIFTED")
  })
})

// ── D — the anchor key must survive an edit ABOVE the symbol (SCN-GROUND-5b, non-vacuously) ────────────
describe("ANCHOR-D — an import added above a symbol must not unresolve its anchor", () => {
  it("D: SCN-GROUND-5b import-above, through the REAL mint — the key is stable and the verdict FRESH", () => {
    const before = indexOf([["src/billing.ts", "export function computeArr() { return 42; }\n"]])
    const k = unitKeyOf(before)
    const g = groundingAt(k, nodeAt(before.spatial, k)!.subtreeHash)
    const after = indexOf([
      ["src/billing.ts", "import { z } from 'zod';\nexport function computeArr() { return 42; }\n"],
    ])
    // teeth (breaks-on "the unit key carries the symbol's BYTE START INDEX — anything inserted above
    // re-keys it, so every anchor in the file becomes unresolvable and reads DRIFTED"):
    expect(unitKeyOf(after)).toBe(k)
    expect(driftDetect(g, after)).toBe("FRESH")
  })

  it("D: an unrelated helper renamed elsewhere in the repo leaves the cited unit FRESH", () => {
    const before = indexOf([
      ["src/billing.ts", "export function computeArr() { return 42; }\n"],
      ["src/other.ts", "export function helper() { return 0; }\n"],
    ])
    const k = keys(before.spatial).find((x) => x.includes("billing.ts::")) as string
    const g = groundingAt(k, nodeAt(before.spatial, k)!.subtreeHash)
    const after = indexOf([
      ["src/billing.ts", "export function computeArr() { return 42; }\n"],
      ["src/other.ts", "export function renamedHelper() { return 0; }\n"],
    ])
    expect(driftDetect(g, after)).toBe("FRESH")
  })

  it("D: dropping the byte offset must NOT collide two same-named siblings", () => {
    const axes = indexOf([
      ["src/dup.ts", "export function f() { const a = () => 1; const b = () => 2; return [a, b]; }\n"],
    ])
    const all = keys(axes.spatial)
    // teeth (breaks-on "the ordinal that replaced the byte offset is constant — two anonymous closures in
    // one item collapse onto ONE key and the deeper one silently overwrites the shallower"):
    expect(new Set(all).size).toBe(all.length)
    expect(all.filter((k) => k.includes("arrow_function"))).toHaveLength(2)
  })
})
