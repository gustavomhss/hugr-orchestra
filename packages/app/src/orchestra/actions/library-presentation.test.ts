import { expect, test } from "bun:test"
import { Actions } from "@orchestra/schema/actions"
import { initial, type State } from "./contract"
import { libraryPresentation, workflowState } from "./library-presentation"

const binding: Actions.Binding = {
  id: Actions.BindingID.make("ab_library"), revision: 1, remote: "origin", projectID: "21", projectPath: "gustavomhss/hugr-orchestra",
  provider: { kind: "github", hostname: "github.com", apiOrigin: "https://api.github.com" },
}
const workflow: Actions.Workflow = {
  id: "7531", bindingID: binding.id, name: "Native CI", path: ".github/workflows/test.yml", defaultRef: "release/native",
  state: "active", dispatchable: false, dispatchState: "unknown",
}
const run: Actions.Run = {
  id: "101", bindingID: binding.id, workflowID: workflow.id, name: "Native run", ref: "feature/run", commit: "a".repeat(40),
  event: "push", status: "completed", conclusion: "success", attempt: 1, createdAt: "2026-10-01T00:00:00Z",
}
const filters = { query: "", status: "" }

function fixture(): State {
  return { ...initial(), binding, workflows: { status: "ready", value: { capturedAt: 1, items: [workflow] } },
    runs: { status: "ready", value: { capturedAt: 1, items: [run] } } }
}

test("GitLab configured participates in active filter without inventing dispatch availability", () => {
  const state = fixture()
  const configured = { ...workflow, id: "gitlab:project:21:pipeline", path: ".ci/project.yml", state: "configured" }
  state.binding = { ...binding, provider: { kind: "gitlab", hostname: "gitlab.com", apiOrigin: "https://gitlab.com" } }
  state.workflows = { status: "ready", value: { capturedAt: 1, items: [configured] } }
  expect(workflowState(configured.state).label).toBe("orchestra.actions.enabled")
  expect(libraryPresentation(state, { ...filters, status: "active" }).workflows).toEqual([configured])
  expect(libraryPresentation(state, filters).statuses).toEqual(["active"])
  expect(configured.dispatchState).toBe("unknown")
  expect(configured.dispatchable).toBe(false)
})

test("filters expose observed states only, group known disabled states and retain unknown native states", () => {
  const state = fixture()
  const disabled = { ...workflow, id: "42", state: "disabled_manually", name: "Release", path: ".github/workflows/release.yml" }
  const unknown = { ...workflow, id: "43", state: "disabled_future" }
  state.workflows = { status: "ready", value: { capturedAt: 1, items: [workflow, disabled, { ...disabled, id: "44", state: "disabled_inactivity" }, unknown] } }
  expect(libraryPresentation(state, { query: " RELEASE.YML ", status: "disabled" }).workflows).toEqual([disabled])
  expect(libraryPresentation(state, { query: "no matches", status: "" }).statuses).toEqual(["active", "disabled", "disabled_future"])
  expect(workflowState(unknown.state).label).toBeUndefined()
  expect(libraryPresentation(fixture(), filters).statuses).toEqual(["active"])
})

test("recent and latest runs join by binding and workflow, use creation time and preserve native execution status", () => {
  const state = fixture()
  const newest = { ...run, id: "102", createdAt: "2026-10-04T00:00:00Z", status: null, conclusion: null }
  const foreign = { ...run, id: "999", bindingID: Actions.BindingID.make("ab_foreign"), createdAt: "2026-10-05T00:00:00Z" }
  state.runs = { status: "ready", value: { capturedAt: 1, items: [
    { ...run, updatedAt: "2026-10-06T00:00:00Z" }, foreign, newest,
    { ...run, id: "103", workflowID: "other", createdAt: "2026-10-03T00:00:00Z" },
    { ...run, id: "104", createdAt: "2026-10-02T00:00:00Z" },
  ] } }
  const collection = libraryPresentation(state, filters)
  expect(collection.recent.map((item) => item.id)).toEqual(["102", "103", "104"])
  expect(collection.latest.get(workflow.id)).toEqual(newest)
  expect(collection.latest.get(workflow.id)?.status).toBeNull()
  expect(state.runs.value?.items[0].id).toBe("101")
  state.runs = { status: "ready", value: { capturedAt: 1, items: [foreign] } }
  expect(libraryPresentation(state, filters).latest.get(workflow.id)).toBeUndefined()
  expect(libraryPresentation(state, filters).recent).toEqual([])
})

test("actual Orchestra CI uses observed native ID and requires exact bound repository, host and source path", () => {
  const state = fixture()
  expect(libraryPresentation(state, filters).actualOrchestraCI).toBe(workflow)
  ;[
    { ...binding, projectPath: "other/project" },
    { ...binding, provider: { ...binding.provider, hostname: "github.example.com" } },
    { ...binding, provider: { ...binding.provider, kind: "gitlab" as const } },
  ].forEach((changed) => {
    expect(libraryPresentation({ ...state, binding: changed }, filters).actualOrchestraCI).toBeUndefined()
  })
  state.workflows = { status: "ready", value: { capturedAt: 1, items: [
    { ...workflow, bindingID: Actions.BindingID.make("ab_foreign") }, { ...workflow, id: "6543", path: ".github/workflows/other.yml" },
  ] } }
  expect(libraryPresentation(state, filters).actualOrchestraCI).toBeUndefined()
  state.workflows = { status: "ready", value: { capturedAt: 1, items: [{ ...workflow, id: "123456" }] } }
  expect(libraryPresentation(state, filters).actualOrchestraCI?.id).toBe("123456")
})

test("collection does not inspect source or graph and rejects stale loading/error observations", () => {
  const state = fixture()
  Object.defineProperties(state, {
    source: { get() { throw new Error("Eager source read") } },
    graph: { get() { throw new Error("Eager graph read") } },
  })
  expect(libraryPresentation(state, filters).workflows).toEqual([workflow])
  state.workflows.status = "loading"
  state.runs.status = "error"
  expect(libraryPresentation(state, filters).page).toEqual([])
  expect(libraryPresentation(state, filters).latest.size).toBe(0)
  state.workflows.status = "ready"
  state.runs.status = "ready"
  state.binding = undefined
  expect(libraryPresentation(state, filters).actualOrchestraCI).toBeUndefined()
  expect(libraryPresentation(state, filters).recent).toEqual([])
})
