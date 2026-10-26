import { expect, spyOn, test } from "bun:test"
import type { SessionInfo } from "@/v2-types"

import { createRoot } from "solid-js"
import { createStore } from "solid-js/store"
import type { State } from "@/context/global-sync/types"
import type { AppSession, SessionManagementEvent } from "@/utils/session"
import type { ServerApi } from "@/utils/server"
import { solidDom } from "./solid-dom"

// Lifted from frozen peer e6c39ff's 319-line proof; run the real local graph in the existing DOM isolation lane.
const { createDirSyncContext }: typeof import("@/context/directory-sync") = await import(solidDom("@/context/directory-sync", import.meta.dir))
const { createServerSession }: typeof import("@/context/server-session") = await import(solidDom("@/context/server-session", import.meta.dir))
const { applySessionPolicyEvent }: typeof import("@/context/server-sync") = await import(solidDom("@/context/server-sync", import.meta.dir))
const { applyDirectoryEvent, upsertDirectorySession }: typeof import("@/context/global-sync/event-reducer") = await import(solidDom("@/context/global-sync/event-reducer", import.meta.dir))
const { createApiForServer }: typeof import("@/utils/server") = await import(solidDom("@/utils/server", import.meta.dir))
const { normalizeSessionInfo, applySessionManagementEvent }: typeof import("@/utils/session") = await import(solidDom("@/utils/session", import.meta.dir))

const denied = { mode: "allowlist", models: [] } as const
const inherited = { mode: "inherit" } as const

function snapshot(id: string, policy: AppSession["subagentModels"], updated = 10, title = id) {
  return {
    id, projectID: "project", location: { directory: "/repo" }, title,
    agent: "build", model: { providerID: "provider", id: "model" }, cost: 0,
    tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
    time: { created: 1, updated }, subagentModels: policy,
  } as SessionInfo
}

function policyEvent(id: string, seq: number, policy: AppSession["subagentModels"], timestamp = 10) {
  return {
    type: "session.next.subagent.models.changed",
    properties: { sessionID: id, policy, timestamp },
    current: { durable: { aggregateID: id, seq, version: 1 } },
  }
}

function projection(get: ServerApi["session"]["get"], list: () => SessionInfo[] = () => []) {
  return createRoot((dispose) => {
    const server = createServerSession({ get } as ServerApi["session"], {} as ServerApi["message"], { todo: async () => [] })
    const [store, setStore] = createStore({
      status: "complete", session: [], sessionTotal: 0, limit: 10,
      message: {}, session_message: {}, part: {},
      session_status: {}, todo: {}, permission: {}, question: {},
    } as unknown as State)
    const owner = { readSession: server.get, fenceOwner: server, store, setStore, directory: "/repo", push() {} }
    // A full row reaches the index from a canonical read, or counted as a newly created Session.
    const upsert = (info: AppSession, counted = false) => upsertDirectorySession(owner, info, counted)
    const publish = (rows: AppSession[]) => rows.forEach((info) => upsert(info, true))
    const project = (event: SessionManagementEvent) => applyDirectoryEvent({ ...owner, event })
    const directory = createDirSyncContext("/repo", {
      session: server,
      child: () => [store, setStore],
    } as unknown as Parameters<typeof createDirSyncContext>[1], {
      api: { session: { list: async () => ({ data: list(), cursor: {} }) } },
    } as unknown as Parameters<typeof createDirSyncContext>[2])
    return {
      dispose, server, store, setStore, directory, project, upsert, publish,
      apply(event: SessionManagementEvent) {
        const recovery = server.apply(event)
        project(event)
        return recovery?.then(publish)
      },
    }
  })
}

