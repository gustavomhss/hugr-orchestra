// @atlas/adapter-io — src/territory-write.ts  (R4 / D22: declare a territory in the committed catalog)
//
// `TERRITORY-CATALOG.json` sits at the repository root, beside `OWN-SNAPSHOT.json`, where Orchestra's Maestro reads
// it (`maestro.atlas.directory`). Its `catalogVersion` is the content hash of `{projectId, territories}`, so a hand
// edit makes every host read hold. This module is the one writer: it re-verifies the catalog on disk, adds or
// replaces ONE territory by name (in place — declaration order is the overlap tie-break), and republishes through
// `publishTerritoryCatalog`, the Atlas-owned definition, validation and versioning. Who may write is the CLI's
// question (`atlas territory` requires a ratify token: a territory's tier is human-ratified).

import { existsSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import type { Territory, Tier } from "@atlas/contracts"
import type { TerritoryCatalog } from "@atlas/index"
import { publishTerritoryCatalog, territoryCatalog } from "@atlas/retrieval"

export const TERRITORY_CATALOG_FILE = "TERRITORY-CATALOG.json"

/** One territory to declare. `projectId` is required only for the first catalog, and must match an existing one. */
export interface TerritoryDeclaration {
  readonly name: string
  readonly owner: string
  readonly tier: Tier
  readonly globs: readonly string[]
  readonly projectId?: string
}

export type TerritoryWrite =
  | { readonly ok: true; readonly path: string; readonly catalog: TerritoryCatalog; readonly replaced: boolean }
  | { readonly ok: false; readonly reason: string }

/** Add or replace one territory and rewrite the catalog. Writes nothing on any refusal. Total: never throws. */
export function declareTerritory(repoPath: string, input: TerritoryDeclaration): TerritoryWrite {
  const path = join(repoPath, TERRITORY_CATALOG_FILE)
  const current = readCatalog(path)
  if ("reason" in current) return { ok: false, reason: current.reason }
  const existing = current.catalog
  if (existing !== undefined && input.projectId !== undefined && input.projectId !== existing.projectId) {
    return { ok: false, reason: `${TERRITORY_CATALOG_FILE} is the catalog of project '${existing.projectId}', not '${input.projectId}'` }
  }
  const projectId = existing?.projectId ?? input.projectId
  if (projectId === undefined) {
    return {
      ok: false,
      reason: `no ${TERRITORY_CATALOG_FILE} exists yet: --project <id> names the project the first catalog is for (the Orchestra project id)`,
    }
  }
  const territory: Territory = { name: input.name, owner: input.owner, tier: input.tier, globs: [...input.globs] }
  const prior = existing?.territories ?? []
  const replaced = prior.some((t) => t.name === input.name)
  const territories = replaced ? prior.map((t) => (t.name === input.name ? territory : t)) : [...prior, territory]
  try {
    const catalog = publishTerritoryCatalog(projectId, territories)
    writeFileSync(path, `${JSON.stringify(catalog, null, 2)}\n`)
    return { ok: true, path, catalog, replaced }
  } catch (error) {
    return { ok: false, reason: `the catalog was not written: ${error instanceof Error ? error.message : String(error)}` }
  }
}

/** The verified catalog on disk, none when the file is absent, or why it cannot be built on. */
function readCatalog(path: string): { readonly catalog?: TerritoryCatalog } | { readonly reason: string } {
  if (!existsSync(path)) return {}
  try {
    const value: unknown = JSON.parse(readFileSync(path, "utf8"))
    const projectId = typeof value === "object" && value !== null && "projectId" in value ? String(value.projectId) : ""
    return { catalog: territoryCatalog(projectId, value) }
  } catch (error) {
    return {
      reason: `${TERRITORY_CATALOG_FILE} exists and does not verify (${error instanceof Error ? error.message : String(error)}); its version is a hash of its content, so restore it from git before declaring`,
    }
  }
}
