import { describe, expect, test } from "bun:test"
import { dict } from "../i18n/en"
import { ORCHESTRA_COPY } from "../i18n/orchestra"
import { breadcrumbLabel, isWip, navigation } from "./navigation"

const copy: Record<string, string> = { ...dict, ...ORCHESTRA_COPY }
const crumb = (route: Parameters<typeof breadcrumbLabel>[0]) => copy[breadcrumbLabel(route)]

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
    expect(crumb({ type: "chapter", chapter: "actions" })).toBe("Actions")
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
      "Actions",
      "Schedule",
      ".env",
      "Providers",
      "Shortcuts",
    ])
  })

  test("falls back to home for an unknown chapter and resolves every navigation chapter", () => {
    expect(crumb({ type: "chapter", chapter: "missing" })).toBe("Home")
    for (const item of navigation.filter((entry) => entry.chapter))
      expect(crumb({ type: "chapter", chapter: item.id })).toBeString()
  })
})

test("marks exactly the owner's revisit-before-production screens as WIP", () => {
  expect(navigation.filter((item) => isWip(item.id)).map((item) => item.id)).toEqual([
    "board",
    "agents",
    "mcp",
    "cicd",
    "env",
    "workspaces",
  ])
  expect(isWip("missing")).toBe(false)
})
