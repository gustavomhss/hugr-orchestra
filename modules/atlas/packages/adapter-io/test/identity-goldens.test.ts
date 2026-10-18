// @atlas/adapter-io — test/identity-goldens.test.ts  (#104: PINNED goldens for `nodeKey` + the UNIT LEAF)
//
// ╔══════════════════════════════════════════════════════════════════════════════════════════════════════╗
// ║  A CHANGE HERE IS A MIGRATION EVENT, NOT A TEST TO UPDATE.                                            ║
// ║                                                                                                       ║
// ║  `nodeKey` is a stored fact's PRIMARY KEY — it is the map key of `StoreProjection.current`, the thing  ║
// ║  `sameAs` edges point at, the thing `deriveSubsumes` relates. Move it and every row in every store is  ║
// ║  orphaned from its own history: an update to an existing fact mints a NEW node instead of updating the ║
// ║  old one, so the store silently grows a duplicate of everything.                                       ║
// ║                                                                                                       ║
// ║  The UNIT-LEAF hash is the other end of the same rope: it is what a symbol-grounded fact records as    ║
// ║  its anchor, and what the drift oracle compares against to answer FRESH or DRIFTED.                    ║
// ║                                                                                                       ║
// ║  The correct response to a RED here is NEVER to paste in the new value. It is:                         ║
// ║    1. Decide whether the re-key is worth it. It costs every user a full re-derive.                     ║
// ║    2. If it is: BUMP `IDENTITY_SCHEMA` in `src/identity-schema.ts`, so an existing store is DETECTED   ║
// ║       and refused with a legible reason instead of silently mis-read (#112).                           ║
// ║    3. Update the pin in the SAME commit as the bump, and name what moved in the message.               ║
// ╚══════════════════════════════════════════════════════════════════════════════════════════════════════╝
//
// ── WHY THIS FILE IS IN adapter-io AND NOT IN index/knowledge ────────────────────────────────────────────
// Two of the four load-bearing digests can only be pinned from here, and neither could be pinned where it is
// produced without inverting the layer DAG:
//   · `nodeKey` lives in `@atlas/knowledge` (L4). `@atlas/index` (L2) may not import it.
//   · the UNIT-LEAF hash is only reachable END TO END — a real git repo → `walkFileTree` → `foldAstUnits`
//     (tree-sitter) → `build` — and `walkFileTree`/`foldAstUnits` live in THIS package, above both.
// adapter-io sits in the outer ring above every core layer (harness/gates/layer-guard.mjs `RING_ORDER`), so
// it is the one place both are legally in scope.
//
// ── WHY THE UNIT LEAF IS PINNED THROUGH THE WHOLE PIPELINE, NOT THROUGH `foldNodeHash` ───────────────────
// The value below is what actually ends up in a user's `.atlas` store, and it is a function of FOUR things
// that can each move independently: the tree-sitter parse (which node types count as items/blocks), the
// `unitPath` mint (`::<kind>:<ordinal>[:<name>]`), the key escape, and the fold. A pin taken at
// `foldNodeHash` would be blind to the first three — and the first three are exactly what `f2a8659` changed.

import { describe, it, expect, beforeAll, afterEach } from "vitest"
import { execFileSync } from "node:child_process"
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { build } from "@atlas/index"
import type { IndexNode } from "@atlas/index"
import { nodeKey } from "@atlas/knowledge"
import type { Candidate } from "@atlas/knowledge"
import { initAst, foldAstUnits } from "../src/ast.js"
import { walkFileTree } from "../src/fs.js"

/** The remediation, attached to every assertion so a RED reads as an instruction rather than a diff. */
const MIGRATION =
  "MIGRATION EVENT — this value is the identity of rows in real on-disk stores. Do NOT paste the new value: " +
  "bump `IDENTITY_SCHEMA` in packages/adapter-io/src/identity-schema.ts in the SAME commit (#112), or every " +
  "existing store silently reads DRIFTED (or silently duplicates every fact) with no explanation."

// ── THE `nodeKey` FIXTURE. Every field that enters the preimage is spelled out. ───────────────────────────
// KNOW-15b/15c: advisory = hash(primaryAnchorId ‖ slot); predicate = hash(primaryAnchorId ‖ slot ‖
// normalize(check)). The anchor is a REAL current-format sub-file key, because `primaryAnchorId` derives it
// from the grounding's anchor paths — so this pin also covers `deepestCommonUnit`'s segmentation on `::`.
const ANCHOR = "src/acct.ts::function_declaration:0:isAdmin"
const ADVISORY = {
  claim: "the write door is the only writer",
  slot: "invariant",
  grounding: { entries: [{ anchor: { kind: "symbol", qualifiedPath: ANCHOR, subtreeHash: "sh" } }] },
} as unknown as Candidate
// The `check` body carries LEADING AND TRAILING whitespace on purpose: `normalizeCheck` trims and
// NFC-normalizes it, so this pin covers that normalization too. A predicate that stopped trimming would
// re-key every predicate node in the product, and nothing else in the suite would see it.
const PREDICATE = { ...ADVISORY, check: { kind: "assertion", expr: "  a === b  " } } as unknown as Candidate

