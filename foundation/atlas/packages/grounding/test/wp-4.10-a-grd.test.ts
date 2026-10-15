// @atlas/grounding — test/wp-4.10-a-grd.test.ts   (WP-4.10-a.GROUND · CARVED slice)
//
// RED→GREEN transcription of the VISIBLE goldens for the PINNED verbs of the local drift-oracle:
//   subtreeHash(unit)  ·  isGrounded(g)  ·  driftDetect(grounding, src: Axes)
// The ground() verb (`ground(node)`) is DEFINE-parked (its groundable-unit `node` type is OWNER-DEFINE,
// unpinned) and is CARVED to a successor WP — so the ground()-dependent goldens SCN-GROUND-3a-1 (entry
// dropped) and SCN-GROUND-3c-1 (fuzz over ground()) are NOT transcribed here (node is never invented).
//
// Transcribed (pinned-verb goldens):
//   - SCN-GROUND-1a-1 (happy)  — drift keys off `subtreeHash` alone (import-above ⇒ FRESH, real edit ⇒ DRIFTED).
//   - SCN-GROUND-1b-1 (guard)  — a pure `displayLines` line-shift does not participate in drift.
//   - SCN-GROUND-1c-1 (guard)  — a line-range-only (no-subtreeHash) anchor is not real grounding
//                                 (structural realization via `isGrounded`/`driftDetect`; the ground-time
//                                 "no entry built" half is ground()-owned → parked, noted in the card).
//   - SCN-GROUND-2a-1 (happy)  — `isGrounded` = ≥1 entry ∧ EVERY entry non-empty (AND, never OR).
//   - SCN-GROUND-2b-1 (guard)  — an ungrounded / partial grounding never surfaces FRESH.
//   - SCN-GROUND-3b-1 (guard)  — a gone/unresolvable unit reads DRIFTED, fail-closed, never throws.
//   - SCN-GROUND-5a-1 (happy)  — a real change to the cited unit drifts it.
//   - SCN-GROUND-5b-1 (guard)  — import-above + unrelated-rename stay FRESH; a reformat OF the unit DRIFTS.
//   - SCN-GROUND-10a-1 (happy) — every `subtreeHash` follows the swapped @atlas/kernel Encoder seam.
//   - SCN-GROUND-10b-1 (guard) — no off-seam digest call site exists in this WP's source (static + differential).
//
// SEAM: `subtreeHash` routes through the sealed @atlas/kernel `Encoder` (no raw hashing). The runtime is
// imported DIRECTLY from ../src/*.js (the barrel is wired by the lead at SEAL). Held-out `-2` fixtures are
// NOT read. GROUND-11 forward-closure fold (WP-4.10-b) and GROUND-13 advisory→STALE routing (WP-4.12-a)
// are OUT of this slice — driftDetect returns the raw LOCAL structural Freshness (FRESH | DRIFTED).

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

// ── fixture builders ─────────────────────────────────────────────────────────────────────────────────
const node = (key: string, sh: string, children: IndexNode[] = []): IndexNode => ({
  axis: "spatial",
  level: "item",
  key,
  subtreeHash: asSubtreeHash(sh),
  children,
  objects: [],
})
/** A built-index snapshot whose spatial rail carries `leaves` (each a resolvable structural unit). */
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

// The cited unit `U_arr = billing.ts › computeArr()` — subtreeHash `sh-arr-01`; a real edit 42→43 ⇒ `sh-arr-02`.
const QP_ARR = "billing.ts#computeArr"
const g_arr = grounding(entry(QP_ARR, "sh-arr-01", "40-52"))
const src_same = axesWith([node(QP_ARR, "sh-arr-01")]) // import-above / unrelated-rename: U_arr's own bytes untouched
const src_edit = axesWith([node(QP_ARR, "sh-arr-02")]) // real change 42→43: subtree recomputed

