import { expect, test } from "bun:test"
import { Actions } from "@orchestra/schema/actions"
import { canRequestAction, resourceWritable } from "./action-eligibility"
import { initial } from "./contract"

function fixture(provider: "github" | "gitlab" = "github") {
  const state = initial()
  state.binding = Actions.Binding.make({ id: Actions.BindingID.make("ab_controls"), revision: 1, remote: "origin", projectID: "21", projectPath: "owner/project", directory: "/fixture",
    provider: { kind: provider, hostname: `${provider}.com`, apiOrigin: `https://${provider}.com` } })
  state.capabilities = { status: "ready", value: [] }
  state.route = { view: "job", runID: "101", jobID: "202" }
  state.run = { status: "ready", value: Actions.Run.make({ id: "101", bindingID: state.binding.id, workflowID: "11", name: "CI", ref: "dev", commit: "a".repeat(40), event: "push",
    status: provider === "github" ? "completed" : "success", conclusion: "success", ...(provider === "github" ? { attempt: 2 } : {}) }) }
  state.jobs = { status: "ready", value: { capturedAt: 1, items: [Actions.Job.make({ id: "202", bindingID: state.binding.id, runID: "101", name: "build",
    status: provider === "github" ? "completed" : "success", steps: [], ...(provider === "github" ? { attempt: 2 } : {}) })] } }
  return state
}

test("run controls distinguish terminal retry, failed retry and native active cancellation", () => {
  const state = fixture()
  const target = { runID: "101" }
  expect(canRequestAction(state, { kind: "run.retry", target })).toBe(true)
  expect(canRequestAction(state, { kind: "run.retryFailed", target })).toBe(false)
  expect(canRequestAction(state, { kind: "run.cancel", target })).toBe(false)
  if (!state.run.value) throw new Error("missing fixture run")
  state.run = { status: "ready", value: { ...state.run.value, status: "pending" } }
  expect(canRequestAction(state, { kind: "run.cancel", target })).toBe(true)
  expect(canRequestAction(state, { kind: "run.retry", target })).toBe(false)
  expect(canRequestAction(state, { kind: "run.delete", target })).toBe(false)
  expect(canRequestAction(state, { kind: "run.cancel", target: { runID: "102" } })).toBe(false)
})

test("job controls reject stale native attempts even when route omitted attempt", () => {
  const state = fixture()
  const command = { kind: "job.retry", target: { jobID: "202", runID: "101" } } satisfies Parameters<typeof canRequestAction>[1]
  expect(canRequestAction(state, command)).toBe(true)
  if (!state.jobs.value) throw new Error("missing fixture jobs")
  const job = state.jobs.value.items[0]
  state.jobs = { status: "ready", value: { capturedAt: 1, items: [{ ...job, attempt: 1 }] } }
  expect(canRequestAction(state, command)).toBe(false)
  state.jobs = { status: "ready", value: { capturedAt: 1, items: [{ ...job, attempt: undefined }] } }
  expect(canRequestAction(state, command)).toBe(false)
  state.jobs = { status: "ready", value: { capturedAt: 1, items: [job] } }
  state.route.attempt = 1
  expect(canRequestAction(state, command)).toBe(false)
  state.route.attempt = 2
  expect(canRequestAction(state, command)).toBe(true)
  expect(canRequestAction(state, { ...command, expected: { attempt: 1 } })).toBe(false)
  expect(canRequestAction(state, { ...command, target: { jobID: "202", runID: "102" } })).toBe(false)
  state.jobs = { status: "ready", value: { capturedAt: 1, items: [{ ...job, bindingID: Actions.BindingID.make("ab_other") }] } }
  expect(canRequestAction(state, command)).toBe(false)
})

test("failed-only retry uses its own eligibility and permission evidence", () => {
  const state = fixture()
  if (!state.run.value) throw new Error("missing fixture run")
  state.run = { status: "ready", value: { ...state.run.value, conclusion: "failure" } }
  state.capabilities = { status: "ready", value: [{ operation: "run.retry", state: "unavailable", observedAt: 1 }, { operation: "run.retryFailed", state: "unknown", observedAt: 1 }] }
  const target = { runID: "101" }
  expect(canRequestAction(state, { kind: "run.retry", target })).toBe(false)
  expect(canRequestAction(state, { kind: "run.retryFailed", target })).toBe(true)
  state.capabilities.value = [{ operation: "run.retryFailed", state: "unavailable", observedAt: 2 }]
  expect(canRequestAction(state, { kind: "run.retryFailed", target })).toBe(false)
})