test("actual stores order policy seq 2 -> 3 at time 10 after unrelated updated time 20", async () => {
  const rows = { value: [snapshot("session", inherited, 20, "renamed")] }
  const ctx = projection(async () => rows.value[0]!, () => rows.value)
  await ctx.directory.session.fetch()
  ctx.apply(policyEvent("session", 2, denied))
  const initial = ctx.server.get("session")!
  expect(initial.title).toBe("renamed")
  expect(initial.time.updated).toBe(20)
  expect(initial.subagentModels).toEqual(denied)
  expect(initial.subagentModelsChangedAt).toBe(10)
  expect(initial.subagentModelsRevision).toBe(2)
  ctx.apply(policyEvent("session", 3, inherited))
  expect(ctx.server.get("session")?.subagentModels).toEqual(inherited)
  expect((ctx.store.session[0] as AppSession).subagentModels).toEqual(inherited)
  expect((ctx.store.session[0] as AppSession).subagentModelsRevision).toBe(3)

  rows.value = [snapshot("session", denied, 30, "HTTP title")]
  await ctx.directory.session.fetch()
  expect(ctx.server.get("session")?.title).toBe("HTTP title")
  expect(ctx.server.get("session")?.subagentModels).toEqual(inherited)
  const listed = ctx.store.session[0] as AppSession
  expect(listed.title).toBe("HTTP title")
  expect(listed.time.updated).toBe(30)
  expect(listed.subagentModels).toEqual(inherited)
  expect(listed.subagentModelsChangedAt).toBe(10)
  expect(listed.subagentModelsRevision).toBe(3)
  ctx.upsert({ ...ctx.server.get("session")!,
    subagentModels: denied, subagentModelsChangedAt: undefined, subagentModelsRevision: undefined,
    subagentModelsReadReceipt: undefined, title: "general snapshot", time: { created: 1, updated: 40 },
  })
  expect(ctx.store.session[0]?.title).toBe("general snapshot")
  expect((ctx.store.session[0] as AppSession).subagentModels).toEqual(inherited)
  ctx.dispose()
})

test("actual canonical resolve retries pre-event reads and replaces same-time lost SSE policy with a local receipt", async () => {
  const stale = Promise.withResolvers<SessionInfo>()
  const fresh = Promise.withResolvers<SessionInfo>()
  const retryStarted = Promise.withResolvers<void>()
  const requests: string[] = []
  const first = { mode: "allowlist", models: [{ providerID: "provider", id: "first" }] } as const
  const second = { mode: "allowlist", models: [{ providerID: "provider", id: "second" }] } as const
  const ctx = projection((input) => {
    requests.push(input.sessionID)
    if (requests.length === 1) return Promise.resolve(snapshot(input.sessionID, denied))
    if (requests.length === 2) return stale.promise
    retryStarted.resolve()
    return fresh.promise
  }, () => [snapshot("session", denied, 50, "list title")])
  ctx.publish([await ctx.server.resolve("session")])
  const receipt = ctx.server.get("session")?.subagentModelsReadReceipt
  expect(typeof receipt).toBe("number")
  expect(ctx.server.get("session")?.subagentModelsChangedAt).toBeUndefined()
  ctx.apply(policyEvent("session", 2, first))
  const pending = ctx.server.resolve("session", { force: true }).then((row) => {
    ctx.publish([row])
    return row
  })
  const recovery = ctx.apply(policyEvent("session", 3, second))
  stale.resolve(snapshot("session", first, 10, "stale read"))
  await Promise.race([retryStarted.promise, pending.then(() => {
    throw new Error("Pre-event response escaped before a fresh canonical retry")
  })])
  expect(requests).toEqual(["session", "session", "session"])
  expect(ctx.server.get("session")?.title).toBe("session")
  expect(ctx.server.get("session")?.subagentModels).toEqual(denied)
  expect(ctx.store.session[0]?.title).toBe("session")
  expect((ctx.store.session[0] as AppSession).subagentModels).toEqual(denied)

  // Backend changed again in the same millisecond; its SSE was lost. No guessed seq 4.
  fresh.resolve(snapshot("session", inherited, 10, "canonical read"))
  const result = await pending
  await recovery
  expect(result.subagentModelsReadReceipt).toBeGreaterThan(receipt!)
  expect(result.subagentModels).toEqual(inherited)
  expect(result.subagentModelsRevision).toBe(3)
  expect(result.subagentModelsChangedAt).toBe(10)
  const canonical = ctx.store.session[0] as AppSession
  expect(canonical.title).toBe("canonical read")
  expect(canonical.subagentModels).toEqual(inherited)
  expect(canonical.subagentModelsReadReceipt).toBe(result.subagentModelsReadReceipt)
  expect(canonical.subagentModelsRevision).toBe(3)
  ctx.apply(policyEvent("session", 2, denied, 100))
  expect(ctx.server.get("session")?.subagentModels).toEqual(inherited)
  expect((ctx.store.session[0] as AppSession).subagentModels).toEqual(inherited)
  expect((ctx.store.session[0] as AppSession).subagentModelsRevision).toBe(3)
  await ctx.directory.session.fetch()
  const listed = ctx.store.session[0] as AppSession
  expect(listed.title).toBe("list title")
  expect(listed.time.updated).toBe(50)
  expect(listed.subagentModels).toEqual(inherited)
  expect(listed.subagentModelsReadReceipt).toBe(result.subagentModelsReadReceipt)
  expect(listed.subagentModelsRevision).toBe(3)
  ctx.dispose()
})

