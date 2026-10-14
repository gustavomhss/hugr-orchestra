// @atlas/adapter-io — test/reverify-gate-compose.test.ts  (REVERIFY-GATE — end to end over the REAL composed
// runtime, all three buckets FIRING in one pass)
//
// `packages/genesis/src/verify-fact.test.ts` + `verify-fact-source.test.ts` pin the oracle in isolation;
// `reverify-store.test.ts` pins the pure fold in isolation. This file is the seam between them: a REAL
// `composeRuntime(repoPath).reverify()` over a REAL durable CAS + a REAL SCIP index, with three CAS rows
// seeded directly (the WP's own suggested method — "craft the store row so the witness names a target that
// no longer has a witness in scope" — rather than through `mine`/`promote`, because the `unverifiable` arm
// is UNREACHABLE from the shipped mint path by construction, #195 cold review) so all three buckets are
// OBSERVED FIRING together, not asserted in isolation.
//
// The fixture is the SHARED `fix-repo`/`fix-scip` oracle (campaign-9.1): `util/greet().` is DEFINED in
// `src/util.ts` and REFERENCED (called) from `src/app.ts` — a real witnessed caller under `src`.
// `util/missingHelper().` is referenced from `src/app.ts` but defined NOWHERE — an UNRESOLVABLE target, so a
// witness naming it can never re-prove (the oracle ABSTAINs `target-unresolvable`), which is what stands in
// for "the fact used to hold and no longer does" without a second index build.

import { describe, it, expect } from "vitest"
import { mkdirSync, writeFileSync, copyFileSync } from "node:fs"
import { join } from "node:path"
import { asHash, asNodeKey } from "@atlas/kernel"
import type { GroundedFact } from "@atlas/knowledge"
import { claimNormFromWitness } from "@atlas/genesis"
import { composeRuntime } from "../src/compose.js"
import { createDiskStore } from "../src/store.js"
import { makeFixRepo } from "./harness/fix-repo.js"
import { makeFixScip, SYM_GREET, SYM_MISSING } from "./harness/fix-scip.js"

const POLICY_JSON = JSON.stringify({
  nearDup: { claimNormThreshold: 1 },
  t0Heuristic: { keywords: [] },
  authz: { scopes: {} },
})

function makeIndexedRepo() {
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

/** A minimal `AdvisoryNode` — only the fields the reverify pass reads are load-bearing. */
function sealedAdvisory(id: string, extra: Partial<GroundedFact>): GroundedFact {
  return {
    kind: "advisory",
    id: asNodeKey(id),
    tier: "T2",
    claimNorm: `x-${id}`,
    grounding: { entries: [] },
    freshness: "FRESH",
    claims: [],
    authoring: "ADVISORY",
    seal: "proven",
    ...extra,
  } as unknown as GroundedFact
}

describe("REVERIFY-GATE — composeRuntime(repoPath).reverify() over the REAL durable store + REAL oracle", () => {
  it("an EMPTY store reports the honest all-zero (never a throw, never a silent skip)", () => {
    const { repoPath, cleanup } = makeIndexedRepo()
    try {
      const report = composeRuntime(repoPath).reverify()
      expect(report).toEqual({ sealedProven: 0, reProven: 0, broken: 0, unverifiable: 0, dangling: 0, rows: [] })
    } finally {
      cleanup()
    }
  })

  it("THREE SEALED FACTS, THREE DIFFERENT OUTCOMES — all buckets fire in ONE pass", () => {
    const { repoPath, cleanup } = makeIndexedRepo()
    try {
      // Seed the CAS directly — reads the durable store the SAME `composeRuntime` will re-read, never a
      // second store. `store.put` returns the REAL content-addressed hash (re-verified on every `get`).
      const store = createDiskStore(join(repoPath, ".atlas", "cas"), () => asHash("seed"))
      const reProvenWitness = { slot: "dependency" as const, target: SYM_GREET, scope: "src" }
      const brokenWitness = { slot: "dependency" as const, target: SYM_MISSING, scope: "src" }
      const reProven = sealedAdvisory("nk-re-proven", {
        witness: reProvenWitness,
        claimNorm: claimNormFromWitness(reProvenWitness),
      })
      // `broken`'s claimNorm/tier/anchor STILL bind (only its WITNESS fails to replay) — the reason this
      // test wants is the DRIFT reason ("did NOT re-prove", oracle abstains `target-unresolvable`), never
      // the TAMPER reason a mismatched binding would produce first (#199 fix-round: tamper checks run
      // BEFORE the oracle replay, so a fixture that fails a binding never reaches the oracle at all).
      const broken = sealedAdvisory("nk-broken", {
        witness: brokenWitness,
        claimNorm: claimNormFromWitness(brokenWitness),
      })
      const unverifiable = sealedAdvisory("nk-unverifiable", {})
      const rows = [reProven, broken, unverifiable].map((fact) => ({ fact, hash: store.put(fact as unknown as never) }))
      // `primaryAnchor` is what the anchor-binding check (#199 fix-round finding 1b) reads — every seeded
      // row lives under `src`, matching the witnesses' own scope, so the outcome is decided by what this
      // test is actually about (re-proven/broken/unverifiable), not by an anchor mismatch it never meant
      // to exercise. NOTE: the Map KEY must equal the row's own `nodeKey` (KNOW-4g well-formedness); this
      // fixture keeps `nodeKey === fact.id` (unlike the disjoint-hash fixtures elsewhere) because nothing
      // here tests the anchor-vs-nodeKey join — `reverify()` reads `ReverifyRow.nodeKey` (== `fact.id`) by
      // DESIGN, never `CurrentNode.nodeKey`.
      store.persistProjection({
        current: new Map(
          rows.map(({ fact, hash }) => [
            String(fact.id),
            {
              nodeKey: String(fact.id),
              family: "advisory",
              contentHash: String(hash),
              claims: [],
              seal: "proven",
              primaryAnchor: "src/app.ts",
            },
          ]),
        ),
        cas: new Set(rows.map(({ hash }) => String(hash))),
      })

      // TEETH — reading the durable STORE, never a command's own summary: re-derive the projection from a
      // FRESH `composeRuntime` (a new process would do exactly this) rather than reusing the store handle.
      const report = composeRuntime(repoPath).reverify()

      expect(report.sealedProven).toBe(3)
      expect(report.reProven).toBe(1)
      expect(report.broken).toBe(1)
      expect(report.unverifiable).toBe(1)
      const byKey = Object.fromEntries(report.rows.map((r) => [r.nodeKey, r]))
      expect(byKey["nk-re-proven"]?.outcome).toBe("re-proven")
      expect(byKey["nk-broken"]?.outcome).toBe("broken")
      expect(byKey["nk-broken"]?.reason).toContain("target-unresolvable")
      expect(byKey["nk-unverifiable"]?.outcome).toBe("unverifiable")
    } finally {
      cleanup()
    }
  })
})
