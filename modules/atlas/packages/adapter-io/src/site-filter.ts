// @atlas/adapter-io — src/site-filter.ts  (genesis-hardening A5 — which tracked files may be a mining site)
//
// The mined frontier was every tracked file with churn or coupling, so tests, fixtures, lockfiles, docs and
// generated code competed with source for the 200-site budget — and, through `git blame`, decided whether the
// history was "concentrated" at all. This is the ONE predicate that keeps them out. The history source
// applies it where tracked paths enter (so an excluded file contributes no churn, no coupling and no blame),
// and the structural fallback applies the same predicate to its seeds.
//
// THE RULES, in order, last match wins (gitignore-style):
//   1. a file git marks `linguist-generated` (`.gitattributes`) is excluded;
//   2. `DEFAULT_MINE_EXCLUDE`;
//   3. the operator's `.atlas/mine-exclude`, one pattern per line, `#` comments, `!pattern` re-includes —
//      so a default can be undone without a code change.
// Then, when the repository has a code index with at least one document, only a file the index covers is
// kept: a site the index cannot see has no edges and no candidates. An index with no documents (or none at
// all) skips that leg.
//
// TOTAL: a git failure here (no repository, git absent) reads as "no file is generated" — the history
// source's own reads are what report a broken git, loudly. Computed lazily, once, on the first query.

import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { runGit } from "./run-git.js"
import { readScipOrEmpty, SCIP_INDEX_REL } from "./scip.js"

/** The default exclusions: test and fixture trees, benchmarks, generated code, lockfiles, docs and data,
 *  Atlas's own store, and two trees of this repository that are not product source. */
const DEFAULT_MINE_EXCLUDE: readonly string[] = [
  "**/test/**",
  "**/tests/**",
  "**/e2e*/**",
  "**/fixture*/**",
  "**/__*__/**",
  "*.test.*",
  "*.spec.*",
  "test_*.py",
  "*_test.py",
  "**/benches/**",
  "**/generated*/**",
  "bun.lock",
  "package-lock.json",
  "yarn.lock",
  "pnpm-lock.yaml",
  "Cargo.lock",
  "uv.lock",
  "poetry.lock",
  "*.md",
  "*.json",
  "docs/**",
  ".atlas/**",
  "*.stories.*",
  "modules/atlas/**",
  "native/omni/qa/**",
]

/** Repo-relative path of the operator's override file (see the header). */
const MINE_EXCLUDE_REL = ".atlas/mine-exclude"

/** `true` ⇒ the repo-relative `path` may be a mining site. */
export type SiteFilter = (path: string) => boolean

/** Build the site filter for the repository at `repoPath` (see the header for the rules). */
export function createSiteFilter(repoPath: string): SiteFilter {
  let state: FilterState | undefined
  return (path) => {
    state ??= {
      rules: [...DEFAULT_MINE_EXCLUDE.map((p) => ruleOf(p)), ...operatorRules(repoPath)],
      generated: generatedPaths(repoPath),
      ...coveredPaths(repoPath),
    }
    const keep = state.rules.reduce((k, r) => (r.match.test(path) ? r.include : k), !state.generated.has(path))
    return keep && (state.covered === undefined || state.covered.has(path))
  }
}

interface Rule {
  readonly match: RegExp
  readonly include: boolean
}

interface FilterState {
  readonly rules: readonly Rule[]
  readonly generated: ReadonlySet<string>
  readonly covered?: ReadonlySet<string>
}

/** One pattern as a rule. A pattern with no `/` matches a basename anywhere; one with a `/` is anchored at
 *  the repository root. `**` spans any number of directories, `*` and `?` stay inside one segment. */
function ruleOf(pattern: string, include = false): Rule {
  if (!pattern.includes("/")) return { match: new RegExp(`^(?:.*/)?${segmentOf(pattern)}$`), include }
  const segments = pattern.replace(/^\//, "").split("/")
  const last = segments.length - 1
  const body = segments
    .map((s, i) => (s === "**" ? (i === last ? ".*" : "(?:[^/]+/)*") : segmentOf(s) + (i === last ? "" : "/")))
    .join("")
  return { match: new RegExp(`^${body}$`), include }
}

function segmentOf(segment: string): string {
  return segment
    .split("")
    .map((c) => (c === "*" ? "[^/]*" : c === "?" ? "[^/]" : c.replace(/[.+^${}()|[\]\\]/g, "\\$&")))
    .join("")
}

function operatorRules(repoPath: string): readonly Rule[] {
  const file = join(repoPath, MINE_EXCLUDE_REL)
  if (!existsSync(file)) return []
  return readFileSync(file, "utf8")
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith("#"))
    .map((l) => (l.startsWith("!") ? ruleOf(l.slice(1), true) : ruleOf(l)))
}

/** Tracked files git marks `linguist-generated` (set or `true`), via one `check-attr --stdin` over
 *  `ls-files`. Empty on any git failure (see TOTAL in the header). */
function generatedPaths(repoPath: string): ReadonlySet<string> {
  try {
    const tracked = runGit(repoPath, ["ls-files", "-z"])
    if (tracked.length === 0) return new Set()
    const out = runGit(repoPath, ["check-attr", "-z", "--stdin", "linguist-generated"], { input: tracked })
    // `-z` output is `<path>\0<attribute>\0<value>\0` per path.
    const fields = out.split("\0")
    return new Set(
      Array.from({ length: Math.floor(fields.length / 3) }, (_, i) => fields.slice(i * 3, i * 3 + 3))
        .filter(([, , value]) => value === "set" || value === "true")
        .map(([p]) => p!),
    )
  } catch {
    return new Set()
  }
}

/** The document paths of the merged code index, or nothing when there is no index with a document. */
function coveredPaths(repoPath: string): { readonly covered?: ReadonlySet<string> } {
  const docs = readScipOrEmpty(join(repoPath, SCIP_INDEX_REL)).documents
  return docs.length === 0 ? {} : { covered: new Set(docs.map((d) => d.relativePath)) }
}
