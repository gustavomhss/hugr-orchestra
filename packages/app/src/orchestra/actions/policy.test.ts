import { expect, test } from "bun:test"
import { Actions } from "@orchestra/schema/actions"
import { Schema } from "effect"
import { createActionsAPI } from "./api"
import { createActionsCommands } from "./commands"
import { initial } from "./contract"
import { readPolicy } from "./policy"
import { resourcePayload } from "./resource-payload"
import { createRequestOwner } from "./requests"

const directory = "/repo/policy"
const binding: Actions.Binding = { id: Actions.BindingID.make("ab_policy"), revision: 7, remote: "origin", directory, projectID: "42", projectPath: "org/repo",
  provider: { kind: "github", hostname: "github.com", apiOrigin: "https://api.github.com" } }
const target = { bindingID: binding.id, revision: binding.revision }
const local = { retentionDays: 17, execution: "Restricted to approved actions" }
const located = (data: unknown) => Response.json({ location: { directory }, data })

function fixture(policy: Actions.Resource["data"], nativeSettings: Actions.Resource["data"], revision = 7, foreign = false) {
  const resource: Actions.Resource = { id: "project-settings", name: "Project settings", bindingID: foreign ? Actions.BindingID.make("ab_foreign") : binding.id,
    kind: "policy", scope: "Repository", data: { policy, nativeSettings, resourceVersion: JSON.stringify(nativeSettings),
      retention: { state: "source_unresolved", writable: false }, inherited: { writable: false, scope: "Organization / enterprise" } } }
  const requests: Request[] = []
  const intents: Actions.OperationIntent[] = []
  const receipts: Actions.Operation[] = []
  const fetch = Object.assign(async (value: string | URL | Request, init?: RequestInit) => {
    const request = new Request(value, init)
    requests.push(request.clone())
    const path = new URL(request.url).pathname
    if (path.endsWith("/policy") && request.method === "GET") return located({ binding: { id: binding.id, revision }, policy: local })
    if (path === `/api/actions/resource/${binding.id}` && request.method === "GET") return located({ items: [resource], capturedAt: 1 })
    if (path === `/api/actions/operation/${binding.id}` && request.method === "POST") {
      const intent = Schema.decodeUnknownSync(Actions.OperationIntent)(await request.json())
      intents.push(intent)
      const operation: Actions.Operation = { id: Actions.OperationID.make("aop_policy"), bindingID: binding.id, clientID: intent.clientID,
        kind: intent.kind, target: intent.target, state: "prepared", createdAt: 1, updatedAt: 1, expiresAt: 100 }
      receipts.push(operation)
      return located(operation)
    }
    if (path === `/api/actions/resource/${binding.id}/policy/update` && request.method === "POST") {
      const last = receipts.at(-1)
      if (!last) throw new Error("Execution before admission")
      return located({ operation: { ...last, state: "accepted", updatedAt: 2 } })
    }
    throw new Error(`Unexpected request: ${request.method} ${path}`)
  }, { preconnect() {} })
  const api = createActionsAPI({ directory, fetch, server: { type: "http", http: { url: "http://localhost:4096" } } })
  return { api, resource, requests, intents }
}

const cases: readonly { name: string; policy: Actions.Resource["data"]; settings: Actions.Resource["data"] }[] = [
  { name: "GitHub all", policy: "Project default", settings: { enabled: false, allowed_actions: "all" } },
  { name: "GitHub selected", policy: "Restricted to approved actions", settings: { enabled: true, allowed_actions: "selected",
    selectedActions: { github_owned_allowed: false, verified_allowed: true, patterns_allowed: ["org/action@v1", "actions/checkout@v4"] } } },
  { name: "GitHub local_only", policy: { state: "source_unresolved", reason: "Unmapped native policy" }, settings: { enabled: false, allowed_actions: "local_only" } },
  { name: "GitLab", policy: { state: "unavailable", reason: "No approved-actions equivalent" }, settings: { id: 42, keep_latest_artifact: false, build_timeout: 900 } },
]

cases.forEach((entry) => {
  test(`${entry.name}: local overlay preserves native policy, settings and exact version`, async () => {
    const scope = fixture(entry.policy, entry.settings)
    const before = structuredClone(scope.resource)
    const page = await readPolicy(scope.api, target, new AbortController().signal)
    expect(page.items[0].data).toEqual({ ...Schema.decodeUnknownSync(Schema.Record(Schema.String, Schema.Json))(before.data),
      nativePolicy: entry.policy, policy: local })
    expect(scope.resource).toEqual(before)
    expect(scope.requests.map((request) => request.method)).toEqual(["GET", "GET"])
    scope.requests.forEach((request) => expect(new URL(request.url).searchParams.get("revision")).toBe("7"))
  })
})

test("policy overlay rejects stale local binding revisions and foreign native snapshots", async () => {
  for (const scope of [fixture("Project default", {}, 8), fixture("Project default", {}, 7, true)]) {
    await expect(readPolicy(scope.api, target, new AbortController().signal)).rejects.toThrow("binding_stale")
  }
})

test("native dialog sends only provider and policy through versioned resource.update; native settings remain evidence", async () => {
  const native = { enabled: false, allowed_actions: "selected", selectedActions: { github_owned_allowed: false, verified_allowed: true, patterns_allowed: ["org/action@v1"] } }
  const scope = fixture("Restricted to approved actions", native)
  const state = initial()
  state.binding = binding
  state.route = { view: "settings" }
  state.capabilities = { status: "ready", value: [{ operation: "resource.update", state: "unknown", observedAt: 1 }] }
  state.resources = { status: "ready", value: await readPolicy(scope.api, target, new AbortController().signal) }
  const owner = createRequestOwner()
  const commands = createActionsCommands({ api: scope.api, owner, state: () => state, update: (patch) => Object.assign(state, patch) })
  try {
    commands.dialog({ kind: "project-settings", target: "native" })
    const data = new FormData()
    data.set("policy", "Project default")
    data.set("retention", "365")
    data.set("enabled", "true")
    data.set("selectedActions", "replace")
    await commands.submit(resourcePayload(data, { kind: "project-settings", target: "native", provider: "github", resource: state.resources.value?.items[0] }))
    expect(scope.intents).toHaveLength(1)
    expect(scope.intents[0]).toMatchObject({ binding: { id: binding.id, revision: 7 }, kind: "resource.update",
      target: { resourceKind: "policy", resourceID: "project-settings", scope: "Repository" }, expected: { resourceVersion: JSON.stringify(native) } })
    const writes = scope.requests.filter((request) => request.method === "POST")
    expect(writes).toHaveLength(2)
    expect(new URL(writes[1].url).pathname).toBe(`/api/actions/resource/${binding.id}/policy/update`)
    expect(await writes[1].json()).toEqual({ id: "aop_policy", input: { provider: "github", policy: "Project default" } })
    expect(state.operation?.state).toBe("accepted")
    expect(state.capabilities.value?.[0].state).toBe("unknown")
    expect(Schema.decodeUnknownSync(Schema.Record(Schema.String, Schema.Json))(state.resources.value?.items[0].data).nativeSettings).toEqual(native)
  } finally {
    owner.dispose()
    commands.dispose()
  }
})
