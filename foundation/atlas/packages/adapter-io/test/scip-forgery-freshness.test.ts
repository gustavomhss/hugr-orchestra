// @atlas/adapter-io — test/scip-forgery-freshness.test.ts
//
// `.atlas/index.scip` is the ONE governed input that is deliberately EXCLUDED from the provenance tripwire
// (`store-provenance.ts` `isDurableStorePath`, commit 9d6290b): a git-TRACKED durable store is refused
// because it carries rows no door ever saw, but the `.scip` is a BUILD INPUT and is legitimately tracked —
// this very repository ships one. So a repository can SHIP a forged one and every reader consumes it.
//
// It feeds `build(tree, scipOutput)`, and `build`'s output — `Axes` — is exactly what the truth gate
// re-derives FRESHNESS against (`compose.ts` `buildGate`). The hypothesis under test is therefore the T0
// shape reached through a different input: does a forged `.scip` let a stale or ungrounded fact read FRESH?
//
// THE ANSWER IS NO, AND THE MECHANISM IS TWO INDEPENDENT WALLS, both pinned below by their MUTANTS:
//   WALL 1 (build.ts) — `scipOutput` reaches ONLY `deriveEdges` ⇒ `axes.edges` + `axes.dependency`. The
//     `spatial` and `territory` hierarchies are folded from the `FileTree` ALONE. Pinned: the two axes are
//     BYTE-IDENTICAL under an adversarial dump and under no dump at all.
//   WALL 2 (drift.ts) — `resolveCurrent` scans `[spatial, territory]` only, and `findByKey` additionally
//     REFUSES any node whose `subtreeHash` IS its own `key`. Every dependency leaf is exactly that shape.
//     Pinned: the LOCAL MUTANT that scans the dependency axis certifies the forged anchor FRESH, and the
//     shipped oracle calls the same anchor DRIFTED.
//
// And a third fact that bounds the attack surface: the SCIP wire schema carries NO digest/hash field at
// all, and `readScip` projects only `(relativePath, symbol, role)` — ranges, document text, symbol tables
// and index metadata are DROPPED. The adversary's expressive power over the freshness oracle is two
// attacker-chosen strings and one bit, none of which the oracle reads.

import { describe, it, expect, afterEach } from "vitest"
import { readFileSync } from "node:fs"
import fc from "fast-check"
import { deserializeSCIP } from "@c4312/scip"
import { build, nodeHashOfPath } from "@atlas/index"
import type { Axes, IndexNode, ScipOutput } from "@atlas/index"
import { driftDetect, isGrounded } from "@atlas/grounding"
import type { Grounding } from "@atlas/grounding"
import type { SubtreeHash } from "@atlas/contracts"
import { readScip, readScipOrEmpty } from "../src/scip.js"
import { forgeScip, forgedScipBytes } from "./harness/forge-scip.js"
import type { ForgedDocument, ForgedScip } from "./harness/forge-scip.js"
import { T_ref } from "./harness/fix-repo.js"

/** The honest baseline: no SCIP dump at all (a fresh repo). */
const NO_SCIP: ScipOutput = { documents: [] }

/** The victim unit every case grounds against — a REAL file node on the spatial rail. */
const VICTIM = "src/util.ts"

let forged: ForgedScip | undefined
afterEach(() => {
  forged?.cleanup()
  forged = undefined
})

// ── plumbing ────────────────────────────────────────────────────────────────────────────────────────────
const asSubtree = (h: string): SubtreeHash => h as unknown as SubtreeHash

/** A single-entry grounding at `qualifiedPath` citing `subtreeHash` — the shape the emit gate re-derives. */
function groundingAt(qualifiedPath: string, subtreeHash: string): Grounding {
  return {
    entries: [{ anchor: { kind: "file", qualifiedPath, subtreeHash: asSubtree(subtreeHash) }, path: qualifiedPath }],
  } as unknown as Grounding
}

