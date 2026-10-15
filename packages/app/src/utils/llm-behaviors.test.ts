import { describe, expect, test } from "bun:test"
import {
  behaviorCardText,
  behaviorInstructions,
  behaviorProfileDirectory,
  behaviorSystem,
  CAVEMAN_ID,
  defaultBehaviorState,
  filterBehaviors,
  removeBehavior,
  sanitizeBehaviorState,
  saveBehavior,
  toggleBehavior,
  type BehaviorCardLabels,
  type LlmBehavior,
} from "./llm-behaviors"

const custom: LlmBehavior = {
  id: "reviewer",
  name: "Reviewer",
  description: "Ask for evidence.",
  instructions: "Cite the file and line for every claim.",
  enabled: true,
}

const labels: BehaviorCardLabels = {
  kind: "LLM behavior",
  custom: "custom",
  configure: "Configure",
  status: (behavior) => (behavior.enabled ? "Active" : "Disabled"),
}

describe("LLM behaviors", () => {
  test("a new profile offers Caveman at full intensity, switched off", () => {
    const state = defaultBehaviorState()
    expect(state.behaviors.map((item) => [item.id, item.enabled, item.intensity])).toEqual([
      [CAVEMAN_ID, false, "full"],
    ])
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

  test("a V2 server receives each enabled behavior on its own, with the same text a V1 prompt carries", () => {
    const caveman = { ...defaultBehaviorState().behaviors[0]!, enabled: true, intensity: "ultra" as const }
    const active = behaviorInstructions([caveman, custom, { ...custom, id: "off", enabled: false }])
    expect(active.map((item) => [item.id, item.name])).toEqual([
      [CAVEMAN_ID, "Caveman (intensity: ultra)"],
      ["reviewer", "Reviewer"],
    ])
    expect(active[0]?.instructions).toStartWith("Respond terse like smart caveman. Preserve technical accuracy.\n")
    expect(active[0]?.instructions).toContain("one word when one word is enough")
    expect(active[1]?.instructions).toBe("Cite the file and line for every claim.")
    const system = behaviorSystem([caveman, custom])
    active.forEach((item) => expect(system).toContain(`## ${item.name}\n${item.instructions}`))
    expect(behaviorInstructions(defaultBehaviorState().behaviors)).toEqual([])
    expect(behaviorInstructions([{ ...custom, instructions: "  " }])).toEqual([])
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

  test("a card's text is what it shows, in reading order", () => {
    expect(behaviorCardText(defaultBehaviorState().behaviors[0]!, labels)).toBe(
      "Caveman Technical substance stays. Fluff goes. LLM behavior full Disabled Configure",
    )
    expect(behaviorCardText(custom, labels)).toBe("Reviewer Ask for evidence. LLM behavior custom Active Configure")
  })

  test("search filters on each card's shown text", () => {
    const list = saveBehavior(defaultBehaviorState().behaviors, custom)
    const ids = (query: string) => filterBehaviors(list, query, labels).map((item) => item.id)
    expect(ids("  ")).toEqual([CAVEMAN_ID, "reviewer"])
    expect(ids("FLUFF")).toEqual([CAVEMAN_ID])
    expect(ids("custom")).toEqual(["reviewer"])
    expect(ids("disabled")).toEqual([CAVEMAN_ID])
    expect(ids("llm behavior")).toEqual([CAVEMAN_ID, "reviewer"])
    expect(ids("configure")).toEqual([CAVEMAN_ID, "reviewer"])
    expect(ids("zzz")).toEqual([])
  })

  test("a sandbox or worktree directory resolves to the repository that owns it", () => {
    const projects = [
      { worktree: "/repo/main", sandboxes: ["/repo/.worktrees/feature"] },
      { worktree: "C:\\Work\\Other" },
    ]
    expect(behaviorProfileDirectory(projects, "/repo/main")).toBe("/repo/main")
    expect(behaviorProfileDirectory(projects, "/repo/main/")).toBe("/repo/main")
    expect(behaviorProfileDirectory(projects, "/repo/.worktrees/feature")).toBe("/repo/main")
    expect(behaviorProfileDirectory(projects, "C:/Work/Other")).toBe("C:\\Work\\Other")
    expect(behaviorProfileDirectory(projects, "/elsewhere")).toBe("/elsewhere")
    expect(behaviorProfileDirectory([], "/repo/.worktrees/feature")).toBe("/repo/.worktrees/feature")
  })
})
