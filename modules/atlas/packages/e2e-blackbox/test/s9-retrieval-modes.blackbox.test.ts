// @atlas/e2e-blackbox — test/s9-retrieval-modes.blackbox.test.ts  (S9 — the three-mode `atlas query --by …` door)
//
// NARRATIVE: a lead grounds TWO facts on two files where one statically DEPENDS on the other (a real SCIP
// reference→definition edge: `src/use.ts` references a symbol DEFINED in `src/dep.ts`). `atlas query` then
// exercises the CLOSED three-mode retrieval surface (INDEX-6) through the REAL `atlas` bin:
//   (i)   `--by dependency <path>` returns the dependency-REACHABLE fact (the dependent `use`, via the blast
//         radius = reverse closure over the real authored edge) — and NOT the queried node's own fact.
//   (ii)  `--by scope` is UNCHANGED (byte-identical projection path) — both under-scope facts appear.
//   (iii) `--by trigger <tag>` is TOTAL and returns an HONEST EMPTY pack — the DOCUMENTED dormant mode (no
//         trigger-axis producer exists in the monorepo; see docs/design/adr-retrieval-node-doors.md). This is
//         asserted as an intentional empty, NOT a masked bug.
//   (iv)  `--by bogus` fails CLOSED (structured error, non-zero exit) — the marshaller rejects the mode.
//
// Every EXECUTION + ASSERTION is pure black-box (subprocess). Product libs are touched ONLY to author the
// grounded input facts + a valid SCIP dump (the crux — grounded facts authored through the product draft door).
//
// #189: the fixture's edge symbol was `local S` until this line was added — a SCIP `local` symbol is
// document-scoped BY GRAMMAR and cannot legally cross `src/dep.ts` → `src/use.ts` at all, so this story's
// "real SCIP reference→definition edge" was, until the #189 fix, silently riding a `deriveEdges` defect
// that joined same-named `local` symbols across documents rather than a real cross-document edge. Renamed
// to the plain, non-reserved `sym S`, which is what a legitimate cross-file SCIP symbol looks like.

import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { writeFileSync } from "node:fs"
import { join } from "node:path"
import { create } from "@bufbuild/protobuf"
import {
  serializeSCIP,
  IndexSchema,
  MetadataSchema,
  ToolInfoSchema,
  DocumentSchema,
  OccurrenceSchema,
  SymbolRole,
} from "@c4312/scip"
import { makeFixtureRepo, runAtlas } from "../src/harness.js"
import type { FixtureRepo } from "../src/harness.js"
import { draftFact } from "./support.js"
import type { GroundedFact } from "@atlas/knowledge"
import { ACTOR, RATIFIER, emitFact, invLines, scopedPolicy } from "./support.js"

/** The distinct claim bodies — so a mode's pack is identified by WHICH fact it surfaces (never a coincidence). */
const CLAIM_DEP = "dep is the base unit"
const CLAIM_USE = "use depends on dep" //     src/use.ts @ slot invariant
const CLAIM_USE2 = "use also has a gotcha" // src/use.ts @ slot gotcha (SAME file, DIFFERENT slot)

/**
 * Overwrite the fixture's `.atlas/index.scip` with a REAL depends-on edge: `src/use.ts` has a REFERENCE
 * occurrence to symbol `S`, `src/dep.ts` has its DEFINITION — so `deriveEdges` mints a `resolved` edge
 * use → dep, and the reverse closure (blast radius) of `dep` is `{use}`. The runtime reads this file directly
 * (readScipOrEmpty), independent of git; SCIP affects ONLY the dependency edges, never a file node's
 * subtreeHash, so the file-anchored groundings still re-derive FRESH.
 */
function writeScipDepEdge(repoPath: string): void {
  const scip = create(IndexSchema, {
    metadata: create(MetadataSchema, {
      projectRoot: `file://${repoPath}`,
      toolInfo: create(ToolInfoSchema, { name: "atlas-e2e-blackbox", version: "0" }),
    }),
    documents: [
      create(DocumentSchema, {
        relativePath: "src/dep.ts",
        occurrences: [create(OccurrenceSchema, { symbol: "sym S", symbolRoles: SymbolRole.Definition })],
      }),
      create(DocumentSchema, {
        relativePath: "src/use.ts",
        occurrences: [create(OccurrenceSchema, { symbol: "sym S", symbolRoles: 0 })], // 0 ⇒ reference
      }),
    ],
  })
  writeFileSync(join(repoPath, ".atlas", "index.scip"), serializeSCIP(scip))
}

let repo: FixtureRepo
let factDep: GroundedFact //  anchored at src/dep.ts — the depended-upon unit
let factUse: GroundedFact //  anchored at src/use.ts @ slot invariant — a dependent-unit fact
let factUse2: GroundedFact // anchored at src/use.ts @ slot gotcha — a SECOND dependent-unit fact (SAME file)
let priorActor: string | undefined
let priorRatify: string | undefined

