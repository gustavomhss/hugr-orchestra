import { describe, expect, test } from "bun:test"
import { createModelSelectorNavigation, matchesModelSearch } from "./dialog-select-model-search"

describe("matchesModelSearch", () => {
  test("matches model names across separators", () => {
    expect(matchesModelSearch("gpt 5", ["GPT-5.5"])).toBe(true)
    expect(matchesModelSearch("gpt-5", ["GPT-5.5"])).toBe(true)
    expect(matchesModelSearch("gpt5", ["GPT-5.5"])).toBe(true)
  })

  test("matches any searchable model field", () => {
    expect(matchesModelSearch("open ai", ["GPT-5.5", "gpt-5.5", "OpenAI"])).toBe(true)
    expect(matchesModelSearch("gpt 5", ["GPT-5.5", "gpt-5.5", "OpenAI"])).toBe(true)
  })

  test("does not match unrelated searches", () => {
    expect(matchesModelSearch("claude", ["GPT-5.5", "gpt-5.5", "OpenAI"])).toBe(false)
  })
})

test("keyboard selection follows rendered provider groups, including search and the manage action", () => {
  const state = {
    groups: [
      { items: [{ id: "z", name: "Zulu", provider: "anthropic" }] },
      {
        items: [
          { id: "a", name: "Alpha", provider: "openrouter" },
          { id: "b", name: "Beta", provider: "openrouter" },
        ],
      },
    ],
  }
  const navigation = createModelSelectorNavigation(
    () => state.groups,
    (item) => `${item.provider}:${item.id}`,
    "manage",
  )
  expect(navigation.keys()).toEqual(["anthropic:z", "openrouter:a", "openrouter:b", "manage"])
  expect(navigation.next("anthropic:z", 1)).toBe("openrouter:a")
  expect(navigation.find(navigation.next("openrouter:a", 1))?.name).toBe("Beta")
  expect(navigation.next("anthropic:z", -1)).toBe("manage")
  expect(navigation.next("manage", 1)).toBe("anthropic:z")
  state.groups = [{ items: [state.groups[1].items[1]] }]
  expect(navigation.keys()).toEqual(["openrouter:b", "manage"])
  expect(navigation.next("missing", 1)).toBe("openrouter:b")
  state.groups = []
  expect(navigation.keys()).toEqual(["manage"])
  expect(navigation.next("manage", 1)).toBe("manage")
})
