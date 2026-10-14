import { describe, expect, test } from "bun:test"
import { clearPending, modelKey, pendingPolicy, pendingRules, pendingSelection, pendingSnapshot, togglePending } from "./draft-subagent-models"

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

  test("controlled changes are idempotent and preserve slash IDs until explicitly cleared", () => {
    clearPending(DIR)
    expect(togglePending(DIR, "openrouter", "team/model", true)).toBe(true)
    expect(togglePending(DIR, "openrouter", "team/model", true)).toBe(true)
    expect(pendingRules(DIR)).toEqual([
      { permission: "task", pattern: "*/*", action: "deny" },
      { permission: "task", pattern: "openrouter/team/model", action: "allow" },
    ])
    expect(pendingRules(DIR).at(-1)?.pattern).toBe("openrouter/team/model")
    expect(togglePending(DIR, "openrouter", "team/model", false)).toBe(false)
    expect(togglePending(DIR, "openrouter", "team/model", false)).toBe(false)
    expect(pendingRules(DIR)).toEqual([{ permission: "task", pattern: "*/*", action: "deny" }])
    clearPending(DIR)
  })

  test("same-policy and inheritance ABA require the exact latest revision", () => {
    const key = `${DIR}/aba`
    const initial = pendingSnapshot(key)
    clearPending(key)
    togglePending(key, "provider", "model", true)
    const first = pendingSnapshot(key)
    clearPending(key)
    togglePending(key, "provider", "model", true)
    const second = pendingSnapshot(key)
    expect(second.policy).toEqual(first.policy)
    expect(second.revision).toBeGreaterThan(first.revision)
    expect(clearPending(key, first.revision)).toBe(false)
    clearPending(key)
    const inherited = pendingSnapshot(key)
    expect(inherited.policy).toEqual(initial.policy)
    expect(inherited.revision).toBeGreaterThan(second.revision)
    expect(clearPending(key, initial.revision)).toBe(false)
    expect(clearPending(key, inherited.revision)).toBe(true)
  })

  test("caller mutation cannot edit pending selections or policy snapshots", () => {
    const key = `${DIR}/copies`
    togglePending(key, "provider", "model", true)
    pendingSelection(key).clear()
    const snapshot = pendingSnapshot(key)
    if (snapshot.policy.mode !== "allowlist") throw new Error("Missing explicit policy")
    snapshot.policy.models[0].id = "mutated"
    expect(pendingPolicy(key)).toEqual({ mode: "allowlist", models: [{ providerID: "provider", id: "model" }] })
    clearPending(key, snapshot.revision)
  })
})
