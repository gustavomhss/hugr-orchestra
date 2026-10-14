import { afterEach, expect, test } from "bun:test"
import {
  connectedSubagentModels, createModelPolicyEditor, createModelRuleEditor, modelUnavailable, sameModelPolicy,
  type ModelPolicySnapshot, type ModelRule, type SubagentModelPolicy,
} from "./subagent-model-rules"
import type { Provider } from "@orchestra/sdk/v2/client"
import { clearPending, pendingPolicy, pendingSelection, togglePending } from "./draft-subagent-models"
import { applySessionManagementEvent, mergeSessionManagementInfo, normalizeSessionInfo } from "@/utils/session"
import { sessionManagementUnsupported } from "@/utils/session-management-errors"
import { createServerSession } from "@/context/server-session"
import { createSdkForServer } from "@/utils/server"
import { parseHomeSessionIndex } from "@/context/global-sync/home-session-index"

const key = "http://origin.test\u0000draft\u0000full/slash/draft"
const first: SubagentModelPolicy = { mode: "allowlist", models: [{ providerID: "router", id: "team/model/v1" }] }
afterEach(() => clearPending(key))

test("reading an untouched draft keeps inheritance; removing the last choice keeps explicit deny-all", () => {
  expect(pendingSelection(key).size).toBe(0)
  expect(pendingPolicy(key)).toEqual({ mode: "inherit" })
  togglePending(key, "router", "team/model/v1", true)
  expect(pendingPolicy(key)).toEqual(first)
  togglePending(key, "router", "team/model/v1", false)
  expect(pendingPolicy(key)).toEqual({ mode: "allowlist", models: [] })
  clearPending(key)
  expect(pendingPolicy(key)).toEqual({ mode: "inherit" })
})

test("V2 replaces full policies, retains unavailable selections, serializes writes and retries failed replacement", async () => {
  const gate = Promise.withResolvers<SubagentModelPolicy>()
  const writes: SubagentModelPolicy[] = []
  const editor = createModelPolicyEditor({
    read: () => ({ policy: first, timestamp: 1 }),
    write: async (policy) => {
      writes.push(policy)
      if (writes.length === 1) return gate.promise
      return policy
    },
  })
  const pending = editor.set("provider", "other", true)
  await editor.set("provider", "duplicate", true)
  expect(writes).toEqual([{ mode: "allowlist", models: [...first.models, { providerID: "provider", id: "other" }] }])
  expect(editor.state.saving).toBe(true)
  expect(editor.state.acknowledged).toBeUndefined()
  expect(editor.policy()).toEqual(first)
  const error = new Error("offline")
  gate.reject(error)
  await pending
  expect(editor.state.failed).toBe(true)
  expect(editor.state.error).toBe(error)
  expect(editor.state.retry).toEqual(writes[0])
  expect(editor.policy()).toEqual(first)
  await editor.retry()
  expect(writes[1]).toEqual(writes[0])
  expect(editor.state.failed).toBe(false)
  expect(editor.state.error).toBeUndefined()
  expect(editor.state.retry).toBeUndefined()
  expect(editor.policy()).toEqual(writes[1])
  await editor.inherit()
  expect(writes.at(-1)).toEqual({ mode: "inherit" })
})

test("delayed ACK A event cannot replace ACK B; fresh external replacement wins after catch-up", async () => {
  const live: ModelPolicySnapshot = { policy: { mode: "inherit" }, timestamp: 1 }
  const editor = createModelPolicyEditor({ read: () => live, write: async (policy) => policy })
  await editor.set("router", "team/model/v1", true)
  await editor.set("router", "second", true)
  const second = editor.policy()
  live.policy = first
  live.timestamp = 2
  expect(editor.policy()).toEqual(second)
  live.policy = second
  live.timestamp = 3
  expect(editor.policy()).toEqual(second)
  live.policy = { mode: "allowlist", models: [] }
  live.timestamp = 4
  expect(editor.policy()).toEqual({ mode: "allowlist", models: [] })
})

test("canonical ACK fence accepts fresh external Inherit before catch-up, including same-timestamp sequence changes", async () => {
  const live: ModelPolicySnapshot = { policy: { mode: "inherit" }, timestamp: 1, revision: 1 }
  const editor = createModelPolicyEditor({
    read: () => live,
    write: async (policy) => ({ policy, timestamp: 2, revision: 2 }),
  })
  await editor.set("router", "team/model/v1", true)
  // No accessor read between ACK and the external event: the ACK's canonical fence must suffice.
  live.timestamp = 2
  expect(editor.policy()).toEqual(first)
  live.revision = 4
  expect(editor.policy()).toEqual({ mode: "inherit" })
})

