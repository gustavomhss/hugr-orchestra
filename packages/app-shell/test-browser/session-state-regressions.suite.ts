import { expect, test } from "bun:test"
import { createStore } from "solid-js/store"
import {
  createModelPolicyEditor,
  type ModelPolicySnapshot,
  type SubagentModelPolicy,
} from "@/components/subagent-model-rules"
import { createSdkForServer } from "@/utils/server"
import type { AppSession } from "@/utils/session"
import { createServerSession } from "@/context/server-session"
import { applyDirectoryEvent } from "@/context/global-sync/event-reducer"
import type { State } from "@/context/global-sync/types"
import { SESSION_MANAGEMENT_FENCE_LIMIT, sessionManagementFences } from "@/context/session-management-state"

const allow: SubagentModelPolicy = { mode: "allowlist", models: [{ providerID: "router", id: "team/model" }] }
const deny: SubagentModelPolicy = { mode: "allowlist", models: [] }
const info = (updated = 1): AppSession => ({
  id: "ses_regression",
  slug: "regression",
  projectID: "project",
  directory: "/repo",
  title: "Regression",
  version: "",
  time: { created: 1, updated },
  subagentModels: { mode: "inherit" },
})
const policy = (value: SubagentModelPolicy, timestamp: number, seq?: number) => ({
  type: "session.next.subagent.models.changed",
  properties: { sessionID: info().id, timestamp, policy: value },
  current: seq === undefined ? undefined : { durable: { seq } },
})
const archive = (archived: number | null, timestamp: number, seq: number) => ({
  type: "session.next.archive.changed",
  properties: { sessionID: info().id, timestamp, archived },
  current: { durable: { seq } },
})

test.each(["read receipt", "known revision"] as const)("canonical predecessor reset wins plain ACK via %s", async (proof) => {
  const live: ModelPolicySnapshot = { policy: { mode: "inherit" }, timestamp: 1, revision: 1, readVersion: 1 }
  const editor = createModelPolicyEditor({ read: () => live, write: async (value) => value })
  await editor.replace(allow)
  await editor.replace(deny)
  live.timestamp = 2
  // A timestamp alone cannot distinguish the delayed ancestor from an external reset.
  expect(editor.policy()).toEqual(deny)
  if (proof === "read receipt") live.readVersion = 2
  if (proof === "known revision") {
    live.policy = deny
    live.revision = 10
    expect(editor.policy()).toEqual(deny)
    live.policy = { mode: "inherit" }
    live.revision = 12
  }
  expect(editor.policy()).toEqual({ mode: "inherit" })
})

test("canonical read at equal timestamp replaces predecessor after plain ACK", async () => {
  const live: ModelPolicySnapshot = { policy: allow, timestamp: 20, readVersion: 1 }
  const editor = createModelPolicyEditor({ read: () => live, write: async (value) => value })
  await editor.replace(deny)
  live.readVersion = 2
  expect(editor.policy()).toEqual(allow)
})

test("delayed sequenced ACK A stays behind plain ACK B until a later canonical read", async () => {
  const live: ModelPolicySnapshot = { policy: { mode: "inherit" }, timestamp: 1, revision: 1, readVersion: 1 }
  const editor = createModelPolicyEditor({ read: () => live, write: async (value) => value })
  await editor.replace(allow)
  await editor.replace(deny)
  live.policy = allow
  live.timestamp = 2
  live.revision = 2
  expect(editor.policy()).toEqual(deny)
  // Unrelated events can create any gap; no base-plus-write-count inference is valid.
  live.revision = 100
  expect(editor.policy()).toEqual(deny)
  live.readVersion = 2
  live.policy = { mode: "inherit" }
  expect(editor.policy()).toEqual({ mode: "inherit" })
})

test.each(["sequenced ACK", "observed catch-up"] as const)("latest %s revision permits a newer canonical reset", async (proof) => {
  const live: ModelPolicySnapshot = { policy: { mode: "inherit" }, timestamp: 1, revision: 1 }
  const editor = createModelPolicyEditor({
    read: () => live,
    write: async (value) => proof === "sequenced ACK" ? { policy: value, timestamp: 2, revision: value === allow ? 10 : 50 } : value,
  })
  await editor.replace(allow)
  await editor.replace(deny)
  live.policy = allow
  live.timestamp = 2
  live.revision = 10
  expect(editor.policy()).toEqual(deny)
  if (proof === "observed catch-up") {
    live.policy = deny
    live.revision = 50
    expect(editor.policy()).toEqual(deny)
  }
  live.policy = { mode: "inherit" }
  live.revision = 51
  expect(editor.policy()).toEqual({ mode: "inherit" })
})

