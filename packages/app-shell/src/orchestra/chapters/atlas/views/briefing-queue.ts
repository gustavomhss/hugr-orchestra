import type { AtlasFact, AtlasModel, AtlasPointer } from "../atlas-model"

// The order `atlas own` pays a briefing in (retrieval/src/own.ts, specs/atlas-ui/mock/views-explore.js:482-492):
// governing rows, then gotchas, then the governing rows that did not fit (named, not sent), then one pointer per
// finer scope, then hints, then the hints that did not fit. `ok` is false for a row left out for space.
export const BRIEFING_CAP = 1500
export type BriefingBand = "gov" | "gotcha" | "ptr" | "adv"
export type BriefingItem = {
  band: BriefingBand
  cost: number
  ok: boolean
  label: string
  fact?: AtlasFact
  pointer?: AtlasPointer
}

export function briefingQueue(model: Pick<AtlasModel, "briefing" | "governing">, path: string): BriefingItem[] {
  const b = model.briefing(path)
  const fact =
    (band: BriefingBand, ok: boolean) =>
    (x: AtlasFact): BriefingItem => ({
      band,
      cost: x.claim.length,
      ok,
      label: x.claim.length > 64 ? `${x.claim.slice(0, 64)}…` : x.claim,
      fact: x,
    })
  return [
    ...b.inv.map(fact("gov", true)),
    ...b.gotchas.map(fact("gotcha", true)),
    ...b.pull.filter((x) => model.governing(x)).map(fact("gov", false)),
    ...b.pointers.map((p): BriefingItem => ({ band: "ptr", cost: p.name.length, ok: true, label: p.name, pointer: p })),
    ...b.adv.map(fact("adv", true)),
    ...b.pull.filter((x) => !model.governing(x)).map(fact("adv", false)),
  ]
}
