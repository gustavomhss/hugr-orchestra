// @atlas/e2e-blackbox — test/s37-sound-relation.blackbox.test.ts  (#99 WP-R8 / AR-14 — the sound-relation e2e story)
//
// NARRATIVE. #99 shipped the ONE relation the code index can PROVE: a `depends-on` edge between two documents,
// derived MECHANICALLY from the SCIP index (no LLM, ever) and sealed `proven`. This story drives that whole leg
// end-to-end THROUGH THE SHIPPED BINARIES — nothing here imports product runtime code into an assertion. It
// stands up a real git repo with a real `.atlas/index.scip` in which `src/app.ts` references BOTH `util/greet().`
// (defined in `src/util.ts`) and `helper/aux().` (defined in `src/helper.ts`) — two witnessed cross-unit
// references, so the projection resolves exactly TWO distinct intra-repo edges: `src/app.ts --depends-on-->
// src/util.ts` and `src/app.ts --depends-on--> src/helper.ts`.
//
// THE FLOW (the shipped user doors, subprocess only):
//   1. `atlas derive-relations` — an AUTHORIZED actor (owns the `src` subject scope + ratify) projects both
//      proven `depends-on` relations through the governed emit door. No LLM: the derivation IS the proof.
//   2. `atlas relations <unit>` — reads them back BOTH directions: outbound from the subject `src/app.ts`, and
//      inbound to each object (`src/util.ts` / `src/helper.ts`), each carrying its `[proven]` seal.
//   3. `atlas node <addr>` — renders one proven relation's `seal: proven` + its re-runnable `RelationWitness`.
//   4. `atlas verify-store` — re-proves BOTH proven relations against the live index → 2 re-proven.
//
// THE DRIFT CONTRAST (the A2 staleness payoff, model-free): rewrite the SCIP index so `src/app.ts` no longer
// references `util/greet().` — the `app --depends-on--> util` edge DISAPPEARS, while `app --depends-on--> helper`
// stays. Re-run `atlas verify-store`: the vanished edge's stored proven relation now reads `broken` (its witness
// no longer re-derives), and the still-present edge stays `re-proven`. A proven relation is exactly as true as the
// current index makes it — drift is caught, never silently served.

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
import type { FixtureRepo, IndexedDoc } from "../src/harness.js"

// The subject/object files and the derived relations' governed scope (`unitScopeOf('src/app.ts') === 'src'`).
// The actor must own that scope for the governed emit door to land the write; the empty actor owns nothing.
const A = "src/app.ts"
const B_UTIL = "src/util.ts"
const B_HELPER = "src/helper.ts"
const SCOPE = "src"
const ACTOR = "bob"
// A promoted proven write (`origin:'promoted'`) faces the ratifier by construction, so BOTH env vars are set —
// exactly as the R7 reachability test's `withActor` does at the composed-handler level.
const ENV = { ATLAS_ACTOR: ACTOR, ATLAS_RATIFY_TOKEN: ACTOR }

const FILES = {
  [B_UTIL]: "export function greet(n: string): string {\n  return `hi ${n}`;\n}\n",
  [B_HELPER]: "export function aux(): number {\n  return 7;\n}\n",
  [A]: "import { greet } from './util';\nimport { aux } from './helper';\n\nexport function main(): string {\n  return `${greet('world')} ${aux()}`;\n}\n",
}
// FRESH: `src/app.ts` references BOTH global symbols ⇒ two resolved cross-unit edges.
const INDEX_FRESH: readonly IndexedDoc[] = [
  { path: B_UTIL, defines: ["util/greet()."] },
  { path: B_HELPER, defines: ["helper/aux()."] },
  { path: A, references: ["util/greet().", "helper/aux()."], defines: ["app/main()."] },
]
// DRIFTED: `src/app.ts` no longer references `util/greet().` — the `app --depends-on--> util` edge is GONE, while
// `app --depends-on--> helper` remains. Both files still exist (util still DEFINES greet), so the vanished edge is
// a genuine A2 drift (the reference disappeared), not a dangling-endpoint tamper.
const INDEX_DRIFTED: readonly IndexedDoc[] = [
  { path: B_UTIL, defines: ["util/greet()."] },
  { path: B_HELPER, defines: ["helper/aux()."] },
  { path: A, references: ["helper/aux()."], defines: ["app/main()."] },
]
// Grant the actor the subject-endpoint's scope so the governed emit door AUTHORIZES the durable write.
const POLICY = JSON.stringify({
  nearDup: { claimNormThreshold: 1 },
  t0Heuristic: { keywords: [] },
  authz: { scopes: { [SCOPE]: [ACTOR] } },
})

