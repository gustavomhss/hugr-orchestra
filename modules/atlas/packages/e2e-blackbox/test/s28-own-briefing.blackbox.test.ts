// @atlas/e2e-blackbox — test/s28-own-briefing.blackbox.test.ts  (S28 — the `atlas own <scope>` briefing door)
//
// NARRATIVE: a lead files three facts under `src` — an invariant, a gotcha and a definition — plus one fact
// on a file that statically DEPENDS on the scope (a real SCIP reference→definition edge). `atlas own src`
// then composes the RETR-12 curated briefing through the REAL `atlas` bin and hands back what was filed:
// the role from the definition fact, the invariants and gotchas partitioned by slot, the terrain, the
// dependent's fact in the blast summary, and the D1 content-free availability map.
//
// WHY THIS STORY EXISTS, in one measurement. Before the wiring under it, `@atlas/retrieval` had NO runtime
// edge into the product: every import of it from another package's `src` was `import type`, and `createOwn`
// — the composer this story drives — had exactly one caller in the monorepo, its own test file. A grep for
// the caller is not proof that it runs; `planIndexers` and `makeAdmitGate` both had passing tests and no
// callers. So the proof here is EXECUTION: a subprocess of the BUILT binary, against a real temp git repo,
// emitting a fact through the real write door and reading it back through the new read door.
//
// SOTA invariants pinned:
//   - THE LOOP CLOSES: a fact emitted through `atlas emit` is served by `atlas own` in the same repo.
//   - ONE STORE, TWO PROJECTIONS: the fact set `own <scope>` serves is EXACTLY the set `query <scope>`
//     serves — same nodeKeys, no more and no less. A briefing over a differently-derived store would be a
//     different repository's knowledge wearing this repository's scope name.
//   - THE SLOT PARTITION IS REAL: a `gotcha`-slot fact renders as a `gotcha` row, not an `inv` row, while
//     `query` (which does not partition) shows both as `inv`.
//   - THE BLAST SUMMARY IS REAL: it rides the SAME reverse closure `query --by dependency` serves from.
//   - TOOLS-6 HOLDS ON THIS DOOR TOO: a `T2` fact is off the GOVERNING verbs of the briefing exactly as it
//     is off the pack's — and, since REQ-RETR-12m, it is on the ADVISORY verb of both, never on neither.
//   - TOTAL (RETR-9): a scope that names no index unit is an empty briefing + exit 0, never a throw.
//   - READ-ONLY: driving the door leaves the durable store byte-identical.
//   - DETERMINISTIC (RETR-12): equal input ⇒ byte-identical output.
//
// Every EXECUTION + ASSERTION is pure black-box (subprocess). Product libs are touched ONLY to author the
// grounded input facts + a valid SCIP dump (the crux — grounded facts authored through the product draft door / S9).
//
// #189: the fixture's edge symbol was `local G` until this line was added — a SCIP `local` symbol is
// document-scoped BY GRAMMAR and cannot legally cross `src/greet.ts` → `src/caller.ts` at all, so THE
// BLAST SUMMARY IS REAL claim above was, until the #189 fix, silently riding a `deriveEdges` defect that
// joined same-named `local` symbols across documents rather than a real cross-document edge. Renamed to
// the plain, non-reserved `sym G`, which is what a legitimate cross-file SCIP symbol looks like.

import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { createHash } from "node:crypto"
import { readFileSync, readdirSync, writeFileSync } from "node:fs"
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

/** Distinct claim bodies — a row is identified by WHICH fact it carries, never by a coincidence of shape. */
const CLAIM_INV = "greet returns a non-empty string"
const CLAIM_GOTCHA = "greet does not escape its argument"
const CLAIM_DEF = "src is the demo greeting service"
const CLAIM_DEP = "the caller retries greet once"
/** A `T2` fact: auto-accepted by the write door, bounded OUT of every read pack (TOOLS-6). */
const CLAIM_T2 = "a T2 note that no read door may serve"

