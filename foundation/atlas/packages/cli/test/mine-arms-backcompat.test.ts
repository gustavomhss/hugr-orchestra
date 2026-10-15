// @atlas/cli — test/mine-arms-backcompat.test.ts  (SOUND-DEFAULT-MINE AC-B6 — the frozen single-pass contract is intact)
//
// The FROZEN genesis run-controller stays a single per-arm pass: `runMine(repo, {slot:'advisory'})` runs ONE
// advisory pass byte-identical to today's default `runMine(repo)`. The `slot` deps leg is a pure THREAD to
// `resolveProposer` — with no slot it is byte-identical, so the frozen contract cannot be broken by the new
// override existing.
//
// HONEST SCOPE (lucy cold-review): both sides here INJECT a proposer, and an injected proposer BYPASSES
// `resolveProposer` entirely (mine.ts `withDefaults`), so `slot` is inert BY CONSTRUCTION on this path — this
// test proves the injected-proposer path is slot-agnostic, NOT that the resolveProposer slot-override renders
// identically. The genuine byte-identity of the WIRED (real-model) path is pinned by the blackbox stories
// (s14/s24/s25/s26), which use a real ATLAS_MODEL_CONFIG (no injected proposer) under ATLAS_MINE_SLOT=advisory
// and keep every internal assertion (llmCalls, prompt-digest, exact site lists) unchanged.

import { describe, it, expect } from "vitest"
import { runMine } from "../src/mine.js"
import { recordingProposer, gateEmitAll, injectedHistory, skeletonSource, fakeStore } from "./mine-fixtures.js"
import type { MineDeps } from "../src/mine.js"

const seams = (): Partial<MineDeps> => ({
  proposer: recordingProposer().proposer,
  gate: gateEmitAll(),
  history: injectedHistory,
  skeleton: skeletonSource,
  store: fakeStore(),
})

describe("AC-B6 — runMine with an explicit slot is byte-identical to today", () => {
  it("runMine(repo, {slot:advisory}) === runMine(repo) (no slot) — the single-pass contract is preserved", async () => {
    const deps = seams()
    const withSlot = await runMine("fix-repo", { ...deps, slot: "advisory" })
    const noSlot = await runMine("fix-repo", deps)
    expect(withSlot.stdout).toBe(noSlot.stdout)
    expect(withSlot.exitCode).toBe(noSlot.exitCode)
  })
})