test("normalizer and native event projection expose policy and reject older policy/archive events and snapshots", () => {
  const info = normalizeSessionInfo({
    id: "ses_policy", projectID: "project", title: "Policy", location: { directory: "/repo" },
    cost: 0, tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
    time: { created: 1, updated: 1 }, metadata: { future: { field: [1, "opaque"] } }, ...{ subagentModels: first },
  })
  expect(info.subagentModels).toEqual(first)
  expect(info.metadata).toEqual({ future: { field: [1, "opaque"] } })
  const changed = applySessionManagementEvent(info, {
    type: "session.next.subagent.models.changed",
    properties: { sessionID: info.id, timestamp: 20, policy: { mode: "allowlist", models: [] } },
  })!
  expect(changed.subagentModels).toEqual({ mode: "allowlist", models: [] })
  expect(applySessionManagementEvent(changed, {
    type: "session.next.subagent.models.changed", properties: { sessionID: info.id, timestamp: 10, policy: first },
  })).toBeUndefined()
  expect(mergeSessionManagementInfo(changed, info).subagentModels).toEqual(changed.subagentModels)
  const archived = applySessionManagementEvent(changed, {
    type: "session.next.archive.changed", properties: { sessionID: info.id, timestamp: 30, archived: 30 },
  })!
  const restored = applySessionManagementEvent(archived, {
    type: "session.next.archive.changed", properties: { sessionID: info.id, timestamp: 40, archived: null },
  })!
  expect(restored.time.archived).toBeUndefined()
  expect(applySessionManagementEvent(restored, {
    type: "session.next.archive.changed", properties: { sessionID: info.id, timestamp: 35, archived: 35 },
  })).toBeUndefined()
  const newest = applySessionManagementEvent(info, {
    type: "session.next.subagent.models.changed",
    properties: { sessionID: info.id, timestamp: 50, policy: { mode: "allowlist", models: [] } },
    current: { durable: { seq: 6 } },
  })!
  expect(applySessionManagementEvent(newest, {
    type: "session.next.subagent.models.changed",
    properties: { sessionID: info.id, timestamp: 50, policy: first }, current: { durable: { seq: 5 } },
  })).toBeUndefined()
  expect(mergeSessionManagementInfo(newest, { ...info, time: { created: 1, updated: 50 } }).subagentModels).toEqual({ mode: "allowlist", models: [] })
  expect(newest.metadata).toEqual(info.metadata)
})

test("unsupported statuses stay distinct from auth, transport and server failures", () => {
  expect([404, 405, 501].map((status) => sessionManagementUnsupported(new Error("UnexpectedStatus", { cause: { status } })))).toEqual([true, true, true])
  expect([401, 403, 500].map((status) => sessionManagementUnsupported(new Error("UnexpectedStatus", { cause: { status } })))).toEqual([false, false, false])
  expect(sessionManagementUnsupported(new Error("network offline"))).toBe(false)
})

test("actual server session store projects durable policy replacements and restores, including same-timestamp sequence order", () => {
  const store = createServerSession(createSdkForServer({ server: { url: "https://unused.test" } }), { protocol: Promise.resolve("v2") })
  store.remember({ id: "ses_store", slug: "store", projectID: "project", directory: "/repo", title: "Store", version: "", time: { created: 1, updated: 1 } })
  store.apply({ type: "session.next.subagent.models.changed", properties: { sessionID: "ses_store", timestamp: 10, policy: first }, current: { durable: { seq: 2 } } })
  expect(store.get("ses_store")?.subagentModels).toEqual(first)
  store.apply({ type: "session.next.subagent.models.changed", properties: { sessionID: "ses_store", timestamp: 10, policy: { mode: "allowlist", models: [] } }, current: { durable: { seq: 3 } } })
  store.apply({ type: "session.next.subagent.models.changed", properties: { sessionID: "ses_store", timestamp: 10, policy: first }, current: { durable: { seq: 2 } } })
  expect(store.get("ses_store")?.subagentModels).toEqual({ mode: "allowlist", models: [] })
  store.apply({ type: "session.next.archive.changed", properties: { sessionID: "ses_store", timestamp: 20, archived: 20 }, current: { durable: { seq: 4 } } })
  expect(store.get("ses_store")?.time.archived).toBe(20)
  store.apply({ type: "session.next.archive.changed", properties: { sessionID: "ses_store", timestamp: 20, archived: null }, current: { durable: { seq: 5 } } })
  expect(store.get("ses_store")?.time.archived).toBeUndefined()
})