test("job retry requires finished GitHub parent and observed native attempt", () => {
  const state = fixture()
  const command = { kind: "job.retry", target: { jobID: "202", runID: "101" } } satisfies Parameters<typeof canRequestAction>[1]
  if (!state.run.value) throw new Error("missing fixture run")
  const run = state.run.value
  state.run = { status: "ready", value: { ...run, status: "in_progress" } }
  expect(canRequestAction(state, command)).toBe(false)
  state.run = { status: "ready", value: { ...run, attempt: undefined } }
  expect(canRequestAction(state, command)).toBe(false)
  state.run = { status: "ready", value: { ...run, commit: "" } }
  expect(canRequestAction(state, command)).toBe(false)
  state.run = { status: "loading", value: run }
  expect(canRequestAction(state, command)).toBe(false)
  state.run = { status: "ready" }
  expect(canRequestAction(state, { kind: "job.retry", target: { jobID: "202" } })).toBe(false)
})

test("GitLab success is retryable; manual job is playable and not retryable", () => {
  const state = fixture("gitlab")
  const target = { jobID: "202", runID: "101" }
  expect(canRequestAction(state, { kind: "job.retry", target })).toBe(true)
  expect(canRequestAction(state, { kind: "job.play", target })).toBe(false)
  if (!state.jobs.value) throw new Error("missing fixture jobs")
  state.jobs = { status: "ready", value: { capturedAt: 1, items: [{ ...state.jobs.value.items[0], status: "manual", kind: "bridge" }] } }
  expect(canRequestAction(state, { kind: "job.retry", target })).toBe(false)
  expect(canRequestAction(state, { kind: "job.play", target })).toBe(true)
  state.submitting = true
  expect(canRequestAction(state, { kind: "job.play", target })).toBe(false)
  state.submitting = false
  state.capabilities = { status: "ready", value: [{ operation: "job.play", state: "unavailable", observedAt: 1 }] }
  expect(canRequestAction(state, { kind: "job.play", target })).toBe(false)
})

test("workflow Unknown permits dispatch without inventing availability or enabling unsupported controls", () => {
  const state = fixture()
  const workflow = Actions.Workflow.make({ id: "11", bindingID: Actions.BindingID.make("ab_controls"), name: "CI", path: ".github/workflows/ci.yml", state: "active", dispatchable: false, dispatchState: "unknown" })
  state.workflows = { status: "ready", value: { capturedAt: 1, items: [workflow] } }
  const command = { kind: "workflow.dispatch", target: { workflowID: "11", path: workflow.path } } satisfies Parameters<typeof canRequestAction>[1]
  expect(canRequestAction(state, command)).toBe(true)
  expect(state.workflows.value?.items[0].dispatchState).toBe("unknown")
  expect(state.workflows.value?.items[0].dispatchable).toBe(false)
  expect(canRequestAction(state, { ...command, target: { workflowID: "11", path: ".github/workflows/other.yml" } })).toBe(false)
  state.workflows = { status: "ready", value: { capturedAt: 1, items: [{ ...workflow, state: "disabled_manually" }] } }
  expect(canRequestAction(state, command)).toBe(false)
  expect(canRequestAction(state, { kind: "workflow.enable", target: command.target })).toBe(true)
  state.workflows = { status: "ready", value: { capturedAt: 1, items: [{ ...workflow, dispatchState: "unavailable" }] } }
  expect(canRequestAction(state, command)).toBe(false)
})

test("malformed native IDs and unresolved GitLab configuration cannot authorize controls", () => {
  const state = fixture()
  if (!state.run.value || !state.jobs.value) throw new Error("missing fixture targets")
  const run = state.run.value
  const job = state.jobs.value.items[0]
  state.run = { status: "ready", value: { ...run, id: "display-name" } }
  expect(canRequestAction(state, { kind: "run.retry", target: { runID: "display-name" } })).toBe(false)
  state.run = { status: "ready", value: run }
  state.jobs = { status: "ready", value: { capturedAt: 1, items: [{ ...job, id: "build" }] } }
  expect(canRequestAction(state, { kind: "job.retry", target: { runID: run.id, jobID: "build" } })).toBe(false)
  const gitlab = fixture("gitlab")
  const workflow = Actions.Workflow.make({ id: "gitlab:project:21:pipeline", bindingID: Actions.BindingID.make("ab_controls"), name: "CI", path: ".ci/native.yml", state: "configured", dispatchable: false, dispatchState: "unknown" })
  gitlab.workflows = { status: "ready", value: { capturedAt: 1, items: [workflow] } }
  const command = { kind: "workflow.dispatch", target: { workflowID: workflow.id, path: workflow.path } } satisfies Parameters<typeof canRequestAction>[1]
  expect(canRequestAction(gitlab, command)).toBe(true)
  expect(canRequestAction(gitlab, { kind: "workflow.enable", target: command.target })).toBe(false)
  gitlab.workflows = { status: "ready", value: { capturedAt: 1, items: [{ ...workflow, path: "https://elsewhere/ci.yml" }] } }
  expect(canRequestAction(gitlab, { ...command, target: { workflowID: workflow.id } })).toBe(false)
})

