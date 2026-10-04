import { describe, expect, test } from "bun:test"
import {
  createOpencodeClient,
  type AssistantMessage,
  type Message,
  type Part,
  type Session,
  type UserMessage,
} from "@opencode-ai/sdk/v2/client"
import { ServerConnection } from "@/context/server"
import { createServerSession } from "@/context/server-session"
import { ServerScope } from "@/utils/server-scope"
import { createTaskStops, deriveTasks, summarizeTasks, type TasksInput, type TasksItem } from "./tasks-data"

const parent = "ses_parent"
const tokens = { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } }

function session(id: string, extra: Partial<Session> = {}): Session {
  return {
    id,
    slug: id,
    projectID: "proj",
    directory: "/repo",
    title: id,
    version: "dev",
    time: { created: 1_000, updated: 1_000 },
    ...extra,
  }
}

function user(sessionID: string, id: string): UserMessage {
  return {
    id,
    sessionID,
    role: "user",
    time: { created: 1_000 },
    agent: "build",
    model: { providerID: "p", modelID: "m" },
  }
}

function assistant(sessionID: string, id: string, extra: Partial<AssistantMessage> = {}): AssistantMessage {
  return {
    id,
    sessionID,
    role: "assistant",
    time: { created: 2_000, completed: 3_000 },
    parentID: "msg_user",
    modelID: "model-x",
    providerID: "prov",
    mode: "explore",
    agent: "explore",
    path: { cwd: "/repo", root: "/repo" },
    cost: 0,
    tokens,
    ...extra,
  }
}

function tool(messageID: string, callID: string, name: string, state: Extract<Part, { type: "tool" }>["state"]): Part {
  return { id: `prt_${callID}`, sessionID: parent, messageID, type: "tool", callID, tool: name, state }
}

function taskCall(callID: string, childID: string, state: "completed" | "error" | "running", extra = {}): Part {
  const input = { description: `Task ${callID}`, subagent_type: "explore" }
  const metadata = { sessionId: childID, ...extra }
  if (state === "running")
    return tool("msg_parent", callID, "task", { status: "running", input, metadata, time: { start: 1_500 } })
  if (state === "error")
    return tool("msg_parent", callID, "task", {
      status: "error",
      input,
      metadata,
      error: "Subagent failed (task_id: x): boom",
      time: { start: 1_500, end: 4_000 },
    })
  return tool("msg_parent", callID, "task", {
    status: "completed",
    input,
    metadata,
    output: "done",
    title: `Task ${callID}`,
    time: { start: 1_500, end: 4_000 },
  })
}

function setup(input: Partial<TasksInput> & { calls?: Part[] }): TasksInput {
  return {
    scope: ServerScope.local,
    sessionID: parent,
    sessions: [],
    message: { [parent]: [assistant(parent, "msg_parent")] },
    part: { msg_parent: input.calls ?? [] },
    status: {},
    permission: {},
    question: {},
    loaded: () => false,
    more: () => false,
    aggregates: true,
    ...input,
  }
}

function only(input: TasksInput) {
  const result = deriveTasks(input)
  const all = [...result.running, ...result.finished]
  expect(all).toHaveLength(1)
  return all[0]!
}

