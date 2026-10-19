import type { AtlasFact, AtlasFactState } from "../atlas-model"

// The Explore map's tree (specs/atlas-ui/mock/views-explore.js:175-196): units hold folders hold files; each file
// counts its facts and how many of them changed. Unit nodes carry their unit id. Only files are leaves.
export type PackNode = {
  name: string
  path: string
  unit?: string
  leaf: boolean
  facts: number
  drifted: number
  children: PackNode[]
}
type PackModel = {
  live: () => AtlasFact[]
  unitOf: (file: string) => string
  state: (x: AtlasFact) => AtlasFactState
}

export function packTree(model: PackModel, unitIds: readonly string[], unitName: (id: string) => string): PackNode {
  const root: PackNode = { name: "", path: "", leaf: false, facts: 0, drifted: 0, children: [] }
  const units = new Map(
    unitIds.map((id) => {
      const node: PackNode = { name: unitName(id), path: id, unit: id, leaf: false, facts: 0, drifted: 0, children: [] }
      root.children.push(node)
      return [id, node] as const
    }),
  )
  model.live().forEach((x) => {
    const unit = model.unitOf(x.file)
    const top = units.get(unit)
    if (!top) return
    const rest = unit === "(root)" ? x.file.split("/") : x.file.slice(unit.length + 1).split("/")
    const file = rest.reduce((node, part, i) => {
      const found = node.children.find((child) => child.name === part)
      if (found) return found
      const inside = rest.slice(0, i + 1).join("/")
      const next: PackNode = {
        name: part,
        path: unit === "(root)" ? inside : `${unit}/${inside}`,
        leaf: false,
        facts: 0,
        drifted: 0,
        children: [],
      }
      node.children.push(next)
      return next
    }, top)
    file.leaf = true
    file.facts++
    if (model.state(x) === "drifted") file.drifted++
  })
  return root
}

// Five distinct ring tones, all mixed from kit tokens; sand stays reserved for drift (views-explore.js:222-223).
export const SWEEP_TONES = [
  "var(--mx-blue)",
  "var(--mx-good)",
  "color-mix(in srgb, var(--mx-blue) 55%, var(--mx-bad))",
  "color-mix(in srgb, var(--mx-good) 45%, var(--mx-blue))",
  "color-mix(in srgb, var(--mx-dim) 70%, var(--mx-strong))",
]

// The tone of the n-th child around a ring of `length`: tones cycle, except that a last child which would wrap round
// to the first child's tone takes the third tone instead, so neighbours never match.
export const sweepIndex = (n: number, length: number) =>
  n % SWEEP_TONES.length === 0 && n === length - 1 && n > 0 ? 2 : n % SWEEP_TONES.length
