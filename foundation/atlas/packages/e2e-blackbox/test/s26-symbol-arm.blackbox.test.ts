// @atlas/e2e-blackbox — test/s26-symbol-arm.blackbox.test.ts  (S26 — the symbol arm survives the PROPOSER
// POOL, and the two A/B arms really are two arms of ONE binary)
//
// WHY THIS FILE EXISTS AT ALL, stated first because it is the whole point. #182's unit goldens — 32 cases
// across three files — ALL PASS with `await initAst()` deleted from `packages/cli/src/mine-worker.ts`, and
// `tsc -b` still exits 0. MEASURED, by deleting the line and rebuilding:
//
//     arm FILE     exit 0, 2 sites, unchanged
//     arm SYMBOL   exit 1 — site 1 seeded, site 2 INTERRUPTED, sites 3-6 UNVISITED
//     unit suite   2563/2563 green, tsc 0
//
// The cause is structural and invisible from `src/`: `bin.ts` awaits `initAst()` on the MAIN thread, but a
// worker thread has its OWN module registry and its own null grammar singletons, and EVERY model call goes
// through a worker whenever the proposer came from operator config (`usePool`, mine.ts). The unit suite has
// no worker, so it cannot see it. A one-line deletion re-breaks the symbol arm in the ONLY configuration
// production actually uses, and nothing goes red.
//
// So the guard has to be here: the built binary, a subprocess, a real worker pool, a real `::` site.
//
// NO LIVE MODEL. `roles.propose.cmd` is `echo` — a deterministic, offline stand-in returning a fixed
// non-empty claim (the same device S25 uses). What is under test is REACHABILITY through the pool, never
// what a model would say.

import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterAll, describe, expect, it } from "vitest"

import { makeFixtureRepo, runAtlas } from "../src/harness.js"
import type { FixtureRepo } from "../src/harness.js"

/** The claim the stand-in "model" emits on stdout. Non-empty ⇒ a proposal, not an abstention. */
// [ADR-0020] The advisory arm now uses the reason-freely BLOCK contract: a proposal is one fenced `atlas-fact`
// block carrying `{"claim": ...}`; a bare line abstains.
const CLAIM_TEXT = "greet upper-cases its argument before formatting it"
const CLAIM = "```atlas-fact\n" + JSON.stringify({ claim: CLAIM_TEXT }) + "\n```"
const ECHOING = JSON.stringify({ roles: { propose: { cmd: "echo", args: [CLAIM] } } })

/** `greet` is defined in util.ts and referenced in app.ts ⇒ one resolved dep edge ⇒ both files reach the
 *  frontier. `greet` holds a closure, so the corpus carries BOTH sub-file kinds: `symbol` and `block`. */
const FILES = {
  "src/util.ts":
    "export function greet(name: string): string {\n  const shout = (s: string): string => s.toUpperCase();\n  return shout(`hi ${name}`);\n}\n\nfunction privateHelper(): void {}\n",
  "src/app.ts": "import { greet } from './util';\n\nexport function main(): string {\n  return greet('world');\n}\n",
}
const INDEX = [
  { path: "src/util.ts", defines: ["util/greet()."] },
  { path: "src/app.ts", references: ["util/greet()."] },
]

let repo: FixtureRepo | undefined
const scratch: string[] = []

function indexedRepo(): FixtureRepo {
  repo ??= makeFixtureRepo({ files: FILES, index: INDEX })
  return repo
}

function operatorConfig(body: string): string {
  const d = mkdtempSync(join(tmpdir(), "atlas-s26-operator-"))
  scratch.push(d)
  const p = join(d, "model.json")
  writeFileSync(p, body)
  return p
}

/** The per-site ledger the run prints, parsed as the structured records they are. */
interface Site {
  readonly rank: number
  readonly kind: string
  readonly path: string
  readonly outcome: string
  /** The ANCHORS of the facts the site produced. Asserted rather than dropped: it is the end of the #182
   *  chain — a symbol site whose fact is anchored at the FILE would mean the narrowing stopped at the
   *  prompt and never reached the store. */
  readonly facts: readonly string[]
}
const sitesOf = (stdout: string): Site[] =>
  stdout
    .split("\n")
    .filter((l) => l.startsWith("site: "))
    .map((l) => JSON.parse(l.slice("site: ".length)) as Site)

afterAll(() => {
  repo?.cleanup()
  while (scratch.length > 0) rmSync(scratch.pop()!, { recursive: true, force: true })
})

