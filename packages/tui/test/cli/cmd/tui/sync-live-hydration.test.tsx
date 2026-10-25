/** @jsxImportSource @opentui/solid */
import { expect, test } from "bun:test"
import type { GlobalEvent } from "../../../../src/compat/schema"
import { tmpdir } from "../../../fixture/fixture"
import { json, mount, wait } from "./sync-fixture"
import { v2Session } from "../../../fixture/tui-sdk"

const sessionID = "ses_hydration_race"
const assistantID = "msg_hydration_assistant"
const directory = "/tmp/orchestra/apps/cli"
const model = { id: "model", providerID: "test" }

function global(type: string, properties: Record<string, unknown>) {
  return {
    directory: "/tmp/other",
    project: "proj_test",
    payload: { id: `evt_${type}_${Math.random()}`, type, properties: { sessionID, timestamp: 5, ...properties } },
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

test("V2 history hydrates into V1 messages, parts and the Session diff", async () => {
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

    expect(sync.data.message[sessionID].map((message) => [message.id, message.role])).toEqual([
      ["msg_user", "user"],
      [assistantID, "assistant"],
    ])
    expect(sync.data.message[sessionID][0]).toMatchObject({ agent: "maestro", model: { modelID: "model" } })
    expect(sync.data.message[sessionID][1]).toMatchObject({ parentID: "msg_user", modelID: "model" })
    expect([...sync.data.part["msg_user"]]).toMatchObject([{ type: "text", text: "hello" }])
    expect(sync.data.part[assistantID].map((part) => part.type)).toEqual(["step-start", "text", "tool", "step-finish"])
    expect(sync.data.part[assistantID][2]).toMatchObject({
      tool: "read",
      state: { status: "completed", output: "contents", title: "a.ts" },
    })
    expect(sync.data.session_diff[sessionID]).toEqual([
      { file: "a.ts", additions: 2, deletions: 1, status: "modified" },
    ])
  } finally {
    app.renderer.destroy()
  }
})

test("live V2 events stream into the projected parts", async () => {
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
    await wait(() => sync.data.part[assistantID]?.[1]?.type === "text")

    expect(sync.data.part[assistantID][1]).toMatchObject({ type: "text", text: "hello" })
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

    expect(sync.data.part[assistantID][1]).toMatchObject({ type: "text", text: "live" })
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