beforeAll(() => {
  priorActor = process.env.ATLAS_ACTOR
  priorRatify = process.env.ATLAS_RATIFY_TOKEN
  process.env.ATLAS_ACTOR = ACTOR
  process.env.ATLAS_RATIFY_TOKEN = RATIFIER // T1 facts route to full-ratify — a lead ratifier drives emit
  repo = makeFixtureRepo({
    files: {
      "src/dep.ts": "export const dep = 1;\n", //  the base unit `use` will depend on
      "src/use.ts": "export const use = 2;\n", //  references a symbol defined in dep.ts (SCIP edge below)
    },
    policy: scopedPolicy("src"),
  })
  // Author a REAL depends-on edge into the SCIP dump the runtime reads (use → dep).
  writeScipDepEdge(repo.repoPath)

  factDep = draftFact(repo, "src/dep.ts", "invariant", CLAIM_DEP).fact
  factUse = draftFact(repo, "src/use.ts", "invariant", CLAIM_USE).fact
  // TWO facts on the SAME file at DIFFERENT slots ⇒ distinct nodeKeys, ONE shared primaryAnchor. depgraph
  // edges are file-granular, so the blast-radius bridge maps one closure key to BOTH — the multimap teeth.
  factUse2 = draftFact(repo, "src/use.ts", "gotcha", CLAIM_USE2).fact
  for (const [label, f] of [
    ["dep", factDep],
    ["use", factUse],
    ["use2", factUse2],
  ] as const) {
    const e = emitFact(repo, f)
    if (e.exitCode !== 0) throw new Error(`S9 setup: ${label} grounded emit failed:\n${e.stdout}`)
  }
})

afterAll(() => {
  repo?.cleanup()
  if (priorActor === undefined) delete process.env.ATLAS_ACTOR
  else process.env.ATLAS_ACTOR = priorActor
  if (priorRatify === undefined) delete process.env.ATLAS_RATIFY_TOKEN
  else process.env.ATLAS_RATIFY_TOKEN = priorRatify
})

describe("S9 — atlas query: the CLOSED three retrieval modes (scope | dependency | trigger)", () => {
  it("(i) `--by dependency <path>` returns ALL dependency-reachable facts — incl. 2 on ONE file (multimap teeth)", () => {
    // Query the DEPENDED-UPON node (`src/dep.ts`); the blast radius (reverse closure) is `{use}`, so the pack
    // carries EVERY fact anchored at the dependent — routed THROUGH the designed `createRetrieval`. The two
    // src/use.ts facts share one file-granular closure key: the lossy 1:1 bridge (pre-fix) kept only the LAST,
    // silently dropping one — this asserts BOTH come back (the multimap fix; lucy's red→green).
    const dep = runAtlas(repo.repoPath, ["query", "src/dep.ts", "--by", "dependency"])
    expect(dep.exitCode).toBe(0)
    expect(dep.stdout).toContain("status: ok")
    const lines = invLines(dep.stdout)
    expect(lines.length).toBe(2) //                               BOTH dependent facts (not just the last-written)
    expect(dep.stdout).toContain(CLAIM_USE) //                    the invariant-slot dependent fact
    expect(dep.stdout).toContain(CLAIM_USE2) //                   the gotcha-slot dependent fact (SAME file)
    expect(dep.stdout).not.toContain(CLAIM_DEP) //               a node is NEVER in its own blast radius
  })

  it("(ii) `--by scope` is UNCHANGED — every under-scope fact appears (byte-identical projection path)", () => {
    // The default mode (and the explicit `--by scope`) resolve the covering pack; ALL facts live under `src`.
    const explicit = runAtlas(repo.repoPath, ["query", "src", "--by", "scope"])
    expect(explicit.exitCode).toBe(0)
    const lines = invLines(explicit.stdout)
    expect(lines.length).toBe(3)
    expect(explicit.stdout).toContain(CLAIM_DEP)
    expect(explicit.stdout).toContain(CLAIM_USE)
    expect(explicit.stdout).toContain(CLAIM_USE2)
    // N12 CLI/MCP parity: the CLI query block surfaces `tokenEstimate` (previously MCP-only).
    expect(explicit.stdout).toMatch(/tokenEstimate: \d+/)

    // `--by` OMITTED defaults to scope — byte-identical stdout to the explicit `--by scope` (back-compat).
    const bare = runAtlas(repo.repoPath, ["query", "src"])
    expect(bare.exitCode).toBe(0)
    expect(bare.stdout).toBe(explicit.stdout)
  })

  it("(iii) `--by trigger <tag>` is TOTAL and returns an HONEST EMPTY pack (documented dormant mode)", () => {
    // NO trigger-axis producer exists in the monorepo, so `triggers` is EMPTY and byTrigger returns [] for
    // every tag. This asserts the HONEST empty (exit 0, status ok, ZERO inv rows) — the DOCUMENTED dormant
    // mode (docs/design/adr-retrieval-node-doors.md §1), NOT a masked bug: the door is total, it simply has
    // nothing to serve until a trigger-tag producer is a separate future feature.
    const trig = runAtlas(repo.repoPath, ["query", "anytag", "--by", "trigger"])
    expect(trig.exitCode).toBe(0) //          total — a miss is an empty pack, never a throw
    expect(trig.stdout).toContain("status: ok")
    expect(invLines(trig.stdout)).toEqual([]) // the honest empty — dormant, not broken
    expect(trig.stdout).toContain("stale: false")
    expect(trig.stderr).toBe("") //           no stack leaked
  })

  it("(iv) `--by bogus` fails CLOSED — structured error + non-zero exit (the marshaller rejects the mode)", () => {
    const bogus = runAtlas(repo.repoPath, ["query", "src", "--by", "bogus"])
    expect(bogus.exitCode).not.toBe(0)
    expect(bogus.exitCode).toBe(1)
    expect(bogus.stdout).toContain("status: error")
    expect(bogus.stdout).toContain("query --by must be one of scope|dependency|trigger")
    expect(bogus.stderr).toBe("") // fail-closed to a structured error, never a crash trace
  })
})
