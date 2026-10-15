export type AbilityDescriptor = {
  id: string
  summary: string
  requiredConfig: readonly string[]
  allowedSeats: readonly string[]
  tools: readonly string[]
}

export type AbilityRegistry = {
  readonly abilities: readonly AbilityDescriptor[]
}

export type AbilityAvailability =
  | { id: string; summary: string; available: true }
  | {
      id: string
      summary: string
      available: false
      reason: "seat-not-allowed" | "missing-required-config" | "missing-required-dependency"
    }

const builtInAbilityIDs = new Set(["repository", "github", "tests", "ci", "relay", "atlas"])

export function createAbilityRegistry(descriptors: readonly AbilityDescriptor[]): AbilityRegistry {
  const ids = new Set<string>()
  const abilities = descriptors.map((descriptor) => {
    if (!text(descriptor.id)) throw new Error("Ability descriptor id must be nonempty")
    if (!builtInAbilityIDs.has(descriptor.id)) throw new Error(`Ability descriptor id is unknown: ${descriptor.id}`)
    if (!text(descriptor.summary)) throw new Error("Ability descriptor summary must be nonempty")
    if (ids.has(descriptor.id)) throw new Error(`Ability descriptor id must be unique: ${descriptor.id}`)
    if (descriptor.allowedSeats.length === 0)
      throw new Error(`Ability descriptor allowedSeats must be nonempty: ${descriptor.id}`)
    if (!allText(descriptor.requiredConfig)) {
      throw new Error(`Ability descriptor requiredConfig entries must be nonempty: ${descriptor.id}`)
    }
    if (!allText(descriptor.allowedSeats)) {
      throw new Error(`Ability descriptor allowedSeats entries must be nonempty: ${descriptor.id}`)
    }
    if (!allText(descriptor.tools))
      throw new Error(`Ability descriptor tools entries must be nonempty: ${descriptor.id}`)
    if (hasDuplicate(descriptor.requiredConfig)) {
      throw new Error(`Ability descriptor requiredConfig must not contain duplicates: ${descriptor.id}`)
    }
    if (hasDuplicate(descriptor.allowedSeats)) {
      throw new Error(`Ability descriptor allowedSeats must not contain duplicates: ${descriptor.id}`)
    }
    if (hasDuplicate(descriptor.tools))
      throw new Error(`Ability descriptor tools must not contain duplicates: ${descriptor.id}`)
    ids.add(descriptor.id)
    return Object.freeze({
      ...descriptor,
      requiredConfig: Object.freeze([...descriptor.requiredConfig]),
      allowedSeats: Object.freeze([...descriptor.allowedSeats]),
      tools: Object.freeze([...descriptor.tools]),
    })
  })
  return Object.freeze({ abilities: Object.freeze(abilities.sort((left, right) => left.id.localeCompare(right.id))) })
}

export function availableAbilities(
  registry: AbilityRegistry,
  input: {
    enabledConfig: readonly string[]
    availableDependencies: readonly string[]
    seat: string
  },
): AbilityAvailability[] {
  const enabledConfig = new Set(input.enabledConfig)
  const availableDependencies = new Set(input.availableDependencies)
  return registry.abilities.map((ability) => {
    if (!ability.allowedSeats.includes(input.seat)) {
      return { id: ability.id, summary: ability.summary, available: false, reason: "seat-not-allowed" }
    }
    if (ability.requiredConfig.some((config) => !enabledConfig.has(config))) {
      return { id: ability.id, summary: ability.summary, available: false, reason: "missing-required-config" }
    }
    if (ability.tools.some((tool) => !availableDependencies.has(tool))) {
      return { id: ability.id, summary: ability.summary, available: false, reason: "missing-required-dependency" }
    }
    return { id: ability.id, summary: ability.summary, available: true }
  })
}

function text(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0
}

function allText(values: readonly string[]) {
  return values.every(text)
}

function hasDuplicate(values: readonly string[]) {
  return new Set(values).size !== values.length
}
