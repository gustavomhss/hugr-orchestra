import type { Territory, Tier } from "@atlas/contracts"

/** Versioned, read-only territory catalog for one explicit project. */
export interface TerritoryCatalog {
  readonly projectId: string
  readonly catalogVersion: string
  readonly territories: readonly Territory[]
}

/** Installable Atlas boundary consumed by an external runtime adapter. */
export interface TerritoryCatalogApi {
  territoryCatalog(projectId: string): TerritoryCatalog
}

const TIERS: ReadonlySet<Tier> = new Set(["T0", "T1", "T2"])

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value)
}

function territoryOf(value: unknown, index: number): Territory {
  if (!isRecord(value)) throw new Error(`invalid territory at index ${index}`)
  if (typeof value.name !== "string" || typeof value.owner !== "string" || !TIERS.has(value.tier as Tier)) {
    throw new Error(`invalid territory fields at index ${index}`)
  }
  if (!Array.isArray(value.globs) || value.globs.some((glob) => typeof glob !== "string")) {
    throw new Error(`invalid territory globs at index ${index}`)
  }
  return Object.freeze({
    name: value.name,
    owner: value.owner,
    tier: value.tier as Tier,
    globs: Object.freeze([...value.globs]),
  })
}

function catalogOf(value: unknown): TerritoryCatalog {
  if (!isRecord(value)) throw new Error("invalid territory catalog")
  if (typeof value.projectId !== "string" || value.projectId.length === 0) {
    throw new Error("territory catalog requires projectId")
  }
  if (typeof value.catalogVersion !== "string" || value.catalogVersion.length === 0) {
    throw new Error("territory catalog requires catalogVersion")
  }
  if (!Array.isArray(value.territories)) throw new Error("territory catalog requires territories")

  const names = new Set<string>()
  const territories = value.territories.map((territory, index) => {
    const normalized = territoryOf(territory, index)
    if (names.has(normalized.name)) throw new Error(`duplicate territory name: ${normalized.name}`)
    names.add(normalized.name)
    return normalized
  })

  return Object.freeze({
    projectId: value.projectId,
    catalogVersion: value.catalogVersion,
    territories: Object.freeze(territories),
  })
}

/** Decode a static catalog without selecting an ambient project or consulting an Atlas store. */
export function parseTerritoryCatalog(value: unknown): TerritoryCatalog {
  return catalogOf(value)
}

/**
 * Build an explicit project catalog boundary. It performs no discovery: callers provide the complete
 * versioned source, and consumers must provide the project id on every read.
 */
export function createTerritoryCatalog(catalogs: readonly TerritoryCatalog[]): TerritoryCatalogApi {
  const byProject = new Map<string, TerritoryCatalog>()
  for (const input of catalogs) {
    const catalog = catalogOf(input)
    if (byProject.has(catalog.projectId)) throw new Error(`duplicate project catalog: ${catalog.projectId}`)
    byProject.set(catalog.projectId, catalog)
  }

  return Object.freeze({
    territoryCatalog(projectId: string): TerritoryCatalog {
      const catalog = byProject.get(projectId)
      if (catalog === undefined) throw new Error(`unknown project catalog: ${projectId}`)
      return catalog
    },
  })
}
