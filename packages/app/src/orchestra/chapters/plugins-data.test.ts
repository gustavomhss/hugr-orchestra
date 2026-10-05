import { describe, expect, test } from "bun:test"
import {
  behaviorSystem,
  CAVEMAN_ID,
  defaultBehaviorState,
  filterBehaviors,
  removeBehavior,
  sanitizeBehaviorState,
  saveBehavior,
  toggleBehavior,
  type LlmBehavior,
} from "./plugins-data"

const custom: LlmBehavior = {
  id: "reviewer",
  name: "Reviewer",
  description: "Ask for evidence.",
  instructions: "Cite the file and line for every claim.",
  enabled: true,
}

describe("plugins data", () => {
  test("a new profile offers Caveman at full intensity, switched off", () => {
    const state = defaultBehaviorState()
    expect(state.behaviors.map((item) => [item.id, item.enabled, item.intensity])).toEqual([[CAVEMAN_ID, false, "full"]])
    expect(behaviorSystem(state.behaviors)).toBeUndefined()
  })

  test("only enabled behaviors reach the system text, with the selected Caveman intensity rule", () => {
    const caveman = { ...defaultBehaviorState().behaviors[0]!, enabled: true, intensity: "ultra" as const }
    const system = behaviorSystem([caveman, custom, { ...custom, id: "off", name: "Off", enabled: false }])
    expect(system).toContain("## Caveman (intensity: ultra)")
    expect(system).toContain("Respond terse like smart caveman. Preserve technical accuracy.")
    expect(system).toContain("one word when one word is enough")
    expect(system).not.toContain("Keep articles and full sentences")
    expect(system).toContain("## Reviewer\nCite the file and line for every claim.")
    expect(system).not.toContain("## Off")

    const lite = behaviorSystem([{ ...caveman, intensity: "lite" }])
    expect(lite).toContain("## Caveman (intensity: lite)")
    expect(lite).toContain("Keep articles and full sentences")
    expect(lite).not.toContain("one word when one word is enough")
  })

  test("an enabled custom behavior without instructions adds nothing", () => {
    expect(behaviorSystem([{ ...custom, instructions: "   " }])).toBeUndefined()
  })

  test("sanitizes stored state from browser storage", () => {
    expect(sanitizeBehaviorState("broken")).toEqual(defaultBehaviorState())
    expect(sanitizeBehaviorState({ behaviors: "nope" })).toEqual(defaultBehaviorState())
    expect(
      sanitizeBehaviorState({
        behaviors: [
          { ...custom, intensity: "ultra", extra: true },
          { id: CAVEMAN_ID, name: "Caveman", description: "", instructions: "", enabled: true, intensity: "loud" },
          { id: "", name: "Nameless", description: "", instructions: "", enabled: true },
          { id: "half", name: "Half" },
        ],
      }),
    ).toEqual({
      behaviors: [
        custom,
        { id: CAVEMAN_ID, name: "Caveman", description: "", instructions: "", enabled: true, intensity: "full" },
      ],
    })
    expect(sanitizeBehaviorState({ behaviors: [] })).toEqual({ behaviors: [] })
  })

  test("adds, replaces, toggles and removes behaviors by id", () => {
    const start = defaultBehaviorState().behaviors
    const added = saveBehavior(start, custom)
    expect(added.map((item) => item.id)).toEqual([CAVEMAN_ID, "reviewer"])
    const renamed = saveBehavior(added, { ...custom, name: "Evidence" })
    expect(renamed.map((item) => item.name)).toEqual(["Caveman", "Evidence"])
    expect(toggleBehavior(renamed, CAVEMAN_ID, true).map((item) => item.enabled)).toEqual([true, true])
    expect(removeBehavior(renamed, CAVEMAN_ID).map((item) => item.id)).toEqual(["reviewer"])
  })

  test("search matches the card's visible text", () => {
    const list = saveBehavior(defaultBehaviorState().behaviors, custom)
    expect(filterBehaviors(list, "  ").map((item) => item.id)).toEqual([CAVEMAN_ID, "reviewer"])
    expect(filterBehaviors(list, "FLUFF").map((item) => item.id)).toEqual([CAVEMAN_ID])
    expect(filterBehaviors(list, "custom").map((item) => item.id)).toEqual(["reviewer"])
    expect(filterBehaviors(list, "disabled").map((item) => item.id)).toEqual([CAVEMAN_ID])
    expect(filterBehaviors(list, "zzz")).toEqual([])
  })
})
