import { describe, expect, test } from "bun:test"
import { availableAbilities, createAbilityRegistry, type AbilityDescriptor } from "../../src/maestro/ability-registry"

const descriptors: readonly AbilityDescriptor[] = [
  {
    id: "atlas",
    summary: "Build project artifacts.",
    requiredConfig: ["build.enabled"],
    allowedSeats: ["builder"],
    tools: ["shell"],
  },
  {
    id: "github",
    summary: "Review proposed changes.",
    requiredConfig: [],
    allowedSeats: ["reviewer"],
    tools: [],
  },
]

describe("Maestro ability registry", () => {
  test("sorts abilities by id and returns metadata without granting tools", () => {
    const registry = createAbilityRegistry(descriptors)

    expect(
      availableAbilities(registry, {
        seat: "builder",
        enabledConfig: ["build.enabled"],
        availableDependencies: ["shell"],
      }),
    ).toEqual([
      { id: "atlas", summary: "Build project artifacts.", available: true },
      { id: "github", summary: "Review proposed changes.", available: false, reason: "seat-not-allowed" },
    ])
  })

  test("reports each unavailable condition with stable reason", () => {
    const registry = createAbilityRegistry(descriptors)

    expect(
      availableAbilities(registry, {
        seat: "other",
        enabledConfig: ["build.enabled"],
        availableDependencies: ["shell"],
      })[0],
    ).toEqual({ id: "atlas", summary: "Build project artifacts.", available: false, reason: "seat-not-allowed" })
    expect(
      availableAbilities(registry, {
        seat: "builder",
        enabledConfig: [],
        availableDependencies: ["shell"],
      })[0],
    ).toEqual({
      id: "atlas",
      summary: "Build project artifacts.",
      available: false,
      reason: "missing-required-config",
    })
    expect(
      availableAbilities(registry, {
        seat: "builder",
        enabledConfig: ["build.enabled"],
        availableDependencies: [],
      })[0],
    ).toEqual({
      id: "atlas",
      summary: "Build project artifacts.",
      available: false,
      reason: "missing-required-dependency",
    })
  })

  test("rejects empty and duplicate descriptor data", () => {
    const invalid = (descriptor: AbilityDescriptor) => expect(() => createAbilityRegistry([descriptor])).toThrow()
    invalid({ ...descriptors[0], id: "" })
    invalid({ ...descriptors[0], summary: " " })
    invalid({ ...descriptors[0], allowedSeats: [] })
    invalid({ ...descriptors[0], requiredConfig: [" "] })
    invalid({ ...descriptors[0], allowedSeats: [" "] })
    invalid({ ...descriptors[0], tools: [" "] })
    invalid({ ...descriptors[0], requiredConfig: ["build.enabled", "build.enabled"] })
    invalid({ ...descriptors[0], allowedSeats: ["builder", "builder"] })
    invalid({ ...descriptors[0], tools: ["shell", "shell"] })
    expect(() => createAbilityRegistry([descriptors[0], { ...descriptors[0] }])).toThrow()
  })

  test("rejects unknown built-in ability id", () => {
    expect(() => createAbilityRegistry([{ ...descriptors[0], id: "build" }])).toThrow()
  })

  test("mutation probe: removing seat guard makes test red", () => {
    expect(
      availableAbilities(createAbilityRegistry(descriptors), {
        seat: "reviewer",
        enabledConfig: ["build.enabled"],
        availableDependencies: ["shell"],
      })[0],
    ).toEqual({ id: "atlas", summary: "Build project artifacts.", available: false, reason: "seat-not-allowed" })
  })

  test("mutation probe: removing blank-entry guard makes test red", () => {
    expect(() => createAbilityRegistry([{ ...descriptors[0], tools: [" "] }])).toThrow()
  })

  test("mutation probe: removing built-in whitelist makes test red", () => {
    expect(createAbilityRegistry([descriptors[0]]).abilities).toHaveLength(1)
  })
})