/** DFS for the node whose `key` is `key`, over ONE rooted axis. */
function nodeByKey(node: IndexNode, key: string): IndexNode | undefined {
  if (node.key === key) return node
  for (const c of node.children) {
    const hit = nodeByKey(c, key)
    if (hit !== undefined) return hit
  }
  return undefined
}

/** The REAL current subtreeHash of `key` on the spatial rail (throws if the fixture cannot reach it — a
 *  fixture that cannot reach the unit it claims to ground is a vacuous fixture, so it fails loudly). */
function spatialHash(axes: Axes, key: string): string {
  const hit = nodeByKey(axes.spatial, key)
  if (hit === undefined) throw new Error(`fixture cannot reach '${key}' on the spatial axis — widen it`)
  return String(hit.subtreeHash)
}

/**
 * THE MUTANT ORACLE — `driftDetect` as it would be with WALL 2 removed: `resolveCurrent` scanning the
 * dependency axis too (which is what it did before f2a8659), and `findByKey` without the "a node whose
 * hash IS its own key is treated as ABSENT" refusal. Written HERE, in the test, because the product file
 * that would carry the mutation is owned by another seat; it is a faithful 6-line transcription of
 * `grounding/src/drift.ts` with exactly those two guards deleted, and it exists to make the shipped
 * oracle's REFUSALS observable as refusals rather than as coincidences.
 */
function driftDetectMutant(grounding: Grounding, src: Axes): "FRESH" | "DRIFTED" {
  const find = (node: IndexNode, key: string): SubtreeHash | undefined => {
    if (node.key === key) return node.subtreeHash //          ← guard deleted: no self-key refusal
    for (const child of node.children) {
      const hit = find(child, key)
      if (hit !== undefined) return hit
    }
    return undefined
  }
  if (!isGrounded(grounding)) return "DRIFTED"
  for (const e of grounding.entries) {
    let current: SubtreeHash | undefined
    for (const root of [src.spatial, src.territory, src.dependency]) {
      // ← guard deleted: dependency scanned
      current = find(root, e.anchor.qualifiedPath)
      if (current !== undefined) break
    }
    if (current === undefined || current !== e.anchor.subtreeHash) return "DRIFTED"
  }
  return "FRESH"
}

// ── the hostile dump ────────────────────────────────────────────────────────────────────────────────────
/**
 * The adversary's dump, aimed at the victim with everything the schema allows. It names the victim's OWN
 * path, its qualifiedPath-as-a-symbol, and — the interesting one — a `relativePath` chosen so the
 * dependency axis mints a node keyed by `id({file: <that path>})`, which is the leg an author could try to
 * anchor a never-drifting fact on. Ranges are absurd, the text is a lie, the metadata names another repo.
 */
function hostileDocuments(staleHash: string): readonly ForgedDocument[] {
  return [
    {
      relativePath: VICTIM, //                              the victim's own path, claimed as a definition site
      text: 'export function greet(){ return "TOTALLY DIFFERENT SOURCE" }\n',
      occurrences: [
        { symbol: staleHash, definition: true, range: [0, 0, 999999, 999999] }, // the STALE hash as a symbol
        { symbol: `${VICTIM}::greet`, definition: true, range: [1, 1, 1, 1] },
        { symbol: "atlas.index.node.v2", definition: true }, //     the fold domain tag, as a symbol
      ],
    },
    {
      relativePath: staleHash, //                            a document whose PATH is the stale digest
      text: "forged",
      occurrences: [{ symbol: staleHash, definition: false, range: [0, 0, 0, 0] }],
    },
    {
      relativePath: "../../../etc/passwd", //                a traversal path, to see whether it becomes a key
      text: "forged",
      occurrences: [{ symbol: `${VICTIM}`, definition: false }],
    },
  ]
}

