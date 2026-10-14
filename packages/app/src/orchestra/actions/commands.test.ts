import { describe, expect, test } from "bun:test"
import { Actions } from "@orchestra/schema/actions"
import { Schema } from "effect"
import { createActionsAPI } from "./api"
import { createActionsCommands, type ActionsPending } from "./commands"
import { initial, type Dialog, type State } from "./contract"
import { createRequestOwner } from "./requests"

const directory = "/repo/native"
const located = (data: unknown) => Response.json({ location: { directory }, data })

function deferred<T>() {
  const result: { resolve?: (value: T) => void } = {}
  const promise = new Promise<T>((resolve) => { result.resolve = resolve })
  return { promise, resolve(value: T) { result.resolve?.(value) } }
}

function fixture(provider: "github" | "gitlab" = "github", respond?: (request: Request) => Response | void | Promise<Response | void>, pending?: ActionsPending) {
  const state = initial()
  state.binding = { id: Actions.BindingID.make("ab_native"), revision: 7, remote: "origin", projectID: "1", projectPath: "owner/repo", directory,
    provider: { kind: provider, hostname: `${provider}.com`, apiOrigin: `https://${provider}.com` } }
  state.capabilities = { status: "ready", value: [] }
  state.route = { view: "run", runID: "101", ...(provider === "github" ? { attempt: 2 } : {}) }
  state.run = { status: "ready", value: { id: "101", bindingID: state.binding.id, workflowID: "11", name: "CI", ref: "main", commit: "a".repeat(40), event: "push", status: "completed", conclusion: "failure",
    ...(provider === "github" ? { attempt: 2 } : {}) } }
  state.workflows = { status: "ready", value: { items: [{ id: "11", bindingID: state.binding.id, name: "CI", path: ".github/workflows/native.yml", dispatchable: true, state: "active" }], capturedAt: 1 } }
  state.jobs = { status: "ready", value: { items: [{ id: "202", bindingID: state.binding.id, runID: "101", name: "build", status: provider === "github" ? "completed" : "manual", steps: [],
    ...(provider === "github" ? { attempt: 2 } : {}) }], capturedAt: 1 } }
  const requests: Request[] = []
  const intents: Actions.OperationIntent[] = []
  const receipts: Actions.Operation[] = []
  const remembered: Array<ActionsPending | undefined> = []
  const fetch = Object.assign(async (value: string | URL | Request, init?: RequestInit) => {
    const request = new Request(value, init)
    requests.push(request.clone())
    const custom = await respond?.(request.clone())
    if (custom) return custom
    const url = new URL(request.url)
    if (url.pathname.endsWith("/source")) return located({ bindingID: "ab_native", path: url.searchParams.get("path"), ref: url.searchParams.get("ref"),
      commit: "a".repeat(40), version: "b".repeat(40), text: "inputs: {}", editable: false })
    if (url.pathname === "/api/actions/operation/ab_native" && request.method === "POST") {
      const intent = Schema.decodeUnknownSync(Actions.OperationIntent)(await request.json())
      intents.push(intent)
      const operation = Actions.Operation.make({ id: Actions.OperationID.make("aop_native"), bindingID: intent.binding.id,
        clientID: intent.clientID, kind: intent.kind, target: intent.target, state: "prepared", createdAt: 1, expiresAt: 100, updatedAt: 1 })
      receipts.push(operation)
      return located(operation)
    }
    if (url.pathname === "/api/actions/operation/ab_native/aop_native") return located(receipts.at(-1))
    const last = receipts.at(-1)
    if (!last) throw new Error("execution before admission")
    const operation: Actions.Operation = { ...last, state: "accepted", updatedAt: 2, reason: "input secret must not reach UI" }
    receipts.push(operation)
    return located({ operation })
  }, { preconnect: globalThis.fetch.preconnect })
  const api = createActionsAPI({ server: { type: "http", http: { url: "http://localhost:4096" } }, fetch, directory })
  const owner = createRequestOwner()
  const commands = createActionsCommands({ api, owner, state: () => state, update: (patch) => Object.assign(state, patch), pending,
    remember: (value) => remembered.push(value) })
  return { state, requests, intents, receipts, remembered, commands, [Symbol.dispose]() { owner.dispose(); commands.dispose() } }
}