describe("deriveTasks state", () => {
  test("an idle child whose task call failed is an error, not completed", () => {
    const item = only(
      setup({ sessions: [session("ses_a", { parentID: parent })], calls: [taskCall("c1", "ses_a", "error")] }),
    )
    expect(item.state).toBe("error")
    expect(item.endTime).toBe(4_000)
  })

  test("an aborted task call is interrupted", () => {
    const aborted = tool("msg_parent", "c1", "task", {
      status: "error",
      input: { description: "Stop me" },
      metadata: { sessionId: "ses_a", interrupted: true },
      error: "Tool execution aborted",
      time: { start: 1_500, end: 4_000 },
    })
    const cancelled = tool("msg_parent", "c2", "task", {
      status: "error",
      input: { description: "Cancel me" },
      metadata: { sessionId: "ses_b" },
      error: "Task cancelled",
      time: { start: 1_500, end: 4_000 },
    })
    const result = deriveTasks(
      setup({
        sessions: [session("ses_a", { parentID: parent }), session("ses_b", { parentID: parent })],
        calls: [aborted, cancelled],
      }),
    )
    expect(result.finished.map((item) => item.state)).toEqual(["interrupted", "interrupted"])
  })

  test("an idle child without outcome evidence is unknown with no invented end", () => {
    const item = only(setup({ sessions: [session("ses_a", { parentID: parent })] }))
    expect(item.state).toBe("unknown")
    expect(item.startTime).toBe(1_000)
    expect(item.endTime).toBeUndefined()
  })

  test("a background task call does not prove its child completed", () => {
    const call = taskCall("c1", "ses_a", "completed", { background: true })
    const child = session("ses_a", { parentID: parent })
    expect(only(setup({ sessions: [child], calls: [call] })).state).toBe("unknown")

    const aborted = assistant("ses_a", "msg_a2", {
      error: { name: "MessageAbortedError", data: { message: "aborted" } },
      time: { created: 2_000, completed: 5_000 },
    })
    const message = { [parent]: [assistant(parent, "msg_parent")], ses_a: [user("ses_a", "msg_user"), aborted] }
    const item = only(setup({ sessions: [child], calls: [call], message }))
    expect(item.state).toBe("interrupted")
    expect(item.endTime).toBe(5_000)
  })

  test("the child transcript proves completion or error when there is no task call", () => {
    const done = assistant("ses_a", "msg_a2", { finish: "stop", time: { created: 2_000, completed: 6_000 } })
    const failed = assistant("ses_b", "msg_b2", { error: { name: "UnknownError", data: { message: "x" } } })
    const result = deriveTasks(
      setup({
        sessions: [session("ses_a", { parentID: parent }), session("ses_b", { parentID: parent })],
        message: { [parent]: [], ses_a: [user("ses_a", "msg_user"), done], ses_b: [user("ses_b", "msg_user"), failed] },
      }),
    )
    expect(result.finished.map((item) => [item.childId, item.state, item.endTime])).toEqual([
      ["ses_a", "completed", 6_000],
      ["ses_b", "error", 3_000],
    ])
  })

  test("an unknown finish reason does not prove completion", () => {
    const item = only(
      setup({
        sessions: [session("ses_a", { parentID: parent })],
        message: {
          ses_a: [user("ses_a", "msg_user"), assistant("ses_a", "msg_a2", { finish: "unknown" })],
        },
      }),
    )
    expect(item.state).toBe("unknown")
    expect(item.endTime).toBeUndefined()
  })

  test("live status and pending requests win over a finished call", () => {
    const result = deriveTasks(
      setup({
        sessions: [session("ses_a", { parentID: parent }), session("ses_b", { parentID: parent })],
        calls: [taskCall("c1", "ses_a", "completed"), taskCall("c2", "ses_b", "completed")],
        status: { ses_a: { type: "busy" } },
        question: { ses_b: [{ id: "q1", sessionID: "ses_b", questions: [] }] },
      }),
    )
    expect(result.running.map((item) => [item.childId, item.state]).sort()).toEqual([
      ["ses_a", "running"],
      ["ses_b", "needs-input"],
    ])
  })
})

