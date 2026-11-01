import { describe, expect, test } from "bun:test"
import { createMemo, createRoot } from "solid-js"
import { createStore, reconcile } from "solid-js/store"
import { deriveTasks, type TasksInput } from "@/pages/session/tasks-data"
import { ServerScope } from "@/utils/server-scope"
import type { AssistantMessage, Part, Session } from "@/v2-wire"

// Reactive: it runs under the browser condition (test-browser), because solid-js' server build never recomputes memos.
const parent = "ses_parent"

const child: Session = {
  id: "ses_a",
  slug: "ses_a",
  projectID: "proj",
  directory: "/repo",
  title: "ses_a",
  version: "dev",
  time: { created: 1_000, updated: 1_000 },
  parentID: parent,
}

const message: AssistantMessage = {
  id: "msg_parent",
  sessionID: parent,
  role: "assistant",
  time: { created: 2_000, completed: 3_000 },
  parentID: "msg_user",
  modelID: "model-x",
  providerID: "prov",
  mode: "explore",
  agent: "explore",
  path: { cwd: "/repo", root: "/repo" },
  cost: 0,
  tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
}

const taskCall = (state: "completed" | "running"): Part => {
  const input = { description: "Task c1", subagent_type: "explore" }
  const metadata = { sessionId: child.id }
  return {
    id: "prt_c1",
    sessionID: parent,
    messageID: message.id,
    type: "tool",
    callID: "c1",
    tool: "task",
    state:
      state === "running"
        ? { status: "running", input, metadata, time: { start: 1_500 } }
        : { status: "completed", input, metadata, output: "done", title: "Task c1", time: { start: 1_500, end: 4_000 } },
  }
}

const text = (value: string): Part => ({
  id: "msg_parent:text:0",
  sessionID: parent,
  messageID: message.id,
  type: "text",
  text: value,
})

describe("deriveTasks streaming", () => {
  /** The Tasks projection over real stores, written the way the session sync writes parts: in place by index. */
  const streaming = (
    body: (run: { items: () => ReturnType<typeof deriveTasks>; runs: () => number; write: (part: Part, index: number) => void }) => void,
  ) =>
    createRoot((dispose) => {
      const [store, setStore] = createStore<{ message: Record<string, AssistantMessage[]>; part: Record<string, Part[]> }>({
        message: { [parent]: [message] },
        part: { [message.id]: [taskCall("running"), text("Hel")] },
      })
      let runs = 0
      const items = createMemo(() => {
        runs += 1
        return deriveTasks({
          scope: ServerScope.local,
          sessionID: parent,
          sessions: [child],
          message: store.message,
          part: store.part,
          status: {},
          permission: {},
          question: {},
          agents: [],
          loaded: () => false,
          more: () => false,
        } satisfies TasksInput)
      })
      try {
        body({
          items,
          runs: () => runs,
          write: (part, index) => setStore("part", message.id, index, reconcile(part)),
        })
      } finally {
        dispose()
      }
    })

  test("a text delta does not rederive the tasks", () =>
    streaming((run) => {
      expect(run.items().running.map((item) => item.kind)).toEqual(["agent"])
      const before = run.runs()

      Array.from({ length: 10 }, (_, index) => run.write(text(`Hello ${index}`), 1))

      expect(run.runs()).toBe(before)
    }))

  test("a task call changing state does rederive the tasks", () =>
    streaming((run) => {
      const before = run.runs()

      run.write(taskCall("completed"), 0)

      expect(run.runs()).toBeGreaterThan(before)
      expect(run.items().running).toHaveLength(0)
      expect(run.items().finished.map((item) => item.state)).toEqual(["completed"])
    }))
})
