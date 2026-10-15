import { expect, test } from "bun:test"
import { cockpitView, updateCockpitView } from "./orchestra-cockpit-state"

test("cockpit presentation is session/server-qualified and evicts old views without losing recent ones", () => {
  updateCockpitView("server-a/session", { pane: "docs", doc: "README.md" })
  updateCockpitView("server-b/session", { pane: "terminal" })
  expect(cockpitView("server-a/session").pane).toBe("docs")
  expect(cockpitView("server-b/session").doc).toBeUndefined()
  Array.from({ length: 31 }, (_, index) => updateCockpitView(`other-${index}`, { tasks: true }))
  expect(cockpitView("server-a/session").pane).toBe("browser")
  expect(cockpitView("server-b/session").pane).toBe("terminal")
  updateCockpitView("server-b/session", { activity: true })
  updateCockpitView("new-session", { pane: "files" })
  expect(cockpitView("server-b/session")).toMatchObject({ pane: "terminal", activity: true })
  expect(cockpitView("other-0").tasks).toBe(false)
})
