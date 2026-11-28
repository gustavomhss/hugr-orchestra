import { expect, test } from "bun:test"
import type { ActivityMonitor } from "@orchestra/schema/activity-monitor"
import { cachePath, mount, readPath, until } from "./activity-external-cache-fixture"

const alpha = { id: "cache-alpha-opaque", name: "Fixture Alpha", owner: "", unique: "not-collapsed", useProof: "unproved" } as const
const beta = { id: "cache-beta-opaque", name: "Fixture Beta", owner: "", unique: "not-collapsed", useProof: "unproved" } as const
const snapshot = (overrides: Partial<ActivityMonitor.ExternalCacheSnapshot> = {}): ActivityMonitor.ExternalCacheSnapshot => ({
  instanceID: "monitor-a",
  snapshotRevision: "1",
  readAt: 3000,
  source: "node.fs.lstat",
  coverage: "operator-declared-external-caches",
  status: "ready",
  records: [alpha, beta],
  ...overrides,
})
const text = (element: Element) => element.textContent?.trim() ?? ""
const row = (panel: HTMLElement, name: string) => [...panel.querySelectorAll("tbody tr")].find((item) => text(item).includes(name))
const cells = (line: Element) => [...line.querySelectorAll("td")].map(text)
const column = (line: Element, name: string) => {
  const table = line.closest("table")!
  return cells(line)[[...table.querySelectorAll("th")].map(text).indexOf(name)]
}
const age = (line: Element) => Number.parseInt(column(line, "Age") ?? "", 10)
const read = (line: Element) => {
  const button = [...line.querySelectorAll<HTMLButtonElement>("button")].find((item) => text(item) === "Read disk usage")
  if (!button) throw new Error("Missing row-specific read button")
  return button
}

test("Cache reports unavailable external cache inventory on entry", async () => {
  const app = await mount()
  try {
    app.select("Cache")
    ;(await app.call(0, "GET", cachePath)).respond(snapshot({ status: "unavailable", records: [] }))
    await until("external caches unavailable", () => text(app.panel()).includes("External caches") && /unavailable/i.test(text(app.panel())))
    expect(app.calls).toHaveLength(1)
    expect(app.panel().querySelectorAll("tbody tr")).toHaveLength(0)
  } finally {
    app.dispose()
  }
})

test("external cache reads are row-scoped and preserve the last complete sample on a partial attempt", async () => {
  const app = await mount()
  try {
    app.select("Cache")
    ;(await app.call(0, "GET", cachePath)).respond(snapshot())
    await until("external cache rows", () => !!row(app.panel(), alpha.name) && !!row(app.panel(), beta.name))
    expect(text(app.panel())).toContain("External caches")
    for (const name of [alpha.name, beta.name]) {
      const line = row(app.panel(), name)!
      expect(column(line, "Owner")).toBe("")
      expect(column(line, "Logical")).toBe("unread")
      expect(column(line, "Unique")).toBe("not collapsed")
      expect(column(line, "Use check")).toBe("unproved")
      expect(column(line, "Age")).toBe("unread")
    }
    read(row(app.panel(), alpha.name)!).click()
    ;(await app.call(1, "POST", readPath(alpha.id))).respond(snapshot({
      snapshotRevision: "2",
      records: [{ ...alpha, logical: { bytes: 12345, sampledAt: 1000 }, attempt: { state: "complete", startedAt: 900, sampledAt: 1000, issueCount: 0 } }, beta],
    }))
    await until("complete reading", () => column(row(app.panel(), alpha.name)!, "Logical") === "12345 B")
    expect(column(row(app.panel(), beta.name)!, "Logical")).toBe("unread")
    const initialAge = age(row(app.panel(), alpha.name)!)
    read(row(app.panel(), alpha.name)!).click()
    ;(await app.call(2, "POST", readPath(alpha.id))).respond(snapshot({
      snapshotRevision: "3",
      readAt: 4000,
      records: [{ ...alpha, logical: { bytes: 12345, sampledAt: 1000 }, attempt: { state: "partial", startedAt: 3900, sampledAt: 4000, issueCount: 1 } }, beta],
    }))
    await until("partial attempt", () => /partial/i.test(text(row(app.panel(), alpha.name)!)))
    expect(column(row(app.panel(), alpha.name)!, "Logical")).toBe("12345 B")
    expect(age(row(app.panel(), alpha.name)!)).toBeGreaterThanOrEqual(initialAge)
    expect(column(row(app.panel(), beta.name)!, "Logical")).toBe("unread")
    app.filter("FIXTURE BETA")
    expect(row(app.panel(), alpha.name)).toBeUndefined()
    expect(row(app.panel(), beta.name)).toBeDefined()
    app.filter("missing")
    expect(text(app.panel())).toContain("No row matches this filter.")
    expect(text(app.panel())).not.toMatch(/no external caches (configured|found)/i)
    app.filter("")
    const beforeTick = age(row(app.panel(), alpha.name)!)
    await until("sample age advances", () => age(row(app.panel(), alpha.name)!) > beforeTick)
    expect(app.calls).toHaveLength(3)
  } finally {
    app.dispose()
  }
})

test("Refresh retries a failed initial external cache request", async () => {
  const app = await mount()
  try {
    app.select("Cache")
    ;(await app.call(0, "GET", cachePath)).respond({ message: "Fixture unavailable" }, 503)
    await until("external cache request error", () => text(app.panel()).includes("The external cache request failed."))
    app.button("Refresh").click()
    ;(await app.call(1, "GET", cachePath)).respond(snapshot())
    await until("inventory after retry", () => !!row(app.panel(), alpha.name))
    expect(text(app.panel())).not.toContain("The external cache request failed.")
    expect(app.calls).toHaveLength(2)

    app.button("Refresh").click()
    ;(await app.call(2, "GET", cachePath)).respond({ message: "Fixture unavailable" }, 503)
    await until("refresh error", () => text(app.panel()).includes("The external cache request failed."))
    app.button("Refresh").click()
    ;(await app.call(3, "GET", cachePath)).respond(snapshot())
    await until("equal revision clears error", () => !text(app.panel()).includes("The external cache request failed."))
    expect(row(app.panel(), alpha.name)).toBeDefined()
    expect(app.calls).toHaveLength(4)
  } finally {
    app.dispose()
  }
})
