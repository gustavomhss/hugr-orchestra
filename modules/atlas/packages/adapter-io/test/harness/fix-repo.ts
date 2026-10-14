// @atlas/adapter-io — test/harness/fix-repo.ts
//
// SHARED FIXTURE HARNESS (campaign-9.1 slice) — the committed multi-language `fix-repo` oracle from
// goldens-adapters.md §Fixture universe. FROZEN by the orchestrator: the FS / SCIP / INDEX / AST WPs
// CONSUME this; no WP redefines it (that would fork the oracle and break cross-adapter parity).
//
// It materializes the repo into a temp dir with a REAL git repo, so a walker backed by `git ls-files`
// (or any faithful .gitignore-honoring walk) naturally excludes the gitignored paths (`dist/`, `*.log`).
// `T_ref` is the deterministic reference `FileTree` (the walker's conformance oracle) — derived from the
// SAME `FILES` constant that is written to disk, so the bytes on disk and the bytes in the oracle cannot
// drift apart.

import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, dirname } from "node:path"
import { execFileSync } from "node:child_process"
import type { FileTree } from "@atlas/index"

// ── The tracked file set (the exact bytes the walker must reproduce as leaf `content`) ──────────────
// Contents are minimal + deterministic and set up the SCIP oracle downstream: `src/util.ts` DEFINES
// `greet`; `src/app.ts` imports+calls `greet` (→ resolvable ref) AND calls `missingHelper()` (→ dangling
// ref, no in-index definition); `api/service.py` defines `compute()` (a second indexed language);
// `legacy/report.rb` has no configured indexer (an honest files-only structural hole).
const FILES: Readonly<Record<string, string>> = {
  ".gitignore": "dist/\n*.log\n",
  "api/service.py": "def compute():\n    return 42\n",
  "legacy/report.rb": "def report\n  'legacy'\nend\n",
  "src/app.ts":
    "import { greet } from './util';\n\nexport function main(): string {\n  return greet('world') + missingHelper();\n}\n",
  "src/util.ts": "export function greet(name: string): string {\n  return `hi ${name}`;\n}\n",
}

// Untracked-but-on-disk paths: written to the working tree, EXCLUDED from the commit by `.gitignore`.
// A faithful walker MUST NOT emit these — they are the negative witnesses for SCN-ADAPTER-1a/1c.
const UNTRACKED: Readonly<Record<string, string>> = {
  "dist/bundle.js": "// built artifact — gitignored\n",
  "debug.log": "noise — gitignored\n",
}

/** The exact tracked paths, in the deterministic sorted order the walk must yield. */
export const TRACKED_PATHS: readonly string[] = [
  ".gitignore",
  "api/service.py",
  "legacy/report.rb",
  "src/app.ts",
  "src/util.ts",
]

const leaf = (path: string, content: string): FileTree => ({ path, children: [], content })
const dir = (path: string, children: readonly FileTree[]): FileTree => ({ path, children })

/**
 * The reference `FileTree` — the conformance oracle for the walker (SCN-ADAPTER-1a-1). Node `path` is the
 * repo-relative POSIX path (root = `.`); directories carry `children` and no `content`; files are leaves
 * (`children: []`) with their exact bytes. Sibling order is ASCII-sorted by `path`
 * (`.gitignore` < `api` < `legacy` < `src`; within `src`, `app.ts` < `util.ts`). `dist/` and `debug.log`
 * are ABSENT (gitignored).
 */
export const T_ref: FileTree = dir(".", [
  leaf(".gitignore", FILES[".gitignore"]!),
  dir("api", [leaf("api/service.py", FILES["api/service.py"]!)]),
  dir("legacy", [leaf("legacy/report.rb", FILES["legacy/report.rb"]!)]),
  dir("src", [leaf("src/app.ts", FILES["src/app.ts"]!), leaf("src/util.ts", FILES["src/util.ts"]!)]),
])

export interface FixRepo {
  /** Absolute path to the materialized temp git repo. */
  readonly repoPath: string
  /** Remove the temp repo. Call in an `afterEach`/`finally`. */
  cleanup(): void
}

/**
 * Materialize `fix-repo` into a fresh temp dir with a real git repo (tracked files committed; the two
 * gitignored paths written to the working tree but excluded from the commit). Returns the path + a
 * `cleanup()`. Deterministic: identical bytes every call (no clock/nonce in any tracked file).
 */
export function makeFixRepo(): FixRepo {
  const repoPath = mkdtempSync(join(tmpdir(), "atlas-fix-repo-"))
  const write = (rel: string, content: string): void => {
    const abs = join(repoPath, rel)
    mkdirSync(dirname(abs), { recursive: true })
    writeFileSync(abs, content)
  }
  for (const [rel, content] of Object.entries(FILES)) write(rel, content)
  for (const [rel, content] of Object.entries(UNTRACKED)) write(rel, content)

  const git = (...args: string[]): void => {
    execFileSync("git", args, { cwd: repoPath, stdio: "pipe" })
  }
  git("init", "-q")
  git("config", "user.email", "fix@atlas.test")
  git("config", "user.name", "atlas-fixture")
  git("config", "commit.gpgsign", "false")
  git("add", ".") // `.gitignore` (committed here too) makes `add .` skip dist/ + *.log
  git("commit", "-q", "-m", "fix-repo")
  return {
    repoPath,
    cleanup: () => rmSync(repoPath, { recursive: true, force: true }),
  }
}
