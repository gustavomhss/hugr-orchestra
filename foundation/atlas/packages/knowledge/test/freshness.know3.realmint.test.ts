// WP-4.10-a.KNOW · SCN-KNOW-3b-1 / 3b-2, WIDENED THROUGH THE REAL MINT   (HONESTY-TAPROOT 2026-08-02)
//
// WHY THIS FILE EXISTS. `freshness.know3.test.ts` transcribes SCN-KNOW-3b-1 as:
//
//     const fact = factAt('fn parseHeader', 'st-77');
//     const cosmeticTree = mkTree({ 'fn parseHeader': 'st-77' });
//     expect(freshness(fact, cosmeticTree)).toBe('FRESH');
//
// which asserts `'st-77' === 'st-77'`. The anchor key AND the subtreeHash are both pinned BY HAND on both
// sides, no source text exists, no reformat is ever applied, and the whole "cosmetic edit" is carried by a
// COMMENT. It is byte-for-byte the same assertion as SCN-KNOW-3a-1 directly above it. That golden is
// therefore VACUOUS in exactly the way SCN-GROUND-5b was (see f2a8659): it can never fail for the property
// it names. This file runs the same three edit classes through the REAL `@atlas/index` `build()` key+hash
// mint and the REAL `@atlas/grounding` `driftDetect`, with nothing pinned by hand.
//
// WHAT IS STILL MODELLED, stated so this file does not repeat the sin it fixes: the AST extraction itself
// (`foldAstUnits`) lives in `@atlas/adapter-io`, which is the outer RING — a knowledge test importing it
// would be a layer inversion (ARCH-1/2, knowledge=L4). So the unit's source SLICE and its unit path are
// written literally here, in exactly the shape `ast.ts` emits (`<file>::<kind>:<ordinal>:<name>` with
// `content = src.slice(startIndex, endIndex)`). Everything downstream of that — the key mint, the escape,
// the rollup, the BLAKE3 subtreeHash, the drift verdict — is the shipped production code. The end-to-end
// leg over the real parser is `adapter-io/test/anchor-identity.test.ts`.

import { describe, it, expect } from "vitest"
import { asNodeKey } from "@atlas/kernel"
import type { StructRef } from "@atlas/contracts"
import { build, type Axes, type FileTree, type IndexNode, type ScipOutput } from "@atlas/index"
import { driftDetect, type DriftApi, type Grounding } from "@atlas/grounding"
import type { GroundedFact } from "@atlas/knowledge"
import { bindFreshness } from "../src/lifecycle/freshness.js"

const NO_SCIP: ScipOutput = { documents: [] }

/** The cited unit's own bytes — the exact slice `ast.ts` stores as the item node's `content`. */
const UNIT = `function parseHeader(buf: Buffer): Header {
  // decode the fixed-width prefix
  return decode(buf, 42);
}`

/** The unit path shape `ast.ts` mints: `<file>::<kind>:<ordinal>:<name>`. */
const unitPath = (file: string, name: string) => `${file}::function_declaration:0:${name}`

const FILE = "src/queue.ts"
const IMPORTS = `import { decode } from './codec';\n`

/**
 * Build the real axes for a file carrying one parsed unit. `above` is whatever precedes the unit in the
 * file (imports, license headers) — it changes the FILE's content but never the unit's slice, which is
 * precisely the distinction the invariant is about.
 */
const axesFor = (above: string, unitSrc: string, name = "parseHeader"): Axes => {
  const path = unitPath(FILE, name)
  const tree: FileTree = {
    path: ".",
    children: [
      {
        path: FILE,
        content: above + unitSrc + "\n",
        children: [{ path, children: [], content: unitSrc }],
      },
    ],
  }
  return build(tree, NO_SCIP)
}

const findNode = (n: IndexNode, key: string): IndexNode | undefined => {
  if (n.key === key) return n
  for (const c of n.children) {
    const hit = findNode(c, key)
    if (hit !== undefined) return hit
  }
  return undefined
}

/** The REAL grounding oracle, not a fixture that re-implements it. */
const realOracle: DriftApi = { driftDetect }
const freshness = bindFreshness(realOracle)

/** A fact grounded on the unit as it stands in `axes` — the anchor is READ OUT of the real mint. */
const factGroundedOn = (axes: Axes, name = "parseHeader"): GroundedFact => {
  const key = unitPath(FILE, name)
  const node = findNode(axes.spatial, key)
  expect(node, `the mint must produce the unit node ${key}`).toBeDefined()
  const anchor: StructRef = {
    kind: "symbol",
    qualifiedPath: key,
    subtreeHash: node!.subtreeHash,
  }
  return {
    kind: "advisory",
    id: asNodeKey("nk-hdr"),
    tier: "T2",
    claimNorm: "cn-parseheader",
    grounding: { entries: [{ anchor, path: FILE }] } satisfies Grounding,
    freshness: "FRESH",
    claims: [],
    authoring: "ADVISORY",
  }
}

