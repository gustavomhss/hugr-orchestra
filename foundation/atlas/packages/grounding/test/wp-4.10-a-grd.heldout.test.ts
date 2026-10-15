// @atlas/grounding — test/wp-4.10-a-grd.heldout.test.ts   (WP-4.10-a.GROUND · HELD-OUT gate)
//
// Cold-review held-out probe: the `-2` sibling goldens of the PINNED verbs (subtreeHash · isGrounded ·
// driftDetect) authored against the EXISTING src (../src/subtree.js + ../src/drift.js), independent
// data from the visible `-1` set (E_tax/sh-tax + comment-reindent/license-above/unrelated-rename).
// OUT of scope (ground()-carved, node type OWNER-DEFINE): SCN-GROUND-3a-2 (ground() drops dangling) and
// the ground() leg of SCN-GROUND-3c-2 (PBT over ground()); neither is exercised here.
//
// Transcribed held-out goldens (goldens-grd.md §§531-691):
//   1a-2 · 1b-2 · 1c-2(structural leg) · 2a-2 · 2b-2 · 5a-2 · 5b-2 · 10a-2 · 10b-2

import { readFileSync } from "node:fs"
import { describe, it, expect } from "vitest"
import ts from "typescript"
import { asHash, asSubtreeHash, canonicalForm, defaultEncoder } from "@atlas/kernel"
import type { CasObject, Encoder } from "@atlas/kernel"
import type { Axes, IndexNode } from "@atlas/index"
import type { Grounding, GroundingEntry } from "../src/types.js"
import { bindSubtree } from "../src/subtree.js"
import { driftDetect, isGrounded } from "../src/drift.js"

const OFF_SEAM_IMPORT = /\b(blake3|sha256|sha512|md5|crc32|createHash)\b|node:crypto|@noble\b/
const hasOffSeamImport = (source: string): boolean => {
  const file = ts.createSourceFile("source.ts", source, ts.ScriptTarget.Latest, false, ts.ScriptKind.TS)
  return file.statements.some(
    (statement) => ts.isImportDeclaration(statement) && OFF_SEAM_IMPORT.test(statement.getText(file)),
  )
}

// ── fixture builders (identical topology to the visible set; held-out data) ────────────────────────────
const node = (key: string, sh: string, children: IndexNode[] = []): IndexNode => ({
  axis: "spatial",
  level: "item",
  key,
  subtreeHash: asSubtreeHash(sh),
  children,
  objects: [],
})
const axesWith = (leaves: IndexNode[]): Axes => ({
  spatial: node("repo", "root", leaves),
  territory: node("repo", "empty"),
  dependency: node("repo", "empty"),
  edges: [],
})
const entry = (qp: string, sh: string, displayLines?: string): GroundingEntry => {
  const anchor = { kind: "symbol" as const, qualifiedPath: qp, subtreeHash: asSubtreeHash(sh) }
  const path = qp.split("#")[0] ?? qp
  return displayLines === undefined ? { anchor, path } : { anchor, path, displayLines }
}
const grounding = (...entries: GroundingEntry[]): Grounding => ({ entries })

// U_tax = billing.ts › tax() — subtreeHash `sh-tax-01`; a real VAT edit 20→21 ⇒ `sh-tax-02`.
const QP_TAX = "billing.ts#tax"
const g_tax = grounding(entry(QP_TAX, "sh-tax-01", "88-96"))
const src_same = axesWith([node(QP_TAX, "sh-tax-01")]) // license-above / unrelated-rename-elsewhere: U_tax's own bytes untouched
const src_edit = axesWith([node(QP_TAX, "sh-tax-02")]) // real VAT change 20→21

