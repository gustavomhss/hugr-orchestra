import type { AtlasModel, AtlasOwnPack, AtlasOwnSnapshot } from "../atlas-model"

// Ownership (specs/atlas-ui/mock/views-own.js): one ownership doc per unit, live from the store or published as a
// committed skill. model.snapshot is the committed Own snapshot (OWN-SNAPSHOT.json, filled by A15c, D3b).

export type AtlasOwnerState = "published-drifted" | "published" | "live-drifted" | "live"
// A governing row as the doc shows it: a live fact, or an invariant of the committed pack.
export type AtlasOwnerRule = { tier: string; claim: string }
export type AtlasOwner = ReturnType<typeof owners>[number]

// own-artifact.ts:87: a published skill is named after the base64url of the UTF-8 unit id, without padding. It is
// injective, so two units can never share a skill name.
export const skillName = (unitId: string) =>
  btoa(String.fromCharCode(...new TextEncoder().encode(unitId)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "")

export const lastFolder = (path: string) => path.split("/").at(-1) ?? path
// The short name `atlas own` prints: the last folder; the top-level files are "root".
export const leafOf = (id: string) => (id === "(root)" ? "root" : lastFolder(id))

// "Names that can't collide": the sample unit, and a second unit with the same last folder (mock views-own.js:38-39).
export const SAMPLE_UNIT = "src/billing"
export const otherUnit = (name: string) =>
  name.startsWith("src/") ? name.replace(/^src\//, "crates/") : `src/${lastFolder(name)}`

// One owner per unit of the unit graph (mock views-own.js:43-54). A published owner says what its committed skill
// says (the pack's invariants and summary), not what the live store would compose now.
export function owners(model: AtlasModel) {
  const graph = model.unitGraph()
  const snapshot = model.snapshot
  return graph.units
    .filter((unit) => unit.id !== "(root)")
    .map((unit) => {
      const b = model.briefing(unit.id)
      const pack: AtlasOwnPack | undefined = snapshot.packs[unit.id]
      const gov: AtlasOwnerRule[] = pack ? pack.invariants : b.gov
      return {
        id: unit.id,
        leaf: leafOf(unit.id),
        b,
        gov,
        files: unit.files.size,
        rules: gov.length,
        // null renders as "No facts yet.".
        role: pack?.summary ?? b.gov[0]?.claim ?? b.here[0]?.claim ?? null,
        uses: graph.edges.filter((edge) => edge.source === unit.id).map((edge) => edge.target),
        usedBy: graph.edges.filter((edge) => edge.target === unit.id).map((edge) => edge.source),
        people: model.packOwner(unit.id),
        state: ownerState(snapshot.units.includes(unit.id), unit.drifted > 0),
      }
    })
}

// The doc to show: the one the query names, else the first with a committed pack, else the first published, else
// the first unit (mock views-own.js:55).
export function pickOwner(list: AtlasOwner[], u: string | undefined, snapshot: AtlasOwnSnapshot): AtlasOwner | undefined {
  return (
    list.find((owner) => owner.id === u) ??
    list.find((owner) => !!snapshot.packs[owner.id]) ??
    list.find((owner) => snapshot.units.includes(owner.id)) ??
    list[0]
  )
}

// The first published unit with its pack: the HOLD demo and "The skill file, as committed" show it (A29b).
export function firstPublished(snapshot: AtlasOwnSnapshot) {
  const unit = snapshot.units.at(0)
  const pack: AtlasOwnPack | undefined = unit === undefined ? undefined : snapshot.packs[unit]
  if (unit === undefined || !pack) return undefined
  return { unit, pack }
}

function ownerState(published: boolean, drifted: boolean): AtlasOwnerState {
  if (published) return drifted ? "published-drifted" : "published"
  return drifted ? "live-drifted" : "live"
}
