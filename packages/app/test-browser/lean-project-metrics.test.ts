import { expect, test } from "bun:test"
import { createComponent, createRoot, createMemo, createStore, decision, render, savedLeanPart } from "./lean-project-metrics.test-helper"
import type { Config, Part } from "@orchestra/sdk/v2/client"

const panel = await import("@/components/session/lean-project-metrics")
const { createLeanSettingsController } = await import("@/components/settings-v2/general-controllers")
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
    }), () => true),
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
      metadata: { lean: decision(messageID, { owner: { projectID: "native-repo", location: "/repo", sessionID, callID: messageID } }) }, time: { start: 1, end: 2 },
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
    id, directory: "/repo",
    projectID: id === "foreign" ? "other-repo" : "native-repo",
    ...(id === "one" ? { revert: { messageID: "m2" } } : {}),
  }
  expect(panel.collectLeanProjectRecords(data, owner).map((record) => LeanMetrics.decode(record)?.owner.callID)).toEqual(["m1", "m3"])
  expect(panel.collectLeanProjectRecords({ ...data, project: "" }, owner)).toEqual([])
})

test("revert visibility uses loaded message/part order and fails closed on missing boundaries", () => {
  const message = (id: string) => ({ id, sessionID: "one" })
  const part = (messageID: string, id: string) => ({ ...savedLeanPart(messageID, "one", id, decision(id)), id })
  const data = {
    project: "native-repo", message: { one: [message("z-before"), message("a-boundary"), message("0-after")] },
    part: { "z-before": [part("z-before", "before")], "a-boundary": [part("a-boundary", "z-prefix"), part("a-boundary", "a-cut"), part("a-boundary", "0-later")], "0-after": [part("0-after", "after")] },
  }
  const collect = (revert?: { messageID: string; partID?: string }) => panel.collectLeanProjectRecords(data,
    () => ({ id: "one", directory: "/repo", projectID: "native-repo", revert })).map((record) => record.owner.callID)
  expect(collect()).toEqual(["before", "z-prefix", "a-cut", "0-later", "after"])
  expect(collect({ messageID: "a-boundary" })).toEqual(["before"])
  expect(collect({ messageID: "a-boundary", partID: "a-cut" })).toEqual(["before", "z-prefix"])
  expect(collect({ messageID: "absent" })).toEqual([])
  expect(collect({ messageID: "a-boundary", partID: "absent" })).toEqual(["before"])
})

test("saved metric owners bind native session/part placement and nested Solid changes reach repository DOM", () => {
  const good = decision("good")
  const worktree = decision("worktree", { owner: { ...good.owner, sessionID: "two", location: "/repo-worktree", callID: "worktree" } })
  const forged = Object.entries({
    project: { projectID: "foreign-repo" }, session: { sessionID: "foreign-session" },
    call: { callID: "foreign-call" }, location: { location: "/foreign-directory" },
  }).map(([id, patch]) => [id, decision(id, { owner: { ...good.owner, callID: id, ...patch } })] as const)
  const invalid = [...forged, ["missing-owner", { ...good, owner: undefined }], ["missing-metric", undefined]] as const
  for (const [, metric] of forged) expect(LeanMetrics.decode(metric)).toBeDefined()
  const [data, setData] = createStore({
    project: "native-repo",
    session: { one: { id: "one", projectID: "native-repo", directory: "/repo" }, two: { id: "two", projectID: "native-repo", directory: "/repo-worktree" } },
    message: { one: [{ id: "good", sessionID: "one" }, ...invalid.map(([id]) => ({ id, sessionID: "one" }))], two: [{ id: "worktree", sessionID: "two" }] },
    part: { good: [savedLeanPart("good", "one", "good", good)], worktree: [savedLeanPart("worktree", "two", "worktree", worktree)],
      ...Object.fromEntries(invalid.map(([id, metric]) => [id, [savedLeanPart(id, "one", id, metric)]])) },
  })
  const owned = createRoot((dispose) => ({ dispose, records: createMemo(() => panel.collectLeanProjectRecords(data, (id) => data.session[id as "one" | "two"])) }))
  const host = document.createElement("div")
  const dispose = render(() => createComponent(PlatformProvider, {
    value: { platform: "web", openExternal() {}, async restart() {}, async notify() {} },
    get children() { return createComponent(LanguageProvider, {
      locale: "en",
      get children() {
        useLanguage().setLocale("en")
        return createComponent(panel.LeanProjectMetrics, { projectID: "native-repo", coverage: "loaded-history", get records() { return owned.records() } })
      },
    }) },
  }), host)
  const value = (label: string) => [...host.querySelectorAll("dt")].find((dt) => dt.textContent === label)?.nextElementSibling?.textContent
  try {
    expect(value("Observed calls")).toBe("2")
    expect(owned.records().map((record) => LeanMetrics.decode(record)?.owner.callID)).toEqual(["good", "worktree"])
    expect(value("Bytes saved (UTF-8)")).toBe("16")
    setData("part", "good", 0, "state", "metadata", "lean", "owner", "callID", "invented")
    expect(value("Observed calls")).toBe("1")
    setData("part", "good", 0, "state", "metadata", "lean", "owner", "callID", "good")
    expect(value("Observed calls")).toBe("2")
    setData("part", "good", 0, "state", "metadata", "lean", "bytes", "saved", 9)
    expect(value("Observed calls")).toBe("1")
    setData("part", "good", 0, "state", "metadata", "lean", "bytes", "before", 13)
    expect(value("Bytes saved (UTF-8)")).toBe("17")
    setData("session", "two", "directory", "/moved-worktree")
    expect(value("Observed calls")).toBe("1")
    setData("part", "worktree", 0, "state", "metadata", "lean", "owner", "location", "/moved-worktree")
    expect(value("Observed calls")).toBe("2")
    setData("session", "one", "id", "wrong-session")
    expect(value("Observed calls")).toBe("1")
  } finally { dispose(); owned.dispose() }
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
    const rows = (key: keyof typeof dict) => [...group(key)!.querySelectorAll("dt")].map((dt) => [dt.textContent, dt.nextElementSibling?.textContent?.match(/-?\d+/g)])
    expect(rows("lean.filterProfiles")).toEqual([["cargo", ["1", "8", "2", "1"]]])
    expect(rows("lean.orchestraProfiles")).toEqual([["native", ["1", "8", "2", "1"]]])
    expect(rows("lean.models")).toEqual([['["provider","model"]', ["3", "9", "-8", "2"]]])
    expect(rows("lean.reasons")).toEqual([["reduced", ["1"]], ["normalized", ["1"]], ["disabled", ["1"]]])
    setProps("records", [...records, first, JSON.parse(JSON.stringify(negative))])
    for (const [key, count] of Object.entries(expected)) expect(value(key as keyof typeof dict)).toBe(count)
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
    }), () => true),
  }))
  try {
    await expect(owned.lean.set(true)).rejects.toBe(failure)
    expect(owned.lean.enabled()).toBe(false)
    expect(owned.lean.failed()).toBe(true)
    expect(owned.lean.pending()).toBe(false)
    expect(calls).toHaveLength(1)
  } finally { owned.dispose() }
})
