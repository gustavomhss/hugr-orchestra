import { afterEach, expect, test } from "bun:test"
import { createModelPolicyEditor, type ModelPolicySnapshot, type SubagentModelPolicy } from "./subagent-model-rules"
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
  gate.reject(new Error("offline"))
  await pending
  expect(editor.state.failed).toBe(true)
  expect(editor.policy()).toEqual(first)
  await editor.retry()
  expect(writes[1]).toEqual(writes[0])
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
  live.revision = 4
  expect(editor.policy()).toEqual({ mode: "inherit" })
})

test("normalizer and native event projection expose policy and reject older policy/archive events and snapshots", () => {
  const info = normalizeSessionInfo({
    id: "ses_policy", projectID: "project", title: "Policy", location: { directory: "/repo" },
    cost: 0, tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
    time: { created: 1, updated: 1 }, ...{ subagentModels: first },
  })
  expect(info.subagentModels).toEqual(first)
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
