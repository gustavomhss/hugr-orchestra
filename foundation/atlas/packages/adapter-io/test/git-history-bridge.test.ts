// @atlas/adapter-io — test/git-history-bridge.test.ts   (SEAT HIST — the identity bridge + frontier)
//
// `createHistorySource` feeds S1 ranking. Every `StructRef` it emits (`frontier()`, `signals().coChanged`)
// is joined to the S0 skeleton by `resolveSiteKey` (genesis/rank.ts:157-158), which looks the site's
// `subtreeHash` up in the index's subtreeHash→node-key correspondence and, on a MISS, drops the site into
// an `unresolved:<hash>` ISLAND — a node with no edges, so the PPR personalization mass is spent on a
// disconnected vertex and the ranking degenerates.
//
// This suite pins the bridge MECHANICALLY, against the REAL `@atlas/index` build over the REAL repo (the
// production `walkFileTree` adapter supplies the FileTree), not against a re-stated formula:
//   • BRIDGE-1 — every frontier / coChanged site resolves to a real index node key (never `unresolved:`)
//   • BRIDGE-2 — the resolution is OBSERVABLE through the real `rank()`: the most-depended-upon file wins
//   • BRIDGE-3 — the adapter's minted identity IS the index's own minting (`nodeHashOfPath`), not a copy
//   • FRONTIER — an un-churned vendored file NEVER enters the frontier (REQ-GEN-3b: Δspend = 0)
//   • TOTALITY — <2 commits / shallow / empty repo degrade to `thin`, never throw (GEN-15, rank.ts:310)

import { describe, it, expect, afterEach } from "vitest"
import { execFileSync } from "node:child_process"
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, dirname } from "node:path"
import { build, nodeHashOfPath, type IndexNode, type ScipOutput } from "@atlas/index"
import { probeHistory, rank, type Skeleton } from "@atlas/genesis"
import { asSubtreeHash } from "@atlas/kernel"
import type { StructRef } from "@atlas/contracts"
import { createHistorySource } from "../src/git-history.js"
import { walkFileTree } from "../src/fs.js"

// ── the unicode-path sandbox (a SEPARATE fixture from the frozen `git-sbx` — different scenario) ─────
// `src/café.ts` carries a NON-ASCII path: `git ls-tree --name-only` (no `-z`) C-QUOTES it as
// `"src/caf\303\251.ts"`, while `git ls-files -z` (what the FS adapter + every real indexer see) yields
// the raw path. Two paths ⇒ two identities ⇒ the bridge breaks for exactly this file.
const UNICODE = "src/café.ts"
const APP = "src/app.ts"
const MAIN = "src/main.ts"
const VENDORED = "vendor/bundle.js" // added once, never churned (the REQ-GEN-3b probe)

interface Sbx {
  readonly repoPath: string
  cleanup(): void
}

function makeRepo(steps: ReadonlyArray<{ msg: string; files: Record<string, string> }>): Sbx {
  const repoPath = mkdtempSync(join(tmpdir(), "atlas-hist-bridge-"))
  const git = (...args: string[]): void => {
    execFileSync("git", args, { cwd: repoPath, stdio: "pipe" })
  }
  git("init", "-q")
  git("config", "user.email", "hist@atlas.test")
  git("config", "user.name", "atlas-fixture")
  git("config", "commit.gpgsign", "false")
  for (const step of steps) {
    for (const [rel, content] of Object.entries(step.files)) {
      const abs = join(repoPath, rel)
      mkdirSync(dirname(abs), { recursive: true })
      writeFileSync(abs, content)
    }
    git("add", "-A")
    git("commit", "-q", "-m", step.msg)
  }
  return { repoPath, cleanup: () => rmSync(repoPath, { recursive: true, force: true }) }
}

/** The unicode fixture: café defines `greet`; app + main reference it. Every code file is churned twice
 *  (so it clears the hotspot bar); `vendor/bundle.js` is added ONCE, alone, and never touched again. */
