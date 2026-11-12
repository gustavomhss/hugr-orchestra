/** @jsxImportSource @opentui/solid */
import { expect, test } from "bun:test"
import type { GlobalEvent } from "../../../../src/types"
import { tmpdir } from "../../../fixture/fixture"
import { v2Session, type FetchHandler } from "../../../fixture/tui-sdk"
import { directory, json, mount, wait } from "./sync-fixture"

const sessionID = "ses_recovery_boundary"
const otherID = "ses_recovery_independent"

test("forced hydration waits for failed children, coalesces callers and leaves other Sessions independent", async () => {
  const results = []
  // Execute all variants before checking the regression outcomes, including metadata/todo rejection while history is held.
  for (const failure of ["history", "metadata", "todo"]) {
    await using tmp = await tmpdir()
    await Bun.write(`${tmp.path}/kv.json`, "{}")
    const history = Promise.withResolvers<Response>()
    const failed = Promise.withResolvers<Response>()
    const problem = new Error(`${failure} failed with history pending`)
    const state = { reads: 0, active: 0, maximum: 0, metadata: 0, todo: 0 }
    const mounted = await mount(
      routes((url) => {
        if (url.pathname === `/api/session/${sessionID}` && ++state.metadata === 1 && failure === "metadata")
          return failed.promise
        if (url.pathname === `/api/session/${sessionID}/todo` && ++state.todo === 1 && failure === "todo")
          return failed.promise
        if (url.pathname !== `/api/session/${sessionID}/message`) return
        state.reads++
        state.maximum = Math.max(state.maximum, ++state.active)
        return (state.reads === 1 ? history.promise : Promise.resolve(messages("fresh"))).finally(() => state.active--)
      }),
      tmp.path,
    )
    const synchronize: (id: string, options?: { force?: boolean }) => Promise<void> = mounted.sync.session.sync
    const first = observe(synchronize(sessionID))
    await wait(() => state.reads === 1)
    if (failure !== "history") failed.reject(problem)
    // Complete B after the rejected HTTP child, without waiting for A's wrapper or releasing A's history.
    await synchronize(otherID)
    expect(text(mounted.sync, otherID)).toBe("ordinary")
    expect(state.reads).toBe(1)
    expect(state.active).toBe(1)
    const trailing = observe(synchronize(sessionID, { force: true }))
    const duplicate = observe(synchronize(sessionID, { force: true }))
    try {
      if (failure === "history") history.reject(problem)
      if (failure !== "history") history.resolve(messages("old"))
      results.push({
        failure,
        problem,
        first: await first,
        trailing: await trailing,
        duplicate: await duplicate,
        reads: state.reads,
        maximum: state.maximum,
        text: text(mounted.sync),
      })
    } finally {
      history.resolve(messages("cleanup"))
      failed.resolve(json({ data: [] }))
      await Promise.allSettled([first, trailing, duplicate])
      mounted.app.renderer.destroy()
    }
  }
  for (const result of results) {
    if (result.failure !== "history") expect(result.first).toMatchObject({ reason: "Transport", cause: result.problem })
    if (result.failure === "history") expect(result.first).toBeUndefined()
    expect(result.trailing).toBeUndefined()
    expect(result.duplicate).toBeUndefined()
    expect(result.reads).toBe(2)
    expect(result.maximum).toBe(1)
    expect(result.text).toBe("fresh")
  }
}, 20_000)

test("a reconnect forces a Session whose first history hydration is still pending", async () => {
  await using tmp = await tmpdir()
  await Bun.write(`${tmp.path}/kv.json`, "{}")
  const old = Promise.withResolvers<Response>()
  const state = { reads: 0, active: 0, maximum: 0 }
  const mounted = await mount(
    routes((url) => {
      if (url.pathname !== `/api/session/${sessionID}/message`) return
      state.reads++
      state.maximum = Math.max(state.maximum, ++state.active)
      return (state.reads === 1 ? old.promise : Promise.resolve(messages("recovered pending"))).finally(
        () => state.active--,
      )
    }),
    tmp.path,
  )
  const first = observe(mounted.sync.session.sync(sessionID))
  try {
    await wait(() => state.reads === 1)
    await emit(mounted, connected(1))
    expect(mounted.mounts.count).toBe(1)
    expect(state.active).toBe(1)
    await emit(mounted, connected(2))
    // No explicit force call: the real SDK/Sync recovery path must include this pending-only Session.
    old.resolve(messages("captured before gap"))
    await first
    await wait(() => state.reads === 2 && text(mounted.sync) === "recovered pending")
    expect(state.reads).toBe(2)
    expect(state.maximum).toBe(1)
    expect(mounted.mounts.count).toBe(1)
  } finally {
    old.resolve(messages("cleanup"))
    await first
    mounted.app.renderer.destroy()
  }
}, 15_000)

