// @atlas/cli — src/territory-cli.ts  (R4 / D22: `atlas territory <name> <glob...> --owner <seat> --tier <T0|T1|T2>`)
//
// Declares or replaces one territory in TERRITORY-CATALOG.json (adapter-io `declareTerritory`, which publishes through
// `publishTerritoryCatalog`). A territory's tier is human-ratified, so the write needs ATLAS_RATIFY_TOKEN to name a
// ratifier, and a T0 needs `billy` — the KNOW-8 rule `ratify()` applies to facts. `--project <id>` is needed only for
// the first catalog (it is the Orchestra project id the host verifies against).

import { declareTerritory, TERRITORY_CATALOG_FILE } from "@atlas/adapter-io"
import { BILLY } from "@atlas/knowledge"
import type { CliVerdict } from "./render.js"
import { flagValue, opsOutcome, opsRefusal, opsUsage } from "./ops-common.js"

export const TERRITORY_INVARIANT =
  "TERRITORY (D22): a territory's tier is human-ratified — the catalog is written only through publishTerritoryCatalog with ATLAS_RATIFY_TOKEN naming a ratifier (billy for T0), and its version is the hash of its content"

/** What the runner reads through — injected so a test needs no environment. */
export interface TerritoryPorts {
  readonly repoPath: string
  readonly ratifyToken: string | undefined
}

/** The production ports. The ONE environment read of the B-O commands (specs/atlas-ui/build/issues/b-o.md item 2):
 *  the composed runtime does not expose the ratify token, and this is the same documented channel `compose.ts` reads. */
export function territoryPorts(): TerritoryPorts {
  return { repoPath: process.cwd(), ratifyToken: process.env.ATLAS_RATIFY_TOKEN }
}

export function runTerritory(
  ports: TerritoryPorts,
  positionals: readonly string[],
  flags: Readonly<Record<string, string>>,
): CliVerdict {
  const name = positionals[0] ?? ""
  const globs = positionals.slice(1)
  if (globs.length === 0) return opsUsage("territory requires <name> and at least one <glob>")
  const owner = flagValue(flags, "owner")
  if (owner === undefined) return opsUsage("territory requires --owner <seat>: the seat that owns the territory")
  const tier = flagValue(flags, "tier")
  if (tier !== "T0" && tier !== "T1" && tier !== "T2") {
    return opsUsage("territory requires --tier <T0|T1|T2>: the territory's human-ratified criticality")
  }
  const token = (ports.ratifyToken ?? "").trim()
  if (token === "") {
    return opsRefusal("territory: a territory's tier is human-ratified — set ATLAS_RATIFY_TOKEN to the ratifier's name; nothing was written")
  }
  if (tier === "T0" && token !== BILLY) {
    return opsRefusal(`territory: a T0 territory needs ATLAS_RATIFY_TOKEN=${BILLY}; nothing was written`)
  }
  const project = flagValue(flags, "project")
  const out = declareTerritory(ports.repoPath, { name, owner, tier, globs, ...(project !== undefined ? { projectId: project } : {}) })
  if (!out.ok) return opsRefusal(`territory: ${out.reason}`)
  return opsOutcome(
    TERRITORY_INVARIANT,
    `'${name}' is ${out.replaced ? "replaced" : "declared"} in ${TERRITORY_CATALOG_FILE}; commit the file — Orchestra reads the committed catalog`,
    [
      `catalog: ${out.catalog.catalogVersion} project ${out.catalog.projectId}, ${out.catalog.territories.length} territory(ies)`,
      `territory: ${name} owner ${owner} tier ${tier} ratified-by ${token} globs ${globs.join(" ")}`,
    ],
  )
}