test("missing-row fence eviction invalidates a protected post-event read before any stale publication", async () => {
  const stale = Promise.withResolvers<SessionInfo>()
  const fresh = Promise.withResolvers<SessionInfo>()
  const retryStarted = Promise.withResolvers<void>()
  const targetReads: string[] = []
  const ctx = projection((input) => {
    if (input.sessionID !== "ses_target") return Promise.resolve(snapshot(input.sessionID, inherited))
    targetReads.push(input.sessionID)
    if (targetReads.length === 1) return stale.promise
    retryStarted.resolve()
    return fresh.promise
  })
  ctx.setStore("limit", 2_049)
  const target = ctx.apply(policyEvent("ses_target", 2, denied))!
  const pressure = Array.from({ length: 2_048 }, (_, index) =>
    ctx.apply(policyEvent(`ses_pressure-${index.toString().padStart(4, "0")}`, 1, inherited)))
  expect(ctx.apply(policyEvent("ses_target", 1, inherited, 100))).toBeUndefined()
  expect(ctx.apply(policyEvent("ses_target", 2, inherited, 100))).toBeUndefined()
  stale.resolve(snapshot("ses_target", denied, 10, "stale read"))
  await Promise.race([retryStarted.promise, target.then(() => {
    throw new Error("Evicted fence allowed its protected stale read to publish")
  })])
  expect(targetReads).toEqual(["ses_target", "ses_target"])
  expect(ctx.server.get("ses_target")).toBeUndefined()
  expect(ctx.store.session.find((row) => row.id === "ses_target")).toBeUndefined()
  fresh.resolve(snapshot("ses_target", inherited, 10, "canonical recovery"))
  await Promise.all([target, ...pressure])
  const recovered = ctx.server.get("ses_target")!
  expect(recovered.title).toBe("canonical recovery")
  expect(recovered.subagentModels).toEqual(inherited)
  expect(recovered.subagentModelsRevision).toBe(2)
  const projected = ctx.store.session.find((row) => row.id === "ses_target") as AppSession
  expect(projected.title).toBe("canonical recovery")
  expect(projected.subagentModels).toEqual(inherited)
  expect(projected.subagentModelsRevision).toBe(2)
  expect(projected.subagentModelsReadReceipt).toBe(ctx.server.get("ses_target")?.subagentModelsReadReceipt)
  ctx.apply(policyEvent("ses_target", 1, denied, 100))
  expect(ctx.server.get("ses_target")?.subagentModels).toEqual(inherited)
  expect(ctx.apply(policyEvent("ses_target", 2, denied, 100))).toBeUndefined()
  expect(ctx.server.get("ses_target")?.subagentModelsRevision).toBe(2)
  expect((ctx.store.session.find((row) => row.id === "ses_target") as AppSession).subagentModels).toEqual(inherited)
  expect(targetReads).toEqual(["ses_target", "ses_target"])
  ctx.dispose()
}, 120_000)

