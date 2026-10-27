import { describe, expect, test } from "bun:test"
import { resolveTemplate, translator } from "@solid-primitives/i18n"
import { WORKFLOWS_COPY } from "../../i18n/orchestra-chapters/workflows"
import type { RelayDocument } from "./client"
import { templateName, templateReason, templates } from "./templates"
import type { useRelayCopy } from "./ui"

type Translate = ReturnType<typeof useRelayCopy>["t"]
const t = translator(() => WORKFLOWS_COPY, resolveTemplate) as Translate

const shipped = (profile: string, overrides: Partial<RelayDocument>) =>
  ({
    id: `relay-${profile}`,
    name: `Relay · ${profile}`,
    description: "",
    nodes: [],
    meta: { relay: { profile } },
    runnable: true,
    ...overrides,
  }) as RelayDocument

describe("templates", () => {
  test("unavailable profiles stay in the list, after the runnable ones", () => {
    const list = templates([
      shipped("design", { runnable: false }),
      shipped("tdd_feature", {}),
      { id: "mine", name: "Mine", meta: {} } as RelayDocument,
    ])
    expect(list.map((document) => document.id)).toEqual(["relay-tdd_feature", "relay-design"])
  })

  test("a shipped profile has a human name", () => {
    expect(templateName(t, shipped("tdd_feature", {}))).toBe("Test-driven feature")
    expect(templateName(t, shipped("spec-decompose", { runnable: false }))).toBe(
      "Break a spec into work packages",
    )
  })

  test("a profile without a name keeps the one the server gave it", () => {
    expect(templateName(t, shipped("custom-profile", {}))).toBe("Relay · custom-profile")
  })

  test("an unavailable template renders its reason", () => {
    expect(templateReason(t, shipped("design", { runnable: false }))).toBe(
      "This profile checks its work with Relay tools that are not available yet. It can be read and edited, but it cannot run.",
    )
  })

  test("a runnable template has no reason", () => {
    expect(templateReason(t, shipped("wp-execute", {}))).toBeUndefined()
  })
})