// ── 1. the projection surface: what an adversary can actually express ──────────────────────────────────
describe("forged .scip — the PROJECTION drops every field the adversary loaded (ADAPT-SCIP-1)", () => {
  it("ranges, document text, symbol tables and index metadata do NOT survive readScip", () => {
    forged = forgeScip(hostileDocuments("deadbeef"))

    // NON-VACUITY: the bytes on disk really do carry the fields — decode the SAME file with the SAME
    // decoder the product uses and assert they are present BEFORE asserting the projection drops them.
    const raw = deserializeSCIP(readFileSync(forged.scipPath))
    expect(raw.metadata?.projectRoot).toBe("file:///not/the/repo/being/indexed")
    expect(raw.documents[0]?.text).toContain("TOTALLY DIFFERENT SOURCE")
    expect([...(raw.documents[0]?.occurrences[0]?.range ?? [])]).toStrictEqual([0, 0, 999999, 999999])
    expect(raw.documents[0]?.symbols[0]?.displayName).toContain("FORGED")

    // …and the product's projection carries NONE of it: exactly `{relativePath, occurrences:[{symbol,role}]}`.
    const projected = readScip(forged.scipPath)
    expect(Object.keys(projected)).toStrictEqual(["documents"])
    for (const doc of projected.documents) {
      expect(Object.keys(doc).sort()).toStrictEqual(["occurrences", "relativePath"])
      for (const occ of doc.occurrences) expect(Object.keys(occ).sort()).toStrictEqual(["role", "symbol"])
    }
    // the whole expressive surface, stated: two attacker strings + one bit per occurrence.
    expect(projected.documents[0]?.occurrences[0]).toStrictEqual({ symbol: "deadbeef", role: "definition" })
  })

  it("the SCIP wire schema carries NO hash/digest field for the adversary to forge", () => {
    // The freshness oracle is a `subtreeHash` comparison. If the dump carried a digest the build trusted,
    // the attack would be one field wide. It does not: the serialized index has no such field to set, and
    // the projection has no slot to receive one — every hash downstream is MINTED by the product from the
    // FileTree (`foldNodeHash`) or from the path (`id({file: p})`), never read out of the dump.
    forged = forgeScip(hostileDocuments("deadbeef"))
    const raw = deserializeSCIP(readFileSync(forged.scipPath))
    const fields = new Set(Object.keys(raw.documents[0] ?? {}).map((k) => k.toLowerCase()))
    for (const forbidden of ["hash", "digest", "subtreehash", "checksum", "sha"]) {
      expect(fields.has(forbidden)).toBe(false)
    }
  })
})

// ── 2. WALL 1 — the SCIP never touches the axes the oracle reads ────────────────────────────────────────
describe("forged .scip — WALL 1: spatial/territory are BYTE-IDENTICAL under an adversarial dump", () => {
  it("the hostile dump moves `edges`+`dependency` and moves NOTHING the oracle resolves over", () => {
    const honest = build(T_ref, NO_SCIP)
    const stale = spatialHash(honest, VICTIM)
    forged = forgeScip(hostileDocuments(stale))
    const attacked = build(T_ref, readScipOrEmpty(forged.scipPath))

    // NON-VACUITY: the forgery is REACHING the build — it really did rewrite the SCIP-fed half.
    expect(attacked.edges.length).toBeGreaterThan(0)
    expect(honest.edges.length).toBe(0)
    expect(attacked.dependency.children.length).toBeGreaterThan(0)
    expect(String(attacked.dependency.subtreeHash)).not.toBe(String(honest.dependency.subtreeHash))

    // …and the two axes `resolveCurrent` scans are unchanged, whole-subtree, not just at the root.
    expect(attacked.spatial).toStrictEqual(honest.spatial)
    expect(attacked.territory).toStrictEqual(honest.territory)
  })

  it("PROPERTY: over ARBITRARY forged dumps, spatial/territory never move (fast-check)", () => {
    const honest = build(T_ref, NO_SCIP)
    let sawEdges = 0
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            relativePath: fc.string({ minLength: 1, maxLength: 40 }),
            occurrences: fc.array(
              fc.record({ symbol: fc.string({ minLength: 1, maxLength: 40 }), definition: fc.boolean() }),
              { minLength: 1, maxLength: 4 },
            ),
          }),
          { minLength: 1, maxLength: 6 },
        ),
        (docs) => {
          const axes = build(T_ref, readScipFromBytes(forgedScipBytes(docs)))
          if (axes.edges.length > 0) sawEdges++
          expect(axes.spatial).toStrictEqual(honest.spatial)
          expect(axes.territory).toStrictEqual(honest.territory)
        },
      ),
      { numRuns: 120 },
    )
    // NON-VACUITY: a generator that never produced a single edge would prove nothing about the SCIP leg.
    expect(sawEdges).toBeGreaterThan(0)
  })
})