test.each([10, 100])("canonical C holds against delayed B seq 3 at time %s until a fresh GET reconciles both stores", async (timestamp) => {
  const read = Promise.withResolvers<SessionInfo>()
  const future = Promise.withResolvers<SessionInfo>()
  const requests: string[] = []
  const delayed = { mode: "allowlist", models: [{ providerID: "provider", id: "B" }] } as const
  const ctx = projection((input) => {
    requests.push(input.sessionID)
    if (requests.length === 1) return Promise.resolve(snapshot(input.sessionID, inherited))
    if (requests.length === 2) return read.promise
    return future.promise
  }, () => [snapshot("ses_canonical", denied)])
  await ctx.directory.session.fetch()
  ctx.apply(policyEvent("ses_canonical", 2, denied))
  ctx.publish([await ctx.server.resolve("ses_canonical", { force: true })])
  const receipt = ctx.server.get("ses_canonical")?.subagentModelsReadReceipt
  expect(ctx.server.get("ses_canonical")?.subagentModels).toEqual(inherited)
  expect(ctx.server.get("ses_canonical")?.subagentModelsRevision).toBe(2)
  const recovery = ctx.apply(policyEvent("ses_canonical", 3, delayed, timestamp))
  expect(requests).toEqual(["ses_canonical", "ses_canonical"])
  expect(ctx.server.get("ses_canonical")?.subagentModels).toEqual(inherited)
  expect(ctx.server.get("ses_canonical")?.subagentModelsRevision).toBe(3)
  expect(ctx.server.get("ses_canonical")?.subagentModelsReadReceipt).toBe(receipt)
  expect((ctx.store.session[0] as AppSession).subagentModels).toEqual(inherited)
  expect((ctx.store.session[0] as AppSession).subagentModelsRevision).toBe(3)
  expect((ctx.store.session[0] as AppSession).subagentModelsReadReceipt).toBe(receipt)
  read.resolve(snapshot("ses_canonical", inherited))
  await recovery
  expect(ctx.server.get("ses_canonical")?.subagentModels).toEqual(inherited)
  expect((ctx.store.session[0] as AppSession).subagentModels).toEqual(inherited)
  expect(ctx.server.get("ses_canonical")!.subagentModelsReadReceipt).toBeGreaterThan(receipt!)

  const update = ctx.apply(policyEvent("ses_canonical", 5, delayed, 200))
  expect(ctx.server.get("ses_canonical")?.subagentModels).toEqual(inherited)
  expect((ctx.store.session[0] as AppSession).subagentModels).toEqual(inherited)
  future.resolve(snapshot("ses_canonical", delayed, 200))
  await update
  expect(ctx.server.get("ses_canonical")?.subagentModels).toEqual(delayed)
  expect(ctx.server.get("ses_canonical")?.subagentModelsRevision).toBe(5)
  expect((ctx.store.session[0] as AppSession).subagentModels).toEqual(delayed)
  expect((ctx.store.session[0] as AppSession).subagentModelsRevision).toBe(5)
  expect(requests).toEqual(["ses_canonical", "ses_canonical", "ses_canonical"])
  ctx.dispose()
})

