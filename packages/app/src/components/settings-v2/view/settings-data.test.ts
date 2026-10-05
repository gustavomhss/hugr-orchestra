import { describe, expect, test } from "bun:test"
import {
  contextLabel,
  permissionAction,
  permissionMap,
  permissionUpdate,
  routeModel,
  settingsSection,
} from "./settings-data"

describe("settings sections", () => {
  test("accepts known sections and falls back to permissions", () => {
    expect(settingsSection("models")).toBe("models")
    expect(settingsSection("servers")).toBe("servers")
    expect(settingsSection("nope")).toBe("permissions")
    expect(settingsSection(undefined)).toBe("permissions")
  })
})

describe("permission defaults", () => {
  test("an empty config follows the server's built-in rules", () => {
    expect(permissionAction(undefined, "read")).toBe("allow")
    expect(permissionAction({}, "bash")).toBe("allow")
    expect(permissionAction({}, "doom_loop")).toBe("ask")
    expect(permissionAction({}, "external_directory")).toBe("ask")
  })

  test("a direct rule wins over the wildcard, which wins over built-ins", () => {
    const config = { "*": "deny", bash: "ask" }
    expect(permissionAction(config, "bash")).toBe("ask")
    expect(permissionAction(config, "read")).toBe("deny")
    expect(permissionAction(config, "doom_loop")).toBe("deny")
  })

  test("a string config is a wildcard and patterned rules use their default", () => {
    expect(permissionAction("ask", "edit")).toBe("ask")
    expect(permissionAction({ read: { "*": "deny", "*.md": "allow" } }, "read")).toBe("deny")
    expect(permissionAction({ read: { "*.env": "ask" } }, "read")).toBe("allow")
  })

  test("invalid values are ignored", () => {
    expect(permissionMap({ bash: 3, read: "allow", list: ["x"] })).toEqual({ read: "allow" })
    expect(permissionAction({ bash: "maybe" }, "bash")).toBe("allow")
  })
})

describe("permission updates", () => {
  test("sets a plain action and keeps other rules", () => {
    expect(permissionUpdate({ "*": "ask", read: "allow" }, "bash", "deny")).toEqual({
      "*": "ask",
      read: "allow",
      bash: "deny",
    })
  })

  test("keeps patterns and changes only the default of a patterned rule", () => {
    expect(permissionUpdate({ read: { "*.env": "ask", "*": "allow" } }, "read", "deny")).toEqual({
      read: { "*.env": "ask", "*": "deny" },
    })
  })

  test("a string config becomes a wildcard rule", () => {
    expect(permissionUpdate("ask", "edit", "allow")).toEqual({ "*": "ask", edit: "allow" })
  })
})

describe("context labels", () => {
  test("match the mock's notation", () => {
    expect(contextLabel(200_000)).toBe("200K")
    expect(contextLabel(400_000)).toBe("400K")
    expect(contextLabel(262_144)).toBe("256K")
    expect(contextLabel(1_000_000)).toBe("1M")
    expect(contextLabel(1_048_576)).toBe("1M")
    expect(contextLabel(128_500)).toBe("129K")
    expect(contextLabel(0)).toBeUndefined()
    expect(contextLabel(undefined)).toBeUndefined()
  })
})

describe("route for new turns", () => {
  const provider = { id: "openrouter", models: { "gpt-5": {}, "claude-sonnet-4": {} } }

  test("keeps the current model when the provider serves it", () => {
    expect(
      routeModel({
        provider,
        defaults: { openrouter: "gpt-5" },
        current: { providerID: "opencode", modelID: "claude-sonnet-4" },
      }),
    ).toBe("openrouter/claude-sonnet-4")
  })

  test("otherwise uses the provider default, then its first model", () => {
    expect(routeModel({ provider, defaults: { openrouter: "gpt-5" } })).toBe("openrouter/gpt-5")
    expect(routeModel({ provider, defaults: { openrouter: "missing" } })).toBe("openrouter/gpt-5")
    expect(routeModel({ provider: { id: "empty", models: {} }, defaults: {} })).toBeUndefined()
  })
})