/** Decode forged bytes through the product's own reader, via a temp file (the reader is path-based). */
function readScipFromBytes(bytes: Uint8Array): ScipOutput {
  const raw = deserializeSCIP(bytes)
  return {
    documents: raw.documents.map((d) => ({
      relativePath: d.relativePath,
      occurrences: d.occurrences.map((o) => ({
        symbol: o.symbol,
        role: (o.symbolRoles & 1) !== 0 ? ("definition" as const) : ("reference" as const),
      })),
    })),
  }
}

// ── 3. WALL 2 — the oracle refuses the axis the SCIP owns ───────────────────────────────────────────────
describe("forged .scip — WALL 2: an anchor the forgery MINTS is unresolvable to the drift oracle", () => {
  it("the forged dependency node is real, is reachable, and STILL reads DRIFTED (with its mutant teeth)", () => {
    const honest = build(T_ref, NO_SCIP)
    const stale = spatialHash(honest, VICTIM)
    // The adversary picks the path, so the adversary picks the dependency-axis KEY (`id({file: path})`)
    // AND its `subtreeHash`, which `dependencyAxis` sets to that same key. Both halves of a "grounding"
    // an author could cite, produced entirely from a tracked build input.
    const chosenPath = "src/attacker-chosen.ts"
    const forgedKey = String(nodeHashOfPath(chosenPath))
    forged = forgeScip([
      { relativePath: chosenPath, occurrences: [{ symbol: "sym A", definition: true }] },
      { relativePath: VICTIM, occurrences: [{ symbol: "sym A", definition: false }] },
    ])
    const attacked = build(T_ref, readScipOrEmpty(forged.scipPath))

    // NON-VACUITY: the node the attack aims at EXISTS in the built axes, with exactly the shape claimed.
    const depNode = nodeByKey(attacked.dependency, forgedKey)
    expect(depNode).toBeDefined()
    expect(String(depNode?.subtreeHash)).toBe(forgedKey)

    const forgedGrounding = groundingAt(forgedKey, forgedKey)
    // teeth: with the two guards removed, this anchor certifies FRESH — the attack lands on the mutant.
    expect(driftDetectMutant(forgedGrounding, attacked)).toBe("FRESH")
    // the shipped oracle refuses it: the dependency axis is not scanned, and the self-key node is ABSENT.
    expect(driftDetect(forgedGrounding, attacked)).toBe("DRIFTED")
  })

  it("the forged dependency ROOT (whose hash is NOT its own key) is unresolvable too", () => {
    forged = forgeScip([
      { relativePath: "a.ts", occurrences: [{ symbol: "s", definition: true }] },
      { relativePath: "b.ts", occurrences: [{ symbol: "s", definition: false }] },
    ])
    const attacked = build(T_ref, readScipOrEmpty(forged.scipPath))
    const rootHash = String(attacked.dependency.subtreeHash)
    // NON-VACUITY: the root's hash is NOT its own key, so the self-key refusal does NOT cover it — only
    // the axis restriction does. This is the case that would survive if WALL 2's second guard were the
    // only one, so it has to be asserted separately.
    expect(rootHash).not.toBe(attacked.dependency.key)
    expect(driftDetectMutant(groundingAt("dependency", rootHash), attacked)).toBe("FRESH")
    expect(driftDetect(groundingAt("dependency", rootHash), attacked)).toBe("DRIFTED")
  })
})

