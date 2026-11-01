// @atlas/adapter-io — src/git-history.ts  (ADAPT-GIT-1: history)
//
// The S1 mining `HistorySource` (@atlas/genesis) — real `git log`/`blame`/coupling over a rev, feeding
// ranking only (GEN-6: it MINTS NO FACT — this file imports NO fact-write seam). Every emitted LIST is
// CANONICALLY SORTED (never git-output / Map-insertion order) so a fixed rev yields byte-identical signals.
//
// TWO properties this module is responsible for, both of them load-bearing for the ranker downstream:
//
//   IDENTITY — every emitted `StructRef` is joined to the S0 skeleton by `resolveSiteKey`
//     (genesis/rank.ts:157-158), which looks the site's `subtreeHash` up in the index's
//     subtreeHash→node-key correspondence and, on a MISS, drops the site into an `unresolved:<hash>`
//     ISLAND — a vertex with no edges, so its PPR personalization mass is spent on nothing. So the
//     identity is MINTED BY THE INDEX ITSELF (`nodeHashOfPath`, @atlas/index build.ts) over the SAME path
//     string the index keys on: the repo-relative path. That means every git read that emits a PATHNAME
//     must be `-z` (NUL-delimited, RAW): without `-z`, git C-QUOTES any path containing a non-ASCII byte,
//     a control character, a `"` or a `\` (`src/café.ts` → `"src/caf\303\251.ts"`), and that DISPLAY
//     string hashes to a DIFFERENT identity than the real path the SCIP indexer and the FS walk report.
//     The sibling FS adapter already holds this line (`fs.ts` gitLsFiles uses `ls-files -z`).
//
//   LOUD, NOT TOTAL (genesis-hardening A3b) — history is a BOOSTER, never a dependency (GEN-15), but a
//     BROKEN git is not "no history". Every git read used to be absorbed into `""`, so a repository git
//     could not read (not a repository, dubious ownership, git absent, a corrupt object) mined as a quiet
//     thin-history run. Now only an UNRESOLVABLE REV — a repository with no commits yet, or a rev that names
//     nothing — reads as empty (thin ⇒ structural centrality, as before); every other failure throws a
//     `GitHistoryError` naming the command and git's stderr. `probeHistory`/`frontier`/`signals` run inside
//     the run controller's `plan`, whose catch records it on `report.failure`, so `atlas mine` exits 2.
//
//   SITES — `createSiteFilter` (site-filter.ts) decides which tracked files exist for this module at all, so
//     an excluded file (a test, a lockfile, generated code) adds no churn, no coupling and no blame.

import type { StructRef } from "@atlas/contracts"
import type { HistorySource, MinedSignals } from "@atlas/genesis"
import { nodeHashOfPath } from "@atlas/index"
import { asSubtreeHash } from "@atlas/kernel"
import { ATLAS_IGNORE_BLOCK } from "./gitignore.js"
import { gitErrText, runGit } from "./run-git.js"
import { createSiteFilter } from "./site-filter.js"
import type { SiteFilter } from "./site-filter.js"

/** git's wording for a rev that resolves to no commit: an empty repository (`HEAD` before the first
 *  commit) or a rev that names nothing. That is "no history", not a broken git. */
const UNRESOLVED_REV =
  /unknown revision|ambiguous argument|bad revision|does not have any commits|not a valid object name|needed a single revision/i

/** A git read the history source could not make — see LOUD, NOT TOTAL in the header. */
class GitHistoryError extends Error {
  constructor(repo: string, args: readonly string[], cause: unknown) {
    const detail = gitErrText(cause).trim().split("\n")[0] ?? ""
    super(`git failed in ${repo}: git ${args.join(" ")} — ${detail}`)
    this.name = "GitHistoryError"
  }
}

/** All git I/O flows through the ONE shared no-shell seam (#74). An unresolvable rev reads as empty output;
 *  any other failure throws `GitHistoryError`. The happy path is byte-identical to an unguarded call. */