test("current home session summaries retain backend policy instead of showing inherited counts", () => {
  const models = first.models.map((model) => ({ ...model }))
  const sessions = parseHomeSessionIndex([{
    id: "ses_home", projectID: "project", title: "Home", location: { directory: "/repo" },
    cost: 0, tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
    time: { created: 1, updated: 1 }, ...{ subagentModels: { ...first, models } },
  }])
  models[0].id = "changed-after-projection"
  expect(sessions[0]?.subagentModels).toEqual(first)
})

test("a failed later write keeps the earlier acknowledged policy behind delayed snapshots", async () => {
  const live: ModelPolicySnapshot = { policy: { mode: "inherit" }, timestamp: 1, revision: 1 }
  const gate = Promise.withResolvers<ModelPolicySnapshot>()
  const editor = createModelPolicyEditor({
    read: () => live,
    write: async (policy) => policy.mode === "inherit" ? gate.promise : { policy, timestamp: 2, revision: 2 },
  })
  await editor.replace(first)
  const pending = editor.inherit()
  expect(editor.policy()).toEqual(first)
  gate.reject(new Error("second write offline"))
  await pending
  expect(editor.state.acknowledged).toEqual(first)
  expect(editor.state.retry).toEqual({ mode: "inherit" })
  expect(editor.state.failed).toBe(true)
  expect(editor.policy()).toEqual(first)
})

test("a new canonical read receipt resolves a revisionless equal-time replacement", async () => {
  const live: ModelPolicySnapshot = { policy: { mode: "inherit" }, timestamp: 1, readVersion: 1 }
  const editor = createModelPolicyEditor({
    read: () => live,
    write: async (policy) => ({ policy, timestamp: 2, readVersion: 2 }),
  })
  await editor.replace(first)
  live.timestamp = 2
  expect(editor.policy()).toEqual(first)
  live.readVersion = 3
  expect(editor.policy()).toEqual({ mode: "inherit" })
})

test("a pending or failed write cannot restore historical ACK B over newer canonical C", async () => {
  const original = structuredClone(first)
  const live: ModelPolicySnapshot = { policy: { mode: "inherit" }, timestamp: 1, readVersion: 1 }
  const canonical: SubagentModelPolicy = { mode: "allowlist", models: [] }
  const gate = Promise.withResolvers<ModelPolicySnapshot>()
  const editor = createModelPolicyEditor({
    read: () => live,
    write: async (policy) => policy.mode === "inherit" ? gate.promise : { policy, timestamp: 2, readVersion: 2 },
  })
  await editor.replace(first)
  const acknowledged = editor.state.acknowledged
  live.policy = canonical
  live.timestamp = 2
  live.readVersion = 3
  expect(editor.policy()).toEqual(canonical)
  const pending = editor.inherit()
  expect(editor.state.saving).toBe(true)
  expect(editor.policy()).toEqual(canonical)
  expect(first).toEqual(original)
  expect(acknowledged).toEqual(original)
  gate.reject(new Error("new write offline"))
  await pending
  expect(editor.state.failed).toBe(true)
  expect(editor.state.retry).toEqual({ mode: "inherit" })
  expect(editor.policy()).toEqual(canonical)
  expect(first).toEqual(original)
  expect(acknowledged).toEqual(original)
  expect(canonical).toEqual({ mode: "allowlist", models: [] })
})

test("removing the last allowed identity stays deny-all until explicit acknowledged Inherit", async () => {
  const gate = Promise.withResolvers<SubagentModelPolicy>()
  const writes: SubagentModelPolicy[] = []
  const editor = createModelPolicyEditor({
    read: () => ({ policy: first }),
    write: async (policy) => {
      writes.push(policy)
      return policy.mode === "inherit" ? gate.promise : policy
    },
  })
  await editor.set("router", "team/model/v1", false)
  expect(editor.policy()).toEqual({ mode: "allowlist", models: [] })
  expect(sameModelPolicy(editor.policy(), { mode: "inherit" })).toBe(false)
  const pending = editor.inherit()
  expect(editor.policy()).toEqual({ mode: "allowlist", models: [] })
  const inherited: SubagentModelPolicy = { mode: "inherit" }
  gate.resolve(inherited)
  await pending
  expect(writes).toEqual([{ mode: "allowlist", models: [] }, { mode: "inherit" }])
  expect(editor.state.acknowledged).toEqual(inherited)
  expect(inherited).toEqual({ mode: "inherit" })
  expect(editor.policy()).toEqual({ mode: "inherit" })
})

