// @atlas/adapter-io — test/git-history-szz.test.ts
//
// `signals().szzBugCommits` is blame-based SZZ: for each fix commit, the lines it deleted or changed are
// blamed at its parent, and the count is the number of distinct bug-introducing commits blamed in the file.
// Each case below is shaped so the old signal (a count of the file's own `fix`-subject commits) gives a
// different number, so a revert to it fails here.

import { describe, it, expect, afterEach } from "vitest"
import { execFileSync } from "node:child_process"
import { mkdtempSync, writeFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { createHistorySource } from "../src/git-history.js"

interface Repo {
  readonly repoPath: string
  readonly rev: string
  cleanup(): void
}

/** A temp repo with one commit per entry: `[subject, files to write]`, in order. */
function makeRepo(commits: ReadonlyArray<readonly [string, Readonly<Record<string, string>>]>): Repo {
  const repoPath = mkdtempSync(join(tmpdir(), "atlas-szz-"))
  const git = (...args: string[]): string => execFileSync("git", args, { cwd: repoPath, encoding: "utf8" })
  git("init", "-q")
  git("config", "user.email", "fix@atlas.test")
  git("config", "user.name", "atlas-fixture")
  git("config", "commit.gpgsign", "false")
  for (const [subject, files] of commits) {
    for (const [file, content] of Object.entries(files)) writeFileSync(join(repoPath, file), content)
    git("add", ".")
    git("commit", "-q", "-m", subject)
  }
  return { repoPath, rev: git("rev-parse", "HEAD").trim(), cleanup: () => rmSync(repoPath, { recursive: true, force: true }) }
}

const site = (qualifiedPath: string) => ({ kind: "file" as const, qualifiedPath, subtreeHash: "" as never })

describe("git-history SZZ (szzBugCommits)", () => {
  let repo: Repo | undefined
  afterEach(() => repo?.cleanup())

  it("counts the distinct commits that wrote the lines a fix changed, not the fix commits", () => {
    repo = makeRepo([
      ["feat: write calc", { "calc.ts": "a\nb = buggy\nc\n", "guard.ts": "x\n", "calc.test.ts": "t1\n" }],
      ["chore: extend calc", { "calc.ts": "a\nb = buggy\nc = buggy too\nd\n" }],
      // One fix: changes line 2 (from `feat`) and line 3 (from `chore`) of calc.ts; only appends to
      // guard.ts; changes calc.test.ts, which the default site filter excludes.
      [
        "fix: calc",
        { "calc.ts": "a\nb = ok\nc = ok\nd\n", "guard.ts": "x\ny\n", "calc.test.ts": "t2\n" },
      ],
      // Not a fix: `fixture` is not the word `fix`.
      ["fixture: reshape d", { "calc.ts": "a\nb = ok\nc = ok\nd2\n" }],
    ])
    const hist = createHistorySource(repo.repoPath, repo.rev)

    // Two bug-introducing commits for one fix commit (the old count said 1).
    expect(hist.signals(site("calc.ts")).szzBugCommits).toBe(2)
    // A pure addition deleted nothing, so blames nothing (the old count said 1).
    expect(hist.signals(site("guard.ts")).szzBugCommits).toBe(0)
    // Excluded by the site filter (the old count said 1).
    expect(hist.signals(site("calc.test.ts")).szzBugCommits).toBe(0)
  })

  it("does not blame a lone line a later commit only re-indented (-w)", () => {
    repo = makeRepo([
      ["feat: write f", { "f.ts": "if (x) {\nreturn bad\n}\n" }],
      ["chore: indent", { "f.ts": "if (x) {\n  return bad\n}\n" }],
      ["fix: f", { "f.ts": "if (x) {\n  return good\n}\n" }],
    ])
    const hist = createHistorySource(repo.repoPath, repo.rev)
    // The changed line's content came from `feat`; the whitespace-only `chore` is not its author.
    const feat = execFileSync("git", ["rev-parse", "HEAD~2"], { cwd: repo.repoPath, encoding: "utf8" }).trim()
    const blamed = execFileSync("git", ["blame", "--porcelain", "-w", "-L", "2,2", "HEAD~1", "--", "f.ts"], {
      cwd: repo.repoPath,
      encoding: "utf8",
    })
    expect(blamed.split(" ")[0]).toBe(feat)
    expect(hist.signals(site("f.ts")).szzBugCommits).toBe(1)
  })

  it("skips a fix that modifies more kept files than the per-fix cap", () => {
    // 51 files (one past SZZ_MAX_FILES_PER_FIX), each changed by one sweeping fix.
    const names = Array.from({ length: 51 }, (_, i) => `m${String(i).padStart(2, "0")}.ts`)
    repo = makeRepo([
      ["feat: many", Object.fromEntries(names.map((n) => [n, "v = 1\n"]))],
      ["fix: sweep", Object.fromEntries(names.map((n) => [n, "v = 2\n"]))],
    ])
    const hist = createHistorySource(repo.repoPath, repo.rev)
    expect(names.map((n) => hist.signals(site(n)).szzBugCommits)).toEqual(names.map(() => 0))

    // Control: the same edit to 50 files is blamed, so the zero above is the cap, not a broken blame.
    repo.cleanup()
    const fifty = names.slice(0, 50)
    repo = makeRepo([
      ["feat: many", Object.fromEntries(fifty.map((n) => [n, "v = 1\n"]))],
      ["fix: sweep", Object.fromEntries(fifty.map((n) => [n, "v = 2\n"]))],
    ])
    const capped = createHistorySource(repo.repoPath, repo.rev)
    expect(fifty.map((n) => capped.signals(site(n)).szzBugCommits)).toEqual(fifty.map(() => 1))
  })

  it("every file with an SZZ count is already in the churn frontier (why SZZ is no frontier leg)", () => {
    repo = makeRepo([
      ["feat: a and b", { "a.ts": "a1\na2\n", "b.ts": "b1\n" }],
      ["fix: a", { "a.ts": "a1\nA2\n" }],
      ["feat: c", { "c.ts": "c1\n" }],
      ["fix: b", { "b.ts": "B1\n" }],
    ])
    const hist = createHistorySource(repo.repoPath, repo.rev)
    const frontier = hist.frontier(repo.repoPath, repo.rev).map((r) => r.qualifiedPath)
    const positive = ["a.ts", "b.ts", "c.ts"].filter((f) => hist.signals(site(f)).szzBugCommits > 0)
    expect(positive).toEqual(["a.ts", "b.ts"])
    for (const f of positive) expect(frontier).toContain(f)
  })

  it("is byte-identical across two instances at a fixed rev", () => {
    repo = makeRepo([
      ["feat: x", { "x.ts": "1\n2\n3\n" }],
      ["feat: y", { "x.ts": "1\n2b\n3\n" }],
      ["fix: x", { "x.ts": "1b\n2c\n3\n" }],
    ])
    const a = createHistorySource(repo.repoPath, repo.rev)
    const b = createHistorySource(repo.repoPath, repo.rev)
    expect(a.signals(site("x.ts")).szzBugCommits).toBe(2)
    expect(JSON.stringify(a.signals(site("x.ts")))).toBe(JSON.stringify(b.signals(site("x.ts"))))
  })
})
