import { expect, test } from "bun:test"
import type { Provider } from "@orchestra/sdk/v2/client"
import { applySessionManagementEvent, mergeSessionManagementInfo, normalizeSessionInfo } from "@/utils/session"
import { createServerSession } from "@/context/server-session"
import { createSdkForServer } from "@/utils/server"
import {
  connectedSubagentModels,
  createModelPolicyEditor,
  createModelRuleEditor,
  modelUnavailable,
  sameModelPolicy,
  type ModelPolicySnapshot,
  type ModelRule,
  type SubagentModelPolicy,
} from "./subagent-model-rules"

const first: SubagentModelPolicy = { mode: "allowlist", models: [{ providerID: "router", id: "team/model/v1" }] }

test("V2 waits for ACK, retains unavailable refs, refuses concurrent writes and retries failed replacement", async () => {
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
  expect(editor.state.saving).toBe(false)
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
  expect(editor.policy()).toEqual({ mode: "inherit" })
})

test("a failed later write keeps the earlier acknowledged policy behind delayed snapshots", async () => {
  const live: ModelPolicySnapshot = { policy: { mode: "inherit" }, timestamp: 1, revision: 1 }
  const gate = Promise.withResolvers<ModelPolicySnapshot>()
  const editor = createModelPolicyEditor({
    read: () => live,
    write: async (policy) => {
      if (policy.mode === "inherit") return gate.promise
      return { policy, timestamp: 2, revision: 2 }
    },
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

test("canonical ACK rejects equal-time older revisions and accepts newer external Inherit", async () => {
  const live: ModelPolicySnapshot = { policy: { mode: "inherit" }, timestamp: 1, revision: 1 }
  const editor = createModelPolicyEditor({
    read: () => live,
    write: async (policy) => ({ policy, timestamp: 2, revision: 2 }),
  })
  await editor.replace(first)
  live.timestamp = 2
  expect(editor.policy()).toEqual(first)
  live.revision = 4
  expect(editor.policy()).toEqual({ mode: "inherit" })
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
    write: async (policy) => {
      if (policy.mode === "inherit") return gate.promise
      return { policy, timestamp: 2, readVersion: 2 }
    },
  })
  await editor.replace(first)
  const acknowledged = editor.state.acknowledged
  expect(editor.policy()).toEqual(first)
  live.policy = canonical
  live.timestamp = 2
  live.readVersion = 3
  expect(editor.policy()).toEqual(canonical)
  const pending = editor.inherit()
  expect(first).toEqual(original)
  expect(acknowledged).toEqual(original)
  expect(editor.state.saving).toBe(true)
  expect(editor.policy()).toEqual(canonical)
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
      if (policy.mode === "inherit") return gate.promise
      return policy
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
    cost: { input: 0, output: 0, cache: { read: 0, write: 0 } },
    limit: { context: 1000, output: 100 }, status: "active" as const, options: {}, headers: {}, release_date: "2020-01-01",
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

test("policy projection preserves unknown metadata and fences equal-time stale events and HTTP snapshots", () => {
  const info = normalizeSessionInfo({
    id: "ses_policy", projectID: "project", title: "Policy", location: { directory: "/repo" },
    cost: 0, tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
    time: { created: 1, updated: 1 }, metadata: { future: { field: [1, "opaque"] } }, subagentModels: first,
  })
  expect(info.metadata).toEqual({ future: { field: [1, "opaque"] } })
  expect(info.subagentModels).toEqual(first)
  const newest = applySessionManagementEvent(info, {
    type: "session.next.subagent.models.changed",
    properties: { sessionID: info.id, timestamp: 50, policy: { mode: "allowlist", models: [] } },
    current: { durable: { seq: 6 } },
  })
  if (!newest) throw new Error("Missing projected policy")
  expect(newest.subagentModels).toEqual({ mode: "allowlist", models: [] })
  expect(applySessionManagementEvent(newest, {
    type: "session.next.subagent.models.changed",
    properties: { sessionID: info.id, timestamp: 50, policy: first }, current: { durable: { seq: 5 } },
  })).toBeUndefined()
  expect(mergeSessionManagementInfo(newest, { ...info, time: { created: 1, updated: 50 } }).subagentModels).toEqual({ mode: "allowlist", models: [] })
  expect(newest.metadata).toEqual(info.metadata)
})

test("actual server store applies policy sequences and retains them over equal-time revisionless snapshots", () => {
  const store = createServerSession(createSdkForServer({ server: { url: "https://unused.test" } }), { protocol: Promise.resolve("v2") })
  const info = {
    id: "ses_store", slug: "store", projectID: "project", directory: "/repo", title: "Store", version: "",
    time: { created: 1, updated: 1 }, permission: [{ permission: "task", pattern: "router/*", action: "allow" }],
  } satisfies Parameters<typeof store.remember>[0]
  store.remember(info)
  store.apply({ type: "session.next.subagent.models.changed", properties: { sessionID: info.id, timestamp: 10, policy: first }, current: { durable: { seq: 2 } } })
  store.apply({ type: "session.next.subagent.models.changed", properties: { sessionID: info.id, timestamp: 10, policy: { mode: "allowlist", models: [] } }, current: { durable: { seq: 3 } } })
  store.apply({ type: "session.next.subagent.models.changed", properties: { sessionID: info.id, timestamp: 10, policy: first }, current: { durable: { seq: 2 } } })
  store.remember({ ...info, time: { created: 1, updated: 10 }, subagentModels: first })
  expect(store.get(info.id)?.subagentModels).toEqual({ mode: "allowlist", models: [] })
  expect(store.get(info.id)?.subagentModelsRevision).toBe(3)
  expect(store.get(info.id)?.permission).toEqual(info.permission)
})

test("V1 editor sends append batches and keeps latest ACK over a delayed strict-prefix snapshot", async () => {
  const source: { live: ModelRule[]; acknowledged: ModelRule[] } = { live: [], acknowledged: [] }
  const writes: ModelRule[][] = []
  const editor = createModelRuleEditor({
    read: () => source.live,
    write: async (batch) => {
      writes.push(batch)
      source.acknowledged = [...source.acknowledged, ...batch]
      return source.acknowledged
    },
  })
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
