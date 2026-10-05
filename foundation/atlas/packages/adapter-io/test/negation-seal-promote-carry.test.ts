// @atlas/adapter-io — test/negation-seal-promote-carry.test.ts  (SEAL-PROMOTE-CARRY — the negation leg's seal law)
//
// The negation door builds its stored node from `...raw` and `put`s it into CAS. Before SEAL-PROMOTE-CARRY a
// payload-supplied `seal` rode `raw` straight onto that node — so an operator `atlas emit {kind:'negation',
// seal:'proven'}` LEAKED a forged trust signal into the CAS bytes (the dormant leak the MAIN door had already
// closed at gate 0). This pins the SAME origin-conditional law on the negation leg:
//   AC-3 (SECURITY)  — an AUTHORED negation's forged `seal` is stripped ⇒ the CAS bytes carry NO seal.
//   AC-3 (companion) — a PROMOTED negation (door-derived origin, a mined fact from content-addressed staging)
//                      KEEPS a trusted `seal` on the CAS bytes.
// It rides the SAME frozen reduced-SCIP fixture the collapsed-local suite uses (the genuine-local `helper @
// packages/other/src` negation, which the door ADMITS), so an admitted negation actually reaches CAS.

import { describe, it, expect, beforeAll, afterEach } from "vitest"
import { join } from "node:path"
import { createSymbolReverse, nodeHashOfPath } from "@atlas/index"
import type { Axes, Axis, IndexNode, SymbolReverseApi } from "@atlas/index"
import { asSubtreeHash } from "@atlas/kernel"
import type { Hash } from "@atlas/contracts"
import type { NegationNode } from "@atlas/knowledge"
import { readScipOrEmpty, readScipIndexerName } from "../src/scip.js"
import { edgeModelVersion } from "../src/wire.js"
import { createGovernedEmit } from "../src/governed-emit.js"
import { freshWorkspace, HOLDS, policyOf } from "./door-regression-support.js"
import type { Workspace } from "./door-regression-support.js"

const FIX = join(__dirname, "fixtures", "neg-collapsed-local")
const SCIP = join(FIX, "collapsed-local.scip")

const HELPER = "scip-typescript npm @atlas/other 0.0.0 src/companion.ts/helper()."
const KNOWLEDGE = "packages/knowledge/src"
const OTHER = "packages/other/src"
const BRAND_DOC = "packages/knowledge/src/brand.ts"
const NEG_KEY_DOC = "packages/knowledge/src/negation-key.ts"
const COMPANION_DOC = "packages/other/src/companion.ts"
const AT = NaN as unknown as Hash

const inode = (key: string, children: IndexNode[] = []): IndexNode => ({
  axis: "spatial" as Axis,
  level: "file",
  key,
  subtreeHash: asSubtreeHash("sh-" + key),
  children,
  objects: [],
})
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

beforeAll(() => {
  const scipOutput = readScipOrEmpty(SCIP)
  axes = fixtureAxes()
  reverse = createSymbolReverse(scipOutput, { indexerName: readScipIndexerName(SCIP) })
})

/** A well-formed `calls` negation, with an OPTIONAL payload `seal` — the forgeable trust signal under test. */
function negation(target: string, scope: string, seal?: "proven"): NegationNode {
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
    ...(seal !== undefined ? { seal } : {}),
  } as unknown as NegationNode
}

let ws: Workspace | undefined
afterEach(() => {
  ws?.dispose()
  ws = undefined
})

/** The negation door over a fresh disk store, both v2 legs wired (helper does not escape / no dynamic channel)
 *  so the genuine-local `helper @ OTHER` negation ADMITS. `origin` is the door-derived trust key under test. */
function door(origin?: "promoted") {
  ws ??= freshWorkspace()
  return createGovernedEmit({
    store: ws.store,
    gate: HOLDS,
    policy: policyOf({ [OTHER]: ["bob"] }),
    actor: "bob",
    ratifyToken: "billy",
    symbolReverse: () => reverse,
    axes,
    nodeHashOfPath,
    edgeModel: edgeModelVersion(),
    targetEscapes: () => [],
    dynamicReach: () => [],
    ...(origin !== undefined ? { origin } : {}),
  })
}

describe("SEAL-PROMOTE-CARRY — the negation leg strips an authored seal, keeps a promoted one (CAS bytes)", () => {
  it("AC-3 (SECURITY) — an AUTHORED negation carrying `seal:proven` ⇒ the admitted CAS bytes carry NO seal", () => {
    const out = door(/* authored */).emit(negation(HELPER, OTHER, "proven"), AT)
    expect(out.emitted).toBe(true) // the genuine-local negation admits (precision boundary, unchanged)
    // TEETH: without the origin-conditional strip, the forged `seal:'proven'` would round-trip through CAS here.
    const readBack = ws!.store.get(out.id! as unknown as Hash) as { seal?: unknown } | undefined
    expect(readBack?.seal).toBeUndefined()
    expect(Object.prototype.hasOwnProperty.call(readBack ?? {}, "seal")).toBe(false)
  })

  it("AC-3 (companion) — a PROMOTED negation carrying `seal:proven` ⇒ the admitted CAS bytes KEEP the trusted seal", () => {
    const out = door("promoted").emit(negation(HELPER, OTHER, "proven"), AT)
    expect(out.emitted).toBe(true)
    // A promote is a mined fact re-emitted from content-addressed staging (the trusted admit path) — its seal survives.
    const readBack = ws!.store.get(out.id! as unknown as Hash) as { seal?: unknown } | undefined
    expect(readBack?.seal).toBe("proven")
  })

  it("AC-5 (back-compat) — a seal-less negation admits + its CAS bytes stay seal-less on BOTH origins", () => {
    const authored = door().emit(negation(HELPER, OTHER), AT)
    expect(authored.emitted).toBe(true)
    expect((ws!.store.get(authored.id! as unknown as Hash) as { seal?: unknown }).seal).toBeUndefined()
    ws!.dispose()
    ws = undefined
    const promoted = door("promoted").emit(negation(HELPER, OTHER), AT)
    expect(promoted.emitted).toBe(true)
    expect((ws!.store.get(promoted.id! as unknown as Hash) as { seal?: unknown }).seal).toBeUndefined()
  })
})
