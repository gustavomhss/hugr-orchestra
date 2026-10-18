export * as ResearchToolkitManifest from "./manifest"

import type { ResearchEngineId, ResearchPack } from "./index"

// J6.4: one pack file per engine under `packs/`, listed here once and keyed by its own id, as the backend's are. An id
// with no pack yet is unshipped: `status` reports it unsupported and `ensure` fails named, never empty (J6.10).
export const ENGINES: Readonly<Partial<Record<ResearchEngineId, ResearchPack>>> = {}

/** Every research engine id, in the order the toolkit lists them; the record keeps the list complete. */
export const IDS = Object.keys({
  "scip-typescript": true,
  "scip-python": true,
  typescript: true,
} satisfies Record<ResearchEngineId, true>) as ReadonlyArray<ResearchEngineId>
