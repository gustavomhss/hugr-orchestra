// @atlas/adapter-io — test/rev-index-content-resolve.test.ts  (COMPOSE-C — the CONTENT-addressed reader)
//
// Two fail-OPEN defects in the arbitrary-rev readers, both reproduced on the base commit:
//
//  (A) THE EMPTY SENTINEL ANSWERS FOR A REV THAT DOES NOT EXIST. A failed checkout falls back to
//      `EMPTY_AXES` (rev-index.ts) — a REAL built snapshot of an empty tree, indistinguishable from a rev
//      that genuinely has one. Querying it for the empty ROOT hash therefore returned a POSITIVE
//      `{kind:'repo', qualifiedPath:'.'}`, so a checkout FAILURE re-derived an anchor onto the repo root and
//      reconcile/doctor read that as MECHANICAL (auto-re-groundable). This is the sibling of finding #73 —
//      the same masquerade, in the content-addressed reader instead of the transient-retry path.
//      The fix keys on PROVENANCE (did this rev's checkout succeed?), never on the hash VALUE — so a rev
//      that is genuinely empty still resolves, which is the last case here.
//
//  (B) A MULTI-MATCH SILENTLY PICKED THE FIRST PREORDER NODE. `resolveBySubtreeAt` licenses an automatic
//      re-ground: compose.ts/doctor-source.ts read `!== undefined` as MECHANICAL, and git-drift.ts reports
//      the returned `qualifiedPath` as the anchor's NEW location. With two byte-identical files
//      (`__init__.py`, `mod.rs`, a vendored copy) the content resolves at ≥2 paths and there is no unique
//      correct target, so picking preorder-first binds the fact to an ARBITRARY one — a wrong anchor that
//      then reads FRESH forever. Genuine ambiguity is REFUSED (⇒ semantic ⇒ human), never guessed.
//
// NOTE the dedup that makes (B) sound: `build` emits the spatial and territory axes over the SAME tree, so
// EVERY file matches at least twice across axes. Ambiguity is therefore counted in DISTINCT qualifiedPaths,
// not raw node hits — counting hits would refuse every file and disable the mechanical arm entirely.

import { execFileSync } from "node:child_process"
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, it, expect, afterEach } from "vitest"
import { build } from "@atlas/index"
import { createRevIndex } from "../src/rev-index.js"

const BAD_REV = "no-such-rev-deadbeef"
const DUP = 'VERSION = "1.0"\n' // authored at TWO paths — byte-identical, so one subtreeHash, two homes
const UNIQ = "only-here\n"

/** The empty-tree root hash — the value `EMPTY_AXES.spatial.subtreeHash` carries (rev-index.ts). Derived
 *  from the frozen `build`, never pinned as a literal, so a legitimate re-key of the fold cannot rot it. */
const EMPTY_ROOT = String(build({ path: ".", children: [] }, { documents: [] }).spatial.subtreeHash)

const g = (repo: string, args: readonly string[]): string =>
  execFileSync("git", args as string[], { cwd: repo, encoding: "utf8" }).trim()

interface Sandbox {
  readonly repoPath: string
  readonly A: string
  cleanup(): void
}

/** A repo whose commit A holds two byte-identical files at different paths, plus one unique file. */
function makeDupRepo(): Sandbox {
  const repoPath = mkdtempSync(join(tmpdir(), "revidx-dup-"))
  g(repoPath, ["init", "-q"])
  g(repoPath, ["config", "user.email", "t@t.t"])
  g(repoPath, ["config", "user.name", "T"])
  g(repoPath, ["config", "commit.gpgsign", "false"])
  mkdirSync(join(repoPath, "pkg_a"), { recursive: true })
  mkdirSync(join(repoPath, "pkg_b"), { recursive: true })
  writeFileSync(join(repoPath, "pkg_a/__init__.py"), DUP)
  writeFileSync(join(repoPath, "pkg_b/__init__.py"), DUP)
  writeFileSync(join(repoPath, "unique.txt"), UNIQ)
  g(repoPath, ["add", "-A"])
  g(repoPath, ["commit", "-q", "-m", "A"])
  return {
    repoPath,
    A: g(repoPath, ["rev-parse", "HEAD"]),
    cleanup: () => rmSync(repoPath, { recursive: true, force: true }),
  }
}

