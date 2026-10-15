// @atlas/adapter-io — src/fs.ts  (ADAPT-FS-1: the faithful filesystem walk)
//
// The raw fs adapter: walk a repo path into the frozen `FileTree` (@atlas/index) along the spatial rail
// repo→crate→module→file→item→block. Implemented — WP-9.1.1-b.FS (tests: fs.test.ts, and the tracked-symlink
// rule below in fs-tracked-symlink.test.ts).
//
// ── A TRACKED SYMLINK IS WALKED AS ITS LINK TEXT, NEVER AS ITS TARGET ──────────────────────────────────
// The walk used to `readFileSync` every tracked path, which FOLLOWS a symlink: a tracked
// `src/config.ts -> /etc/passwd` put the password file's bytes into the skeleton (reproduced), because
// `readFileOrSkip` swallows EISDIR/ENOENT and so the de-facto rule was "follow every link; keep it if the
// target happens to be a readable regular file". The rule now is git's own: a mode-120000 entry contributes
// THE LINK TARGET PATH TEXT — the bytes of the blob git itself stores — and the target on disk is never
// touched. Three things fall out, and they are why this shape was chosen over refusing the entry or
// resolving the target under a containment check:
//   • REQ-ADAPTER-1b ("if a file is tracked, the walker SHALL include it") keeps holding with NO new
//     exception — the entry is present, it simply carries what the repo says it is.
//   • The walk becomes a PURE FUNCTION OF THE COMMIT, repairing a determinism hole in REQ-ADAPTER-1d: the
//     content behind a link to an absolute outside path is a fact about the HOST, so two machines could
//     walk the same commit to different content. They no longer can.
//   • It is not a new convention. Under `core.symlinks=false` (Windows, some CI) git ALREADY checks such an
//     entry out as a regular file containing the target text; this reproduces what that checkout yields —
//     and on such a host the ordinary `readFileSync` leg produces exactly these same bytes.
// The deciding reason is what is NOT here: no containment predicate, no tracked-set membership test, no
// attacker-influenced path resolution on the hot path of every walk at every rev, on the boot path of both
// binaries. Resolving links is precisely the business the two `isContainedIn` fixes removed from two other
// doors; the walker never enters it.

import { readFileSync } from "node:fs"
import { join } from "node:path"
import type { FileTree } from "@atlas/index"
import { runGit } from "./run-git.js"

/** The git index mode of a SYMLINK entry. Its blob content is the link target path text. */
const GIT_MODE_SYMLINK = "120000"

/** One `git ls-files -s -z` record: the mode the REPO DECLARES, the blob it names, and the path. The mode
 *  is preferred over an `lstat` deliberately — `lstat` reports what this HOST currently has (and reports
 *  nothing at all for a symlink checked out as a regular file), while the mode is what the commit says. */
interface TrackedEntry {
  readonly mode: string
  readonly oid: string
  readonly path: string
}

/**
 * A walked leaf git declares mode-120000: `content` is the LINK TARGET PATH TEXT, not source. The marker is
 * load-bearing exactly once — `ast.ts` excludes such a leaf from the AST fold — because a link target is
 * attacker-chosen TEXT: `ln -s 'const x = 1' src/leak.ts` would otherwise be parsed as TypeScript and mint
 * `src/leak.ts::lexical_declaration:0:x`, a first-class node key (and node keys are what retrieval hands
 * out) minted from something that is not a source file at all.
 */
export interface SymlinkLeaf extends FileTree {
  readonly symlink: true
}

/** Is this node a mode-120000 leaf (see `SymlinkLeaf`)? Total, structural, no cast into `any`. */
export function isSymlinkLeaf(node: FileTree): boolean {
  return (node as Partial<SymlinkLeaf>).symlink === true
}

// A mutable directory node under construction: an ordered map from the next path segment to either a
// nested directory builder or a materialized file leaf. Directories are keyed so siblings stay unique;
// order is imposed at the end by an ASCII sort on `path`, matching `T_ref`.
interface DirBuild {
  readonly path: string
  readonly dirs: Map<string, DirBuild>
  readonly files: FileTree[]
}

const newDir = (path: string): DirBuild => ({ path, dirs: new Map(), files: [] })

/**
 * Walk a real repo into the frozen `FileTree` (ADAPT-FS-1). The tracked set is derived from
 * `git ls-files` run in `repoPath` — which honors `.gitignore` by construction (ignored/untracked paths
 * are never listed), so no ignore parser is needed and no gitignored path can leak in. Each tracked
 * file's working-tree bytes become its leaf `content` — except a mode-120000 (symlink) entry, whose
 * `content` is the STORED LINK TEXT and whose target is never opened (see the header). The paths are
 * assembled into the nested
 * `FileTree` (root `path: '.'`; directory nodes carry `children` and no `content`; files are leaves with
 * `children: []`). Sibling order is ASCII sort by `path`. Every value derives purely from git-tracked
 * bytes — no wall-clock, nonce, or counter on any node, so two walks are byte-identical.
 */
