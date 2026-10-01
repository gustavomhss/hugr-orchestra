// @atlas/adapter-io — test/fs-tracked-symlink.test.ts   (REQ-ADAPTER-1b/1d — the tracked-symlink rule)
//
// The walker used to `readFileSync` every tracked path, which FOLLOWS a symlink: a tracked
// `src/config.ts -> /etc/passwd` put the password file's bytes into the skeleton — the same defect class as
// the two doors that now ask `isContainedIn` (a path decision made about the HOST, not about the repo).
// The rule pinned here is git's own: a mode-120000 entry contributes THE STORED LINK TEXT and the target on
// disk is never opened. Each case names the mutation it kills.
//
//   • link-text        — a tracked link's `content` is the target PATH, exactly            [re-readFileSync the path]
//   • no-passwd        — /etc/passwd's bytes are nowhere in the tree                       [follow the link]
//   • no-unit-key      — a mode-120000 leaf mints NO `::` unit key                         [drop the fold exclusion]
//   • symlink-free-noop— a repo with no links walks byte-identically (pinned digests)      [any drift in `-s -z` parsing]
//   • broken/dir-link  — both are mode-120000 like any other (a CHANGE: they used to be dropped
//                        by ACCIDENT, via the EISDIR/ENOENT swallow in `readFileOrSkip`)

import { describe, it, expect, afterEach, beforeAll } from "vitest"
import { createHash } from "node:crypto"
import { execFileSync } from "node:child_process"
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { build } from "@atlas/index"
import type { FileTree, IndexNode } from "@atlas/index"
import { isSymlinkLeaf, walkFileTree } from "../src/fs.js"
import { foldAstUnits, initAst } from "../src/ast.js"
import { makeFixRepo, T_ref } from "./harness/fix-repo.js"
import type { FixRepo } from "./harness/fix-repo.js"

let tmp: string | undefined
let repo: FixRepo | undefined
afterEach(() => {
  if (tmp !== undefined) rmSync(tmp, { recursive: true, force: true })
  tmp = undefined
  repo?.cleanup()
  repo = undefined
})

/** Find the node whose `path` matches, or `undefined`. */
function findNode(node: FileTree, path: string): FileTree | undefined {
  if (node.path === path) return node
  for (const c of node.children) {
    const hit = findNode(c, path)
    if (hit !== undefined) return hit
  }
  return undefined
}

/** Every node key in an axis, depth-first. */
function allKeys(node: IndexNode, acc: string[] = []): string[] {
  acc.push(node.key)
  for (const c of node.children) allKeys(c, acc)
  return acc
}

/** A real git repo in a temp dir containing `files` plus `links` (`repo-relative path -> raw link text`). */
function makeLinkRepo(files: Readonly<Record<string, string>>, links: Readonly<Record<string, string>>): string {
  tmp = mkdtempSync(join(tmpdir(), "atlas-symlink-repo-"))
  for (const [rel, content] of Object.entries(files)) {
    const abs = join(tmp, rel)
    mkdirSync(dirname(abs), { recursive: true })
    writeFileSync(abs, content)
  }
  for (const [rel, target] of Object.entries(links)) {
    const abs = join(tmp, rel)
    mkdirSync(dirname(abs), { recursive: true })
    symlinkSync(target, abs) // the target need not exist — a symlink is its text
  }
  const git = (...args: string[]): void => {
    execFileSync("git", args, { cwd: tmp, stdio: "pipe" })
  }
  git("init", "-q")
  git("config", "user.email", "link@atlas.test")
  git("config", "user.name", "atlas-fixture")
  git("config", "commit.gpgsign", "false")
  git("add", "-A")
  git("commit", "-q", "-m", "link-repo")
  return tmp
}

/** The staged mode git records for `rel` — the fixture's own oracle that we really planted a symlink. */
function stagedMode(repoPath: string, rel: string): string {
  const out = execFileSync("git", ["ls-files", "-s", "--", rel], { cwd: repoPath, encoding: "utf8" })
  return out.slice(0, 6)
}

