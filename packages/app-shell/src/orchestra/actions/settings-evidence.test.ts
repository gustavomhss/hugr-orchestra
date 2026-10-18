import { expect, test } from "bun:test"
import { Actions } from "@orchestra/schema/actions"
import { Schema } from "effect"
import { initial } from "./contract"
import { resourcePayload } from "./resource-payload"
import { canConfigureLocalPolicy, canConfigureNativePolicy, localPolicyEvidence, nativePolicyEvidence, settingsConnection, settingsPolicy } from "./settings-evidence"

function fixture(kind: Actions.ProviderKind = "github") {
  const state = initial()
  const binding: Actions.Binding = { id: Actions.BindingID.make("ab_policy"), revision: 7, remote: "origin", directory: "/repo/policy", projectID: "42", projectPath: "org/repo",
    provider: { kind, hostname: `${kind}.com`, apiOrigin: `https://${kind}.com` } }
  state.binding = binding
  state.route = { view: "settings" }
  state.capabilities = { status: "ready", value: [] }
  const resource: Actions.Resource = { id: "project-settings", name: "Project settings", kind: "policy", bindingID: binding.id,
    scope: kind === "github" ? "Repository" : "Project", data: { policy: { retentionDays: 17, execution: "Restricted to approved actions" },
      nativePolicy: kind === "github" ? "Project default" : { state: "unavailable", reason: "No approved-actions equivalent" },
      nativeSettings: kind === "github" ? { enabled: false, allowed_actions: "all" } : { id: 42, keep_latest_artifact: false }, resourceVersion: "native:version" } }
  state.resources = { status: "ready", value: { capturedAt: 1, items: [resource] } }
  return { state, resource }
}

function setPolicy(scope: ReturnType<typeof fixture>, data: Actions.Resource["data"]) {
  scope.resource = { ...scope.resource, data }
  scope.state.resources = { status: "ready", value: { capturedAt: 1, items: [scope.resource] } }
}

test("local policy remains editable under native denial, read-only metadata and unresolved capabilities", () => {
  const scope = fixture()
  expect(canConfigureLocalPolicy(scope.state)).toBe(true)
  expect(canConfigureNativePolicy(scope.state)).toBe(true)
  scope.state.capabilities.value = [{ operation: "resource.update", state: "unavailable", scope: "Repository", observedAt: 1 }]
  setPolicy(scope, { ...Schema.decodeUnknownSync(Schema.Record(Schema.String, Schema.Json))(scope.resource.data), readOnly: true, editable: false, inherited: true })
  expect(canConfigureNativePolicy(scope.state)).toBe(false)
  expect(canConfigureLocalPolicy(scope.state)).toBe(true)
  scope.state.capabilities = { status: "error", error: { kind: "permission_denied", message: "orchestra.actions.unavailable" } }
  expect(canConfigureLocalPolicy(scope.state)).toBe(true)
  setPolicy(scope, { policy: {}, readOnly: true })
  expect(localPolicyEvidence(scope.resource).retentionDays).toBeUndefined()
  expect(canConfigureLocalPolicy(scope.state)).toBe(true)
  setPolicy(scope, { policy: { readOnly: true } })
  expect(canConfigureLocalPolicy(scope.state)).toBe(false)
})

test("native controls preserve Unknown evidence but enforce exact scope denial and historical fencing", () => {
  const scope = fixture()
  scope.state.capabilities.value = [{ operation: "resource.update", state: "unknown", observedAt: 1 }]
  expect(canConfigureNativePolicy(scope.state)).toBe(true)
  expect(scope.state.capabilities.value[0].state).toBe("unknown")
  scope.state.capabilities.value = [{ operation: "resource.update", state: "unavailable", scope: "production", observedAt: 1 }]
  expect(canConfigureNativePolicy(scope.state)).toBe(true)
  scope.state.capabilities.value = [{ operation: "resource.update", state: "unavailable", scope: "Repository", observedAt: 1 }]
  expect(canConfigureNativePolicy(scope.state)).toBe(false)
  scope.state.capabilities.value = []
  scope.state.route = { view: "run", runID: "101", attempt: 1 }
  scope.state.run = { status: "ready", value: { id: "101", bindingID: scope.resource.bindingID, workflowID: "11", name: "CI", ref: "dev", commit: "a".repeat(40),
    event: "push", status: "completed", attempt: 2 } }
  expect(canConfigureNativePolicy(scope.state)).toBe(false)
  scope.state.route.attempt = 2
  expect(canConfigureNativePolicy(scope.state)).toBe(true)
  setPolicy(scope, { ...Schema.decodeUnknownSync(Schema.Record(Schema.String, Schema.Json))(scope.resource.data), historical: true })
  expect(canConfigureNativePolicy(scope.state)).toBe(false)
})

test("GitLab native unavailability never masks local execution policy or native settings", () => {
  const scope = fixture("gitlab")
  expect(localPolicyEvidence(scope.resource).execution).toBe("Restricted to approved actions")
  expect(nativePolicyEvidence(scope.resource)).toEqual({ value: undefined, unavailable: true,
    settings: { id: 42, keep_latest_artifact: false }, version: "native:version" })
  expect(canConfigureNativePolicy(scope.state)).toBe(false)
  expect(canConfigureLocalPolicy(scope.state)).toBe(true)
})

