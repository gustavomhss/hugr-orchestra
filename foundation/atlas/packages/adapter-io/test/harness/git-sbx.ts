// @atlas/adapter-io — test/harness/git-sbx.ts
//
// SHARED FIXTURE HARNESS (campaign-9 slice) — the committed `git-sbx` git-topology oracle. FROZEN by the
// orchestrator: the DRIFT (WP-9.2.5.DRIFT) and HISTORY (WP-9.3.6-a.HISTORY) WPs CONSUME this; neither
// redefines it (that would fork the oracle and break cross-WP parity). It provides ONLY the real repo +
// the captured SHAs — each WP computes its own oracles (DriftPair sets / MinedSignals) over this substrate,
// exactly as `fix-repo.ts` provides the repo + `T_ref` and lets SCIP/INDEX derive their own.
//
// Topology (all SHAs captured from the SAME bytes committed to disk, so oracle ↔ disk cannot drift):
//   C0  ── seed = the exact fix-repo bytes; `src/util.ts` authors greet() v0   → captured as `cGreet`
//   C1  ── `feat: add farewell`          — util.ts (append farewell) + app.ts  (temporal coupling)
//   C2  ── `fix: correct farewell casing`— util.ts + app.ts together           (SZZ bug-fix signal)
//   mb  ── HEAD after C2 = merge-base; branches `main` and `topic` root here    → captured as `mb`
//   topic: A `feat: reword greet` (greet BODY change) ; X `chore: bump answer` (service.py 42→43) → topicTip
//   main : X' `chore: bump answer` (service.py 42→43, identical to X)                               → mainTip
// Left checked out on `topic` (HEAD == topicTip = the drift "now" tip). greet's body line is NEVER
// rewritten off C0 except on `topic`, so blame(greet) at `main`/r0 still attributes to `cGreet`.

import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, dirname } from "node:path"
import { execFileSync } from "node:child_process"

// ── C0 seed: the exact fix-repo bytes (verbatim from fix-repo.ts:24-31 — cross-adapter parity). ──────
// `src/util.ts` DEFINES greet() v0; the body line `return `hi ${name}`;` is the blame target for cGreet.
const SEED: Readonly<Record<string, string>> = {
  ".gitignore": "dist/\n*.log\n",
  "api/service.py": "def compute():\n    return 42\n",
  "legacy/report.rb": "def report\n  'legacy'\nend\n",
  "src/app.ts":
    "import { greet } from './util';\n\nexport function main(): string {\n  return greet('world') + missingHelper();\n}\n",
  "src/util.ts": "export function greet(name: string): string {\n  return `hi ${name}`;\n}\n",
}

// ── Evolved file bodies (greet's lines 1-3 stay byte-identical to SEED through C1/C2 and on `main`). ──
// C1: farewell appended below greet (greet untouched); app.ts imports + calls farewell.
const UTIL_C1 =
  "export function greet(name: string): string {\n  return `hi ${name}`;\n}\n\n" +
  "export function farewell(name: string): string {\n  return `bye ${name}`;\n}\n"
const APP_C1 =
  "import { greet, farewell } from './util';\n\nexport function main(): string {\n" +
  "  return greet('world') + missingHelper() + farewell('world');\n}\n"
// C2: `fix:` casing correction to farewell (greet still untouched); coupled util.ts + app.ts.
const UTIL_C2 =
  "export function greet(name: string): string {\n  return `hi ${name}`;\n}\n\n" +
  "export function farewell(name: string): string {\n  return `Bye ${name}`;\n}\n"
const APP_C2 =
  "import { greet, farewell } from './util';\n\nexport function main(): string {\n" +
  "  return greet('world') + missingHelper() + farewell('World');\n}\n"
// topic/A: greet BODY reworded (`hi` → `hello`); farewell stays at the C2 value.
const UTIL_TOPIC_A =
  "export function greet(name: string): string {\n  return `hello ${name}`;\n}\n\n" +
  "export function farewell(name: string): string {\n  return `Bye ${name}`;\n}\n"
// X / X': the shared `service.py` bump (42 → 43), byte-identical on both branches.
const SERVICE_X = "def compute():\n    return 43\n"