// ── THE UNIT-LEAF FIXTURE. One bare `function` declaration at byte 0 of one tracked file. ────────────────
const SRC = "function isAdmin() { return false; }\n"
const UNIT_KEY = "src/acct.ts::function_declaration:0:isAdmin"

interface Fixture {
  readonly repoPath: string
  cleanup(): void
}

function repo(): Fixture {
  const repoPath = mkdtempSync(join(tmpdir(), "atlas-goldens-"))
  const git = (...args: string[]): string => execFileSync("git", ["-C", repoPath, ...args], { encoding: "utf8" })
  git("init", "-q")
  // Obviously-synthetic identity: `.invalid` is the RFC 2606 reserved TLD and can never name a real mailbox.
  git("config", "user.email", "fixture@example.invalid")
  git("config", "user.name", "synthetic-fixture")
  git("config", "commit.gpgsign", "false")
  mkdirSync(join(repoPath, "src"), { recursive: true })
  writeFileSync(join(repoPath, "src/acct.ts"), SRC)
  git("add", "-A")
  git("commit", "-q", "-m", "the pinned fixture")
  return { repoPath, cleanup: () => rmSync(repoPath, { recursive: true, force: true }) }
}

function tryAt(node: IndexNode, key: string): IndexNode | undefined {
  if (node.key === key) return node
  for (const c of node.children) {
    const hit = tryAt(c, key)
    if (hit !== undefined) return hit
  }
  return undefined
}

let live: Fixture | undefined
afterEach(() => {
  live?.cleanup()
  live = undefined
})

beforeAll(async () => {
  // Without this `foldAstUnits` is a NO-OP and the tree has no `::` node at all — the pin would then be
  // quantifying over a region it cannot reach, which is the vacuous-test class this repo keeps finding. The
  // assertion below that the unit node EXISTS is what turns that from a hope into a measurement.
  await initAst()
})

describe("#104 — PINNED IDENTITY GOLDENS: `nodeKey` (a RED here is a MIGRATION EVENT)", () => {
  it("nodeKey — an ADVISORY: hash(primaryAnchorId ‖ slot)", () => {
    expect(String(nodeKey(ADVISORY)), MIGRATION).toBe(
      "b171fa73533619ac3c68883a2f89a1dd37889ba6a5818793072d3bd7d0ebd903",
    )
  })

  it("nodeKey — a PREDICATE: the same anchor and slot, plus normalize(check)", () => {
    expect(String(nodeKey(PREDICATE)), MIGRATION).toBe(
      "ad71ec58f56b49398b338c6ff29487397abe5f98f110afb011491605c361b299",
    )
    // The families must not collide: an advisory and a predicate at the same (anchor, slot) are different
    // nodes. Pinning both values makes that a fact about two numbers rather than a fact about itself.
    expect(String(nodeKey(PREDICATE))).not.toBe(String(nodeKey(ADVISORY)))
  })

  // The identity leg is BODY-WORDING INDEPENDENT by design (KNOW-15b: an advisory's key folds the anchor and
  // the slot, never the claim text). That is asserted relationally elsewhere; pinning the reworded variant
  // to the SAME literal is what makes it survive a re-key of the preimage rather than move with it.
  it("nodeKey — rewording the claim body does NOT move the advisory key (pinned, not merely equal)", () => {
    const reworded = {
      ...(ADVISORY as unknown as Record<string, unknown>),
      claim: "completely different words",
    } as unknown as Candidate
    expect(String(nodeKey(reworded)), MIGRATION).toBe(
      "b171fa73533619ac3c68883a2f89a1dd37889ba6a5818793072d3bd7d0ebd903",
    )
  })
})

describe("#104 — PINNED IDENTITY GOLDENS: the UNIT LEAF, end to end (a RED here is a MIGRATION EVENT)", () => {
  it("the sub-file anchor KEY and its subtreeHash, straight off the production pipeline", () => {
    live = repo()
    const axes = build(foldAstUnits(walkFileTree(live.repoPath)), { documents: [] })
    const unit = tryAt(axes.spatial, UNIT_KEY)
    // NOT VACUOUS: the region this golden quantifies over must actually exist. Without `initAst`, without a
    // git commit, or after a change to which node types are folded as items, this is `undefined` and the
    // pin below would never run.
    expect(unit, `no sub-file unit \`${UNIT_KEY}\` in the built axis — this golden reaches nothing`).toBeDefined()
    // THE ANCHOR KEY FORMAT ITSELF. `f2a8659` changed this from `::<start>:<kind>:<name>` and nothing pinned
    // it, so every stored anchor in every store became unresolvable in silence. It is pinned now.
    expect(unit!.key, MIGRATION).toBe("src/acct.ts::function_declaration:0:isAdmin")
    expect(String(unit!.subtreeHash), MIGRATION).toBe(
      "9329756703debfe546e8b6f1af0249af4deaa734ef470c6a56cab7f577c84233",
    )
    // The PARENT file node too: `f2a8659`'s own summary says unit leaf hashes HELD while every ancestor of a
    // parsed unit moved. The leaf pin alone would have been blind to exactly that commit.
    expect(String(tryAt(axes.spatial, "src/acct.ts")!.subtreeHash), MIGRATION).toBe(
      "ce5f6159c52208ae31e4313a56a5e14bcb6d7cbd6567aa854bd725c0368de1ed",
    )
  })
})