function makeUnicodeSbx(): Sbx {
  const v0 = (s: string): string => `// ${s} v0\n`
  const v1 = (s: string): string => `// ${s} v1\n`
  return makeRepo([
    { msg: "chore: seed", files: { [UNICODE]: v0("greet"), [APP]: v0("app"), [MAIN]: v0("main") } },
    { msg: "fix: correct greet casing", files: { [UNICODE]: v1("greet"), [APP]: v1("app"), [MAIN]: v1("main") } },
    { msg: "vendor: import bundle", files: { [VENDORED]: "x".repeat(4096) } },
  ])
}

// The SCIP projection a real indexer would emit for that repo: `greet` is DEFINED in the unicode file and
// REFERENCED from app + main ⇒ two `resolved` edges into the unicode file. Paths are the REAL repo-relative
// paths (a SCIP indexer never C-quotes) — this is the source of truth the index keys its node identity on.
const SCIP: ScipOutput = {
  documents: [
    { relativePath: UNICODE, occurrences: [{ symbol: "S#greet", role: "definition" }] },
    { relativePath: APP, occurrences: [{ symbol: "S#greet", role: "reference" }] },
    { relativePath: MAIN, occurrences: [{ symbol: "S#greet", role: "reference" }] },
  ],
}

/** The REAL skeleton for the fixture: the production FS walk + `@atlas/index` build. No hand-built tree. */
function skeletonOf(repoPath: string): Skeleton {
  return { axes: build(walkFileTree(repoPath), SCIP), manifest: { territories: [] } }
}

/** `resolveSiteKey`'s correspondence, verbatim from genesis/rank.ts:134-152 (it is module-private there):
 *  every node's `subtreeHash` → its identity `key`, min-key tie-break. Used ONLY to name the miss; the
 *  behavioural leg below re-proves the same verdict through the real `rank()`. */
function keyOfSubtree(sk: Skeleton): ReadonlyMap<string, string> {
  const pairs: Array<readonly [string, string]> = []
  const collect = (n: IndexNode): void => {
    pairs.push([String(n.subtreeHash), String(n.key)])
    n.children.forEach(collect)
  }
  collect(sk.axes.dependency)
  collect(sk.axes.spatial)
  collect(sk.axes.territory)
  const cmp = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0)
  const m = new Map<string, string>()
  for (const [st, key] of [...pairs].sort((a, b) => cmp(a[0], b[0]) || cmp(a[1], b[1]))) if (!m.has(st)) m.set(st, key)
  return m
}

const resolveSiteKey = (m: ReadonlyMap<string, string>, s: StructRef): string =>
  m.get(String(s.subtreeHash)) ?? `unresolved:${String(s.subtreeHash)}`

const rev = (repo: string): string => execFileSync("git", ["rev-parse", "HEAD"], { cwd: repo, encoding: "utf8" }).trim()

