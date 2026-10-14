// @atlas/adapter-io — test/relation-derive-reachability.test.ts  (#99 WP-R7 / AR-13 — REACHABILITY)
//
// AR-13: the sound-relation MECHANICAL PROJECTION runs through a REAL SHIPPED ENTRYPOINT — not the test
// injector — and lands proven `depends-on` relations in the durable store, readable back. The "test injector"
// is the hand-wired `admit`/`groundFor`/`verifyRelation` seams the R3 unit test (`relation-derive.test.ts`)
// drives over a synthetic `ScipOutput`; THIS test drives none of them. It stands up the FULL composed runtime
// (`composeRuntime(repoPath)` — the exact object `bin.ts` builds and the `atlas derive-relations` verb drives)
// over a REAL git repo + a REAL `.atlas/index.scip`, calls the shipped `deriveRelations` leg, and then re-reads
// the durable store through a FRESH `composeRuntime` (a new process would do exactly that) to prove the proven
// relation SETTLED and reads back sealed `proven`.
//
// The fixture is the SHARED `fix-repo`/`fix-scip` oracle (campaign-9.1): `util/greet().` is DEFINED in
// `src/util.ts` and REFERENCED from `src/app.ts` — one real witnessed cross-unit reference. So the projection
// must resolve exactly ONE distinct intra-repo edge and prove it: `src/app.ts --depends-on--> src/util.ts`.

import { describe, it, expect, afterEach } from "vitest"
import { mkdirSync, writeFileSync, copyFileSync } from "node:fs"
import { join } from "node:path"
import { relationKey } from "@atlas/knowledge"
import { composeRuntime } from "../src/compose.js"
import { makeFixRepo } from "./harness/fix-repo.js"
import { makeFixScip } from "./harness/fix-scip.js"

// The subject/object files of the one witnessed cross-unit edge in the fixture, and the derived relation's
// governed scope (`unitScopeOf('src/app.ts') === 'src'`). The actor must own that scope for the write to land.
const A = "src/app.ts"
const B = "src/util.ts"
const SCOPE = "src"
const ACTOR = "bob"

// Grant the actor the subject-endpoint's scope so the governed emit door AUTHORIZES the durable write. Without
// it every proven relation is correctly REFUSED `unauthorized` (which the "authz gates the write" case pins).
const POLICY_JSON = JSON.stringify({
  nearDup: { claimNormThreshold: 1 },
  t0Heuristic: { keywords: [] },
  authz: { scopes: { [SCOPE]: [ACTOR] } },
})

function makeIndexedRepo(): { repoPath: string; cleanup: () => void } {
  const repo = makeFixRepo()
  const scip = makeFixScip()
  const atlasDir = join(repo.repoPath, ".atlas")
  mkdirSync(atlasDir, { recursive: true })
  writeFileSync(join(atlasDir, "policy.json"), POLICY_JSON)
  copyFileSync(scip.scipPath, join(atlasDir, "index.scip"))
  return {
    repoPath: repo.repoPath,
    cleanup: () => {
      scip.cleanup()
      repo.cleanup()
    },
  }
}

/** Run one block with the write actor + ratifier the promoted proven relation needs, restoring env after. A
 *  promoted write (`origin:'promoted'`) faces the ratifier by construction, so BOTH env vars are set. */
function withActor<T>(fn: () => T): T {
  const savedActor = process.env.ATLAS_ACTOR
  const savedToken = process.env.ATLAS_RATIFY_TOKEN
  process.env.ATLAS_ACTOR = ACTOR
  process.env.ATLAS_RATIFY_TOKEN = ACTOR
  try {
    return fn()
  } finally {
    if (savedActor === undefined) delete process.env.ATLAS_ACTOR
    else process.env.ATLAS_ACTOR = savedActor
    if (savedToken === undefined) delete process.env.ATLAS_RATIFY_TOKEN
    else process.env.ATLAS_RATIFY_TOKEN = savedToken
  }
}

let cleanups: Array<() => void> = []
afterEach(() => {
  for (const c of cleanups) c()
  cleanups = []
})