export interface GitSbx {
  /** Absolute path to the materialized temp git repo, checked out on `topic` (HEAD == topicTip). */
  readonly repoPath: string
  /** merge-base(main, topic) — full 40-hex SHA (HEAD after C2). */
  readonly mb: string
  /** `main` HEAD (== r0). Full SHA. */
  readonly mainTip: string
  /** `topic` HEAD (== HEAD of the checked-out repo). Full SHA. */
  readonly topicTip: string
  /** The commit that authored greet() (C0) — the blame target for greet's body line. Full SHA. */
  readonly cGreet: string
  /** HISTORY's pinned rev == mainTip (greet at `main` still attributes to cGreet). Full SHA. */
  readonly r0: string
  /** Remove the temp repo. Call in an `afterEach`/`finally`. */
  cleanup(): void
}

/**
 * Materialize the `git-sbx` topology into a fresh temp dir with a REAL git repo, capturing every SHA with
 * `git rev-parse HEAD` right after the relevant commit. Deterministic: identical committed bytes every
 * call (no wall-clock/nonce in any tracked file; gpgsign disabled). Returns the repo + captured SHAs +
 * `cleanup()`; the repo is left checked out on `topic`.
 */
export function makeGitSbx(): GitSbx {
  const repoPath = mkdtempSync(join(tmpdir(), "atlas-git-sbx-"))
  const write = (rel: string, content: string): void => {
    const abs = join(repoPath, rel)
    mkdirSync(dirname(abs), { recursive: true })
    writeFileSync(abs, content)
  }
  const git = (...args: string[]): void => {
    execFileSync("git", args, { cwd: repoPath, stdio: "pipe" })
  }
  const head = (): string => execFileSync("git", ["rev-parse", "HEAD"], { cwd: repoPath, encoding: "utf8" }).trim()

  git("init", "-q")
  git("config", "user.email", "fix@atlas.test")
  git("config", "user.name", "atlas-fixture")
  git("config", "commit.gpgsign", "false")

  // C0 — seed (authors greet() v0).
  for (const [rel, content] of Object.entries(SEED)) write(rel, content)
  git("add", ".")
  git("commit", "-q", "-m", "chore: seed fix-repo")
  const cGreet = head()

  // C1 — temporal coupling util.ts ↔ app.ts (add farewell); greet's body line untouched.
  write("src/util.ts", UTIL_C1)
  write("src/app.ts", APP_C1)
  git("add", ".")
  git("commit", "-q", "-m", "feat: add farewell")

  // C2 — coupled fix (SZZ bug-fix signal); greet's body line still untouched.
  write("src/util.ts", UTIL_C2)
  write("src/app.ts", APP_C2)
  git("add", ".")
  git("commit", "-q", "-m", "fix: correct farewell casing")

  // mb — the merge-base; root both branches here.
  const mb = head()
  git("branch", "main")
  git("branch", "topic")

  // topic — A (greet BODY change) then X (shared service.py bump). X is HEAD ⇒ A at HEAD~1.
  git("checkout", "-q", "topic")
  write("src/util.ts", UTIL_TOPIC_A)
  git("add", ".")
  git("commit", "-q", "-m", "feat: reword greet")
  write("api/service.py", SERVICE_X)
  git("add", ".")
  git("commit", "-q", "-m", "chore: bump answer")
  const topicTip = head()

  // main — X' (shared service.py bump, identical to X); greet never touched here.
  git("checkout", "-q", "main")
  write("api/service.py", SERVICE_X)
  git("add", ".")
  git("commit", "-q", "-m", "chore: bump answer")
  const mainTip = head()

  // Leave checked out on `topic` (the drift "now" tip DRIFT reads).
  git("checkout", "-q", "topic")

  return {
    repoPath,
    mb,
    mainTip,
    topicTip,
    cGreet,
    r0: mainTip,
    cleanup: () => {
      try {
        rmSync(repoPath, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 })
      } catch (err) {
        // Teardown must never fail an otherwise-green suite. rmSync on a live git repo dir can race
        // ENOTEMPTY/EBUSY/EPERM under CI load even with maxRetries; warn and move on (regression: git-sbx
        // teardown flaked the gate, passed clean in isolation).
        console.warn(
          `git-sbx cleanup: could not remove ${repoPath}: ${err instanceof Error ? err.message : String(err)}`,
        )
      }
    },
  }
}
