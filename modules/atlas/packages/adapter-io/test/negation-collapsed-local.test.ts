// @atlas/adapter-io — test/negation-collapsed-local.test.ts  (#99 F3 — collapsed cross-package `local` soundness)
//
// THE PRODUCTION FALSE-PROVEN, pinned against a FROZEN reduced SCIP fixture (a few hundred bytes, committed).
// scip-typescript emits a cross-package reference as an opaque `local N` symbol; `symbol-reverse.ts` drops all
// `local ` symbols, so the real caller VANISHES from reverseCallers/holeSources/targetEscapes. The fixture
// isolates that worst case with NOTHING to mask it (`negation-key.ts` carries ONLY the lone `local 0` call of
// `asNodeKey`, stdlib refs stripped) — so on the full index the stdlib holes hide the bug, but here the
// collapsed local is the SOLE completeness gap and a PROVEN over `packages/knowledge/src` is the false-admit.
//
// Two frozen assertions (F3):
//   1. the v2 door AND `verifyNegation` AND the fallback door MUST `abstain(scope-open)` on `asNodeKey @
//      packages/knowledge/src` — a PROVEN/ADMIT is the bug (RED before the fix, GREEN after).
//   2. the COMPANION doc (`companion.ts`, a GENUINE block-`const` local) MUST NOT abstain for its own negation
//      (`helper @ packages/other/src` stays PROVEN/ADMIT) — the precision boundary against approach-2.

import { describe, it, expect, beforeAll, afterEach } from "vitest"
import { join } from "node:path"
import { createSymbolReverse, nodeHashOfPath, isLocalSymbol } from "@atlas/index"
import type { Axes, Axis, IndexNode, SymbolReverseApi } from "@atlas/index"
import { verifyNegation } from "@atlas/genesis"
import { asSubtreeHash } from "@atlas/kernel"
import type { Hash } from "@atlas/contracts"
import { negationKey } from "@atlas/knowledge"
import type { NegationNode } from "@atlas/knowledge"
import { readScipOrEmpty, readScipIndexerName } from "../src/scip.js"
import { edgeModelVersion } from "../src/wire.js"
import { createGovernedEmit } from "../src/governed-emit.js"
import { rehydrateProjection } from "../src/store.js"
import { freshWorkspace, HOLDS, policyOf } from "./door-regression-support.js"
import type { Workspace } from "./door-regression-support.js"

const FIX = join(__dirname, "fixtures", "neg-collapsed-local")
const SCIP = join(FIX, "collapsed-local.scip")

const ASNODEKEY = "scip-typescript npm @atlas/knowledge 0.0.0 src/brand.ts/asNodeKey()."
const HELPER = "scip-typescript npm @atlas/other 0.0.0 src/companion.ts/helper()."
const KNOWLEDGE = "packages/knowledge/src"
const OTHER = "packages/other/src"
const BRAND_DOC = "packages/knowledge/src/brand.ts"
const NEG_KEY_DOC = "packages/knowledge/src/negation-key.ts"
const COMPANION_DOC = "packages/other/src/companion.ts"
const AT = NaN as unknown as Hash

/** A spatial node keyed by its repo-relative path (the SAME key `createSymbolReverse` hashes via
 *  `nodeHashOfPath(relativePath)`), so the REAL `nodeHashOfPath` maps the feed's docHashes back to paths. */
const inode = (key: string, children: IndexNode[] = []): IndexNode => ({
  axis: "spatial" as Axis,
  level: "file",
  key,
  subtreeHash: asSubtreeHash("sh-" + key),
  children,
  objects: [],
})

/** The spatial rail for the fixture repo — the two scope directories with their files, keyed by real path so
 *  the door's `∩ S` (`nodeHashOfPath(node.key)` ⋈ feed hashes) lines up with the REAL feed built off the .scip. */
function fixtureAxes(): Axes {
  const spatial = inode(".", [
    inode(KNOWLEDGE, [inode(BRAND_DOC), inode(NEG_KEY_DOC)]),
    inode(OTHER, [inode(COMPANION_DOC)]),
  ])
  const empty = inode(".")
  return { spatial, territory: empty, dependency: empty, edges: [] }
}

let axes: Axes
let reverse: SymbolReverseApi
let pathOfHash: (h: Hash) => string | undefined

beforeAll(() => {
  const scipOutput = readScipOrEmpty(SCIP)
  axes = fixtureAxes()
  // The SAME feed the production door rides, with the indexer identity threaded (scip-typescript ⇒ the
  // collapsed-local gate engages). Reading the name from the raw dump mirrors the composition root.
  reverse = createSymbolReverse(scipOutput, { indexerName: readScipIndexerName(SCIP) })
  const byHash = new Map<string, string>()
  for (const doc of scipOutput.documents) byHash.set(String(nodeHashOfPath(doc.relativePath)), doc.relativePath)
  pathOfHash = (h) => byHash.get(String(h))
})

