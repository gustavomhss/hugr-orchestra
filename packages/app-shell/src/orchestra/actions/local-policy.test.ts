import { describe, expect, test } from "bun:test"
import { Actions } from "@orchestra/schema/actions"
import { createRoot } from "solid-js"
import { unwrap } from "solid-js/store"
import { createActionsAPI, type ActionsScope } from "./api"
import { createActionsModel } from "./model"

const binding: Actions.Binding = { id: Actions.BindingID.make("ab_local_policy"), revision: 7, remote: "origin", directory: "/repo/local-policy",
  projectID: "42", projectPath: "org/repo", provider: { kind: "github", hostname: "github.com", apiOrigin: "https://api.github.com" } }
const policy = { retentionDays: 17, execution: "Restricted to approved actions" }

/** Stub only API boundaries; the model owns validation, mutation lifetime and safe errors. */
function fixture(reply?: ReturnType<typeof createActionsAPI>["updatePolicy"]) {
  const catalog = { bindings: [binding, { ...binding, id: Actions.BindingID.make("ab_other") }], policy: { retentionDays: 30, execution: "Project default" } }
  const writes: Array<{ scope: ActionsScope; policy: Actions.Policy; signal: AbortSignal }> = []
  const reads: string[] = []
  const api = {
    ...createActionsAPI({ directory: binding.directory, server: { type: "http", http: { url: "http://policy.invalid" } },
      fetch: Object.assign(async () => { throw new Error("Unexpected network request") }, { preconnect() {} }) }),
    async bindings() { reads.push("bindings"); return catalog.bindings },
    async capabilities() { reads.push("capabilities"); return [] },
    async workflows() { reads.push("workflows"); return { items: [], capturedAt: 1 } },
    async runs() { reads.push("runs"); return { items: [], capturedAt: 1 } },
    async resources(target: ActionsScope): Promise<Actions.ResourcePage> {
      reads.push("resources")
      return { capturedAt: 1, items: [{ id: "project-settings", bindingID: target.bindingID, kind: "policy", name: "Project settings", scope: "Repository",
        data: { policy: "Project default", nativeSettings: { enabled: true }, resourceVersion: "native-policy-version" } }] }
    },
    async policy(target: ActionsScope) {
      reads.push("policy")
      return { binding: { id: target.bindingID, revision: target.revision }, policy: catalog.policy }
    },
    async updatePolicy(target: ActionsScope, value: Actions.Policy, signal: AbortSignal) {
      writes.push({ scope: target, policy: value, signal })
      const saved = reply ? await reply(target, value, signal) : { binding: { id: target.bindingID, revision: target.revision + 1 }, policy: value }
      catalog.bindings = catalog.bindings.map((item) => item.id === saved.binding.id ? { ...item, revision: saved.binding.revision } : item)
      catalog.policy = { retentionDays: saved.policy.retentionDays ?? 30, execution: saved.policy.execution ?? "Project default" }
      return saved
    },
  }
  const mounted = createRoot((dispose) => ({ model: createActionsModel({ api, save: async () => undefined, preferences: { route: { view: "settings" } } }), dispose }))
  return { ...mounted, catalog, writes, reads,
    async open() {
      await mounted.model.refresh()
      mounted.model.dialog({ kind: "project-settings", target: "local" })
      await mounted.model.refresh()
      expect(mounted.model.state.dialog).toEqual({ kind: "project-settings", target: "local" })
    },
    [Symbol.dispose]() { mounted.dispose() },
  }
}