describe("SCN-KNOW-3b-1 [WIDENED] — KNOW-3 through the real key+hash mint, nothing pinned by hand", () => {
  const before = axesFor(IMPORTS, UNIT)
  const fact = factGroundedOn(before)

  it("CONTROL — the fact reads FRESH against the tree it was grounded on", () => {
    expect(freshness(fact, before)).toBe("FRESH")
  })

  it("DELIVERED: an import added ABOVE the unit stays FRESH (the unit's own bytes never moved)", () => {
    const after = axesFor(`import { z } from './z';\n` + IMPORTS, UNIT)
    // teeth (breaks-on "the anchor key carries a byte offset — any line inserted above re-keys a still-true fact"):
    expect(findNode(after.spatial, unitPath(FILE, "parseHeader"))).toBeDefined()
    expect(freshness(fact, after)).toBe("FRESH")
  })

  it("DELIVERED: a license header SEPARATED from the unit (by the import) stays FRESH", () => {
    // The header sits above the import, which sits above the unit — so NO comment run is contiguous with
    // the declaration and the unit's slice is unchanged. ADR-0014 qualifies "header above ⇒ FRESH" by
    // CONTIGUITY; a header separated from the decl by an import (or a blank line) is not bound. Stays FRESH.
    const after = axesFor(`// Copyright 2026\n// SPDX-License-Identifier: Apache-2.0\n` + IMPORTS, UNIT)
    expect(freshness(fact, after)).toBe("FRESH")
  })

  // ADR-0014 (bound leading doc-comment ⇒ DRIFTS) is NOT witnessed here on purpose: `axesFor` writes the
  // unit node's `content` BY HAND (= `unitSrc`), deliberately bypassing `foldAstUnits` to avoid a knowledge→
  // adapter-io layer inversion (see this file's header). The slice-extension that binds a contiguous leading
  // doc-comment lives in `foldAstUnits`, so a comment-only edit never reaches this hand-written content and
  // would read FRESH here — modelling the new slice by hand would re-commit the vacuous-fixture sin this file
  // exists to fix. The mechanical witness of the ADR-0014 leg is `adapter-io/test/ast-gap2-doc-comment.test.ts`
  // (goldens G-GAP2-1..8), over the REAL parser + `build` + `driftDetect`.

  it("NOT DELIVERED: a whitespace reformat OF the cited unit DRIFTS (the oracle hashes raw bytes)", () => {
    const after = axesFor(IMPORTS, UNIT.replace("decode(buf, 42)", "decode(buf,  42)"))
    // The golden claimed FRESH here. It is DRIFTED, deliberately and permanently — REQ-KNOW-3b/REQ-GROUND-5b.
    // teeth (breaks-on "a whitespace normalizer landed — the oracle can no longer see a one-space change
    // inside a template literal, where whitespace is SEMANTIC"):
    expect(freshness(fact, after)).toBe("DRIFTED")
  })

  it("NOT DELIVERED: a comment reindent INSIDE the cited unit DRIFTS", () => {
    const after = axesFor(IMPORTS, UNIT.replace("  // decode", "    // decode"))
    expect(freshness(fact, after)).toBe("DRIFTED")
  })

  it("NOT DELIVERED: a rename OF the cited symbol DRIFTS — the anchor key is GONE, fail-closed", () => {
    const renamed = UNIT.replace("parseHeader", "parseFrameHeader")
    const after = axesFor(IMPORTS, renamed, "parseFrameHeader")
    // the name is part of the key, so the old anchor does not merely re-hash — it stops existing.
    expect(findNode(after.spatial, unitPath(FILE, "parseHeader"))).toBeUndefined()
    // teeth (breaks-on "the fact silently re-binds to the renamed unit — a rename would launder a fact
    // onto code it was never grounded on"):
    expect(freshness(fact, after)).toBe("DRIFTED")
  })

  it("a real change to the cited unit DRIFTS (SCN-KNOW-3c-1, through the real mint)", () => {
    const after = axesFor(IMPORTS, UNIT.replace("42", "43"))
    expect(freshness(fact, after)).toBe("DRIFTED")
  })

  it("the unit hash is the RAW SLICE — an edit above it does not move it, an edit inside it does", () => {
    const key = unitPath(FILE, "parseHeader")
    const h = (a: Axes) => String(findNode(a.spatial, key)!.subtreeHash)
    const baseline = h(before)
    expect(h(axesFor(`import { z } from './z';\n` + IMPORTS, UNIT))).toBe(baseline)
    expect(h(axesFor(IMPORTS, UNIT.replace("decode(buf, 42)", "decode(buf,  42)")))).not.toBe(baseline)
  })
})
