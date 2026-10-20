import type { AtlasUnit, AtlasUnitGroup } from "../atlas-model"

// Unit helpers of the Explore view (specs/atlas-ui/mock/views-explore.js:8-11, :152). Pure: no Solid, no copy text.
type UnitLike = Pick<AtlasUnit, "id" | "facts" | "drifted">
export type ExploreSort = "facts" | "changed" | "share" | "name"

export const EXPLORE_GROUPS = [
  ["", "orchestra.atlas.explore.group.all"],
  ["code", "orchestra.atlas.explore.group.code"],
  ["docs", "orchestra.atlas.explore.group.docs"],
  ["harness", "orchestra.atlas.explore.group.harness"],
  ["root", "orchestra.atlas.explore.group.root"],
] as const
export const GROUP_WORD = {
  code: "orchestra.atlas.explore.group.code",
  docs: "orchestra.atlas.explore.group.docs",
  harness: "orchestra.atlas.explore.group.harness",
  root: "orchestra.atlas.explore.group.root",
} as const satisfies Record<AtlasUnitGroup, string>

// A unit's short name: its path after the first segment; the root unit reads as `topLevel`.
export const shortUnit = (id: string, topLevel: string) => (id === "(root)" ? topLevel : id.split("/").slice(1).join("/") || id)

// good when nothing changed, mixed when some did, warm when more than a quarter did.
export const unitTone = (unit: UnitLike) => (unit.drifted / unit.facts > 0.25 ? "warm" : unit.drifted ? "mixed" : "good")

export const toSort = (value: string | undefined): ExploreSort =>
  value === "changed" || value === "share" || value === "name" ? value : "facts"

export function sortUnits<T extends UnitLike>(units: readonly T[], sort: ExploreSort, shortOf: (id: string) => string) {
  const order: Record<ExploreSort, (a: T, b: T) => number> = {
    changed: (a, b) => b.drifted - a.drifted || b.facts - a.facts,
    share: (a, b) => b.drifted / b.facts - a.drifted / a.facts || b.facts - a.facts,
    name: (a, b) => shortOf(a.id).localeCompare(shortOf(b.id)),
    facts: (a, b) => b.facts - a.facts,
  }
  return [...units].sort(order[sort])
}
