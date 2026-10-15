// @atlas/adapter-io — src/unit-def-candidates.ts  (#196d candidate-grounded — the DEFINITION prompt-side reader)
//
// The third candidate reader beside `unit-candidates.ts` (dependency) and `unit-count-candidates.ts` (count).
// It maps a mined SITE to the NAMES of the GLOBAL symbols THIS unit DEFINES (`UnitDefsApi.definitionsFor`,
// @atlas/index) — the CLOSED set the model may select from — and, on the gate/parser side, resolves a picked
// name to that unit's own SYMBOL (`resolveDefFor`). The prompt shows the names; the sound `verifyDefinition`
// oracle re-proves the pick's def-occurrence lies under the unit's scope. Pure delegation: the candidate SET is
// the index's business, not the prompt's (mirrors `createUnitDepCandidates` / `createDepResolver`).

import type { StructRef } from "@atlas/contracts"
import { createUnitDefs } from "@atlas/index"
import type { ScipOutput } from "@atlas/index"

import type { CandidateReader } from "./prompt.js"
import type { DepResolver } from "./llm.js"

/** The FILE portion of a `qualifiedPath` — the prefix up to the FIRST `::` (a `::symbol` site resolves to its
 *  file's definition set; candidates are a UNIT-level property). Mirrors `unit-candidates.ts`'s helper. */
function filePathOf(qualifiedPath: string): string {
  const at = qualifiedPath.indexOf("::")
  return at === -1 ? qualifiedPath : qualifiedPath.slice(0, at)
}

/** Build the candidate reader over one SCIP output — the NAMES of the symbols a site's file DEFINES. Total: an
 *  unknown file (or one that defines no non-`local` symbol) yields `[]`, which renders as an empty candidate
 *  list; the candidate-grounded prompt frames that as "no non-obvious definition here" and the model abstains. */
export function createUnitDefCandidates(scip: ScipOutput): CandidateReader {
  const defs = createUnitDefs(scip)
  return { candidates: (site: StructRef): readonly string[] => defs.definitionsFor(filePathOf(site.qualifiedPath)) }
}

/** The gate/parser-side resolver: a picked definition NAME → the mined unit's OWN defined symbol
 *  (`UnitDefsApi.resolveDefFor`), `null` when the name is not a symbol defined in that unit. Bound PER-UNIT (via
 *  the site's file), which is what keeps an admitted fact tied to the unit it names — an index-wide name lookup
 *  let an off-candidate name ride an unrelated file's same-named symbol (lucy BLOCKER). Reuses `DepResolver` (an
 *  identical `(name, site) => symbol | null` signature). Pairs with `makeDefinitionClaimParser` (llm.ts). */
export function createDefResolver(scip: ScipOutput): DepResolver {
  const defs = createUnitDefs(scip)
  return (name: string, site: StructRef): string | null => defs.resolveDefFor(filePathOf(site.qualifiedPath), name)
}