describe("deriveTasks rows", () => {
  test("an orphan task call yields exactly one row", () => {
    const result = deriveTasks(setup({ calls: [taskCall("c1", "ses_orphan", "completed")] }))
    expect(result.finished.map((item) => item.childId)).toEqual(["ses_orphan"])
    expect(result.running).toEqual([])
  })

  test("a pending shell call has no invented start time", () => {
    const shell = tool("msg_parent", "c_sh", "bash", { status: "pending", input: {}, raw: "" })
    const item = only(setup({ calls: [shell] }))
    expect(item.kind).toBe("shell")
    expect(item.startTime).toBeUndefined()
  })

  test("every finished task reaches the counts, a failure with no end time included", () => {
    const running = ["r0", "r1", "r2"].map((id) => taskCall(id, `ses_${id}`, "running"))
    const completed = Array.from({ length: 12 }, (_, index) => taskCall(`c${index}`, `ses_c${index}`, "completed"))
    // The child transcript proves the failure but records no completion time.
    const failed = assistant("ses_failed", "msg_failed", {
      error: { name: "UnknownError", data: { message: "boom" } },
      time: { created: 2_000 },
    })
    const result = deriveTasks(
      setup({
        sessions: [session("ses_failed", { parentID: parent })],
        message: { [parent]: [assistant(parent, "msg_parent")], ses_failed: [user("ses_failed", "msg_user"), failed] },
        calls: [...running, ...completed],
      }),
    )
    expect(result.finished).toHaveLength(13)
    const summary = summarizeTasks(result)
    expect(summary.total).toBe(16)
    expect(summary.hiddenFailures).toBe(1)
  })

  test("keys are qualified by server scope and kind", () => {
    const shell = tool("msg_parent", "ses_same", "bash", { status: "running", input: {}, time: { start: 1 } })
    const input = setup({ calls: [taskCall("c1", "ses_same", "running"), shell] })
    const local = deriveTasks(input).running.map((item) => item.key)
    const scope = ServerScope.fromServerKey(ServerConnection.Key.make("http://remote:4096"))
    const remote = deriveTasks({ ...input, scope }).running.map((item) => item.key)
    expect(new Set([...local, ...remote]).size).toBe(4)
  })
})