const git = (repo: string, args: readonly string[]): string => {
  try {
    return runGit(repo, args)
  } catch (e) {
    if (UNRESOLVED_REV.test(gitErrText(e))) return ""
    throw new GitHistoryError(repo, args, e)
  }
}

/** Non-empty output lines (git pads a trailing newline; `--format=` emits blank separators). */
const nonEmpty = (out: string): string[] => out.split("\n").filter((l) => l.length > 0)

/** Non-empty NUL-delimited records — the RAW-pathname reader. Every pathname-emitting git read uses `-z`
 *  and this splitter, so no path is ever C-quoted (see the IDENTITY note above) and a path containing a
 *  newline survives intact. */
const nulPaths = (out: string): string[] => out.split("\0").filter((p) => p.length > 0)

/** The single canonical string order used for every emitted list (determinism / SCN-8b). */
const byPath = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0)

/** A bug-fixing commit subject — the fix-identification step of SZZ (Śliwerski–Zimmermann–Zeller). `fix`,
 *  `fixes` or `fixed` as a whole word, so `fix:`, `fix(scope):`, `Fix typo` and `Fixed crash` match and
 *  `fixture: …` does not. */
const FIX_SUBJECT = /^fix(?:e[sd])?\b/i

/** Hotspot bar: a file must have been CHANGED after introduction (≥2 touching commits). A file added once
 *  and never touched again has change-frequency 0 — it is un-churned code, which REQ-GEN-3b forbids from
 *  raising spend (`frontierBudget` IS the ranked-site count, genesis/rank.ts:370). */
const HOTSPOT_MIN_CHURN = 2

/** SZZ cost bounds. Only the newest `SZZ_MAX_FIX_COMMITS` fix commits in `git log` order at the rev are
 *  blamed, and a fix that modifies more than `SZZ_MAX_FILES_PER_FIX` kept files is skipped whole: a sweeping
 *  `fix: lint` or `fix: rename` commit blames thousands of lines that hold no bug, and dropping it (instead
 *  of truncating its file list) keeps the result independent of any path order. Both cuts are fixed at a
 *  rev, so the signal stays deterministic. */
const SZZ_MAX_FIX_COMMITS = 200
const SZZ_MAX_FILES_PER_FIX = 50

/**
 * NO SZZ FRONTIER LEG — and none is possible, so `frontier()` stays `churn ∨ coupling`.
 *
 * `szzBugCommits` is real SZZ now (`szzMemo`): for each fix commit F, the lines F deleted or changed in a
 * file it MODIFIED are blamed at F's parent, and the distinct commits blame names are that file's
 * bug-introducing commits. A file F modified already existed at F^ under the same path, so some earlier
 * commit created that path, and the churn walk below counts both it and F against the path:
 * `szz(f) ≥ 1 ⇒ churn(f) ≥ 2 = HOTSPOT_MIN_CHURN`. Every file an SZZ leg could admit, the churn leg already
 * admits, at every threshold, so the leg would be dead code. The signal rides `signals()` as a ranking
 * input instead (GEN-6). A path renamed after the fix keeps its count under the old path, which is no
 * longer a site.
 *
 * History: before this the signal was a count of the file's OWN commits whose subject matched `/^fix/i`
 * (#181, #1283). That count is not SZZ — SZZ attributes the bug to the commit that INTRODUCED the blamed
 * line, usually not a fix commit at all.
 */

/** Coupling bar: association-rule MINIMUM SUPPORT over commit baskets — a file must co-change with at
 *  least one other file in ≥2 distinct commits. A one-shot import that happens to land beside other files
 *  has support 1 and is NOT a logical dependency. */
const COUPLING_MIN_SUPPORT = 2

/**
 * A `file` StructRef for a tracked path. The `subtreeHash` is minted by `@atlas/index`'s OWN path→node
 * identity function (`nodeHashOfPath`, build.ts) and wrapped exactly as `dependencyAxis` wraps it
 * (`asSubtreeHash(nodeHashOfPath(p))`) — so the value IS the dependency-axis node's `subtreeHash` for the
 * same path, and `resolveSiteKey` finds it. This is a REUSE of the index's minting, not a parallel copy:
 * a local `id({ file })` would be a second source of truth for identity, free to drift silently.
 * `qualifiedPath` must therefore be the RAW repo-relative path (see the `-z` note in the header).
 */
