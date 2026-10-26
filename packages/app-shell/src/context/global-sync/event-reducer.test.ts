import { describe, expect, test } from "bun:test"
import type { PermissionRequest, QuestionRequest } from "@/v2-types"
import type { Message, Part, Session } from "@/v2-wire"


import { createStore } from "solid-js/store"
import type { State } from "./types"
import { applyDirectoryEvent, applyGlobalEvent, cleanupDroppedSessionCaches } from "./event-reducer"

const rootSession = (input: { id: string; parentID?: string; archived?: number }) =>
  ({
    id: input.id,
    parentID: input.parentID,
    time: {
      created: 1,
      updated: 1,
      archived: input.archived,
    },
  }) as Session

const created = (id: string, parentID?: string) => ({
  type: "session.next.created",
  properties: { timestamp: 1, sessionID: id, projectID: "proj", parentID, location: { directory: "/tmp" }, title: id },
})

const archived = (id: string) => ({
  type: "session.next.archive.changed",
  properties: { timestamp: 10, sessionID: id, archived: 10 },
})

const userMessage = (id: string, sessionID: string, created = 1) =>
  ({
    id,
    sessionID,
    role: "user",
    time: { created },
    agent: "assistant",
    model: { providerID: "openai", modelID: "gpt" },
  }) as Message

const textPart = (id: string, sessionID: string, messageID: string) =>
  ({
    id,
    sessionID,
    messageID,
    type: "text",
    text: id,
  }) as Part

const permissionRequest = (id: string, sessionID: string, title = id) =>
  ({
    id,
    sessionID,
    permission: title,
    patterns: ["*"],
    metadata: {},
    always: [],
  }) as PermissionRequest

const permissionAsked = (id: string, sessionID: string, action = id) => ({
  id,
  sessionID,
  action,
  resources: ["*"],
  save: [],
  metadata: {},
})

const questionRequest = (id: string, sessionID: string, title = id) =>
  ({
    id,
    sessionID,
    questions: [
      {
        question: title,
        header: title,
        options: [{ label: title, description: title }],
      },
    ],
  }) as QuestionRequest

const baseState = (input: Partial<State> = {}) =>
  ({
    status: "complete",
    agent: [],
    command: [],
    project: "",
    projectMeta: undefined,
    icon: undefined,
    provider: {} as State["provider"],
    config: {} as State["config"],
    path: { directory: "/tmp" } as State["path"],
    session: [],
    sessionTotal: 0,
    session_status: {},
    todo: {},
    permission: {},
    question: {},
    mcp: {},
    lsp: [],
    vcs: undefined,
    limit: 10,
    message: {},
    session_message: {},
    part: {},
    ...input,
  }) as State

describe("applyGlobalEvent", () => {
  test("handles server.connected by triggering refresh", () => {
    let refreshCount = 0
    applyGlobalEvent({
      event: { type: "server.connected" },
      refresh: () => {
        refreshCount += 1
      },
    })

    expect(refreshCount).toBe(1)
  })

  test("ignores events the server does not publish", () => {
    let refreshCount = 0
    applyGlobalEvent({
      event: { type: "session.next.moved" },
      refresh: () => {
        refreshCount += 1
      },
    })

    expect(refreshCount).toBe(0)
  })
})