describe("deriveTasks stats", () => {
  test("event-only child totals stay unknown until the real store loads all history and parts", async () => {
    const child = session("ses_a", { parentID: parent })
    const latest = [
      { ...user(child.id, "msg_latest_user"), time: { created: 5_000 } },
      assistant(child.id, "msg_latest_assistant", {
        parentID: "msg_latest_user",
        finish: "stop",
        time: { created: 6_000, completed: 7_000 },
      }),
    ].map((info) => ({
      info,
      parts: [{ id: `prt_${info.id}`, sessionID: child.id, messageID: info.id, type: "text" as const, text: "Latest" }],
    }))
    const pages = [Promise.withResolvers<Response>(), Promise.withResolvers<Response>()]
    const requests: string[] = []
    const store = createServerSession(
      createOpencodeClient({
        baseUrl: "http://tasks.test",
        throwOnError: true,
        fetch: (async (request) => {
          const url = new URL(request instanceof Request ? request.url : String(request))
          expect(url.pathname).toBe(`/session/${child.id}/message`)
          requests.push(url.search)
          const page = pages[requests.length - 1]
          if (!page) throw new Error("Unexpected history request")
          return page.promise
        }) as typeof fetch,
      }),
    )
    store.remember(child)
    latest.forEach(({ info, parts }) => {
      store.apply({ type: "message.updated", properties: { info } })
      parts.forEach((part) => store.apply({ type: "message.part.updated", properties: { part } }))
    })
    const stats = () =>
      only(
        setup({
          sessions: [child],
          message: store.data.message,
          part: store.data.part,
          loaded: store.history.loaded,
          more: store.history.more,
          aggregates: false,
        }),
      ).stats
    const unknown = { toolCalls: undefined, fails: undefined, tokens: undefined, cost: undefined }
    expect(store.history.loaded(child.id)).toBe(false)
    expect(store.history.more(child.id)).toBe(false)
    expect(requests).toEqual([])
    expect(stats()).toMatchObject(unknown)

    const initial = store.sync(child.id)
    expect(store.history.loading(child.id)).toBe(true)
    expect(store.history.loaded(child.id)).toBe(false)
    pages[0]!.resolve(Response.json(latest, { headers: { "x-next-cursor": "older" } }))
    await initial
    expect(store.history.loaded(child.id)).toBe(true)
    expect(store.history.more(child.id)).toBe(true)
    expect(stats()).toMatchObject(unknown)

    const older = store.history.loadMore(child.id)
    expect(store.history.loaded(child.id)).toBe(false)
    pages[1]!.resolve(
      Response.json([
        {
          info: user(child.id, "msg_user"),
          parts: [{ id: "prt_user", sessionID: child.id, messageID: "msg_user", type: "text", text: "Earlier task" }],
        },
        {
          info: assistant(child.id, "msg_older_assistant", {
            cost: 0.25,
            tokens: { ...tokens, input: 10, output: 20 },
          }),
          parts: [
            {
              ...tool("msg_older_assistant", "c_failed", "bash", {
                status: "error",
                input: {},
                error: "failed",
                time: { start: 2_100, end: 2_200 },
              }),
              sessionID: child.id,
            },
          ],
        },
      ]),
    )
    await older
    expect(requests).toHaveLength(2)
    expect(new URLSearchParams(requests[1]).get("before")).toBe("older")
    expect(store.history.loaded(child.id)).toBe(true)
    expect(store.history.more(child.id)).toBe(false)
    expect(stats()).toMatchObject({ toolCalls: 1, fails: 1, tokens: { input: 10, output: 20 }, cost: 0.25 })

    store.evict(child.id)
    expect(store.history.loaded(child.id)).toBe(false)
    expect(stats()).toMatchObject(unknown)
  })

  test("loaded message records without their parts do not prove totals", () => {
    const stats = only(
      setup({
        sessions: [session("ses_a", { parentID: parent })],
        message: { ses_a: [user("ses_a", "msg_user"), assistant("ses_a", "msg_a2", { finish: "stop" })] },
        part: { msg_user: [] },
        loaded: () => true,
      }),
    ).stats
    expect(stats).toMatchObject({ toolCalls: undefined, fails: undefined, tokens: undefined, cost: undefined })
  })

  test("an unloaded transcript leaves counts unknown while session aggregates stay known", () => {
    const child = session("ses_a", {
      parentID: parent,
      cost: 0.25,
      tokens: { input: 10, output: 20, reasoning: 0, cache: { read: 0, write: 0 } },
    })
    const stats = only(setup({ sessions: [child] })).stats
    expect(stats?.toolCalls).toBeUndefined()
    expect(stats?.fails).toBeUndefined()
    expect(stats?.tokens).toEqual({ input: 10, output: 20 })
    expect(stats?.cost).toBe(0.25)

    const bare = only(setup({ sessions: [session("ses_b", { parentID: parent })] })).stats
    expect(bare?.tokens).toBeUndefined()
    expect(bare?.cost).toBeUndefined()

    // v1 compat zero-fills missing aggregates, so they prove nothing there.
    const v1 = only(setup({ sessions: [child], aggregates: false })).stats
    expect(v1?.tokens).toBeUndefined()
    expect(v1?.cost).toBeUndefined()
  })

  test("a complete transcript keeps real zeros", () => {
    const message = {
      [parent]: [],
      ses_a: [user("ses_a", "msg_user"), assistant("ses_a", "msg_a2", { finish: "stop" })],
    }
    const stats = only(
      setup({
        sessions: [session("ses_a", { parentID: parent })],
        message,
        part: { msg_user: [], msg_a2: [] },
        loaded: () => true,
      }),
    ).stats
    expect(stats).toMatchObject({ toolCalls: 0, fails: 0, tokens: { input: 0, output: 0 }, cost: 0 })
    expect(stats?.model).toBe("prov/model-x")
  })

  test("a partial transcript is not counted", () => {
    const child = session("ses_a", { parentID: parent })
    const midRun: Record<string, Message[]> = {
      [parent]: [],
      ses_a: [assistant("ses_a", "msg_a2", { finish: "stop" })],
    }
    expect(
      only(setup({ sessions: [child], message: midRun, part: { msg_a2: [] }, loaded: () => true })).stats?.toolCalls,
    ).toBeUndefined()

    const paged: Record<string, Message[]> = {
      [parent]: [],
      ses_a: [user("ses_a", "msg_user"), assistant("ses_a", "msg_a2", { finish: "stop" })],
    }
    const more = (id: string) => id === "ses_a"
    expect(
      only(setup({ sessions: [child], message: paged, part: { msg_user: [], msg_a2: [] }, loaded: () => true, more }))
        .stats?.toolCalls,
    ).toBeUndefined()
  })
})

