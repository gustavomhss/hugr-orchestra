import { expect, test } from "bun:test"
import { createComponent, createRoot, createStore, render } from "./lean-project-metrics.test-helper"
import type { Config, Part } from "@orchestra/sdk/v2/client"

const panel = await import("./lean-project-metrics")
const { createLeanSettingsController } = await import("../settings-v2/general-controllers")
const { LanguageProvider, useLanguage } = await import("@/context/language")
const { PlatformProvider } = await import("@/context/platform")

test("Lean reads backend false and preserves sibling limits in one awaited patch", async () => {
  const [data, setData] = createStore<{ config: Config }>({
    config: { tool_output: { max_lines: 42, max_bytes: 900, lean: { enabled: false } } },
  })
  const calls: Config[] = []
  const owned = createRoot((dispose) => ({
    dispose,
    lean: createLeanSettingsController(() => ({
      data,
      updateConfig: async (patch) => {
        calls.push(patch)
      },
    })),
  }))
  try {
    expect(owned.lean.enabled()).toBe(false)
    await owned.lean.set(true)
    expect(calls).toEqual([{ tool_output: { max_lines: 42, max_bytes: 900, lean: { enabled: true } } }])
    // Successful transport alone is not authoritative state; refetched backend config is.
    expect(owned.lean.enabled()).toBe(false)
    setData("config", "tool_output", "lean", "enabled", true)
    expect(owned.lean.enabled()).toBe(true)
  } finally { owned.dispose() }
})

test("loaded repository selection excludes foreign, unknown, unfinished, orphan and reverted tool parts", () => {
  const message = (id: string, sessionID: string) => ({ id, sessionID })
  const part = (messageID: string, sessionID: string): Part => ({
    id: `part-${messageID}`, messageID, sessionID, type: "tool", callID: messageID, tool: "bash",
    state: {
      status: "completed", input: {}, output: "", title: "",
      metadata: { lean: messageID }, time: { start: 1, end: 2 },
    },
  })
  const data = {
    project: "native-repo",
    message: {
      one: [message("m1", "one"), message("m2", "one")], two: [message("m3", "two")],
      foreign: [message("m4", "foreign")], unknown: [message("m5", "unknown")],
    },
    part: {
      m1: [part("m1", "one"), { ...part("m1", "one"), state: { status: "running" as const, input: {}, time: { start: 1 } } }],
      m2: [part("m2", "one")], m3: [part("m3", "two")], m4: [part("m4", "foreign")],
      m5: [part("m5", "unknown")], orphan: [part("orphan", "one")],
    },
  }
  const owner = (id: string) => id === "unknown" ? undefined : {
    projectID: id === "foreign" ? "other-repo" : "native-repo",
    ...(id === "one" ? { revert: { messageID: "m2" } } : {}),
  }
  expect(panel.collectLeanProjectRecords(data, owner)).toEqual(["m1", "m3"])
  expect(panel.collectLeanProjectRecords(data, owner)).toEqual(["m1", "m3"])
  expect(panel.collectLeanProjectRecords({ ...data, project: "" }, owner)).toEqual([])
})

for (const locale of ["en", "br"] as const) test(`real Solid DOM labels empty loaded history and unavailable estimates/latency (${locale})`, async () => {
  const host = document.createElement("div")
  const dispose = render(() => createComponent(PlatformProvider, {
    value: { platform: "web", openExternal() {}, async restart() {}, async notify() {} },
    get children() { return createComponent(LanguageProvider, {
      locale,
      get children() {
        useLanguage().setLocale(locale)
        return createComponent(panel.LeanProjectMetrics, { projectID: "native-repo", records: [], coverage: "loaded-history" })
      },
    }) },
  }), host)
  try {
    const { dict } = await import(locale === "en" ? "@/i18n/en" : "@/i18n/br")
    await Bun.sleep(20)
    expect(host.querySelector("section")?.getAttribute("aria-label")).toBe(dict["lean.project.title"])
    expect(host.textContent).toContain("native-repo")
    expect(host.textContent).toContain(dict["lean.loadedHistory"])
    const value = (key: keyof typeof dict) => [...host.querySelectorAll("dt")].find((dt) => dt.textContent === dict[key])?.nextElementSibling?.textContent
    expect(value("lean.observed")).toBe("0")
    expect(value("lean.tokensSaved")).toBe(dict["lean.unavailable"])
    for (const key of ["lean.p50", "lean.p95", "lean.p99"] as const) expect(value(key)).toBe(dict["lean.unavailable"])
    expect(host.textContent).toContain(dict["lean.filterProfiles"])
    expect(host.textContent).toContain(dict["lean.orchestraProfiles"])
  } finally { dispose() }
})

test("Lean backend rejection remains visible, does not fake enabled state or retry", async () => {
  const failure = new Error("config write failed")
  const calls: Config[] = []
  const owned = createRoot((dispose) => ({
    dispose,
    lean: createLeanSettingsController(() => ({
      data: { config: { tool_output: { lean: { enabled: false } } } },
      updateConfig: async (patch) => {
        calls.push(patch)
        throw failure
      },
    })),
  }))
  try {
    await expect(owned.lean.set(true)).rejects.toBe(failure)
    expect(owned.lean.enabled()).toBe(false)
    expect(owned.lean.failed()).toBe(true)
    expect(owned.lean.pending()).toBe(false)
    expect(calls).toHaveLength(1)
  } finally { owned.dispose() }
})