test("actual server-sync recovery boundary indexes evicted A in A's live owner after a B event retries A's failed GET", async () => {
  const retryStarted = Promise.withResolvers<void>()
  const read = Promise.withResolvers<SessionInfo>()
  const requests: string[] = []
  const ctx = projection((input) => {
    if (input.sessionID !== "ses_A") return Promise.resolve({
      ...snapshot(input.sessionID, inherited), location: { directory: "/other" },
    })
    requests.push(input.sessionID)
    if (requests.length === 1) return Promise.reject(new Error("A read failed"))
    retryStarted.resolve()
    return read.promise
  })
  ctx.setStore("limit", 2_050)
  const [other, setOther] = createStore<State>({ ...ctx.store, session: [], sessionTotal: 0 })
  const children: Record<string, readonly [typeof ctx.store, typeof ctx.setStore] | undefined> = {
    "/repo": [ctx.store, ctx.setStore], "/other": [other, setOther],
  }
  const dispatch = (event: SessionManagementEvent) => applySessionPolicyEvent({
    event, session: ctx.server, children, disposed: () => false,
    indexSession(row) {
      const owner = children[row.directory]
      if (!owner) throw new Error(`Missing directory owner for ${row.directory}`)
      upsertDirectorySession({
        readSession: ctx.server.get, fenceOwner: ctx.server, store: owner[0], setStore: owner[1],
        directory: row.directory, push() {},
      }, row, true)
    },
  })
  await expect(dispatch(policyEvent("ses_A", 2, denied))).rejects.toThrow("A read failed")
  const pressure = Array.from({ length: 2_048 }, (_, index) =>
    dispatch(policyEvent(`ses_B-${index.toString().padStart(4, "0")}`, 1, inherited)))
  await retryStarted.promise
  expect(requests).toEqual(["ses_A", "ses_A"])
  expect(ctx.store.session.find((row) => row.id === "ses_A")).toBeUndefined()
  read.resolve(snapshot("ses_A", inherited, 10, "A recovered"))
  await Promise.all(pressure)
  const recovered = ctx.store.session.find((row) => row.id === "ses_A") as AppSession
  expect(recovered.title).toBe("A recovered")
  expect(recovered.directory).toBe("/repo")
  expect(recovered.subagentModels).toEqual(inherited)
  expect(recovered.subagentModelsRevision).toBe(2)
  expect(recovered.subagentModelsReadReceipt).toBe(ctx.server.get("ses_A")?.subagentModelsReadReceipt)
  expect(other.session.find((row) => row.id === "ses_A")).toBeUndefined()
  expect(other.session.some((row) => row.directory === "/other")).toBe(true)
  ctx.dispose()
}, 120_000)

test.each(["replaced", "disposed"])("actual server-sync recovery boundary rejects %s owner before publication", async (kind) => {
  const read = Promise.withResolvers<SessionInfo>()
  const ctx = projection(() => read.promise)
  const children: Record<string, object | undefined> = { "/repo": [ctx.store, ctx.setStore] }
  const state = { disposed: false }
  const recovery = applySessionPolicyEvent({
    event: policyEvent("ses_owner", 2, denied), session: ctx.server, children,
    disposed: () => state.disposed, indexSession: (row) => ctx.publish([row]),
  })
  if (kind === "replaced") children["/repo"] = [ctx.store, ctx.setStore]
  if (kind === "disposed") state.disposed = true
  read.resolve(snapshot("ses_owner", inherited))
  await recovery
  expect(ctx.server.get("ses_owner")?.subagentModels).toEqual(inherited)
  expect(ctx.store.session.find((row) => row.id === "ses_owner")).toBeUndefined()
  ctx.dispose()
})

test.each([-1, 0.5, Number.MAX_SAFE_INTEGER + 1, NaN, Infinity])("invalid sequence %s cannot become a policy ordering floor", async (seq) => {
  const ctx = projection(async () => snapshot("ses_safe", inherited), () => [snapshot("ses_safe", inherited, 100)])
  await ctx.directory.session.fetch()
  ctx.apply(policyEvent("ses_safe", seq, denied, 0))
  expect(ctx.server.get("ses_safe")?.subagentModelsRevision).toBeUndefined()
  ctx.apply(policyEvent("ses_safe", 0, inherited, 0))
  expect(ctx.server.get("ses_safe")?.subagentModelsRevision).toBe(0)
  expect(ctx.server.get("ses_safe")?.subagentModelsChangedAt).toBe(0)
  expect(ctx.server.get("ses_safe")?.time.updated).toBe(100)
  ctx.dispose()
})

