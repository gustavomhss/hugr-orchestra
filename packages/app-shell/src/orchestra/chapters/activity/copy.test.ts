import { expect, test } from "bun:test"
import { resolveTemplate, translator } from "@solid-primitives/i18n"
import { ACTIVITY_COPY, ACTIVITY_COPY_BR } from "@/i18n/orchestra-chapters/activity"
import { tabs } from "./reading"

test.each([
  { locale: "en", copy: ACTIVITY_COPY, unique: "not collapsed", proof: "unproved" },
  { locale: "br", copy: ACTIVITY_COPY_BR, unique: "não colapsei", proof: "não provado" },
])("W12 worktree $locale labels preserve source, row identity, unique and proof vocabulary", (fixture) => {
  const t = translator(() => fixture.copy, resolveTemplate)
  const source = t("orchestra.monitor.worktreeSource", { source: "node.fs.lstat" })
  const action = t("orchestra.monitor.worktreeRead", { path: "/registered/worktree-a" })
  expect(source).toContain("node.fs.lstat")
  expect(action).toContain("/registered/worktree-a")
  const details = t("orchestra.monitor.walkDetails", { bytes: 12345, entries: 907, age: "23 s", issues: 661 })
  expect(details).toContain("12345 B")
  expect(details).toContain("907")
  expect(details).toContain("661")
  expect(details).toContain("23 s")
  expect(`${source} ${action} ${details}`).not.toMatch(/[{}]/)
  expect(t("orchestra.monitor.notCollapsed")).toBe(fixture.unique)
  expect(t("orchestra.monitor.unproved")).toBe(fixture.proof)
  expect(tabs).toEqual(["Trees", "Worktrees", "Cache", "Docker", "Temporary", "Logs", "IN/OUT", "Quarantine"])
})

test.each([
  { locale: "en", copy: ACTIVITY_COPY },
  { locale: "br", copy: ACTIVITY_COPY_BR },
])("activity $locale copy formats measured values and category names", (fixture) => {
  const t = translator(() => fixture.copy, resolveTemplate)
  const cases = [
    { key: "orchestra.monitor.cpuPercent", params: { value: "12.5" }, value: "12.5%" },
    { key: "orchestra.monitor.cpuWindow", params: { seconds: "2.0", age: "4 s" }, value: "2.0 s" },
    { key: "orchestra.monitor.processCount", params: { count: 3 }, value: "3" },
    { key: "orchestra.monitor.diskCount", params: { count: 1 }, value: "1" },
    { key: "orchestra.monitor.bytes", params: { count: 12345 }, value: "12345 B" },
    {
      key: "orchestra.monitor.walkDetails",
      params: { bytes: 12345, entries: 10, age: "4 s", issues: 2 },
      value: "12345 B",
    },
    { key: "orchestra.monitor.registeredCount", params: { count: 3 }, value: "3" },
    { key: "orchestra.monitor.retired", params: { count: 3 }, value: "3" },
    { key: "orchestra.monitor.seconds", params: { count: 4 }, value: "4 s" },
    { key: "orchestra.monitor.collectionUnavailable", params: { category: "Cache" }, value: "Cache:" },
  ] as const
  cases.forEach((entry) => {
    const value = t(entry.key, entry.params)
    expect(value).toContain(entry.value)
    expect(value).not.toMatch(/[{}]/)
  })
  expect(t("orchestra.monitor.cpuWindow", { seconds: "2.0", age: "4 s" })).toContain("4 s")
})