describe("applyDirectoryEvent", () => {
  test("preserves a Home-specific retained session limit", () => {
    const [store, setStore] = createStore(
      baseState({
        limit: 1,
        session: [rootSession({ id: "ses_a" }), rootSession({ id: "ses_b" }), rootSession({ id: "ses_c" })],
      }),
    )

    applyDirectoryEvent({
      event: created("ses_d"),
      store,
      setStore,
      push() {},
      directory: "/tmp",
      retainedLimit: 3,
    })

    expect(store.session).toHaveLength(3)
  })

  test("inserts root sessions in sorted order and updates sessionTotal", () => {
    const [store, setStore] = createStore(
      baseState({
        session: [rootSession({ id: "ses_b" })],
        sessionTotal: 1,
      }),
    )

    applyDirectoryEvent({
      event: created("ses_a"),
      store,
      setStore,
      push() {},
      directory: "/tmp",
    })

    expect(store.session.map((x) => x.id)).toEqual(["ses_a", "ses_b"])
    expect(store.sessionTotal).toBe(2)

    applyDirectoryEvent({
      event: created("ses_c", "ses_a"),
      store,
      setStore,
      push() {},
      directory: "/tmp",
    })

    expect(store.sessionTotal).toBe(2)
  })

  test("cleans session caches when archived", () => {
    const message = userMessage("msg_1", "ses_1")
    const [store, setStore] = createStore(
      baseState({
        session: [rootSession({ id: "ses_1" }), rootSession({ id: "ses_2" })],
        sessionTotal: 2,
        message: { ses_1: [message] },
        part: { [message.id]: [textPart("prt_1", "ses_1", message.id)] },
        todo: { ses_1: [] },
        permission: { ses_1: [] },
        question: { ses_1: [] },
        session_status: { ses_1: { type: "busy" } },
      }),
    )

    applyDirectoryEvent({
      event: archived("ses_1"),
      store,
      setStore,
      push() {},
      directory: "/tmp",
    })

    expect(store.session.map((x) => x.id)).toEqual(["ses_2"])
    expect(store.sessionTotal).toBe(1)
    expect(store.message.ses_1).toBeUndefined()
    expect(store.part[message.id]).toBeUndefined()
    expect(store.todo.ses_1).toBeUndefined()
    expect(store.permission.ses_1).toBeUndefined()
    expect(store.question.ses_1).toBeUndefined()
    expect(store.session_status.ses_1).toBeUndefined()
  })

  test("ignores an archived session absent from a passive directory store", () => {
    const [store, setStore] = createStore(baseState({ session: [], sessionTotal: 0 }))

    applyDirectoryEvent({
      event: archived("ses_missing"),
      store,
      setStore,
      push() {},
      directory: "/tmp",
    })

    expect(store.session).toEqual([])
    expect(store.sessionTotal).toBe(0)
  })

  test("cleans session caches when deleted and decrements only root totals", () => {
    const cases = [
      { info: rootSession({ id: "ses_1" }), expectedTotal: 1 },
      { info: rootSession({ id: "ses_2", parentID: "ses_1" }), expectedTotal: 2 },
    ]

    for (const item of cases) {
      const message = userMessage("msg_1", item.info.id)
      const [store, setStore] = createStore(
        baseState({
          session: [
            rootSession({ id: "ses_1" }),
            rootSession({ id: "ses_2", parentID: "ses_1" }),
            rootSession({ id: "ses_3" }),
          ],
          sessionTotal: 2,
          message: { [item.info.id]: [message] },
          part: { [message.id]: [textPart("prt_1", item.info.id, message.id)] },
            todo: { [item.info.id]: [] },
          permission: { [item.info.id]: [] },
          question: { [item.info.id]: [] },
          session_status: { [item.info.id]: { type: "busy" } },
        }),
      )

      applyDirectoryEvent({
        event: { type: "session.next.deleted", properties: { timestamp: 2, sessionID: item.info.id } },
        store,
        setStore,
        push() {},
        directory: "/tmp",
        })

      expect(store.session.find((x) => x.id === item.info.id)).toBeUndefined()
      expect(store.sessionTotal).toBe(item.expectedTotal)
      expect(store.message[item.info.id]).toBeUndefined()
      expect(store.part[message.id]).toBeUndefined()
        expect(store.todo[item.info.id]).toBeUndefined()
      expect(store.permission[item.info.id]).toBeUndefined()
      expect(store.question[item.info.id]).toBeUndefined()
      expect(store.session_status[item.info.id]).toBeUndefined()
    }
  })

  test("cleans caches for trimmed sessions on session.next.created", () => {
    const dropped = rootSession({ id: "ses_b" })
    const kept = rootSession({ id: "ses_a" })
    const message = userMessage("msg_1", dropped.id)
    const todos: string[] = []
    const [store, setStore] = createStore(
      baseState({
        limit: 1,
        session: [dropped],
        message: { [dropped.id]: [message] },
        part: { [message.id]: [textPart("prt_1", dropped.id, message.id)] },
        todo: { [dropped.id]: [] },
        permission: { [dropped.id]: [] },
        question: { [dropped.id]: [] },
        session_status: { [dropped.id]: { type: "busy" } },
      }),
    )

    applyDirectoryEvent({
      event: created(kept.id),
      store,
      setStore,
      push() {},
      directory: "/tmp",
      setSessionTodo(sessionID, value) {
        if (value !== undefined) return
        todos.push(sessionID)
      },
    })

    expect(store.session.map((x) => x.id)).toEqual([kept.id])
    expect(store.message[dropped.id]).toBeUndefined()
    expect(store.part[message.id]).toBeUndefined()
    expect(store.todo[dropped.id]).toBeUndefined()
    expect(store.permission[dropped.id]).toBeUndefined()
    expect(store.question[dropped.id]).toBeUndefined()
    expect(store.session_status[dropped.id]).toBeUndefined()
    expect(todos).toEqual([dropped.id])
  })

  test("cleanupDroppedSessionCaches clears part-only orphan state", () => {
    const [store, setStore] = createStore(
      baseState({
        session: [rootSession({ id: "ses_keep" })],
        part: { msg_1: [textPart("prt_1", "ses_drop", "msg_1")] },
      }),
    )

    cleanupDroppedSessionCaches(store, setStore, store.session)

    expect(store.part.msg_1).toBeUndefined()
  })

  test("tracks permission and question request lifecycles", () => {
    const sessionID = "ses_1"
    const [store, setStore] = createStore(
      baseState({
        permission: { [sessionID]: [permissionRequest("perm_1", sessionID), permissionRequest("perm_3", sessionID)] },
        question: { [sessionID]: [questionRequest("q_1", sessionID), questionRequest("q_3", sessionID)] },
      }),
    )

    applyDirectoryEvent({
      event: { type: "permission.v2.asked", properties: permissionAsked("perm_2", sessionID) },
      store,
      setStore,
      push() {},
      directory: "/tmp",
    })
    expect(store.permission[sessionID]?.map((x) => x.id)).toEqual(["perm_1", "perm_2", "perm_3"])

    applyDirectoryEvent({
      event: { type: "permission.v2.asked", properties: permissionAsked("perm_2", sessionID, "updated") },
      store,
      setStore,
      push() {},
      directory: "/tmp",
    })
    expect(store.permission[sessionID]?.find((x) => x.id === "perm_2")?.permission).toBe("updated")

    applyDirectoryEvent({
      event: { type: "permission.v2.replied", properties: { sessionID, requestID: "perm_2" } },
      store,
      setStore,
      push() {},
      directory: "/tmp",
    })
    expect(store.permission[sessionID]?.map((x) => x.id)).toEqual(["perm_1", "perm_3"])

    applyDirectoryEvent({
      event: { type: "question.v2.asked", properties: questionRequest("q_2", sessionID) },
      store,
      setStore,
      push() {},
      directory: "/tmp",
    })
    expect(store.question[sessionID]?.map((x) => x.id)).toEqual(["q_1", "q_2", "q_3"])

    applyDirectoryEvent({
      event: { type: "question.v2.asked", properties: questionRequest("q_2", sessionID, "updated") },
      store,
      setStore,
      push() {},
      directory: "/tmp",
    })
    expect(store.question[sessionID]?.find((x) => x.id === "q_2")?.questions[0]?.header).toBe("updated")

    applyDirectoryEvent({
      event: { type: "question.v2.rejected", properties: { sessionID, requestID: "q_2" } },
      store,
      setStore,
      push() {},
      directory: "/tmp",
    })
    expect(store.question[sessionID]?.map((x) => x.id)).toEqual(["q_1", "q_3"])
  })

  test("updates vcs branch in store and cache", () => {
    const [store, setStore] = createStore(baseState({ vcs: { branch: "main", default_branch: "main" } }))
    const [cacheStore, setCacheStore] = createStore({
      value: { branch: "main", default_branch: "main" } as State["vcs"],
    })

    applyDirectoryEvent({
      event: { type: "vcs.branch.updated", properties: { branch: "feature/test" } },
      store,
      setStore,
      push() {},
      directory: "/tmp",
      vcsCache: {
        store: cacheStore,
        setStore: setCacheStore,
        ready: () => true,
      },
    })

    expect(store.vcs).toEqual({ branch: "feature/test", default_branch: "main" })
    expect(cacheStore.value).toEqual({ branch: "feature/test", default_branch: "main" })
  })
})