describe("S26 — the symbol arm is REACHED through the proposer pool, and arm FILE is untouched", () => {
  it("THE GUARD: every `::` site is visited and seeded when the run goes through worker threads", () => {
    // teeth (breaks-on "the pool worker stops warming the tree-sitter grammar"): with `await initAst()`
    // removed from `mine-worker.ts` the fold inside the unit-granular reader is a total no-op, no `::` key
    // resolves, the prompt factory refuses for want of bytes, and this run exits 1 with site 2 INTERRUPTED
    // and sites 3-6 UNVISITED. Verified RED against exactly that deletion, with a rebuild, before this file
    // was committed — and verified that the entire unit suite stayed green through the same deletion.
    // ATLAS_MINE_SLOT pinned to the advisory arm: this story tests the FRONTIER dimension (symbol vs file)
    // under advisory, not the multi-arm default (which is proven in s-sound-default + the mine-arms unit suite).
    const run = runAtlas(indexedRepo().repoPath, ["mine", "."], {
      ATLAS_MODEL_CONFIG: operatorConfig(ECHOING),
      ATLAS_FRONTIER: "symbol",
      ATLAS_MINE_SLOT: "advisory",
    })
    const sites = sitesOf(run.stdout)

    expect(run.exitCode).toBe(0)
    // EXACT records, in rank order — not a count, and not `toContain`, which cannot tell `src/util.ts`
    // from `src/util.ts::function_declaration:0:greet`. The order is the #182 prior: the file, then its
    // EXPORTED symbol, then that symbol's block, then the private helper.
    expect(sites).toEqual([
      { rank: 1, kind: "file", path: "src/util.ts", outcome: "seeded", facts: ["src/util.ts"] },
      {
        rank: 2,
        kind: "symbol",
        path: "src/util.ts::function_declaration:0:greet",
        outcome: "seeded",
        facts: ["src/util.ts::function_declaration:0:greet"],
      },
      {
        rank: 3,
        kind: "block",
        path: "src/util.ts::function_declaration:0:greet::arrow_function:0",
        outcome: "seeded",
        facts: ["src/util.ts::function_declaration:0:greet::arrow_function:0"],
      },
      {
        rank: 4,
        kind: "symbol",
        path: "src/util.ts::function_declaration:0:privateHelper",
        outcome: "seeded",
        facts: ["src/util.ts::function_declaration:0:privateHelper"],
      },
      { rank: 5, kind: "file", path: "src/app.ts", outcome: "seeded", facts: ["src/app.ts"] },
      {
        rank: 6,
        kind: "symbol",
        path: "src/app.ts::function_declaration:0:main",
        outcome: "seeded",
        facts: ["src/app.ts::function_declaration:0:main"],
      },
    ])
    // NOT VACUOUS: the pool is only used when a model really was resolved from operator config.
    expect(run.stdout).not.toContain("no proposer model is wired")
    expect(run.stdout).toContain("cost: llmCalls 6 · budgetSpent 6")
  })

  it("arm FILE is the default and is UNCHANGED — the same binary, the shipped frontier", () => {
    // I6 at the outermost boundary there is. If sub-file seeding ever becomes the default, this goes red
    // before any consumer of `atlas mine` discovers it in the field.
    const run = runAtlas(indexedRepo().repoPath, ["mine", "."], {
      ATLAS_MODEL_CONFIG: operatorConfig(ECHOING),
      ATLAS_MINE_SLOT: "advisory",
    })

    expect(run.exitCode).toBe(0)
    expect(sitesOf(run.stdout)).toEqual([
      { rank: 1, kind: "file", path: "src/util.ts", outcome: "seeded", facts: ["src/util.ts"] },
      { rank: 2, kind: "file", path: "src/app.ts", outcome: "seeded", facts: ["src/app.ts"] },
    ])
  })

  it("a MISSPELLED arm reads as arm FILE, never as an unnamed third behaviour", () => {
    // The fail-open direction, asserted rather than assumed: only the exact literal `symbol` widens the
    // frontier, so a typo cannot silently produce a frontier nobody named.
    const typo = runAtlas(indexedRepo().repoPath, ["mine", "."], {
      ATLAS_MODEL_CONFIG: operatorConfig(ECHOING),
      ATLAS_FRONTIER: "symbols",
      ATLAS_MINE_SLOT: "advisory",
    })

    expect(typo.exitCode).toBe(0)
    expect(sitesOf(typo.stdout).map((s) => s.kind)).toEqual(["file", "file"])
  })
})