test("native selector accepts only known exact native strings with a version, never the local fallback", () => {
  const scope = fixture()
  const data = new FormData()
  data.set("policy", "Restricted to approved actions")
  data.set("retention", "90")
  data.set("enabled", "true")
  data.set("selectedActions", "overwrite")
  const input = () => ({ provider: "github" as const, kind: "project-settings" as const, target: "native" as const, resource: scope.resource })
  expect(resourcePayload(data, input())).toEqual({ provider: "github", policy: "Restricted to approved actions" })
  expect(resourcePayload(data, { ...input(), target: "local" }).retention).toBe(90)
  const unknown: readonly Actions.Resource["data"][] = [
    { state: "source_unresolved" }, "local_only", "Project default ", "", null,
  ]
  unknown.forEach((nativePolicy) => {
    setPolicy(scope, { policy: { execution: "Project default" }, nativePolicy, nativeSettings: { allowed_actions: "local_only" }, resourceVersion: "native:version" })
    expect(nativePolicyEvidence(scope.resource).value).toBeUndefined()
    expect(canConfigureNativePolicy(scope.state)).toBe(false)
    expect(() => resourcePayload(data, input())).toThrow("source_unresolved")
  })
  setPolicy(scope, { nativePolicy: "Project default" })
  expect(canConfigureNativePolicy(scope.state)).toBe(false)
  expect(() => resourcePayload(data, input())).toThrow("source_unresolved")
  setPolicy(scope, { nativePolicy: "Project default", resourceVersion: "native:version" })
  data.set("policy", "local_only")
  expect(() => resourcePayload(data, input())).toThrow("invalid_input")
  expect(() => resourcePayload(data, { ...input(), provider: "gitlab" })).toThrow("capability_unavailable")
})

test("connection badge requires observed reads and errors override cached success without granting writes", () => {
  const scope = fixture()
  scope.state.resources = { status: "idle" }
  expect(settingsConnection(scope.state).state).toBe("unknown")
  scope.state.capabilities.value = [{ operation: "resource.update", state: "available", observedAt: 1 }]
  expect(settingsConnection(scope.state).state).toBe("unknown")
  scope.state.capabilities.value = [{ operation: "workflows.list", state: "unknown", observedAt: 1 }]
  expect(settingsConnection(scope.state).state).toBe("unknown")
  scope.state.capabilities.value = [{ operation: "workflows.list", state: "available", scope: "repository:other", observedAt: 1 }]
  expect(settingsConnection(scope.state).state).toBe("unknown")
  scope.state.capabilities.value = [{ operation: "workflows.list", state: "available", scope: "repository:42", observedAt: 1 },
    { operation: "resource.update", state: "unknown", observedAt: 1 }]
  expect(settingsConnection(scope.state)).toEqual({ state: "available", label: "orchestra.actions.available" })
  expect(scope.state.capabilities.value[1].state).toBe("unknown")
  scope.state.capabilities = { status: "error", error: { kind: "not_authenticated", message: "orchestra.actions.providerSignInRequired" } }
  scope.state.resources = { status: "ready", value: { capturedAt: 1, items: [scope.resource] } }
  expect(settingsConnection(scope.state)).toEqual({ state: "unavailable", label: "orchestra.actions.providerSignInRequired" })
  scope.state.capabilities = { status: "ready", value: [] }
  expect(settingsConnection(scope.state)).toEqual({ state: "available", label: "orchestra.actions.available" })
  scope.state.resources = { status: "error", value: scope.state.resources.value, error: { kind: "transport_failed", message: "orchestra.actions.unavailable" } }
  expect(settingsConnection(scope.state)).toEqual({ state: "unknown", label: "orchestra.actions.unknown" })
  scope.state.capabilities = { status: "error", error: { kind: "transport_failed", message: "orchestra.actions.unavailable" } }
  expect(settingsConnection(scope.state)).toEqual({ state: "unavailable", label: "orchestra.actions.unavailable" })
  scope.state.commandError = { kind: "server_auth", message: "orchestra.actions.serverAuthFailed" }
  expect(settingsConnection(scope.state).label).toBe("orchestra.actions.serverAuthFailed")
})

test("native reads report availability without attesting the bound account; stale binding overrides positive evidence", () => {
  const scope = fixture()
  const binding = scope.state.binding
  if (!binding) throw new Error("Missing fixture binding")
  scope.state.capabilities.value = [{ operation: "workflows.list", state: "available", scope: "repository:42", observedAt: 1 }]
  Array.of("alice", "bob").forEach((account) => {
    scope.state.binding = { ...binding, account }
    const before = structuredClone(scope.state.binding)
    expect(settingsConnection(scope.state)).toEqual({ state: "available", label: "orchestra.actions.available" })
    expect(scope.state.binding).toEqual(before)
  })
  scope.state.commandError = { kind: "binding_stale", message: "orchestra.actions.unavailable" }
  expect(settingsConnection(scope.state)).toEqual({ state: "unavailable", label: "orchestra.actions.unavailable" })
  scope.state.commandError = undefined
  expect(settingsConnection(scope.state)).toEqual({ state: "available", label: "orchestra.actions.available" })
})

test("policy controls reject stale, foreign and missing snapshots", () => {
  const scope = fixture()
  expect(settingsPolicy(scope.state)).toBe(scope.resource)
  expect(canConfigureNativePolicy(scope.state, { ...scope.resource })).toBe(false)
  scope.state.resources.status = "loading"
  expect(settingsPolicy(scope.state)).toBeUndefined()
  expect(canConfigureLocalPolicy(scope.state)).toBe(false)
  expect(canConfigureNativePolicy(scope.state)).toBe(false)
  scope.state.resources.status = "ready"
  scope.state.resources = { status: "ready", value: { capturedAt: 1, items: [{ ...scope.resource, bindingID: Actions.BindingID.make("ab_foreign") }] } }
  expect(settingsPolicy(scope.state)).toBeUndefined()
  expect(canConfigureLocalPolicy(scope.state)).toBe(false)
  expect(canConfigureNativePolicy(scope.state)).toBe(false)
})
