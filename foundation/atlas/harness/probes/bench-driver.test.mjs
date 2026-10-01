// harness/probes/bench-driver.test.mjs — proves the D2 manifest JOIN (site → cost → outcome → fact →
// provenance) end to end, at $0, on the FAKE model.
//
// This drives the REAL `atlas mine` CLI (built dist, `packages/cli/dist/src/bin.js` — present once
// `npm run typecheck`/`tsc -b` has run, which CI always does before `npm test`) as a real subprocess, over a
// tiny two-package fixture corpus committed at `harness/probes/__fixtures__/bench-driver-corpus/` (each
// package pre-indexed with `scip-typescript`, so no external tool is required at test time). The model
// itself is a canned stand-in: `roles.propose.cmd` is wired to the REAL `metered-claude.mjs` (so the
// metering half of the pipeline is exercised for real, not mocked), which is pointed at a tiny fake `claude`
// binary (`$METERED_CLAUDE_BIN`) that echoes a fixed JSON envelope — the SAME technique
// `metered-claude.test.mjs` uses, so this test spends no real tokens and needs no network.
//
// What this proves, per the D2 return card:
//   - the manifest's per-site rows join OUTCOME (the printed `RunCoverage` ledger, via `mine-report.mjs`)
//     to COST (the metering sidecar, via the pool-safe site key) to FACT + PROVENANCE (the staging store +
//     CAS-addressed `answerRef`, via `atlas-store-read.mjs`) to the MODEL identity the caller stamped the
//     run with — for every corpus unit, not just one.
//   - `mine-report.mjs`'s rewritten `parseMineReport`/`parseFullMineReport` correctly reads a report that
//     SEEDED (the "mine: … site(s) visited …" line is absent on that branch — see that file's header for
//     the measured gap this closes).
//   - CROSS-UNIT COST ISOLATION (cold-review finding, fixed 2026-08-11): both fixture packages carry a
//     `src/index.ts` — a DELIBERATE relative-path collision. Before the fix, `runCorpus` joined every unit's
//     cost against the WHOLE accumulated sidecar, so pkg-a's and pkg-b's `src/index.ts` rows would both
//     match BOTH units (`site.cost` would hold 2 entries per unit, one belonging to the OTHER package). The
//     fix (a per-unit sidecar byte-offset checkpoint) makes each unit see ONLY its own appended rows.
//
// Harness invariant (harness/README.md): no `@atlas/*` import.

