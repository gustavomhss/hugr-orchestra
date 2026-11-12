/** @jsxImportSource @opentui/solid */
import { expect, test } from "bun:test"
import type { GlobalEvent, SessionMessage } from "../../../../src/types"
import { tmpdir } from "../../../fixture/fixture"
import { toolOutput, toolTitle } from "../../../../src/util/session-message"
import { json, mount, wait } from "./sync-fixture"
import { createFetch, v2Session } from "../../../fixture/tui-sdk"

const sessionID = "ses_hydration_race"
const assistantID = "msg_hydration_assistant"
const directory = "/tmp/orchestra/apps/cli"
const model = { id: "model", providerID: "test" }

test("a mounted fully synced Session reloads history and status after a real SSE reconnect", async () => {
  await using tmp = await tmpdir()
  await Bun.write(`${tmp.path}/kv.json`, "{}")
  const state = { afterGap: false, historyReads: 0, activeReads: 0 }
  const historyAgain = Promise.withResolvers<void>()
  const activeAgain = Promise.withResolvers<void>()
  const streams: ReadableStreamDefaultController<Uint8Array>[] = []
  const unexpected: string[] = []
  const routes = createFetch((url) => {
    if (url.pathname === `/api/session/${sessionID}`)
      return json({ data: v2Session({ id: sessionID, directory }) })
    if (url.pathname === `/api/session/${sessionID}/todo`) return json({ data: [] })
    if (url.pathname === `/api/session/${sessionID}/message`) {
      state.historyReads++
      if (state.afterGap) historyAgain.resolve()
      return json({ data: [
        {
          id: assistantID, type: "assistant", agent: "maestro", model,
          content: [{ type: "text", id: "txt_gap", text: state.afterGap ? "completed while disconnected" : "before gap" }],
          time: { created: 2, ...(state.afterGap ? { completed: 5 } : {}) },
        },
        { id: "msg_gap_user", type: "user", text: "hello", time: { created: 1 } },
      ], cursor: {} })
    }
    if (url.pathname === "/api/session/active") {
      state.activeReads++
      if (state.afterGap) activeAgain.resolve()
      return json({ data: state.afterGap ? {} : { [sessionID]: { type: "running" } } })
    }
    if (url.pathname === "/api/permission/request" || url.pathname === "/api/question/request")
      return json({ data: [] })
    if (url.pathname === "/api/mcp/resource")
      return json({ location: { directory }, data: { resources: [] } })
    return undefined
  })
  const server = Bun.serve({
    port: 0,
    hostname: "127.0.0.1",
    fetch(request) {
      if (new URL(request.url).pathname === "/api/event")
        return new Response(new ReadableStream<Uint8Array>({
          start(controller) {
            streams.push(controller)
            controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify({
              id: `evt_connected_${streams.length}`, type: "server.connected", data: {},
            })}\n\n`))
          },
        }), { headers: { "content-type": "text/event-stream" } })
      return routes.fetch(request).catch((error) => {
        unexpected.push(new URL(request.url).pathname)
        throw error
      })
    },
  })
  const mounted = await mount(undefined, tmp.path, undefined, { url: server.url.origin }).catch((error) => {
    server.stop(true)
    throw error
  })
  const greetings = () => mounted.received.filter((event) => event.payload.type === "server.connected")

  try {
    await wait(() => greetings().length === 1)
    await mounted.sync.session.sync(sessionID)
    expect(mounted.mounts.count).toBe(1)
    expect(streams).toHaveLength(1)
    expect(greetings().map((event) => event.payload.id)).toEqual(["evt_connected_1"])
    expect(state.historyReads).toBe(1)
    expect(state.activeReads).toBe(1)
    expect(content(mounted.sync)?.[0]).toMatchObject({ type: "text", text: "before gap" })
    expect(mounted.sync.session.status(sessionID)).toBe("working")
    expect(mounted.sync.data.session_status[sessionID]).toEqual({ type: "busy" })
    expect(unexpected).toEqual([])

    streams[0].close()
    await wait(() => mounted.sdk.offline())
    // The server's reply completes while the stream is disconnected: no corresponding event is sent to the TUI.
    state.afterGap = true
    await wait(() => greetings().length === 2, 5_000)
    expect(streams).toHaveLength(2)
    expect(greetings().map((event) => event.payload.id)).toEqual(["evt_connected_1", "evt_connected_2"])
    expect(mounted.sdk.offline()).toBe(false)
    expect(mounted.mounts.count).toBe(1)
    expect(unexpected).toEqual([])

    // Bound only the observation of the required reads; the disconnect/reconnect order above uses observable state.
    const reloaded = await Promise.race([
      Promise.all([historyAgain.promise, activeAgain.promise]).then(() => true),
      Bun.sleep(3_000).then(() => false),
    ])
    expect({ reloaded, historyReads: state.historyReads > 1, activeReads: state.activeReads > 1 }).toEqual({
      reloaded: true, historyReads: true, activeReads: true,
    })
    await wait(() => mounted.sync.session.status(sessionID) === "idle")
    expect(content(mounted.sync)?.[0]).toMatchObject({ type: "text", text: "completed while disconnected" })
    expect(mounted.sync.data.session_status[sessionID]?.type ?? "idle").toBe("idle")
    expect(mounted.mounts.count).toBe(1)
  } finally {
    mounted.app.renderer.destroy()
    server.stop(true)
  }
}, 15_000)

function content(sync: { data: { message: Record<string, SessionMessage[]> } }) {
  const message = sync.data.message[sessionID]?.find((item) => item.id === assistantID)
  return message?.type === "assistant" ? message.content : undefined
}

function global(type: string, data: Record<string, unknown>) {
  return {
    directory: "/tmp/other",
    project: "proj_test",
    payload: { id: `evt_${type}_${Math.random()}`, type, data: { sessionID, timestamp: 5, ...data } },
  } as GlobalEvent
}

function fetchHandler(input: { messages: () => Response | Promise<Response>; status?: unknown[] }) {
  const state = { requested: false }
  return {
    state,
    handler: (url: URL) => {
      if (url.pathname === `/api/session/${sessionID}`)
        return json({ data: v2Session({ id: sessionID, title: "race", directory }) })
      if (url.pathname === `/api/session/${sessionID}/todo`) return json({ data: [] })
      if (url.pathname === `/api/session/${sessionID}/message`) {
        state.requested = true
        return input.messages()
      }
      if (url.pathname === "/api/vcs/status")
        return json({ location: { directory, project: { id: "proj_test", directory } }, data: input.status ?? [] })
      return undefined
    },
  }
}

test("V2 history hydrates into the message store and the Session diff", async () => {
  await using tmp = await tmpdir()
  await Bun.write(`${tmp.path}/kv.json`, "{}")
  const route = fetchHandler({
    messages: () =>
      json({
        data: [
          {
            id: assistantID,
            type: "assistant",
            agent: "maestro",
            model,
            content: [
              { type: "text", id: "txt_1", text: "done" },
              {
                type: "tool",
                id: "call_1",
                name: "read",
                time: { created: 3, ran: 3, completed: 4 },
                state: {
                  status: "completed",
                  input: { filePath: "a.ts" },
                  structured: { title: "a.ts" },
                  content: [{ type: "text", text: "contents" }],
                },
              },
            ],
            snapshot: { files: ["a.ts"] },
            finish: "stop",
            cost: 0,
            tokens: { input: 1, output: 1, reasoning: 0, cache: { read: 0, write: 0 } },
            time: { created: 2, completed: 4 },
          },
          { id: "msg_user", type: "user", text: "hello", time: { created: 1 } },
        ],
        cursor: {},
      }),
    status: [
      { file: "a.ts", additions: 2, deletions: 1, status: "modified" },
      { file: "unrelated.ts", additions: 9, deletions: 0, status: "added" },
    ],
  })
  const { app, sync } = await mount(route.handler, tmp.path)

  try {
    await sync.session.sync(sessionID)

    expect(sync.data.message[sessionID].map((message) => [message.id, message.type])).toEqual([
      ["msg_user", "user"],
      [assistantID, "assistant"],
    ])
    expect(sync.data.message[sessionID][0]).toMatchObject({ text: "hello" })
    expect(sync.data.message[sessionID][1]).toMatchObject({ agent: "maestro", model: { id: "model" } })
    expect(content(sync)?.map((part) => part.type)).toEqual(["text", "tool"])
    // Solid store proxies of nested arrays do not deep-match in Bun, so check the projected tool through the TUI's readers.
    const tool = content(sync)?.[1]
    expect(tool?.type === "tool" && [tool.name, tool.state.status, toolOutput(tool), toolTitle(tool)]).toEqual([
      "read",
      "completed",
      "contents",
      "a.ts",
    ])
    expect(sync.data.session_diff[sessionID]).toEqual([
      { file: "a.ts", additions: 2, deletions: 1, status: "modified" },
    ])
  } finally {
    app.renderer.destroy()
  }
})

test("live V2 events stream into the projected content", async () => {
  await using tmp = await tmpdir()
  await Bun.write(`${tmp.path}/kv.json`, "{}")
  const route = fetchHandler({ messages: () => json({ data: [], cursor: {} }) })
  const { app, emit, sync } = await mount(route.handler, tmp.path)

  try {
    await sync.session.sync(sessionID)
    emit(global("session.next.step.started", { assistantMessageID: assistantID, agent: "maestro", model }))
    emit(global("session.next.text.started", { assistantMessageID: assistantID, textID: "txt_1" }))
    emit(global("session.next.text.delta", { assistantMessageID: assistantID, textID: "txt_1", delta: "hel" }))
    emit(global("session.next.text.delta", { assistantMessageID: assistantID, textID: "txt_1", delta: "lo" }))
    await wait(() => content(sync)?.[0]?.type === "text")

    expect(content(sync)?.[0]).toMatchObject({ type: "text", text: "hello" })
    expect(sync.session.status(sessionID)).toBe("working")
  } finally {
    app.renderer.destroy()
  }
})

test("stale Session hydration does not overwrite live message content", async () => {
  await using tmp = await tmpdir()
  await Bun.write(`${tmp.path}/kv.json`, "{}")
  const pending = Promise.withResolvers<Response>()
  const route = fetchHandler({ messages: () => pending.promise })
  const { app, emit, sync } = await mount(route.handler, tmp.path)

  try {
    const hydrate = sync.session.sync(sessionID)
    await wait(() => route.state.requested)
    emit(global("session.next.step.started", { assistantMessageID: assistantID, agent: "maestro", model }))
    emit(global("session.next.text.started", { assistantMessageID: assistantID, textID: "txt_1" }))
    emit(global("session.next.text.delta", { assistantMessageID: assistantID, textID: "txt_1", delta: "live" }))
    // SDK batches events that arrive within 16ms of the last flush; let the batch land first.
    await Bun.sleep(20)

    pending.resolve(
      json({
        data: [
          {
            id: assistantID,
            type: "assistant",
            agent: "maestro",
            model,
            content: [{ type: "text", id: "txt_1", text: "" }],
            time: { created: 5 },
          },
        ],
        cursor: {},
      }),
    )
    await hydrate

    expect(content(sync)?.[0]).toMatchObject({ type: "text", text: "live" })
  } finally {
    app.renderer.destroy()
  }
})

test("events for Sessions that were never synced are not projected", async () => {
  await using tmp = await tmpdir()
  await Bun.write(`${tmp.path}/kv.json`, "{}")
  const { app, emit, sync } = await mount(undefined, tmp.path)

  try {
    emit(global("session.next.step.started", { assistantMessageID: assistantID, agent: "maestro", model }))
    await Bun.sleep(20)

    expect(sync.data.message[sessionID]).toBeUndefined()
  } finally {
    app.renderer.destroy()
  }
})

test("a failed message read retries and keeps live content received during the failed hydration", async () => {
  await using tmp = await tmpdir()
  await Bun.write(`${tmp.path}/kv.json`, "{}")
  const pending = Promise.withResolvers<Response>()
  const state = { reads: 0 }
  const route = fetchHandler({
    messages: () =>
      ++state.reads === 1
        ? pending.promise
        : json({
            data: [
              {
                id: assistantID,
                type: "assistant",
                agent: "maestro",
                model,
                content: [{ type: "text", id: "txt_1", text: "stale" }],
                time: { created: 5 },
              },
              { id: "msg_old", type: "user", text: "durable", time: { created: 1 } },
            ],
            cursor: {},
          }),
  })
  const { app, emit, sync } = await mount(route.handler, tmp.path)
  try {
    const first = sync.session.sync(sessionID).catch(() => undefined)
    await wait(() => route.state.requested)
    emit(global("session.next.step.started", { assistantMessageID: assistantID, agent: "maestro", model }))
    emit(global("session.next.text.started", { assistantMessageID: assistantID, textID: "txt_1" }))
    emit(global("session.next.text.delta", { assistantMessageID: assistantID, textID: "txt_1", delta: "live" }))
    await Bun.sleep(20)
    pending.resolve(json({ error: "temporary" }, { status: 503 }))
    await first
    await sync.session.sync(sessionID)
    expect(state.reads).toBe(2)
    expect(sync.data.message[sessionID].map((message) => message.id)).toEqual(["msg_old", assistantID])
    expect(content(sync)?.[0]).toMatchObject({ type: "text", text: "live" })
  } finally {
    app.renderer.destroy()
  }
})

test("bootstrap hydrates pending requests into the active SyncProvider store", async () => {
  await using tmp = await tmpdir()
  await Bun.write(`${tmp.path}/kv.json`, "{}")
  const request = { id: "per_before_attach", sessionID, action: "read", resources: ["a.ts"] }
  const question = {
    id: "que_before_attach",
    sessionID: "ses_child",
    questions: [{ header: "Pick", question: "Choose", options: [] }],
  }
  const { app, sync } = await mount((url) => {
    if (url.pathname === "/api/permission/request")
      return json({ location: { directory, project: { id: "proj_test", directory } }, data: [request] })
    if (url.pathname === "/api/question/request")
      return json({ location: { directory, project: { id: "proj_test", directory } }, data: [question] })
    return undefined
  }, tmp.path)
  try {
    expect(sync.data.permission[sessionID]?.map((item) => item.id)).toEqual([request.id])
    expect(sync.data.question.ses_child?.map((item) => item.id)).toEqual([question.id])
  } finally {
    app.renderer.destroy()
  }
})

test("a reply while pending requests are being rehydrated fences the stale snapshot", async () => {
  await using tmp = await tmpdir()
  await Bun.write(`${tmp.path}/kv.json`, "{}")
  const pending = Promise.withResolvers<Response>()
  const state = { reads: 0 }
  const request = { id: "per_answered", sessionID, action: "read", resources: ["a.ts"] }
  const question = { id: "que_answered", sessionID, questions: [{ header: "Pick", question: "Choose", options: [] }] }
  const route = fetchHandler({ messages: () => json({ data: [], cursor: {} }) })
  const { app, emit, sync } = await mount((url) => {
    if (url.pathname === "/api/permission/request") return ++state.reads === 1 ? json({ data: [] }) : pending.promise
    if (url.pathname === "/api/question/request") return json({ data: state.reads > 1 ? [question] : [] })
    return route.handler(url)
  }, tmp.path)
  try {
    const hydrate = sync.session.sync(sessionID)
    await wait(() => route.state.requested)
    emit(global("permission.v2.replied", { requestID: request.id, reply: "once" }))
    emit(global("question.v2.replied", { requestID: question.id, answers: [["yes"]] }))
    await Bun.sleep(20)
    pending.resolve(json({ data: [request] }))
    await hydrate
    expect(state.reads).toBe(2)
    expect(sync.data.permission[sessionID] ?? []).toHaveLength(0)
    expect(sync.data.question[sessionID] ?? []).toHaveLength(0)
  } finally {
    app.renderer.destroy()
  }
})

test("auto mode replies to hydrated permissions once and keeps questions available", async () => {
  await using tmp = await tmpdir()
  await Bun.write(`${tmp.path}/kv.json`, "{}")
  const state = { replies: 0 }
  const permission = { id: "per_auto_attach", sessionID, action: "read", resources: ["a.ts"] }
  const question = {
    id: "que_auto_attach",
    sessionID,
    questions: [{ header: "Pick", question: "Choose", options: [] }],
  }
  const { app, sync } = await mount(
    (url) => {
      if (url.pathname === "/api/permission/request") return json({ data: [permission] })
      if (url.pathname === "/api/question/request") return json({ data: [question] })
      if (url.pathname === `/api/session/${sessionID}/permission/${permission.id}/reply`) {
        state.replies++
        return new Response(null, { status: 204 })
      }
    },
    tmp.path,
    { auto: true },
  )
  try {
    await wait(() => state.replies === 1)
    await sync.bootstrap({ fatal: false })
    await wait(() => sync.status === "complete")
    expect(state.replies).toBe(1)
    expect(sync.data.permission[sessionID] ?? []).toHaveLength(0)
    expect(sync.data.question[sessionID]?.map((item) => item.id)).toEqual([question.id])
  } finally {
    app.renderer.destroy()
  }
})

test("rehydration clears settled requests for a child absent from the current Session list", async () => {
  await using tmp = await tmpdir()
  await Bun.write(`${tmp.path}/kv.json`, "{}")
  const state = { permissions: 0, questions: 0 }
  const child = "ses_removed_child"
  const { app, sync } = await mount((url) => {
    if (url.pathname === "/api/permission/request")
      return json({
        data:
          ++state.permissions === 1
            ? [{ id: "per_stale_child", sessionID: child, action: "read", resources: ["a.ts"] }]
            : [],
      })
    if (url.pathname === "/api/question/request")
      return json({
        data:
          ++state.questions === 1
            ? [
                {
                  id: "que_stale_child",
                  sessionID: child,
                  questions: [{ header: "Pick", question: "Choose", options: [] }],
                },
              ]
            : [],
      })
  }, tmp.path)
  try {
    expect(sync.data.permission[child]).toHaveLength(1)
    expect(sync.data.question[child]).toHaveLength(1)
    await sync.bootstrap({ fatal: false })
    await wait(
      () =>
        state.permissions === 2 &&
        state.questions === 2 &&
        (sync.data.permission[child]?.length ?? -1) === 0 &&
        (sync.data.question[child]?.length ?? -1) === 0,
    )
    expect(sync.data.permission[child]).toHaveLength(0)
    expect(sync.data.question[child]).toHaveLength(0)
  } finally {
    app.renderer.destroy()
  }
})


test("live events after an empty failed hydration remain available to the retry", async () => {
  await using tmp = await tmpdir()
  await Bun.write(`${tmp.path}/kv.json`, "{}")
  const state = { reads: 0 }
  const route = fetchHandler({ messages: () => ++state.reads === 1 ? json({}, { status: 503 }) : json({ data: [], cursor: {} }) })
  const { app, emit, sync } = await mount(route.handler, tmp.path)
  try {
    await sync.session.sync(sessionID)
    emit(global("session.next.step.started", { assistantMessageID: assistantID, agent: "maestro", model }))
    emit(global("session.next.text.started", { assistantMessageID: assistantID, textID: "txt_1" }))
    emit(global("session.next.text.delta", { assistantMessageID: assistantID, textID: "txt_1", delta: "after failure" }))
    await wait(() => content(sync)?.[0]?.type === "text")
    await sync.session.sync(sessionID)
    expect(content(sync)?.[0]).toMatchObject({ type: "text", text: "after failure" })
    expect(state.reads).toBe(2)
  } finally { app.renderer.destroy() }
})


test("opening a Session hydrates pending child requests from each known family Location", async () => {
  await using tmp = await tmpdir()
  await Bun.write(`${tmp.path}/kv.json`, "{}")
  const childDirectory = "/tmp/child-worktree"
  const childID = "ses_other_location_child"
  const request = { id: "per_other_location_child", sessionID: childID, action: "read", resources: ["a.ts"] }
  const question = { id: "que_other_location_child", sessionID: childID, questions: [{ header: "Pick", question: "Choose", options: [] }] }
  const reads: string[] = []
  const route = fetchHandler({ messages: () => json({ data: [], cursor: {} }) })
  const { app, sync } = await mount((url) => {
    if (url.pathname === "/api/session") return json({ data: [v2Session({ id: sessionID, directory }), { ...v2Session({ id: childID, directory: childDirectory }), parentID: sessionID }], cursor: {} })
    if (url.pathname === "/api/permission/request" || url.pathname === "/api/question/request") {
      const location = { directory: url.searchParams.get("location[directory]")! }
      reads.push(`${url.pathname}:${location.directory}`)
      return json({ data: location.directory === childDirectory ? [url.pathname === "/api/permission/request" ? request : question] : [] })
    }
    return route.handler(url)
  }, tmp.path)
  try {
    await sync.session.sync(sessionID)
    expect(sync.data.permission[childID]?.map((item) => item.id)).toEqual([request.id])
    expect(sync.data.question[childID]?.map((item) => item.id)).toEqual([question.id])
    expect(reads.filter((read) => read === `/api/permission/request:${childDirectory}`)).toHaveLength(1)
  } finally { app.renderer.destroy() }
})