describe("walkFileTree — a tracked symlink is walked as its LINK TEXT, never as its target", () => {
  it("link-text — the entry is PRESENT and its `content` is the target path, exactly [kills mutant: readFileSync the path again]", () => {
    const secret = "SECRET-TARGET-BYTES-NEVER-IN-THE-TREE\n"
    const repoPath = makeLinkRepo(
      { "src/real.ts": "export const ok = 1;\n", "secrets/token.txt": secret },
      { "src/config.ts": "../secrets/token.txt" },
    )
    expect(stagedMode(repoPath, "src/config.ts")).toBe("120000") // the fixture really is a symlink entry

    const walk = walkFileTree(repoPath)
    const node = findNode(walk, "src/config.ts")
    // REQ-ADAPTER-1b: a tracked file is INCLUDED — refusing the entry would contradict the requirement.
    expect(node).toBeDefined()
    expect(node!.children).toStrictEqual([])
    // teeth: the mutant that re-reads the path with `readFileSync` follows the link and yields `secret`.
    expect(node!.content).toBe("../secrets/token.txt")
    expect(node!.content).not.toBe(secret)
    expect(isSymlinkLeaf(node!)).toBe(true)
    // the ordinary file leg is untouched.
    expect(findNode(walk, "src/real.ts")!.content).toBe("export const ok = 1;\n")
    expect(isSymlinkLeaf(findNode(walk, "src/real.ts")!)).toBe(false)
  })

  it("no-passwd — a tracked `-> /etc/passwd` puts NOT ONE BYTE of /etc/passwd in the tree [kills mutant: follow the link]", () => {
    const repoPath = makeLinkRepo({ "README.md": "# link repo\n" }, { "src/config.ts": "/etc/passwd" })
    expect(stagedMode(repoPath, "src/config.ts")).toBe("120000")

    const walk = walkFileTree(repoPath)
    const node = findNode(walk, "src/config.ts")
    expect(node).toBeDefined()
    expect(node!.content).toBe("/etc/passwd") // the link TEXT — 11 bytes, the whole content
    // and the real file's bytes are absent from the WHOLE tree, not merely from that leaf.
    const passwd = readFileSync("/etc/passwd", "utf8")
    const witness = passwd.split("\n").find((l) => l.includes(":") && l.length > 20)
    expect(witness).toBeDefined() // the fixture host really has a non-trivial /etc/passwd
    expect(JSON.stringify(walk)).not.toContain(witness!)
  })

  it("broken link and dir link are mode-120000 like any other — a CHANGE: they used to be dropped by accident", () => {
    // Before this rule both were dropped, but by ACCIDENT rather than by decision: `readFileOrSkip` swallowed
    // the ENOENT of a dangling target and the EISDIR of a directory target. Nothing decided that; the mode did
    // not reach the walker at all. Now the mode decides, and both are included as their stored link text.
    const repoPath = makeLinkRepo(
      { "sub/keep.ts": "export const k = 1;\n" },
      { "src/gone.ts": "./nowhere.ts", "src/dirlink": "../sub" },
    )
    expect(stagedMode(repoPath, "src/gone.ts")).toBe("120000")
    expect(stagedMode(repoPath, "src/dirlink")).toBe("120000")

    const walk = walkFileTree(repoPath)
    const broken = findNode(walk, "src/gone.ts")
    expect(broken).toBeDefined()
    expect(broken!.content).toBe("./nowhere.ts")
    expect(broken!.children).toStrictEqual([])
    const dirLink = findNode(walk, "src/dirlink")
    expect(dirLink).toBeDefined()
    expect(dirLink!.content).toBe("../sub") // a LEAF carrying link text — never the directory's entries
    expect(dirLink!.children).toStrictEqual([])
    // the linked directory's own tracked file is present ONCE, under its real path, not under the link.
    expect(findNode(walk, "sub/keep.ts")).toBeDefined()
    expect(findNode(walk, "src/dirlink/keep.ts")).toBeUndefined()
  })

  it("two walks of a repo WITH links are byte-identical (REQ-ADAPTER-1d, now also across hosts)", () => {
    const repoPath = makeLinkRepo({ "a.ts": "export const a = 1;\n" }, { "link.ts": "/etc/hosts" })
    const w1 = walkFileTree(repoPath)
    const w2 = walkFileTree(repoPath)
    expect(JSON.stringify(w1)).toBe(JSON.stringify(w2))
  })
})

