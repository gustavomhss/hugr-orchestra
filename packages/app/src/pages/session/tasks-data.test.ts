import { describe, expect, test } from "bun:test"
import type { AssistantMessage, Message, Part, Session, UserMessage } from "@opencode-ai/sdk/v2/client"
import { ServerConnection } from "@/context/server"
import { ServerScope } from "@/utils/server-scope"
import { deriveTasks, type TasksInput } from "./tasks-data"

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
      only(
        setup({ sessions: [child], message: paged, part: { msg_user: [], msg_a2: [] }, loaded: () => true, more }),
      ).stats?.toolCalls,
    ).toBeUndefined()
  })
})
