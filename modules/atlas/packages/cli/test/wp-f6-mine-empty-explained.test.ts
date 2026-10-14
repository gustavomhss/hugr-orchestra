// @atlas/cli — test/wp-f6-mine-empty-explained.test.ts  (WP-F6: an empty mine pass explains ITSELF)
//
// Split out of wp-9.3.6-b-mine.test.ts (which owns the CLI-4a/b/c goldens and the ADR-0008 staging
// destination) when this concern grew its own shape. Shared seams live in ./mine-fixtures.ts, imported
// rather than duplicated so the two suites cannot drift into testing different products.

import { describe, it, expect } from "vitest"
import type { SiteProposer, EmitGate } from "@atlas/genesis"
import { runMine, mineOutcome, mineWhyEmpty } from "../src/mine.js"
import type { MineDeps } from "../src/mine.js"
import {
  skeletonSource,
  injectedHistory,
  fakeStore,
  budget,
  depsOf,
  recordingProposer,
  FRONTIER,
  A,
  REPO,
  NO_MODEL_ENV,
} from "./mine-fixtures.js"

// ── WP-F6 — an empty mine render EXPLAINS ITSELF, and the explanation is COMPUTED, not asserted ──────────
// FINDING (original): `atlas mine` writes 0 grounded candidates. FIX (original): make the 0 legible.
// FINDING (this suite): the legibility line was a CONSTANT that blamed the absent proposer model — literally
// true (there is no model wired) but NOT the operative cause. The run never reached the extractor at all:
// `structuralSeeds` ranks by dep-graph degree over `axes.edges`, so a skeleton with no edges yields 0 ranked
// sites and the proposer is never consulted. The constant told a user the product was ONE wire from working.
// The cause is now DERIVED from the run's own report (`mineOutcome` → `mineWhyEmpty`), which is what keeps it
// true in BOTH worlds: an empty frontier (0 sites visited) and a seeded frontier with no proposer.
//
// NOTE on `REPO`: the default S0 seam is now the REAL structural source (`createSkeletonSource`), not a
// hand-built empty one. `REPO = 'fix-repo'` does not exist, so that real source degrades fail-closed to an
// empty tracked set and the empty-frontier state below is still reached — but it is now reached by the
// product's own totality guard rather than by a stub. That is a stronger premise, not a weaker one.
describe("WP-F6 — the empty-pass explanation is computed from the run report, and names the REAL cause", () => {
  /** A seeded frontier with NO proposer injected — the ONLY state in which "no model is wired" is the cause. */
  const seededNoProposer: Partial<MineDeps> = {
    rev: "HEAD",
    env: NO_MODEL_ENV, // HERMETIC: "no model is wired" must be a fact about the run, not about this machine
    skeleton: skeletonSource, //  a real skeleton ⇒ `structuralSeeds`/`rank` DO seed sites
    history: injectedHistory,
    store: fakeStore(),
    budget: budget(FRONTIER.length),
  }

  it("EMPTY FRONTIER — the 0 is blamed on the structural pass, NOT on the absent model", async () => {
    const v = await runMine(REPO, { env: NO_MODEL_ENV }) // 0 ranked sites ⇒ 0 sites visited
    expect(v.exitCode).toBe(0) //             an empty pass is honest, not an error
    expect(v.stdout).toContain("seeded 0") // still 0 candidates (no fabricated fact)
    expect(v.stdout).toContain("0 sites visited") //           the observed fact, read off budgetSpent
    expect(v.stdout).toContain("skeleton → ranked frontier") // WHERE the run actually stopped
    expect(v.stdout).toContain("no proposer was ever consulted")
    // TEETH — the honesty fix itself: with the model never reached, the render must NOT claim the missing
    // model is the cause, and must NOT imply the product is a single wire away from working.
    expect(v.stdout).not.toContain("no proposer model is wired")
    expect(v.stdout).toContain("wiring a model would not change this 0")
  })

  it("SEEDED FRONTIER, NO MODEL — the very same code now names the absent proposer, with the site count", async () => {
    const v = await runMine(REPO, seededNoProposer)
    expect(v.exitCode).toBe(0)
    expect(v.stdout).toContain("seeded 0")
    expect(v.stdout).toContain(`${FRONTIER.length} site(s) visited and every one abstained`)
    expect(v.stdout).toContain("no proposer model is wired") // NOW this is the operative cause
    expect(v.stdout).toContain("never fabricated") //          the honesty invariant, where it applies
    expect(v.stdout).not.toContain("0 sites visited") //       and the structural cause is NOT reused
  })

  it("SEEDED FRONTIER, MODEL WIRED, NOTHING ADMITTED — abstention is reported without blaming the model", async () => {
    const refusing: EmitGate = { emit: (_s, c) => ({ emitted: false, whyNot: { site: c.site, reason: "refused" } }) }
    const v = await runMine(REPO, depsOf({ gate: refusing, budget: budget(FRONTIER.length) }))
    expect(v.stdout).toContain(`${FRONTIER.length} site(s) visited and every one abstained`)
    expect(v.stdout).toContain("nothing was proposed or admitted")
    expect(v.stdout).not.toContain("no proposer model is wired") // a model WAS wired — that claim would lie
  })

  it("a pass that DOES seed facts renders no explanation at all (there is nothing to explain)", async () => {
    const v = await runMine(REPO, depsOf({ budget: budget(FRONTIER.length) })) // recordingProposer wired
    expect(v.stdout).not.toContain("mine: 0 candidate facts")
  })

  it("a partial pass says so — an interrupted 0 is not a finished result", async () => {
    const boom: SiteProposer = {
      propose: () => {
        throw new Error("interrupted")
      },
    }
    const v = await runMine(REPO, depsOf({ proposer: boom, budget: budget(FRONTIER.length) }))
    expect(v.exitCode).toBe(1)
    expect(v.stdout).toContain("did not run to completion")
    expect(v.stdout).toContain("partial: resume at rank")
  })

  it("MUTANT — a HARD-CODED cause line (the old constant) is wrong in one of the two states", () => {
    // The defect this suite exists to prevent: ONE fixed sentence cannot describe both runs. Feed the two
    // observed outcomes to the real explainer; a constant explanation returns the same bytes for both.
    const emptyFrontier = mineOutcome({ seeded: [], ratified: [], open: [], llmCalls: 0, budgetSpent: 0 }, false)
    const seededSites = mineOutcome({ seeded: [], ratified: [], open: [], llmCalls: 4, budgetSpent: 4 }, false)
    const real = [mineWhyEmpty(emptyFrontier), mineWhyEmpty(seededSites)]
    expect(real[0]).not.toBe(real[1]) //                the real explainer DISTINGUISHES the two states
    expect(real[0]).not.toContain("no proposer model") // and it does not blame the model at 0 sites visited
    expect(real[1]).toContain("no proposer model is wired")
  })

  it("MUTANT — a silent 0-candidate render (drops the explanation) leaves the empty pass unexplained", async () => {
    const v = await runMine(REPO, { env: NO_MODEL_ENV }) // the real driver: legible
    const silent = v.stdout
      .split("\n")
      .filter((l) => !l.startsWith("mine: 0 candidate facts"))
      .join("\n")
    expect(v.stdout).toContain("mine: 0 candidate facts") //  the real driver EXPLAINS the 0
    expect(silent).not.toContain("mine: 0 candidate facts") // the mutant hides WHY — the guard flips RED
    expect(silent).toContain("seeded 0") //                   yet still reports 0: a silent, mysterious empty
  })
})
