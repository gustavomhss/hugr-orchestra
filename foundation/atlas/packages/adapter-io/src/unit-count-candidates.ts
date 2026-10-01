// @atlas/adapter-io — src/unit-count-candidates.ts  (#196c candidate-grounded — the CARDINALITY prompt-side reader)
//
// The fan-IN dual of `unit-candidates.ts`. It maps a mined SITE to the unit's externally-called export NAMES
// (`UnitExportsApi.exportsWithCallersFor`, @atlas/index) — the CLOSED set the model may select from — and, on
// the gate/parser side, resolves a picked name to that unit's own SYMBOL plus the harness-derived witnessed
// count (`resolveExportFor`). The prompt shows the names; the parser derives the NUMBER from the live index and
// the sound `verifyCount` oracle re-proves it. Pure delegation: the candidate SET and the count are the index's
// business, not the prompt's (mirrors `createUnitDepCandidates` / `createDepResolver`).

import type { StructRef } from "@atlas/contracts"
import { createUnitExports } from "@atlas/index"
import type { ScipOutput } from "@atlas/index"

import type { CandidateReader } from "./prompt.js"
import type { CountResolver } from "./llm.js"

/** The FILE portion of a `qualifiedPath` — the prefix up to the FIRST `::` (a `::symbol` site resolves to its
 *  file's export set; candidates are a UNIT-level property). Mirrors `unit-candidates.ts`'s helper. */
function filePathOf(qualifiedPath: string): string {
  const at = qualifiedPath.indexOf("::")
  return at === -1 ? qualifiedPath : qualifiedPath.slice(0, at)
}

/** Build the candidate reader over one SCIP output — the unit's externally-called export NAMES for a site's
 *  file. Total: an unknown file (or one with no externally-called export) yields `[]`, which renders as an empty
 *  candidate list; the count prompt frames that as "no non-obvious fan-in here" and the model abstains. */
export function createUnitCountCandidates(scip: ScipOutput): CandidateReader {
  const ex = createUnitExports(scip)
  return {
    candidates: (site: StructRef): readonly string[] => ex.exportsWithCallersFor(filePathOf(site.qualifiedPath)),
  }
}

/** The gate/parser-side resolver: a picked export NAME → the mined unit's OWN symbol + harness-derived
 *  `atLeast`/`scope` (`UnitExportsApi.resolveExportFor`), `null` when the name is not an externally-called
 *  export of that unit. Bound PER-UNIT (via the site's file) — the #196a lucy BLOCKER discipline. Pairs with
 *  `makeCountClaimParser` (llm.ts), which puts the resolved SYMBOL + witnessed count on the seed. */
export function createCountResolver(scip: ScipOutput): CountResolver {
  const ex = createUnitExports(scip)
  return (name: string, site: StructRef) => ex.resolveExportFor(filePathOf(site.qualifiedPath), name)
}