function negation(target: string, scope: string): NegationNode {
  return {
    kind: "negation",
    id: "ignored",
    tier: "T2",
    relationKind: "calls",
    target,
    scope,
    grounding: { entries: [] },
    edgeModel: "ignored",
    freshness: "FRESH",
    claims: [],
    authoring: "NEGATED",
  } as unknown as NegationNode
}

let ws: Workspace | undefined
afterEach(() => {
  ws?.dispose()
  ws = undefined
})

/** A door over a fresh disk store. `v2` ⇒ wire the two target-relative legs as `[]`/`[]` (asNodeKey does not
 *  escape, the fixture has no dynamic channel) so ONLY the NEW collapsed-local gate can force an abstain;
 *  omit them ⇒ the #99b fallback blanket path. */
function door(v2: boolean) {
  ws ??= freshWorkspace()
  return createGovernedEmit({
    store: ws.store,
    gate: HOLDS,
    policy: policyOf({ [KNOWLEDGE]: ["bob"], [OTHER]: ["bob"] }),
    actor: "bob",
    ratifyToken: "billy",
    symbolReverse: () => reverse,
    axes,
    nodeHashOfPath,
    edgeModel: edgeModelVersion(),
    ...(v2 ? { targetEscapes: () => [], dynamicReach: () => [] } : {}),
  })
}
const recOf = (w: Workspace, target: string, scope: string) =>
  rehydrateProjection(w.store).abstained?.get(String(negationKey("calls", target, scope)))

describe("#99 F3 — collapsed cross-package `local` soundness (frozen reduced SCIP fixture)", () => {
  it("the feed marks the collapsed-local doc OPAQUE and the genuine-local doc NOT — per-document scope", () => {
    const opaquePaths = reverse.opaqueRefSources().map((h) => pathOfHash(h))
    // negation-key.ts (lone `local 0` ref, no local def) IS opaque; companion.ts (genuine `local 2` def+ref) is NOT.
    expect(opaquePaths).toContain(NEG_KEY_DOC)
    expect(opaquePaths).not.toContain(COMPANION_DOC)
    // The bug's fingerprint: the SOLE gap is the opaque ref — holeSources is EMPTY (stdlib stripped), so without
    // the opaque set the closed-world proof would fire.
    expect(reverse.holeSources().map((h) => pathOfHash(h))).not.toContain(NEG_KEY_DOC)
    expect(reverse.reverseCallers(ASNODEKEY)).toEqual([]) // the real caller collapsed away
    expect(reverse.resolves(ASNODEKEY)).toBe(true) // …but the TARGET is a real def (so a naive "no caller" ⇒ PROVEN)
  })

  it("REGRESSION 1a — verifyNegation ABSTAINS scope-open on asNodeKey @ packages/knowledge/src (was false PROVEN)", () => {
    const v = verifyNegation({ scope: KNOWLEDGE, target: ASNODEKEY }, reverse, pathOfHash, isLocalSymbol)
    expect(v.verdict).toBe("abstain")
    expect(v.reason).toBe("scope-open")
  })

  it("REGRESSION 1b — the FALLBACK door ABSTAINS scope-open (was false ADMIT)", () => {
    const out = door(false).emit(negation(ASNODEKEY, KNOWLEDGE), AT)
    expect(out.emitted).toBe(false)
    const rec = recOf(ws!, ASNODEKEY, KNOWLEDGE)
    expect(rec?.reason).toBe("scope-open")
    expect(rec?.witness.underApproxSources).toContain(String(nodeHashOfPath(NEG_KEY_DOC)))
  })

  it("REGRESSION 1c — the WIRED v2 door ABSTAINS scope-open (the PRODUCTION_AFFECTED false ADMIT)", () => {
    const out = door(true).emit(negation(ASNODEKEY, KNOWLEDGE), AT)
    expect(out.emitted).toBe(false)
    const rec = recOf(ws!, ASNODEKEY, KNOWLEDGE)
    expect(rec?.reason).toBe("scope-open")
    expect(rec?.witness.underApproxSources).toContain(String(nodeHashOfPath(NEG_KEY_DOC)))
  })

  it("REGRESSION 2 — the genuine-local companion MUST NOT abstain for its own negation (precision boundary)", () => {
    // verifyNegation: no caller, no hole, no opaque in OTHER ⇒ a sound closed-world PROVEN (not abstain).
    const v = verifyNegation({ scope: OTHER, target: HELPER }, reverse, pathOfHash, isLocalSymbol)
    expect(v.verdict).toBe("proven")
    // …and the wired v2 door ADMITS it — the fix did not silently degrade into approach-2 (abstain-on-any-local).
    const out = door(true).emit(negation(HELPER, OTHER), AT)
    expect(out.emitted).toBe(true)
    expect(recOf(ws!, HELPER, OTHER)).toBeUndefined()
  })
})