describe("git-history identity bridge (SEAT HIST)", () => {
  let sbx: Sbx | undefined
  afterEach(() => {
    sbx?.cleanup()
    sbx = undefined
  })

  // ── BRIDGE-1 — every emitted site resolves against the REAL index ────────────────────────────────
  it("BRIDGE-1 — frontier + coChanged sites resolve to real index node keys (no `unresolved:` island)", () => {
    sbx = makeUnicodeSbx()
    const { repoPath } = sbx
    const r = rev(repoPath)
    const sk = skeletonOf(repoPath)
    const m = keyOfSubtree(sk)
    const hist = createHistorySource(repoPath, r)

    // The fixture really does carry the non-ASCII path (guards a vacuous pass on a plain-ASCII repo).
    const tracked = execFileSync("git", ["ls-files", "-z"], { cwd: repoPath, encoding: "utf8" })
      .split("\0")
      .filter((p) => p.length > 0)
    expect(tracked).toContain(UNICODE)

    // Every dep-graph participant IS an index node — so a correctly-minted site MUST resolve. THE named
    // symptom first: any site whose key comes back `unresolved:<hash>` is a disconnected PPR island.
    const front = hist.frontier(repoPath, r)
    const unresolved = front.filter((s) => resolveSiteKey(m, s).startsWith("unresolved:"))
    expect(unresolved.map((s) => `${s.qualifiedPath} → ${resolveSiteKey(m, s)}`)).toEqual([])

    const frontPaths = front.map((s) => s.qualifiedPath)
    expect(frontPaths).toContain(UNICODE) // the churned unicode file is in the frontier at all

    // The co-change basket carries StructRefs too — same bridge, same bar.
    const co = hist.signals({ kind: "file", qualifiedPath: APP, subtreeHash: "" as never }).coChanged
    expect(co.map((s) => s.qualifiedPath)).toContain(UNICODE)
    expect(co.filter((s) => resolveSiteKey(m, s).startsWith("unresolved:")).map((s) => s.qualifiedPath)).toEqual([])
  })

  // ── BRIDGE-2 — the resolution is observable through the real ranker ──────────────────────────────
  it("BRIDGE-2 — the twice-referenced unicode file outranks its referrers through the real rank()", () => {
    sbx = makeUnicodeSbx()
    const { repoPath } = sbx
    const r = rev(repoPath)
    const sk = skeletonOf(repoPath)

    // Two `resolved` edges point INTO the unicode file (app→café, main→café) — the whole point of a
    // def→ref PPR. If its site lands in an `unresolved:` island it collects no in-edge mass and the
    // ranking degenerates; when it resolves it is the highest-PPR site.
    expect(sk.axes.edges.filter((e) => e.kind === "resolved")).toHaveLength(2)

    const ranked = rank(sk, createHistorySource(repoPath, r).frontier(repoPath, r))
    expect(ranked.length).toBeGreaterThan(0)
    expect(ranked[0]?.site.qualifiedPath).toBe(UNICODE)
    expect(ranked[0]?.ppr).toBeGreaterThan(ranked[ranked.length - 1]?.ppr ?? 0)
  })

  // ── BRIDGE-3 — the identity is the INDEX's, reused, not a parallel formula ───────────────────────
  it("BRIDGE-3 — the minted subtreeHash IS the index dependency-node identity for the same path", () => {
    sbx = makeUnicodeSbx()
    const { repoPath } = sbx
    const r = rev(repoPath)
    const sk = skeletonOf(repoPath)
    const hist = createHistorySource(repoPath, r)

    // The index's own minting for a file node (build.ts `docHash`, now exported as `nodeHashOfPath`),
    // wrapped exactly as `dependencyAxis` wraps it.
    const expected = new Map([UNICODE, APP, MAIN].map((p) => [p, String(asSubtreeHash(nodeHashOfPath(p)))] as const))
    const seen = new Set<string>()
    for (const site of hist.frontier(repoPath, r)) {
      const want = expected.get(site.qualifiedPath)
      if (want === undefined) continue
      expect(String(site.subtreeHash)).toBe(want)
      seen.add(site.qualifiedPath)
    }
    // NON-VACUOUS: all three code files must have been checked (a C-quoted path would silently skip).
    expect([...seen].sort()).toEqual([...expected.keys()].sort())
    // …and that identity really is a node in the built skeleton (not merely self-consistent).
    const nodes = new Set<string>()
    const collect = (n: IndexNode): void => {
      nodes.add(String(n.subtreeHash))
      n.children.forEach(collect)
    }
    collect(sk.axes.dependency)
    for (const want of expected.values()) expect(nodes.has(want)).toBe(true)
  })

  // ── FRONTIER — un-churned code raises no spend (REQ-GEN-3b, RATIFIED) ───────────────────────────
  it("FRONTIER — a never-churned vendored file is NOT in the frontier (REQ-GEN-3b: Δspend = 0)", () => {
    sbx = makeUnicodeSbx()
    const { repoPath } = sbx
    const r = rev(repoPath)
    const front = createHistorySource(repoPath, r).frontier(repoPath, r)

    // It IS tracked at the rev (so this is a real exclusion, not an absent file).
    const tracked = execFileSync("git", ["ls-tree", "-r", "--name-only", "-z", r], {
      cwd: repoPath,
      encoding: "utf8",
    })
      .split("\0")
      .filter((p) => p.length > 0)
    expect(tracked).toContain(VENDORED)

    // `frontierBudget` (genesis) IS the ranked-site count, so a site in the frontier is an LLM call.
    expect(front.map((s) => s.qualifiedPath)).not.toContain(VENDORED)
    // …and the churned code files ARE there (guards a vacuously empty frontier).
    expect(front.map((s) => s.qualifiedPath)).toEqual(expect.arrayContaining([UNICODE, APP, MAIN]))
  })

  // ── TOTALITY — degenerate history degrades to `thin`, never throws (GEN-15) ─────────────────────
  it("TOTALITY — empty repo / single commit / shallow clone probe `thin` without throwing", () => {
    // (a) a repo with ZERO commits — `git rev-list --count HEAD` is a hard git failure.
    const empty = makeRepo([])
    try {
      const h = createHistorySource(empty.repoPath, "HEAD")
      expect(() => probeHistory(h, empty.repoPath, "HEAD")).not.toThrow()
      expect(probeHistory(h, empty.repoPath, "HEAD").thin).toBe(true)
      expect(() => h.frontier(empty.repoPath, "HEAD")).not.toThrow()
      expect(h.frontier(empty.repoPath, "HEAD")).toEqual([])
      expect(() => h.signals({ kind: "file", qualifiedPath: APP, subtreeHash: "" as never })).not.toThrow()
    } finally {
      empty.cleanup()
    }

    // (b) a single-commit repo — below MIN_COMMITS ⇒ `low-commit-count`.
    const one = makeRepo([{ msg: "chore: seed", files: { [APP]: "a\n" } }])
    try {
      const h = createHistorySource(one.repoPath, rev(one.repoPath))
      const p = probeHistory(h, one.repoPath, rev(one.repoPath))
      expect(p.thin).toBe(true)
      expect(p.reason).toBe("low-commit-count")
    } finally {
      one.cleanup()
    }

    // (c) a SHALLOW clone of a multi-commit repo — `shallow-clone`. Depth 2, NOT 1: `probeHistory` tests
    // commitCount FIRST, so a depth-1 clone would trip `low-commit-count` and never exercise `shallow`.
    const full = makeUnicodeSbx()
    const dest = mkdtempSync(join(tmpdir(), "atlas-hist-shallow-"))
    try {
      rmSync(dest, { recursive: true, force: true })
      execFileSync("git", ["clone", "-q", "--depth", "2", `file://${full.repoPath}`, dest], { stdio: "pipe" })
      const h = createHistorySource(dest, "HEAD")
      expect(h.commitCount(dest, "HEAD")).toBe(2) // past MIN_COMMITS ⇒ the shallow leg really runs
      expect(h.shallow(dest, "HEAD")).toBe(true)
      const p = probeHistory(h, dest, "HEAD")
      expect(p.thin).toBe(true)
      expect(p.reason).toBe("shallow-clone")
      expect(() => h.frontier(dest, "HEAD")).not.toThrow()
    } finally {
      rmSync(dest, { recursive: true, force: true })
      full.cleanup()
    }
  })

  // ── a bad rev must not throw either (the mine driver has no catch around the probe) ─────────────
  it("TOTALITY — a malformed rev degrades, never throws", () => {
    sbx = makeUnicodeSbx()
    const { repoPath } = sbx
    const h = createHistorySource(repoPath, "no-such-rev")
    expect(() => probeHistory(h, repoPath, "no-such-rev")).not.toThrow()
    expect(probeHistory(h, repoPath, "no-such-rev").thin).toBe(true)
    expect(h.frontier(repoPath, "no-such-rev")).toEqual([])
    expect(h.signals({ kind: "file", qualifiedPath: APP, subtreeHash: "" as never }).hotspot).toBe(0)
  })
})
