// @atlas/adapter-io — src/surface/read-index.ts  (the Atlas UI surface: who depends on each file)
//
// The snapshot's `dependents` and `dependentCount`, from the code index `.atlas/index.scip`. They are the RESOLVED
// depends-on edges `build` derives for the dependency axis — the axis whose reverse closure `own` reads for its
// dependents band (retrieval-model.ts `blastRadius`) — folded from index node hashes to file paths. `build` is given
// an EMPTY file tree because its edge ledger is a function of the SCIP occurrences alone; the spatial and territory
// axes it also returns are discarded unread. No index file ⇒ `scip: false` and both maps empty.

import { existsSync } from "node:fs"
import { join } from "node:path"
import { build, nodeHashOfPath } from "@atlas/index"
import { readScipOrEmpty, SCIP_INDEX_REL } from "../scip.js"
import type { AtlasSnapshot } from "./types.js"

/** The snapshot fields that come from the code index. */
export type IndexRead = Pick<AtlasSnapshot, "scip" | "dependents" | "dependentCount">

export function readDependents(repoPath: string): IndexRead {
  const scipPath = join(repoPath, SCIP_INDEX_REL)
  if (!existsSync(scipPath)) return { scip: false, dependents: {}, dependentCount: {} }
  const scip = readScipOrEmpty(scipPath)
  const pathOf = new Map(scip.documents.map((doc) => [String(nodeHashOfPath(doc.relativePath)), doc.relativePath]))
  const users = new Map<string, Set<string>>()
  for (const edge of build({ path: ".", children: [] }, scip).edges) {
    const target = edge.to === null ? undefined : pathOf.get(String(edge.to))
    const user = pathOf.get(String(edge.from))
    if (edge.kind !== "resolved" || target === undefined || user === undefined || target === user) continue
    users.set(target, (users.get(target) ?? new Set<string>()).add(user))
  }
  const dependents = Object.fromEntries([...users].map(([target, set]) => [target, [...set].sort()]))
  return {
    scip: true,
    dependents,
    dependentCount: Object.fromEntries(Object.entries(dependents).map(([target, list]) => [target, list.length])),
  }
}