test("deletion skips old trailing hydration and reentry has a separate owner", async () => {
  await using tmp = await tmpdir()
  await Bun.write(`${tmp.path}/kv.json`, "{}")
  const old = Promise.withResolvers<Response>()
  const replacement = Promise.withResolvers<Response>()
  const state = { reads: 0 }
  const mounted = await mount(
    routes((url) => {
      if (url.pathname !== `/api/session/${sessionID}/message`) return
      state.reads++
      return state.reads === 1 ? old.promise : state.reads === 2 ? replacement.promise : messages("replacement fresh")
    }),
    tmp.path,
  )
  const synchronize: (id: string, options?: { force?: boolean }) => Promise<void> = mounted.sync.session.sync
  const first = observe(synchronize(sessionID))
  await wait(() => state.reads === 1)
  const obsolete = observe(synchronize(sessionID, { force: true }))
  const deleted = event({ id: "evt_boundary_deleted", type: "session.next.deleted", data: { timestamp: 5, sessionID } })
  mounted.emit(deleted)
  await wait(() => mounted.received.includes(deleted))
  // The replacement read must be admitted while the deleted generation is still pending.
  const next = observe(synchronize(sessionID))
  const trailing = observe(synchronize(sessionID, { force: true }))
  try {
    await wait(() => state.reads === 2)
    old.resolve(messages("deleted owner"))
    await Promise.all([first, obsolete])
    expect(state.reads).toBe(2)
    expect(text(mounted.sync)).not.toBe("deleted owner")
    const duplicate = observe(synchronize(sessionID, { force: true }))
    replacement.resolve(messages("replacement captured"))
    await Promise.all([next, trailing, duplicate])
    expect(state.reads).toBe(3)
    expect(text(mounted.sync)).toBe("replacement fresh")
  } finally {
    old.resolve(messages("cleanup old"))
    replacement.resolve(messages("cleanup replacement"))
    await Promise.allSettled([first, obsolete, next, trailing])
    mounted.app.renderer.destroy()
  }
}, 15_000)

test("first greeting accepts bootstrap but a later gap fences its old active snapshot without live status", async () => {
  const results = []
  for (const reconnect of [false, true]) {
    await using tmp = await tmpdir()
    await Bun.write(`${tmp.path}/kv.json`, "{}")
    const old = Promise.withResolvers<Response>()
    const state = { reads: 0 }
    const mounted = await mount(
      routes((url) => {
        if (url.pathname !== "/api/session/active") return
        return ++state.reads === 1 ? old.promise : json({ data: {} })
      }),
      tmp.path,
      undefined,
      undefined,
      { waitComplete: false },
    )
    try {
      await wait(() => state.reads === 1)
      await emit(mounted, connected(1))
      expect(mounted.mounts.count).toBe(1)
      if (reconnect) {
        await emit(mounted, connected(2))
        await wait(() => state.reads === 2)
        await wait(() => (mounted.sync.data.session_status[sessionID]?.type ?? "idle") === "idle")
      }
      old.resolve(json({ data: { [sessionID]: { type: "running" } } }))
      await wait(() => mounted.sync.status === "complete")
      results.push({
        reconnect,
        reads: state.reads,
        status: mounted.sync.data.session_status[sessionID]?.type ?? "idle",
      })
    } finally {
      old.resolve(json({ data: {} }))
      mounted.app.renderer.destroy()
    }
  }
  expect(results).toEqual([
    { reconnect: false, reads: 1, status: "busy" },
    { reconnect: true, reads: 2, status: "idle" },
  ])
}, 15_000)

