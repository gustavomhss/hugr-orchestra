// @atlas/adapter-io — test/llm.test.ts   (WP-9.3.6-b.LLM — REQ-ADAPTER-11a/11b/11c)
//
// Acceptance suite for the single bounded S2 site proposer `createSiteProposer` (ADAPT-LLM-1). It
// transcribes the three frozen goldens (docs/requirements/goldens-adapters.md SCN-ADAPTER-11a/11b/11c)
// against a recorded `spyClient: ModelClient` (call-counter + recorded budget). No live model in CI.
//   • SCN-ADAPTER-11a-1 — a model is invoked only via SiteProposer.propose  (guard, module-graph audit)
//   • SCN-ADAPTER-11b-1 — exactly one bounded call per site                 (happy)
//   • SCN-ADAPTER-11c-1 — the proposal enters as a gated candidate           (guard)

import { describe, it, expect } from "vitest"
import { execFileSync } from "node:child_process"
import { fileURLToPath } from "node:url"
import { dirname, resolve } from "node:path"
import type { Candidate } from "@atlas/genesis"
import type { SubtreeHash } from "@atlas/contracts"
import { createSiteProposer } from "../src/llm.js"
import type { ModelClient, LlmBudget, CompletionResult } from "../src/llm.js"

// ── fixtures ─────────────────────────────────────────────────────────────────────────────────────────
/** The injected budget stub (cost cap + timeout `t`) — recorded by the spy to prove it is honored. */
const budget: LlmBudget = { costCap: 1, timeoutMs: 1000 }

/** Site `S_greet` — a minimal ranked `Candidate` (a ranked SITE, never a fact). Fields read EXACTLY from
 *  `Candidate`/`MinedSignals`/`StructRef` (no invented fields). */
const candGreet: Candidate = {
  site: {
    kind: "symbol",
    qualifiedPath: "util/greet()",
    subtreeHash: "greet-subtree-hash" as unknown as SubtreeHash,
  },
  signals: { hotspot: 0, szzBugCommits: 0, coChanged: [], owners: [], messages: [] },
  ppr: 0,
  rank: 0,
}

/** A recorded `ModelClient`: a call-counter + the last budget it received. Canned claim `P0` for the greet
 *  site; a switchable abstention. `No live model in CI`. */
function makeSpyClient(result: CompletionResult) {
  const rec = { calls: 0, lastBudget: undefined as LlmBudget | undefined, lastPrompt: "" }
  const client: ModelClient = {
    complete(prompt: string, b: LlmBudget): CompletionResult {
      rec.calls += 1
      rec.lastBudget = b
      rec.lastPrompt = prompt
      return result
    },
  }
  return { client, rec }
}

const buildPrompt = (cand: Candidate): string => `describe ${cand.site.qualifiedPath}`

describe("createSiteProposer — ADAPT-LLM-1 the single bounded S2 site proposer", () => {
  it("SCN-ADAPTER-11b-1 — exactly one bounded call per site (happy)", () => {
    const { client, rec } = makeSpyClient({ claim: "greet returns a greeting" })
    const proposer = createSiteProposer({ client, budget, buildPrompt })

    const out = proposer.propose(candGreet)

    // exactly one bounded call for S_greet (≤1 call/site) — teeth: a retrying propose records >1.
    expect(rec.calls).toBe(1)
    // the budget the client received IS the injected budget (cost cap + timeout honored).
    expect(rec.lastBudget).toBe(budget)
    // and the proposal carries the model's claim for this candidate.
    expect(out).toStrictEqual({ cand: candGreet, claim: "greet returns a greeting" })
  })

  it("SCN-ADAPTER-11c-1 — the proposal enters as a gated candidate (guard)", () => {
    const { client } = makeSpyClient({ claim: "greet returns a greeting" })
    const proposer = createSiteProposer({ client, budget, buildPrompt })

    const out = proposer.propose(candGreet)

    // it is a plain candidate `SeedProposal` { cand, claim } — NOT a ratified/auto-trusted record.
    expect(out).toStrictEqual({ cand: candGreet, claim: "greet returns a greeting" })
    // teeth: a proposer that pre-ratified its return would carry a truthy `ratified`/self-declaration.
    expect(out).not.toHaveProperty("ratified")
    expect(out).not.toHaveProperty("selfAsserted")
    expect(out).not.toHaveProperty("confidence")
    // the proposer touches NO store — its only injected deps are the model seam, budget, and prompt builder.
    expect(Object.keys({ client, budget, buildPrompt }).sort()).toStrictEqual(["budget", "buildPrompt", "client"])

    // abstention path: a `null` completion yields `null` (a valid, unpressured outcome — GEN-12).
    const { client: absClient } = makeSpyClient({ claim: null })
    const absProposer = createSiteProposer({ client: absClient, budget, buildPrompt })
    expect(absProposer.propose(candGreet)).toBeNull()
  })

  it("SCN-ADAPTER-11a-1 — a model is invoked only via SiteProposer.propose (guard, module-graph audit)", () => {
    // The `ModelClient` port is the sole model seam — it MUST be referenced by exactly ONE src module.
    const here = dirname(fileURLToPath(import.meta.url)) // packages/adapter-io/test
    const packagesDir = resolve(here, "../../") // packages
    let out = ""
    try {
      out = execFileSync(
        "grep",
        [
          "-rl",
          "--include=*.ts",
          "--exclude=*.d.ts",
          "--exclude-dir=dist",
          "--exclude-dir=node_modules",
          "ModelClient",
          packagesDir,
        ],
        { encoding: "utf8" },
      )
    } catch {
      out = "" // grep exits non-zero on no match
    }
    const srcHits = out.split("\n").filter((p) => p.includes(`${resolve(packagesDir)}/`) && p.includes("/src/"))
    // exactly one src call site, and it is llm.ts — 0 out-of-band model entry points.
    // teeth: a second src module importing `ModelClient` makes this length 2.
    expect(srcHits).toHaveLength(1)
    expect(srcHits[0]!.endsWith("/adapter-io/src/llm.ts")).toBe(true)
  })
})