test("latest sequenced ACK revision survives an older matching policy observation", async () => {
  const live: ModelPolicySnapshot = { policy: { mode: "inherit" }, timestamp: 1, revision: 1 }
  const editor = createModelPolicyEditor({ read: () => live, write: async (value) => ({ policy: value, timestamp: 2, revision: 50 }) })
  await editor.replace(deny)
  live.policy = deny
  live.timestamp = 2
  live.revision = 20
  expect(editor.policy()).toEqual(deny)
  live.policy = allow
  live.revision = 30
  expect(editor.policy()).toEqual(deny)
  live.policy = { mode: "inherit" }
  live.revision = 51
  expect(editor.policy()).toEqual({ mode: "inherit" })
})

test.each(["unknown ACK revision", "older timestamp"] as const)("ancestor remains fenced with %s", async (proof) => {
  const live: ModelPolicySnapshot = {
    policy: { mode: "inherit" },
    timestamp: 20,
    revision: proof === "older timestamp" ? 1 : undefined,
  }
  const editor = createModelPolicyEditor({ read: () => live, write: async (value) => value })
  await editor.replace(allow)
  live.revision = 2
  if (proof === "older timestamp") live.timestamp = 10
  expect(editor.policy()).toEqual(allow)
})

function service() {
  const gate = Promise.withResolvers<void>()
  const requests: string[] = []
  const client = createSdkForServer({
    server: { url: "https://session-regression.test" },
    throwOnError: true,
    fetch: Object.assign(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        requests.push(new URL(new Request(input, init).url).pathname)
        await gate.promise
        return Response.json(info())
      },
      { preconnect: fetch.preconnect },
    ),
  })
  return { gate, requests, store: createServerSession(client) }
}

test("retaining newer policy keeps latest activity timestamp and other snapshot times", () => {
  const ctx = service()
  ctx.store.remember({ ...info(), archiveChangedAt: 1 })
  ctx.store.apply(policy(deny, 20, 2))
  ctx.store.remember({ ...info(10), time: { created: 1, updated: 10, compacting: 9 } })
  expect(ctx.store.get(info().id)?.subagentModels).toEqual(deny)
  expect(ctx.store.get(info().id)?.subagentModelsRevision).toBe(2)
  expect(ctx.store.get(info().id)?.time).toEqual({ created: 1, updated: 20, compacting: 9 })
})

test.each(["delete", "delete and recreate"] as const)("missing management recovery cannot resurrect after %s", async (phase) => {
  const ctx = service()
  ctx.store.apply(policy(allow, 20, 2))
  const pending = ctx.store.resolve(info().id)
  const projection = pending.then(ctx.store.remember).catch(() => undefined)
  ctx.store.apply({ type: "session.deleted", properties: { sessionID: info().id } })
  if (phase === "delete and recreate") ctx.store.remember({ ...info(30), subagentModels: deny })
  ctx.gate.resolve()
  await projection
  await Promise.resolve()
  expect(ctx.requests).toEqual([`/session/${info().id}`])
  expect(ctx.store.get(info().id)).toEqual(phase === "delete" ? undefined : { ...info(30), subagentModels: deny })
})

test("cold concurrent management recovery preserves both fields from shared GET", async () => {
  const ctx = service()
  ctx.store.apply(policy(allow, 20, 2))
  ctx.store.apply(archive(30, 30, 3))
  const pending = ctx.store.resolve(info().id)
  ctx.gate.resolve()
  await pending
  await Promise.resolve()
  expect(ctx.requests).toHaveLength(1)
  expect(ctx.store.get(info().id)?.subagentModels).toEqual(allow)
  expect(ctx.store.get(info().id)?.subagentModelsRevision).toBe(2)
  expect(ctx.store.get(info().id)?.time.archived).toBe(30)
})

function directory(empty = false) {
  const [store, setStore] = createStore({
    session: empty ? [] : [info()],
    sessionTotal: empty ? 0 : 1,
    limit: 10,
    message: {},
    session_message: {},
    session_diff: {},
    todo: {},
    permission: {},
    question: {},
    session_status: {},
    part: {},
    part_text_accum_delta: {},
  } as State)
  const reloads: string[] = []
  const apply = (event: Parameters<typeof applyDirectoryEvent>[0]["event"], scope = "/repo") =>
    applyDirectoryEvent({
      event,
      store,
      setStore,
      directory: scope,
      push: (value) => reloads.push(value),
      loadLsp() {},
    })
  return { store, apply, reloads }
}

test.each(["session.updated", "session.created"])("archive tombstone blocks stale absent-row %s, accepts later restore", (type) => {
  const ctx = directory()
  ctx.apply(archive(20, 20, 2))
  expect(ctx.store.session).toEqual([])
  ctx.apply({ type, properties: { info: info(10) } })
  expect(ctx.store.session).toEqual([])
  ctx.apply(archive(null, 20, 1))
  ctx.apply({ type, properties: { info: info(20) } })
  expect(ctx.store.session).toEqual([])
  ctx.apply(archive(null, 20, 3))
  ctx.apply({ type: "session.updated", properties: { info: info(20) } })
  expect(ctx.store.session[0]?.time.archived).toBeUndefined()
  expect(ctx.store.session[0]?.archiveRevision).toBe(3)
  expect(ctx.reloads).toEqual(["/repo"])
  ctx.apply(archive(21, 21, 4))
  ctx.apply({ type: "session.updated", properties: { info: info(22) } })
  expect(ctx.store.session[0]?.time.updated).toBe(22)
})

