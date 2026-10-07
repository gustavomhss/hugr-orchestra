import { describe, expect, test } from "bun:test"
import { abilityDescriptors } from "../../src/maestro/ability-descriptors"
import { availableAbilities, createAbilityRegistry } from "../../src/maestro/ability-registry"

describe("Maestro ability descriptors", () => {
  test("declares exact core ability metadata", () => {
    expect(abilityDescriptors.map((descriptor) => descriptor.id)).toEqual([
      "repository",
      "github",
      "tests",
      "ci",
      "relay",
      "atlas",
    ])
    expect(abilityDescriptors.map((descriptor) => descriptor.requiredConfig)).toEqual([
      ["workspace"],
      ["project-config"],
      ["verification-plan"],
      ["github-project"],
      ["task-reservation"],
      ["atlas-provider"],
    ])
    expect(abilityDescriptors.map((descriptor) => descriptor.allowedSeats)).toEqual([
      ["maestro", "backend", "patty", "rosie"],
      ["maestro"],
      ["maestro", "backend", "lucy"],
      ["maestro"],
      ["maestro"],
      ["maestro", "jimmy"],
    ])
    expect(abilityDescriptors.map((descriptor) => descriptor.phases)).toEqual([
      ["slice", "delegate"],
      ["reconcile", "close"],
      ["verify"],
      ["verify"],
      ["delegate"],
      ["ground", "assemble-context"],
    ])
    expect(abilityDescriptors.map((descriptor) => descriptor.tools)).toEqual([[], [], [], [], [], []])
    expect(abilityDescriptors.every((descriptor) => descriptor.summary.length > 0)).toBe(true)
    expect(abilityDescriptors.every((descriptor) => descriptor.unavailableReason.length > 0)).toBe(true)
  })

  test("reports availability for every descriptor", () => {
    const registry = createAbilityRegistry(abilityDescriptors)

    abilityDescriptors.forEach((descriptor) => {
      expect(
        availableAbilities(registry, {
          seat: descriptor.allowedSeats[0]!,
          enabledConfig: descriptor.requiredConfig,
          availableDependencies: [],
        }).find((ability) => ability.id === descriptor.id),
      ).toEqual({ id: descriptor.id, summary: descriptor.summary, available: true })
      expect(
        availableAbilities(registry, {
          seat: descriptor.allowedSeats[0]!,
          enabledConfig: [],
          availableDependencies: [],
        }).find((ability) => ability.id === descriptor.id),
      ).toEqual({ id: descriptor.id, summary: descriptor.summary, available: false, reason: "missing-required-config" })
      expect(
        availableAbilities(registry, {
          seat: "unassigned",
          enabledConfig: descriptor.requiredConfig,
          availableDependencies: [],
        }).find((ability) => ability.id === descriptor.id),
      ).toEqual({ id: descriptor.id, summary: descriptor.summary, available: false, reason: "seat-not-allowed" })
    })
  })

  test("mutation probe: removing atlas makes catalog test red", () => {
    expect(abilityDescriptors.map((descriptor) => descriptor.id)).toContain("atlas")
  })

  test("mutation probe: removing required-config check makes test red", () => {
    expect(
      availableAbilities(createAbilityRegistry(abilityDescriptors), {
        seat: "maestro",
        enabledConfig: [],
        availableDependencies: [],
      }).find((ability) => ability.id === "repository"),
    ).toEqual({
      id: "repository",
      summary: "Manage repository state.",
      available: false,
      reason: "missing-required-config",
    })
  })
})
