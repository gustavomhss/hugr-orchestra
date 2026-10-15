// @atlas/adapter-io — test/compose-recon-n10.test.ts  (RECON-N10 — content-addressed classifier, end-to-end)
//
// The N10 half of the compose-recon drift-seam suite (shared fixtures in ./harness/recon-fixtures.js). It
// covers the content-ADDRESSED classifier: a content-preserving `git mv` must be DETECTED (the moved fact is
// surfaced with anchorNow at the new path) and classified MECHANICAL (moved-but-alive ⇒ auto-re-groundable,
// exitCode 0, never a semantic block). TEETH-N10 pins the two seams load-bearing by reverting to the pre-fix
// (path-keyed) predicate with no content resolver — the moved fact is silently DROPPED. The guard suite
// (RECON-N10-guard) proves a mere DUPLICATE of an unmoved fact's content raises NO phantom move, and that
// reconcile and doctor agree on the empty drift-set (the single-source-of-truth invariant N10 rests on).

import { describe, it, expect, afterEach } from "vitest"
import type { Hash } from "@atlas/contracts"
import { bindReconcile } from "@atlas/knowledge"
import { createReconcile } from "@atlas/tools"
import type { ReconcileOut } from "@atlas/tools"
import { composeRuntime } from "../src/compose.js"
import { createRevIndex } from "../src/rev-index.js"
import { createDriftSource } from "../src/git-drift.js"
import {
  RECONCILE,
  MOVED_QP,
  makeRenameFix,
  makeDupFix,
  type RenameFix,
  type DupFix,
} from "./harness/recon-fixtures.js"

let renameFix: RenameFix | undefined
let dupFix: DupFix | undefined
afterEach(() => {
  renameFix?.cleanup()
  renameFix = undefined
  dupFix?.cleanup()
  dupFix = undefined
})

describe("RECON-N10 — a content-preserving RENAME is MECHANICAL (content-addressed classifier + detection)", () => {
  it("SCN-N10-1 — moved-but-alive fact ⇒ mechanical, anchorNow=src/moved.ts, NOT semantic, exitCode 0", () => {
    renameFix = makeRenameFix()
    const { handler } = composeRuntime(renameFix.repoPath)

    // Drive reconcile at mergeBase=A (unit @ src/keep.ts) vs topic=HEAD=B (unit @ src/moved.ts, same body).
    const v = handler.handle(RECONCILE, { mergeBase: renameFix.A as Hash })
    expect(v.ok).toBe(true)
    const out = v.data as ReconcileOut

    // The rename is DETECTED (secondary fix) and classified MECHANICAL (primary content-addressed fix).
    expect(out.drift).toHaveLength(1)
    expect(out.drift[0]!.anchorNow.qualifiedPath).toBe(MOVED_QP) // relocated to the new path
    expect(out.mechanical).toContain("F_keep") // moved-but-alive ⇒ auto-re-groundable
    expect(out.semantic).not.toContain("F_keep") // NOT a semantic rot
    expect(out.semantic).toHaveLength(0)
    expect(out.exitCode).toBe(0) // a rename must NOT block (exit 0), the sole drift is mechanical
    expect(out.reauthorCount).toBe(0)
  })

  it("TEETH-N10 — the PRE-FIX seams (path-keyed reDerives + no content resolver) DROP the moved fact (RED)", () => {
    renameFix = makeRenameFix()
    const rev = createRevIndex(renameFix.repoPath)

    // PRE-FIX detection: createDriftSource WITHOUT the content resolver — the old path is gone at HEAD, so
    // `now` is undefined and NO pair is emitted ⇒ the moved fact is silently dropped (drift empty, exit 0
    // but for the WRONG reason: it was never seen, never surfaced as mechanical or semantic).
    const preFixSource = createDriftSource({
      repoPath: renameFix.repoPath,
      resolveAnchorAt: rev.resolveAnchorAt,
      facts: [renameFix.factKeep],
    })
    const preFix = createReconcile(preFixSource, {
      reconcile: bindReconcile(rev.reDerives), // path-keyed predicate (the pre-fix classifier)
    }).reconcile(renameFix.A as Hash)
    expect(preFix.drift).toHaveLength(0) // DROPPED — the bug: a rename never even reaches the classifier
    expect(preFix.mechanical).toHaveLength(0)

    // POST-FIX detection: wire the content resolver ⇒ the rename IS surfaced with anchorNow=src/moved.ts,
    // and the content-addressed classifier (resolveBySubtreeAt) makes it MECHANICAL.
    const postFixSource = createDriftSource({
      repoPath: renameFix.repoPath,
      resolveAnchorAt: rev.resolveAnchorAt,
      resolveBySubtreeAt: rev.resolveBySubtreeAt,
      facts: [renameFix.factKeep],
    })
    const postFix = createReconcile(postFixSource, {
      reconcile: bindReconcile((fact, newSha) => {
        const a = fact.grounding.entries[0]?.anchor
        return a !== undefined && rev.resolveBySubtreeAt(String(newSha), String(a.subtreeHash)) !== undefined
      }),
    }).reconcile(renameFix.A as Hash)
    expect(postFix.drift).toHaveLength(1)
    expect(postFix.drift[0]!.anchorNow.qualifiedPath).toBe(MOVED_QP)
    expect(postFix.mechanical).toContain("F_keep")
    expect(postFix.exitCode).toBe(0)
  })
})

describe("RECON-N10-guard — an UNMOVED fact with a DUPLICATE of its content ⇒ NO phantom move (doctor≡reconcile)", () => {
  it("SCN-N10-dup — reconcile emits ZERO drift AND doctor reads not-drifted (single source of truth)", () => {
    dupFix = makeDupFix()
    const { handler, doctorSource } = composeRuntime(dupFix.repoPath)

    // keep.ts is byte-identical A→HEAD ⇒ intact in place ⇒ the narrowing `continue`s BEFORE the content
    // lookup ⇒ the duplicate at src/aaa-dup.ts is NEVER mistaken for a rename.
    const out = handler.handle(RECONCILE, { mergeBase: dupFix.A as Hash }).data as ReconcileOut
    expect(out.drift).toHaveLength(0)
    expect(out.mechanical).toHaveLength(0)
    expect(out.semantic).toHaveLength(0)
    expect(out.exitCode).toBe(0)

    // doctor AGREES: the recorded grounding re-derives FRESH at HEAD ⇒ NOT drifted (`undefined`). The two
    // drift-sets coincide — the single-source-of-truth invariant N10 rests on.
    expect(doctorSource.drift(String(dupFix.factKeep.id))).toBeUndefined()
  })
})
