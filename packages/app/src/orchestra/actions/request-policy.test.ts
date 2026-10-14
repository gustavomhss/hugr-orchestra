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
})