export function walkFileTree(repoPath: string): FileTree {
  // Fail CLOSED at the composition boot path (compose.ts `composeRuntime`, wire.ts `assembleHandler`):
  // `git ls-files` exits 128 in a NON-git dir (and the shared `runGit` seam THROWS on a non-zero exit / when
  // git is absent). An unguarded throw would propagate uncaught out of both the `atlas`/`atlas-mcp` bins at boot
  // (raw stack trace). Degrade to the EMPTY tracked set — the SAME structural view as an empty repo — never
  // a throw. The valid-git-repo happy path is byte-identical (only the throwing paths are absorbed). Same
  // no-shell git seam + `try {} catch {}` idiom as `gitUserEmail`/`readScipOrEmpty`.
  const tracked = gitLsFiles(repoPath)

  const root = newDir(".")
  for (const entry of tracked) {
    const rel = entry.path
    const segments = rel.split("/")
    let node = root
    // Walk/create the directory chain (all but the final segment).
    for (let i = 0; i < segments.length - 1; i++) {
      const dirPath = segments.slice(0, i + 1).join("/")
      let next = node.dirs.get(dirPath)
      if (next === undefined) {
        next = newDir(dirPath)
        node.dirs.set(dirPath, next)
      }
      node = next
    }
    // The final segment is the file leaf; `rel` (POSIX) is already the repo-relative path. A path listed by
    // `git ls-files` but UNREADABLE in the working tree (tracked-but-deleted ⇒ ENOENT, or permission) must
    // NOT crash boot: SKIP it so the walk stays TOTAL. A readable tracked file is byte-identical.
    const leaf = leafFor(repoPath, entry)
    if (leaf === undefined) continue
    node.files.push(leaf)
  }

  return freeze(root)
}

/**
 * The NUL-delimited git-tracked entry set at `repoPath`, or `[]`. TOTAL — never throws: a non-git dir (git
 * exit 128), git absent, or ANY `execFileSync` failure ⇒ `[]` (fail-closed to the empty index). NUL-delimited
 * so paths with spaces/newlines survive; the trailing empty segment is dropped.
 *
 * `-s` (staged) is asked for so the MODE travels with the path — `ls-files -z` alone discards it, which is
 * why the walker could not tell a symlink from a regular file. The ENUMERATION is unchanged: `-s -z` lists
 * exactly the same paths in the same order (verified on this repo — the parsed path list md5s identically
 * with and without `-s`, over every tracked path). Record shape: `<mode> <oid> <stage>\t<path>`; the path is
 * NOT quoted under `-z`, and the metadata prefix contains no TAB, so the FIRST tab is the split point even
 * for a path that itself contains one. A record that does not parse is DROPPED rather than guessed at — the
 * walk may omit under duress (it already does, WP-N8) but must never fabricate a path (REQ-ADAPTER-1c).
 */
function gitLsFiles(repoPath: string): TrackedEntry[] {
  try {
    const out = runGit(repoPath, ["ls-files", "-s", "-z"])
    const entries: TrackedEntry[] = []
    for (const record of out.split("\0")) {
      if (record.length === 0) continue
      const tab = record.indexOf("\t")
      if (tab < 0) continue
      const meta = record.slice(0, tab).split(" ")
      const path = record.slice(tab + 1)
      const mode = meta[0]
      const oid = meta[1]
      if (mode === undefined || oid === undefined || path.length === 0) continue
      entries.push({ mode, oid, path })
    }
    return entries
  } catch {
    return []
  }
}

/** The leaf for one tracked entry, or `undefined` to SKIP it (the walk stays total).
 *  Mode-120000 ⇒ the stored link text, read from the OBJECT DATABASE, never from the target on disk.
 *  Everything else ⇒ the working-tree bytes, exactly as before. */
function leafFor(repoPath: string, entry: TrackedEntry): FileTree | undefined {
  if (entry.mode === GIT_MODE_SYMLINK) {
    const target = gitBlobOrSkip(repoPath, entry.oid)
    if (target === undefined) return undefined
    const leaf: SymlinkLeaf = { path: entry.path, children: [], content: target, symlink: true }
    return leaf
  }
  const content = readFileOrSkip(join(repoPath, entry.path))
  if (content === undefined) return undefined
  return { path: entry.path, children: [], content }
}

/** The bytes of blob `oid` in `repoPath`'s object database, or `undefined` — never throws. The oid is
 *  charset-checked BEFORE it reaches git: it arrives from a parsed record, and a token beginning with `-`
 *  would be read by git as an OPTION rather than an object (the `runGit` seam is shell-free, so this is the
 *  remaining way a malformed field could change what the command means). */
function gitBlobOrSkip(repoPath: string, oid: string): string | undefined {
  if (!/^[0-9a-f]{40,64}$/.test(oid)) return undefined
  try {
    return runGit(repoPath, ["cat-file", "blob", oid])
  } catch {
    return undefined
  }
}

/** The working-tree bytes at `abs`, or `undefined` when unreadable (deleted/permission) — never throws. */
function readFileOrSkip(abs: string): string | undefined {
  try {
    return readFileSync(abs, "utf8")
  } catch {
    return undefined
  }
}

/** Materialize a `DirBuild` into an immutable `FileTree`, with siblings ASCII-sorted by `path`. */
function freeze(node: DirBuild): FileTree {
  const children: FileTree[] = [...node.files, ...[...node.dirs.values()].map(freeze)].sort((a, b) =>
    a.path < b.path ? -1 : a.path > b.path ? 1 : 0,
  )
  return { path: node.path, children }
}
