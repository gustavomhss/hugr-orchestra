// @atlas/adapter-io — src/surface/read-git.ts  (the Atlas UI surface: what git says about the store)
//
// The git half of specs/atlas-ui/mock/extract.py: HEAD, each fact's drift since the rev it was derived at, which store
// files git tracks, the tracked files per extension, and the children of every tracked directory. Every call goes
// through the one no-shell git seam (`../run-git.ts`).
//
// TOTAL: a failed git call reads as empty output, which is what extract.py read from a failed `subprocess.run`.
// Where extract.py ran two `rev-parse` per fact, this asks for both object ids of every fact in ONE
// `git cat-file --batch-check`; the diff, the shortstat and the log still run once per DRIFTED fact. A rev is used only
// when it is a hex object name, so a rev read from the store can never reach git as an option.

import { extname, posix } from "node:path"
import { runGit } from "../run-git.js"
import type { PendingFact } from "./read-store.js"
import type { AtlasDrift, AtlasDriftHunk, AtlasFact, AtlasTracked } from "./types.js"

const MAX_HUNKS = 2
const MAX_HUNK_LINES = 18
const MAX_LINE = 160
const MAX_COMMITS = 3
const LANG_EXTS = new Set([".ts", ".tsx", ".js", ".mjs", ".py", ".rs", ".go", ".sh"])
const REV = /^[0-9a-f]{7,64}$/
const OBJECT_ID = /^[0-9a-f]{40,64}$/
const PROJECTION_FILE = /^\.atlas\/projection(\.\d+)?\.json$/
const STAGING_FILE = /^\.atlas\/staging(\.\d+)?\.json$/

/** HEAD's first 8 characters; "" outside git. */
export function headShort(repoPath: string): string {
  return gitOut(repoPath, ["rev-parse", "HEAD"]).trim().slice(0, 8)
}

/** Every tracked path (`git ls-files -z`, so no path is quoted). */
export function trackedFiles(repoPath: string): readonly string[] {
  return nulSplit(gitOut(repoPath, ["ls-files", "-z"]))
}

/** Which durable store files git tracks (store-provenance.ts asks the same question for the read gate). */
export function trackedStore(repoPath: string): AtlasTracked {
  const files = nulSplit(gitOut(repoPath, ["ls-files", "-z", "--", ".atlas"]))
  return {
    projection: files.some((file) => PROJECTION_FILE.test(file)),
    cas: files.filter((file) => file.startsWith(".atlas/cas/")).length,
    staging: files.some((file) => STAGING_FILE.test(file)),
    policy: files.includes(".atlas/policy.json"),
    memory: files.some((file) => file === ".atlas/memory.jsonl" || /^\.atlas\/members\/[^/]+\/memory\//.test(file)),
  }
}

/** Tracked files per extension, for the extensions extract.py counts; the key drops the dot. */
export function langCounts(tracked: readonly string[]): Readonly<Record<string, number>> {
  return tracked
    .map((file) => extname(file))
    .filter((ext) => LANG_EXTS.has(ext))
    .reduce<Record<string, number>>((counts, ext) => ({ ...counts, [ext.slice(1)]: (counts[ext.slice(1)] ?? 0) + 1 }), {})
}

/** Directory ("." for the root) → the sorted names of its tracked children, files and directories alike. */
export function childrenOf(tracked: readonly string[]): Readonly<Record<string, readonly string[]>> {
  const kids = new Map<string, Set<string>>()
  for (const file of tracked) {
    const parts = file.split("/")
    parts.forEach((_, i) => {
      const prefix = parts.slice(0, i + 1).join("/")
      const parent = posix.dirname(prefix)
      kids.set(parent, (kids.get(parent) ?? new Set<string>()).add(posix.basename(prefix)))
    })
  }
  return Object.fromEntries([...kids].map(([dir, names]) => [dir, [...names].sort()]))
}

/** Each pending fact as the snapshot serves it: with `drift` when its file's blob at the rev differs from HEAD's. */
export function withDrift(repoPath: string, pending: readonly PendingFact[]): readonly AtlasFact[] {
  const asked = pending.filter((p) => REV.test(p.rev) && p.fact.file.length > 0 && !p.fact.file.includes("\n"))
  const ids =
    asked.length === 0
      ? []
      : gitOut(
          repoPath,
          ["cat-file", "--batch-check=%(objectname)"],
          `${asked.flatMap((p) => [`${p.rev}:${p.fact.file}`, `HEAD:${p.fact.file}`]).join("\n")}\n`,
        ).split("\n")
  const changed = new Set(
    asked.filter((_, i) => {
      const before = objectId(ids[2 * i])
      const after = objectId(ids[2 * i + 1])
      return before !== "" && after !== "" && before !== after
    }),
  )
  return pending.map((p) => (changed.has(p) ? { ...p.fact, drift: driftOf(repoPath, p.rev, p.fact.file) } : p.fact))
}

function driftOf(repoPath: string, rev: string, file: string): AtlasDrift {
  return {
    hunks: hunksOf(gitOut(repoPath, ["diff", "-U2", rev, "HEAD", "--", file])),
    stat: gitOut(repoPath, ["diff", "--shortstat", rev, "HEAD", "--", file]).trim(),
    commits: lines(gitOut(repoPath, ["log", "--format=%h%x09%s", `${rev}..HEAD`, "--", file]))
      .slice(0, MAX_COMMITS)
      .map(commitOf),
  }
}

/** extract.py's hunk loop: at most two hunks, header lines skipped, at most 18 lines each, each cut to 160. */
function hunksOf(diff: string): readonly AtlasDriftHunk[] {
  const hunks: { readonly at: string; readonly lines: string[] }[] = []
  for (const line of lines(diff)) {
    if (line.startsWith("@@")) {
      if (hunks.length === MAX_HUNKS) break
      hunks.push({ at: (line.split("@@")[1] ?? "").trim(), lines: [] })
      continue
    }
    const current = hunks.at(-1)
    if (current === undefined || line.startsWith("---") || line.startsWith("+++") || line.startsWith("\\")) continue
    if (current.lines.length < MAX_HUNK_LINES) current.lines.push(line.slice(0, MAX_LINE))
  }
  return hunks
}

function commitOf(line: string): readonly [string, string] {
  const tab = line.indexOf("\t")
  return tab < 0 ? [line, ""] : [line.slice(0, tab), line.slice(tab + 1)]
}

function objectId(line: string | undefined): string {
  const id = (line ?? "").trim()
  return OBJECT_ID.test(id) ? id : ""
}

/** Python's `splitlines()` for git output: split on line ends, no trailing empty line. */
function lines(text: string): readonly string[] {
  const all = text.split(/\r?\n/)
  return all.at(-1) === "" ? all.slice(0, -1) : all
}

function nulSplit(text: string): readonly string[] {
  return text.split("\0").filter((part) => part.length > 0)
}

/** One git call; any failure (not a repository, a bad rev, git absent) reads as "". */
function gitOut(repoPath: string, args: readonly string[], input?: string): string {
  try {
    return runGit(repoPath, args, input === undefined ? {} : { input })
  } catch {
    return ""
  }
}
