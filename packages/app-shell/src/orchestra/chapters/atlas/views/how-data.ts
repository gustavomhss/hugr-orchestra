import type { AtlasFact, AtlasModel } from "../atlas-model"
import type { AtlasOutput } from "../atlas-types"

// The five stops of one fact's life (mock views-explore.js:453-464): [icon, title copy key].
export const HOW_STOPS = [
  ["sparkle", "orchestra.atlas.how.stop.learned"],
  ["shield", "orchestra.atlas.how.stop.checked"],
  ["stack", "orchestra.atlas.how.stop.stored"],
  ["agents", "orchestra.atlas.how.stop.served"],
  ["drift", "orchestra.atlas.how.stop.watched"],
] as const

// The fact to follow: the one the query names, else the first that drifted and kept its reasoning, else the first.
export function followFact(model: AtlasModel, key: string | undefined): AtlasFact | undefined {
  const named: AtlasFact | undefined = key ? model.byKey[key] : undefined
  return named ?? model.live().find((x) => x.drift && x.why) ?? model.live()[0]
}

// "Another fact": a stable jump through the live facts, from the current key (mock views-explore.js:471).
export function anotherFact(model: AtlasModel, fact: AtlasFact) {
  const live = model.live()
  return live[Math.floor(((fact.key.charCodeAt(3) || 0) * 7) % live.length)]
}

export const howStep = (value: string | undefined) =>
  Math.min(HOW_STOPS.length - 1, Math.max(0, Math.floor(Number(value ?? 0)) || 0))

// Whether the unit's briefing sends this sentence in a paid band (ratified, watch out or hints).
export function servedIn(model: AtlasModel, fact: AtlasFact) {
  const briefing = model.briefing(model.unitOf(fact.file))
  return [...briefing.inv, ...briefing.gotchas, ...briefing.adv].includes(fact)
}

export const blastOf = (model: AtlasModel, fact: AtlasFact) => model.R.dependents[fact.file]?.length ?? 0

export const reasoningText = (value: AtlasOutput<"reasoning"> | undefined) =>
  value?.state === "ok" ? value.text : undefined
