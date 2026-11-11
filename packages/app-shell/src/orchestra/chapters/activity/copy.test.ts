import { expect, test } from "bun:test"
import { resolveTemplate, translator } from "@solid-primitives/i18n"
import { ACTIVITY_COPY, ACTIVITY_COPY_BR } from "@/i18n/orchestra-chapters/activity"

test.each([
  { locale: "en", copy: ACTIVITY_COPY },
  { locale: "br", copy: ACTIVITY_COPY_BR },
])("activity $locale copy formats measured values and category names", (fixture) => {
  const t = translator(() => fixture.copy, resolveTemplate)
  const cases = [
    { key: "orchestra.monitor.cpuPercent", params: { value: "12.5" }, value: "12.5%" },
    { key: "orchestra.monitor.cpuWindow", params: { seconds: "2.0", age: "4 s" }, value: "2.0 s" },
    { key: "orchestra.monitor.processCount", params: { count: 3 }, value: "3" },
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
