// @atlas/adapter-io — test/git-history.test.ts   (WP-9.3.6-a.HISTORY — REQ-ADAPTER-8a/8b/8c)
//
// Acceptance suite for the real-git `HistorySource` (ADAPT-GIT-1). Transcribes the frozen goldens
// (docs/requirements/goldens-adapters.md SCN-ADAPTER-8a/8b/8c) over the SHARED `git-sbx` fixture — which
// this WP CONSUMES verbatim (never redefines):
//   • SCN-ADAPTER-8a-1 — signals equal the real git output at r0 (vs an in-test oracle)      (happy)
//   • SCN-ADAPTER-8b-1 — the signals are byte-identical across two runs at a fixed rev        (happy)
//   • SCN-ADAPTER-8c-1 — ranking mints no fact (a fact-store write-spy records 0 mints)       (guard)
//
// The 8a oracle recomputes each signal with the SAME git commands the adapter shells, at the SAME rev r0
// (== mainTip; the fixture is checked out on `topic`, so every read is rev-scoped). A hardcoded stub would
// diverge from the oracle (8a teeth); an unsorted list would diverge across runs (8b teeth); an upsert
// would fire the spy (8c teeth).

import { describe, it, expect, afterEach } from "vitest"
import { execFileSync } from "node:child_process"
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { createHistorySource } from "../src/git-history.js"
import { makeGitSbx, type GitSbx } from "./harness/git-sbx.js"

// ── in-test git oracle (the SAME commands the adapter uses) ─────────────────────────────────────────
const g = (repo: string, ...args: string[]): string => execFileSync("git", args, { cwd: repo, encoding: "utf8" })
const nonEmpty = (out: string): string[] => out.split("\n").filter((l) => l.length > 0)
const byPath = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0)