describe("WP-4.10-a.GROUND — HELD-OUT (-2) pinned-verb goldens against existing src", () => {
  // AMENDED 2026-08-02 (HONESTY-TAPROOT): run A was labelled "comment-reindent", which MOVES the
  // raw-source-slice hash — the label contradicted the fixture, which held sh-tax-01 constant by hand.
  // Run A is now a license header added ABOVE the unit, which genuinely leaves its bytes untouched.
  it("SCN-GROUND-1a-2 [AMENDED]: drift keys off subtreeHash alone (license-above ⇒ FRESH, VAT edit ⇒ DRIFTED)", () => {
    expect(driftDetect(g_tax, src_same)).toBe("FRESH") // run A — license header above, subtreeHash unchanged
    expect(driftDetect(g_tax, src_edit)).toBe("DRIFTED") // run B — real VAT edit 20→21
  })

  it("SCN-GROUND-1b-2: a license-header line-shift does not drift", () => {
    const shifted = grounding(entry(QP_TAX, "sh-tax-01", "95-103")) // [88-96]→[95-103]
    expect(driftDetect(shifted, src_same)).toBe("FRESH")
    expect(driftDetect(g_tax, src_same)).toBe(driftDetect(shifted, src_same))
  })

  it("SCN-GROUND-1c-2: a line-range-only (no-subtreeHash) anchor is not real grounding", () => {
    // structural realization: a subtreeHash-less anchor fails isGrounded ⇒ never FRESH.
    const lineRangeOnly = grounding(entry(QP_TAX, "", "88-96"))
    expect(isGrounded(lineRangeOnly)).toBe(false)
    expect(driftDetect(lineRangeOnly, src_same)).toBe("DRIFTED")
  })

  it("SCN-GROUND-2a-2: isGrounded = ≥1 entry AND every entry non-empty (AND, never OR)", () => {
    const g_full2 = grounding(entry(QP_TAX, "sh-tax-01"), entry("billing.ts#e3", "sh-tax-01b"))
    const g_partial2 = grounding(entry(QP_TAX, "sh-tax-01"), entry("billing.ts#e2", "")) // one empty
    expect(isGrounded(g_full2)).toBe(true)
    expect(isGrounded(g_partial2)).toBe(false)
  })

  it("SCN-GROUND-2b-2: an ungrounded / partial grounding never surfaces FRESH", () => {
    const g_empty2 = grounding()
    const g_partial2 = grounding(entry(QP_TAX, "sh-tax-01"), entry("billing.ts#e2", ""))
    const src_partial = axesWith([node(QP_TAX, "sh-tax-01"), node("billing.ts#e2", "sh-e2")])
    expect(driftDetect(g_empty2, src_same)).toBe("DRIFTED")
    expect(driftDetect(g_partial2, src_partial)).toBe("DRIFTED") // non-empty leg resolves; empty leg forces DRIFTED
  })

  it("SCN-GROUND-5a-2: a real change to the cited unit drifts it", () => {
    expect(driftDetect(g_tax, src_edit)).toBe("DRIFTED")
  })

  // AMENDED 2026-08-02 (HONESTY-TAPROOT) — the `reindent` leg declared BY HAND that an in-unit comment
  // reindent leaves the hash at sh-tax-01, which is false: the oracle hashes the unit's raw source slice.
  // goldens-grd.md SCN-GROUND-5b-2 was amended at f2a8659; this transcription had been left contradicting it.
  it("SCN-GROUND-5b-2 [AMENDED]: edits that do not TOUCH the cited unit stay FRESH; an in-unit reindent DRIFTS", () => {
    const licenseAbove = axesWith([node(QP_TAX, "sh-tax-01"), node("LICENSE.md#hdr", "sh-lic")])
    const unrelatedRename = axesWith([node(QP_TAX, "sh-tax-01"), node("util.ts#renamed", "sh-util-2")])
    for (const src of [licenseAbove, unrelatedRename]) {
      expect(driftDetect(g_tax, src)).toBe("FRESH")
    }
    // teeth (breaks-on "an in-unit comment reindent reads FRESH — a normalizer landed"):
    const reindented = axesWith([node(QP_TAX, "sh-tax-0R")])
    expect(driftDetect(g_tax, reindented)).toBe("DRIFTED")
  })

  it("SCN-GROUND-10a-2: every subtreeHash follows the swapped seam (distinct FNV-style stub)", () => {
    // an FNV-style stub distinct from 10a-1's `stub:`-prefixed digest.
    const fnv: Encoder = {
      hash: (b) => {
        let h = 2166136261 >>> 0
        for (const x of b) {
          h ^= x
          h = Math.imul(h, 16777619) >>> 0
        }
        return asHash(`fnv:${h.toString(16)}`)
      },
    }
    const blakeApi = bindSubtree(defaultEncoder)
    const fnvApi = bindSubtree(fnv)
    const units: CasObject[] = [
      { kind: "item", name: "tax", body: "return 20" },
      { kind: "item", name: "tax", body: "return 21" }, // a real change
      { kind: "block", name: "security", text: "all mutations audit-logged" },
    ]
    for (const u of units) {
      expect(fnvApi.subtreeHash(u)).toBe(asSubtreeHash(fnv.hash(canonicalForm(u))))
      expect(blakeApi.subtreeHash(u)).toBe(asSubtreeHash(defaultEncoder.hash(canonicalForm(u))))
      expect(blakeApi.subtreeHash(u)).not.toBe(fnvApi.subtreeHash(u)) // the swap moved every value
    }
    expect(blakeApi.subtreeHash(units[0]!)).not.toBe(blakeApi.subtreeHash(units[1]!))
    expect(blakeApi.subtreeHash(units[0]!)).toBe(blakeApi.subtreeHash({ kind: "item", name: "tax", body: "return 20" }))
  })

  it("SCN-GROUND-10b-2: no off-seam digest call site exists in this WP source", () => {
    const OFF_SEAM_CALL = /\b(blake3|sha256|sha512|md5|crc32|createHash)\s*\(/
    for (const rel of ["../src/subtree.ts", "../src/drift.ts"]) {
      const source = readFileSync(new URL(rel, import.meta.url), "utf8")
      expect(OFF_SEAM_CALL.test(source)).toBe(false)
      expect(hasOffSeamImport(source)).toBe(false)
    }
    // distinct off-seam family (sha-style) differential — swapping the seam moves the value.
    const stubA: Encoder = { hash: (b) => asHash(`sha:a:${b.length}`) }
    const stubB: Encoder = { hash: (b) => asHash(`sha:b:${b.length}`) }
    const u: CasObject = { kind: "item", name: "y", body: "return 2" }
    expect(bindSubtree(stubA).subtreeHash(u)).not.toBe(bindSubtree(stubB).subtreeHash(u))
  })

  it("SCN-GROUND-10b-2: rejects multiline direct @noble digest imports without reading trailing comments", () => {
    expect(hasOffSeamImport('import {\n  blake3,\n} from "@noble/hashes/blake3"')).toBe(true)
    expect(hasOffSeamImport('import { asHash } from "@atlas/kernel"\n// @noble is prose')).toBe(false)
  })
})
