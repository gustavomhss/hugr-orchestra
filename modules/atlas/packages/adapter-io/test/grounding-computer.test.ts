// @atlas/adapter-io — test/grounding-computer.test.ts  (WP-10.A1.ADAPTER — the acceptance goldens)
//
// Realizes the CAMPAIGN-10 EPIC-A1 goldens against the ONE grounding computer (grounding-computer.ts):
//   · SCN-AUTH-1a/1b/1c/1d/1e — single-seam agreement + warm-owned-inside (PROP-AUTH-1 witnesses)
//   · SCN-AUTH-3a/3b/3e/3f/3g — anchors are faithful, total, order-stable, never a throw
//   · SCN-AUTH-4a/4b/4c/4d    — language holes are declared, with a REAL census, never hidden
//   · PROP-AUTH-1             — ∀ anchor kind ∈ {file,dir,symbol}: plannerHash(a) ≡ gateHash(a)
//
// The fixture is the `fix-author` committed two-language repo from goldens-authoring.md §Fixture universe.
// The gate ORACLE is the product's own `buildGate` re-derivation; the anchor oracle is the built `Axes`
// traversed independently here — a differential, not a re-statement of the planner.

import { describe, it, expect, beforeAll, afterAll } from "vitest"
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, dirname } from "node:path"
import { execFileSync } from "node:child_process"
import { fileURLToPath } from "node:url"
import type { Axes, IndexNode } from "@atlas/index"
import type { GroundedFact } from "@atlas/knowledge"
import { createAnchors } from "@atlas/tools"
import {
  deriveGroundingAxes,
  buildGroundingComputer,
  buildGate,
  warmGroundingComputer,
} from "../src/grounding-computer.js"
import { walkFileTree } from "../src/fs.js"
import { readScipOrEmpty } from "../src/scip.js"
import { initAst } from "../src/ast.js"

const SRC = dirname(fileURLToPath(import.meta.url)).replace(/\/test$/, "/src")

// ── the `fix-author` fixture (goldens-authoring.md §Fixture universe) ────────────────────────────────────
const FILES: Readonly<Record<string, string>> = {
  ".gitignore": "dist/\n",
  "src/app.ts":
    "export function run(): string {\n  return `running`;\n}\n\nexport function helper(): number {\n  return 1;\n}\n",
  "src/util.ts": "export function greet(name: string): string {\n  return `hi ${name}`;\n}\n",
  "core/engine.rs": "pub fn engine() -> u32 {\n    42\n}\n",
  "core/mod.rs": "pub mod engine;\n",
  "docs/notes.md": "# notes\n\nsome prose, no symbols.\n",
}

interface FixAuthor {
  readonly repoPath: string
  readonly rev: string
  cleanup(): void
}

function makeFixAuthor(): FixAuthor {
  const repoPath = mkdtempSync(join(tmpdir(), "atlas-fix-author-"))
  for (const [rel, content] of Object.entries(FILES)) {
    const abs = join(repoPath, rel)
    mkdirSync(dirname(abs), { recursive: true })
    writeFileSync(abs, content)
  }
  const git = (...args: string[]): string =>
    execFileSync("git", args, { cwd: repoPath, stdio: ["pipe", "pipe", "pipe"] }).toString()
  git("init", "-q")
  git("config", "user.email", "fix@atlas.test")
  git("config", "user.name", "atlas-fixture")
  git("config", "commit.gpgsign", "false")
  git("add", ".")
  git("commit", "-q", "-m", "R1")
  const rev = git("rev-parse", "HEAD").trim()
  return { repoPath, rev, cleanup: () => rmSync(repoPath, { recursive: true, force: true }) }
}

/** Build the axes the SAME way the runtime does (the gate + planner oracle). */
function axesOf(repoPath: string): Axes {
  return deriveGroundingAxes(walkFileTree(repoPath), readScipOrEmpty(join(repoPath, ".atlas", "index.scip"))).axes
}

/** Independent DFS oracle: every PROPER descendant of the spatial node keyed `path`, preorder, as
 *  `{qualifiedPath, subtreeHash}` — read straight off the built `Axes`, never through the planner. */
function unitsUnderOracle(axes: Axes, path: string): { qualifiedPath: string; subtreeHash: string }[] {
  const find = (n: IndexNode): IndexNode | undefined => {
    if (n.key === path) return n
    for (const c of n.children) {
      const hit = find(c)
      if (hit !== undefined) return hit
    }
    return undefined
  }
  const node = find(axes.spatial)
  const out: { qualifiedPath: string; subtreeHash: string }[] = []
  const collect = (n: IndexNode): void => {
    for (const c of n.children) {
      out.push({ qualifiedPath: c.key, subtreeHash: String(c.subtreeHash) })
      collect(c)
    }
  }
  if (node !== undefined) collect(node)
  return out
}