/** Rewrite `.atlas/index.scip` in place from an `IndexedDoc[]` — the SAME serialization `makeFixtureRepo` uses
 *  at fixture creation, so the drifted index is byte-faithful to what a fresh SCIP build would emit. The store
 *  (`.atlas/projection.json`) is untouched; the next `composeRuntime` re-reads THIS file as the live index. */
function writeScipIndex(repoPath: string, docs: readonly IndexedDoc[]): void {
  const scip = create(IndexSchema, {
    metadata: create(MetadataSchema, {
      projectRoot: `file://${repoPath}`,
      toolInfo: create(ToolInfoSchema, { name: "atlas-e2e-blackbox", version: "0" }),
    }),
    documents: docs.map((doc) =>
      create(DocumentSchema, {
        relativePath: doc.path,
        occurrences: [
          ...(doc.defines ?? []).map((symbol) =>
            create(OccurrenceSchema, { symbol, symbolRoles: SymbolRole.Definition }),
          ),
          ...(doc.references ?? []).map((symbol) => create(OccurrenceSchema, { symbol, symbolRoles: 0 })),
        ],
      }),
    ),
  })
  writeFileSync(join(repoPath, ".atlas", "index.scip"), serializeSCIP(scip))
}

/** The rendered `  relation <kind> <A> -> <B> (<nodeKey>) [<seal>]` lines of an `atlas relations` verdict. */
function relationLines(stdout: string): string[] {
  return stdout.split("\n").filter((l) => l.trimStart().startsWith("relation "))
}

let repo: FixtureRepo
let utilAddr = ""

beforeAll(() => {
  repo = makeFixtureRepo({ files: FILES, index: INDEX_FRESH, policy: POLICY })
})
afterAll(() => {
  repo?.cleanup()
})