function runStatus(state: State, status: string) {
  if (!state.run.value) throw new Error("missing fixture run")
  state.run = { status: "ready", value: { ...state.run.value, status } }
}

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
})

describe("Actions immutable native intents", () => {
  test("one logical submit captures one UUID and immutable payload; admission precedes execution without input values", async () => {
    const started = deferred<void>()
    const allow = deferred<void>()
    using scope = fixture("github", async (request) => {
      if (!new URL(request.url).pathname.endsWith("/source")) return
      started.resolve()
      await allow.promise
    })
    scope.commands.dialog({ kind: "dispatch", workflowID: "11" })
    const payload = { provider: "github", ref: "main", inputs: { token: "original-secret" } }
    const sending = scope.commands.submit(payload)
    await started.promise
    payload.ref = "edited-ref"
    payload.inputs.token = "edited-secret"
    await scope.commands.submit(payload)
    allow.resolve()
    await sending
    expect(scope.intents).toHaveLength(1)
    expect(scope.intents[0].clientID).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
    expect(scope.intents[0]).toMatchObject({ kind: "workflow.dispatch", binding: { id: "ab_native", revision: 7 },
      target: { workflowID: "11", path: ".github/workflows/native.yml", ref: "main" }, expected: { commit: "a".repeat(40), sourceVersion: "b".repeat(40) } })
    expect(JSON.stringify(scope.intents)).not.toContain("secret")
    expect(JSON.stringify(scope.remembered)).not.toContain("secret")
    expect(scope.remembered[0]).toMatchObject({ clientID: scope.intents[0].clientID, binding: { id: "ab_native", revision: 7 }, operationID: undefined })
    expect(scope.requests.map((request) => new URL(request.url).pathname)).toEqual([
      "/api/actions/workflow/ab_native/source", "/api/actions/operation/ab_native", "/api/actions/workflow/ab_native/11/dispatch",
    ])
    expect(await scope.requests[2].json()).toEqual({ id: "aop_native", input: { provider: "github", ref: "main", inputs: { token: "original-secret" } } })
    expect(scope.state.operation?.state).toBe("accepted")
    expect(scope.state.operation?.reason).toBeUndefined()
    expect(scope.state.submitting).toBe(false)
  })

  test("provider schema is strict before admission, including nested extra fields", async () => {
    using scope = fixture()
    scope.commands.dialog({ kind: "retry", runID: "101" })
    await scope.commands.submit({ provider: "gitlab", mode: "failed" })
    expect(scope.state.commandError?.kind).toBe("invalid_input")
    await scope.commands.submit({ provider: "github", mode: "all", token: "forbidden" })
    expect(scope.state.commandError?.kind).toBe("invalid_input")
    scope.commands.dialog({ kind: "dispatch", workflowID: "11" })
    await scope.commands.submit({ provider: "github", ref: "main", inputs: { invalid: Infinity } })
    expect(scope.state.commandError?.kind).toBe("invalid_input")
    expect(scope.requests).toEqual([])
    using gitlab = fixture("gitlab")
    gitlab.commands.dialog({ kind: "jobPlay", jobID: "202" })
    await gitlab.commands.submit({ provider: "gitlab", variables: [{ key: "X", value: "secret", extra: true }] })
    expect(gitlab.state.commandError?.kind).toBe("invalid_input")
    expect(gitlab.requests).toEqual([])
  })

  test("native retry kinds differ across providers and GitHub preserves commit plus selected attempt", async () => {
    using github = fixture()
    github.commands.dialog({ kind: "retry", runID: "101" })
    await github.commands.submit({ provider: "github", mode: "failed", enableDebugLogging: true })
    expect(github.intents[0]).toMatchObject({ kind: "run.retryFailed", expected: { commit: "a".repeat(40), attempt: 2 }, target: { runID: "101" } })
    expect(await github.requests[1].json()).toEqual({ id: "aop_native", input: { provider: "github", mode: "failed", enableDebugLogging: true } })
    using gitlab = fixture("gitlab")
    gitlab.commands.dialog({ kind: "retry", runID: "101" })
    await gitlab.commands.submit({ provider: "gitlab", mode: "failed" })
    expect(gitlab.intents[0]).toMatchObject({ kind: "run.retry", expected: { commit: "a".repeat(40) } })
    expect(gitlab.intents[0].expected?.attempt).toBeUndefined()
  })

  test("binding revision changes during admission stop execution and preserve admitted receipt", async () => {
    const started = deferred<void>()
    const allow = deferred<void>()
    using scope = fixture("github", async (request) => {
      if (new URL(request.url).pathname !== "/api/actions/operation/ab_native" || request.method !== "POST") return
      started.resolve()
      await allow.promise
    })
    runStatus(scope.state, "in_progress")
    scope.commands.dialog({ kind: "cancel", runID: "101" })
    const sending = scope.commands.submit({ provider: "github" })
    await started.promise
    if (scope.state.binding) scope.state.binding = { ...scope.state.binding, revision: 8 }
    allow.resolve()
    await sending
    expect(scope.intents).toHaveLength(1)
    expect(scope.state.operation?.state).toBe("prepared")
    expect(scope.state.commandError?.kind).toBe("binding_stale")
    expect(scope.requests.some((request) => new URL(request.url).pathname.endsWith("/cancel"))).toBe(false)
    expect(scope.requests.filter((request) => request.method === "POST")).toHaveLength(1)
  })

  test("unknown execution outcome looks up same receipt and duplicate submit never re-admits", async () => {
    using scope = fixture("github", (request) => {
      if (!new URL(request.url).pathname.endsWith("/cancel")) return
      const prepared = scope.receipts.at(-1)
      if (!prepared) throw new Error("no admitted receipt")
      scope.receipts.push({ ...prepared, state: "outcome_unknown" })
      return Response.json({ _tag: "ActionsError", kind: "outcome_unknown", operationID: "aop_native", message: "secret native failure" }, { status: 400 })
    })
    runStatus(scope.state, "in_progress")
    scope.commands.dialog({ kind: "cancel", runID: "101" })
    await scope.commands.submit({ provider: "github" })
    expect(scope.state.operation?.state).toBe("outcome_unknown")
    expect(scope.state.commandError?.kind).toBe("outcome_unknown")
    await scope.commands.submit({ provider: "github" })
    expect(scope.intents).toHaveLength(1)
    expect(scope.requests.filter((request) => new URL(request.url).pathname.endsWith("/cancel"))).toHaveLength(1)
    expect(scope.requests.filter((request) => new URL(request.url).pathname.endsWith("/aop_native"))).toHaveLength(2)
    expect(JSON.stringify(scope.state.commandError)).not.toContain("secret")
  })

  test("lost admission response cannot auto-admit replacement intent without a known operation ID", async () => {
    using scope = fixture("github", (request) => {
      if (new URL(request.url).pathname === "/api/actions/operation/ab_native") throw new Error("connection lost with token=secret")
    })
    runStatus(scope.state, "in_progress")
    scope.commands.dialog({ kind: "cancel", runID: "101" })
    await scope.commands.submit({ provider: "github" })
    expect(scope.state.commandError?.kind).toBe("outcome_unknown")
    await scope.commands.submit({ provider: "github" })
    expect(scope.requests).toHaveLength(1)
    expect(scope.state.operation).toBeUndefined()
    expect(JSON.stringify(scope.state.commandError)).not.toContain("secret")
  })

  test("job command preserves native job and parent run; stale attempt snapshot cannot admit", async () => {
    using scope = fixture()
    scope.commands.dialog({ kind: "jobRetry", jobID: "202" })
    await scope.commands.submit({ provider: "github", enableDebugLogging: false })
    expect(scope.intents[0]).toMatchObject({ kind: "job.retry", target: { jobID: "202", runID: "101" }, expected: { attempt: 2 } })
    expect(new URL(scope.requests[1].url).pathname).toBe("/api/actions/job/ab_native/202/retry")
    scope.commands.dialog({ kind: "jobRetry", jobID: "202" })
    scope.state.route = { ...scope.state.route, attempt: 3 }
    await scope.commands.submit({ provider: "github" })
    expect(scope.intents).toHaveLength(1)
    expect(scope.state.commandError?.kind).toBe("binding_stale")
  })

  test("observed historical source version is admitted with native path, commit and attempt", async () => {
    using scope = fixture()
    scope.state.graph = { status: "ready", value: { state: "complete", jobs: [], diagnostics: [], source: {
      bindingID: Actions.BindingID.make("ab_native"), path: ".github/workflows/native.yml", ref: "a".repeat(40),
      commit: "a".repeat(40), version: "b".repeat(40), text: "jobs: {}", editable: false,
    } } }
    scope.commands.dialog({ kind: "retry", runID: "101" })
    await scope.commands.submit({ provider: "github", mode: "all" })
    expect(scope.intents[0]).toMatchObject({ target: { runID: "101", path: ".github/workflows/native.yml" },
      expected: { commit: "a".repeat(40), attempt: 2, sourceVersion: "b".repeat(40) } })
    expect(JSON.stringify(scope.intents)).not.toContain("jobs: {}")
  })

  test("restored pending IDs preserve unknown outcome across reload without persisting or re-admitting input", async () => {
    const pending: ActionsPending = { clientID: "saved-intent", binding: { id: Actions.BindingID.make("ab_native"), revision: 7 } }
    using lost = fixture("github", undefined, pending)
    lost.commands.dialog({ kind: "cancel", runID: "101" })
    await lost.commands.submit({ provider: "github" })
    expect(lost.state.commandError?.kind).toBe("outcome_unknown")
    expect(lost.requests).toEqual([])
    const receipt: Actions.Operation = { id: Actions.OperationID.make("aop_native"), bindingID: pending.binding.id,
      clientID: pending.clientID, kind: "run.cancel", target: { runID: "101" }, state: "outcome_unknown", createdAt: 1, updatedAt: 2, expiresAt: 100 }
    using known = fixture("github", () => located(receipt), { ...pending, operationID: receipt.id })
    await known.commands.refreshReceipt()
    await known.commands.submit({ provider: "github" })
    expect(known.state.operation?.state).toBe("outcome_unknown")
    expect(known.requests.map((request) => request.method)).toEqual(["GET", "GET"])
    expect(known.intents).toEqual([])
    expect(Object.keys(known.remembered[0] ?? {})).toEqual(["clientID", "binding", "operationID", "intent"])
  })

  test("a late receipt read cannot overwrite a newer execution acknowledgement", async () => {
    const executing = deferred<void>()
    const reading = deferred<AbortSignal>()
    const execute = deferred<Response>()
    const old = deferred<Response>()
    using scope = fixture("github", (request) => {
      const path = new URL(request.url).pathname
      if (path.endsWith("/cancel")) { executing.resolve(); return execute.promise }
      if (path.endsWith("/aop_native")) { reading.resolve(request.signal); return old.promise }
    })
    runStatus(scope.state, "in_progress")
    scope.commands.dialog({ kind: "cancel", runID: "101" })
    const sending = scope.commands.submit({ provider: "github" })
    await executing.promise
    const prepared = scope.receipts.at(-1)
    if (!prepared) throw new Error("missing prepared receipt")
    const refreshing = scope.commands.refreshReceipt()
    const signal = await reading.promise
    execute.resolve(located({ operation: { ...prepared, state: "accepted", updatedAt: 2 } }))
    await sending
    expect(signal.aborted).toBe(true)
    old.resolve(located(prepared))
    await refreshing
    expect(scope.state.operation?.state).toBe("accepted")
    expect(scope.state.commandError).toBeUndefined()
    expect(scope.remembered.at(-1)).toBeUndefined()
  })

  test("manual lost-admission recovery repeats the same immutable intent ID and never executes on refresh", async () => {
    const attempts: unknown[] = []
    using scope = fixture("github", async (request) => {
      if (new URL(request.url).pathname !== "/api/actions/operation/ab_native" || request.method !== "POST") return
      attempts.push(await request.json())
      if (attempts.length === 1) throw new Error("lost admission response")
    })
    runStatus(scope.state, "in_progress")
    scope.commands.dialog({ kind: "cancel", runID: "101" })
    await scope.commands.submit({ provider: "github" })
    expect(scope.state.commandError?.kind).toBe("outcome_unknown")
    await scope.commands.refreshReceipt(true)
    expect(attempts).toHaveLength(2)
    expect(attempts[1]).toEqual(attempts[0])
    expect(scope.requests.some((request) => new URL(request.url).pathname.endsWith("/cancel"))).toBe(false)
    await scope.commands.submit({ provider: "github" })
    expect(scope.intents).toHaveLength(1)
    expect(scope.requests.filter((request) => new URL(request.url).pathname.endsWith("/cancel"))).toHaveLength(1)
  })

  test("scoped variable deletion uses its native key and namespace, retaining the redacted version", async () => {
    using scope = fixture("gitlab")
    scope.state.route = { view: "resources", resourceKind: "variables" }
    scope.state.resources = { status: "ready", value: { capturedAt: 1, items: [{ id: '["DEPLOY_TOKEN","production","Secret"]', name: "DEPLOY_TOKEN",
      bindingID: Actions.BindingID.make("ab_native"), kind: "variables", scope: "production", sensitive: true,
      data: { type: "Secret", resourceVersion: "redacted-controls-version", redacted: true } }] } }
    scope.commands.dialog({ kind: "delete-variable", id: '["DEPLOY_TOKEN","production","Secret"]', scope: "production" })
    await scope.commands.submit({ provider: "gitlab" })
    expect(scope.intents[0]).toMatchObject({ kind: "resource.delete", target: { resourceKind: "variables", resourceID: "DEPLOY_TOKEN", scope: "production" },
      expected: { resourceVersion: "redacted-controls-version" } })
    expect(new URL(scope.requests[1].url).pathname).toBe("/api/actions/resource/ab_native/variables/delete")
    expect(await scope.requests[1].json()).toEqual({ id: "aop_native", input: { provider: "gitlab", name: "DEPLOY_TOKEN", type: "Secret", scope: "production" } })
  })

  test("inherited runners cannot admit writes; schedule toggle preserves native ID and version", async () => {
    using scope = fixture("gitlab")
    const runner: Actions.Resource = { id: "77", bindingID: Actions.BindingID.make("ab_native"), kind: "runners", name: "group runner", scope: "project:1", data: { inherited: true } }
    scope.state.resources = { status: "ready", value: { items: [runner], capturedAt: 1 } }
    scope.commands.dialog({ kind: "delete-runner", id: "77", scope: "project:1" })
    await scope.commands.submit({ provider: "gitlab" })
    expect(scope.requests).toEqual([])
    const schedule: Actions.Resource = { ...runner, id: "88", kind: "schedules", name: "nightly", status: "Paused", data: { enabled: false, resourceVersion: "native:schedule-version" } }
    scope.state.resources = { status: "ready", value: { items: [schedule], capturedAt: 2 } }
    await scope.commands.resourceAction("pause", schedule)
    expect(scope.intents[0]).toMatchObject({ kind: "resource.update", target: { resourceKind: "schedules", resourceID: "88", scope: "project:1" }, expected: { resourceVersion: "native:schedule-version" } })
    expect(await scope.requests[1].json()).toEqual({ id: "aop_native", input: { provider: "gitlab", enabled: true } })
  })
})
