// @atlas/adapter-io — test/wire-scip-guard.test.ts   (SCIP-GUARD #2 — COMPOSE-B robustness gap)
//
// `assembleHandler` (wire.ts) used to call `readScip(config.scipPath)` UNCONDITIONALLY, so a fresh repo
// with no `.atlas/index.scip` dump yet made the runtime THROW at assembly (readScip → readFileSync → ENOENT).
// The fix routes the optional dump through the ONE shared missing-file guard `readScipOrEmpty` (scip.ts),
// exactly like compose.ts already does for the Axes build: a MISSING `.scip` DEGRADES to the empty
// projection `{ documents: [] }` (a files-only structural view), never a throw.
//
// These cases pin the degrade path (missing dump ⇒ no throw, query still resolves over the files-only
// index), the no-regression control (a present dump still decodes + assembles), and the teeth: the exact
// mutant — reverting the guard to an unconditional `readScip(missingPath)` — throws on the same input.

import { describe, it, expect } from "vitest"
import { join } from "node:path"
import { existsSync } from "node:fs"
import type { Pack } from "@atlas/contracts"
import type { ReconcileApi, GroundedFact } from "@atlas/knowledge"
import type { TruthGate, T0Heuristic, Tool } from "@atlas/tools"
import { GOVERNANCE_SURFACE } from "@atlas/tools"
import { assembleHandler } from "../src/wire.js"
import type { WireConfig, WireSeams } from "../src/wire.js"
import { readScip } from "../src/scip.js"
import { makeFixRepo } from "./harness/fix-repo.js"
import { makeFixScip } from "./harness/fix-scip.js"

// ── stubbed seams (no adapter backs these at the WIRE slice; behaviour is out of scope) ──────────────
const seams: WireSeams = {
  heuristic: { isCandidate: () => false } satisfies T0Heuristic,
  gate: { gateHolds: () => "NA" } satisfies TruthGate,
  classifier: {
    reconcile: () => ({ mechanical: [], semantic: [], reauthorCount: 0, exitCode: 0 }),
  } satisfies ReconcileApi,
  driftFacts: [] as readonly GroundedFact[],
  resolveAnchorAt: () => undefined,
}

const QUERY = "atlas-query" as Tool

/** A leg is WIRED iff `handle(tool)` does NOT fail closed with the frozen "not wired at this seam" reason. */
const legWired = (rejected: string | undefined): boolean => !(rejected ?? "").includes("not wired at this seam")

describe("SCIP-GUARD (#2) — assembleHandler degrades on a MISSING .scip (fresh repo)", () => {
  it("SCN-SCIP-GUARD-1 — a non-existent scipPath ⇒ NO throw; query resolves over the files-only index", () => {
    const repo = makeFixRepo()
    // a fresh repo has no `.atlas/index.scip` dump yet — the path does NOT exist.
    const missingScip = join(repo.repoPath, ".atlas", "index.scip")
    expect(existsSync(missingScip)).toBe(false)

    const cfg: WireConfig = {
      repoPath: repo.repoPath,
      casPath: `${repo.repoPath}/.atlas-cas`,
      scipPath: missingScip,
      seams,
    }
    try {
      // the load-bearing assertion: assembly does NOT throw on the missing dump (it used to).
      const handler = assembleHandler(cfg)

      // every governance leg is still wired (assembly completed over the empty files-only index).
      for (const tool of GOVERNANCE_SURFACE) {
        expect(legWired(handler.handle(tool, {}).rejected)).toBe(true)
      }

      // and the query leg actually RESOLVES a real scope over the files-only index (no scip needed): the
      // `src` territory (a top-level dir the FileTree yields) covers, returning a bounded pack — proof the
      // empty-SCIP degrade is a working index, not a dead stub. (Seam-3: `data` is now the `{pack, subsumes}`
      // observability envelope — the pack rides under `.pack`.)
      const v = handler.handle(QUERY, { scope: "src" })
      expect(v.ok).toBe(true)
      expect((v.data as { pack: Pack }).pack.territory).toBe("src")
    } finally {
      repo.cleanup()
    }
  })

  it("SCN-SCIP-GUARD-2 — CONTROL: a PRESENT .scip still decodes + assembles (no regression)", () => {
    const repo = makeFixRepo()
    const scip = makeFixScip()
    expect(existsSync(scip.scipPath)).toBe(true)

    const cfg: WireConfig = {
      repoPath: repo.repoPath,
      casPath: `${repo.repoPath}/.atlas-cas`,
      scipPath: scip.scipPath,
      seams,
    }
    try {
      const handler = assembleHandler(cfg)
      for (const tool of GOVERNANCE_SURFACE) {
        expect(legWired(handler.handle(tool, {}).rejected)).toBe(true)
      }
      const v = handler.handle(QUERY, { scope: "src" })
      expect(v.ok).toBe(true)
      expect((v.data as { pack: Pack }).pack.territory).toBe("src")
    } finally {
      scip.cleanup()
      repo.cleanup()
    }
  })

  it("TEETH — MUTANT[unconditional-readScip]: the raw unguarded read of the missing dump THROWS", () => {
    const repo = makeFixRepo()
    const missingScip = join(repo.repoPath, ".atlas", "index.scip")
    try {
      // reverting wire.ts:85 to the pre-fix `const scipOutput = readScip(config.scipPath)` reintroduces
      // exactly this call on a fresh repo — readScip → readFileSync(ENOENT) throws, and (no try/catch at
      // assembly) `assembleHandler` propagates it. The guard (`readScipOrEmpty`) is what turns this RED into
      // the empty-projection GREEN asserted above.
      expect(() => readScip(missingScip)).toThrow()
    } finally {
      repo.cleanup()
    }
  })
})
