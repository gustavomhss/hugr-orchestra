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
//   TOTALITY  — history is a BOOSTER, never a dependency (GEN-15). `probeHistory` (rank.ts:310) is called
//     by the mine driver with NO try/catch, so a throw here aborts genesis. Every git read is therefore
//     absorbed and fails CLOSED toward the `thin` verdict (⇒ structural centrality), never upward.

import type { StructRef } from "@atlas/contracts"
import type { HistorySource, MinedSignals } from "@atlas/genesis"
import { nodeHashOfPath } from "@atlas/index"
import { asSubtreeHash } from "@atlas/kernel"
import { runGit } from "./run-git.js"

/** All git I/O flows through the ONE shared no-shell seam (#74), absorbed so this module is TOTAL: a bad
 *  rev, a repo with no commits (`rev-list HEAD` is a hard failure there), a non-git dir or an absent git
 *  binary yields `fallback`, never a throw. The happy path is byte-identical to an unguarded call. */
const git = (repo: string, args: readonly string[], fallback = ""): string => {
  try {
    return runGit(repo, args)
  } catch {
    return fallback
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

/** Message-based SZZ: a bug-fixing commit subject (Śliwerski–Zimmermann–Zeller). The ONE definition,
 *  consumed by `signals().szzBugCommits` — the frontier no longer has an SZZ leg (see below). */
const FIX_SUBJECT = /^fix/i

/** Hotspot bar: a file must have been CHANGED after introduction (≥2 touching commits). A file added once
 *  and never touched again has change-frequency 0 — it is un-churned code, which REQ-GEN-3b forbids from
 *  raising spend (`frontierBudget` IS the ranked-site count, genesis/rank.ts:370). */
const HOTSPOT_MIN_CHURN = 2

/**
 * NO SZZ LEG HERE — deleted (#181 fixup), not merely retuned. The single-pass walk below bumps `churn`
 * unconditionally per touching commit and bumps `szz` ONLY inside the `isFix` branch of that SAME loop,
 * so `szz(f) ≤ churn(f)` holds for every file by construction. Consequently a `szz >= T` leg is either:
 *   - REDUNDANT, for any `T >= HOTSPOT_MIN_CHURN` (whatever it admits, churn already admits — provably
 *     dead code, verified empirically: the admitted frontier at `szz >= 2` was byte-identical, member for
 *     member, to `churn >= 2 || coupling >= 2` alone, on both Atlas itself and a synthetic fixture); or
 *   - a BYPASS of the recurrence bar, for any `T < HOTSPOT_MIN_CHURN` (`T = 1`, the original defect: one
 *     `fix:`-subject commit touching a file admitted it on that single touch, collapsing the frontier
 *     toward "every file a `fix:` commit ever touched" in a conventional-commits repo).
 * Every value of the threshold is therefore either dead or wrong — there is no `T` that adds a file the
 * churn bar wouldn't. Rather than ship a constant that provably cannot do anything, the leg is gone.
 *
 * What is actually lost: `reference/atlas-genesis.md:56-58` describes the GEN-11 personalization vector
 * as the union of the hotspot / SZZ / coupling frontiers. There is no SZZ frontier now, and there never
 * validly could be one shaped like this — this is not SZZ. Real Śliwerski–Zimmermann–Zeller identifies
 * bug-INTRODUCING commits by blaming the lines a later fix touched; that selects a set that is largely
 * DISJOINT from the fix commits themselves (often a low-churn file nobody would otherwise mine — the
 * whole point of the algorithm). A message-match over a file's OWN commits (what this module can cheaply
 * compute from one `git log` pass) can only ever describe a SUBSET of that file's churn — never a
 * different file. Real SZZ (blame-based, cross-file) is a capability this repo does not have; it is named
 * here precisely so the gap is recoverable by design, not quietly rebuilt as a weaker same-file proxy.
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

/** One commit's mining record: its subject (SZZ) and the RAW paths it touched (churn + coupling basket). */
interface CommitBasket {
  readonly subject: string
  readonly files: readonly string[]
}

/** `<40-hex>\x1f<subject>` — the record header of the single-pass log walk below. */
const BASKET_HEADER = /^([0-9a-f]{40})\x1f([\s\S]*)$/

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
  const commits: Array<{ subject: string; files: string[] }> = []
  for (const raw of out.split("\0")) {
    const rec = raw.replace(/^\n+/, "")
    if (rec.length === 0) continue
    const header = BASKET_HEADER.exec(rec)
    if (header !== null) commits.push({ subject: header[2] ?? "", files: [] })
    else commits[commits.length - 1]?.files.push(rec)
  }
  return commits
}

/** A trivial per-key memo — `fn` runs at most once per distinct `key`, cached for the LIFETIME of the
 *  enclosing `createHistorySource` instance. Sufficient because every cached read here (`commitCount`,
 *  `shallow`, `blameConcentration`, `frontier`, `signals`) is a PURE function of `(repo, rev[, path])`: this
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
export function createHistorySource(repoPath: string, rev: string): HistorySource {
  /** SHAs of commits touching `qp` at `rev`, reverse-chronological (git-log order). */
  const commitsTouching = (qp: string): string[] => nonEmpty(git(repoPath, ["log", "--format=%H", rev, "--", qp]))

  /** The RAW tracked path set at a rev — the identity domain every emitted site is drawn from. */
  const trackedAt = (repo: string, r: string): string[] =>
    nulPaths(git(repo, ["ls-tree", "-r", "--name-only", "-z", r]))

  // Keyed on the ACTUAL call args (`repo\0rev`), not the closed-over `repoPath`/`rev` — see the `memo` note.
  const rk = (repo: string, r: string): string => `${repo}\0${r}`

  const commitCountMemo = memo((k: string): number => {
    const [repo, r] = k.split("\0") as [string, string]
    const n = Number(git(repo, ["rev-list", "--count", r]).trim())
    return Number.isFinite(n) ? n : 0
  })
  const shallowMemo = memo(
    (repo: string): boolean => git(repo, ["rev-parse", "--is-shallow-repository"], "true").trim() === "true",
  )
  const blameMemo = memo((k: string): number => {
    const [repo, r] = k.split("\0") as [string, string]
    const files = trackedAt(repo, r)
    const perCommit = new Map<string, number>()
    let total = 0
    const header = /^([0-9a-f]{40}) \d+ \d+/ // porcelain line-block header = <sha> <orig> <final> [n]
    for (const f of files) {
      const blame = git(repo, ["blame", "--line-porcelain", r, "--", f])
      for (const line of blame.split("\n")) {
        const sha = header.exec(line)?.[1]
        if (sha !== undefined) {
          perCommit.set(sha, (perCommit.get(sha) ?? 0) + 1)
          total += 1
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
    for (const commit of commitBaskets(repo, r)) {
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
  const signalsMemo = memo((qp: string): MinedSignals => {
    // messages — commit subjects touching qp, in git-log order (deterministic at a fixed rev; NOT sorted).
    const messages = nonEmpty(git(repoPath, ["log", "--format=%s", rev, "--", qp]))

    // szzBugCommits — message-based SZZ: subjects matching /^fix/i (deterministic).
    const szzBugCommits = messages.filter((s) => FIX_SUBJECT.test(s)).length

    // hotspot — change-frequency (churn count, complexity factor deferred to v0), --follow across renames.
    const hotspot = nonEmpty(git(repoPath, ["log", "--format=%H", "--follow", rev, "--", qp])).length

    // owners — distinct authors of commits touching qp, sorted.
    const owners = [...new Set(nonEmpty(git(repoPath, ["log", "--format=%an", rev, "--", qp])))].sort(byPath)

    // coChanged — distinct OTHER files that appeared in the same commits as qp, sorted by path.
    const co = new Set<string>()
    for (const sha of commitsTouching(qp)) {
      for (const f of nulPaths(git(repoPath, ["show", "--format=", "--name-only", "-z", sha]))) {
        if (f !== qp) co.add(f)
      }
    }
    const coChanged = [...co].sort(byPath).map(fileRef)

    return { hotspot, szzBugCommits, coChanged, owners, messages }
  })

  return {
    // rev-list count of commits reachable from rev. TOTAL: an unreadable/absent history counts 0, which
    // trips GEN-15's `low-commit-count` ⇒ thin ⇒ structural centrality (the honest fail-closed verdict).
    commitCount(repo, r) {
      return commitCountMemo(rk(repo, r))
    },

    // shallow-clone probe (repository-wide; rev unused — the frozen (repo,rev) shape is honoured).
    // TOTAL: an unreadable repo falls back to `true` — the CONSERVATIVE verdict (assume degenerate).
    shallow(repo, _r) {
      void _r
      return shallowMemo(repo)
    },

    // Over ALL tracked files at rev, aggregate per-commit blame attributions; return the single
    // most-attributed commit's share of total lines (0 when there are no lines). Deterministic.
    blameConcentration(repo, r) {
      return blameMemo(rk(repo, r))
    },

    // The GEN-11 personalization vector: the UNION of the hotspot / coupling frontiers (no SZZ leg — see
    // the comment beside `HOTSPOT_MIN_CHURN`; `reference/atlas-genesis.md:56-58` describes a third leg
    // this module cannot honestly compute), NOT every tracked file. A whole-repo frontier makes LLM spend
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
