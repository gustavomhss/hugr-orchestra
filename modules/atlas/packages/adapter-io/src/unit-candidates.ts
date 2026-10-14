// @atlas/adapter-io — src/unit-candidates.ts  (#196a candidate-grounded — the prompt-side RECALL reader)
//
// The `CandidateReader` the candidate-grounded dependency arm injects into `createPromptFactory`: it maps a
// mined SITE to the unit's real cross-unit dependency NAMES (`UnitDepsApi.candidatesFor`, @atlas/index), the
// CLOSED set the model may select from. Pairs with the gate-side name→symbol resolution in
// `compose-mine-admission.ts` — the prompt shows the names, the gate resolves the pick to a real SCIP symbol
// and the sound oracle re-proves it. Pure delegation: the candidate SET is the index's business, not the
// prompt's (mirrors `createUnitSourceReader` delegating unit slicing to the AST).

import type { StructRef } from "@atlas/contracts"
import { createUnitDeps } from "@atlas/index"
import type { ScipOutput } from "@atlas/index"

import type { CandidateReader } from "./prompt.js"
import type { DepResolver } from "./llm.js"

/** The FILE portion of a `qualifiedPath` — the prefix up to the FIRST `::` (mirrors `unit-source.ts`'s helper;
 *  candidates are a UNIT-level (per-file) property, so a `::symbol` site resolves to its file's dep set). */
function filePathOf(qualifiedPath: string): string {
  const at = qualifiedPath.indexOf("::")
  return at === -1 ? qualifiedPath : qualifiedPath.slice(0, at)
}

/** Build the candidate reader over one SCIP output — the unit's cross-unit dep NAMES for a site's file.
 *  Total: an unknown file (or one with no cross-unit dep) yields `[]`, which renders as an empty candidate
 *  list; the candidate-grounded prompt frames that as "no non-obvious dependency here" and the model abstains. */
export function createUnitDepCandidates(scip: ScipOutput): CandidateReader {
  const deps = createUnitDeps(scip)
  return { candidates: (site: StructRef): readonly string[] => deps.candidatesFor(filePathOf(site.qualifiedPath)) }
}

/** The gate/parser-side resolver: a picked dependency NAME → the mined unit's OWN cross-unit dependency symbol
 *  (`UnitDepsApi.resolveDepFor`), `null` when the name is not a cross-unit dep of that unit. Bound PER-UNIT (via
 *  the site's file), which is what keeps an admitted fact tied to the unit it names — an index-wide name lookup
 *  let an off-candidate name ride an unrelated file's same-named symbol (lucy BLOCKER). Pairs with
 *  `makeDependencyClaimParser` (llm.ts), which puts the resolved SYMBOL on the seed's `target`. */
export function createDepResolver(scip: ScipOutput): DepResolver {
  const deps = createUnitDeps(scip)
  return (name: string, site: StructRef): string | null => deps.resolveDepFor(filePathOf(site.qualifiedPath), name)
}