const fileRef = (qualifiedPath: string): StructRef => ({
  kind: "file",
  qualifiedPath,
  subtreeHash: asSubtreeHash(nodeHashOfPath(qualifiedPath)),
})

/** What Atlas itself wrote: the governed store (`.atlas/**`) and the rule lines `atlas init` appends to the
 *  repo-root `.gitignore`. They are Atlas's bookkeeping, not the user's code, so they are never a mining
 *  site, churn, coupling or blame. The user's OWN `.gitignore` lines are user code and count as usual. */
const atlasStore = (p: string): boolean => p.startsWith(".atlas/")
const ATLAS_RULES = new Set(ATLAS_IGNORE_BLOCK.split("\n").filter((l) => l.length > 0))

/** One commit's mining record: its subject (fix identification for SZZ) and the RAW paths it touched (churn + coupling basket). */
interface CommitBasket {
  readonly sha: string
  readonly subject: string
  readonly files: readonly string[]
}

/** `<40-hex>\x1f<subject>` — the record header of the single-pass log walk below. */
const BASKET_HEADER = /^([0-9a-f]{40})\x1f([\s\S]*)$/

/** A `git blame --line-porcelain` line-block header: `<sha> <orig-line> <final-line> [<count>]`. */
const BLAME_HEADER = /^([0-9a-f]{40}) \d+ \d+/

/** The old-side line ranges of a `-U0` patch, as `[start, count]`: each hunk header is
 *  `@@ -<start>[,<count>] +… @@`, an omitted count is 1, and a count of 0 is a pure insertion (nothing was
 *  deleted, so nothing is blamed). */
function removedRanges(patch: string): Array<readonly [number, number]> {
  return [...patch.matchAll(/^@@ -(\d+)(?:,(\d+))? \+/gm)].flatMap((m) => {
    const count = m[2] === undefined ? 1 : Number(m[2])
    return count > 0 ? [[Number(m[1]), count] as const] : []
  })
}

/**
 * ONE `git log` pass yielding every reachable commit's subject + touched paths, RAW. `-z` NUL-terminates
 * both the `--format` header and each pathname, so the stream is `header\0[\n]path\0path\0header\0…`;
 * records are split on NUL, a leading newline (git's separator after a header) is stripped, and a record
 * matching the 40-hex + US header shape opens a new commit. A commit that touched nothing (empty commit,
 * or a merge, whose diff `--name-only` omits by default) yields an empty basket rather than corrupting
 * the next record. Deterministic at a fixed rev; total (a bad rev ⇒ no commits).
 */
function commitBaskets(repo: string, rev: string): CommitBasket[] {
  const out = git(repo, ["log", "--format=%H%x1f%s", "--name-only", "-z", rev])
  const commits: Array<{ sha: string; subject: string; files: string[] }> = []
  for (const raw of out.split("\0")) {
    const rec = raw.replace(/^\n+/, "")
    if (rec.length === 0) continue
    const header = BASKET_HEADER.exec(rec)
    if (header !== null) commits.push({ sha: header[1] ?? "", subject: header[2] ?? "", files: [] })
    else commits[commits.length - 1]?.files.push(rec)
  }
  return commits
}

/** The baskets that carry user history: `.atlas/**` paths removed, a `.gitignore` touch removed when every
 *  line it changed is one `atlas init` wrote, and record commits (nothing left) dropped. A commit that
 *  touched nothing at all (empty commit, merge) stays, as before. */
function userBaskets(repo: string, rev: string): CommitBasket[] {
  return commitBaskets(repo, rev).flatMap((c) => {
    const files = c.files.filter((f) => !atlasStore(f) && !(f === ".gitignore" && atlasRulesOnly(repo, c.sha)))
    return files.length === 0 && c.files.length > 0 ? [] : [{ ...c, files }]
  })
}