test("policy-invalidated rejected GET retries without minting a failed-read receipt", async () => {
  const failed = Promise.withResolvers<SessionInfo>()
  const fresh = Promise.withResolvers<SessionInfo>()
  const started = Promise.withResolvers<void>()
  const requests: string[] = []
  const ctx = projection((input) => {
    requests.push(input.sessionID)
    if (requests.length === 1) return failed.promise
    started.resolve()
    return fresh.promise
  })
  const pending = ctx.server.resolve("ses_rejected", { force: true })
  const recovery = ctx.apply(policyEvent("ses_rejected", 2, denied))
  failed.reject(new Error("pre-event GET rejected"))
  await Promise.race([started.promise, pending.then(() => { throw new Error("Failed GET escaped") })])
  expect(ctx.server.get("ses_rejected")).toBeUndefined()
  expect(ctx.store.session).toEqual([])
  fresh.resolve(snapshot("ses_rejected", inherited))
  await Promise.all([pending, recovery])
  expect(ctx.server.get("ses_rejected")?.subagentModelsReadReceipt).toBe(1)
  expect(ctx.server.get("ses_rejected")?.subagentModelsRevision).toBe(2)
  expect(ctx.store.session[0]?.subagentModels).toEqual(inherited)
  expect(requests).toEqual(["ses_rejected", "ses_rejected"])
  ctx.dispose()
})

test("only a valid canonical GET mints a numeric local receipt", async () => {
  const state = { valid: false }
  const http = { url: "https://valid-policy-read.test" }
  const fetcher = Object.assign(async () => Response.json({
    data: state.valid ? snapshot("ses_valid", inherited) : { ...snapshot("ses_valid", denied), subagentModels: { mode: "invalid" } },
  }), { preconnect: fetch.preconnect })
  const api = createApiForServer({ server: http, fetch: fetcher })
  const server = createServerSession(api.session, api.message, { todo: async () => [] })
  server.remember(normalizeSessionInfo(snapshot("ses_valid", denied)))
  await expect(server.resolve("ses_valid", { force: true })).rejects.toThrow()
  expect(server.get("ses_valid")?.subagentModelsReadReceipt).toBeUndefined()
  expect(server.get("ses_valid")?.subagentModels).toEqual(denied)
  state.valid = true
  const result = await server.resolve("ses_valid", { force: true })
  expect(result.subagentModelsReadReceipt).toBe(1)
  expect(result.subagentModelsChangedAt).toBeUndefined()
  expect(result.subagentModelsRevision).toBeUndefined()
  expect(result.subagentModels).toEqual(inherited)
})

test("policy receipt leaves epoch-zero archive metadata fenced until a sequenced restore", async () => {
  const ctx = projection(async () => snapshot("ses_epoch", inherited, 0))
  const archive = (archived: number | null, seq: number) => ({
    type: "session.next.archive.changed", properties: { sessionID: "ses_epoch", timestamp: 0, archived },
    current: { durable: { seq } },
  })
  await ctx.apply(archive(0, 0))
  await ctx.server.resolve("ses_epoch", { force: true })
  expect(ctx.server.get("ses_epoch")?.time.archived).toBe(0)
  expect(ctx.server.get("ses_epoch")?.archiveChangedAt).toBe(0)
  expect(ctx.server.get("ses_epoch")?.archiveRevision).toBe(0)
  expect(ctx.store.session).toEqual([])
  ctx.apply(archive(null, 1))
  ctx.publish([ctx.server.get("ses_epoch")!])
  expect(ctx.store.session[0]?.time.archived).toBeUndefined()
  expect(ctx.store.session[0]?.archiveRevision).toBe(1)
  ctx.dispose()
})

test("publication rereads current row after a later deletion instead of indexing the recovered snapshot", async () => {
  const read = Promise.withResolvers<SessionInfo>()
  const ctx = projection(() => read.promise)
  const pending = ctx.server.resolve("ses_late", { force: true })
  void pending.then(() => ctx.server.apply({ type: "session.next.deleted", properties: { timestamp: 20, sessionID: "ses_late" } }))
  const recovery = applySessionPolicyEvent({
    event: policyEvent("ses_late", 2, denied), session: ctx.server,
    children: { "/repo": [ctx.store, ctx.setStore] }, disposed: () => false, indexSession: (row) => ctx.publish([row]),
  })
  read.resolve(snapshot("ses_late", inherited))
  await recovery
  expect(ctx.server.get("ses_late")).toBeUndefined()
  expect(ctx.store.session).toEqual([])
  ctx.dispose()
})