describe("WP-4.10-a.GROUND — local drift oracle: subtreeHash · isGrounded · driftDetect (visible goldens)", () => {
  // AMENDED 2026-08-02 (HONESTY-TAPROOT): run A was labelled a "whitespace reformat" whose
  // "normalize(subtree)" was claimed unchanged. There is no normalize step — the oracle IS the hash of the
  // unit's raw source slice, so a reformat moves it, and the old tooth ("oracle mutated to the raw
  // byte-hash … a false alarm") named the SHIPPED product as its failure mode. Run A is now an import
  // added above the unit: it shifts the unit's LINES without touching its bytes, which is the real content
  // of "the verdict tracks subtreeHash and nothing else".
  it("SCN-GROUND-1a-1 [AMENDED]: drift keys off subtreeHash alone (import-above ⇒ FRESH, real edit ⇒ DRIFTED)", () => {
    // run A — an import added above: the unit's own bytes and key are untouched, so sh-arr-01 stands.
    expect(driftDetect(g_arr, src_same)).toBe("FRESH")
    // run B — real edit 42→43: the unit's slice changed, so its hash is recomputed to sh-arr-02.
    // teeth (breaks-on "the oracle folds the unit's line-range — run A flips to DRIFTED, a false alarm"):
    expect(driftDetect(g_arr, src_edit)).toBe("DRIFTED")
  })

  it("SCN-GROUND-1b-1: a pure displayLines line-shift does not drift", () => {
    // import-above shifts displayLines [40-52]→[44-56] while the subtreeHash stays sh-arr-01.
    const shifted = grounding(entry(QP_ARR, "sh-arr-01", "44-56"))
    // teeth (breaks-on "displayLines folded into the oracle — the line-shift flips it to DRIFTED"):
    expect(driftDetect(shifted, src_same)).toBe("FRESH")
    // the verdict is invariant across the displayLines edit (both legs FRESH).
    expect(driftDetect(g_arr, src_same)).toBe(driftDetect(shifted, src_same))
  })

  it("SCN-GROUND-1c-1: a line-range-only (no-subtreeHash) anchor is not real grounding", () => {
    // E_lronly — a StructRef carrying only a line-range and NO subtreeHash (modelled as an empty oracle).
    const lineRangeOnly = grounding(entry(QP_ARR, "", "40-52"))
    // teeth (breaks-on "a line-range-only anchor is accepted — a fact anchored by lines survives"):
    expect(isGrounded(lineRangeOnly)).toBe(false)
    expect(driftDetect(lineRangeOnly, src_same)).toBe("DRIFTED") // never FRESH (fail-closed)
  })

  it("SCN-GROUND-2a-1: isGrounded = ≥1 entry AND every entry non-empty (AND, never OR)", () => {
    const g_full = grounding(entry(QP_ARR, "sh-arr-01"), entry("billing.ts#tax", "sh-arr-01b"))
    const g_partial = grounding(entry(QP_ARR, "sh-arr-01"), entry("billing.ts#tax", "")) // one empty
    expect(isGrounded(g_full)).toBe(true)
    // teeth (breaks-on "the `every` conjunct is weakened to `some` (AND→OR) — g_partial wrongly counts as real"):
    expect(isGrounded(g_partial)).toBe(false)
  })

  it("SCN-GROUND-2b-1: an ungrounded / partial grounding never surfaces FRESH", () => {
    const g_empty = grounding() // 0 entries
    const g_partial = grounding(entry(QP_ARR, "sh-arr-01"), entry("billing.ts#tax", ""))
    // g_partial's non-empty leg RESOLVES-and-matches in src_same — proving it is the empty leg
    // (via isGrounded), not resolution, that forces DRIFTED.
    const src_partial = axesWith([node(QP_ARR, "sh-arr-01"), node("billing.ts#tax", "sh-tax")])
    // teeth (breaks-on "driftDetect returns FRESH when isGrounded is false — an ungrounded fact passes the gate"):
    expect(driftDetect(g_empty, src_same)).toBe("DRIFTED")
    expect(driftDetect(g_partial, src_partial)).toBe("DRIFTED")
  })

  it("SCN-GROUND-3b-1: a gone/unresolvable unit reads DRIFTED, fail-closed, never throws", () => {
    const g_gone = grounding(entry("deleted.ts#gone", "sh-gone-01"))
    // the deleted unit is absent from the built index src_same ⇒ unresolvable.
    // teeth (breaks-on "driftDetect returns FRESH for a gone unit — a deleted citation reads still-anchored"):
    expect(() => driftDetect(g_gone, src_same)).not.toThrow()
    expect(driftDetect(g_gone, src_same)).toBe("DRIFTED")
  })

  it("SCN-GROUND-5a-1: a real change to the cited unit drifts it", () => {
    // teeth (breaks-on "the normalizer over-normalizes and erases 42→43 — a changed unit stays FRESH"):
    expect(driftDetect(g_arr, src_edit)).toBe("DRIFTED")
  })

  // ⚠️ AMENDED 2026-08-02 (HONESTY-TAPROOT) — this case CONTRADICTED the golden it transcribes.
  // It was titled "SCN-GROUND-5b-1: reformat + import-above + unrelated-rename all stay FRESH (0 false
  // drift)" and built a `reformat` tree as `axesWith([node(QP_ARR, 'sh-arr-01')])` — i.e. it declared BY
  // HAND that a reformat leaves the hash at `sh-arr-01`, which is the very thing in question, and is
  // false. `goldens-grd.md` SCN-GROUND-5b-1 was amended at `f2a8659` to "import-above + unrelated-rename
  // stay FRESH; a reformat DOES drift", but this transcription was left claiming the opposite, so the
  // suite asserted one law and the goldens another while `npx vitest run` and every gate exited 0.
  // The reformat leg is exercised for real (through the parser + mint) in
  // `adapter-io/test/anchor-identity.test.ts` (ANCHOR-C) and `knowledge/test/freshness.know3.realmint.test.ts`.
  it("SCN-GROUND-5b-1 [AMENDED]: an edit that does not TOUCH the cited unit stays FRESH", () => {
    // Neither edit changes U_arr's own bytes, so its subtreeHash is genuinely still sh-arr-01.
    const importAbove = axesWith([node(QP_ARR, "sh-arr-01"), node("other.ts#import", "sh-other")])
    const unrelatedRename = axesWith([node(QP_ARR, "sh-arr-01"), node("other.ts#renamed", "sh-other-2")])
    // teeth (breaks-on "the oracle folds the unit's line-range — an edit above it drifts a still-true fact"):
    for (const src of [importAbove, unrelatedRename]) {
      expect(driftDetect(g_arr, src)).toBe("FRESH")
    }
    // teeth (breaks-on "a reformat OF the cited unit reads FRESH — a normalizer landed"): the reformat
    // MOVES the raw-source-slice hash, and the oracle must report that as drift.
    const reformatted = axesWith([node(QP_ARR, "sh-arr-0R")])
    expect(driftDetect(g_arr, reformatted)).toBe("DRIFTED")
  })

  it("SCN-GROUND-10a-1: every subtreeHash follows the swapped @atlas/kernel Encoder seam", () => {
    // a stub digest distinct from BLAKE3 — deterministic + injective over the preimage bytes.
    const stub: Encoder = { hash: (b) => asHash(`stub:${Array.from(b).join(".")}`) }
    const blakeApi = bindSubtree(defaultEncoder)
    const stubApi = bindSubtree(stub)
    const units: CasObject[] = [
      { kind: "item", name: "computeArr", body: "return 42" },
      { kind: "item", name: "computeArr", body: "return 43" }, // a real change
      { kind: "block", name: "idempotency", text: "all handlers idempotent" },
    ]
    for (const u of units) {
      // every produced subtreeHash FOLLOWS the seam (0 off-seam divergence).
      expect(stubApi.subtreeHash(u)).toBe(asSubtreeHash(stub.hash(canonicalForm(u))))
      expect(blakeApi.subtreeHash(u)).toBe(asSubtreeHash(defaultEncoder.hash(canonicalForm(u))))
      // teeth (breaks-on "an anchor path inlines its own blake3 — the value does NOT follow the swapped stub"):
      expect(blakeApi.subtreeHash(u)).not.toBe(stubApi.subtreeHash(u)) // the swap moved every value
    }
    // a real change to the cited unit changes the subtreeHash; a re-hash of the same unit is byte-stable.
    expect(blakeApi.subtreeHash(units[0]!)).not.toBe(blakeApi.subtreeHash(units[1]!))
    expect(blakeApi.subtreeHash(units[0]!)).toBe(
      blakeApi.subtreeHash({ kind: "item", name: "computeArr", body: "return 42" }),
    )
  })

  it("SCN-GROUND-10b-1: no off-seam digest call site exists in this WP source", () => {
    // static ESM declaration check of Acceptance §8 — this WP's own source carries no raw hash IMPORT or CALL site
    // (a digest CALL `blake3(` / `createHash(` or an off-seam digest IMPORT; prose mentions are exempt).
    const OFF_SEAM_CALL = /\b(blake3|sha256|sha512|md5|crc32|createHash)\s*\(/
    for (const rel of ["../src/subtree.ts", "../src/drift.ts"]) {
      const source = readFileSync(new URL(rel, import.meta.url), "utf8")
      // teeth (breaks-on "an anchor builder imports blake3 directly and hashes off-seam"):
      expect(OFF_SEAM_CALL.test(source)).toBe(false)
      expect(hasOffSeamImport(source)).toBe(false)
    }
    // differential: swapping the seam moves the value ⇒ nothing is computed off-seam (folded from 10a).
    const stubA: Encoder = { hash: (b) => asHash(`a:${b.length}`) }
    const stubB: Encoder = { hash: (b) => asHash(`b:${b.length}`) }
    const u: CasObject = { kind: "item", name: "x", body: "return 1" }
    expect(bindSubtree(stubA).subtreeHash(u)).not.toBe(bindSubtree(stubB).subtreeHash(u))
  })

  it("SCN-GROUND-10b-1: rejects multiline direct @noble digest imports without reading trailing comments", () => {
    expect(hasOffSeamImport('import {\n  blake3,\n} from "@noble/hashes/blake3"')).toBe(true)
    expect(hasOffSeamImport('import { asHash } from "@atlas/kernel"\n// @noble is prose')).toBe(false)
  })
})
