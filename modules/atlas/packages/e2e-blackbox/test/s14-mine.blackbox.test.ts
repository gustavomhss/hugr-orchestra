// @atlas/e2e-blackbox — test/s14-mine.blackbox.test.ts  (S14 — `atlas mine` explains its 0, WAVE-COV-5)
//
// NARRATIVE: `atlas mine` drives the FROZEN genesis run-controller one governed pass, candidate-only
// (mine.ts). Through the real `atlas mine <repo>` subprocess door NO seam can be injected from argv, so
// every injectable seam falls back to its honest fail-closed default — and TODAY the FIRST of those defaults
// to bite is the SKELETON: `emptySkeleton()` carries no dep edges, so `structuralSeeds`/`rank` seed 0 sites
// and the controller visits none (`budgetSpent 0`). The extractor — and therefore the proposer — is NEVER
// REACHED. That is why the rendered explanation must NOT read "no proposer model wired": literally true
// (none is), but not the operative cause, and it would tell a user the product is one wire from working.
//
// This suite therefore pins the OBSERVED-CAUSE contract on the real bytes: the render names the STRUCTURAL
// stage that produced the 0, is consistent with the `cost:` line right above it (0 sites visited ⟺
// `budgetSpent 0`), and does NOT blame the unreached model. The run still exits 0 (a resumeToken, not an
// empty result, is what signals a partial/error exit 1); nothing is ever fabricated to fill the empty pass.
//
// FORWARD-COMPATIBLE BY CONSTRUCTION: the product computes this line from the run's own report, so when a
// real `SkeletonSource` lands and sites ARE seeded, the SAME code switches to naming the model gate. The
// assertions below are keyed to `budgetSpent`, so they follow the ground truth instead of freezing it.

import { afterAll, describe, expect, it } from "vitest"
import { makeFixtureRepo, runAtlas } from "../src/harness.js"
import type { FixtureRepo } from "../src/harness.js"

/** The exact bytes the product emits for a COMPLETE pass that visited 0 sites (mine.ts `mineWhyEmpty`) —
 *  pinned as a LITERAL here (not imported) so this black-box test never touches in-process product source. */
const NO_SITES_LINE =
  "mine: 0 candidate facts — 0 sites visited: the structural pass (skeleton → ranked frontier) yielded no site, " +
  "so no proposer was ever consulted; wiring a model would not change this 0. Run `atlas doctor index` to see " +
  "whether this repository has the SCIP index the frontier is derived from"

/** The bytes for a pass that DID visit sites but seeded nothing — the only state in which the absent model
 *  is the operative cause. `N` is the observed site count, so this is matched, not compared byte-for-byte. */
const VISITED_ABSTAIN =
  /^mine: 0 candidate facts — (\d+) site\(s\) visited and every one abstained: no proposer model is wired, so nothing could be proposed \(facts are never fabricated\)$/

let repo: FixtureRepo

/** The one honesty law this story enforces, whatever the wiring: the rendered cause must MATCH the run's own
 *  cost line. 0 sites spent ⇒ the structural stage is named and the unreached model is NOT blamed; sites
 *  spent ⇒ the model gate is named, with the SAME count the cost line reports. */
function expectCauseMatchesCost(stdout: string): void {
  const lines = stdout.split("\n")
  const cost = lines.find((l) => l.startsWith("cost: "))
  const spent = Number(/budgetSpent (\d+)/.exec(cost ?? "")?.[1])
  expect(Number.isFinite(spent)).toBe(true)
  const cause = lines.find((l) => l.startsWith("mine: 0 candidate facts"))
  expect(cause).toBeDefined()
  if (spent === 0) {
    // byte-exact (em-dash U+2014 and the U+2192 arrow both present verbatim in the literal above).
    expect(cause).toBe(NO_SITES_LINE)
    expect(cause).not.toContain("no proposer model is wired") // the model was never consulted — do not blame it
  } else {
    const m = VISITED_ABSTAIN.exec(cause ?? "")
    expect(m).not.toBeNull()
    expect(Number(m?.[1])).toBe(spent) // the explanation counts the SAME sites the cost line billed
  }
}

describe("S14 — atlas mine: a 0-fact pass reports the cause its own run produced (never fabricates)", () => {
  afterAll(() => {
    repo?.cleanup()
  })

  it("1. a default `atlas mine <repo>` run seeds 0, explains the 0 by its OBSERVED cause, and exits 0", () => {
    repo = makeFixtureRepo({ files: { "src/foo.ts": "export const foo = 1;\n" } })

    // ATLAS_MINE_SLOT pinned to the advisory arm: this story tests the 0-fact OBSERVED-CAUSE render, not the
    // multi-arm default (which is proven in s-sound-default + the mine-arms unit suite).
    const r = runAtlas(repo.repoPath, ["mine", repo.repoPath], { ATLAS_MINE_SLOT: "advisory" })

    // exit 0 — an empty pass is a clean honest result, NOT an error (no `resumeToken` rides it).
    expect(r.exitCode).toBe(0)

    const lines = r.stdout.split("\n")
    expect(lines).toContain("genesis: seeded 0 candidate fact(s); ratified 0")
    // The cause is asserted BYTE-EXACT against whichever state the run is actually in — never against a
    // frozen guess about the wiring. (At the time of writing the default pass bills `budgetSpent 0` and this
    // resolves to `NO_SITES_LINE`; a wired skeleton flips it to `VISITED_ABSTAIN` with no edit here.)
    expectCauseMatchesCost(r.stdout)
    expect(lines.some((l) => l.startsWith("cost: llmCalls "))).toBe(true) // the cost line the cause is tied to

    // no thrown stack / crash leaked to stderr — the empty path is a normal, structured render.
    expect(r.stderr).toBe("")

    // the three lines appear in the documented order (genesis → cost → cause), with a trailing newline.
    const idxGenesis = lines.indexOf("genesis: seeded 0 candidate fact(s); ratified 0")
    const idxCost = lines.findIndex((l) => l.startsWith("cost: "))
    const idxCause = lines.findIndex((l) => l.startsWith("mine: 0 candidate facts"))
    expect(idxGenesis).toBeGreaterThanOrEqual(0)
    expect(idxCost).toBe(idxGenesis + 1)
    expect(idxCause).toBe(idxCost + 1)
  })

  it("2. re-running `atlas mine` on the SAME repo stays stable — idempotent, no accumulation, no fabrication", () => {
    // A second independent pass over the same fixture: still 0 facts, still the same observed cause, still
    // exit 0 — the empty result is a structural property of the seam, not a one-shot fluke.
    const r2 = runAtlas(repo.repoPath, ["mine", repo.repoPath], { ATLAS_MINE_SLOT: "advisory" })
    expect(r2.exitCode).toBe(0)
    expect(r2.stdout).toContain("genesis: seeded 0 candidate fact(s); ratified 0")
    expectCauseMatchesCost(r2.stdout)
  })
})
