import { expect, test } from "bun:test"
import { createComponent, createRoot, createStore, decision, render } from "./lean-project-metrics.test-helper"
import type { Config, Part } from "@orchestra/sdk/v2/client"

const panel = await import("./lean-project-metrics")
const { createLeanSettingsController } = await import("../settings-v2/general-controllers")
const { LanguageProvider, useLanguage } = await import("@/context/language")
const { PlatformProvider } = await import("@/context/platform")
const { LeanMetrics } = await import("@orchestra/schema/lean-metrics")
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
    await owned.lean.set(false)
    expect(calls[1]).toEqual({ tool_output: { max_lines: 42, max_bytes: 900, lean: { enabled: false } } })
    expect(owned.lean.enabled()).toBe(true)
    setData("config", "tool_output", "lean", "enabled", false)
    expect(owned.lean.enabled()).toBe(false)
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
  expect(panel.collectLeanProjectRecords({ ...data, project: "" }, owner)).toEqual([])
})

for (const locale of ["en", "br"] as const) test(`real repository KPI DOM: scope, retries, signed estimates and unavailable summaries (${locale})`, async () => {
  const host = document.createElement("div")
  const [props, setProps] = createStore({ projectID: "native-repo", records: [] as readonly unknown[], coverage: "loaded-history" as const })
  const dispose = render(() => createComponent(PlatformProvider, {
    value: { platform: "web", openExternal() {}, async restart() {}, async notify() {} },
    get children() { return createComponent(LanguageProvider, {
      locale,
      get children() {
        useLanguage().setLocale(locale)
        return createComponent(panel.LeanProjectMetrics, props)
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
    const first = decision("first")
    const negative = decision("negative", { status: "normalized", reason: "normalized", orchestraProfile: undefined,
      filterProfile: undefined, bytes: { before: 80, after: 79, saved: 1 }, durationMs: 10,
      tokens: { kind: "estimated", counter: "chars-per-token-4", before: 10, after: 20, saved: -10 } })
    const disabled = decision("disabled", { eligible: false, status: "passthrough", reason: "disabled", durationMs: 20,
      producer: "unverified", orchestraProfile: undefined, filterProfile: undefined,
      bytes: { before: 4, after: 4, saved: 0 }, tokens: { kind: "unavailable" } })
    const foreign = decision("foreign", { owner: { ...first.owner, projectID: "foreign-repo" } })
    expect(LeanMetrics.decode(first)).toEqual(first)
    const records = [first, negative, disabled, foreign, { ...first, version: 2 }, JSON.parse(JSON.stringify(first))]
    setProps("records", records)
    const expected = { "lean.observed": "3", "lean.eligible": "2", "lean.applied": "2", "lean.bytesSaved": "9",
      "lean.tokensSaved": "-8", "lean.tokenCalls": "2", "lean.latencySamples": "3", "lean.p50": "10", "lean.p95": "20", "lean.p99": "20" }
    for (const [key, count] of Object.entries(expected)) expect(value(key as keyof typeof dict)).toBe(count)
    const group = (key: keyof typeof dict) => [...host.querySelectorAll("h4")].find((h) => h.textContent === dict[key])?.parentElement
    expect(group("lean.filterProfiles")?.querySelector("dt")?.textContent).toBe("cargo")
    expect(group("lean.orchestraProfiles")?.querySelectorAll("dt").length).toBe(1)
    expect(group("lean.orchestraProfiles")?.querySelector("dt")?.textContent).toBe("native")
    expect(group("lean.models")?.querySelector("dt")?.textContent).toBe('["provider","model"]')
    expect([...group("lean.reasons")!.querySelectorAll("dt")].map((dt) => dt.textContent)).toEqual(["reduced", "normalized", "disabled"])
    setProps("records", [...records, first, JSON.parse(JSON.stringify(negative))])
    expect(value("lean.bytesSaved")).toBe("9")
    setProps("records", [disabled])
    expect(value("lean.tokensSaved")).toBe(dict["lean.unavailable"])
    expect(value("lean.tokenCalls")).toBe("0")
    setProps("records", [decision("huge", { bytes: { before: Number.MAX_SAFE_INTEGER, after: 0, saved: Number.MAX_SAFE_INTEGER } }), first])
    expect(host.querySelector('[role="status"]')?.textContent).toBe(dict["lean.overflow"])
    expect(host.querySelectorAll("dd").length).toBe(0)
    setProps("projectID", "")
    expect(host.querySelector('[role="status"]')?.textContent).toBe(dict["lean.invalidScope"])
    expect(host.querySelectorAll("dd").length).toBe(0)
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
