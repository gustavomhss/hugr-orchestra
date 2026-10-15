import { pathKey } from "./path-key"

export const CAVEMAN_ID = "caveman"
export const INTENSITIES = ["lite", "full", "ultra"] as const

export type Intensity = (typeof INTENSITIES)[number]

export type LlmBehavior = {
  id: string
  name: string
  description: string
  instructions: string
  enabled: boolean
  intensity?: Intensity
}

export type LlmBehaviorState = { behaviors: LlmBehavior[] }

// Each level states what changes, so the selected intensity reaches the model as a concrete rule.
const INTENSITY_RULES: Record<Intensity, string> = {
  lite: "Cut filler, pleasantries and hedging. Keep articles and full sentences; stay professional and tight.",
  full: "Drop articles and filler; fragments are fine. Prefer short words. Do not narrate tool calls or add decorative formatting.",
  ultra:
    "Compress to the minimum: one word when one word is enough, state each fact once, drop conjunctions when the meaning stays clear.",
}

const CAVEMAN_GUARDS =
  "Keep code, commands, API names, numbers and exact error text unchanged. Never drop negations. Write security warnings and irreversible-action confirmations in full."

// A new profile starts with Caveman available but off: enabling it changes real model output.
export function defaultBehaviorState(): LlmBehaviorState {
  return {
    behaviors: [
      {
        id: CAVEMAN_ID,
        name: "Caveman",
        description: "Technical substance stays. Fluff goes.",
        instructions: "Respond terse like smart caveman. Preserve technical accuracy.",
        enabled: false,
        intensity: "full",
      },
    ],
  }
}

// Persisted values come from browser storage; keep only well-formed behaviors.
export function sanitizeBehaviorState(value: unknown): LlmBehaviorState {
  if (!isRecord(value) || !Array.isArray(value.behaviors)) return defaultBehaviorState()
  return { behaviors: value.behaviors.flatMap((item) => (isBehavior(item) ? [normalize(item)] : [])) }
}

// The active behaviors as model instructions: a V1 prompt carries them joined (behaviorSystem), a V2 server keeps
// them per project and applies each one to every turn.
export function behaviorInstructions(behaviors: LlmBehavior[]) {
  return behaviors
    .filter((behavior) => behavior.enabled && (behavior.id === CAVEMAN_ID || behavior.instructions.trim()))
    .map((behavior) => ({
      id: behavior.id,
      name: behavior.id === CAVEMAN_ID ? `${behavior.name} (intensity: ${intensity(behavior)})` : behavior.name,
      instructions: [
        behavior.instructions.trim(),
        behavior.id === CAVEMAN_ID ? `${INTENSITY_RULES[intensity(behavior)]} ${CAVEMAN_GUARDS}` : "",
      ]
        .filter(Boolean)
        .join("\n"),
    }))
}

export function behaviorSystem(behaviors: LlmBehavior[]) {
  const active = behaviorInstructions(behaviors)
  if (!active.length) return
  return [
    "LLM behaviors active for this profile. Apply them to every answer.",
    ...active.map((behavior) => `## ${behavior.name}\n${behavior.instructions}`),
  ].join("\n\n")
}

export type BehaviorCardLabels = {
  kind: string
  custom: string
  status: (behavior: LlmBehavior) => string
  configure: string
}

// The text a behavior card shows, in reading order; search matches exactly what the user sees.
export function behaviorCardText(behavior: LlmBehavior, labels: BehaviorCardLabels) {
  return [
    behavior.name,
    behavior.description,
    labels.kind,
    behavior.intensity ?? labels.custom,
    labels.status(behavior),
    labels.configure,
  ].join(" ")
}

export function filterBehaviors(behaviors: LlmBehavior[], query: string, labels: BehaviorCardLabels) {
  const search = query.trim().toLowerCase()
  if (!search) return behaviors
  return behaviors.filter((behavior) => behaviorCardText(behavior, labels).toLowerCase().includes(search))
}

// A profile is a repository: a sandbox or worktree directory belongs to the project that lists it,
// so the Plugins page and every composer in that repository share one behavior store.
export function behaviorProfileDirectory(
  projects: readonly { worktree: string; sandboxes?: readonly string[] }[],
  directory: string,
) {
  const key = pathKey(directory)
  const owner = projects.find(
    (project) => pathKey(project.worktree) === key || project.sandboxes?.some((sandbox) => pathKey(sandbox) === key),
  )
  return owner?.worktree ?? directory
}

export function saveBehavior(behaviors: LlmBehavior[], next: LlmBehavior) {
  if (!behaviors.some((behavior) => behavior.id === next.id)) return [...behaviors, next]
  return behaviors.map((behavior) => (behavior.id === next.id ? next : behavior))
}

export function removeBehavior(behaviors: LlmBehavior[], id: string) {
  return behaviors.filter((behavior) => behavior.id !== id)
}

export function toggleBehavior(behaviors: LlmBehavior[], id: string, enabled: boolean) {
  return behaviors.map((behavior) => (behavior.id === id ? { ...behavior, enabled } : behavior))
}

export function intensity(behavior: LlmBehavior): Intensity {
  return behavior.intensity ?? "full"
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function isBehavior(value: unknown): value is LlmBehavior {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    value.id.length > 0 &&
    typeof value.name === "string" &&
    typeof value.description === "string" &&
    typeof value.instructions === "string" &&
    typeof value.enabled === "boolean"
  )
}

function normalize(behavior: LlmBehavior): LlmBehavior {
  const level = INTENSITIES.find((item) => item === behavior.intensity)
  return {
    id: behavior.id,
    name: behavior.name,
    description: behavior.description,
    instructions: behavior.instructions,
    enabled: behavior.enabled,
    ...(behavior.id === CAVEMAN_ID ? { intensity: level ?? "full" } : {}),
  }
}