/** The rendered `  inv <tier> <nodeId>: <claim>` rows of an `own` briefing (same vocabulary as a query pack). */
const ownInvRows = (stdout: string): string[] => stdout.split("\n").filter((l) => l.startsWith("  inv "))
/** The rendered `  gotcha <tier> <id>: <claim>` rows. */
const gotchaRows = (stdout: string): string[] => stdout.split("\n").filter((l) => l.startsWith("  gotcha "))
/** The rendered `  dependent <nodeId>` rows (the capped blast summary). */
const dependentRows = (stdout: string): string[] => stdout.split("\n").filter((l) => l.startsWith("  dependent "))
/** The rendered `  available <name> (<kind>) -> <pull>` rows (the D1 content-free manifest). */
const availableRows = (stdout: string): string[] => stdout.split("\n").filter((l) => l.startsWith("  available "))

/** The nodeKeys a set of `  <verb> <tier> <nodeKey>: …` rows names, sorted (identity, not prose). The same
 *  shape `atlas query`'s `inv` rows carry, so one extractor reads both doors' output. */
const keysOf = (rows: readonly string[]): string[] =>
  rows.map((l) => (l.trim().split(/\s+/)[2] ?? "").replace(/:$/, "")).sort()

/**
 * Overwrite the fixture's `.atlas/index.scip` with a REAL depends-on edge: `src/caller.ts` REFERENCES a
 * symbol whose DEFINITION is in `src/greet.ts`, so the reverse closure (blast radius) of `greet` is
 * `{caller}`. Identical construction to S9 — SCIP affects ONLY dependency edges, never a file node's
 * subtreeHash, so every file-anchored grounding still re-derives FRESH at the emit gate.
 */
function writeScipDepEdge(repoPath: string): void {
  const scip = create(IndexSchema, {
    metadata: create(MetadataSchema, {
      projectRoot: `file://${repoPath}`,
      toolInfo: create(ToolInfoSchema, { name: "atlas-e2e-blackbox", version: "0" }),
    }),
    documents: [
      create(DocumentSchema, {
        relativePath: "src/greet.ts",
        occurrences: [create(OccurrenceSchema, { symbol: "sym G", symbolRoles: SymbolRole.Definition })],
      }),
      create(DocumentSchema, {
        relativePath: "src/caller.ts",
        occurrences: [create(OccurrenceSchema, { symbol: "sym G", symbolRoles: 0 })], // 0 ⇒ reference
      }),
    ],
  })
  writeFileSync(join(repoPath, ".atlas", "index.scip"), serializeSCIP(scip))
}

/** A content digest of the whole durable store — every file under `.atlas/`, path + bytes, in sorted order.
 *  The read-only proof compares this across a run of the door; a single persisted byte moves it. */
function storeDigest(repoPath: string): string {
  const h = createHash("sha256")
  const walk = (dir: string, prefix: string): void => {
    for (const e of readdirSync(dir, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1))) {
      const p = join(dir, e.name)
      if (e.isDirectory()) walk(p, `${prefix}${e.name}/`)
      else h.update(`${prefix}${e.name}\0`).update(readFileSync(p))
    }
  }
  walk(join(repoPath, ".atlas"), "")
  return h.digest("hex")
}

let repo: FixtureRepo
let factInv: GroundedFact
let factGotcha: GroundedFact
let factDef: GroundedFact
let factDep: GroundedFact
let factT2: GroundedFact
let priorActor: string | undefined
let priorRatify: string | undefined

