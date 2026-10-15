import { describe, expect, test } from "bun:test"
import { clearPending, modelKey, pendingRules, pendingSelection, togglePending } from "./draft-subagent-models"

const DIR = "/tmp/draft-test"

describe("draft subagent models", () => {
  test("toggle adds and removes selections", () => {
    clearPending(DIR)
    expect(togglePending(DIR, "openrouter", "x")).toBe(true)
    expect(pendingSelection(DIR).has(modelKey("openrouter", "x"))).toBe(true)
    expect(togglePending(DIR, "openrouter", "x")).toBe(false)
    expect(pendingSelection(DIR).size).toBe(0)
    clearPending(DIR)
  })

  test("pendingRules emits deny baseline plus allows", () => {
    clearPending(DIR)
    expect(pendingRules(DIR)).toEqual([])
    togglePending(DIR, "openrouter", "x")
    togglePending(DIR, "groq", "y")
    expect(pendingRules(DIR)).toEqual([
      { permission: "task", pattern: "*/*", action: "deny" },
      { permission: "task", pattern: "openrouter/x", action: "allow" },
      { permission: "task", pattern: "groq/y", action: "allow" },
    ])
    clearPending(DIR)
    expect(pendingRules(DIR)).toEqual([])
  })

  test("modelKey joins provider and model", () => {
    expect(modelKey("openrouter", "a/b")).toBe("openrouter/a/b")
  })
})