test("native live execution and retry status survives a delayed bootstrap active snapshot", async () => {
  await using tmp = await tmpdir()
  await Bun.write(`${tmp.path}/kv.json`, "{}")
  const old = Promise.withResolvers<Response>()
  const mounted = await mount(
    routes((url) => (url.pathname === "/api/session/active" ? old.promise : undefined)),
    tmp.path,
    undefined,
    undefined,
    { waitComplete: false },
  )
  const tokens = { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } }
  try {
    await wait(() => mounted.requests.some((url) => url.pathname === "/api/session/active"))
    await emit(
      mounted,
      event({
        id: "evt_started",
        type: "session.next.step.started",
        data: {
          timestamp: 2,
          sessionID,
          assistantMessageID: "msg_boundary",
          agent: "maestro",
          model: { id: "model", providerID: "test" },
        },
      }),
    )
    expect(mounted.sync.data.session_status[sessionID]).toEqual({ type: "busy" })
    await emit(
      mounted,
      event({
        id: "evt_tools",
        type: "session.next.step.ended",
        data: {
          timestamp: 3,
          sessionID,
          assistantMessageID: "msg_boundary",
          finish: "tool-calls",
          cost: 0,
          tokens,
        },
      }),
    )
    expect(mounted.sync.data.session_status[sessionID]).toEqual({ type: "busy" })
    await emit(
      mounted,
      event({
        id: "evt_retry",
        type: "session.next.retried",
        data: {
          timestamp: 9,
          sessionID,
          attempt: 2,
          error: { message: "retry boundary", isRetryable: true },
        },
      }),
    )
    expect(mounted.sync.data.session_status[sessionID]).toEqual({
      type: "retry",
      attempt: 2,
      message: "retry boundary",
      next: 9,
    })
    old.resolve(json({ data: {} }))
    await wait(() => mounted.sync.status === "complete")
    expect(mounted.sync.data.session_status[sessionID]).toEqual({
      type: "retry",
      attempt: 2,
      message: "retry boundary",
      next: 9,
    })
    await emit(
      mounted,
      event({
        id: "evt_stop",
        type: "session.next.step.ended",
        data: {
          timestamp: 10,
          sessionID,
          assistantMessageID: "msg_boundary",
          finish: "stop",
          cost: 0,
          tokens,
        },
      }),
    )
    expect(mounted.sync.data.session_status[sessionID]?.type ?? "idle").toBe("idle")
    await emit(
      mounted,
      event({
        id: "evt_started_again",
        type: "session.next.step.started",
        data: {
          timestamp: 11,
          sessionID,
          assistantMessageID: "msg_boundary2",
          agent: "maestro",
          model: { id: "model", providerID: "test" },
        },
      }),
    )
    await emit(
      mounted,
      event({
        id: "evt_failed",
        type: "session.next.step.failed",
        data: {
          timestamp: 12,
          sessionID,
          assistantMessageID: "msg_boundary2",
          error: { type: "unknown", message: "failed" },
        },
      }),
    )
    expect(mounted.sync.data.session_status[sessionID]?.type ?? "idle").toBe("idle")
  } finally {
    old.resolve(json({ data: {} }))
    mounted.app.renderer.destroy()
  }
}, 15_000)

test("SDK connection epoch precedes fanout and a late Sync owner recovers without another greeting", async () => {
  await using tmp = await tmpdir()
  await Bun.write(`${tmp.path}/kv.json`, "{}")
  const mounted = await mount(
    routes((url) =>
      url.pathname === "/api/session/active" ? json({ data: { [sessionID]: { type: "running" } } }) : undefined,
    ),
    tmp.path,
    undefined,
    undefined,
    { delaySync: true },
  )
  const epochs: number[] = []
  const remove = mounted.sdk.event.on("event", (value) => {
    if (value.payload.type === "server.connected") epochs.push(epoch(mounted.sdk))
  })
  try {
    // This is an intentionally guarded future API assertion, not a module/type failure on the baseline.
    expect(epoch(mounted.sdk)).toBe(0)
    await emit(mounted, connected(1))
    await emit(mounted, connected(2))
    expect(epochs).toEqual([1, 2])
    expect(epoch(mounted.sdk)).toBe(2)
    await mounted.startSync()
    await wait(() => mounted.sync.status === "complete")
    expect(mounted.sync.data.session_status[sessionID]).toEqual({ type: "busy" })
    expect(mounted.requests.filter((url) => url.pathname === "/api/session/active").length).toBeGreaterThanOrEqual(1)
    expect(mounted.received.filter((value) => value.payload.type === "server.connected")).toHaveLength(2)
    expect(mounted.mounts.count).toBe(1)
    expect(mounted.requests.filter((url) => url.pathname === "/api/config")).toHaveLength(1)
  } finally {
    remove()
    mounted.app.renderer.destroy()
  }
}, 15_000)

