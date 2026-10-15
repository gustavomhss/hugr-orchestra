import { expect, test } from "bun:test"
import type { SessionApi, SessionInfo } from "@opencode-ai/client/promise"
import type { OrchestraClient } from "@orchestra/sdk/v2/client"
import { createRoot } from "solid-js"
import { createStore } from "solid-js/store"
import { createDirSyncContext } from "../directory-sync"
import { createServerSession } from "../server-session"
import { applySessionPolicyEvent } from "../server-sync"
import { applyDirectoryEvent } from "./event-reducer"
import type { State } from "./types"
import type { AppSession, SessionManagementEvent } from "@/utils/session"
import type { ServerApi } from "@/utils/server"

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

function projection(get: SessionApi["get"], list: () => SessionInfo[] = () => []) {
  return createRoot((dispose) => {
    const server = createServerSession({} as OrchestraClient, { get } as SessionApi, {} as ServerApi["message"])
    const [store, setStore] = createStore({
      status: "complete", session: [], sessionTotal: 0, limit: 10,
      message: {}, session_message: {}, part: {}, part_text_accum_delta: {},
      session_status: {}, session_diff: {}, todo: {}, permission: {}, question: {},
    } as unknown as State)
    const publish = (rows: AppSession[]) => rows.forEach((info) => project({ type: "session.created", properties: { info } }))
    const project = (event: SessionManagementEvent) => applyDirectoryEvent({
      event, readSession: server.get, store, setStore, directory: "/repo", push() {}, loadLsp() {},
    })
    const directory = createDirSyncContext("/repo", {
      session: server,
      child: () => [store, setStore],
    } as unknown as Parameters<typeof createDirSyncContext>[1], {
      createClient: () => ({}),
      api: { session: { list: async () => ({ data: list(), cursor: {} }) } },
    } as unknown as Parameters<typeof createDirSyncContext>[2])
    return {
      dispose, server, store, setStore, directory, project, publish,
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

  // Exercise the real list publication path, not a stand-in for remember/merge.
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
  ctx.project({ type: "session.updated", properties: { info: { ...ctx.server.get("session"),
    subagentModels: denied, subagentModelsChangedAt: undefined, subagentModelsRevision: undefined,
    subagentModelsReadReceipt: undefined, title: "general snapshot", time: { created: 1, updated: 40 },
  } } })
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
  // This GET starts after seq 2. Only eviction, not another target event, can invalidate it.
  ctx.setStore("limit", 2_049)
  const target = ctx.apply(policyEvent("ses_target", 2, denied))!
  const pressure = Array.from({ length: 2_048 }, (_, index) =>
    ctx.apply(policyEvent(`ses_pressure-${index.toString().padStart(4, "0")}`, 1, inherited)))
  // The fence is gone, but the protected request still owns observed seq 2.
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
})

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
  // A is seq 2; C was read after a lost seq 4. The client has observed only seq 2.
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

  // A future legitimate change is not suppressed: its canonical GET admits B.
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
      applyDirectoryEvent({
        event: { type: "session.created", properties: { info: row } },
        readSession: ctx.server.get, store: owner[0], setStore: owner[1],
        directory: row.directory, push() {}, loadLsp() {},
      })
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
})

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
