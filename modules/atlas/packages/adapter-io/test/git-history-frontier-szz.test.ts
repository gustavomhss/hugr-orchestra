// @atlas/adapter-io — test/git-history-frontier-szz.test.ts
//
// Regression coverage for #181 (`git-history.ts` frontier admission). The original defect: the SZZ leg
// admitted a file on `szz.get(f) >= 1` — a SINGLE `fix:`-subject commit touching a file, short-circuiting
// `HOTSPOT_MIN_CHURN` entirely. In a conventional-commits repo that collapses the frontier toward "every
// file ever touched by a `fix:` commit" — the file-count-proportional LLM spend REQ-GEN-3a/3b forbid
// (`frontierBudget` IS the ranked-site count). The FIRST fix retuned the leg to `szz >= HOTSPOT_MIN_SZZ`
// (symmetric to `HOTSPOT_MIN_CHURN`); that threshold was then PROVEN redundant (`szz(f) <= churn(f)` for
// every file, by construction of the single-pass walk — a `szz >= T` leg can only ever be dead-weight for
// `T >= HOTSPOT_MIN_CHURN` or a bypass for `T < HOTSPOT_MIN_CHURN`) and the leg was DELETED outright — see
// the comment beside `HOTSPOT_MIN_CHURN` in `git-history.ts` for the proof. `frontier()` is now
// `churn >= HOTSPOT_MIN_CHURN || coupling >= COUPLING_MIN_SUPPORT`, no SZZ term.
//
// This suite owns a SMALL, LOCAL fixture (not the shared `git-sbx`/`fix-repo` oracles other WPs consume —
// those aren't shaped to isolate a single-fix-touch file from a two-fix-touch file at the frontier
// boundary). Every commit here touches exactly ONE file, so `churn` per file is exact and the `coupling`
// leg (which needs a ≥2-file basket) never interferes.
//
// Fixture topology (4 files, each with its own commit history):
//   fileA.ts — ONE commit total, subject `fix: …`     → churn=1  (the single-fix-touch file)
//   fileB.ts — TWO commits, BOTH `fix: …`               → churn=2  (the two-fix-touch file)
//   fileC.ts — TWO commits, one `chore:` one `fix:`      → churn=2  (churn-leg control, fix-subject-agnostic)
//   fileD.ts — ONE commit, `chore: …` (never a fix)      → churn=1  (negative control)
//
// Expected frontier — pinned as OUTPUT, not as a re-assertion of any constant (a constant test guards
// nothing; the arithmetic that consumes it is what must be pinned):
//   fileA.ts is ADMITTED against the pre-#181-fixup source (`szz >= 1`, szz=1) and EXCLUDED after (no SZZ
//   term at all now; churn=1 < HOTSPOT_MIN_CHURN=2) — this is the assertion that must fail there.
//   fileB.ts and fileC.ts stay admitted throughout (both clear churn>=2, independent of any fix: subject).
//   fileD.ts is never admitted (churn=1, no leg reaches it).

