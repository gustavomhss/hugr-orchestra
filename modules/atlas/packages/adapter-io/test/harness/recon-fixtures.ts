// @atlas/adapter-io — test/harness/recon-fixtures.ts  (SHARED recon drift-seam fixtures + helpers)
//
// A NON-test module (no describe/it): the throwaway A/B git repos, durable seeded projections, grounded
// advisory facts, and the exact leg-reconstruction (`runLeg`) shared by BOTH compose-recon test files
// (RECON-SEAMS and the N10 content-addressed classifier / rename / phantom-move suites). Moved verbatim
// from compose-recon.test.ts so the two suites stand on one byte-identical fixture surface.

import { execFileSync } from "node:child_process"
import { mkdtempSync, writeFileSync, mkdirSync, copyFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type { Hash, NodeKey, StructRef } from "@atlas/contracts"
import { bindReconcile } from "@atlas/knowledge"
import type { AdvisoryNode, CurrentNode, GroundedFact, StoreProjection } from "@atlas/knowledge"
import { createReconcile } from "@atlas/tools"
import type { ReconcileOut, Tool } from "@atlas/tools"
import { createRevIndex } from "../../src/rev-index.js"
import { createDiskStore } from "../../src/store.js"
import { createDriftSource } from "../../src/git-drift.js"
import { makeFixScip } from "./fix-scip.js"

export const QP = "src/unit.ts"
export const UNIT_A = "export function foo(name: string): string {\n  return `hi ${name}`;\n}\n"
export const UNIT_B = "export function foo(name: string): string {\n  return `hello there ${name}`;\n}\n" // body changed
export const RECONCILE = "atlas-reconcile" as Tool
export const CAS_REL = join(".atlas", "cas")

// N10 rename fixture — content-PRESERVING move: KEEP_BODY authored at src/keep.ts, `git mv`-d to
// src/moved.ts at HEAD with a byte-identical body (mirrors doctor-source.test.ts's KEEP_BODY pattern).
export const KEEP_QP = "src/keep.ts"
export const MOVED_QP = "src/moved.ts"
export const KEEP_BODY = "export function keep(x: number): number {\n  return x + 1;\n}\n"

export const g = (repo: string, args: readonly string[]): string =>
  execFileSync("git", args as string[], { cwd: repo, encoding: "utf8" }).trim()

// A minimal AdvisoryNode grounded at `qp`/`subtreeHash` — only required fields, none invented.
export function advisoryAt(id: string, subtreeHash: StructRef["subtreeHash"]): AdvisoryNode {
  return {
    kind: "advisory",
    id: id as NodeKey,
    tier: "T2",
    claimNorm: `claim anchored at ${QP} (${id})`,
    grounding: { entries: [{ anchor: { kind: "file", qualifiedPath: QP, subtreeHash }, path: QP }] },
    freshness: "FRESH",
    claims: [],
    authoring: "ADVISORY",
  }
}

// ── throwaway A/B repo + a durable projection seeded with two grounded facts ──────────────────────────
export interface Fix {
  readonly repoPath: string
  readonly A: string // full sha of commit A (unit structure v1)
  readonly B: string // full sha of commit B (unit structure v2)
  readonly factA: GroundedFact // grounded @A
  readonly factB: GroundedFact // grounded @B
  cleanup(): void
}

export function makeFix(): Fix {
  const repoPath = mkdtempSync(join(tmpdir(), "recon-seams-"))
  g(repoPath, ["init", "-q"])
  g(repoPath, ["config", "user.email", "t@t.t"])
  g(repoPath, ["config", "user.name", "T"])
  g(repoPath, ["config", "commit.gpgsign", "false"])
  mkdirSync(join(repoPath, "src"), { recursive: true })

  writeFileSync(join(repoPath, QP), UNIT_A)
  g(repoPath, ["add", "-A"])
  g(repoPath, ["commit", "-q", "-m", "A: author foo"])
  const A = g(repoPath, ["rev-parse", "HEAD"])

  writeFileSync(join(repoPath, QP), UNIT_B)
  g(repoPath, ["add", "-A"])
  g(repoPath, ["commit", "-q", "-m", "B: rewrite foo body"])
  const B = g(repoPath, ["rev-parse", "HEAD"])

  // A real `.atlas/index.scip` dump so the composition root's index build has one (wire.ts reads it).
  const scip = makeFixScip()
  mkdirSync(join(repoPath, ".atlas"), { recursive: true })
  copyFileSync(scip.scipPath, join(repoPath, ".atlas", "index.scip"))
  scip.cleanup()

  // Ground each fact at the ACTUAL unit structure of its rev (resolved via the same COMPOSE-C index).
  const rev = createRevIndex(repoPath)
  const factA = advisoryAt("F_A", rev.resolveAnchorAt(A, QP)!.subtreeHash)
  const factB = advisoryAt("F_B", rev.resolveAnchorAt(B, QP)!.subtreeHash)

  // Seed the DURABLE projection the way governed-emit does (invariant 6): `store.put` the WHOLE fact under
  // its content-hash, then persist a projection whose CurrentNode.contentHash IS that CAS key — so
  // composeRuntime's `driftFacts` reads the facts straight back out of CAS.
  const store = createDiskStore(join(repoPath, CAS_REL))
  const hA = store.put(factA as never) as string
  const hB = store.put(factB as never) as string
  const mk = (f: GroundedFact, h: string): CurrentNode => ({
    nodeKey: f.id as unknown as string,
    family: "advisory",
    contentHash: h,
    claims: [],
  })
  const projection: StoreProjection = {
    current: new Map([
      [factA.id as unknown as string, mk(factA, hA)],
      [factB.id as unknown as string, mk(factB, hB)],
    ]),
    cas: new Set([hA, hB]),
  }
  store.persistProjection(projection)

  return { repoPath, A, B, factA, factB, cleanup: () => rmSync(repoPath, { recursive: true, force: true }) }
}

// N10 — a content-PRESERVING rename fixture: commit A authors src/keep.ts (KEEP_BODY); commit B `git mv`s it
// to src/moved.ts (IDENTICAL body, old path DELETED at HEAD) ⇒ a moved-but-alive fact grounded at keep.ts @A.
export interface RenameFix {
  readonly repoPath: string
  readonly A: string // sha where the unit lives at src/keep.ts
  readonly B: string // HEAD: the unit lives at src/moved.ts (same body)
  readonly factKeep: GroundedFact // grounded at the keep.ts unit structure @A
  cleanup(): void
}

export function makeRenameFix(): RenameFix {
  const repoPath = mkdtempSync(join(tmpdir(), "recon-rename-"))
  g(repoPath, ["init", "-q"])
  g(repoPath, ["config", "user.email", "t@t.t"])
  g(repoPath, ["config", "user.name", "T"])
  g(repoPath, ["config", "commit.gpgsign", "false"])
  mkdirSync(join(repoPath, "src"), { recursive: true })

  writeFileSync(join(repoPath, KEEP_QP), KEEP_BODY)
  g(repoPath, ["add", "-A"])
  g(repoPath, ["commit", "-q", "-m", "A: author keep"])
  const A = g(repoPath, ["rev-parse", "HEAD"])

  // Pure rename: move the file, body byte-identical. The old path is gone at HEAD; the content survives.
  g(repoPath, ["mv", KEEP_QP, MOVED_QP])
  g(repoPath, ["commit", "-q", "-m", "B: rename keep -> moved (identical body)"])
  const B = g(repoPath, ["rev-parse", "HEAD"])

  const scip = makeFixScip()
  mkdirSync(join(repoPath, ".atlas"), { recursive: true })
  copyFileSync(scip.scipPath, join(repoPath, ".atlas", "index.scip"))
  scip.cleanup()

  // Ground the fact at the ACTUAL keep.ts unit structure @A (content-addressed subtreeHash).
  const rev = createRevIndex(repoPath)
  const factKeep = advisoryAt("F_keep", rev.resolveAnchorAt(A, KEEP_QP)!.subtreeHash)
  // Re-anchor the recorded grounding at src/keep.ts (advisoryAt hard-codes QP=src/unit.ts).
  const grounded: GroundedFact = {
    ...factKeep,
    grounding: {
      entries: [
        {
          anchor: {
            kind: "file",
            qualifiedPath: KEEP_QP,
            subtreeHash: factKeep.grounding.entries[0]!.anchor.subtreeHash,
          },
          path: KEEP_QP,
        },
      ],
    },
  }

  const store = createDiskStore(join(repoPath, CAS_REL))
  const h = store.put(grounded as never) as string
  const projection: StoreProjection = {
    current: new Map([
      [
        grounded.id as unknown as string,
        { nodeKey: grounded.id as unknown as string, family: "advisory", contentHash: h, claims: [] } as CurrentNode,
      ],
    ]),
    cas: new Set([h]),
  }
  store.persistProjection(projection)

  return { repoPath, A, B, factKeep: grounded, cleanup: () => rmSync(repoPath, { recursive: true, force: true }) }
}

// N10 phantom-move guard fixture — the recorded content DUPLICATED at an earlier-sorting path, the fact
// UNCHANGED at its own path across A→HEAD. Proves doctor≡reconcile agree (the narrowing suppresses a phantom).
export interface DupFix {
  readonly repoPath: string
  readonly A: string // the sha the fact was grounded at; keep.ts stays byte-identical through HEAD
  readonly factKeep: GroundedFact
  cleanup(): void
}

export function makeDupFix(): DupFix {
  const repoPath = mkdtempSync(join(tmpdir(), "recon-dup-"))
  g(repoPath, ["init", "-q"])
  g(repoPath, ["config", "user.email", "t@t.t"])
  g(repoPath, ["config", "user.name", "T"])
  g(repoPath, ["config", "commit.gpgsign", "false"])
  mkdirSync(join(repoPath, "src"), { recursive: true })
  // keep.ts + an EARLIER-sorting duplicate (aaa-dup.ts), byte-identical body ⇒ identical subtreeHash.
  writeFileSync(join(repoPath, "src", "aaa-dup.ts"), KEEP_BODY)
  writeFileSync(join(repoPath, KEEP_QP), KEEP_BODY)
  g(repoPath, ["add", "-A"])
  g(repoPath, ["commit", "-q", "-m", "A: keep + duplicate"])
  const A = g(repoPath, ["rev-parse", "HEAD"])
  // An UNRELATED second commit so HEAD != A while keep.ts stays byte-identical (the fact is intact in place).
  writeFileSync(join(repoPath, "README.md"), "x\n")
  g(repoPath, ["add", "-A"])
  g(repoPath, ["commit", "-q", "-m", "B: unrelated change"])

  const scip = makeFixScip()
  mkdirSync(join(repoPath, ".atlas"), { recursive: true })
  copyFileSync(scip.scipPath, join(repoPath, ".atlas", "index.scip"))
  scip.cleanup()

  const rev = createRevIndex(repoPath)
  const sh = rev.resolveAnchorAt(A, KEEP_QP)!.subtreeHash
  const grounded: GroundedFact = {
    ...advisoryAt("F_keep", sh),
    grounding: { entries: [{ anchor: { kind: "file", qualifiedPath: KEEP_QP, subtreeHash: sh }, path: KEEP_QP }] },
  }
  const store = createDiskStore(join(repoPath, CAS_REL))
  const h = store.put(grounded as never) as string
  store.persistProjection({
    current: new Map([
      [
        grounded.id as unknown as string,
        { nodeKey: grounded.id as unknown as string, family: "advisory", contentHash: h, claims: [] } as CurrentNode,
      ],
    ]),
    cas: new Set([h]),
  })
  return { repoPath, A, factKeep: grounded, cleanup: () => rmSync(repoPath, { recursive: true, force: true }) }
}

// Reconstruct the EXACT leg compose.ts wires, with the two drift seams injectable (for TEETH).
export function runLeg(
  fx: Fix,
  seams: {
    resolveAnchorAt: (rev: string, qp: string) => StructRef | undefined
    reDerives: (fact: GroundedFact, newSha: Hash) => boolean
  },
  mergeBase: string,
): ReconcileOut {
  const source = createDriftSource({
    repoPath: fx.repoPath,
    resolveAnchorAt: seams.resolveAnchorAt,
    facts: [fx.factA, fx.factB],
  })
  return createReconcile(source, { reconcile: bindReconcile(seams.reDerives) }).reconcile(mergeBase as Hash)
}