/** True when the commit's `.gitignore` diff adds or removes only lines Atlas wrote (blank lines ignored). */
function atlasRulesOnly(repo: string, sha: string): boolean {
  const diff = git(repo, ["show", "--format=", "--unified=0", sha, "--", ".gitignore"])
  const changed = diff
    .split("\n")
    .filter((l) => /^[+-]/.test(l) && !l.startsWith("+++") && !l.startsWith("---"))
    .map((l) => l.slice(1))
    .filter((l) => l.length > 0)
  return changed.length > 0 && changed.every((l) => ATLAS_RULES.has(l))
}

/** A trivial per-key memo — `fn` runs at most once per distinct `key`, cached for the LIFETIME of the
 *  enclosing `createHistorySource` instance. Sufficient because every cached read here (`commitCount`,
 *  `shallow`, `blameConcentration`, `frontier`, SZZ, `signals`) is a PURE function of `(repo, rev[, path])`: this
 *  process never commits/rewrites the repo mid-`atlas mine`, so a given rev's blame/log output cannot change
 *  between the first caller (arm 1) and the third (arm 3). The scar this is deliberately UNLIKE (#211, a
 *  cache that went wrong after ~24 builds in one process) keyed on something narrower than its inputs; here
 *  the key is exactly the arguments the memoized call depends on — never the closed-over `repoPath`/`rev`
 *  alone — so a caller that ever passed a different `(repo, rev)` through the SAME instance would miss the
 *  cache rather than read a stale answer for the wrong rev. */
function memo<K, V>(fn: (k: K) => V): (k: K) => V {
  const cache = new Map<K, V>()
  return (k: K): V => {
    const hit = cache.get(k)
    if (hit !== undefined) return hit
    const v = fn(k)
    cache.set(k, v)
    return v
  }
}

/**
 * Construct the S1 mining `HistorySource` at a git revision (ADAPT-GIT-1).
 *
 * Widened from `(rev)` → `(repoPath, rev)`: the factory closes over both so `signals(site)` — whose frozen
 * signature carries NEITHER repo nor rev — can shell git at the pinned rev. The `(repo, rev)`-carrying
 * methods use their own params; `signals` uses the closure.
 *
 * MEMOIZED per instance (CACHE-HISTORY-SOURCE): `atlas mine` builds ONE `HistorySource` (cli.ts) and threads
 * it through EVERY arm (mine-arms.ts `{ ...deps, slot }`), but the arms are independent `driveMinePass`
 * calls, each of which invokes `probeHistory` → `blameConcentration` (one `git blame` PER TRACKED FILE, no
 * memo) and `frontier` (a full `git log` walk) FRESH — so a shared instance still shelled git 3× before this
 * fix. Every method here is cached on its own inputs so a 3-arm default run pays the git cost ONCE.
 */