test("SDK owner disposed during async subscribe releases its future subscription exactly once", async () => {
  await using tmp = await tmpdir()
  await Bun.write(`${tmp.path}/kv.json`, "{}")
  const subscription = Promise.withResolvers<() => void>()
  const state = { calls: 0, unsubscribed: 0, disposed: false }
  let deliver: ((event: GlobalEvent) => void) | undefined
  const mounted = await mount(routes(), tmp.path, undefined, undefined, {
    delaySync: true,
    events: {
      subscribe(handler) {
        deliver = handler
        state.calls++
        return subscription.promise
      },
    },
  })
  try {
    await wait(() => state.calls === 1)
    mounted.app.renderer.destroy()
    state.disposed = true
    subscription.resolve(() => state.unsubscribed++)
    await wait(() => state.unsubscribed === 1)
    expect(state.calls).toBe(1)
    expect(state.unsubscribed).toBe(1)
    const before = epoch(mounted.sdk)
    deliver?.(connected(99))
    expect(epoch(mounted.sdk)).toBe(before)
    expect(state.unsubscribed).toBe(1)
  } finally {
    subscription.resolve(() => state.unsubscribed++)
    if (!state.disposed) mounted.app.renderer.destroy()
  }
}, 10_000)

function routes(override?: FetchHandler): FetchHandler {
  return (url) => {
    const response = override?.(url)
    if (response) return response
    if (url.pathname === "/api/mcp/resource") return json({ location: { directory }, data: { resources: [] } })
    for (const id of [sessionID, otherID]) {
      if (url.pathname === `/api/session/${id}`) return json({ data: v2Session({ id, directory }) })
      if (url.pathname === `/api/session/${id}/todo`) return json({ data: [] })
      if (url.pathname === `/api/session/${id}/message`) return messages("ordinary")
    }
  }
}

function messages(value: string) {
  return json({
    data: [
      {
        id: "msg_boundary",
        type: "assistant",
        agent: "maestro",
        model: { id: "model", providerID: "test" },
        content: [{ id: "txt_boundary", type: "text", text: value }],
        time: { created: 2, completed: 3 },
      },
    ],
    cursor: {},
  })
}

function text(sync: Awaited<ReturnType<typeof mount>>["sync"], id = sessionID) {
  const message = sync.data.message[id]?.find((item) => item.id === "msg_boundary")
  const first = message?.type === "assistant" ? message.content[0] : undefined
  return first?.type === "text" ? first.text : undefined
}

function observe(promise: Promise<void>) {
  return promise.then(
    () => undefined,
    (error: unknown) => error,
  )
}

function event(payload: GlobalEvent["payload"]): GlobalEvent {
  return { directory, payload }
}

function connected(index: number) {
  return event({ id: `evt_connected_boundary_${index}`, type: "server.connected", data: {} })
}

async function emit(mounted: Awaited<ReturnType<typeof mount>>, value: GlobalEvent) {
  mounted.emit(value)
  await wait(() => mounted.received.includes(value))
}

function epoch(sdk: object) {
  if (!("connectionEpoch" in sdk) || typeof sdk.connectionEpoch !== "function")
    throw new Error("SDK connectionEpoch accessor is missing")
  const value: unknown = sdk.connectionEpoch()
  if (typeof value !== "number") throw new Error("SDK connectionEpoch must return a number")
  return value
}