test.each(["created", "read", "consumed policy"])("directory %s forwards canonical server policy over a stale visible row", async (type) => {
  const ctx = projection(async () => snapshot("ses_forward", inherited), () => [snapshot("ses_forward", inherited)])
  await ctx.directory.session.fetch()
  ctx.apply(policyEvent("ses_forward", 2, denied))
  await ctx.server.resolve("ses_forward", { force: true })
  const receipt = ctx.server.get("ses_forward")?.subagentModelsReadReceipt
  const stale = normalizeSessionInfo(snapshot("ses_forward", denied, 100, "general title"))
  ctx.setStore("session", [stale])
  if (type === "consumed policy") ctx.project(policyEvent("ses_forward", 2, denied, 100))
  if (type !== "consumed policy") ctx.upsert(stale, type === "created")
  expect(ctx.store.session[0]?.subagentModels).toEqual(inherited)
  expect(ctx.store.session[0]?.subagentModelsRevision).toBe(2)
  expect(ctx.store.session[0]?.subagentModelsReadReceipt).toBe(receipt)
  ctx.dispose()
})

test("recovery publication rejects replacement server even when directory tuple remains live", async () => {
  const read = Promise.withResolvers<SessionInfo>()
  const ctx = projection(() => read.promise)
  const other = projection(async () => snapshot("ses_server", denied))
  const input = {
    event: policyEvent("ses_server", 2, denied), session: ctx.server,
    children: { "/repo": [ctx.store, ctx.setStore] }, disposed: () => false, indexSession: (row: AppSession) => ctx.publish([row]),
  }
  const recovery = applySessionPolicyEvent(input)
  input.session = other.server
  read.resolve(snapshot("ses_server", inherited))
  await recovery
  expect(ctx.server.get("ses_server")?.subagentModels).toEqual(inherited)
  expect(ctx.store.session).toEqual([])
  expect(other.server.get("ses_server")).toBeUndefined()
  ctx.dispose()
  other.dispose()
})

test("observed policy sequence rejects an older sequence even with a newer event timestamp", async () => {
  const ctx = projection(async () => snapshot("ses_order", inherited), () => [snapshot("ses_order", inherited, 20)])
  await ctx.directory.session.fetch()
  ctx.apply(policyEvent("ses_order", 3, denied, 10))
  expect(applySessionManagementEvent(ctx.server.get("ses_order")!, policyEvent("ses_order", 2, inherited, 100))).toBeUndefined()
  expect(ctx.server.get("ses_order")?.subagentModelsRevision).toBe(3)
  expect(ctx.server.get("ses_order")?.subagentModels).toEqual(denied)
  ctx.dispose()
})

