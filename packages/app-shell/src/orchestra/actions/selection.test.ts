import { expect, test } from "bun:test"
import { Actions } from "@orchestra/schema/actions"
import { initial } from "./contract"
import { completesSelection } from "./entry-routing"
import { selectedRoute } from "./selection"

const binding = Actions.Binding.make({ id: Actions.BindingID.make("ab_native"), revision: 1, remote: "origin",
  provider: { kind: "github", hostname: "github.com", apiOrigin: "https://api.github.com" }, projectID: "21", projectPath: "owner/project", directory: "/repo/native" })

test("configuration ref ignores recent-run branch, preserves explicit selection and observed default", () => {
  const state = { ...initial(), binding, workflows: { status: "ready" as const,
    value: { capturedAt: 1, items: [{ id: "11", bindingID: binding.id, name: "CI", path: "ci.yml", state: "active", dispatchable: false, defaultRef: "release/config" }] } },
    runs: { status: "ready" as const, value: { capturedAt: 1, items: [Actions.Run.make({ id: "101", bindingID: binding.id, workflowID: "11", commit: "a".repeat(40), ref: "feature/old", name: "CI", event: "push", status: "completed" })] } } }
  expect(selectedRoute(state, { view: "workflow", workflowID: "11" }).ref).toBe("release/config")
  expect(selectedRoute(state, { view: "source", workflowID: "11", ref: "feature/chosen" }).ref).toBe("feature/chosen")
  expect(selectedRoute({ ...state, workflows: { status: "ready", value: { capturedAt: 1, items: [] } } }, { view: "workflow", workflowID: "11" }).ref).toBeUndefined()
  expect(selectedRoute({ ...state, binding: { ...binding, provider: { kind: "gitlab", hostname: "gitlab.com", apiOrigin: "https://gitlab.com" } } },
    { view: "source", runID: "101" })).toMatchObject({ ref: "a".repeat(40), path: undefined })
})

test("native run and workflow identity completion replace entries; user changes preserve history", () => {
  const before = { bindingID: binding.id, route: { view: "run" as const, runID: "101" } }
  const observed = { bindingID: binding.id, route: { view: "run" as const, runID: "101", workflowID: "11", path: "ci.yml", ref: "a".repeat(40), tab: "graph" as const } }
  expect(completesSelection(before, observed)).toBe(true)
  expect(completesSelection(observed, { ...observed, route: { ...observed.route, runID: "102" } })).toBe(false)
  expect(completesSelection(observed, { ...observed, route: { ...observed.route, workflowID: "22" } })).toBe(false)
  expect(completesSelection(observed, { ...observed, route: { ...observed.route, tab: "source" } })).toBe(false)
  expect(completesSelection(observed, { ...observed, route: { ...observed.route, ref: "b".repeat(40) } })).toBe(false)
  expect(completesSelection(observed, { ...observed, bindingID: Actions.BindingID.make("ab_other") })).toBe(false)
})
