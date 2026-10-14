import { describe, expect, test } from "bun:test"
import { Actions } from "@orchestra/schema/actions"
import type { Dialog } from "./contract"
import { deferred, fixture, runStatus } from "./commands.fixture"

function dialogRequest(scope: ReturnType<typeof fixture>, dialog: Dialog, payload: unknown) {
  scope.commands.dialog(dialog)
  return () => scope.commands.submit(payload)
}

const schedule: Actions.Resource = { id: "88", bindingID: Actions.BindingID.make("ab_native"), kind: "schedules", name: "nightly", scope: "project:1",
  data: { enabled: true, editable: false, ownedByCurrentActor: false, resourceVersion: "native:schedule-version" } }

const admissionCases: readonly { operation: Actions.OperationKind; provider: "github" | "gitlab"; request: (scope: ReturnType<typeof fixture>) => () => Promise<void> }[] = [
  { operation: "run.retry", provider: "github", request: (scope) => dialogRequest(scope, { kind: "retry", runID: "101" }, { provider: "github", mode: "all" }) },
  { operation: "run.retryFailed", provider: "github", request: (scope) => dialogRequest(scope, { kind: "retry", runID: "101" }, { provider: "github", mode: "failed" }) },
  { operation: "run.cancel", provider: "github", request: (scope) => { runStatus(scope.state, "in_progress"); return dialogRequest(scope, { kind: "cancel", runID: "101" }, { provider: "github" }) } },
  { operation: "run.delete", provider: "github", request: (scope) => dialogRequest(scope, { kind: "remove", runID: "101" }, { provider: "github" }) },
  { operation: "job.retry", provider: "github", request: (scope) => dialogRequest(scope, { kind: "jobRetry", jobID: "202" }, { provider: "github" }) },
  { operation: "job.play", provider: "gitlab", request: (scope) => dialogRequest(scope, { kind: "jobPlay", jobID: "202" }, { provider: "gitlab" }) },
  { operation: "workflow.dispatch", provider: "github", request: (scope) => dialogRequest(scope, { kind: "dispatch", workflowID: "11" }, { provider: "github", ref: "main", inputs: {} }) },
  { operation: "workflow.enable", provider: "github", request: (scope) => () => scope.commands.workflowState(true, "11") },
  { operation: "workflow.disable", provider: "github", request: (scope) => () => scope.commands.workflowState(false, "11") },
  { operation: "resource.delete", provider: "gitlab", request: (scope) => {
    scope.state.route = { view: "resources", resourceKind: "schedules" }
    scope.state.resources = { status: "ready", value: { items: [schedule], capturedAt: 1 } }
    return dialogRequest(scope, { kind: "delete-schedule", id: "88", scope: "project:1" }, { provider: "gitlab" })
  } },
  { operation: "schedule.play", provider: "gitlab", request: (scope) => {
    scope.state.route = { view: "resources", resourceKind: "schedules" }
    scope.state.resources = { status: "ready", value: { items: [schedule], capturedAt: 1 } }
    return () => scope.commands.resourceAction("play", schedule)
  } },
  { operation: "resource.update", provider: "gitlab", request: (scope) => {
    const owned = { ...schedule, data: { enabled: true, editable: true, resourceVersion: "native:schedule-version" } }
    scope.state.route = { view: "resources", resourceKind: "schedules" }
    scope.state.resources = { status: "ready", value: { items: [owned], capturedAt: 1 } }
    return () => scope.commands.resourceAction("pause", owned)
  } },
  { operation: "resource.create", provider: "gitlab", request: (scope) => {
    scope.state.route = { view: "resources", resourceKind: "variables" }
    scope.state.resources = { status: "ready", value: { items: [], capturedAt: 1 } }
    return dialogRequest(scope, { kind: "create-variable" }, { provider: "gitlab", name: "MODE", type: "Variable", scope: "production", value: "native" })
  } },
  { operation: "artifact.keep", provider: "gitlab", request: (scope) => {
    const artifact: Actions.Resource = { id: "202", bindingID: schedule.bindingID, kind: "artifacts", name: "output", scope: "101", data: { resourceVersion: "native:artifact-version" } }
    scope.state.artifacts = { status: "ready", value: { items: [artifact], capturedAt: 1 } }
    return () => scope.commands.resourceAction("keep", artifact)
  } },
]