describe("S37 — `atlas derive-relations` proves + persists depends-on relations, reads them back sealed, and drift reads broken", () => {
  it("derive-relations: an authorized actor proves + persists BOTH cross-unit edges (0 refused, exit 0)", () => {
    const derive = runAtlas(repo.repoPath, ["derive-relations"], ENV)
    expect(derive.exitCode).toBe(0)
    expect(derive.stdout).toContain("status: ok")
    // Two distinct intra-repo edges resolved, both proved by the index-only oracle, both landed through the door.
    expect(derive.stdout).toContain("resolved 2 intra-repo edge(s), proved 2, persisted 2; 0 refused")
    expect(derive.stdout).toContain(`persisted ${A} --depends-on--> ${B_UTIL}`)
    expect(derive.stdout).toContain(`persisted ${A} --depends-on--> ${B_HELPER}`)
    // Grab the util edge's durable CAS id for the `atlas node` read below.
    const line = derive.stdout.split("\n").find((l) => l.includes(`--depends-on--> ${B_UTIL}`))
    expect(line).toBeDefined()
    utilAddr = line!.match(/\(([0-9a-f]{64})\)/)![1]!
  })

  it("relations OUT: `atlas relations src/app.ts out` finds BOTH proven depends-on edges from the subject", () => {
    const r = runAtlas(repo.repoPath, ["relations", A, "out"])
    expect(r.exitCode).toBe(0)
    const lines = relationLines(r.stdout)
    expect(lines).toHaveLength(2)
    expect(lines.some((l) => l.includes(`relation depends-on ${A} -> ${B_UTIL}`) && l.includes("[proven]"))).toBe(true)
    expect(lines.some((l) => l.includes(`relation depends-on ${A} -> ${B_HELPER}`) && l.includes("[proven]"))).toBe(
      true,
    )
  })

  it("relations IN: `atlas relations src/util.ts in` finds the SAME edge as an inbound proven dependent", () => {
    const r = runAtlas(repo.repoPath, ["relations", B_UTIL, "in"])
    expect(r.exitCode).toBe(0)
    const lines = relationLines(r.stdout)
    expect(lines).toHaveLength(1)
    expect(lines[0]).toContain(`relation depends-on ${A} -> ${B_UTIL}`)
    expect(lines[0]).toContain("[proven]")
  })

  it("DIRECTED: `atlas relations src/util.ts out` finds NOTHING — the edge points app->util, not util->app", () => {
    const r = runAtlas(repo.repoPath, ["relations", B_UTIL, "out"])
    expect(r.exitCode).toBe(0)
    expect(relationLines(r.stdout)).toHaveLength(0)
    expect(r.stdout).toContain("0 edge(s)")
  })

  it("`atlas node <addr>` renders seal:proven and the re-runnable RelationWitness", () => {
    const node = runAtlas(repo.repoPath, ["node", utilAddr])
    expect(node.exitCode).toBe(0)
    expect(node.stdout).toContain("status: ok")
    expect(node.stdout).toContain(`relation: ${A} depends-on ${B_UTIL}`)
    expect(node.stdout).toContain("seal: proven")
    // The RelationWitness (relationKind/target/sourceScope) — NOT a PredicateWitness. `target` is the global SCIP
    // symbol under endpointB whose witnessed reference proves the edge; `sourceScope` is endpointA's verify-scope.
    expect(node.stdout).toContain("witness:")
    expect(node.stdout).toContain("    relationKind: depends-on")
    expect(node.stdout).toContain("    target: util/greet().")
    expect(node.stdout).toContain(`    sourceScope: ${SCOPE}`)
  })

  it("verify-store (fresh): BOTH proven relations re-prove against the live index (2 re-proven, 0 broken)", () => {
    const vs = runAtlas(repo.repoPath, ["verify-store"])
    expect(vs.exitCode).toBe(0)
    expect(vs.stdout).toContain("status: ok")
    expect(vs.stdout).toContain("verify-store: 2 sealed-proven fact(s) — 2 re-proven, 0 broken, 0 unverifiable")
  })

  it("DRIFT CONTRAST: dropping the app->util reference makes that proven relation read `broken`, while app->helper stays `re-proven` (A2)", () => {
    // Rewrite the live index so `src/app.ts` no longer references `util/greet().`. The `app --depends-on--> util`
    // edge no longer exists; `app --depends-on--> helper` is untouched. The durable proven relations are unchanged
    // on disk — only the index they re-prove against moved.
    writeScipIndex(repo.repoPath, INDEX_DRIFTED)
    const vs = runAtlas(repo.repoPath, ["verify-store"])
    // A `broken` row is a governance-shaped refusal (exit 2): the STORE failed to re-prove itself, not a usage error.
    expect(vs.exitCode).toBe(2)
    expect(vs.stdout).toContain("status: rejected")
    // Exactly one drifted (the vanished edge), exactly one still fresh (the surviving edge) — the contrast is real.
    expect(vs.stdout).toContain("verify-store: 2 sealed-proven fact(s) — 1 re-proven, 1 broken, 0 unverifiable")
    // The broken row is a DRIFT broken ("did NOT re-prove"), not a TAMPERED endpoint — the reference simply left.
    const brokenRow = vs.stdout.split("\n").find((l) => l.trimStart().startsWith("broken "))
    expect(brokenRow).toBeDefined()
    expect(brokenRow).toContain("did NOT re-prove")
    expect(brokenRow).not.toContain("TAMPERED")
  })

  it("DRIFT is f(index state): restoring the reference clears the drift — verify-store re-proves BOTH again", () => {
    writeScipIndex(repo.repoPath, INDEX_FRESH)
    const vs = runAtlas(repo.repoPath, ["verify-store"])
    expect(vs.exitCode).toBe(0)
    expect(vs.stdout).toContain("verify-store: 2 sealed-proven fact(s) — 2 re-proven, 0 broken, 0 unverifiable")
  })
})