test("archive tombstones stay scoped to server store and directory; deletion clears fence", () => {
  const ctx = directory()
  ctx.apply(archive(20, 20, 2))
  const other = directory()
  other.apply({ type: "session.updated", properties: { info: info(10) } })
  expect(other.store.session[0]?.time.archived).toBeUndefined()
  ctx.apply({ type: "session.updated", properties: { info: info(10) } }, "/other")
  expect(ctx.store.session[0]?.time.archived).toBeUndefined()
  ctx.apply({ type: "session.deleted", properties: { sessionID: info().id } })
  ctx.apply({ type: "session.created", properties: { info: info(10) } })
  expect(ctx.store.session[0]?.time.archived).toBeUndefined()
})

test.each(["session.created", "session.updated"])("initially absent archive fences stale %s and admits a fresh restore", (type) => {
  const ctx = directory(true)
  ctx.apply(archive(20, 20, 2))
  const metadata = sessionManagementFences(ctx.store, "/repo").get(info().id)
  expect(metadata?.time).toEqual({ updated: 20, archived: 20 })
  expect(metadata).not.toHaveProperty("title")
  ctx.apply({ type, properties: { info: info(10) } })
  expect(ctx.store.session).toEqual([])
  ctx.apply(archive(null, 20, 1))
  ctx.apply({ type, properties: { info: info(20) } })
  expect(ctx.store.session).toEqual([])
  ctx.apply(archive(null, 20, 3))
  ctx.apply({ type, properties: { info: { ...info(20), time: { created: 1, updated: 20, archived: 20 } } } })
  expect(ctx.store.session[0]?.time.archived).toBeUndefined()
  expect(ctx.store.session[0]?.archiveRevision).toBe(3)
})

test("archive fence cache bounds retention and preserves newest tombstone under pressure", () => {
  const ctx = directory()
  const fences = sessionManagementFences(ctx.store, "/repo")
  Array.from({ length: SESSION_MANAGEMENT_FENCE_LIMIT + 1 }, (_, index) =>
    fences.merge({
      ...info(20),
      id: `ses_${index}`,
      archiveChangedAt: 20,
      archiveRevision: 2,
      time: { created: 1, updated: 20, archived: 20 },
    }),
  )
  expect(fences.get("ses_0")).toBeUndefined()
  expect(fences.get("ses_1")?.archiveRevision).toBe(2)
  const latest = `ses_${SESSION_MANAGEMENT_FENCE_LIMIT}`
  ctx.apply({ type: "session.updated", properties: { info: { ...info(10), id: latest } } })
  expect(ctx.store.session.map((value) => value.id)).toEqual([info().id])
  ctx.apply({ type: "session.updated", properties: { info: { ...info(30), id: latest } } })
  expect(fences.get(latest)).toBeUndefined()
  expect(ctx.store.session.some((value) => value.id === latest)).toBe(true)
})

test.each(["policy", "archive"] as const)("invalid %s event skips locally; following batch event still projects", (field) => {
  const ctx = service()
  ctx.store.remember({ ...info(), subagentModels: allow })
  const list = directory()
  const invalid =
    field === "policy"
      ? { ...policy(allow, 20, 2), properties: { sessionID: info().id, timestamp: 20, policy: { mode: "unknown" } } }
      : { ...archive(20, 20, 2), properties: { sessionID: info().id, timestamp: 20, archived: "wrong" } }
  expect(() =>
    [invalid, policy(deny, 30, 3)].forEach((event) => {
      ctx.store.apply(event)
      list.apply(event)
    }),
  ).not.toThrow()
  expect(ctx.store.get(info().id)?.subagentModels).toEqual(deny)
  expect(list.store.session[0]?.subagentModels).toEqual(deny)
  expect(ctx.store.get(info().id)?.time.archived).toBeUndefined()
  expect(ctx.requests).toEqual([])
})

test("invalid cold management events log and skip without snapshot recovery", async () => {
  const ctx = service()
  await ctx.store.apply({
    type: "session.next.subagent.models.changed",
    properties: { sessionID: info().id, timestamp: 20, policy: {} },
  })
  await ctx.store.apply({ type: "session.next.archive.changed" })
  expect(ctx.requests).toEqual([])
  expect(ctx.store.get(info().id)).toBeUndefined()
  const pending = ctx.store.apply(policy(allow, 30, 3))
  ctx.gate.resolve()
  await pending
  expect(ctx.store.get(info().id)?.subagentModels).toEqual(allow)
})