beforeAll(() => {
  priorActor = process.env.ATLAS_ACTOR
  priorRatify = process.env.ATLAS_RATIFY_TOKEN
  process.env.ATLAS_ACTOR = ACTOR
  process.env.ATLAS_RATIFY_TOKEN = RATIFIER // T1 facts route to full-ratify — a lead ratifier drives emit
  repo = makeFixtureRepo({
    files: {
      "src/greet.ts": "export const greet = (n) => `hi ${n}`;\n",
      "src/caller.ts": "export const call = 1;\n", // references a symbol defined in greet.ts (SCIP below)
      "lib/spare.ts": "export const spare = 0;\n", // a real code unit with NOTHING filed under it
    },
    policy: scopedPolicy("src"),
  })
  writeScipDepEdge(repo.repoPath)

  const at = (filePath: string, slot: "invariant" | "gotcha" | "definition", claim: string, tier?: "T2") =>
    draftFact(repo, filePath, slot, claim, tier ?? "T1").fact

  factInv = at("src/greet.ts", "invariant", CLAIM_INV)
  factGotcha = at("src/greet.ts", "gotcha", CLAIM_GOTCHA)
  factDef = at("src/greet.ts", "definition", CLAIM_DEF)
  factDep = at("src/caller.ts", "invariant", CLAIM_DEP)
  // T2 at a DISTINCT (anchor, slot) pair so it mints its own nodeKey rather than updating one above.
  factT2 = at("src/caller.ts", "gotcha", CLAIM_T2, "T2")
  for (const [label, f] of [
    ["inv", factInv],
    ["gotcha", factGotcha],
    ["def", factDef],
    ["dep", factDep],
    ["t2", factT2],
  ] as const) {
    const e = emitFact(repo, f)
    if (e.exitCode !== 0) throw new Error(`S28 setup: ${label} grounded emit failed:\n${e.stdout}`)
  }
})

afterAll(() => {
  repo?.cleanup()
  if (priorActor === undefined) delete process.env.ATLAS_ACTOR
  else process.env.ATLAS_ACTOR = priorActor
  if (priorRatify === undefined) delete process.env.ATLAS_RATIFY_TOKEN
  else process.env.ATLAS_RATIFY_TOKEN = priorRatify
})