import { describe, it, expect, afterEach } from "vitest"
import { execFileSync } from "node:child_process"
import { mkdtempSync, writeFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { createHistorySource } from "../src/git-history.js"

interface SzzSbx {
  readonly repoPath: string
  readonly rev: string
  cleanup(): void
}

/** One-file-per-commit fixture: `commits` is `[filename, content, subject]` in commit order. */
function makeSzzSbx(commits: ReadonlyArray<readonly [string, string, string]>): SzzSbx {
  const repoPath = mkdtempSync(join(tmpdir(), "atlas-szz-churn-sbx-"))
  const git = (...args: string[]): void => {
    execFileSync("git", args, { cwd: repoPath, stdio: "pipe" })
  }
  git("init", "-q")
  git("config", "user.email", "fix@atlas.test")
  git("config", "user.name", "atlas-fixture")
  git("config", "commit.gpgsign", "false")
  for (const [file, content, subject] of commits) {
    writeFileSync(join(repoPath, file), content)
    git("add", file)
    git("commit", "-q", "-m", subject)
  }
  const rev = execFileSync("git", ["rev-parse", "HEAD"], { cwd: repoPath, encoding: "utf8" }).trim()
  return { repoPath, rev, cleanup: () => rmSync(repoPath, { recursive: true, force: true }) }
}

describe("git-history frontier — SZZ composes with the churn bar", () => {
  let sbx: SzzSbx | undefined
  afterEach(() => sbx?.cleanup())

  it("admits the two-fix / churn>=2 files, excludes the single-fix / churn=1 file", () => {
    sbx = makeSzzSbx([
      ["fileA.ts", "export const a = 1;\n", "fix: create and patch A"], // churn=1, szz=1
      ["fileB.ts", "export const b = 1;\n", "fix: create B with initial patch"], // churn=1, szz=1 so far
      ["fileB.ts", "export const b = 2;\n", "fix: patch B further"], // churn=2, szz=2
      ["fileC.ts", "export const c = 1;\n", "chore: add C"], // churn=1, szz=0 so far
      ["fileC.ts", "export const c = 2;\n", "fix: patch C"], // churn=2, szz=1
      ["fileD.ts", "export const d = 1;\n", "chore: add D only"], // churn=1, szz=0
    ])
    const { repoPath, rev } = sbx
    const hist = createHistorySource(repoPath, rev)

    const frontierPaths = hist.frontier(repoPath, rev).map((r) => r.qualifiedPath)

    // The pinned OUTPUT: churn-desc then path-asc (fileB/fileC tie at churn=2, fileB < fileC by path).
    expect(frontierPaths).toEqual(["fileB.ts", "fileC.ts"])

    // The load-bearing single assertion: the one-touch fix file must NOT reach the frontier. Against the
    // pre-fix source (`szz.get(f) >= 1`), fileA.ts (szz=1) WOULD be admitted — this line fails there.
    expect(frontierPaths).not.toContain("fileA.ts")
    // Negative control: the never-fixed, once-touched file is excluded either way (unaffected by SZZ).
    expect(frontierPaths).not.toContain("fileD.ts")
  })

  it("does not admit a solo fix: touch on its own (the exact bug this closes)", () => {
    // A fixture with ONLY the single-fix-touch file (no other file to satisfy churn/coupling), so the
    // frontier is empty iff there is genuinely no SZZ term left, not just a raised threshold.
    sbx = makeSzzSbx([["solo.ts", "export const solo = 1;\n", "fix: solo bug fix"]])
    const { repoPath, rev } = sbx
    const hist = createHistorySource(repoPath, rev)
    expect(hist.frontier(repoPath, rev)).toEqual([])
  })

  // Pins the property the #181 fixup arithmetic proof rests on, directly: a file whose sole touching
  // commit HAS a `fix:` subject is excluded on churn=1 alone — the fix-subject is not a distinct signal
  // in `frontier()` at all anymore. `control.ts` (two `chore:` touches, never a `fix:`) proves the harness
  // genuinely admits SOMETHING at churn>=2, so the exclusion above is not vacuous (an always-empty
  // frontier would pass the prior test for the wrong reason).
  it("a churn=1 file whose one commit IS a fix: is excluded — churn alone decides, no SZZ term", () => {
    sbx = makeSzzSbx([
      ["onlyFix.ts", "export const onlyFix = 1;\n", "fix: introduced with the patch"], // churn=1
      ["control.ts", "export const control = 1;\n", "chore: add control"], // churn=1 so far
      ["control.ts", "export const control = 2;\n", "chore: bump control"], // churn=2, never a fix:
    ])
    const { repoPath, rev } = sbx
    const hist = createHistorySource(repoPath, rev)
    const frontierPaths = hist.frontier(repoPath, rev).map((r) => r.qualifiedPath)
    expect(frontierPaths).toEqual(["control.ts"])
    expect(frontierPaths).not.toContain("onlyFix.ts")
  })
})
