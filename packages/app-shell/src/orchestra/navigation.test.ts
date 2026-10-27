import { describe, expect, test } from "bun:test"
import { dict } from "../i18n/en"
import { ORCHESTRA_COPY } from "../i18n/orchestra"
import {
  advancedNavigation,
  breadcrumbLabel,
  isWip,
  navigation,
  primaryNavigation,
  settingsNavigation,
} from "./navigation"

const copy: Record<string, string> = { ...dict, ...ORCHESTRA_COPY }
const crumb = (route: Parameters<typeof breadcrumbLabel>[0]) => copy[breadcrumbLabel(route)]
const ids = (items: readonly { id: string }[]) => items.map((item) => item.id)

test("shows five primary items, then one Advanced group, with Settings last", () => {
  expect(ids(primaryNavigation)).toEqual(["home", "chat", "board", "agents", "cicd"])
  expect(ids(advancedNavigation)).toEqual([
    "maestro",
    "flight-engineer",
    "workflows",
    "atlas",
    "mcp",
    "integrations",
    "skills",
    "plugins",
    "hooks",
    "lean",
    "schedule",
    "env",
    "dock",
    "workspaces",
    "search",
  ])
  expect(ids(settingsNavigation)).toEqual(["settings"])
  expect(ids(navigation)).toEqual([...ids(primaryNavigation), ...ids(advancedNavigation), ...ids(settingsNavigation)])
})

test("lists every destination once and leaves Providers and Shortcuts to Settings", () => {
  expect(new Set(ids(navigation)).size).toBe(navigation.length)
  expect(ids(navigation)).not.toContain("providers")
  expect(ids(navigation)).not.toContain("shortcuts")
  // Their routes still open a page, so their breadcrumbs keep the Settings names.
  expect(crumb({ type: "chapter", chapter: "providers" })).toBe("Providers")
  expect(crumb({ type: "chapter", chapter: "shortcuts" })).toBe("Shortcuts")
})

describe("breadcrumbLabel", () => {
  test("names built-in views in Title Case", () => {
    expect(crumb({ type: "home" })).toBe("Home")
    expect(crumb({ type: "session", sessionId: "ses_1" })).toBe("Home")
    expect(crumb({ type: "draft", draftID: "draft_1" })).toBe("Home")
    expect(crumb({ type: "dir-new-sesssion", dir: "/repo", dirBase64: "L3JlcG8" })).toBe("Home")
    expect(crumb({ type: "chapter", chapter: "agents" })).toBe("Agents")
    expect(crumb({ type: "chapter", chapter: "dock" })).toBe("MCP Dock")
    expect(crumb({ type: "chapter", chapter: "workspaces" })).toBe("Workspaces")
    expect(crumb({ type: "chapter", chapter: "settings" })).toBe("Settings")
    expect(crumb({ type: "chapter", chapter: "actions" })).toBe("Checks")
  })

  test("names capability pages by their reference page title", () => {
    expect(
      ["mcp", "skills", "plugins", "workflows", "hooks", "cicd", "schedule", "env", "providers", "shortcuts"].map(
        (chapter) => crumb({ type: "chapter", chapter }),
      ),
    ).toEqual([
      "MCP",
      "Skills",
      "Plugins",
      "Workflows",
      "Hooks",
      "Checks",
      "Schedule",
      ".env",
      "Providers",
      "Shortcuts",
    ])
  })

  test("falls back to home for an unknown chapter and resolves every navigation destination", () => {
    expect(crumb({ type: "chapter", chapter: "missing" })).toBe("Home")
    for (const item of navigation) expect(crumb({ type: "chapter", chapter: item.id })).toBeString()
  })
})

test("marks exactly the owner's revisit-before-production screens as WIP", () => {
  expect(navigation.filter((item) => isWip(item.id)).map((item) => item.id)).toEqual([
    "board",
    "agents",
    "cicd",
    "mcp",
    "env",
    "workspaces",
  ])
  expect(isWip("missing")).toBe(false)
})