describe("S28 — atlas own <scope>: the RETR-12 briefing composed over the governed store", () => {
  it("THE LOOP CLOSES — a fact emitted through the write door comes back through `atlas own`", () => {
    // The whole point of the story. `createOwn` runs in production for the first time here: the composer is
    // reached from `bin.ts` → `composeRuntime` → `createOwnLeg`, and what it hands back is what `atlas emit`
    // persisted moments ago, in the SAME temp repo, through a SEPARATE subprocess.
    const own = runAtlas(repo.repoPath, ["own", "src"])
    expect(own.exitCode).toBe(0)
    expect(own.stdout).toContain("status: ok")
    expect(own.stdout).toContain("own: own_src")
    expect(own.stdout).toContain(CLAIM_INV) //     the invariant-slot fact came back whole
    expect(own.stdout).toContain(CLAIM_GOTCHA) // the gotcha-slot fact came back whole
    expect(own.stderr).toBe("") //                no stack leaked (never a crash)
  })

  it("the role line is sourced from the `definition` fact, and the terrain from the index + the policy", () => {
    const own = runAtlas(repo.repoPath, ["own", "src"])
    expect(own.stdout).toContain(`  role: ${CLAIM_DEF}`) //   RETR-12e: ONE line, from a definition fact
    expect(own.stdout).toContain("  grounding: tree") //      a path scope is grounded by the TREE (RETR-12i)
    expect(own.stdout).toContain(`  owner: ${ACTOR}`) //      the policy-declared scope membership, not a guess
    expect(own.stdout).toContain("  tier: T1") //             the strictest class actually filed here
    expect(own.stdout).toContain("  contains src/caller.ts") // the terrain, from the spatial axis
    expect(own.stdout).toContain("  contains src/greet.ts")
  })

  it("ONE STORE, TWO PROJECTIONS — `own` serves EXACTLY the fact set `query` serves for the same scope", () => {
    // The property that makes the briefing this repository's knowledge rather than a second, differently
    // derived view of it. `own` partitions by slot (inv | gotcha), `query` does not — so the UNION of the
    // briefing's two fact sections must equal the pack, nodeKey for nodeKey, in both directions.
    const own = runAtlas(repo.repoPath, ["own", "src"])
    const query = runAtlas(repo.repoPath, ["query", "src"])
    expect(query.exitCode).toBe(0)
    const briefed = [...keysOf(ownInvRows(own.stdout)), ...keysOf(gotchaRows(own.stdout))].sort()
    const packed = keysOf(invLines(query.stdout))
    expect(briefed).toEqual(packed)
    // invariant + gotcha + definition on `src/greet.ts`, plus the caller's invariant — every T1 fact whose
    // anchor is under `src`. Both doors scope on the SAME `underScope`.
    expect(briefed.length).toBe(4)
    // [AMENDED — REQ-RETR-12m] The equality holds BAND BY BAND, which is the sharper form of the same
    // property and the one this WP restored: the advisory bands of the two doors name the same fact too.
    // Before it, `own`'s advisory band did not exist and the doors agreed only about the ratified half —
    // which is precisely how they came to disagree about a store where every fact is `T2`.
    const advKeys = (out: string): string[] => keysOf(out.split("\n").filter((l) => l.startsWith("  advisory ")))
    expect(advKeys(own.stdout)).toEqual(advKeys(query.stdout))
    expect(advKeys(own.stdout)).toEqual([String(factT2.id)])
  })

  it("the slot partition is REAL — the gotcha-slot fact is a `gotcha` row here and an `inv` row in `query`", () => {
    const own = runAtlas(repo.repoPath, ["own", "src"])
    const gotchas = gotchaRows(own.stdout)
    expect(gotchas.length).toBe(1)
    expect(gotchas[0]).toContain(CLAIM_GOTCHA)
    // …and it is NOT double-counted into the invariants section.
    expect(ownInvRows(own.stdout).join("\n")).not.toContain(CLAIM_GOTCHA)
    // The same fact in the query pack is an ordinary `inv` row — the two doors project one store differently.
    expect(runAtlas(repo.repoPath, ["query", "src"]).stdout).toContain(
      `inv T1 ${factGotcha.id} [FRESH]: ${CLAIM_GOTCHA}`,
    )
  })

  it("the blast summary is REAL — the dependent fact rides the SAME closure `query --by dependency` serves", () => {
    // `src/caller.ts` depends on `src/greet.ts` through the authored SCIP edge. Briefing the DEPENDED-UPON
    // file must name the dependent's fact, and it must be the very same nodeKey the dependency mode returns —
    // the feed is literally the same `blastRadius` map (adapter-io/retrieval-model.ts), not a second walk.
    const own = runAtlas(repo.repoPath, ["own", "src/greet.ts"])
    expect(own.exitCode).toBe(0)
    const deps = dependentRows(own.stdout).map((l) => l.trim().split(" ")[1] ?? "")
    expect(deps).toContain(String(factDep.id))
    expect(deps).not.toContain(String(factInv.id)) // a node is never in its own blast radius

    const byDep = runAtlas(repo.repoPath, ["query", "src/greet.ts", "--by", "dependency"])
    expect(byDep.exitCode).toBe(0)
    expect(byDep.stdout).toContain(String(factDep.id)) // the same identity, out of the same closure
  })

  it("TOOLS-6 on this door: the T2 fact is off BOTH governing verbs, and on the ADVISORY verb of BOTH doors", () => {
    // A read door with a laxer bound than the one beside it is a route around it. The T2 fact was ACCEPTED by
    // the write door (it is in the store, addressable) and must never reach a GOVERNING surface.
    //
    // [AMENDED — REQ-RETR-12m, 2026-08-03] This assertion has now been re-pointed TWICE, and the history is
    // the finding. ADR-0013 made `atlas query` serve a `T2` in a separately capped ADVISORY band, and this
    // test was amended to say `own` was "UNCHANGED and still bounds T2 out entirely". That left the two read
    // doors disagreeing about the same store: on the real 199-fact mined graph — every row `T2` — `own`
    // served 0 of 199 while `query` served them. The amendment was scoped to `query` and never reached here.
    // What was actually being defended is BAND SEPARATION, not silence: a `T2` must not arrive on a
    // GOVERNING verb (`inv` / `gotcha`), and it must arrive labelled as a proposal on BOTH doors.
    const own = runAtlas(repo.repoPath, ["own", "src"]).stdout.split("\n")
    expect(own.filter((l) => l.startsWith("  inv ") && l.includes(CLAIM_T2))).toEqual([])
    expect(own.filter((l) => l.startsWith("  gotcha ") && l.includes(CLAIM_T2))).toEqual([])
    expect(own.filter((l) => l.startsWith("  advisory ") && l.includes(CLAIM_T2))).toHaveLength(1)
    // The advisory row carries the fact's own identity and its own freshness verdict, like every pack row.
    expect(own.filter((l) => l.startsWith("  advisory ") && l.includes(String(factT2.id)))).toHaveLength(1)
    expect(own.filter((l) => l.startsWith("  advisoryDropped: 0"))).toHaveLength(1)

    const q = runAtlas(repo.repoPath, ["query", "src"]).stdout.split("\n")
    expect(q.filter((l) => l.startsWith("  inv ") && l.includes(CLAIM_T2))).toEqual([])
    expect(q.filter((l) => l.startsWith("  advisory ") && l.includes(CLAIM_T2))).toHaveLength(1)
  })

  it("the D1 availability manifest is CONTENT-FREE — it names surfaces and how to pull them, never content", () => {
    const own = runAtlas(repo.repoPath, ["own", "src"])
    const rows = availableRows(own.stdout)
    expect(rows.length).toBe(2) // one pointer per finer unit under `src`
    expect(rows.join("\n")).toContain("own_greet.ts (pack) -> atlas own src/greet.ts")
    // No pointer row carries a claim body — that is the whole property (pointers + how-to-pull, never content).
    for (const claim of [CLAIM_INV, CLAIM_GOTCHA, CLAIM_DEF]) {
      expect(rows.join("\n")).not.toContain(claim)
    }
    // …and the `pull` label it prints is a REAL invocation of this same door.
    const pulled = runAtlas(repo.repoPath, ["own", "src/greet.ts"])
    expect(pulled.exitCode).toBe(0)
    expect(pulled.stdout).toContain("own: own_greet.ts")
  })

  it("TOTAL (RETR-9) — an unknown scope is an EMPTY briefing + exit 0, and it says WHICH emptiness it is", () => {
    // Two emptinesses, deliberately distinguished: a path that is not a code unit at all, and a real code
    // unit with nothing filed under it. Rendering them alike is how a typo reads as an honest "nothing here".
    const bogus = runAtlas(repo.repoPath, ["own", "does/not/exist"])
    expect(bogus.exitCode).toBe(0) //                          total — an empty briefing, never a throw
    expect(bogus.stdout).toContain("status: ok")
    expect(bogus.stdout).toContain("names no unit in the code index")
    expect(bogus.stderr).toBe("") //                           no stack leaked

    const quiet = runAtlas(repo.repoPath, ["own", "lib"])
    expect(quiet.exitCode).toBe(0)
    expect(quiet.stdout).toContain("NO fact is filed under it yet")
    expect(quiet.stdout).toContain("  contains lib/spare.ts") // …but the terrain IS there (it is a real unit)
    expect(ownInvRows(quiet.stdout)).toEqual([])
  })

  it("READ-ONLY + DETERMINISTIC — the door persists nothing, and equal input renders byte-identically", () => {
    const before = storeDigest(repo.repoPath)
    const a = runAtlas(repo.repoPath, ["own", "src"])
    const b = runAtlas(repo.repoPath, ["own", "src"])
    const after = storeDigest(repo.repoPath)
    expect(after).toBe(before) //  not one durable byte moved — writes still funnel through emit/link
    expect(b.stdout).toBe(a.stdout) // RETR-12: byte-identical for equal input (0 LLM, no clock, no nonce)
  })

  it("a bare `atlas own` fails CLOSED at the parser arity floor (structured, exit 1, no crash)", () => {
    const bare = runAtlas(repo.repoPath, ["own"])
    expect(bare.exitCode).toBe(1)
    expect(bare.stdout).toContain("status: error")
    expect(bare.stdout).toMatch(/command 'own' requires 1 positional argument/)
    expect(bare.stderr).toBe("")
  })
})