describe("git-history HistorySource (ADAPT-GIT-1)", () => {
  let sbx: GitSbx | undefined
  afterEach(() => sbx?.cleanup())

  const QP = "src/util.ts" // the fixture's greet()/farewell() coupling site.

  // ── SCN-ADAPTER-8a — real git signals at r0 (vs oracle) ───────────────────────────────────────────
  it("SCN-ADAPTER-8a — signals equal the real-git oracle at r0", () => {
    sbx = makeGitSbx()
    const { repoPath, r0, cGreet } = sbx
    const hist = createHistorySource(repoPath, r0)

    // commitCount == git rev-list --count r0.
    expect(hist.commitCount(repoPath, r0)).toBe(Number(g(repoPath, "rev-list", "--count", r0).trim()))

    // blameConcentration — recompute the top-commit line share over ALL tracked files at r0.
    const files = nonEmpty(g(repoPath, "ls-tree", "-r", "--name-only", r0))
    const perCommit = new Map<string, number>()
    let total = 0
    const header = /^([0-9a-f]{40}) \d+ \d+/
    for (const f of files) {
      for (const line of g(repoPath, "blame", "--line-porcelain", r0, "--", f).split("\n")) {
        const sha = header.exec(line)?.[1]
        if (sha !== undefined) {
          perCommit.set(sha, (perCommit.get(sha) ?? 0) + 1)
          total += 1
        }
      }
    }
    const oracleBlame = total === 0 ? 0 : Math.max(...perCommit.values()) / total
    expect(hist.blameConcentration(repoPath, r0)).toBe(oracleBlame)
    expect(oracleBlame).toBeGreaterThan(0) // the fixture has tracked lines (guards a vacuous 0==0).

    // signals(src/util.ts) — field-by-field against the oracle.
    const s = hist.signals({ kind: "file", qualifiedPath: QP, subtreeHash: "" as never })

    const oMessages = nonEmpty(g(repoPath, "log", "--format=%s", r0, "--", QP))
    expect(s.messages).toEqual(oMessages)
    expect(oMessages).toContain("fix: correct farewell casing") // the SZZ commit is present at r0.

    // SZZ: the C2 fix changed farewell's body, which C1 (`feat: add farewell`) wrote — one bug-introducing
    // commit, and it is not the fix itself. The full SZZ suite is git-history-szz.test.ts.
    const farewellBlame = g(repoPath, "blame", "--line-porcelain", "-L", "6,6", `${r0}~2`, "--", QP)
    expect(g(repoPath, "log", "-1", "--format=%s", farewellBlame.split(" ")[0]!).trim()).toBe("feat: add farewell")
    expect(s.szzBugCommits).toBe(1)

    // Weighted hotspot, not the raw `--follow` count. A file with history scores strictly above that
    // count (the newest commit alone weighs 128), so the old equality cannot stay green by accident.
    const churn = nonEmpty(g(repoPath, "log", "--format=%H", "--follow", r0, "--", QP))
    expect(s.hotspot).toBe(oracleHotspot(repoPath, r0, QP))
    expect(s.hotspot).toBeGreaterThan(churn.length)

    const oOwners = [...new Set(nonEmpty(g(repoPath, "log", "--format=%an", r0, "--", QP)))].sort(byPath)
    expect(s.owners).toEqual(oOwners)

    // coChanged oracle — OTHER files in each commit touching QP (per-commit full set), sorted by path.
    const co = new Set<string>()
    for (const sha of nonEmpty(g(repoPath, "log", "--format=%H", r0, "--", QP))) {
      for (const f of nonEmpty(g(repoPath, "show", "--format=", "--name-only", sha))) {
        if (f !== QP) co.add(f)
      }
    }
    const oCoPaths = [...co].sort(byPath)
    expect(s.coChanged.map((r) => r.qualifiedPath)).toEqual(oCoPaths)
    expect(oCoPaths).toContain("src/app.ts") // the designed util.ts ↔ app.ts temporal coupling.

    // blame attributes greet's body to cGreet (the golden's anchor claim) — the top blame commit at r0
    // for util.ts's greet line is cGreet, never a stub SHA.
    const greetBlame = g(repoPath, "blame", "--line-porcelain", "-L", "2,2", r0, "--", QP)
    expect(greetBlame.split("\n")[0]!.split(" ")[0]).toBe(cGreet)
  })

  // ── SCN-ADAPTER-8b — byte-identical across two runs at a fixed rev ────────────────────────────────
  it("SCN-ADAPTER-8b — signals are byte-identical across two runs at r0", () => {
    sbx = makeGitSbx()
    const { repoPath, r0 } = sbx
    const site = { kind: "file" as const, qualifiedPath: QP, subtreeHash: "" as never }

    const runA = createHistorySource(repoPath, r0)
    const runB = createHistorySource(repoPath, r0)

    // Every emitted list must be canonically sorted (not git/Map order), so two runs stringify identically.
    expect(JSON.stringify(runA.signals(site))).toBe(JSON.stringify(runB.signals(site)))
    expect(JSON.stringify(runA.frontier(repoPath, r0))).toBe(JSON.stringify(runB.frontier(repoPath, r0)))
    expect(runA.commitCount(repoPath, r0)).toBe(runB.commitCount(repoPath, r0))
    expect(runA.blameConcentration(repoPath, r0)).toBe(runB.blameConcentration(repoPath, r0))
    expect(runA.shallow(repoPath, r0)).toBe(runB.shallow(repoPath, r0))

    // Teeth-guard: the coChanged / owners lists ARE in sorted order (an unsorted git/Map order could
    // differ run-to-run). Assert stable sortedness directly.
    const co = runA.signals(site).coChanged.map((r) => r.qualifiedPath)
    expect(co).toEqual([...co].sort(byPath))
    const owners = runA.signals(site).owners
    expect(owners).toEqual([...owners].sort(byPath))
    // frontier is non-empty and reproduces byte-identically (the JSON equality above is its 8b teeth).
    expect(runA.frontier(repoPath, r0).length).toBeGreaterThan(0)
  })

  // ── SCN-ADAPTER-8c — ranking mints no fact ────────────────────────────────────────────────────────
  it("SCN-ADAPTER-8c — computing signals/frontier mints 0 facts (structural: no store seam)", () => {
    sbx = makeGitSbx()
    const { repoPath, r0 } = sbx

    // Drive every HistorySource method — none may reach a fact store.
    const hist = createHistorySource(repoPath, r0)
    const site = { kind: "file" as const, qualifiedPath: QP, subtreeHash: "" as never }
    hist.signals(site)
    hist.frontier(repoPath, r0)
    hist.commitCount(repoPath, r0)
    hist.blameConcentration(repoPath, r0)
    hist.shallow(repoPath, r0)

    // The load-bearing 8c guarantee is STRUCTURAL: the factory takes no store and git-history.ts
    // imports no store/knowledge/upsert seam, so a co-change upsert cannot sneak in. This is a
    // STRONGER guarantee than a runtime write-spy, which — for a store-less factory that could never
    // reach a store — would be vacuous (it could never fire). Scoped to import lines so prose comments
    // about "mints no fact" don't false-trip.
    const src = readFileSync(fileURLToPath(new URL("../src/git-history.ts", import.meta.url)), "utf8")
    const imports = src
      .split("\n")
      .filter((l) => l.trimStart().startsWith("import"))
      .join("\n")
    expect(imports).not.toMatch(/knowledge|store|upsert/i)
  })

  // Two files share one commit list, so recency is identical and only indent can separate them. The
  // recency leg is positional in the file's own log: the oldest extra commit weighs 1, and the same
  // commit standing as a file's newest (its only commit) weighs 128.
  it("hotspot — deeper indent scores higher on a shared commit list; an old index weighs less than the newest", () => {
    const repo = mkdtempSync(join(tmpdir(), "atlas-hotspot-"))
    const git = (...args: string[]): void => {
      execFileSync("git", args, { cwd: repo, stdio: "pipe" })
    }
    const write = (rel: string, content: string): void => {
      const abs = join(repo, rel)
      mkdirSync(dirname(abs), { recursive: true })
      writeFileSync(abs, content)
    }
    const commit = (msg: string, files: Readonly<Record<string, string>>): void => {
      for (const [rel, content] of Object.entries(files)) write(rel, content)
      git("add", "--", ...Object.keys(files))
      git("commit", "-q", "-m", msg)
    }
    try {
      git("init", "-q")
      git("config", "user.email", "hotspot@atlas.test")
      git("config", "user.name", "atlas-fixture")
      git("config", "commit.gpgsign", "false")

      // aged's oldest commit (index 8 once eight newer commits exist). stale.ts is touched only here.
      commit("chore: age aged", { "aged.ts": "export const n = 0\n", "stale.ts": "export const stale = 1\n" })
      for (const i of [1, 2, 3, 4, 5, 6, 7]) {
        commit(`chore: touch ${i}`, {
          "aged.ts": `export const n = ${i}\n`,
          "eight.ts": `export const n = ${i}\n`,
        })
      }
      // The newest commit of aged/eight, and fresh's only commit — the same SHA, as the newest.
      commit("chore: newest", {
        "aged.ts": "export const n = 8\n",
        "eight.ts": "export const n = 8\n",
        "fresh.ts": "export const fresh = 1\n",
      })
      // flat.ts and deep.ts are touched by exactly these two commits, nothing else.
      commit("chore: add pair", { "flat.ts": "export const flat = 1\n", "deep.ts": "export const deep = 0\n" })
      commit("chore: indent pair", { "flat.ts": "export const flat = 2\n", "deep.ts": DEEP })

      const rev = execFileSync("git", ["rev-parse", "HEAD"], { cwd: repo, encoding: "utf8" }).trim()
      const hist = createHistorySource(repo, rev)
      const score = (path: string): number =>
        hist.signals({ kind: "file", qualifiedPath: path, subtreeHash: "" as never }).hotspot

      const flatLog = nonEmpty(g(repo, "log", "--format=%H", "--follow", rev, "--", "flat.ts"))
      const deepLog = nonEmpty(g(repo, "log", "--format=%H", "--follow", rev, "--", "deep.ts"))
      expect(flatLog).toEqual(deepLog)
      expect(flatLog).toHaveLength(2)
      // recency 128+64 = 192; flat complexity 1; deep complexity 4 (tabs 1+2, spaces floor(2/2)=1).
      expect(score("flat.ts")).toBe(192)
      expect(score("deep.ts")).toBe(768)
      expect(score("deep.ts")).toBeGreaterThan(score("flat.ts"))

      const agedLog = nonEmpty(g(repo, "log", "--format=%H", "--follow", rev, "--", "aged.ts"))
      const eightLog = nonEmpty(g(repo, "log", "--format=%H", "--follow", rev, "--", "eight.ts"))
      const freshLog = nonEmpty(g(repo, "log", "--format=%H", "--follow", rev, "--", "fresh.ts"))
      const staleLog = nonEmpty(g(repo, "log", "--format=%H", "--follow", rev, "--", "stale.ts"))
      expect(agedLog).toHaveLength(9)
      expect(eightLog).toHaveLength(8)
      expect(agedLog.slice(0, 8)).toEqual(eightLog)
      expect(freshLog).toEqual([agedLog[0]])
      expect(staleLog).toEqual([agedLog[8]])
      // complexity 1 throughout, so the hotspot IS the recency sum. The extra old commit adds 1.
      // The same commit as the newest (fresh's only commit) weighs 128.
      expect(score("eight.ts")).toBe(255)
      expect(score("aged.ts")).toBe(256)
      expect(score("aged.ts") - score("eight.ts")).toBe(1)
      expect(score("fresh.ts")).toBe(128)
      expect(score("aged.ts") - score("eight.ts")).toBeLessThan(score("fresh.ts"))
      // A file whose only commit is that old SHA still scores 128: index is per-file, so k = 0.
      expect(score("stale.ts")).toBe(128)
    } finally {
      rmSync(repo, { recursive: true, force: true })
    }
  })
})

/** Blob at HEAD of the indent pair: tab levels 1 and 2, plus one 2-space line (level 1). Sum 4. */
const DEEP = "function f() {\n\tconst a = 1\n\t\tconst b = 2\n  const c = 3\n}\n"

/** In-test oracle for the weighted hotspot — the spec, recomputed from the same git reads, not the raw count. */
function oracleHotspot(repo: string, rev: string, path: string): number {
  const commits = nonEmpty(g(repo, "log", "--format=%H", "--follow", rev, "--", path))
  const recency = commits.reduce((sum, _sha, k) => sum + 2 ** Math.max(0, 7 - k), 0)
  if (commits.length === 0) return 0
  return recency * oracleComplexity(g(repo, "show", `${rev}:${path}`))
}

function oracleComplexity(text: string): number {
  const sum = text.split("\n").reduce((n, line) => {
    if (line.trim().length === 0) return n
    if (line.startsWith("\t")) return n + (line.match(/^\t*/)?.[0].length ?? 0)
    return n + Math.floor((line.match(/^ */)?.[0].length ?? 0) / 2)
  }, 0)
  return Math.max(1, sum)
}