describe("AR-13 — the shipped derive-relations leg PROVES + PERSISTS + reads back a proven relation", () => {
  it("composeRuntime(repo).deriveRelations() lands src/app.ts --depends-on--> src/util.ts, sealed proven", () => {
    const { repoPath, cleanup } = makeIndexedRepo()
    cleanups.push(cleanup)

    // DRIVE THE SHIPPED LEG — the real composed runtime, not the R3 fixture seams. It composes buildMineAdmission
    // (now carrying the sound verifyRelation oracle) + ground-over-axes + the governed emit door internally.
    const run = withActor(() => composeRuntime(repoPath).deriveRelations())

    // The projection resolved exactly one distinct intra-repo edge, proved it, and the governed door LANDED it.
    expect(run.resolvedEdgeCount).toBe(1)
    expect(run.proven).toBe(1)
    expect(run.persisted).toBe(1)
    expect(run.refused).toBe(0)
    expect(run.overBudget).toBeUndefined()
    const row = run.rows[0]!
    expect(row.endpointA).toBe(A)
    expect(row.endpointB).toBe(B)
    expect(row.persisted).toBe(true)
    expect(row.key).toBe(String(relationKey(A, "depends-on", B)))
    expect(row.id).toBeDefined() // the CAS id of the durable proven relation

    // TEETH — read the durable STORE, never the command's own summary: a FRESH composeRuntime re-derives the
    // projection from disk exactly as a new process would. The proven relation is stored AND readable, sealed.
    const outbound = composeRuntime(repoPath).relations(A, "out")
    const edge = outbound.find((e) => e.endpointB === B)
    expect(edge).toBeDefined()
    expect(edge?.relationKind).toBe("depends-on")
    expect(edge?.seal).toBe("proven")

    // AR-26 dual — the SAME sealed edge is queryable from the OBJECT endpoint as an inbound dependency.
    const inbound = composeRuntime(repoPath).relations(B, "in")
    expect(inbound.some((e) => e.endpointA === A && e.seal === "proven")).toBe(true)
  })

  it("the durable proven relation SURVIVES re-verification (verify-store re-proves its witness)", () => {
    const { repoPath, cleanup } = makeIndexedRepo()
    cleanups.push(cleanup)
    withActor(() => composeRuntime(repoPath).deriveRelations())

    // The reverify gate re-runs the sound oracle against the live index over the durable proven relation's own
    // recorded witness — a proven relation that persisted through the real door must re-prove, never read broken.
    const report = composeRuntime(repoPath).reverify()
    expect(report.sealedProven).toBeGreaterThanOrEqual(1)
    expect(report.reProven).toBeGreaterThanOrEqual(1)
    expect(report.broken).toBe(0)
    expect(report.unverifiable).toBe(0)
  })

  it("an UNAUTHORIZED actor: the projection still PROVES the edge, but the governed door REFUSES the write", () => {
    const { repoPath, cleanup } = makeIndexedRepo()
    cleanups.push(cleanup)

    // No ATLAS_ACTOR grant for `src` (the empty actor is in no scope) — the sound projection is unchanged (the
    // proof is index-only, model- and actor-independent), but the governed WRITE is refused, per row, not landed.
    const savedActor = process.env.ATLAS_ACTOR
    const savedToken = process.env.ATLAS_RATIFY_TOKEN
    delete process.env.ATLAS_ACTOR
    delete process.env.ATLAS_RATIFY_TOKEN
    try {
      const run = composeRuntime(repoPath).deriveRelations()
      expect(run.proven).toBe(1) // the edge PROVES regardless of who runs it
      expect(run.persisted).toBe(0) // but nothing lands durably without authorization
      expect(run.refused).toBe(1)
      expect(run.rows[0]?.persisted).toBe(false)
      expect(run.rows[0]?.rejected).toBeDefined()
      // Nothing readable back — the store holds no proven relation.
      expect(
        composeRuntime(repoPath)
          .relations(A, "out")
          .some((e) => e.seal === "proven"),
      ).toBe(false)
    } finally {
      if (savedActor !== undefined) process.env.ATLAS_ACTOR = savedActor
      if (savedToken !== undefined) process.env.ATLAS_RATIFY_TOKEN = savedToken
    }
  })
})
