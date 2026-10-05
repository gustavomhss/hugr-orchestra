// @atlas/adapter-io — test/symbol-frontier.test.ts  (#182 — the three spellings of a unit's address agree)
//
// THE SEAM THIS EXISTS FOR. A sub-file unit is named THREE times by three different modules, and nothing
// in the type system makes them agree:
//   1. `ast.ts` `unitPath` mints the fold PATH        — `<raw file path>::<escaped local>`
//   2. `index/build.ts` `mintKey` mints the node KEY  — `<escaped file path>::<safeUnitLocal>`
//   3. `genesis/seeds.ts` reconstructs the ADDRESS from (2) by unescaping the file part
// and then `unit-source.ts` looks (3) up in a tree keyed by (1). If any pair disagrees, the frontier emits
// sites whose bytes can never be produced and EVERY one of them takes the `source-unreadable` refusal —
// which reads, from the outside, exactly like a repository that holds no facts. That is the failure shape
// #155/S25 already cost this project once, so it is pinned end to end rather than per-module.
//
// It also carries I1 on the REAL fold: every seed the frontier emits is a seed the reader can resolve.
//
// The fold is driven directly (not through `walkFileTree`) so the case needs no git repository, while the
// READER is pointed at real files on disk — the two halves the wiring has to join.

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeAll, describe, expect, it } from "vitest"

import { build } from "@atlas/index"
import type { FileTree, ScipOutput } from "@atlas/index"
import { canonicalizeSkeleton, rank, structuralSeeds } from "@atlas/genesis"
import type { Skeleton } from "@atlas/genesis"

import { foldAstUnitsWithPriors, initAst } from "../src/ast.js"
import { createUnitSourceReader } from "../src/unit-source.js"

beforeAll(async () => {
  await initAst()
}, 60_000)

const repos: string[] = []
afterEach(() => {
  while (repos.length > 0) rmSync(repos.pop()!, { recursive: true, force: true })
})

// ── the corpus: two real modules, one dependency edge between them ────────────────────────────────────
const UTIL = [
  "export function greet(name: string): string {",
  "  const shout = (s: string): string => s.toUpperCase();",
  "  return shout(`hi ${name}`);",
  "}",
  "",
  "function privateHelper(): void {}",
  "",
].join("\n")
const APP = ["import { greet } from './util';", "", 'export const main = (): string => greet("world");', ""].join("\n")

const FILES: Readonly<Record<string, string>> = { "src/util.ts": UTIL, "src/app.ts": APP }
const SYM = "util/greet()."
const SCIP: ScipOutput = {
  documents: [
    { relativePath: "src/util.ts", occurrences: [{ symbol: SYM, role: "definition" }] },
    { relativePath: "src/app.ts", occurrences: [{ symbol: SYM, role: "reference" }] },
  ],
}

const RAW: FileTree = {
  path: ".",
  children: [
    {
      path: "src",
      children: Object.entries(FILES).map(([path, content]) => ({ path, children: [], content })),
    },
  ],
}

function repoOnDisk(): string {
  const d = mkdtempSync(join(tmpdir(), "atlas-symfrontier-"))
  repos.push(d)
  mkdirSync(join(d, "src"), { recursive: true })
  for (const [rel, body] of Object.entries(FILES)) writeFileSync(join(d, rel), body)
  return d
}

function folded(): {
  readonly sk: Skeleton
  readonly prior: (p: string) => { exported: boolean; bytes: number } | undefined
} {
  const f = foldAstUnitsWithPriors(RAW)
  const sk = canonicalizeSkeleton({ axes: build(f.tree, SCIP), manifest: { territories: [] } })
  return { sk, prior: (p) => f.priors.get(p) }
}

describe("#182 — one parse, three spellings, and they agree on the REAL fold", () => {
  it("I1 — every sub-file seed the frontier emits resolves to non-empty bytes through the reader", () => {
    // THE WIRING ASSERTION. teeth (breaks-on "the frontier reconstructs the address without unescaping the
    // file part", and on "the reader looks the site up by index key rather than by fold path"): either
    // mutant leaves this loop reading `null` at every unit while the seed list looks perfectly healthy.
    const { sk, prior } = folded()
    const read = createUnitSourceReader(repoOnDisk())
    const units = structuralSeeds(sk, { subFile: true, prior }).filter((s) => s.kind !== "file")

    expect(units.length).toBeGreaterThan(0) // NOT VACUOUS: the loop must quantify over something
    const unresolved = units.filter((s) => read.read(s) === null).map((s) => s.qualifiedPath)
    expect(unresolved).toEqual([]) // the MATCHED items, not a count — a bare number names nothing
  })

  it("the bytes the reader serves are exactly as long as the prior said the unit was", () => {
    // The prior and the reader are two different modules measuring the same unit. If they disagree, the
    // ordering is ranking units by a size that is not the size of what the model will be shown.
    const { sk, prior } = folded()
    const read = createUnitSourceReader(repoOnDisk())

    for (const s of structuralSeeds(sk, { subFile: true, prior }).filter((x) => x.kind !== "file")) {
      const bytes = new TextEncoder().encode(read.read(s) ?? "").length
      expect(bytes).toBe(prior(s.qualifiedPath)?.bytes)
    }
  })

  it("`exported` is recovered for the real declarations — and it is NOT in the unit's own bytes", () => {
    // teeth (breaks-on "unwrapExport goes back to dropping the wrapper"): both read `false` and the
    // strongest ordering prior silently becomes a constant. The second half is why it must be CARRIED:
    // the exported item's slice starts INSIDE the export statement, so no downstream reader of the bytes
    // could have recovered the fact.
    const { prior } = folded()
    const greet = "src/util.ts::function_declaration:0:greet"
    const helper = "src/util.ts::function_declaration:0:privateHelper"

    expect(prior(greet)?.exported).toBe(true)
    expect(prior(helper)?.exported).toBe(false)
    const read = createUnitSourceReader(repoOnDisk())
    expect(
      read.read({ kind: "symbol", qualifiedPath: greet, subtreeHash: "x" as never })?.startsWith("function greet"),
    ).toBe(true)
  })

  it("the ranked order puts the file first, then its EXPORTED unit before its private one", () => {
    // The prior doing its job on real declarations rather than on hand-chosen numbers: `greet` is exported
    // and `privateHelper` is not, so the surface is offered to the budget first.
    const { sk, prior } = folded()
    const order = rank(sk, structuralSeeds(sk, { subFile: true, prior }), { prior })
      .map((c) => c.site.qualifiedPath)
      .filter((p) => p.startsWith("src/util.ts"))

    expect(order).toEqual([
      "src/util.ts",
      "src/util.ts::function_declaration:0:greet",
      "src/util.ts::function_declaration:0:greet::arrow_function:0",
      "src/util.ts::function_declaration:0:privateHelper",
    ])
  })

  it("arm FILE over the same fold is exactly the shipped two-site frontier", () => {
    // I6 on the real fold — the sub-file machinery is present and inert unless asked for.
    const { sk, prior } = folded()
    expect([...structuralSeeds(sk, { prior })].map((s) => s.qualifiedPath).sort()).toEqual([
      "src/app.ts",
      "src/util.ts",
    ])
    expect([...structuralSeeds(sk, { prior })].every((s) => s.kind === "file")).toBe(true)
  })
})