describe("Actions local policy save", () => {
  test.each([
    { provider: "github", ...policy }, { provider: "github", retention: policy.retentionDays, policy: policy.execution },
  ])("accepted form %j refreshes exact next revision without native command admission", async (payload) => {
    using scope = fixture()
    await scope.open()
    const before = scope.reads.filter((read) => read === "bindings").length
    await scope.model.submit(payload)
    expect(scope.writes).toHaveLength(1)
    expect(scope.writes[0].scope).toEqual({ bindingID: binding.id, revision: 7 })
    expect(scope.writes[0].policy).toEqual(policy)
    expect(scope.model.state.binding?.revision).toBe(8)
    expect(scope.reads.filter((read) => read === "bindings")).toHaveLength(before + 1)
    expect(scope.model.state.dialog).toBeUndefined()
    expect(scope.model.state.commandError).toBeUndefined()
    expect(scope.model.state.operation).toBeUndefined()
    expect(scope.model.state.resources.value?.items[0].data).toMatchObject({ policy, nativePolicy: "Project default", nativeSettings: { enabled: true } })
  })

  test.each([
    { id: binding.id, revision: 6 }, { id: binding.id, revision: 7 }, { id: binding.id, revision: 9 },
    { id: Actions.BindingID.make("ab_other"), revision: 8 },
  ])("ACK %j cannot close dialog or refresh an unproved policy revision", async (saved) => {
    using scope = fixture(async () => ({ binding: saved, policy }))
    await scope.open()
    const before = scope.reads.length
    await scope.model.submit(policy)
    expect(scope.writes).toHaveLength(1)
    expect(scope.reads).toHaveLength(before)
    expect(scope.model.state.binding).toEqual(binding)
    expect(scope.model.state.dialog).toEqual({ kind: "project-settings", target: "local" })
    expect(scope.model.state.submitting).toBe(false)
    expect(scope.model.state.commandError).toEqual({ kind: "binding_stale", message: "orchestra.actions.unavailable" })
  })

  test.each([
    { provider: "gitlab", ...policy }, { ...policy, retentionDays: 0 }, { ...policy, retentionDays: 1.5 },
    { ...policy, execution: "" }, { ...policy, nativeSettings: { enabled: false } },
    { retention: 17, policy: policy.execution, enabled: false },
    { ...policy, retention: 17, policy: policy.execution },
  ])("invalid local form %j stays open without calling updatePolicy", async (payload) => {
    using scope = fixture()
    await scope.open()
    const before = scope.reads.length
    await scope.model.submit(payload)
    expect(scope.writes).toEqual([])
    expect(scope.reads).toHaveLength(before)
    expect(scope.model.state.dialog?.kind).toBe("project-settings")
    expect(scope.model.state.commandError).toEqual({ kind: "invalid_input", message: "orchestra.actions.unavailable" })
  })

  test.each([
    { cause: { kind: "not_authenticated", message: "private-token provider detail" }, kind: "not_authenticated", message: "orchestra.actions.providerSignInRequired" },
    { cause: { kind: "permission_denied", message: "private-token policy denial" }, kind: "permission_denied", message: "orchestra.actions.unavailable" },
    { cause: { kind: "rate_limited", retryAfter: 23, message: "private-token request" }, kind: "rate_limited", message: "orchestra.actions.unavailable", retryAfter: 23 },
    { cause: new Error("private-token transport detail"), kind: "transport_failed", message: "orchestra.actions.unavailable" },
  ])("$kind failure retains local dialog and exposes only safe error", async (entry) => {
    using scope = fixture(async () => { throw entry.cause })
    await scope.open()
    const reads = scope.reads.length
    await scope.model.submit(policy)
    expect(scope.writes).toHaveLength(1)
    expect(scope.reads).toHaveLength(reads)
    expect(scope.model.state.commandError).toEqual({ kind: entry.kind, message: entry.message,
      ...("retryAfter" in entry ? { retryAfter: entry.retryAfter } : {}) })
    expect(JSON.stringify(unwrap(scope.model.state))).not.toContain("private-token")
    expect(scope.model.state.binding).toEqual(binding)
    expect(scope.model.state.dialog).toEqual({ kind: "project-settings", target: "local" })
    expect(scope.model.state.submitting).toBe(false)
  })

  test("form snapshot survives user edits during save; mutation blocks source discard until ACK", async () => {
    const started = Promise.withResolvers<void>()
    const reply = Promise.withResolvers<Actions.PolicyState>()
    using scope = fixture(async () => { started.resolve(); return reply.promise })
    await scope.open()
    const payload = { ...policy }
    const saving = scope.model.submit(payload)
    await started.promise
    payload.retentionDays = 999
    payload.execution = "edited after await"
    expect(scope.writes[0].policy).toEqual(policy)
    expect(scope.model.sourceDiscardBlocked).toBe(true)
    reply.resolve({ binding: { id: binding.id, revision: 8 }, policy })
    await saving
    expect(scope.model.sourceDiscardBlocked).toBe(false)
    expect(scope.model.state.binding?.revision).toBe(8)
  })

  test.each(["binding", "revision"] as const)("late policy ACK cannot refresh or retarget changed %s", async (change) => {
    const started = Promise.withResolvers<void>()
    const reply = Promise.withResolvers<Actions.PolicyState>()
    using scope = fixture(async () => { started.resolve(); return reply.promise })
    await scope.open()
    const saving = scope.model.submit(policy)
    await started.promise
    if (change === "binding") {
      scope.model.selectBinding(Actions.BindingID.make("ab_other"))
      await scope.model.refresh()
      scope.model.navigate({ view: "settings" })
    }
    if (change === "revision") scope.catalog.bindings = scope.catalog.bindings.map((item) => item.id === binding.id ? { ...item, revision: 8 } : item)
    await scope.model.refresh()
    const before = structuredClone(unwrap(scope.model.state))
    const reads = scope.reads.length
    expect(scope.writes[0].signal.aborted).toBe(false)
    reply.resolve({ binding: { id: binding.id, revision: 8 }, policy })
    await saving
    expect(scope.model.state).toEqual({ ...before, submitting: false })
    expect(scope.reads).toHaveLength(reads)
    expect(scope.model.state.binding?.id).toBe(change === "binding" ? Actions.BindingID.make("ab_other") : binding.id)
    expect(scope.model.state.binding?.revision).toBe(change === "binding" ? 7 : 8)
  })

  test("Solid disposal aborts policy save; ignored abort cannot repopulate disposed model", async () => {
    const started = Promise.withResolvers<AbortSignal>()
    const reply = Promise.withResolvers<Actions.PolicyState>()
    using scope = fixture(async (_target, _policy, signal) => { started.resolve(signal); return reply.promise })
    await scope.open()
    const saving = scope.model.submit(policy)
    const signal = await started.promise
    scope.dispose()
    expect(signal.aborted).toBe(true)
    const before = structuredClone(unwrap(scope.model.state))
    const reads = scope.reads.length
    reply.resolve({ binding: { id: binding.id, revision: 8 }, policy })
    await saving
    scope.model.dialog({ kind: "project-settings", target: "local" })
    await scope.model.submit(policy)
    await scope.model.refresh()
    expect(scope.model.state).toEqual(before)
    expect(scope.writes).toHaveLength(1)
    expect(scope.reads).toHaveLength(reads)
  })
})
