// @atlas/adapter-io — test/git-drift.test.ts   (WP-9.2.5.DRIFT — EPIC-9, REQ-ADAPTER-9a/9b)
//
// Acceptance suite for the GROUND `DriftSource` (`createDriftSource`, ADAPT-GIT-2) over the SHARED
// `git-sbx` topology harness (test/harness/git-sbx.ts — CONSUMED, never redefined). Transcribes the two
// frozen goldens (docs/requirements/goldens-adapters.md:321-335):
//   • SCN-ADAPTER-9a-1 — the drifted anchor set == the `mb → topic` diff (greet flagged)          (happy)
//   • SCN-ADAPTER-9b-1 — drift baseline is the merge-base, not a fixed HEAD~1..HEAD window         (guard)
//
// `resolveAnchorAt` is the TEST's job (GROUND owns anchor RESOLUTION; the adapter only owns the
// merge-base-vs-HEAD diff). It resolves an anchor by `git show <rev>:<qp>`, builds a minimal FileTree,
// runs the real `build`, and reads the file node's `subtreeHash` — the same drift oracle production uses.

import { execFileSync } from "node:child_process"
import { describe, it, expect, afterEach } from "vitest"
import { build } from "@atlas/index"
import type { FileTree, IndexNode } from "@atlas/index"
import type { AdvisoryNode } from "@atlas/knowledge"
import type { Hash, NodeKey, StructRef } from "@atlas/contracts"
import { createDriftSource } from "../src/git-drift.js"
import { makeGitSbx } from "./harness/git-sbx.js"
import type { GitSbx } from "./harness/git-sbx.js"

let sbx: GitSbx | undefined
afterEach(() => {
  sbx?.cleanup()
  sbx = undefined
})

// ── the TEST-owned anchor resolver (GROUND's seam) ────────────────────────────────────────────────────
// A minimal nested FileTree for `qp` with the file's bytes AT `rev` (root '.', dir chain, leaf), fed to the
// real `build`; the spatial node keyed by `qp` carries the file-content `subtreeHash` (build.ts:29 — a
// leaf's rollup is `id({content})`), the exact drift oracle. `undefined` when the path is absent at `rev`.
function fileTreeFor(qp: string, content: string): FileTree {
  const segments = qp.split("/")
  let node: FileTree = { path: qp, children: [], content }
  for (let i = segments.length - 1; i >= 1; i--) {
    node = { path: segments.slice(0, i).join("/"), children: [node] }
  }
  return { path: ".", children: [node] }
}

function findByKey(node: IndexNode, key: string): IndexNode | undefined {
  if (node.key === key) return node
  for (const child of node.children) {
    const hit = findByKey(child, key)
    if (hit) return hit
  }
  return undefined
}

function makeResolveAnchorAt(repoPath: string) {
  return (rev: string, qp: string): StructRef | undefined => {
    let content: string
    try {
      content = execFileSync("git", ["show", `${rev}:${qp}`], { cwd: repoPath, encoding: "utf8" })
    } catch {
      return undefined // path absent at `rev`
    }
    const axes = build(fileTreeFor(qp, content), { documents: [] })
    const node = findByKey(axes.spatial, qp)
    return node ? { kind: "file", qualifiedPath: qp, subtreeHash: node.subtreeHash } : undefined
  }
}

// ── ONE fact grounded at the greet anchor (minimal AdvisoryNode; only required fields, none invented) ───
function advisoryAt(idStr: string, qp: string, subtreeHash: StructRef["subtreeHash"]): AdvisoryNode {
  return {
    kind: "advisory",
    id: idStr as NodeKey,
    tier: "T2",
    claimNorm: `claim anchored at ${qp}`,
    grounding: { entries: [{ anchor: { kind: "file", qualifiedPath: qp, subtreeHash }, path: qp }] },
    freshness: "FRESH",
    claims: [],
    authoring: "ADVISORY",
  }
}

function greetFact(mbUtilRef: StructRef): AdvisoryNode {
  return advisoryAt("F_greet", "src/util.ts", mbUtilRef.subtreeHash)
}