describe("summarizeTasks", () => {
  const item = (key: string, state: TasksItem["state"], extra: Partial<TasksItem> = {}): TasksItem => ({
    key,
    kind: "agent",
    headline: key,
    state,
    sessionId: parent,
    ...extra,
  })

  test("active work fills the summary before finished work, needing input first", () => {
    const summary = summarizeTasks({
      running: [
        item("old", "running", { startTime: 1_000 }),
        item("unknown", "running"),
        item("new", "running", { startTime: 3_000 }),
        item("asks", "needs-input", { startTime: 500 }),
      ],
      finished: [item("failed", "error", { endTime: 9_000 })],
    })
    expect(summary.rows.map((row) => row.key)).toEqual(["asks", "new", "old"])
    expect(summary.active).toBe(4)
    expect(summary.needsInput).toBe(1)
    expect(summary.hiddenFailures).toBe(1)
    expect(summary.total).toBe(5)
  })

  test("finished work fills only the free slots, failures before other outcomes", () => {
    const summary = summarizeTasks({
      running: [item("live", "running", { startTime: 1_000 })],
      finished: [
        item("done-new", "completed", { endTime: 8_000 }),
        item("failed-old", "error", { endTime: 2_000 }),
        item("done-unknown", "unknown"),
        item("failed-new", "error", { endTime: 7_000 }),
      ],
    })
    expect(summary.rows.map((row) => row.key)).toEqual(["live", "failed-new", "failed-old"])
    expect(summary.hiddenFailures).toBe(0)
    expect(summary.total).toBe(5)
  })

  test("the expanded lists hold every counted task, in the order the summary shows them", () => {
    const running = ["r0", "r1", "r2"].map((key, index) => item(key, "running", { startTime: 3 - index }))
    const completed = Array.from({ length: 12 }, (_, index) =>
      item(`done-${String(index).padStart(2, "0")}`, "completed", { endTime: 1_000 + index }),
    )
    // The projection orders finished work by end time, so a failure without one arrives last.
    const failed = item("failed", "error")
    const finished = [...completed.toReversed(), failed]
    const summary = summarizeTasks({ running, finished })
    expect(summary.total).toBe(16)
    expect(summary.hiddenFailures).toBe(1)
    expect([...summary.running, ...summary.finished]).toHaveLength(summary.total)
    expect(summary.finished.map((row) => row.key)).toEqual(["failed", ...completed.toReversed().map((row) => row.key)])
    expect(summary.rows).toEqual([...summary.running, ...summary.finished].slice(0, 3))

    // With no running work the collapsed summary shows the failure, and so does the head of the detail.
    const idle = summarizeTasks({ running: [], finished })
    expect(idle.rows[0]).toBe(failed)
    expect(idle.rows).toEqual(idle.finished.slice(0, 3))
  })

  test("the side panel lists the 12 newest finished tasks, however many failed before them", () => {
    const failures = Array.from({ length: 12 }, (_, index) =>
      item(`failed-${String(index).padStart(2, "0")}`, "error", { endTime: 1_000 + index }),
    )
    const summary = summarizeTasks({
      running: [],
      finished: [...failures, item("done", "completed", { endTime: 2_000 })],
    })
    const failed = failures.toReversed().map((row) => row.key)
    expect(summary.recent.map((row) => row.key)).toEqual(["done", ...failed.slice(0, 11)])
    // The cockpit's detail keeps every finished task, failures first.
    expect(summary.finished.map((row) => row.key)).toEqual([...failed, "done"])
  })

  test("a failure that never recorded an end time stays among the side panel's newest tasks", () => {
    const completed = Array.from({ length: 12 }, (_, index) =>
      item(`done-${String(index).padStart(2, "0")}`, "completed", { endTime: 10 + index }),
    )
    const failed = item("failed", "error", { startTime: 100 })
    const summary = summarizeTasks({ running: [], finished: [...completed, failed] })
    expect(summary.recent[0]).toBe(failed)
    expect(summary.recent).toHaveLength(12)
  })

  test("the count covers every active entity, past what the summary shows", () => {
    const running = Array.from({ length: 65 }, (_, index) => item(`task-${String(index).padStart(2, "0")}`, "running"))
    const summary = summarizeTasks({ running, finished: [] })
    expect(summary.rows).toHaveLength(3)
    expect(summary.active).toBe(65)
    // Unknown start times tie, so the key decides and the order never depends on the input order.
    expect(summary.rows.map((row) => row.key)).toEqual(["task-00", "task-01", "task-02"])
  })
})

