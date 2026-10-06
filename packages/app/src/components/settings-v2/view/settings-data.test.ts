import { describe, expect, test } from "bun:test"
import {
  contextLabel,
  permissionAction,
  permissionLock,
  permissionMap,
  permissionWrite,
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

  test("the last matching rule wins, in key order, as on the server", () => {
    expect(permissionAction({ "*": "deny", bash: "ask" }, "bash")).toBe("ask")
    expect(permissionAction({ bash: "ask", "*": "deny" }, "bash")).toBe("deny")
    expect(permissionAction({ "*": "deny", bash: "ask" }, "read")).toBe("deny")
    expect(permissionAction({ "*": "deny" }, "doom_loop")).toBe("deny")
    expect(permissionAction({ "web*": "deny" }, "webfetch")).toBe("deny")
    expect(permissionAction({ "web*": "deny" }, "bash")).toBe("allow")
  })

  test('a string config is a wildcard, and only a rule\'s "*" pattern sets the default', () => {
    expect(permissionAction("ask", "edit")).toBe("ask")
    expect(permissionAction({ read: { "*": "deny", "*.md": "allow" } }, "read")).toBe("deny")
    expect(permissionAction({ read: { "*.env": "ask" } }, "read")).toBe("allow")
    expect(permissionAction({ read: { "*.env": "deny", "*": "ask" } }, "read")).toBe("ask")
  })

  test("invalid values are ignored", () => {
    expect(permissionMap({ bash: 3, read: "allow", list: ["x"] })).toEqual({ read: "allow" })
    expect(permissionAction({ bash: "maybe" }, "bash")).toBe("allow")
    expect(permissionAction({ bash: { "*": "maybe" } }, "bash")).toBe("allow")
  })
})

describe("permission writes", () => {
  test("sets a plain action in place and appends new tools", () => {
    const result = permissionWrite({ "*": "ask", read: "allow" }, "bash", "deny")
    expect(result).toEqual({ next: { "*": "ask", read: "allow", bash: "deny" } })
    expect(Object.keys("next" in result ? result.next : {})).toEqual(["*", "read", "bash"])
  })

  test('changes the existing "*" of a patterned rule in place, keeping its patterns after it', () => {
    const result = permissionWrite({ read: { "*": "allow", "*.env": "deny" } }, "read", "ask")
    expect(result).toEqual({ next: { read: { "*": "ask", "*.env": "deny" } } })
    expect(Object.keys("next" in result ? result.next.read : {})).toEqual(["*", "*.env"])
  })

  test('refuses to add "*" to a patterned rule, because the server would place it after the patterns', () => {
    expect(permissionWrite({ read: { "*.env": "deny" } }, "read", "allow")).toEqual({ locked: "patterns" })
    expect(permissionLock({ read: { "*.env": "deny" } }, "read")).toBe("patterns")
    expect(permissionWrite({ read: {} }, "read", "deny")).toEqual({ next: { read: { "*": "deny" } } })
  })

  test("refuses a write that a later wildcard rule would override", () => {
    expect(permissionWrite({ bash: "ask", "*": "deny" }, "bash", "allow")).toEqual({ locked: "shadowed" })
    expect(permissionLock({ bash: "ask", "*": "deny" }, "bash")).toBe("shadowed")
    expect(permissionLock({ "*": "deny", bash: "ask" }, "bash")).toBeUndefined()
    expect(permissionLock({ bash: "ask", "*": "deny" }, "read")).toBeUndefined()
  })

  test("a string config becomes a wildcard rule", () => {
    expect(permissionWrite("ask", "edit", "allow")).toEqual({ next: { "*": "ask", edit: "allow" } })
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