import { describe, it, expect, beforeAll } from "vitest"
import { chmodSync, cpSync, existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs"
import { execFileSync } from "node:child_process"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

import { buildModelConfig, buildUnitManifest, readCorpus, runCorpus, writeModelConfig } from "./bench-driver.mjs"
import { parseFullMineReport } from "./mine-report.mjs"

const HERE = dirname(fileURLToPath(import.meta.url))
const FIXTURE_CORPUS = join(HERE, "__fixtures__", "bench-driver-corpus")
const CLI_BIN = join(HERE, "..", "..", "packages", "cli", "dist", "src", "bin.js")
const METERED_CLAUDE = join(HERE, "metered-claude.mjs")

/** A fake `claude`: ignores args, drains stdin, echoes the JSON in `$FAKE_CLAUDE_JSON` — identical
 *  technique to `metered-claude.test.mjs`'s own fake, so NO real model call is ever made here. */
const FAKE_CLAUDE_SRC = `#!/usr/bin/env node
import { readFileSync } from 'node:fs';
readFileSync(0);
process.stdout.write(process.env.FAKE_CLAUDE_JSON || '{}');
`

/** One well-formed `atlas-fact` answer, priced at a fixed, obviously-synthetic cost — never a real spend. */
const FAKE_ENVELOPE = JSON.stringify({
  result: 'free reasoning, never a real model.\n```atlas-fact\n{"claim":"a fake but well-formed claim"}\n```\n',
  usage: { input_tokens: 111, output_tokens: 22, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
  total_cost_usd: 0.0321,
  is_error: false,
  duration_api_ms: 250,
})

/** A STATEFUL fake `claude`: each call bumps a shared counter file for an intra-unit DISTINCT call number,
 *  and prices itself `(unitBase + n) * 0.01` where `unitBase` is derived from the UNIT (the cwd basename:
 *  `mine .` runs with `cwd: <unit repo>`, see bench-driver.mjs:62). Cross-unit cost separation is therefore by
 *  UNIT, NOT by the shared counter's cross-unit ordering — which is NOT safe to rely on: the counter's
 *  read-modify-write is not atomic, so under the concurrent proposer pool two calls can lose-update to the
 *  same `n` (even a pkg-b call can end up at `n = 1`), which made a bare `n * 0.01` scheme flake at the boundary
 *  (`expected 0.01 to be less than 0.01`). With `unitBase` (pkg-b = 1000), every pkg-b cost is strictly greater
 *  than every pkg-a cost BY CONSTRUCTION, independent of any counter race; the counter still supplies
 *  intra-unit distinctness. This keeps "pkg-a's `src/index.ts` cost < every pkg-b cost" a robust cross-unit
 *  isolation witness (the collision/join teeth below are unaffected — both units still write `src/index.ts`). */
const FAKE_CLAUDE_COUNTER_SRC = `#!/usr/bin/env node
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
readFileSync(0);
const counterFile = process.env.FAKE_CLAUDE_COUNTER_FILE;
let n = existsSync(counterFile) ? Number(readFileSync(counterFile, 'utf8')) || 0 : 0;
n += 1;
writeFileSync(counterFile, String(n));
const unit = process.cwd().split('/').filter(Boolean).pop() || '';
const unitBase = unit === 'pkg-b' ? 1000 : 0;
process.stdout.write(JSON.stringify({
  result: 'free reasoning #' + n + '.\\n\`\`\`atlas-fact\\n{"claim":"a fake but well-formed claim #' + n + '"}\\n\`\`\`\\n',
  usage: { input_tokens: 100 + n, output_tokens: 20 + n, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
  total_cost_usd: (unitBase + n) * 0.01,
  is_error: false,
  duration_api_ms: 100,
}));
`

let tmp
let corpus
let modelConfigPath
let fakeClaudeBin
let fakeClaudeCounterBin

/** `atlas mine`'s spatial-axis skeleton walk needs the corpus unit to be a real (committed) git repo — a
 *  bare directory with only a `.atlas/index.scip` reports "no path on the spatial axis" and drops every
 *  node (INDEX-13). MEASURED. So each fixture package is copied into a fresh git repo per test run. */
function gitInit(dir) {
  execFileSync("git", ["init", "-q"], { cwd: dir })
  execFileSync("git", ["add", "-A"], { cwd: dir })
  execFileSync("git", ["-c", "user.email=bench@atlas.test", "-c", "user.name=bench", "commit", "-q", "-m", "init"], {
    cwd: dir,
  })
}

beforeAll(() => {
  if (!existsSync(CLI_BIN)) {
    throw new Error(
      `bench-driver.test.mjs: ${CLI_BIN} is not built. Run \`npm run build\` (or \`npm run typecheck\`, which builds it) first — CI always does, in that order, before \`npm test\`.`,
    )
  }
  tmp = mkdtempSync(join(tmpdir(), "atlas-bench-driver-test-"))
  const pkgA = join(tmp, "pkg-a")
  const pkgB = join(tmp, "pkg-b")
  cpSync(join(FIXTURE_CORPUS, "pkg-a"), pkgA, { recursive: true })
  cpSync(join(FIXTURE_CORPUS, "pkg-b"), pkgB, { recursive: true })
  gitInit(pkgA)
  gitInit(pkgB)
  const corpusPath = join(tmp, "corpus.json")
  writeFileSync(
    corpusPath,
    JSON.stringify([
      { repo: pkgA, label: "pkg-a" },
      { repo: pkgB, label: "pkg-b" },
    ]),
  )
  corpus = readCorpus(corpusPath)
  modelConfigPath = writeModelConfig(join(tmp, "config"), METERED_CLAUDE)
  fakeClaudeBin = join(tmp, "fake-claude.mjs")
  writeFileSync(fakeClaudeBin, FAKE_CLAUDE_SRC)
  chmodSync(fakeClaudeBin, 0o755)
  fakeClaudeCounterBin = join(tmp, "fake-claude-counter.mjs")
  writeFileSync(fakeClaudeCounterBin, FAKE_CLAUDE_COUNTER_SRC)
  chmodSync(fakeClaudeCounterBin, 0o755)
}, 30_000)

describe("readCorpus", () => {
  it("rejects a non-array corpus file", () => {
    const p = join(mkdtempSync(join(tmpdir(), "atlas-bench-bad-")), "bad.json")
    writeFileSync(p, JSON.stringify({ not: "an array" }))
    expect(() => readCorpus(p)).toThrow(/non-empty JSON array/)
  })

  it("rejects an entry with no `repo`", () => {
    const p = join(mkdtempSync(join(tmpdir(), "atlas-bench-bad-")), "bad.json")
    writeFileSync(p, JSON.stringify([{ label: "no repo here" }]))
    expect(() => readCorpus(p)).toThrow(/corpus\[0\]/)
  })
})

describe("buildModelConfig / writeModelConfig", () => {
  it("shapes exactly the `roles.propose.cmd/args` `loadModelConfig` reads, nothing else", () => {
    expect(buildModelConfig("/abs/metered-claude.mjs")).toEqual({
      roles: { propose: { cmd: "node", args: ["/abs/metered-claude.mjs"] } },
    })
  })
})

describe("the manifest join — site → cost → outcome → fact → provenance (fake model, $0)", () => {
  it("joins every planned site across a MULTI-UNIT corpus", () => {
    const sidecarPath = join(tmp, "sidecar.jsonl")
    const manifest = runCorpus({
      corpus,
      cliBin: CLI_BIN,
      model: "fake-model-x",
      modelConfigPath,
      sidecarPath,
      claudeBin: fakeClaudeBin,
      extraEnv: { FAKE_CLAUDE_JSON: FAKE_ENVELOPE },
    })

    expect(manifest.model).toBe("fake-model-x")
    expect(manifest.units).toHaveLength(2)

    for (const unit of manifest.units) {
      expect(unit.parseError, `unit ${unit.repo} did not parse: ${unit.parseError}`).toBeUndefined()
      expect(unit.exitCode).toBe(0)
      expect(unit.coverageVerdict).toMatch(/^coverage CLOSES/)
      expect(unit.malformedSiteRows).toEqual([])
      // three source files per fixture package (incl. `src/index.ts`, which DELIBERATELY collides across
      // pkg-a/pkg-b — see "cross-unit cost isolation" below), all PLANNED and all SEEDED.
      expect(unit.sites).toHaveLength(3)
      expect(unit.sites.map((s) => s.path)).toContain("src/index.ts")

      for (const site of unit.sites) {
        expect(site.outcome).toBe("seeded")
        expect(site.model).toBe("fake-model-x")

        // COST: joined by the pool-safe site key (`metered-claude.mjs` `deriveSiteKey`), not by call order.
        expect(site.costJoined).toBe(true)
        expect(site.cost).toHaveLength(1)
        expect(site.cost[0].site).toBe(site.path)
        expect(site.cost[0].total_cost_usd).toBeCloseTo(0.0321, 6)
        expect(site.cost[0].input_tokens).toBe(111)
        expect(site.cost[0].output_tokens).toBe(22)
        expect(site.cost[0].abstained).toBe(false)
        expect(site.cost[0].is_error).toBe(false)

        // FACT + PROVENANCE: joined via the staging store (`by-primary-anchor`) and the CAS-addressed
        // answer receipt (`answerRef`/`answerText` — `mine-answer.ts`, read back through `atlas-store-read.mjs`).
        expect(site.factLookup).toBe("by-primary-anchor")
        expect(site.facts).toHaveLength(1)
        const fact = site.facts[0]
        expect(fact.nodeKey).toMatch(/^[0-9a-f]{64,}$/)
        expect(fact.claims).toEqual(["a fake but well-formed claim"])
        expect(fact.tier).toBe("T2")
        expect(fact.scope).toBe("atlas:mined")
        expect(fact.answerRef).toMatch(/^[0-9a-f]{64,}$/)
        // the CAS-addressed answer text round-trips byte for byte back to what the fake model emitted.
        expect(fact.answerText).toContain("a fake but well-formed claim")
      }
    }

    // every site WITHIN one unit's own run carries a distinct nodeKey (no duplicate seed in one pass). This
    // is scoped PER UNIT, not across units: nodeKey is content-addressed on (anchor path, claim) alone, so
    // two DIFFERENT repos' stores legitimately mint the SAME nodeKey for the SAME relative path + claim
    // (both fixture packages use the identical canned claim) — that is a property of content addressing,
    // not a join defect, and is exactly why cost isolation (below) has to be proven by SIDECAR OFFSET rather
    // than by assuming any key is globally unique.
    for (const unit of manifest.units) {
      const nodeKeys = unit.sites.flatMap((s) => s.facts.map((f) => f.nodeKey))
      expect(new Set(nodeKeys).size).toBe(nodeKeys.length)
    }
  }, 30_000)
})

describe("cross-unit cost isolation (regression teeth for the cold-review HIGH finding)", () => {
  it("does NOT cross-contaminate cost between two units that share a relative path (src/index.ts)", () => {
    const sidecarPath = join(tmp, "sidecar-isolation.jsonl")
    const counterFile = join(tmp, "call-counter.txt")
    const manifest = runCorpus({
      corpus,
      cliBin: CLI_BIN,
      model: "fake-model-x",
      modelConfigPath,
      sidecarPath,
      claudeBin: fakeClaudeCounterBin,
      extraEnv: { FAKE_CLAUDE_COUNTER_FILE: counterFile },
    })

    const [unitA, unitB] = manifest.units
    expect(unitA.label).toBe("pkg-a")
    expect(unitB.label).toBe("pkg-b")
    const indexA = unitA.sites.find((s) => s.path === "src/index.ts")
    const indexB = unitB.sites.find((s) => s.path === "src/index.ts")
    expect(indexA).toBeDefined()
    expect(indexB).toBeDefined()

    // THE REGRESSION ASSERTION: exactly ONE cost row per unit for the COLLIDING path — not two. Under the
    // pre-fix code (join against the WHOLE accumulated sidecar), `costRowsAt` would match BOTH pkg-a's AND
    // pkg-b's `src/index.ts` calls for EACH unit, so `indexA.cost`/`indexB.cost` would both have length 2
    // and `indexA.cost` would wrongly include one of pkg-b's rows (and vice versa). This is what FAILS on
    // the pre-fix code and PASSES on the fix.
    expect(indexA.costJoined).toBe(true)
    expect(indexB.costJoined).toBe(true)
    expect(indexA.cost).toHaveLength(1)
    expect(indexB.cost).toHaveLength(1)

    // `runCorpus` runs units SEQUENTIALLY, so every pkg-a call priced strictly lower than every pkg-b call
    // (see `FAKE_CLAUDE_COUNTER_SRC`'s header). pkg-a's `src/index.ts` cost must therefore be LOWER than
    // EVERY cost row anywhere in pkg-b's unit — the cross-package separation a shared-key bug would erase.
    const allCostsB = unitB.sites.flatMap((s) => s.cost ?? []).map((c) => c.total_cost_usd)
    expect(allCostsB.length).toBeGreaterThan(0)
    expect(indexA.cost[0].total_cost_usd).toBeLessThan(Math.min(...allCostsB))

    // THE COLLISION PRECONDITION, proven directly against the raw sidecar (bypassing the driver's own
    // offset-slicing): the whole-file join the pre-fix code used to perform WOULD have found 2 rows for
    // `src/index.ts` — confirming this fixture actually exercises the bug rather than merely gesturing at it.
    const rawLines = readFileSync(sidecarPath, "utf8")
      .split("\n")
      .filter((l) => l.trim() !== "")
      .map((l) => JSON.parse(l))
    const rawIndexRows = rawLines.filter((r) => r.site === "src/index.ts")
    expect(rawIndexRows.length).toBe(2) // one per unit — the WHOLE-sidecar join collides; the driver does not.
  }, 30_000)
})

describe('mine-report.mjs — parseFullMineReport on a report that SEEDED (the "mine:" line is ABSENT here)', () => {
  it("still parses seeded/ratified/llmCalls/budgetSpent/sites/candidates + the coverage verdict + site rows", () => {
    const text = [
      "genesis: seeded 2 candidate fact(s); ratified 0",
      "cost: llmCalls 2 · budgetSpent 2",
      "coverage: coverage CLOSES — all 2 planned site(s) accounted for: 2 seeded, 0 abstained, 0 unrecorded, 0 interrupted, 0 never visited",
      'site: {"rank":1,"outcome":"seeded","kind":"file","path":"src/a.ts","facts":["src/a.ts"]}',
      'site: {"rank":2,"outcome":"seeded","kind":"file","path":"src/b.ts","facts":["src/b.ts"]}',
      "",
    ].join("\n")
    const r = parseFullMineReport(text)
    expect(r).toBeDefined()
    expect(r).toMatchObject({
      seeded: 2,
      ratified: 0,
      llmCalls: 2,
      budgetSpent: 2,
      sites: 2,
      candidates: 2,
      allAbstained: false,
    })
    expect(r.coverageVerdict).toMatch(/^coverage CLOSES/)
    expect(r.siteRows).toHaveLength(2)
    expect(r.malformedSiteRows).toEqual([])
  })

  it("still refuses a report with no header/cost lines at all", () => {
    expect(parseFullMineReport("not a mine report")).toBeUndefined()
  })

  it('still refuses a 0-seeded report with no "mine:" line — that combination has no honest reading', () => {
    const text = "genesis: seeded 0 candidate fact(s); ratified 0\ncost: llmCalls 0 · budgetSpent 0\n"
    expect(parseFullMineReport(text)).toBeUndefined()
  })
})

describe("buildUnitManifest", () => {
  it("reports a parse error rather than fabricating zeros for stdout it cannot read", () => {
    const unit = buildUnitManifest({ repo: "/nowhere", label: "x", model: "m", stdout: "garbage", sidecarLines: [] })
    expect(unit.parseError).toBeDefined()
    expect(unit.sites).toEqual([])
  })

  it("a `costError` (untrustworthy sidecar) surfaces as a DISTINCT, loud per-site status — never a plausible false", () => {
    const stdout = [
      "genesis: seeded 1 candidate fact(s); ratified 0",
      "cost: llmCalls 1 · budgetSpent 1",
      "coverage: coverage CLOSES — all 1 planned site(s) accounted for: 1 seeded, 0 abstained, 0 unrecorded, 0 interrupted, 0 never visited",
      'site: {"rank":1,"outcome":"seeded","kind":"file","path":"src/a.ts","facts":["src/a.ts"]}',
      "",
    ].join("\n")
    const unit = buildUnitManifest({
      repo: "/nowhere",
      label: "x",
      model: "m",
      stdout,
      sidecarLines: [], // ignored when costError is set — see buildUnitManifest
      costError: "sidecar /tmp/x.jsonl is 3 byte(s), SHORTER than the 10-byte checkpoint — truncated mid-run",
    })
    expect(unit.sites).toHaveLength(1)
    const [site] = unit.sites
    expect(site.costStatus).toBe("error")
    expect(site.costJoined).toBe(false) // kept boolean for existing callers, but NEVER the only signal now
    expect(site.costError).toMatch(/truncated mid-run/)
    expect(site.cost).toBeNull()
  })

  it("a readable sidecar with genuinely NO row for a site is `costStatus: 'none'`, distinct from `'error'`", () => {
    const stdout = [
      "genesis: seeded 1 candidate fact(s); ratified 0",
      "cost: llmCalls 1 · budgetSpent 1",
      "coverage: coverage CLOSES — all 1 planned site(s) accounted for: 1 seeded, 0 abstained, 0 unrecorded, 0 interrupted, 0 never visited",
      'site: {"rank":1,"outcome":"seeded","kind":"file","path":"src/a.ts","facts":["src/a.ts"]}',
      "",
    ].join("\n")
    const unit = buildUnitManifest({ repo: "/nowhere", label: "x", model: "m", stdout, sidecarLines: [] })
    expect(unit.sites[0].costStatus).toBe("none")
    expect(unit.sites[0].costJoined).toBe(false)
    expect(unit.sites[0].costError).toBeUndefined()
  })
})

describe("runCorpus — a sidecar truncated mid-run surfaces `costError`, never a silent-cheap manifest", () => {
  it("propagates a `readSidecarSince` error to the unit and every one of its sites", () => {
    const manifest = runCorpus({
      corpus: [{ repo: "/repo-a", label: "repo-a" }],
      cliBin: "/bin.js",
      model: "m",
      modelConfigPath: "/model.json",
      sidecarPath: "/sidecar.jsonl",
      deps: {
        runMineOnce: () => ({
          stdout: [
            "genesis: seeded 1 candidate fact(s); ratified 0",
            "cost: llmCalls 1 · budgetSpent 1",
            "coverage: coverage CLOSES — all 1 planned site(s) accounted for: 1 seeded, 0 abstained, 0 unrecorded, 0 interrupted, 0 never visited",
            'site: {"rank":1,"outcome":"seeded","kind":"file","path":"src/a.ts","facts":["src/a.ts"]}',
            "",
          ].join("\n"),
          exitCode: 0,
        }),
        sidecarByteLength: () => 999,
        readSidecarSince: () => ({
          rows: [],
          malformed: [],
          error: "sidecar is 3 byte(s), SHORTER than the 999-byte checkpoint",
        }),
      },
    })
    const [unit] = manifest.units
    expect(unit.costError).toMatch(/SHORTER than the 999-byte checkpoint/)
    expect(unit.sites[0].costStatus).toBe("error")
    expect(unit.sites[0].costJoined).toBe(false)
    expect(unit.sites[0].cost).toBeNull()
  })
})