describe("task origins", () => {
  test("shell navigation retains the confirmed user parent, never a call ID as a message", () => {
    const call = tool("msg_parent", "call_shell", "shell", {
      status: "running",
      input: {},
      time: { start: 1 },
      metadata: {},
      title: "shell",
    })
    const input = setup({
      calls: [call],
      message: { [parent]: [user(parent, "msg_user"), assistant(parent, "msg_parent")] },
    })
    expect(only(input)).toMatchObject({
      sourceMessageID: "msg_parent",
      sourcePartID: "prt_call_shell",
      callID: "call_shell",
      originUserMessageID: "msg_user",
    })
    expect(
      only({ ...input, message: { [parent]: [assistant(parent, "msg_parent")] } }).originUserMessageID,
    ).toBeUndefined()
    expect(
      only({ ...input, message: { [parent]: [user("ses_other", "msg_user"), assistant(parent, "msg_parent")] } })
        .originUserMessageID,
    ).toBeUndefined()
  })

  test("identical call IDs in two sessions remain separate", () => {
    const call = tool("msg_parent", "same", "shell", { status: "pending", input: {}, raw: "" })
    const a = only(setup({ calls: [call] }))
    const b = only(
      setup({
        sessionID: "ses_other",
        part: { msg_parent: [{ ...call, sessionID: "ses_other" }] },
        message: { ses_other: [assistant("ses_other", "msg_parent")] },
      }),
    )
    expect(a.key).not.toBe(b.key)
  })
})

describe("createTaskStops", () => {
  test("an outcome that settles after another session's stop still lands on its own row", async () => {
    const interrupts: { sessionID: string; settle: PromiseWithResolvers<void> }[] = []
    const stops = createTaskStops((sessionID) => {
      const settle = Promise.withResolvers<void>()
      interrupts.push({ sessionID, settle })
      return settle.promise
    })
    const a = only(setup({ calls: [taskCall("c1", "ses_child_a", "running")] }))
    const call = taskCall("c1", "ses_child_b", "running")
    const b = only(
      setup({
        sessionID: "ses_other",
        part: { msg_parent: [{ ...call, sessionID: "ses_other" }] },
        message: { ses_other: [assistant("ses_other", "msg_parent")] },
      }),
    )

    stops.stop(a)
    stops.stop(a)
    stops.stop(b)
    expect(interrupts.map((interrupt) => interrupt.sessionID)).toEqual(["ses_child_a", "ses_child_b"])
    expect([stops.state(a.key), stops.state(b.key)]).toEqual(["pending", "pending"])

    interrupts[0]!.settle.resolve()
    await interrupts[0]!.settle.promise
    expect([stops.state(a.key), stops.state(b.key)]).toEqual([undefined, "pending"])

    interrupts[1]!.settle.reject(new Error("refused"))
    await interrupts[1]!.settle.promise.catch(() => undefined)
    expect(stops.state(b.key)).toBe("failed")
    stops.stop(b)
    expect(stops.state(b.key)).toBe("pending")
  })
})