test("catalog keeps all supplied models and marks missing, deprecated and non-tool text models unavailable", () => {
  const model = {
    id: "team/model/v1", name: "Hidden from chat", providerID: "router", api: { id: "team/model/v1", url: "", npm: "" },
    capabilities: {
      temperature: true, reasoning: false, attachment: false, toolcall: true, interleaved: false,
      input: { text: true, audio: false, image: false, video: false, pdf: false },
      output: { text: true, audio: false, image: false, video: false, pdf: false },
    },
    cost: { input: 0, output: 0, cache: { read: 0, write: 0 } }, limit: { context: 1000, output: 100 },
    status: "active" as const, options: {}, headers: {}, release_date: "2020-01-01",
  }
  const deprecated = { ...model, id: "retired", status: "deprecated" as const }
  const provider: Provider = {
    id: "router", name: "Router", source: "custom", env: [], options: {}, models: { [model.id]: model, retired: deprecated },
  }
  const choices = connectedSubagentModels([provider])
  expect(choices.map((choice) => choice.id)).toEqual(["team/model/v1", "retired"])
  expect(choices[0]?.provider).toBe(provider)
  expect(modelUnavailable(choices[0])).toBeUndefined()
  expect(modelUnavailable(choices[1])).toBe("unavailable")
  expect(modelUnavailable()).toBe("unavailable")
  expect(modelUnavailable({ ...model, capabilities: { ...model.capabilities, toolcall: false } })).toBe("incompatible")
  expect(modelUnavailable({ ...model, capabilities: { ...model.capabilities, input: { text: false } } })).toBe("incompatible")
  expect(modelUnavailable({ ...model, capabilities: { ...model.capabilities, output: { text: false } } })).toBe("incompatible")
})

test("actual server store retains policy sequence over equal-time revisionless snapshots", () => {
  const store = createServerSession(createSdkForServer({ server: { url: "https://unused.test" } }), { protocol: Promise.resolve("v2") })
  const info = {
    id: "ses_receipt", slug: "store", projectID: "project", directory: "/repo", title: "Store", version: "",
    time: { created: 1, updated: 1 }, permission: [{ permission: "task", pattern: "router/*", action: "allow" }],
  } satisfies Parameters<typeof store.remember>[0]
  store.remember(info)
  store.apply({ type: "session.next.subagent.models.changed", properties: { sessionID: info.id, timestamp: 10, policy: first }, current: { durable: { seq: 2 } } })
  store.apply({ type: "session.next.subagent.models.changed", properties: { sessionID: info.id, timestamp: 10, policy: { mode: "allowlist", models: [] } }, current: { durable: { seq: 3 } } })
  store.remember({ ...info, time: { created: 1, updated: 10 }, subagentModels: first })
  expect(store.get(info.id)?.subagentModels).toEqual({ mode: "allowlist", models: [] })
  expect(store.get(info.id)?.subagentModelsRevision).toBe(3)
  expect(store.get(info.id)?.permission).toEqual(info.permission)
})

test("V1 editor sends append batches and keeps latest ACK over a delayed strict-prefix snapshot", async () => {
  const source: { live: ModelRule[]; acknowledged: ModelRule[] } = { live: [], acknowledged: [] }
  const writes: ModelRule[][] = []
  const editor = createModelRuleEditor({ read: () => source.live, write: async (batch) => {
    writes.push(batch)
    source.acknowledged = [...source.acknowledged, ...batch]
    return source.acknowledged
  } })
  await editor.set("router", "first", true)
  const first = editor.rules()
  await editor.set("router", "second", true)
  expect(writes).toEqual([
    [{ permission: "task", pattern: "*/*", action: "deny" }, { permission: "task", pattern: "router/first", action: "allow" }],
    [{ permission: "task", pattern: "router/second", action: "allow" }],
  ])
  source.live = first
  expect(editor.rules()).toEqual(source.acknowledged)
  source.live = [{ permission: "task", pattern: "other/*", action: "deny" }]
  expect(editor.rules()).toEqual(source.live)
})