let sbx: Sandbox | undefined
afterEach(() => {
  sbx?.cleanup()
  sbx = undefined
})

describe("rev-index — a failed checkout must not ANSWER (the EMPTY sentinel fails open)", () => {
  it("resolveBySubtreeAt on a bad rev refuses the empty-root hash [teeth: answer from EMPTY_AXES ⇒ RED]", () => {
    sbx = makeDupRepo()
    const rev = createRevIndex(sbx.repoPath)
    // The rev does not exist, so NOTHING re-derives in it — least of all the repo ROOT.
    expect(rev.resolveBySubtreeAt(BAD_REV, EMPTY_ROOT)).toBeUndefined()
  })

  it("resolveAnchorAt on a bad rev refuses the repo root [teeth: answer from EMPTY_AXES ⇒ RED]", () => {
    sbx = makeDupRepo()
    const rev = createRevIndex(sbx.repoPath)
    // Same masquerade in the PATH reader: '.' is a key that exists in the empty sentinel.
    expect(rev.resolveAnchorAt(BAD_REV, ".")).toBeUndefined()
  })

  it("a rev that is GENUINELY empty still resolves — the guard keys on provenance, not on the hash", () => {
    const repoPath = mkdtempSync(join(tmpdir(), "revidx-empty-"))
    sbx = { repoPath, A: "", cleanup: () => rmSync(repoPath, { recursive: true, force: true }) }
    g(repoPath, ["init", "-q"])
    g(repoPath, ["config", "user.email", "t@t.t"])
    g(repoPath, ["config", "user.name", "T"])
    g(repoPath, ["config", "commit.gpgsign", "false"])
    g(repoPath, ["commit", "-q", "--allow-empty", "-m", "empty tree"])
    const emptyRev = g(repoPath, ["rev-parse", "HEAD"])

    const rev = createRevIndex(repoPath)
    // The checkout SUCCEEDS, so the empty snapshot is the rev's HONEST content and must still answer.
    const root = rev.resolveAnchorAt(emptyRev, ".")
    expect(root).toBeDefined()
    expect(root!.kind).toBe("repo")
    // MUTANT: a guard that blocked the empty-root HASH (rather than the failed REV) would flip this.
  })
})

describe("rev-index — a genuine multi-match is refused, never guessed", () => {
  it("two byte-identical files ⇒ resolveBySubtreeAt refuses [teeth: return first preorder hit ⇒ RED]", () => {
    sbx = makeDupRepo()
    const rev = createRevIndex(sbx.repoPath)

    const a = rev.resolveAnchorAt(sbx.A, "pkg_a/__init__.py")
    const b = rev.resolveAnchorAt(sbx.A, "pkg_b/__init__.py")
    expect(String(a!.subtreeHash)).toBe(String(b!.subtreeHash)) // one content, two homes

    // There is no unique correct re-ground target, so the honest answer is "I cannot resolve this".
    expect(rev.resolveBySubtreeAt(sbx.A, String(a!.subtreeHash))).toBeUndefined()
  })

  it("a UNIQUE content still resolves, despite matching in both the spatial and territory axes", () => {
    sbx = makeDupRepo()
    const rev = createRevIndex(sbx.repoPath)

    const u = rev.resolveAnchorAt(sbx.A, "unique.txt")
    const hit = rev.resolveBySubtreeAt(sbx.A, String(u!.subtreeHash))
    expect(hit).toBeDefined()
    expect(hit!.qualifiedPath).toBe("unique.txt")
    // MUTANT: counting RAW axis hits instead of DISTINCT qualifiedPaths refuses this too → flips.
  })
})
