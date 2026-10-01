// @atlas/cli — test/mine-coverage-render.test.ts  (CLI-4 / WP-8.30.GEN: the run PRINTS its site ledger)
//
// A genesis run's per-site outcomes are only worth something if they LEAVE the process. `GenesisReport`
// now carries them (`coverage`, `packages/genesis/src/coverage.ts`); this suite pins that `atlas mine`
// actually renders them, in a form a third party can reconcile WITHOUT importing the product — which is the
// posture `harness/probes/` has to take, so it is the posture asserted here.
//
// Shared seams come from ./mine-fixtures.ts, same as the other two mine suites, so all three test one product.

import { describe, it, expect } from "vitest"
import type { GenesisReport } from "@atlas/genesis"
import { runMine } from "../src/mine.js"
import type { MineDeps } from "../src/mine.js"
import { coverageLines, foldVerdict, siteLine } from "../src/mine-render.js"
import { skeletonSource, injectedHistory, fakeStore, budget, FRONTIER, REPO, NO_MODEL_ENV } from "./mine-fixtures.js"

/** A pass over a REAL ranked frontier (4 sites) with no proposer wired — every site is visited and yields
 *  nothing, which is exactly the state in which "did it abstain or was it dropped?" used to be unanswerable. */
const seededFrontier: Partial<MineDeps> = {
  rev: "HEAD",
  env: NO_MODEL_ENV,
  skeleton: skeletonSource,
  history: injectedHistory,
  store: fakeStore(),
  budget: budget(FRONTIER.length),
}

/** Parse the ledger back out of rendered stdout the way an outside reader must: prefix, then JSON. */
function ledgerOf(stdout: string): readonly Record<string, unknown>[] {
  return stdout
    .split("\n")
    .filter((l) => l.startsWith("site: "))
    .map((l) => JSON.parse(l.slice("site: ".length)) as Record<string, unknown>)
}

describe("the mine render publishes a PER-SITE ledger, not a count", () => {
  it("every planned site gets exactly one machine-readable row, and the run says the set CLOSES", async () => {
    const v = await runMine(REPO, seededFrontier)
    const rows = ledgerOf(v.stdout)

    expect(v.stdout).toContain("coverage: coverage CLOSES")
    expect(rows).toHaveLength(FRONTIER.length) //                     a row per site, not a summary
    expect(new Set(rows.map((r) => r["path"])).size).toBe(rows.length) // each site once — no double-count

    // The counter the run bills and the rows it publishes describe the SAME sites.
    const spent = Number(/budgetSpent (\d+)/.exec(v.stdout)?.[1])
    const visitedKinds = new Set(["seeded", "abstained", "unrecorded"])
    expect(rows.filter((r) => visitedKinds.has(String(r["outcome"])))).toHaveLength(spent)
  })

  it("a row survives a `WhyNot` reason containing the report's own delimiters", () => {
    // Free text a model wrote can contain a newline, a colon and the `·` the cost line uses. JSON is why
    // that cannot corrupt the ledger; a space-separated prose row would have.
    const line = siteLine({
      outcome: "abstained",
      rank: 3,
      site: { kind: "file", qualifiedPath: "src/a.ts", subtreeHash: "st" as never },
      whyNot: {
        site: { kind: "file", qualifiedPath: "src/a.ts", subtreeHash: "st" as never },
        reason: "no: fact\nhere · at all",
      },
    })
    expect(line.split("\n")).toHaveLength(1) //                        one row is one line, always
    const parsed = JSON.parse(line.slice("site: ".length)) as { whyNot: string }
    expect(parsed.whyNot).toBe("no: fact\nhere · at all") //            round-trips byte-exact
  })

  it("an ABSENT ledger renders UNEVALUABLE — an old artifact still reads, and claims nothing", () => {
    // The absent-tolerant read (`builtAt`/`sameAs`/`derivedAt` precedent). A report written before the
    // ledger existed has no `coverage`; rendering it must not silently print a closed site set.
    const old: GenesisReport = { seeded: [], ratified: [], open: [], llmCalls: 0, budgetSpent: 0 }

    /** A five-facet all-UN-SEEDED Awareness — the honest seed of any run that ratified nothing (GEN-9c). */
    const emptyAwareness = () => {
      const facet = (name: string) => ({ content: `UN-SEEDED: ${name}`, grounding: [], state: "UN-SEEDED" as const })
      return {
        mission: facet("mission"),
        constitution: facet("constitution"),
        terrain: facet("terrain"),
        ontology: facet("ontology"),
        taste: facet("taste"),
      }
    }
    const lines = coverageLines(old)
    expect(lines).toHaveLength(1) //                     the verdict, and no fabricated rows
    expect(lines[0]).toContain("UNEVALUABLE")
    expect(lines[0]).not.toContain("CLOSES")

    // and it still folds to a normal verdict — the old shape does not crash the renderer.
    const v = foldVerdict({ report: old, seed: emptyAwareness(), modelWired: false, seedsDropped: 0 })
    expect(v.exitCode).toBe(0)
    expect(v.stdout).toContain("coverage: coverage UNEVALUABLE")
  })
})
