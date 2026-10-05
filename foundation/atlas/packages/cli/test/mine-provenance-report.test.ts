// @atlas/cli — test/mine-provenance-report.test.ts  (#210/#209: the two frozen `ControllerDeps` ports, WIRED)
//
// `run-controller.ts` grew two OPTIONAL ports — `modelIdentity` (#210) and `answerReceipts` (#209) — that
// populate `GenesisReport.modelIdentity` / `.answersStored` / `.answersDigest`. Both landed with a passing
// suite and NEITHER production caller supplied them: `mine.ts` built `ControllerDeps` without either, so a
// real `atlas mine` pass left both fields dormant (a reference-model-vs-shipped-path violation — the port
// existed and was tested in isolation, but unreachable from the one place that runs against a real repo).
//
// This suite drives the SAME composition root (`driveMinePass`) production uses, over a WIRED and an
// UNWIRED proposer, and asserts the ports are actually REACHED — not merely present on the type.

import { describe, it, expect } from "vitest"
import type { EmitGate, Fact, SeedProposal, SiteProposer } from "@atlas/genesis"
import { NO_MODEL_IDENTITY } from "../src/mine-proposer.js"
import { driveMinePass } from "../src/mine.js"
import { skeletonSource, injectedHistory, factFor, idOf, stagingFake } from "./mine-fixtures.js"

// A gate that mirrors `mine-gate.ts`'s own #195(b) transport: an admitted seed's `rawAnswer`, if present,
// rides through onto the fact UNCHANGED — the exact seam `mine-decide.ts` scrubs-then-CAS's.
const gateEmitAllWithAnswer = (): EmitGate => ({
  emit: (seed, c) => ({
    emitted: true,
    fact: (seed.rawAnswer !== undefined
      ? { ...factFor(c, seed.claim), rawAnswer: seed.rawAnswer }
      : factFor(c, seed.claim)) as unknown as Fact,
  }),
})

// A WIRED proposer: every site proposes a claim AND the raw answer bytes it was "produced" from.
const wiredProposer = (): SiteProposer => ({
  propose: (c): SeedProposal => ({ cand: c, claim: `answer for ${idOf(c)}`, rawAnswer: `raw answer for ${idOf(c)}` }),
})

// The honest fail-closed default: no model, so every site abstains (mirrors `mine-proposer.ts defaultProposer`).
const unwiredProposer = (): SiteProposer => ({ propose: () => null })

const REPO = "fix-repo"

describe("#210 — a real pass STAMPS the wired model identity on the report", () => {
  it("a WIRED proposer + a supplied modelIdentity lands on GenesisReport.modelIdentity, never the sentinel", () => {
    const pass = driveMinePass(REPO, {
      skeleton: skeletonSource,
      history: injectedHistory,
      proposer: wiredProposer(),
      gate: gateEmitAllWithAnswer(),
      store: stagingFake().store,
      modelIdentity: "test-model --flag @ 1.0.0",
    })
    expect(pass.report.modelIdentity).toBe("test-model --flag @ 1.0.0")
  })

  it("an UNWIRED pass (no model, no override) carries the honest NO_MODEL_IDENTITY sentinel — never undefined", () => {
    const pass = driveMinePass(REPO, {
      skeleton: skeletonSource,
      history: injectedHistory,
      proposer: unwiredProposer(),
      gate: gateEmitAllWithAnswer(),
      store: stagingFake().store,
    })
    expect(pass.report.modelIdentity).toBe(NO_MODEL_IDENTITY)
  })
})

describe("#209 — a real pass FOLDS the admitted answer receipts into the report witness", () => {
  it("every admitted fact that carried a rawAnswer is counted in answersStored, and answersDigest is set", () => {
    const pass = driveMinePass(REPO, {
      skeleton: skeletonSource,
      history: injectedHistory,
      proposer: wiredProposer(),
      gate: gateEmitAllWithAnswer(),
      store: stagingFake().store,
      modelIdentity: "test-model @ 1.0.0",
    })
    // teeth (breaks-on "answerReceipts is not wired into ControllerDeps"): with the port unreached the
    // controller's own fallback (`deps.answerReceipts?.()` — absent) folds to `answersStored: 0` regardless
    // of how many facts actually minted a receipt, which is exactly the dormant state this WP closes.
    expect(pass.report.seeded.length).toBeGreaterThan(0)
    expect(pass.report.answersStored).toBe(pass.report.seeded.length)
    expect(pass.report.answersDigest?.length ?? 0).toBeGreaterThan(0)
  })

  it("an UNWIRED pass admits nothing (no rawAnswer ever produced), so answersStored is honestly 0", () => {
    const pass = driveMinePass(REPO, {
      skeleton: skeletonSource,
      history: injectedHistory,
      proposer: unwiredProposer(),
      gate: gateEmitAllWithAnswer(),
      store: stagingFake().store,
    })
    expect(pass.report.seeded.length).toBe(0)
    expect(pass.report.answersStored).toBe(0)
  })

  it("a fact admitted WITHOUT a rawAnswer (human/non-mine shape) contributes nothing to the count", () => {
    // The gate here still emits (so `seeded` is non-empty) but the proposer never supplies `rawAnswer`, so
    // no receipt is ever minted — fail-closed: absence of the transport field must never be counted.
    const noAnswerProposer: SiteProposer = {
      propose: (c): SeedProposal => ({ cand: c, claim: `claim for ${idOf(c)}` }),
    }
    const pass = driveMinePass(REPO, {
      skeleton: skeletonSource,
      history: injectedHistory,
      proposer: noAnswerProposer,
      gate: gateEmitAllWithAnswer(),
      store: stagingFake().store,
    })
    expect(pass.report.seeded.length).toBeGreaterThan(0)
    expect(pass.report.answersStored).toBe(0)
  })
})