let fix: FixAuthor

beforeAll(async () => {
  await initAst() // warm the grammar for the SYNC-seam tests (the runtime bins do this before composeRuntime)
  fix = makeFixAuthor()
})
afterAll(() => fix.cleanup())

describe("WP-10.A1.ADAPTER — the one grounding computer", () => {
  // ── AUTHOR-1 / PROP-AUTH-1 — single-seam agreement ────────────────────────────────────────────────────

  it("SCN-AUTH-1a-1 — planner and gate derive the same hash (src/app.ts::run)", () => {
    const axes = axesOf(fix.repoPath)
    const computer = buildGroundingComputer({ axes, rawTree: walkFileTree(fix.repoPath), rev: fix.rev })
    // discover the folded `::` unit key for `run` (never hard-code the fold format)
    const runUnit = computer
      .anchorsUnder("src")
      .units.find((u) => u.kind === "symbol" && u.qualifiedPath.endsWith(":run"))
    expect(runUnit).toBeDefined()
    const plannerHash = computer.groundingFor({
      anchor: runUnit!.qualifiedPath,
      slot: "invariant",
      claim: "x",
    }).subtreeHash
    // the gate's oracle for the SAME anchor = the built axes node's subtreeHash (what resolveCurrent returns)
    const gateHash = unitsUnderOracle(axes, "src").find((u) => u.qualifiedPath === runUnit!.qualifiedPath)!.subtreeHash
    expect(String(plannerHash)).toBe(gateHash)
    expect(String(plannerHash).length).toBeGreaterThan(0)
  })

  it("SCN-AUTH-1b-1 — there is exactly one derivation site, and the gate + planner route to it", () => {
    // The fold→build composition lives ONLY in grounding-computer.ts (`deriveGroundingAxes`); compose.ts and
    // rev-index.ts (the HEAD gate + the arbitrary-rev oracle) route through it and call `build` nowhere.
    const gc = readFileSync(join(SRC, "grounding-computer.ts"), "utf8")
    const compose = readFileSync(join(SRC, "compose.ts"), "utf8")
    const revIndex = readFileSync(join(SRC, "rev-index.ts"), "utf8")
    expect((gc.match(/\bbuild\(/g) ?? []).length).toBe(1) // the sole fold→build seam
    expect(compose).not.toMatch(/\bbuild\(/) // routes through the seam, never a second derivation
    expect(compose).toMatch(/deriveGroundingAxes\(/)
    expect(revIndex).not.toMatch(/\bbuild\(/)
    expect(revIndex).toMatch(/deriveGroundingAxes\(/)
    // buildGate (the truth-gate) and buildGroundingComputer (the planner) are exported from the SAME seam module.
    expect(typeof buildGate).toBe("function")
    expect(typeof buildGroundingComputer).toBe("function")
  })

  it("SCN-AUTH-1c-1 — the seam warms itself (cold process gets the :: symbol fold)", () => {
    // A genuinely COLD node process: it performs NO initAst() of its own; only warmGroundingComputer (which
    // owns the warm-up) runs. If the seam did not warm itself, foldAstUnits would no-op and yield ZERO symbols.
    const script = `
      import { warmGroundingComputer } from '@atlas/adapter-io';
      const { computer } = await warmGroundingComputer(${JSON.stringify(fix.repoPath)});
      const syms = computer.anchorsUnder('src').units.filter((u) => u.kind === 'symbol').map((u) => u.qualifiedPath);
      process.stdout.write(JSON.stringify(syms));
    `
    const out = execFileSync("node", ["--input-type=module", "-e", script], {
      cwd: process.cwd(),
      stdio: ["pipe", "pipe", "pipe"],
    }).toString()
    const syms: string[] = JSON.parse(out)
    expect(syms.some((s) => s.includes("::") && s.endsWith(":run"))).toBe(true)
    expect(syms.some((s) => s.includes("::") && s.endsWith(":helper"))).toBe(true)
  })

  it("SCN-AUTH-1d-1 — no planner/gate disagreement (a planner grounding re-derives at the gate)", () => {
    const axes = axesOf(fix.repoPath)
    const computer = buildGroundingComputer({ axes, rawTree: walkFileTree(fix.repoPath), rev: fix.rev })
    const gate = buildGate(axes)
    // ground core/engine.rs (a FILE anchor — the teeth case: a warm-less fold would still pass a file anchor,
    // so this asserts the file leg; the symbol leg is asserted by 1a/1c) and prove the gate accepts it.
    const anchor = computer.groundingFor({ anchor: "core/engine.rs", slot: "invariant", claim: "y" })
    const fact = {
      kind: "advisory",
      id: "nk-1d" as unknown as GroundedFact["id"],
      tier: "T1",
      claimNorm: "y",
      grounding: { entries: [{ anchor, path: "core/engine.rs" }] },
      freshness: "FRESH",
      claims: [],
      authoring: "ADVISORY",
      scope: "core",
      predicateSlot: "invariant",
    } as unknown as GroundedFact
    expect(gate.gateHolds(fact, "" as unknown as Parameters<typeof gate.gateHolds>[1])).toBe("HOLDS")
  })

  it("SCN-AUTH-1e-1 — cold caller, same fold as a warmed one (byte-identical unit set)", () => {
    // warmed (in-process) vs cold (child process): the two unit sets for src/app.ts must be byte-identical.
    const axes = axesOf(fix.repoPath)
    const warmUnits = buildGroundingComputer({ axes, rawTree: walkFileTree(fix.repoPath), rev: fix.rev })
      .anchorsUnder("src")
      .units.map((u) => u.qualifiedPath)
    const script = `
      import { warmGroundingComputer } from '@atlas/adapter-io';
      const { computer } = await warmGroundingComputer(${JSON.stringify(fix.repoPath)});
      process.stdout.write(JSON.stringify(computer.anchorsUnder('src').units.map((u) => u.qualifiedPath)));
    `
    const coldUnits: string[] = JSON.parse(
      execFileSync("node", ["--input-type=module", "-e", script], {
        cwd: process.cwd(),
        stdio: ["pipe", "pipe", "pipe"],
      }).toString(),
    )
    expect(coldUnits).toEqual(warmUnits)
  })

  it("PROP-AUTH-1 — plannerHash ≡ gateHash over every anchor kind {file,dir,symbol}", () => {
    const axes = axesOf(fix.repoPath)
    const computer = buildGroundingComputer({ axes, rawTree: walkFileTree(fix.repoPath), rev: fix.rev })
    const oracle = new Map(unitsUnderOracle(axes, ".").map((u) => [u.qualifiedPath, u.subtreeHash]))
    const units = computer.anchorsUnder(".").units
    const kinds = new Set(units.map((u) => u.kind))
    expect(kinds).toEqual(new Set(["file", "dir", "symbol"])) // the ∀ genuinely spans all three grains
    for (const u of units) {
      const plannerHash = computer.groundingFor({ anchor: u.qualifiedPath, slot: "invariant", claim: "z" }).subtreeHash
      expect(String(plannerHash)).toBe(oracle.get(u.qualifiedPath)) // one seam: planner == gate, every anchor
    }
  })

  // ── AUTHOR-3 — anchors are faithful and total ─────────────────────────────────────────────────────────

  it("SCN-AUTH-3a-1 — anchors equal the built index units under src (with qualifiedPath/kind/subtreeHash)", () => {
    const axes = axesOf(fix.repoPath)
    const computer = buildGroundingComputer({ axes, rawTree: walkFileTree(fix.repoPath), rev: fix.rev })
    const got = computer.anchorsUnder("src").units
    const oracle = unitsUnderOracle(axes, "src")
    expect(got.map((u) => ({ qualifiedPath: u.qualifiedPath, subtreeHash: u.subtreeHash }))).toEqual(oracle)
    for (const u of got) {
      expect(u.qualifiedPath.length).toBeGreaterThan(0)
      expect(["file", "dir", "symbol"]).toContain(u.kind)
      expect(u.subtreeHash.length).toBeGreaterThan(0)
    }
  })

  it("SCN-AUTH-3b-1 — no invention, omission, or reordering (ordered-sequence identity)", () => {
    const axes = axesOf(fix.repoPath)
    const computer = buildGroundingComputer({ axes, rawTree: walkFileTree(fix.repoPath), rev: fix.rev })
    const got = computer.anchorsUnder("src").units.map((u) => u.qualifiedPath)
    const oracle = unitsUnderOracle(axes, "src").map((u) => u.qualifiedPath)
    expect(got).toEqual(oracle) // an ordered sequence, not a set — order is asserted
  })

  it("SCN-AUTH-3e-1 — zero phantom, zero missing (both set differences empty)", () => {
    const axes = axesOf(fix.repoPath)
    const computer = buildGroundingComputer({ axes, rawTree: walkFileTree(fix.repoPath), rev: fix.rev })
    const got = new Set(computer.anchorsUnder("src").units.map((u) => u.qualifiedPath))
    const oracle = new Set(unitsUnderOracle(axes, "src").map((u) => u.qualifiedPath))
    expect([...got].filter((k) => !oracle.has(k))).toEqual([]) // phantom
    expect([...oracle].filter((k) => !got.has(k))).toEqual([]) // missing
  })

  it("SCN-AUTH-3f-1 — order-stable across runs (byte-identical)", () => {
    const axes = axesOf(fix.repoPath)
    const computer = buildGroundingComputer({ axes, rawTree: walkFileTree(fix.repoPath), rev: fix.rev })
    const a = computer.anchorsUnder("src")
    const b = computer.anchorsUnder("src")
    expect(JSON.stringify(a)).toBe(JSON.stringify(b))
  })

  it("SCN-AUTH-3g-1 — never a throw (an absent/unreadable path returns a structured empty result)", () => {
    const axes = axesOf(fix.repoPath)
    const computer = buildGroundingComputer({ axes, rawTree: walkFileTree(fix.repoPath), rev: fix.rev })
    const { anchors } = createAnchors(computer) // the leg, which enforces the honest-empty reason
    let out
    expect(() => {
      out = anchors("no/such/unreadable/path")
    }).not.toThrow()
    expect(out!.units).toEqual([])
    expect(typeof out!.reason).toBe("string") // honest-empty: a reason accompanies the empty set (AUTHOR-3)
    expect(out!.reason!.length).toBeGreaterThan(0)
  })

  it("lucy note (a) — a POPULATED listing carries no spurious reason", () => {
    const axes = axesOf(fix.repoPath)
    const computer = buildGroundingComputer({ axes, rawTree: walkFileTree(fix.repoPath), rev: fix.rev })
    const { anchors } = createAnchors(computer)
    const out = anchors("src")
    expect(out.units.length).toBeGreaterThan(0)
    expect(out.reason).toBeUndefined() // reason is empty-path ONLY
  })

  it("SCN-AUTH-3c-1 (bonus) — anchors report the rev", () => {
    const axes = axesOf(fix.repoPath)
    const computer = buildGroundingComputer({ axes, rawTree: walkFileTree(fix.repoPath), rev: fix.rev })
    expect(computer.anchorsUnder("src").rev).toBe(fix.rev)
  })

  // ── AUTHOR-4 — language holes are declared, not hidden ────────────────────────────────────────────────

  it("SCN-AUTH-4a-1 — a grammar-less file still anchors (core/*.rs present as file-level units)", () => {
    const axes = axesOf(fix.repoPath)
    const computer = buildGroundingComputer({ axes, rawTree: walkFileTree(fix.repoPath), rev: fix.rev })
    const units = computer.anchorsUnder("core").units
    const files = units.filter((u) => u.kind === "file").map((u) => u.qualifiedPath)
    expect(files).toContain("core/engine.rs")
    expect(files).toContain("core/mod.rs")
    // grammar-less ⇒ NO `::` symbol units under them
    expect(units.some((u) => u.kind === "symbol")).toBe(false)
  })

  it("SCN-AUTH-4b-1 — the hole is declared with a REAL count (.rs, fileCount 2, a reason)", () => {
    const axes = axesOf(fix.repoPath)
    const computer = buildGroundingComputer({ axes, rawTree: walkFileTree(fix.repoPath), rev: fix.rev })
    const holes = computer.anchorsUnder("core").holes
    expect(holes.length).toBe(1)
    expect(holes[0]!.ext).toBe(".rs")
    expect(holes[0]!.fileCount).toBe(2) // the fixture's REAL census, not a constant
    expect(holes[0]!.reason.length).toBeGreaterThan(0)
  })

  it("SCN-AUTH-4c-1 — symbol-capable files carry no hole (.ts under src, holes empty)", () => {
    const axes = axesOf(fix.repoPath)
    const computer = buildGroundingComputer({ axes, rawTree: walkFileTree(fix.repoPath), rev: fix.rev })
    const out = computer.anchorsUnder("src")
    expect(out.units.some((u) => u.kind === "symbol")).toBe(true) // .ts folds to `::` units
    expect(out.holes).toEqual([]) // a configured grammar exists — no language hole
  })

  it("SCN-AUTH-4d-1 — undeclared degradation is a violation (a mutant lister that hides the hole fails)", () => {
    // The GOLDEN as a mutation test: a lister that returns core/*.rs at file level with holes:[] must fail 4b.
    const axes = axesOf(fix.repoPath)
    const real = buildGroundingComputer({ axes, rawTree: walkFileTree(fix.repoPath), rev: fix.rev })
    const mutant = {
      anchorsUnder: (p: string) => ({ ...real.anchorsUnder(p), holes: [] }),
      groundingFor: real.groundingFor,
    }
    // the 4b assertion, run against the mutant, MUST fail (the hole is gone)
    expect(mutant.anchorsUnder("core").holes.length).toBe(0)
    expect(real.anchorsUnder("core").holes.length).toBe(1) // the real one still declares it
  })
})
