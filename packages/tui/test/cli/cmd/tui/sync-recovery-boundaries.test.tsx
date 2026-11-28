/** @jsxImportSource @opentui/solid */
import { expect, test } from "bun:test"
import type { GlobalEvent } from "../../../../src/types"
import { tmpdir } from "../../../fixture/fixture"
import { v2Session, type FetchHandler } from "../../../fixture/tui-sdk"
import { createFetch, directory, json, mount, wait } from "./sync-fixture"

const sessionID = "ses_recovery_boundary"
const otherID = "ses_recovery_independent"

test("forced hydration waits for failed children, coalesces callers and leaves other Sessions independent", async () => {
  const results = []
  // Execute all variants before checking the regression outcomes, including metadata/todo rejection while history is held.
  for (const failure of ["history", "metadata", "todo", "trailing"]) {
    await using tmp = await tmpdir()
    await Bun.write(`${tmp.path}/kv.json`, "{}")
    const history = Promise.withResolvers<Response>()
    const trailingHistory = Promise.withResolvers<Response>()
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
        const response =
          state.reads === 1
            ? history.promise
            : failure === "trailing" && state.reads === 2
              ? trailingHistory.promise
              : Promise.resolve(messages("fresh"))
        return response.finally(() => state.active--)
      }),
      tmp.path,
    )
    const synchronize: (id: string, options?: { force?: boolean }) => Promise<void> = mounted.sync.session.sync
    const first = observe(synchronize(sessionID))
    await wait(() => state.reads === 1)
    if (failure === "metadata" || failure === "todo") failed.reject(problem)
    // Complete B after the rejected HTTP child, without waiting for A's wrapper or releasing A's history.
    await synchronize(otherID)
    expect(text(mounted.sync, otherID)).toBe("ordinary")
    expect(state.reads).toBe(1)
    expect(state.active).toBe(1)
    const trailing = observe(synchronize(sessionID, { force: true }))
    const duplicate = observe(synchronize(sessionID, { force: true }))
    const later: ReturnType<typeof observe>[] = []
    try {
      if (failure === "history") history.reject(problem)
      if (failure !== "history") history.resolve(messages("old"))
      if (failure === "trailing") {
        await first
        await wait(() => state.reads === 2)
        expect(state.active).toBe(1)
        later.push(observe(synchronize(sessionID, { force: true })), observe(synchronize(sessionID, { force: true })))
        expect(state.reads).toBe(2)
        trailingHistory.resolve(messages("captured trailing"))
      }
      const laterResults = await Promise.all(later)
      results.push({
        failure,
        problem,
        first: await first,
        trailing: await trailing,
        duplicate: await duplicate,
        reads: state.reads,
        maximum: state.maximum,
        text: text(mounted.sync),
        later: laterResults,
      })
    } finally {
      history.resolve(messages("cleanup"))
      trailingHistory.resolve(messages("cleanup trailing"))
      failed.resolve(json({ data: [] }))
      await Promise.allSettled([first, trailing, duplicate, ...later])
      mounted.app.renderer.destroy()
    }
  }
  for (const result of results) {
    if (result.failure === "metadata" || result.failure === "todo")
      expect(result.first).toMatchObject({ reason: "Transport", cause: result.problem })
    if (result.failure === "history" || result.failure === "trailing") expect(result.first).toBeUndefined()
    expect(result.trailing).toBeUndefined()
    expect(result.duplicate).toBeUndefined()
    expect(result.reads).toBe(result.failure === "trailing" ? 3 : 2)
    expect(result.maximum).toBe(1)
    expect(result.text).toBe("fresh")
    expect(result.later).toEqual(result.failure === "trailing" ? [undefined, undefined] : [])
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

test("native SSE requires the first greeting and then fresh exact Session metadata", async () => {
  await using tmp = await tmpdir()
  await Bun.write(`${tmp.path}/kv.json`, "{}")
  const previous = Promise.withResolvers<Response>()
  const current = Promise.withResolvers<Response>()
  const state = { metadataReads: 0, historyReads: 0 }
  const original = { ...v2Session({ id: sessionID, directory }), agent: "maestro" }
  const fresh = { ...original, agent: "backend", model: { providerID: "provider", id: "current-model" } }
  const stream = Promise.withResolvers<ReadableStreamDefaultController<Uint8Array>>()
  const transport = createFetch(routes((url) => {
    if (url.pathname === "/api/permission/request" || url.pathname === "/api/question/request") return json({ data: [] })
    if (url.pathname === `/api/session/${sessionID}/message`) state.historyReads++
    if (url.pathname !== `/api/session/${sessionID}`) return
    state.metadataReads++
    if (state.metadataReads === 2) return previous.promise
    if (state.metadataReads === 3) return current.promise
    return json({ data: original })
  }))
  const server = Bun.serve({
    port: 0,
    hostname: "127.0.0.1",
    fetch(request) {
      if (new URL(request.url).pathname === "/api/event")
        return new Response(new ReadableStream<Uint8Array>({ start: stream.resolve }), {
          headers: { "content-type": "text/event-stream" },
        })
      return transport.fetch(request)
    },
  })
  const mounted = await mount(undefined, tmp.path, undefined, { url: server.url.origin }).catch((error) => {
    server.stop(true)
    throw error
  })
  const sync = mounted.sync.session
  try {
    await sync.refreshSelection(sessionID)
    expect(mounted.sdk.connectionEpoch()).toBe(0)
    expect(sync.get(sessionID)?.agent).toBe("maestro")
    expect(sync.selectionReady(sessionID)).toBe(false)
    const priorRead = sync.refreshSelection(sessionID)
    await wait(() => state.metadataReads === 2)
    const controller = await stream.promise
    controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(connected(1).payload)}\n\n`))
    await wait(() => state.metadataReads === 3)
    expect(sync.selectionReady(sessionID)).toBe(false)
    expect(sync.get(sessionID)?.agent).toBe("maestro")

    previous.resolve(json({ data: { ...original, agent: "old-pending-agent" } }))
    expect(await priorRead).toBeUndefined()
    expect(sync.selectionReady(sessionID)).toBe(false)
    expect(sync.get(sessionID)?.agent).toBe("maestro")

    current.resolve(json({ data: fresh }))
    await wait(() => sync.selectionReady(sessionID))
    expect(sync.get(sessionID)).toMatchObject({ agent: fresh.agent, model: fresh.model })
    expect(state.historyReads).toBe(0)
  } finally {
    previous.resolve(json({ data: original }))
    current.resolve(json({ data: fresh }))
    mounted.app.renderer.destroy()
    server.stop(true)
  }
}, 15_000)

test("reconnect replaces exact Session selection before held history and survives a failed todo read", async () => {
  await using tmp = await tmpdir()
  await Bun.write(`${tmp.path}/kv.json`, "{}")
  const oldMetadata = Promise.withResolvers<Response>()
  const freshMetadata = Promise.withResolvers<Response>()
  const oldHistory = Promise.withResolvers<Response>()
  const state = { metadataReads: 0, historyReads: 0, todoReads: 0 }
  const original = { ...v2Session({ id: sessionID, directory }), agent: "maestro" }
  const fresh = {
    ...original, agent: "backend", model: { providerID: "provider", id: "new-model", variant: "high" },
    location: { directory: "/tmp/new-placement", workspaceID: "wrk_new" },
  }
  const mounted = await mount(routes((url) => {
    if (url.pathname === `/api/session/${sessionID}`) {
      state.metadataReads++
      if (state.metadataReads === 2) return oldMetadata.promise
      if (state.metadataReads === 3) return freshMetadata.promise
      return json({ data: original })
    }
    if (url.pathname === `/api/session/${sessionID}/message` && ++state.historyReads === 2) return oldHistory.promise
    if (url.pathname === `/api/session/${sessionID}/todo` && ++state.todoReads === 3)
      return Promise.reject(new Error("Reconnect todo failed"))
  }), tmp.path)
  const sync = mounted.sync.session
  let started: ReturnType<typeof observe> | undefined
  let pending: ReturnType<typeof observe> | undefined
  try {
    await emit(mounted, connected(1))
    started = observe(sync.sync(sessionID))
    await started
    expect(sync.selectionReady(sessionID)).toBe(true)
    pending = observe(sync.sync(sessionID, { force: true }))
    await wait(() => state.historyReads === 2 && state.metadataReads === 2)
    await emit(mounted, connected(2))
    await wait(() => state.metadataReads === 3)
    expect(sync.selectionReady(sessionID)).toBe(false)
    expect(sync.get(sessionID)?.agent).toBe("maestro")
    expect(state.historyReads).toBe(2)
    const recovered = observe(sync.sync(sessionID, { force: true }))

    freshMetadata.resolve(json({ data: fresh }))
    await wait(() => sync.selectionReady(sessionID))
    expect(sync.get(sessionID)).toMatchObject({ agent: fresh.agent, model: fresh.model, location: fresh.location })
    expect(state.historyReads).toBe(2)

    oldMetadata.resolve(json({ data: original }))
    oldHistory.resolve(messages("old held history"))
    await pending
    expect(await recovered).toMatchObject({ reason: "Transport" })
    expect(state.todoReads).toBe(3)
    expect(sync.selectionReady(sessionID)).toBe(true)
    expect(sync.get(sessionID)).toMatchObject({ agent: fresh.agent, model: fresh.model, location: fresh.location })
  } finally {
    oldMetadata.resolve(json({ data: original }))
    freshMetadata.resolve(json({ data: fresh }))
    oldHistory.resolve(messages("cleanup"))
    await Promise.allSettled([started, pending])
    mounted.app.renderer.destroy()
  }
}, 15_000)

test("move confirmation fences held Session metadata and durable sequence orders live placement and selection", async () => {
  await using tmp = await tmpdir()
  await Bun.write(`${tmp.path}/kv.json`, "{}")
  const stale = Promise.withResolvers<Response>()
  const late = Promise.withResolvers<Response>()
  const arrival = { metadataReads: 0 }
  const original = { ...v2Session({ id: sessionID, directory }), agent: "maestro", time: { created: 0, updated: 100 } }
  const moved = { ...original, location: { directory: "/tmp/moved-placement", workspaceID: "wrk_moved" } }
  const current = { ...moved, agent: "backend", title: "Renamed during hydration",
    location: { directory: "/tmp/live-placement", workspaceID: "wrk_live" } }
  const mounted = await mount(routes((url) => {
    if (url.pathname !== `/api/session/${sessionID}`) return
    arrival.metadataReads++
    if (arrival.metadataReads === 2) return stale.promise
    if (arrival.metadataReads === 4) return late.promise
    return json({ data: arrival.metadataReads === 1 ? original : arrival.metadataReads === 3 ? moved : current })
  }), tmp.path)
  const sync = mounted.sync.session
  try {
    await sync.refreshSelection(sessionID)
    const beforeMove = sync.refreshSelection(sessionID)
    await wait(() => arrival.metadataReads === 2)
    const finish = sync.beginMove(sessionID)
    expect(sync.selectionReady(sessionID)).toBe(false)
    expect(await sync.refreshSelection(sessionID)).toBeUndefined()
    expect(sync.get(sessionID)?.location.directory).toBe(directory)
    await finish()
    expect(sync.selectionReady(sessionID)).toBe(true)
    expect(sync.get(sessionID)?.location).toMatchObject(moved.location)
    stale.resolve(json({ data: original }))
    await beforeMove
    expect(sync.get(sessionID)?.location).toMatchObject(moved.location)

    const beforeEvents = sync.refreshSelection(sessionID)
    await wait(() => arrival.metadataReads === 4)
    await emit(mounted, {
      ...event({ id: "evt_latest_move", type: "session.next.moved", data: { sessionID, timestamp: 50, location: current.location } }),
      durable: { aggregateID: sessionID, seq: 5 },
    })
    expect(sync.selectionReady(sessionID)).toBe(false)
    await emit(mounted, {
      ...event({ id: "evt_latest_agent", type: "session.next.agent.switched", data: {
        sessionID, timestamp: 49, agent: "backend", messageID: "msg_latest_agent",
      } }),
      durable: { aggregateID: sessionID, seq: 7 },
    })
    await emit(mounted, {
      ...event({ id: "evt_earlier_move", type: "session.next.moved", data: {
        sessionID, timestamp: 95, location: original.location,
      } }),
      durable: { aggregateID: sessionID, seq: 4 },
    })
    await emit(mounted, {
      ...event({ id: "evt_earlier_agent", type: "session.next.agent.switched", data: {
        sessionID, timestamp: 96, agent: "maestro", messageID: "msg_earlier_agent",
      } }),
      durable: { aggregateID: sessionID, seq: 6 },
    })
    await emit(mounted, {
      ...event({ id: "evt_latest_title", type: "session.next.renamed", data: { sessionID, timestamp: 48, title: current.title } }),
      durable: { aggregateID: sessionID, seq: 8 },
    })
    late.resolve(json({ data: moved }))
    await beforeEvents
    expect(arrival.metadataReads).toBe(5)
    expect(sync.selectionReady(sessionID)).toBe(true)
    expect(sync.get(sessionID)).toMatchObject({ agent: current.agent, location: current.location, title: current.title })
    await emit(mounted, {
      ...event({ id: "evt_pre_snapshot_agent", type: "session.next.agent.switched", data: {
        sessionID, timestamp: 99, agent: "maestro", messageID: "msg_pre_snapshot_agent",
      } }),
      durable: { aggregateID: sessionID, seq: 9 },
    })
    expect(sync.get(sessionID)?.agent).toBe(current.agent)
    await emit(mounted, {
      ...event({ id: "evt_placement_clock", type: "session.next.moved", data: {
        sessionID, timestamp: 500, location: current.location,
      } }),
      durable: { aggregateID: sessionID, seq: 10 },
    })
    const model = { providerID: "provider", id: "new-live-model" }
    await emit(mounted, {
      ...event({ id: "evt_after_snapshot_model", type: "session.next.model.switched", data: {
        sessionID, timestamp: 101, model, messageID: "msg_after_snapshot_model",
      } }),
      durable: { aggregateID: sessionID, seq: 11 },
    })
    expect(sync.get(sessionID)?.model).toMatchObject(model)
  } finally {
    stale.resolve(json({ data: original }))
    late.resolve(json({ data: moved }))
    mounted.app.renderer.destroy()
  }
}, 15_000)

test("a delayed selection and rename notification cannot override a newer HTTP observation", async () => {
  await using tmp = await tmpdir()
  await Bun.write(`${tmp.path}/kv.json`, "{}")
  const inFlight = Promise.withResolvers<Response>()
  const confirmed = Promise.withResolvers<Response>()
  const state = { metadataReads: 0 }
  const original = { ...v2Session({ id: sessionID, directory }), agent: "maestro" }
  const latest = { ...original, agent: "backend", title: "Confirmed title", time: { created: 0, updated: 30 } }
  const mounted = await mount(routes((url) => {
    if (url.pathname !== `/api/session/${sessionID}`) return
    state.metadataReads++
    if (state.metadataReads === 2) return inFlight.promise
    if (state.metadataReads === 3) return confirmed.promise
    return json({ data: original })
  }), tmp.path)
  const sync = mounted.sync.session
  try {
    await sync.refreshSelection(sessionID)
    const metadata = sync.refreshSelection(sessionID)
    await wait(() => state.metadataReads === 2)
    await emit(mounted, {
      ...event({ id: "evt_delayed_title", type: "session.next.renamed", data: {
        sessionID, timestamp: 10, title: "Intermediate title",
      } }),
      durable: { aggregateID: sessionID, seq: 1 },
    })
    expect(sync.selectionReady(sessionID)).toBe(true)
    await emit(mounted, {
      ...event({ id: "evt_delayed_switch", type: "session.next.agent.switched", data: {
        sessionID, timestamp: 20, agent: "reviewer", messageID: "msg_delayed_switch",
      } }),
      durable: { aggregateID: sessionID, seq: 2 },
    })
    expect(sync.selectionReady(sessionID)).toBe(false)
    inFlight.resolve(json({ data: latest }))
    await wait(() => state.metadataReads === 3)
    expect(sync.selectionReady(sessionID)).toBe(false)
    confirmed.resolve(json({ data: latest }))
    await metadata
    expect(sync.selectionReady(sessionID)).toBe(true)
    expect(sync.get(sessionID)).toMatchObject({ agent: latest.agent, title: latest.title })
  } finally {
    inFlight.resolve(json({ data: latest }))
    confirmed.resolve(json({ data: latest }))
    mounted.app.renderer.destroy()
  }
}, 15_000)

test("a reconnect repairs an unopened Session title without replacing selection or reading history", async () => {
  await using tmp = await tmpdir()
  await Bun.write(`${tmp.path}/kv.json`, "{}")
  const original = {
    ...v2Session({ id: sessionID, directory, title: "Before disconnect", subpath: "packages/tui" }),
    agent: "maestro",
    model: { providerID: "test", id: "exact-model", variant: "high" },
    location: { directory, workspaceID: "wrk_exact" },
    time: { created: 0, updated: 10 },
  }
  const changedListRow = {
    ...original,
    title: "Renamed while disconnected",
    agent: "listed-agent",
    model: { providerID: "test", id: "listed-model", variant: "low" },
    location: { directory: "/tmp/listed-placement", workspaceID: "wrk_listed" },
    subpath: "listed-subpath",
  }
  const other = { ...original, id: otherID }
  const recoveredOther = { ...other, title: "Recovered title at the same timestamp" }
  const latest = { ...changedListRow, title: "Newest explicit title", time: { created: 0, updated: 20 } }
  const heldRecovery = Promise.withResolvers<Response>()
  const heldList = Promise.withResolvers<Response>()
  const streams: ReadableStreamDefaultController<Uint8Array>[] = []
  const state = { listReads: 0, exactReads: 0, historyReads: 0, exact: original }
  const list = (...rows: (typeof original)[]) => json({ data: rows, cursor: {} })
  const transport = createFetch(routes((url) => {
    if (url.pathname === "/api/permission/request" || url.pathname === "/api/question/request") return json({ data: [] })
    if (url.pathname === "/api/session") {
      if (++state.listReads === 2) return heldRecovery.promise
      if (state.listReads === 3) return list(latest, { ...other, title: "Stale explicit title" })
      if (state.listReads === 4) return heldList.promise
      return list(original, other)
    }
    if (url.pathname === `/api/session/${sessionID}`) {
      state.exactReads++
      return json({ data: state.exact })
    }
    if (url.pathname === `/api/session/${otherID}`) return json({ data: other })
    if ([`/api/session/${sessionID}/message`, `/api/session/${otherID}/message`].includes(url.pathname)) state.historyReads++
  }))
  const server = Bun.serve({
    port: 0, hostname: "127.0.0.1",
    fetch(request) {
      if (new URL(request.url).pathname === "/api/event")
        return new Response(new ReadableStream<Uint8Array>({ start: (controller) => { streams.push(controller) } }), {
          headers: { "content-type": "text/event-stream" },
        })
      return transport.fetch(request)
    },
  })
  const mounted = await mount(undefined, tmp.path, undefined, { url: server.url.origin }).catch((error) => {
    server.stop(true)
    throw error
  })
  const sync = mounted.sync.session
  const row = () => mounted.sync.data.session.find((entry) => entry.id === sessionID)
  const send = (stream: ReadableStreamDefaultController<Uint8Array>, value: GlobalEvent["payload"]) => {
    stream.enqueue(new TextEncoder().encode(`data: ${JSON.stringify({ ...value, location: { directory } })}\n\n`))
  }
  try {
    await wait(() => streams.length === 1 && row()?.id === sessionID)
    send(streams[0], connected(1).payload)
    await wait(() => mounted.sdk.connectionEpoch() === 1)
    send(streams[0], { id: "evt_title_seed", type: "session.next.renamed", data: {
      sessionID, timestamp: original.time.updated, title: original.title,
    } })
    send(streams[0], { id: "evt_other_title_seed", type: "session.next.renamed", data: {
      sessionID: otherID, timestamp: other.time.updated, title: other.title,
    } })
    await wait(() => state.exactReads === 1 && sync.selectionReady(sessionID) && sync.selectionReady(otherID))
    expect(state.historyReads).toBe(0)

    streams[0].close()
    await wait(() => mounted.sdk.offline())
    await wait(() => streams.length === 2, 5_000)
    send(streams[1], connected(2).payload)
    await wait(() => state.listReads === 2)
    await sync.refresh()
    expect(sync.get(sessionID)?.title).toBe(latest.title)
    // The other row proves the held recovery publishes its title at the same timestamp.
    // Its older primary row must yield to the explicit list read that just completed.
    heldRecovery.resolve(list(changedListRow, recoveredOther))
    await wait(() => sync.get(otherID)?.title === recoveredOther.title)
    for (const projected of [row(), sync.get(sessionID)]) expect(projected).toMatchObject({
      title: latest.title, agent: original.agent, model: original.model, location: original.location,
      subpath: original.subpath,
    })
    expect(sync.selectionReady(sessionID)).toBe(false)
    expect(state.exactReads).toBe(1)
    expect(state.historyReads).toBe(0)

    const old = sync.refresh()
    await wait(() => state.listReads === 4)
    state.exact = { ...original, title: "Newest live title", time: { created: 0, updated: 30 } }
    send(streams[1], { id: "evt_title_live", type: "session.next.renamed", data: {
      sessionID, timestamp: state.exact.time.updated, title: state.exact.title,
    } })
    await wait(() => state.exactReads === 2 && sync.selectionReady(sessionID))
    heldList.resolve(list({ ...changedListRow, time: { created: 0, updated: 40 } }, recoveredOther))
    await old
    for (const projected of [row(), sync.get(sessionID)]) expect(projected).toMatchObject({
      title: state.exact.title, agent: original.agent, model: original.model, location: original.location,
      subpath: original.subpath,
    })
    expect(sync.selectionReady(sessionID)).toBe(true)
    expect(state.historyReads).toBe(0)
  } finally {
    heldRecovery.resolve(list(original, other))
    heldList.resolve(list(original, other))
    mounted.app.renderer.destroy()
    server.stop(true)
  }
}, 15_000)

test.each([false, true])("bootstrap retries a Session list superseded by reconnect (continue: %s)", async (continuing) => {
  await using tmp = await tmpdir()
  await Bun.write(`${tmp.path}/kv.json`, "{}")
  const old = Promise.withResolvers<Response>()
  const current = Promise.withResolvers<Response>()
  const staleSession = v2Session({ id: otherID, directory })
  const currentSession = v2Session({ id: sessionID, directory })
  let listReads = 0
  const mounted = await mount(routes((url) => {
    if (url.pathname !== "/api/session") return
    return ++listReads === 1 ? old.promise : current.promise
  }), tmp.path, { continue: continuing }, undefined, { delaySync: true })
  const ready = mounted.startSync()
  try {
    await wait(() => listReads === 1)
    await emit(mounted, connected(1))
    await emit(mounted, connected(2))
    old.resolve(json({ data: [staleSession], cursor: {} }))
    await wait(() => listReads === 2)
    // The real SyncProvider with --continue withholds its children until the replacement list arrives.
    if (continuing) expect(mounted.mounts.count).toBe(0)
    else {
      await ready
      expect(mounted.sync.status).toBe("partial")
      expect(mounted.sync.data.session).toEqual([])
    }
    current.resolve(json({ data: [currentSession], cursor: {} }))
    await ready
    await wait(() => mounted.sync.status === "complete")
    expect(mounted.sync.data.session.map((row) => row.id)).toEqual([sessionID])
    expect(mounted.sync.ready).toBe(true)
    expect(listReads).toBe(2)
  } finally {
    old.resolve(json({ data: [staleSession], cursor: {} }))
    current.resolve(json({ data: [currentSession], cursor: {} }))
    mounted.app.renderer.destroy()
  }
}, 15_000)

test("an ordinary sync retries a failed forced history while retaining cached and live messages", async () => {
  await using tmp = await tmpdir()
  await Bun.write(`${tmp.path}/kv.json`, "{}")
  const failed = Promise.withResolvers<Response>()
  const state = { reads: 0 }
  const mounted = await mount(
    routes((url) => {
      if (url.pathname !== `/api/session/${sessionID}/message`) return
      state.reads++
      return state.reads === 1
        ? messages("initial cached")
        : state.reads === 2
          ? failed.promise
          : messages("ordinary retry")
    }),
    tmp.path,
  )
  const synchronize: (id: string, options?: { force?: boolean }) => Promise<void> = mounted.sync.session.sync
  await synchronize(sessionID)
  expect(state.reads).toBe(1)
  expect(text(mounted.sync)).toBe("initial cached")
  const forced = observe(synchronize(sessionID, { force: true }))
  try {
    await wait(() => state.reads === 2)
    await emit(
      mounted,
      event({
        id: "evt_live_during_failed_force",
        type: "session.next.step.started",
        data: {
          timestamp: 5,
          sessionID,
          assistantMessageID: "msg_live_during_failed_force",
          agent: "maestro",
          model: { id: "model", providerID: "test" },
        },
      }),
    )
    await wait(() => mounted.sync.data.message[sessionID]?.some((message) => message.id === "msg_live_during_failed_force"))
    expect(mounted.sync.data.message[sessionID].map((message) => message.id)).toContain("msg_live_during_failed_force")
    failed.reject(new Error("forced history failure"))
    expect(await forced).toBeUndefined()
    expect(text(mounted.sync)).toBe("initial cached")
    expect(mounted.sync.data.message[sessionID].map((message) => message.id)).toContain("msg_live_during_failed_force")
    await synchronize(sessionID)
    expect(state.reads).toBe(3)
    expect(text(mounted.sync)).toBe("ordinary retry")
    expect(mounted.sync.data.message[sessionID].map((message) => message.id)).toContain("msg_live_during_failed_force")
  } finally {
    failed.resolve(messages("cleanup"))
    await forced
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
        mounted.sync.set("session_status", "ses_untouched_stale", { type: "busy" })
        expect(mounted.sync.data.session_status.ses_untouched_stale).toEqual({ type: "busy" })
        await emit(mounted, connected(2))
        await wait(() => state.reads === 2)
        // Absence for sessionID is initially idle too. This untouched busy entry proves fresh empty actually applied.
        await wait(() => (mounted.sync.data.session_status.ses_untouched_stale?.type ?? "idle") === "idle")
        expect(mounted.sync.data.session_status.ses_untouched_stale?.type ?? "idle").toBe("idle")
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

test.each(["dispose", "late"])(
  "SDK cleanup observes a throwing %s unsubscribe exactly once",
  async (phase) => {
    await using tmp = await tmpdir()
    await Bun.write(`${tmp.path}/kv.json`, "{}")
    const subscription = Promise.withResolvers<() => void>()
    const state = { calls: 0, releases: 0, disposed: false }
    let deliver: ((event: GlobalEvent) => void) | undefined
    const release = () => {
      state.releases++
      throw new Error("deliberate delegated unsubscribe failure")
    }
    const mounted = await mount(routes(), tmp.path, undefined, undefined, {
      delaySync: phase === "late",
      events: {
        subscribe(handler) {
          deliver = handler
          state.calls++
          return phase === "late" ? subscription.promise : Promise.resolve(release)
        },
      },
    })
    try {
      await wait(() => state.calls === 1)
      const send = deliver
      if (!send) throw new Error("event subscription did not supply its callback")
      const greeting = connected(10)
      send(greeting)
      await wait(() => mounted.received.includes(greeting))
      const before = epoch(mounted.sdk)
      expect(before).toBe(1)
      state.disposed = true
      expect(() => mounted.app.renderer.destroy()).not.toThrow()
      if (phase === "late") subscription.resolve(release)
      await wait(() => state.releases === 1)
      send(connected(99))
      expect(epoch(mounted.sdk)).toBe(before)
      expect(state.calls).toBe(1)
      expect(state.releases).toBe(1)
    } finally {
      subscription.resolve(release)
      if (!state.disposed) mounted.app.renderer.destroy()
    }
  },
  15_000,
)

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
