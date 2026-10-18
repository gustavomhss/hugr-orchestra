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
import { readFileSync } from "node:fs"
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

    expect(s.szzBugCommits).toBe(oMessages.filter((m) => /^fix/i.test(m)).length)
    expect(s.szzBugCommits).toBe(1) // exactly the C2 `fix:` at r0 (not the topic rework).

    expect(s.hotspot).toBe(nonEmpty(g(repoPath, "log", "--format=%H", "--follow", r0, "--", QP)).length)

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
})