describe("Actions command admission parity", () => {
  admissionCases.forEach((item) => {
    test(`${item.operation}: known denial blocks before prepare; Unknown remains explicit`, async () => {
      using scope = fixture(item.provider)
      const request = item.request(scope)
      scope.state.capabilities = { status: "ready", value: [{ operation: item.operation, state: "unavailable", observedAt: 1 }] }
      await request()
      expect(scope.state.commandError?.kind).toBe("capability_unavailable")
      expect(scope.requests).toEqual([])
      scope.state.capabilities = { status: "ready", value: [{ operation: item.operation, state: "unknown", observedAt: 2 }] }
      await request()
      expect(scope.intents).toHaveLength(1)
      expect(scope.intents[0].kind).toBe(item.operation)
      expect(scope.state.operation?.state).toBe("accepted")
      expect(scope.state.capabilities.value?.[0].state).toBe("unknown")
    })

    test(`${item.operation}: denial arriving during prepare blocks send`, async () => {
      const started = deferred<void>()
      const allow = deferred<void>()
      using scope = fixture(item.provider, async (request) => {
        if (new URL(request.url).pathname !== "/api/actions/operation/ab_native" || request.method !== "POST") return
        started.resolve()
        await allow.promise
      })
      const sending = item.request(scope)()
      await started.promise
      expect(scope.state.submitting).toBe(true)
      scope.state.capabilities = { status: "ready", value: [{ operation: item.operation, state: "unavailable", observedAt: 2 }] }
      allow.resolve()
      await sending
      expect(scope.intents).toHaveLength(1)
      expect(scope.state.operation?.state).toBe("prepared")
      expect(scope.state.commandError?.kind).toBe("capability_unavailable")
      expect(scope.requests.filter((request) => request.method === "POST")).toHaveLength(1)
      expect(scope.state.submitting).toBe(false)
    })
  })

  test("historical attempts, unresolved capability reads and unknown outcomes never prepare", async () => {
    using scope = fixture()
    scope.commands.dialog({ kind: "retry", runID: "101" })
    scope.state.route = { ...scope.state.route, attempt: 1 }
    scope.commands.dialog({ kind: "retry", runID: "101" })
    await scope.commands.submit({ provider: "github", mode: "all" })
    expect(scope.requests).toEqual([])
    scope.state.route = { ...scope.state.route, attempt: 2 }
    scope.state.capabilities = { status: "loading", value: [] }
    scope.commands.dialog({ kind: "retry", runID: "101" })
    await scope.commands.submit({ provider: "github", mode: "all" })
    expect(scope.state.commandError?.kind).toBe("capability_unavailable")
    expect(scope.requests).toEqual([])
    scope.state.capabilities = { status: "ready", value: [] }
    scope.state.operation = { id: Actions.OperationID.make("aop_old"), bindingID: Actions.BindingID.make("ab_native"), clientID: "old-command",
      kind: "run.cancel", target: { runID: "101" }, state: "outcome_unknown", createdAt: 1, updatedAt: 1, expiresAt: 100 }
    await scope.commands.submit({ provider: "github", mode: "all" })
    expect(scope.requests).toEqual([])
    expect(scope.state.commandError?.kind).toBe("outcome_unknown")
    scope.state.operation = undefined
    await scope.commands.submit({ provider: "github", mode: "all" })
    await scope.commands.submit({ provider: "github", mode: "all" })
    expect(scope.state.commandError?.kind).toBe("outcome_unknown")
    expect(scope.requests).toEqual([])
  })

  test("an active submit blocks other direct controls without canceling the owner", async () => {
    const started = deferred<void>()
    const allow = deferred<void>()
    using scope = fixture("github", async (request) => {
      if (new URL(request.url).pathname !== "/api/actions/operation/ab_native" || request.method !== "POST") return
      started.resolve()
      await allow.promise
    })
    scope.commands.dialog({ kind: "retry", runID: "101" })
    const sending = scope.commands.submit({ provider: "github", mode: "all" })
    await started.promise
    await scope.commands.workflowState(false, "11")
    await scope.commands.submit({ provider: "github", mode: "all" })
    allow.resolve()
    await sending
    expect(scope.intents).toHaveLength(1)
    expect(scope.intents[0].kind).toBe("run.retry")
    expect(scope.state.operation?.state).toBe("accepted")
  })

  test("unknown outcome appearing during admission blocks send and retains its blocker", async () => {
    const started = deferred<void>()
    const allow = deferred<void>()
    using scope = fixture("github", async (request) => {
      if (new URL(request.url).pathname !== "/api/actions/operation/ab_native" || request.method !== "POST") return
      started.resolve()
      await allow.promise
    })
    scope.commands.dialog({ kind: "retry", runID: "101" })
    const sending = scope.commands.submit({ provider: "github", mode: "all" })
    await started.promise
    scope.state.commandError = { kind: "outcome_unknown", message: "orchestra.actions.unknownOutcome" }
    allow.resolve()
    await sending
    expect(scope.intents).toHaveLength(1)
    expect(scope.requests).toHaveLength(1)
    expect(scope.state.commandError?.kind).toBe("outcome_unknown")
    expect(scope.remembered.at(-1)?.operationID).toBe("aop_native")
  })

  test("resource scopes select native denial without blocking an unrelated variable scope", async () => {
    using scope = fixture("gitlab")
    const variable: Actions.Resource = { id: "DEPLOY", name: "DEPLOY", bindingID: schedule.bindingID, kind: "variables", scope: "staging",
      data: { type: "Variable", resourceVersion: "native:variable-version" } }
    scope.state.route = { view: "resources", resourceKind: "variables" }
    scope.state.resources = { status: "ready", value: { items: [variable], capturedAt: 1 } }
    scope.state.capabilities = { status: "ready", value: [{ operation: "resource.delete", state: "unavailable", scope: "production", observedAt: 1 }] }
    scope.commands.dialog({ kind: "delete-variable", id: variable.id, scope: variable.scope })
    await scope.commands.submit({ provider: "gitlab" })
    expect(scope.intents[0]).toMatchObject({ kind: "resource.delete", target: { resourceID: "DEPLOY", scope: "staging" } })
    expect(scope.state.operation?.state).toBe("accepted")
  })

  test("nonowner schedules deny editing and toggle but permit native play/delete requests", async () => {
    using scope = fixture("gitlab")
    scope.state.route = { view: "resources", resourceKind: "schedules" }
    scope.state.resources = { status: "ready", value: { items: [schedule], capturedAt: 1 } }
    scope.commands.dialog({ kind: "edit-schedule", id: schedule.id, scope: schedule.scope })
    await scope.commands.submit({ provider: "gitlab", name: "nightly", cron: "0 2 * * *", zone: "UTC", ref: "dev" })
    await scope.commands.resourceAction("pause", schedule)
    expect(scope.requests).toEqual([])
    await scope.commands.resourceAction("play", schedule)
    expect(scope.intents[0]).toMatchObject({ kind: "schedule.play", target: { resourceID: "88", scope: "project:1" }, expected: { resourceVersion: "native:schedule-version" } })
    scope.commands.dialog({ kind: "delete-schedule", id: schedule.id, scope: schedule.scope })
    await scope.commands.submit({ provider: "gitlab" })
    expect(scope.intents[1].kind).toBe("resource.delete")
    expect(scope.state.operation?.state).toBe("accepted")
  })

  test("native restriction arriving during schedule admission prevents send", async () => {
    const started = deferred<void>()
    const allow = deferred<void>()
    using scope = fixture("gitlab", async (request) => {
      if (new URL(request.url).pathname !== "/api/actions/operation/ab_native" || request.method !== "POST") return
      started.resolve()
      await allow.promise
    })
    scope.state.route = { view: "resources", resourceKind: "schedules" }
    scope.state.resources = { status: "ready", value: { items: [schedule], capturedAt: 1 } }
    const sending = scope.commands.resourceAction("play", schedule)
    await started.promise
    scope.state.resources = { status: "ready", value: { items: [{ ...schedule, data: { readOnly: true, resourceVersion: "native:schedule-version" } }], capturedAt: 2 } }
    allow.resolve()
    await sending
    expect(scope.intents).toHaveLength(1)
    expect(scope.state.operation?.state).toBe("prepared")
    expect(scope.state.commandError?.kind).toBe("binding_stale")
    expect(scope.requests).toHaveLength(1)
  })

  test("native deployment reviewer denial blocks admission; absent evidence permits explicit Unknown request", async () => {
    using scope = fixture()
    const environment: Actions.Resource = { id: "production", name: "production", bindingID: schedule.bindingID, kind: "environments", scope: "Repository",
      data: { runID: "101", resourceVersion: "native:review-version", current_user_can_approve: false } }
    scope.state.resources = { status: "ready", value: { capturedAt: 1, items: [environment] } }
    scope.state.capabilities = { status: "ready", value: [{ operation: "deployment.review", state: "unknown", observedAt: 1 }] }
    const request = dialogRequest(scope, { kind: "approval", runID: "101" }, { provider: "github", decision: "Approve", comment: "reviewed" })
    await request()
    expect(scope.state.commandError?.kind).toBe("capability_unavailable")
    expect(scope.requests).toEqual([])
    scope.state.resources = { status: "ready", value: { capturedAt: 2, items: [{ ...environment, data: { runID: "101", resourceVersion: "native:review-version" } }] } }
    await request()
    expect(scope.intents[0]).toMatchObject({ kind: "deployment.review", target: { runID: "101", resourceID: "production", scope: "Repository" } })
    expect(scope.state.operation?.state).toBe("accepted")
    expect(scope.state.capabilities.value?.[0].state).toBe("unknown")
  })

  test("native reviewer denial arriving during prepare blocks deployment review send", async () => {
    const started = deferred<void>()
    const allow = deferred<void>()
    using scope = fixture("github", async (request) => {
      if (new URL(request.url).pathname !== "/api/actions/operation/ab_native" || request.method !== "POST") return
      started.resolve()
      await allow.promise
    })
    const environment: Actions.Resource = { id: "production", name: "production", bindingID: schedule.bindingID, kind: "environments", scope: "Repository",
      data: { runID: "101", resourceVersion: "native:review-version" } }
    scope.state.resources = { status: "ready", value: { capturedAt: 1, items: [environment] } }
    const sending = dialogRequest(scope, { kind: "approval", runID: "101" }, { provider: "github", decision: "Reject", comment: "reviewed" })()
    await started.promise
    scope.state.resources = { status: "ready", value: { capturedAt: 2, items: [{ ...environment,
      data: { runID: "101", resourceVersion: "native:review-version", current_user_can_approve: false } }] } }
    allow.resolve()
    await sending
    expect(scope.intents).toHaveLength(1)
    expect(scope.requests).toHaveLength(1)
    expect(scope.state.operation?.state).toBe("prepared")
    expect(scope.state.commandError?.kind).toBe("capability_unavailable")
  })
})