describe("createDriftSource — drift over a git merge-base (ADAPT-GIT-2)", () => {
  it("SCN-ADAPTER-9a-1 — the drifted anchor set == the mb→topic diff (greet flagged) [happy]", () => {
    sbx = makeGitSbx()
    const resolveAnchorAt = makeResolveAnchorAt(sbx.repoPath)
    const mbUtilRef = resolveAnchorAt(sbx.mb, "src/util.ts")
    expect(mbUtilRef).toBeDefined()
    const F_greet = greetFact(mbUtilRef!)

    const src = createDriftSource({ repoPath: sbx.repoPath, resolveAnchorAt, facts: [F_greet] })
    const pairs = src.driftAt(sbx.mb as Hash)

    // EXACTLY one pair, for src/util.ts, carrying the fact + the topic tip as the new @sha.
    expect(pairs).toHaveLength(1)
    const p = pairs[0]!
    expect(p.anchorWas.qualifiedPath).toBe("src/util.ts")
    expect(p.anchorNow.qualifiedPath).toBe("src/util.ts")
    expect(p.drifted.fact).toBe(F_greet)
    expect(String(p.drifted.newSha)).toBe(sbx.topicTip)
    expect(p.anchorWas.subtreeHash).not.toBe(p.anchorNow.subtreeHash)

    // TEETH — the two-tip / `main` mutant: resolving `now` at mainTip instead of HEAD/topic. greet is
    // UNCHANGED on `main`, so mb→main subtreeHashes are EQUAL → the mutant yields 0 pairs → 9a flips.
    const wasMb = resolveAnchorAt(sbx.mb, "src/util.ts")!
    const nowMain = resolveAnchorAt(sbx.mainTip, "src/util.ts")!
    expect(wasMb.subtreeHash).toBe(nowMain.subtreeHash)
  })

  it("SCN-ADAPTER-9a-1 (exclusion) — a resolvable but NON-drifting anchor is excluded; the predicate is subtreeHash≠, not resolvable [guard]", () => {
    sbx = makeGitSbx()
    const resolveAnchorAt = makeResolveAnchorAt(sbx.repoPath)

    // `src/app.ts` is byte-identical mb→topic (only util.ts=A and service.py=X are rewritten on topic) —
    // a genuine resolvable-but-UNCHANGED anchor. Sanity-check it truly does not drift.
    const appMb = resolveAnchorAt(sbx.mb, "src/app.ts")
    expect(appMb).toBeDefined()
    expect(appMb!.subtreeHash).toBe(resolveAnchorAt(sbx.topicTip, "src/app.ts")!.subtreeHash)

    const facts = [
      greetFact(resolveAnchorAt(sbx.mb, "src/util.ts")!), // drifts → emitted
      advisoryAt("F_app", "src/app.ts", appMb!.subtreeHash), // resolvable, unchanged → excluded
      advisoryAt("F_ghost", "src/ghost.ts", appMb!.subtreeHash), // path absent at every rev → unresolvable → excluded, no throw
    ]
    const src = createDriftSource({ repoPath: sbx.repoPath, resolveAnchorAt, facts })
    const pairs = src.driftAt(sbx.mb as Hash)

    // ONLY greet drifted. TEETH: dropping the `was.subtreeHash !== now.subtreeHash` guard (emit a pair for
    // every resolvable fact) would ADD `src/app.ts` here → the set ≠ the mb→topic diff → this flips.
    // F_ghost also proves totality: an anchor unresolvable at a rev yields no pair and never throws.
    expect(pairs.map((p) => p.anchorNow.qualifiedPath)).toEqual(["src/util.ts"])
  })

  it("SCN-ADAPTER-9b-1 — drift baseline is the merge-base, not a HEAD~1..HEAD window [guard]", () => {
    sbx = makeGitSbx()
    const resolveAnchorAt = makeResolveAnchorAt(sbx.repoPath)
    const F_greet = greetFact(resolveAnchorAt(sbx.mb, "src/util.ts")!)

    const src = createDriftSource({ repoPath: sbx.repoPath, resolveAnchorAt, facts: [F_greet] })
    const pairs = src.driftAt(sbx.mb as Hash)

    // greet IS flagged because the baseline is the merge-base — proving A predates any recent window.
    // The shared X (api/service.py) is NOT an anchored fact, so `driftAt` never inspects it: the set is
    // exactly {src/util.ts}, never the shared bump.
    expect(pairs.map((p) => p.anchorNow.qualifiedPath)).toEqual(["src/util.ts"])

    // TEETH — the fixed-window `HEAD~1..HEAD` mutant. On `topic`, A (greet) is at HEAD~1 and X
    // (service.py) is at HEAD, so greet is byte-identical across HEAD~1→HEAD. A window-baselined adapter
    // resolves `was` at HEAD~1, finds greet unchanged, and MISSES the real drift → 9b flips.
    const headTilde1 = execFileSync("git", ["rev-parse", "HEAD~1"], { cwd: sbx.repoPath, encoding: "utf8" }).trim()
    const greetAtWindow = resolveAnchorAt(headTilde1, "src/util.ts")!
    const greetAtHead = resolveAnchorAt(sbx.topicTip, "src/util.ts")!
    expect(greetAtWindow.subtreeHash).toBe(greetAtHead.subtreeHash)
  })

  // ── N10 · pure-rename detection (the widening half) ───────────────────────────────────────────────────
  // A pure rename DELETES the recorded qualifiedPath at HEAD ⇒ the path-keyed `now` is undefined ⇒ the OLD
  // logic emitted NO pair (the moved-but-alive fact was silently dropped). With the content resolver wired,
  // `driftAt` surfaces it with `anchorNow` = the RELOCATED path. `resolveAnchorAt`/`resolveBySubtreeAt` are
  // the TEST's job (GROUND owns resolution); the real `makeGitSbx` repo supplies the live HEAD (topicSha).
  it("SCN-N10-detect — a pure rename (old path gone) emits a pair with the RELOCATED anchorNow", () => {
    sbx = makeGitSbx()
    const KEEP = "src/keep.ts"
    const MOVED = "src/moved.ts"
    const SUB = "sh-keep" as StructRef["subtreeHash"] // the recorded content hash (moves path, not bytes)

    // The fact recorded its grounding at src/keep.ts@mb; at HEAD the path is gone but the content relocated.
    const fact = advisoryAt("F_moved", KEEP, SUB)
    const resolveAnchorAt = (rev: string, qp: string): StructRef | undefined =>
      rev === sbx!.mb && qp === KEEP ? { kind: "file", qualifiedPath: KEEP, subtreeHash: SUB } : undefined
    const resolveBySubtreeAt = (rev: string, subtreeHash: string): StructRef | undefined =>
      rev === sbx!.topicTip && subtreeHash === String(SUB)
        ? { kind: "file", qualifiedPath: MOVED, subtreeHash: SUB }
        : undefined

    // WITH the content resolver ⇒ the rename is surfaced, anchored at the new location.
    const src = createDriftSource({ repoPath: sbx.repoPath, resolveAnchorAt, resolveBySubtreeAt, facts: [fact] })
    const pairs = src.driftAt(sbx.mb as Hash)
    expect(pairs).toHaveLength(1)
    expect(pairs[0]!.anchorWas.qualifiedPath).toBe(KEEP)
    expect(pairs[0]!.anchorNow.qualifiedPath).toBe(MOVED) // relocated (re-groundable to the new path)
    expect(String(pairs[0]!.drifted.newSha)).toBe(sbx.topicTip)

    // TEETH — drop the content resolver (the PRE-FIX detection) ⇒ path-keyed `now` is undefined ⇒ NO pair;
    // the moved fact is silently dropped. The widening is load-bearing.
    const preFix = createDriftSource({ repoPath: sbx.repoPath, resolveAnchorAt, facts: [fact] })
    expect(preFix.driftAt(sbx.mb as Hash)).toHaveLength(0)
  })

  it("SCN-N10-guard — an UNMOVED fact whose content ALSO exists at a DUPLICATE (earlier-sorting) path emits ZERO pairs (no PHANTOM move)", () => {
    sbx = makeGitSbx()
    const APP = "src/app.ts"
    const DUP = "src/aaa-copy.ts" // sorts EARLIER than src/app.ts — the worst case for a preorder resolver
    const resolveAnchorAt = makeResolveAnchorAt(sbx.repoPath)
    const appMb = resolveAnchorAt(sbx.mb, APP)! // resolvable + byte-identical mb→topic ⇒ fact intact in place
    // The recorded content ALSO lives at a DUPLICATE path at HEAD — a byte-for-byte copy elsewhere. The stub
    // below deliberately models the WORST-CASE resolver: one that answers a multi-match with the first
    // preorder node (the duplicate, at the earlier path), whose qualifiedPath !== qp — so the `!== qp` guard
    // would NOT catch it. Only the narrowing (the recorded path STILL resolves ⇒ `continue` BEFORE the
    // content lookup) suppresses the phantom rename.
    //
    // The SHIPPED resolver no longer behaves this way — `resolveBySubtreeAt` (rev-index.ts) now REFUSES a
    // genuine multi-match outright. This test keeps the hostile stub ON PURPOSE: git-drift's narrowing must
    // hold on its own, not because its collaborator happens to be conservative. Defence in depth, so a future
    // relaxation of the resolver cannot silently re-open the phantom-move path.
    const resolveBySubtreeAt = (_rev: string, subtreeHash: string): StructRef | undefined =>
      subtreeHash === String(appMb.subtreeHash)
        ? { kind: "file", qualifiedPath: DUP, subtreeHash: appMb.subtreeHash }
        : undefined

    const fact = advisoryAt("F_app", APP, appMb.subtreeHash)
    const src = createDriftSource({ repoPath: sbx.repoPath, resolveAnchorAt, resolveBySubtreeAt, facts: [fact] })
    // TEETH (red→green): PRE-narrowing, `now` defined fell through to resolveBySubtreeAt → the DUP at an
    // earlier path passed `!== qp` → a PHANTOM {app.ts → aaa-copy.ts} pair (len 1), diverging from doctor
    // (reDerives FRESH ⇒ not drifted). The narrowing makes this ZERO — doctor≡reconcile restored.
    expect(src.driftAt(sbx.mb as Hash)).toHaveLength(0)
  })
})