export function createHistorySource(
  repoPath: string,
  rev: string,
  keep: SiteFilter = createSiteFilter(repoPath),
): HistorySource {
  /** SHAs of commits touching `qp` at `rev`, reverse-chronological (git-log order). */
  const commitsTouching = (qp: string): string[] => nonEmpty(git(repoPath, ["log", "--format=%H", rev, "--", qp]))

  /** The RAW tracked FILE set at a rev — the identity domain every emitted site is drawn from. Blobs only
   *  (`<mode> <type> <sha>\t<path>`): a submodule gitlink is not a file, and `git blame` on one fails — which
   *  is now loud. `keep` (the site filter) is applied HERE, so an excluded file never reaches churn,
   *  coupling or blame. */
  const trackedAt = (repo: string, r: string): string[] =>
    nulPaths(git(repo, ["ls-tree", "-r", "-z", r])).flatMap((entry) => {
      const tab = entry.indexOf("\t")
      const path = entry.slice(tab + 1)
      return tab > 0 && entry.split(" ")[1] === "blob" && !atlasStore(path) && keep(path) ? [path] : []
    })

  // Keyed on the ACTUAL call args (`repo\0rev`), not the closed-over `repoPath`/`rev` — see the `memo` note.
  const rk = (repo: string, r: string): string => `${repo}\0${r}`

  const commitCountMemo = memo((k: string): number => {
    const [repo, r] = k.split("\0") as [string, string]
    const n = Number(git(repo, ["rev-list", "--count", r]).trim())
    if (!Number.isFinite(n)) return 0
    // Record commits (init's `.gitignore`, `.atlas/**` writes) are not user history: a repo whose only other
    // commit is Atlas's own has no history to mine and takes the structural set.
    return n - (commitBaskets(repo, r).length - userBaskets(repo, r).length)
  })
  const shallowMemo = memo(
    (repo: string): boolean => git(repo, ["rev-parse", "--is-shallow-repository"]).trim() === "true",
  )
  const blameMemo = memo((k: string): number => {
    const [repo, r] = k.split("\0") as [string, string]
    const files = trackedAt(repo, r)
    const perCommit = new Map<string, number>()
    let total = 0
    for (const f of files) {
      const blame = git(repo, ["blame", "--line-porcelain", r, "--", f])
      let sha: string | undefined
      for (const line of blame.split("\n")) {
        const h = BLAME_HEADER.exec(line)?.[1]
        if (h !== undefined) sha = h
        // The tab-prefixed record is the line's content; a rule `atlas init` wrote is not user code.
        else if (line.startsWith("\t") && sha !== undefined) {
          if (!(f === ".gitignore" && ATLAS_RULES.has(line.slice(1)))) {
            perCommit.set(sha, (perCommit.get(sha) ?? 0) + 1)
            total += 1
          }
          sha = undefined
        }
      }
    }
    if (total === 0) return 0
    const top = Math.max(...perCommit.values())
    return top / total
  })
  const frontierMemo = memo((k: string): readonly StructRef[] => {
    const [repo, r] = k.split("\0") as [string, string]
    const tracked = new Set(trackedAt(repo, r))
    if (tracked.size === 0) return []
    const churn = new Map<string, number>()
    const coupling = new Map<string, number>()
    const bump = (m: Map<string, number>, f: string): void => {
      m.set(f, (m.get(f) ?? 0) + 1)
    }
    for (const commit of userBaskets(repo, r)) {
      const basket = commit.files.filter((f) => tracked.has(f))
      for (const f of basket) {
        bump(churn, f)
        if (basket.length >= 2) bump(coupling, f)
      }
    }
    const inFrontier = (f: string): boolean =>
      (churn.get(f) ?? 0) >= HOTSPOT_MIN_CHURN || (coupling.get(f) ?? 0) >= COUPLING_MIN_SUPPORT
    return [...tracked]
      .filter(inFrontier)
      .sort((a, b) => (churn.get(b) ?? 0) - (churn.get(a) ?? 0) || byPath(a, b))
      .map(fileRef)
  })
  // SZZ over the whole rev, once: path → the distinct bug-introducing commits blamed in it (see the comment
  // beside `HOTSPOT_MIN_CHURN`). Fix commits come from the user baskets (Atlas's record commits never fix),
  // newest first, capped; a merge or root commit has no single parent to blame at and modifies nothing here.
  const szzMemo = memo((k: string): ReadonlyMap<string, ReadonlySet<string>> => {
    const [repo, r] = k.split("\0") as [string, string]
    const fixes = userBaskets(repo, r)
      .filter((c) => FIX_SUBJECT.test(c.subject))
      .slice(0, SZZ_MAX_FIX_COMMITS)
    const introducers = new Map<string, Set<string>>()
    for (const fix of fixes) {
      // Modified files only: an added file has no old lines, and a deleted (or, with --no-renames, renamed)
      // file's whole body is not what the fix changed.
      const files = nulPaths(
        git(repo, ["diff-tree", "--no-commit-id", "-r", "-z", "--no-renames", "--diff-filter=M", "--name-only", fix.sha]),
      ).filter((f) => !atlasStore(f) && keep(f))
      if (files.length > SZZ_MAX_FILES_PER_FIX) continue
      for (const f of files) {
        const ranges = removedRanges(
          git(repo, ["diff-tree", "--no-commit-id", "-p", "-U0", "--no-renames", "--no-ext-diff", fix.sha, "--", f]),
        )
        if (ranges.length === 0) continue // a pure addition deleted nothing to blame
        const blame = git(repo, [
          "blame",
          "--line-porcelain",
          "-w",
          ...ranges.flatMap(([start, count]) => ["-L", `${start},+${count}`]),
          `${fix.sha}^`,
          "--",
          f,
        ])
        let sha: string | undefined
        for (const line of blame.split("\n")) {
          const h = BLAME_HEADER.exec(line)?.[1]
          if (h !== undefined) sha = h
          else if (line.startsWith("\t") && sha !== undefined) {
            // A blank line or a rule `atlas init` wrote carries no bug.
            const text = line.slice(1)
            if (text.trim().length > 0 && !(f === ".gitignore" && ATLAS_RULES.has(text))) {
              const set = introducers.get(f) ?? new Set<string>()
              set.add(sha)
              introducers.set(f, set)
            }
            sha = undefined
          }
        }
      }
    }
    return introducers
  })
  const signalsMemo = memo((qp: string): MinedSignals => {
    // messages — commit subjects touching qp, in git-log order (deterministic at a fixed rev; NOT sorted).
    const messages = nonEmpty(git(repoPath, ["log", "--format=%s", rev, "--", qp]))

    // szzBugCommits — the distinct bug-introducing commits SZZ blamed in qp (deterministic at a fixed rev).
    const szzBugCommits = szzMemo(rk(repoPath, rev)).get(qp)?.size ?? 0

    // hotspot — change-frequency (churn count, complexity factor deferred to v0), --follow across renames.
    const hotspot = nonEmpty(git(repoPath, ["log", "--format=%H", "--follow", rev, "--", qp])).length

    // owners — distinct authors of commits touching qp, sorted.
    const owners = [...new Set(nonEmpty(git(repoPath, ["log", "--format=%an", rev, "--", qp])))].sort(byPath)

    // coChanged — distinct OTHER files that appeared in the same commits as qp, sorted by path.
    const co = new Set<string>()
    for (const sha of commitsTouching(qp)) {
      for (const f of nulPaths(git(repoPath, ["show", "--format=", "--name-only", "-z", sha]))) {
        if (f !== qp && !atlasStore(f) && keep(f)) co.add(f)
      }
    }
    const coChanged = [...co].sort(byPath).map(fileRef)

    return { hotspot, szzBugCommits, coChanged, owners, messages }
  })

  return {
    // rev-list count of commits reachable from rev. An unresolvable rev (no commits yet) counts 0, which
    // trips GEN-15's `low-commit-count` ⇒ thin ⇒ structural centrality; a broken git throws (header).
    commitCount(repo, r) {
      return commitCountMemo(rk(repo, r))
    },

    // shallow-clone probe (repository-wide; rev unused — the frozen (repo,rev) shape is honoured).
    // An unreadable repo throws (header) rather than guessing `true`.
    shallow(repo, _r) {
      void _r
      return shallowMemo(repo)
    },

    // Over ALL tracked files at rev, aggregate per-commit blame attributions; return the single
    // most-attributed commit's share of total lines (0 when there are no lines). Deterministic.
    blameConcentration(repo, r) {
      return blameMemo(rk(repo, r))
    },

    // The GEN-11 personalization vector: the UNION of the hotspot / coupling frontiers (no SZZ leg — the
    // comment beside `HOTSPOT_MIN_CHURN` proves every SZZ-positive file already clears the churn bar), NOT
    // every tracked file. A whole-repo frontier makes LLM spend
    // a function of FILE COUNT — exactly what REQ-GEN-3a/3b forbid ("adding un-churned code MUST NOT
    // raise LLM spend"), since `frontierBudget` is the ranked-site count. Ordered churn-desc then
    // path-asc; both legs are computed from ONE log pass so a fixed rev is byte-identical.
    frontier(repo, r) {
      return frontierMemo(rk(repo, r))
    },

    // The mined ranking heuristics for a site (GEN-6), scoped to the closed-over rev.
    signals(site): MinedSignals {
      return signalsMemo(site.qualifiedPath)
    },
  }
}