test("resource restrictions apply to exact native operation, not universal editability", () => {
  const schedule: Actions.Resource = { id: "88", bindingID: Actions.BindingID.make("ab_controls"), kind: "schedules", name: "nightly", scope: "project:21",
    data: { editable: false, ownedByCurrentActor: false, currentActor: "alice", actor: "bob", resourceVersion: "native:version" } }
  expect(resourceWritable(schedule, "resource.update")).toBe(false)
  expect(resourceWritable(schedule, "schedule.play")).toBe(true)
  expect(resourceWritable(schedule, "resource.delete")).toBe(true)
  expect(resourceWritable({ ...schedule, data: { removable: false } }, "resource.delete")).toBe(false)
  const restrictions: readonly Actions.Resource["data"][] = [{ readOnly: true }, { readonly: true }, { inherited: true }]
  restrictions.forEach((data) => {
    expect(resourceWritable({ ...schedule, data }, "schedule.play")).toBe(false)
    expect(resourceWritable({ ...schedule, data }, "resource.delete")).toBe(false)
  })
  expect(resourceWritable({ ...schedule, status: "Inherited", data: {} }, "schedule.play")).toBe(false)
  const state = fixture("gitlab")
  state.resources = { status: "ready", value: { capturedAt: 1, items: [schedule] } }
  const target = { resourceKind: "schedules", resourceID: "88", scope: "project:21" } satisfies Actions.OperationTarget
  expect(canRequestAction(state, { kind: "schedule.play", target, expected: { resourceVersion: "native:version" } })).toBe(true)
  expect(canRequestAction(state, { kind: "resource.update", target })).toBe(false)
  expect(canRequestAction(state, { kind: "resource.delete", target })).toBe(true)
  expect(canRequestAction(state, { kind: "schedule.play", target, expected: { resourceVersion: "stale" } })).toBe(false)
  expect(canRequestAction(state, { kind: "schedule.play", target: { ...target, scope: "project:22" } })).toBe(false)
  state.artifacts = { status: "ready", value: { capturedAt: 1, items: [schedule] } }
  expect(canRequestAction(state, { kind: "schedule.play", target })).toBe(true)
  state.artifacts = { status: "ready", value: { capturedAt: 1, items: [{ ...schedule, data: { readOnly: true } }] } }
  expect(canRequestAction(state, { kind: "schedule.play", target })).toBe(false)
})

test("deployment review honors snake_case native reviewer denial without inferring permission from absence", () => {
  const state = fixture()
  const environment: Actions.Resource = { id: "production", bindingID: Actions.BindingID.make("ab_controls"), kind: "environments", name: "production", scope: "Repository",
    data: { runID: "101", current_user_can_approve: false } }
  const target = { resourceKind: "environments", resourceID: "production", scope: "Repository", runID: "101" } satisfies Actions.OperationTarget
  state.resources = { status: "ready", value: { capturedAt: 1, items: [environment] } }
  expect(canRequestAction(state, { kind: "deployment.review", target })).toBe(false)
  expect(canRequestAction(state, { kind: "resource.update", target })).toBe(true)
  expect(canRequestAction(state, { kind: "resource.delete", target })).toBe(true)
  state.resources = { status: "ready", value: { capturedAt: 1, items: [{ ...environment, data: { runID: "101" } }] } }
  expect(canRequestAction(state, { kind: "deployment.review", target })).toBe(true)
  expect(state.capabilities.value).toEqual([])
  state.resources = { status: "ready", value: { capturedAt: 1, items: [{ ...environment, data: { runID: "101", current_user_can_approve: true } }] } }
  expect(canRequestAction(state, { kind: "deployment.review", target })).toBe(true)
})