test.each(["B fails before A", "B fails after A", "both succeed", "disposed owner", "all fail"])(
  "independent policy recovery settlement: %s",
  async (scenario) => {
    const initialError = new Error("initial A GET failed")
    const bError = new Error("B GET failed")
    const aError = new Error("recovered A GET failed")
    const a = Promise.withResolvers<SessionInfo>()
    const b = Promise.withResolvers<SessionInfo>()
    const requests: string[] = []
    const ctx = projection((input) => {
      requests.push(input.sessionID)
      if (input.sessionID === "ses_partial_A") return requests.length === 1 ? Promise.reject(initialError) : a.promise
      if (input.sessionID === "ses_partial_B") return b.promise
      throw new Error(`Unexpected GET ${input.sessionID}`)
    })
    const diagnostics = spyOn(console, "error")
    const [other, setOther] = createStore<State>({ ...ctx.store, session: [], sessionTotal: 0 })
    const state = { disposed: false }
    const children: Record<string, readonly [typeof ctx.store, typeof ctx.setStore]> = {
      "/repo": [ctx.store, ctx.setStore], "/other": [other, setOther],
    }
    const dispatch = (event: SessionManagementEvent) => applySessionPolicyEvent({
      event, session: ctx.server, children, disposed: () => state.disposed,
      indexSession(row) {
        const owner = children[row.directory === "/repo" ? "/repo" : "/other"]
        if (!owner) throw new Error(`Missing captured owner ${row.directory}`)
        upsertDirectorySession({
          readSession: ctx.server.get, fenceOwner: ctx.server, store: owner[0], setStore: owner[1],
          directory: row.directory, push() {},
        }, row, true)
      },
    })
    try {
      await expect(dispatch(policyEvent("ses_partial_A", 2, denied))).rejects.toBe(initialError)
      // Fill the real bounded fence using cached rows; no pressure GETs or stand-in recovery logic.
      Array.from({ length: 2_047 }, (_, index) => {
        const id = `ses_cached-${index.toString().padStart(4, "0")}`
        ctx.server.remember(normalizeSessionInfo(snapshot(id, inherited)))
        expect(ctx.server.apply(policyEvent(id, 1, inherited))).toBeUndefined()
      })
      expect(requests).toEqual(["ses_partial_A"])
      diagnostics.mockClear()
      const pending = dispatch(policyEvent("ses_partial_B", 1, inherited))!
      const settled = pending.then(() => undefined, (error: unknown) => error)
      expect(requests).toEqual(["ses_partial_A", "ses_partial_A", "ses_partial_B"])
      if (scenario === "disposed owner") state.disposed = true
      if (scenario === "B fails before A" || scenario === "all fail") b.reject(bError)
      if (scenario === "all fail") a.reject(aError)
      if (scenario !== "all fail") a.resolve(snapshot("ses_partial_A", inherited, 10, "A recovered"))
      if (scenario === "both succeed") b.resolve({ ...snapshot("ses_partial_B", inherited), location: { directory: "/other" } })
      if (scenario === "B fails after A" || scenario === "disposed owner") {
        await ctx.server.resolve("ses_partial_A", { force: true })
        b.reject(bError)
      }
      const failure = await settled
      if (scenario === "all fail") {
        expect(failure).toBe(bError)
        expect(ctx.server.get("ses_partial_A")).toBeUndefined()
        expect(ctx.store.session).toEqual([])
        expect(diagnostics.mock.calls.map((call) => call[1].error)).toEqual([bError, aError])
        return
      }
      const canonical = ctx.server.get("ses_partial_A")!
      expect(canonical.subagentModelsRevision).toBe(2)
      expect(canonical.subagentModelsReadReceipt).toBe(1)
      expect(canonical.title).toBe("A recovered")
      if (scenario === "disposed owner") expect(ctx.store.session).toEqual([])
      if (scenario !== "disposed owner") {
        const published = ctx.store.session.find((row) => row.id === "ses_partial_A")!
        expect(published).toBeDefined()
        expect(published.subagentModelsRevision).toBe(2)
        expect(published.subagentModelsReadReceipt).toBe(1)
        expect(published.title).toBe("A recovered")
      }
      expect(failure).toBeUndefined()
      expect(other.session.some((row) => row.id === "ses_partial_B")).toBe(scenario === "both succeed")
      if (scenario === "both succeed") {
        expect(other.session.find((row) => row.id === "ses_partial_B")?.subagentModelsRevision).toBe(1)
        expect(other.session.find((row) => row.id === "ses_partial_B")?.subagentModelsReadReceipt).toBe(2)
      }
      expect(other.session.some((row) => row.id === "ses_partial_A")).toBe(false)
      expect(diagnostics.mock.calls.map((call) => call[1].error)).toEqual(scenario === "both succeed" ? [] : [bError])
    } finally {
      diagnostics.mockRestore()
      ctx.dispose()
    }
  },
  120_000,
)
