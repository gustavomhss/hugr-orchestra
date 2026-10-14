import { expect, test } from "bun:test"
import { Actions } from "@orchestra/schema/actions"
import { initial } from "./contract"
import { canRequest } from "./request-policy"

test("explicit Unknown request never promotes evidence; known denial, history and unknown outcome block", () => {
  const state = initial()
  state.binding = Actions.Binding.make({ id: Actions.BindingID.make("ab_request"), revision: 1, remote: "origin", projectID: "21", projectPath: "owner/project", directory: "/fixture",
    provider: { kind: "github", hostname: "github.com", apiOrigin: "https://api.github.com" } })
  state.capabilities = { status: "ready", value: [{ operation: "source.write", state: "unknown", observedAt: 1, scope: "repository:21" }] }
  expect(canRequest(state, "source.write")).toBe(true)
  expect(state.capabilities.value?.[0].state).toBe("unknown")
  expect(canRequest(state, "resource.create")).toBe(true)
  state.capabilities.value = [{ operation: "source.write", state: "unavailable", observedAt: 1, scope: "repository:21" }]
  expect(canRequest(state, "source.write")).toBe(false)
  state.capabilities.value = []
  state.route = { view: "run", runID: "101", attempt: 1 }
  state.run = { status: "ready", value: Actions.Run.make({ id: "101", bindingID: state.binding.id, workflowID: "11", name: "CI", ref: "dev", commit: "a".repeat(40), event: "push", status: "completed", attempt: 2 }) }
  expect(canRequest(state, "run.retry")).toBe(false)
  state.route.attempt = 2
  expect(canRequest(state, "run.retry")).toBe(true)
  expect(canRequest(state, "invented.operation")).toBe(false)
  state.operation = { id: Actions.OperationID.make("aop_unknown"), bindingID: state.binding.id, clientID: "unknown-request", kind: "run.retry", target: { runID: "101" },
    state: "outcome_unknown", createdAt: 1, updatedAt: 1, expiresAt: 100 }
  expect(canRequest(state, "run.retry")).toBe(false)
  state.operation = undefined
  state.commandError = { kind: "outcome_unknown", message: "orchestra.actions.unknownOutcome" }
  expect(canRequest(state, "run.retry")).toBe(false)
})

test("only the current command may ignore its own submitting state; every other admission restriction remains", () => {
  const state = initial()
  state.binding = Actions.Binding.make({ id: Actions.BindingID.make("ab_request"), revision: 1, remote: "origin", projectID: "21", projectPath: "owner/project", directory: "/fixture",
    provider: { kind: "gitlab", hostname: "gitlab.com", apiOrigin: "https://gitlab.com" } })
  state.capabilities = { status: "ready", value: [{ operation: "schedule.play", state: "unknown", observedAt: 1 }] }
  state.submitting = true
  expect(canRequest(state, "schedule.play")).toBe(false)
  expect(canRequest(state, "schedule.play", undefined, { current: () => false })).toBe(false)
  expect(canRequest(state, "schedule.play", undefined, { current: () => true })).toBe(true)
  state.capabilities.value = [{ operation: "schedule.play", state: "unavailable", observedAt: 1 }]
  expect(canRequest(state, "schedule.play", undefined, { current: () => true })).toBe(false)
  state.capabilities = { status: "loading", value: [] }
  expect(canRequest(state, "schedule.play", undefined, { current: () => true })).toBe(false)
  state.capabilities = { status: "ready", value: [] }
  state.commandError = { kind: "outcome_unknown", message: "orchestra.actions.unknownOutcome" }
  expect(canRequest(state, "schedule.play", undefined, { current: () => true })).toBe(false)
  state.commandError = undefined
  state.route = { view: "run", runID: "101", attempt: 1 }
  expect(canRequest(state, "schedule.play", undefined, { current: () => true })).toBe(false)
})

test("scoped denial applies to its native scope; project-wide and unscoped denials apply everywhere", () => {
  const state = initial()
  state.binding = Actions.Binding.make({ id: Actions.BindingID.make("ab_request"), revision: 1, remote: "origin", projectID: "21", projectPath: "owner/project", directory: "/fixture",
    provider: { kind: "gitlab", hostname: "gitlab.com", apiOrigin: "https://gitlab.com" } })
  state.capabilities = { status: "ready", value: [{ operation: "resource.delete", state: "unavailable", observedAt: 1, scope: "production" }] }
  expect(canRequest(state, "resource.delete", "production")).toBe(false)
  expect(canRequest(state, "resource.delete", "staging")).toBe(true)
  expect(canRequest(state, "resource.delete")).toBe(false)
  state.capabilities.value = [{ operation: "resource.delete", state: "unavailable", observedAt: 1, scope: "projects/21" }]
  expect(canRequest(state, "resource.delete", "staging")).toBe(false)
  state.capabilities.value = [{ operation: "resource.delete", state: "unavailable", observedAt: 1 }]
  expect(canRequest(state, "resource.delete", "staging")).toBe(false)
})

test("historical guard requires current native run identity, not an unrelated cached attempt", () => {
  const state = initial()
  state.binding = Actions.Binding.make({ id: Actions.BindingID.make("ab_request"), revision: 1, remote: "origin", projectID: "21", projectPath: "owner/project", directory: "/fixture",
    provider: { kind: "github", hostname: "github.com", apiOrigin: "https://api.github.com" } })
  state.capabilities = { status: "ready", value: [] }
  state.route = { view: "run", runID: "101", attempt: 2 }
  const run = Actions.Run.make({ id: "102", bindingID: state.binding.id, workflowID: "11", name: "CI", ref: "dev", commit: "a".repeat(40), event: "push", status: "completed", attempt: 2 })
  state.run = { status: "ready", value: run }
  expect(canRequest(state, "run.retry")).toBe(false)
  state.run = { status: "ready", value: { ...run, id: "101", bindingID: Actions.BindingID.make("ab_other") } }
  expect(canRequest(state, "run.retry")).toBe(false)
  state.run = { status: "loading", value: { ...run, id: "101" } }
  expect(canRequest(state, "run.retry")).toBe(false)
  state.runs = { status: "ready", value: { capturedAt: 1, items: [{ ...run, id: "101" }] } }
  expect(canRequest(state, "run.retry")).toBe(true)
})
