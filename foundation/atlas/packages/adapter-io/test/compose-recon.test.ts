// @atlas/adapter-io — test/compose-recon.test.ts  (RECON-SEAMS — the REAL reconcile drift seams, end-to-end)
//
// Proves `composeRuntime` now wires the REAL arbitrary-rev drift seams (COMPOSE-C) into the `atlas-reconcile`
// leg, so reconcile DETECTS real structural drift (the former v1-empty stubs detected none). A throwaway git
// repo is materialized with TWO commits — A authors `src/unit.ts`, B rewrites its body (a real structural
// change that re-keys the unit's `subtreeHash`). Two grounded advisory facts are seeded into the durable
// projection (the invariant-6 read-back path `driftFacts` consumes): `factA` grounded at A's structure,
// `factB` at B's. Driving reconcile at mergeBase=A vs topic=HEAD=B, the drift-source diffs the anchor across
// the two revs and the KNOW-5 classifier splits by re-derivation:
//   - factA (grounded @A) no longer re-derives at B  ⇒ SEMANTIC (blocks, exitCode 2)
//   - factB (grounded @B) still re-derives at B       ⇒ MECHANICAL (auto-re-groundable, no block)
// Control: mergeBase == HEAD ⇒ NO structural change ⇒ nothing drifts.
//
// TEETH — each names the seam it proves load-bearing, reconstructing the EXACT leg compose.ts wires
// (`createReconcile(createDriftSource({repoPath, resolveAnchorAt, facts}), {reconcile: bindReconcile(reDerives)})`)
// with one seam reverted to its v1-empty stub; the drift golden goes RED, proving the real seam carries it.
//
// The shared fixtures/helpers live in ./harness/recon-fixtures.js; the N10 content-addressed classifier,
// rename detection, and phantom-move guard live in ./compose-recon-n10.test.ts.

import { describe, it, expect, afterEach } from "vitest"
import type { Hash } from "@atlas/contracts"
import type { ReconcileOut } from "@atlas/tools"
import { composeRuntime } from "../src/compose.js"
import { createRevIndex } from "../src/rev-index.js"
import { RECONCILE, makeFix, runLeg, type Fix } from "./harness/recon-fixtures.js"

let fix: Fix | undefined
afterEach(() => {
  fix?.cleanup()
  fix = undefined
})

describe("RECON-SEAMS — composeRuntime wires the REAL reconcile drift seams (COMPOSE-C)", () => {
  it("SCN-RS-1 — reconcile DETECTS a real structural change as DRIFTED (mechanical + semantic split)", () => {
    fix = makeFix()
    const { handler } = composeRuntime(fix.repoPath)

    // Drive the reconcile leg through the assembled handler: mergeBase=A, topic=HEAD=B.
    const v = handler.handle(RECONCILE, { mergeBase: fix.A as Hash })
    expect(v.ok).toBe(true)
    const out = v.data as ReconcileOut

    // DRIFT PROVEN — both facts' anchor moved A→B; the classifier splits by re-derivation at B.
    expect(out.drift).toHaveLength(2) // GOLDEN-drift-detected (teeth: resolveAnchorAt stub ⇒ 0)
    expect(out.semantic).toContain("F_A") // grounded @A ⇒ no longer re-derives at B ⇒ BROKEN
    expect(out.mechanical).toContain("F_B") // grounded @B ⇒ re-derives at B ⇒ auto-re-groundable
    expect(out.exitCode).toBe(2) // any semantic flip blocks (never a silent green)
    expect(out.reauthorCount).toBe(1) // == |semantic|
  })

  it("SCN-RS-2 (control) — NO structural change (mergeBase == topic) ⇒ nothing drifts", () => {
    fix = makeFix()
    const { handler } = composeRuntime(fix.repoPath)

    // mergeBase = HEAD (B) == topic ⇒ the anchor is identical at both ends ⇒ no drift pair.
    const out = handler.handle(RECONCILE, { mergeBase: fix.B as Hash }).data as ReconcileOut
    expect(out.drift).toHaveLength(0)
    expect(out.semantic).toHaveLength(0)
    expect(out.mechanical).toHaveLength(0)
    expect(out.exitCode).toBe(0)
  })

  it("TEETH-resolveAnchorAt — revert resolveAnchorAt→()=>undefined ⇒ NO drift detected (golden RED)", () => {
    fix = makeFix()
    const rev = createRevIndex(fix.repoPath)

    // Real seams detect the drift...
    const real = runLeg(fix, { resolveAnchorAt: rev.resolveAnchorAt, reDerives: rev.reDerives }, fix.A)
    expect(real.drift).toHaveLength(2)
    expect(real.exitCode).toBe(2)

    // ...MUTANT: the v1-empty anchor resolver ⇒ no anchor resolves at either end ⇒ zero drift pairs ⇒
    // the drift-detected golden FLIPS (drift empty, exitCode 0). resolveAnchorAt is load-bearing.
    const mutant = runLeg(fix, { resolveAnchorAt: () => undefined, reDerives: rev.reDerives }, fix.A)
    expect(mutant.drift).toHaveLength(0)
    expect(mutant.exitCode).toBe(0)
  })

  it("TEETH-reDerives — revert reDerives→()=>false ⇒ the mechanical fact is misclassified (golden RED)", () => {
    fix = makeFix()
    const rev = createRevIndex(fix.repoPath)

    // Real seams classify factB (grounded @B, re-derives at B) as MECHANICAL...
    const real = runLeg(fix, { resolveAnchorAt: rev.resolveAnchorAt, reDerives: rev.reDerives }, fix.A)
    expect(real.mechanical).toContain("F_B")
    expect(real.exitCode).toBe(2) // factA is still semantic

    // ...MUTANT: the v1 fail-closed `()=>false` ⇒ EVERY drifted fact reads semantic ⇒ the mechanical arm
    // empties and factB flips into semantic. reDerives is load-bearing (mechanical/semantic split).
    const mutant = runLeg(fix, { resolveAnchorAt: rev.resolveAnchorAt, reDerives: () => false }, fix.A)
    expect(mutant.mechanical).toHaveLength(0)
    expect(mutant.semantic).toContain("F_B")
  })
})