// ── 4. the end-to-end verdict, both directions ──────────────────────────────────────────────────────────
describe("forged .scip — the freshness VERDICT is invariant under forgery, both directions", () => {
  it("a genuinely STALE fact stays DRIFTED; a genuinely FRESH fact stays FRESH", () => {
    const before = build(T_ref, NO_SCIP)
    const staleHash = spatialHash(before, VICTIM)

    // the code genuinely changes — the same edit a developer makes.
    const edited = {
      ...T_ref,
      children: T_ref.children.map((c) =>
        c.path !== "src"
          ? c
          : {
              ...c,
              children: c.children.map((f) =>
                f.path !== VICTIM ? f : { ...f, content: 'export function greet(){ return "rewritten" }\n' },
              ),
            },
      ),
    }
    const after = build(edited, NO_SCIP)
    const freshHash = spatialHash(after, VICTIM)
    // NON-VACUITY: the edit really moved the oracle (a fixture where it did not would prove nothing).
    expect(freshHash).not.toBe(staleHash)

    const staleFact = groundingAt(VICTIM, staleHash)
    const freshFact = groundingAt(VICTIM, freshHash)
    expect(driftDetect(staleFact, after)).toBe("DRIFTED") //  the honest baseline
    expect(driftDetect(freshFact, after)).toBe("FRESH")

    // now the adversary ships a dump built to rescue the stale fact AND to bury the fresh one.
    forged = forgeScip([
      ...hostileDocuments(staleHash),
      { relativePath: VICTIM, occurrences: [{ symbol: freshHash, definition: true }] },
    ])
    const attacked = build(edited, readScipOrEmpty(forged.scipPath))
    expect(attacked.edges.length).toBeGreaterThan(0) //       NON-VACUITY: the dump reached the build

    // FORWARD (laundering): the stale fact does NOT come back to life.
    expect(driftDetect(staleFact, attacked)).toBe("DRIFTED")
    // REVERSE (denial-of-knowledge): the fresh fact is NOT knocked over.
    expect(driftDetect(freshFact, attacked)).toBe("FRESH")
  })

  it("PROPERTY: the verdict for a fixed grounding is the SAME with and without ANY forged dump", () => {
    const axesNoScip = build(T_ref, NO_SCIP)
    const real = spatialHash(axesNoScip, VICTIM)
    const groundings: readonly Grounding[] = [
      groundingAt(VICTIM, real), //                    genuinely fresh
      groundingAt(VICTIM, "not-the-hash"), //          genuinely stale
      groundingAt("src", spatialHash(axesNoScip, "src")), // a DIRECTORY node (branch, not leaf)
      groundingAt("nope/gone.ts", real), //            unresolvable path
    ]
    let sawEdges = 0
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            relativePath: fc.oneof(
              fc.constant(VICTIM),
              fc.constant("src"),
              fc.constant(real),
              fc.string({ minLength: 1, maxLength: 30 }),
            ),
            occurrences: fc.array(
              fc.record({
                symbol: fc.oneof(fc.constant(real), fc.constant(VICTIM), fc.string({ minLength: 1, maxLength: 30 })),
                definition: fc.boolean(),
              }),
              { minLength: 1, maxLength: 3 },
            ),
          }),
          { minLength: 1, maxLength: 5 },
        ),
        (docs) => {
          const attacked = build(T_ref, readScipFromBytes(forgedScipBytes(docs)))
          if (attacked.edges.length > 0) sawEdges++
          for (const g of groundings) {
            expect(driftDetect(g, attacked)).toBe(driftDetect(g, axesNoScip))
          }
        },
      ),
      { numRuns: 150 },
    )
    expect(sawEdges).toBeGreaterThan(0) // NON-VACUITY: the generator did exercise the SCIP leg
  })
})