describe("foldAstUnits — a mode-120000 leaf is never parsed as source", () => {
  beforeAll(async () => {
    await initAst() // the fold is a no-op until the grammar is warmed — without this the case has no teeth
  })

  it("no-unit-key — a link whose TEXT is valid TypeScript mints NO `::` unit key [kills mutant: drop the fold exclusion]", () => {
    // A link target is attacker-chosen TEXT: `ln -s 'const leaked = 1' src/leak.ts` is a legal symlink whose
    // stored blob parses as a TS lexical declaration. Folding it would mint `src/leak.ts::…:leaked` — a
    // first-class node key, and node keys are what retrieval hands out.
    const repoPath = makeLinkRepo(
      { "src/real.ts": "export function realFn(): number { return 1; }\n" },
      { "src/leak.ts": "const leaked = 1" },
    )
    expect(stagedMode(repoPath, "src/leak.ts")).toBe("120000")

    const folded = foldAstUnits(walkFileTree(repoPath))
    const leak = findNode(folded, "src/leak.ts")
    expect(leak).toBeDefined()
    expect(leak!.content).toBe("const leaked = 1") // present, unrefined
    expect(leak!.children).toStrictEqual([]) // teeth: the mutant folds an item child here

    const keys = allKeys(build(folded, { documents: [] }).spatial)
    // CONTROL — the fold really ran in this process (otherwise the assertion below is vacuous).
    expect(keys.some((k) => k.startsWith("src/real.ts::"))).toBe(true)
    expect(keys).toContain("src/real.ts::function_declaration:0:realFn")
    // and not one key was minted under the link.
    expect(keys.filter((k) => k.startsWith("src/leak.ts::"))).toStrictEqual([])
    expect(keys).not.toContain("src/leak.ts::lexical_declaration:0:leaked")
  })
})

describe("walkFileTree — a repo with NO symlinks is byte-identical (the blast-radius regression guard)", () => {
  // The tracked-symlink rule reaches a repo ONLY through mode-120000 entries; `atlas` itself has none (684
  // tracked paths, all 100644, 0 gitlinks). This case is the mechanical guard for that claim: `-s -z` must
  // enumerate exactly what `-z` did, and every leaf must carry exactly the bytes it carried before, so no
  // `subtreeHash` and no `nodeKey` can move on a symlink-free repo. The digests below are PINNED literals —
  // if a future edit moves one of them without a symlink in sight, that edit is doing something else.
  const PINNED_TREE_SHA256 = "c2203800f6b57206d2e1b0650f8cca57ad41f10de58187ee1f80f4285eee6f80"
  const PINNED_SPATIAL_SUBTREE_HASH = "fd4eb473a621f47523606cbe0fea3c331aea3681cebac106006be5e5717e2c29"

  it("the two pins are facts about the PRE-EXISTING oracle T_ref, not about the new walker", () => {
    // Anchoring the literals to `T_ref` — frozen before this change, in `test/harness/fix-repo.ts` — is what
    // makes them a regression guard rather than a snapshot of whatever the walker happens to do today.
    expect(createHash("sha256").update(JSON.stringify(T_ref)).digest("hex")).toBe(PINNED_TREE_SHA256)
    expect(String(build(T_ref, { documents: [] }).spatial.subtreeHash)).toBe(PINNED_SPATIAL_SUBTREE_HASH)
  })

  it("symlink-free-noop — the walk still equals T_ref and both digests are unmoved", () => {
    repo = makeFixRepo()
    const walk = walkFileTree(repo.repoPath)
    expect(walk).toStrictEqual(T_ref) // exact paths·nesting·leaf content, unchanged by the `-s` switch
    expect(createHash("sha256").update(JSON.stringify(walk)).digest("hex")).toBe(PINNED_TREE_SHA256)
    expect(String(build(walk, { documents: [] }).spatial.subtreeHash)).toBe(PINNED_SPATIAL_SUBTREE_HASH)
    // no leaf of a symlink-free repo carries the marker.
    const marked: string[] = []
    ;(function scan(n: FileTree): void {
      if (isSymlinkLeaf(n)) marked.push(n.path)
      for (const c of n.children) scan(c)
    })(walk)
    expect(marked).toStrictEqual([])
  })
})
