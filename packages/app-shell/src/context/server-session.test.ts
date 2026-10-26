import { describe, expect, test } from "bun:test"
import type { retry } from "@orchestra/core/util/retry"
import type { MessageListOutput } from "@/server-api"
import type { ClientEvent, SessionMessageInfo } from "@/session-types"
import type { Message, Part, Session } from "@/v2-wire"
import type { ServerApi } from "@/utils/server"
import { sessionMessagePartID } from "@/utils/session-message"
import { createServerSession, type ServerSession } from "./server-session"

type SessionApi = Pick<ServerApi["session"], "get" | "message">
type MessageApi = ServerApi["message"]
type UserMessage = Extract<Message, { role: "user" }>
type AssistantMessage = Extract<Message, { role: "assistant" }>
type TextPart = Extract<Part, { type: "text" }>

const session = (id: string, parentID?: string): Session => ({
  id,
  slug: id,
  projectID: "project",
  directory: "/repo",
  title: id,
  version: "1",
  parentID,
  time: { created: 1, updated: 1 },
})

// Current API message fixtures, as the message list returns them.
const v2User = (id: string, created = 1, text = "text"): SessionMessageInfo => ({
  id,
  type: "user",
  text,
  time: { created },
})

const v2Assistant = (id: string, created: number, text?: string): SessionMessageInfo => ({
  id,
  type: "assistant",
  agent: "build",
  model: { id: "model", providerID: "provider" },
  content: text === undefined ? [] : [{ type: "text", text }],
  time: { created, completed: created },
})

// Wire-shaped messages, used for live events and optimistic input.
const userMessage = (id: string, input: Partial<UserMessage> = {}): UserMessage => ({
  id,
  sessionID: "ses_child",
  role: "user",
  time: { created: 1 },
  agent: "build",
  model: { providerID: "provider", modelID: "model" },
  ...input,
})

// A user message as the store projects it from a page with no preceding agent or model selection.
const projectedUser = (id: string, created = 1): UserMessage => ({
  id,
  sessionID: "ses_child",
  role: "user",
  time: { created },
  agent: "",
  model: { providerID: "", modelID: "" },
})

const textPart = (messageID: string, input: Partial<TextPart> = {}): TextPart => ({
  id: sessionMessagePartID(messageID, "text", 0),
  sessionID: "ses_child",
  messageID,
  type: "text",
  text: "text",
  ...input,
})

// Fixtures list messages oldest first; the API returns each page newest first.
const page = (data: SessionMessageInfo[] = [], next?: string): MessageListOutput => ({
  data: data.toReversed(),
  cursor: { next },
})

const deferredPage = () => Promise.withResolvers<MessageListOutput>()

const ids = (store: ServerSession) => store.data.message.ses_child?.map((message) => message.id)

function messageClient(...pages: Array<MessageListOutput | Promise<MessageListOutput>>) {
  const requests: unknown[] = []
  const messageRequests: unknown[] = []
  const waiting = new Map<number, () => void>()
  const sessionApi = {
    get: async () => session("ses_child", "ses_root"),
    message: async (input: unknown) => {
      messageRequests.push(input)
      throw new Error("single message endpoint called")
    },
  } as unknown as SessionApi
  const messageApi = {
    list: (input: unknown) => {
      requests.push(input)
      waiting.get(requests.length)?.()
      waiting.delete(requests.length)
      return pages[requests.length - 1]
    },
  } as unknown as MessageApi
  return {
    sessionApi,
    messageApi,
    requests,
    messageRequests,
    requested(count: number) {
      if (requests.length >= count) return Promise.resolve()
      return new Promise<void>((resolve) => waiting.set(count, resolve))
    },
  }
}

const create = (client: ReturnType<typeof messageClient>, options: { retry?: typeof retry } = {}) =>
  createServerSession(client.sessionApi, client.messageApi, { ...options, todo: async () => [] })

const retryImmediately: typeof retry = async (task, options = {}) => {
  const attempts = options.attempts ?? 3
  for (let attempt = 0; ; attempt++) {
    try {
      return await task()
    } catch (error) {
      if (attempt === attempts - 1) throw error
    }
  }
}

function setup(sessions: Record<string, Session>) {
  const get: unknown[] = []
  const messages: unknown[] = []
  const sessionApi = {
    get: async (input: { sessionID: string }) => {
      get.push(input)
      return sessions[input.sessionID]
    },
    message: async () => {
      throw new Error("single message endpoint called")
    },
  } as unknown as SessionApi
  const messageApi = {
    list: async (input: unknown) => {
      messages.push(input)
      return page()
    },
  } as unknown as MessageApi
  return { get, messages, store: createServerSession(sessionApi, messageApi, { todo: async () => [] }) }
}

describe("server session", () => {
  test("projects V2 session events into current and wire message state", () => {
    const ctx = setup({ ses_child: session("ses_child") })
    ctx.store.remember(session("ses_child"))
    ctx.store.set("session_message", "ses_child", [
      {
        id: "msg_1_user",
        type: "user",
        text: "hello",
        time: { created: 1 },
      },
    ])
    const apply = (input: object) => ctx.store.applyV2(input as ClientEvent)

    apply({
      id: "evt_step",
      created: 2,
      type: "session.step.started",
      durable: { aggregateID: "ses_child", seq: 1, version: 1 },
      location: { directory: "/repo" },
      data: {
        sessionID: "ses_child",
        assistantMessageID: "msg_2_assistant",
        agent: "build",
        model: { id: "model", providerID: "provider" },
      },
    })
    apply({
      id: "evt_text_start",
      created: 3,
      type: "session.text.started",
      durable: { aggregateID: "ses_child", seq: 2, version: 1 },
      location: { directory: "/repo" },
      data: { sessionID: "ses_child", assistantMessageID: "msg_2_assistant", ordinal: 0 },
    })
    apply({
      id: "evt_text_delta",
      created: 4,
      type: "session.text.delta",
      location: { directory: "/repo" },
      data: { sessionID: "ses_child", assistantMessageID: "msg_2_assistant", ordinal: 0, delta: "world" },
    })

    expect(ctx.store.data.session_message.ses_child?.at(-1)).toMatchObject({
      id: "msg_2_assistant",
      type: "assistant",
      content: [{ type: "text", text: "world" }],
    })
    expect(ctx.store.data.message.ses_child?.map((message) => message.id)).toEqual(["msg_1_user", "msg_2_assistant"])
    expect(ctx.store.data.part.msg_2_assistant).toMatchObject([{ type: "text", text: "world" }])
  })

  test("resolves lineage by session ID without directory", async () => {
    const ctx = setup({ ses_child: session("ses_child", "ses_root"), ses_root: session("ses_root") })

    const result = await ctx.store.lineage.resolve("ses_child")

    expect(result.root.id).toBe("ses_root")
    expect(ctx.get).toEqual([{ sessionID: "ses_child" }, { sessionID: "ses_root" }])
    expect(ctx.store.lineage.peek("ses_child")).toEqual(result)
  })

  test("loads session content through the server client", async () => {
    const ctx = setup({ ses_root: session("ses_root") })

    await ctx.store.sync("ses_root")

    expect(ctx.get).toEqual([{ sessionID: "ses_root" }])
    expect(ctx.messages).toEqual([{ sessionID: "ses_root", limit: 20, order: "desc" }])
    expect(ctx.store.data.message.ses_root).toEqual([])
  })

  test("loads current session content through the current message API", async () => {
    const user = v2User("msg_z_user", 1, "hello")
    const assistant = v2Assistant("msg_a_assistant", 2, "hi")
    const client = messageClient(page([user, assistant]))
    const store = create(client)
    store.remember(session("ses_root"))

    await store.sync("ses_root")

    expect(client.requests).toEqual([{ sessionID: "ses_root", limit: 20, order: "desc" }])
    expect(store.data.session_message.ses_root?.map((message) => message.id)).toEqual([user.id, assistant.id])
    expect(store.data.message.ses_root?.map((message) => message.id)).toEqual([user.id, assistant.id])
  })

  test("extends a current page to include the user for split assistant turns", async () => {
    const user = v2User("msg_1_user", 1, "hello")
    const assistants = [
      v2Assistant("msg_2_assistant", 2, "msg_2_assistant"),
      v2Assistant("msg_3_assistant", 3, "msg_3_assistant"),
      v2Assistant("msg_4_assistant", 4, "msg_4_assistant"),
    ]
    const client = messageClient(page(assistants.slice(1), "older"), page([user, assistants[0]!]))
    const store = create(client)
    store.remember(session("ses_root"))

    await store.sync("ses_root")

    expect(client.requests).toEqual([
      { sessionID: "ses_root", limit: 20, order: "desc" },
      { sessionID: "ses_root", limit: 20, cursor: "older" },
    ])
    expect(store.data.message.ses_root?.map((message) => message.id)).toEqual([
      user.id,
      ...assistants.map((item) => item.id),
    ])
    expect(assistants.map((item) => store.data.part[item.id]?.[0]?.type)).toEqual(["text", "text", "text"])
  })

  test("backfills an assistant-only initial page through its user root", async () => {
    const client = messageClient(
      page([v2Assistant("message-2", 2), v2Assistant("message-3", 3)], "older"),
      page([v2User("message-1")], "older-2"),
    )
    const store = create(client)

    await store.sync("ses_child")

    expect(client.requests).toEqual([
      { sessionID: "ses_child", limit: 20, order: "desc" },
      { sessionID: "ses_child", limit: 20, cursor: "older" },
    ])
    expect(client.messageRequests).toEqual([])
    expect(ids(store)).toEqual(["message-1", "message-2", "message-3"])
    expect(store.history.more("ses_child")).toBe(true)
  })

  test("does not let an optimistic user suppress initial root backfill", async () => {
    const user = userMessage("message-1")
    const client = messageClient(
      page([v2Assistant("message-2", 2), v2Assistant("message-3", 3)], "older"),
      page([v2User(user.id)]),
    )
    const store = create(client)
    store.optimistic.add({ sessionID: "ses_child", message: user, parts: [textPart(user.id)] })

    await store.sync("ses_child")
    store.optimistic.remove({ sessionID: "ses_child", messageID: user.id })

    expect(client.requests).toHaveLength(2)
    expect(client.messageRequests).toEqual([])
    expect(ids(store)).toEqual(["message-1", "message-2", "message-3"])
  })

  test("backfills the parent of fetched assistants when another user is cached", async () => {
    const client = messageClient(
      page([v2User("message-0", 0)]),
      page([v2Assistant("message-2", 2), v2Assistant("message-3", 3)], "older"),
      page([v2User("message-1")]),
    )
    const store = create(client)
    await store.sync("ses_child")

    await store.sync("ses_child", { force: true })

    expect(client.requests).toHaveLength(3)
    expect(client.messageRequests).toEqual([])
    expect(ids(store)).toEqual(["message-0", "message-1", "message-2", "message-3"])
  })

  test("preserves cached history between an injected parent and the page boundary", async () => {
    const client = messageClient(
      page([v2User("message-3", 3)]),
      page([v2Assistant("message-4", 4)], "older"),
      page([v2User("message-1")]),
    )
    const store = create(client)
    await store.sync("ses_child")

    await store.sync("ses_child", { force: true })

    expect(ids(store)).toEqual(["message-1", "message-3", "message-4"])
  })

  test("refreshes a cached parent omitted by an assistant-only replacement page", async () => {
    const client = messageClient(
      page([v2User("message-1", 1, "stale")]),
      page([v2Assistant("message-2", 2)], "older"),
      page([v2User("message-1", 1, "fresh")]),
    )
    const store = create(client)
    await store.sync("ses_child")

    await store.sync("ses_child", { force: true })

    expect(client.messageRequests).toEqual([])
    expect(ids(store)).toEqual(["message-1", "message-2"])
    expect(store.data.part["message-1"]).toEqual([textPart("message-1", { text: "fresh" })])
  })

  test("refreshes a confirmed optimistic parent while preserving pending parts", async () => {
    const stale = userMessage("message-1")
    const confirmed = textPart(stale.id, { text: "stale" })
    const pending = textPart(stale.id, { id: "pending", text: "pending" })
    const client = messageClient(
      page([v2User(stale.id, 1, "stale")]),
      page([v2Assistant("message-2", 2)], "older"),
      page([v2User(stale.id, 1, "fresh")]),
    )
    const store = create(client)
    store.optimistic.add({ sessionID: "ses_child", message: stale, parts: [confirmed, pending] })
    await store.sync("ses_child")

    await store.sync("ses_child", { force: true })

    expect(client.messageRequests).toEqual([])
    expect(ids(store)).toEqual(["message-1", "message-2"])
    expect(store.data.part[stale.id]).toEqual([{ ...confirmed, text: "fresh" }, pending])
  })

  test("uses a parent received by SSE during the replacement load", async () => {
    const pending = deferredPage()
    const user = userMessage("message-1")
    const client = messageClient(pending.promise, page())
    const store = create(client)
    const loading = store.sync("ses_child")

    store.transcript.putMessage(user)
    pending.resolve(page([v2Assistant("message-2", 2)], "older"))
    await loading

    expect(client.requests).toHaveLength(2)
    expect(client.messageRequests).toEqual([])
    expect(ids(store)).toEqual(["message-1", "message-2"])
    expect(store.data.message.ses_child?.[0]).toEqual(user)
  })

  test("merges live events into the initial page", async () => {
    const pending = deferredPage()
    const live = userMessage("message-2", { time: { created: 2 } })
    const livePart = textPart(live.id, { text: "live" })
    const store = create(messageClient(pending.promise))
    const loading = store.sync("ses_child")

    store.transcript.putMessage(live)
    store.transcript.putPart(livePart)
    pending.resolve(page([v2User("message-1")]))
    await loading

    expect(ids(store)).toEqual(["message-1", "message-2"])
    expect(store.data.message.ses_child?.[1]).toEqual(live)
    expect(store.data.part[live.id]).toEqual([livePart])
  })

  test("preserves same-ID live updates over the initial page", async () => {
    const pending = deferredPage()
    const live = userMessage("message", { time: { created: 2 } })
    const livePart = textPart(live.id, { text: "live" })
    const store = create(messageClient(pending.promise))
    const loading = store.sync("ses_child")

    store.transcript.putMessage(live)
    store.transcript.putPart(livePart)
    pending.resolve(page([v2User(live.id, 1, "fetched")]))
    await loading

    expect(store.data.message.ses_child).toEqual([live])
    expect(store.data.part[live.id]).toEqual([livePart])
  })

  test("preserves part removals received during the initial load", async () => {
    const pending = deferredPage()
    const store = create(messageClient(pending.promise))
    const loading = store.sync("ses_child")

    store.transcript.dropPart({ sessionID: "ses_child", messageID: "message-2", partID: textPart("message-2").id })
    pending.resolve(page([v2User("message-1"), v2User("message-2", 1, "removed")]))
    await loading

    expect(store.data.message.ses_child).toEqual([projectedUser("message-1"), projectedUser("message-2")])
    expect(store.data.part["message-2"]).toBeUndefined()
  })

  test("keeps removal tracking isolated across load generations", async () => {
    const firstPage = deferredPage()
    const secondPage = deferredPage()
    const store = create(messageClient(firstPage.promise, secondPage.promise))
    const first = store.sync("ses_child")

    store.transcript.dropPart({ sessionID: "ses_child", messageID: "message", partID: textPart("message").id })
    store.apply({ type: "session.next.deleted", properties: { timestamp: 2, sessionID: "ses_child" } })
    const second = store.sync("ses_child")

    firstPage.resolve(page())
    await first
    secondPage.resolve(page([v2User("message")]))
    await second

    expect(ids(store)).toEqual(["message"])
    expect(store.data.part.message).toEqual([textPart("message")])
  })

  test("tracks removals in a replacement load generation", async () => {
    const firstPage = deferredPage()
    const secondPage = deferredPage()
    const store = create(messageClient(firstPage.promise, secondPage.promise))
    const first = store.sync("ses_child")
    store.apply({ type: "session.next.deleted", properties: { timestamp: 2, sessionID: "ses_child" } })
    const second = store.sync("ses_child")

    store.transcript.dropPart({ sessionID: "ses_child", messageID: "message", partID: textPart("message").id })
    firstPage.resolve(page())
    await first
    secondPage.resolve(page([v2User("message")]))
    await second

    expect(ids(store)).toEqual(["message"])
    expect(store.data.part.message).toBeUndefined()
  })

  test("preserves event content outside an incomplete initial page", async () => {
    const live = userMessage("message-1")
    const store = create(messageClient(page([v2User("message-2", 2)], "older")))
    store.transcript.putMessage(live)

    await store.sync("ses_child")

    expect(ids(store)).toEqual(["message-1", "message-2"])
  })

  test("does not restore removed optimistic parts on refresh", async () => {
    const kept = userMessage("kept")
    const keptPart = textPart(kept.id, { text: "removed" })
    const store = create(messageClient(page([v2User(kept.id)])))
    store.optimistic.add({ sessionID: "ses_child", message: kept, parts: [keptPart] })

    store.transcript.dropPart({ sessionID: "ses_child", messageID: kept.id, partID: keptPart.id })
    await store.sync("ses_child", { force: true })

    expect(ids(store)).toEqual([kept.id])
    expect(store.data.part[kept.id]).toBeUndefined()
  })

  test("replaces confirmed optimistic content with the initial page", async () => {
    const optimistic = userMessage("message")
    const store = create(messageClient(page([v2User(optimistic.id, 2)])))
    store.optimistic.add({ sessionID: "ses_child", message: optimistic, parts: [] })

    await store.sync("ses_child")

    expect(store.data.message.ses_child).toEqual([projectedUser(optimistic.id, 2)])
  })

  test("replaces a confirmed optimistic part with fetched content", async () => {
    const pending = deferredPage()
    const message = userMessage("message")
    const optimistic = textPart(message.id, { text: "optimistic" })
    const store = create(messageClient(pending.promise))
    const loading = store.sync("ses_child")

    store.optimistic.add({ sessionID: "ses_child", message, parts: [optimistic] })
    pending.resolve(page([v2User(message.id, 1, "fetched")]))
    await loading

    expect(store.data.part[message.id]).toEqual([{ ...optimistic, text: "fetched" }])
  })

  test("rolls back only unconfirmed optimistic parts", async () => {
    const pending = deferredPage()
    const message = userMessage("message")
    const confirmed = textPart(message.id, { text: "confirmed" })
    const pendingPart = textPart(message.id, { id: "pending", text: "pending" })
    const store = create(messageClient(pending.promise))
    const loading = store.sync("ses_child")
    store.optimistic.add({ sessionID: "ses_child", message, parts: [confirmed, pendingPart] })

    pending.resolve(page([v2User(message.id, 1, "confirmed")]))
    await loading
    store.optimistic.remove({ sessionID: "ses_child", messageID: message.id })

    expect(store.data.message.ses_child).toEqual([projectedUser(message.id)])
    expect(store.data.part[message.id]).toEqual([confirmed])
  })

  test("updates confirmed optimistic parts from later pages", async () => {
    const message = userMessage("message")
    const confirmed = textPart(message.id, { text: "first" })
    const pendingPart = textPart(message.id, { id: "pending", text: "pending" })
    const store = create(
      messageClient(page([v2User(message.id, 1, "first")]), page([v2User(message.id, 1, "updated")])),
    )
    store.optimistic.add({ sessionID: "ses_child", message, parts: [confirmed, pendingPart] })
    await store.sync("ses_child")

    await store.sync("ses_child", { force: true })
    store.optimistic.remove({ sessionID: "ses_child", messageID: message.id })

    expect(store.data.part[message.id]).toEqual([{ ...confirmed, text: "updated" }])
  })

  test("does not restore a confirmed optimistic part after its removal event", async () => {
    const message = userMessage("message")
    const confirmed = textPart(message.id, { text: "confirmed" })
    const pendingPart = textPart(message.id, { id: "pending", text: "pending" })
    const store = create(
      messageClient(page([v2User(message.id, 1, "confirmed")]), page([v2User(message.id, 1, "confirmed")])),
    )
    store.optimistic.add({ sessionID: "ses_child", message, parts: [confirmed, pendingPart] })
    await store.sync("ses_child")
    store.transcript.dropPart({ sessionID: "ses_child", messageID: message.id, partID: confirmed.id })

    await store.sync("ses_child", { force: true })

    expect(store.data.part[message.id]).toEqual([pendingPart])
  })

  test("does not remove content confirmed by a message event", () => {
    const message = userMessage("message")
    const part = textPart(message.id)
    const store = setup({ ses_child: session("ses_child") }).store
    store.optimistic.add({ sessionID: "ses_child", message, parts: [part] })
    store.transcript.putMessage(message)

    store.optimistic.remove({ sessionID: "ses_child", messageID: message.id })

    expect(store.data.message.ses_child).toEqual([message])
    expect(store.data.part[message.id]).toBeUndefined()
  })

  test("does not remove parts confirmed by part events", () => {
    const message = userMessage("message")
    const part = textPart(message.id)
    const store = setup({ ses_child: session("ses_child") }).store
    store.optimistic.add({ sessionID: "ses_child", message, parts: [part] })
    store.transcript.putMessage(message)
    store.transcript.putPart(part)

    store.optimistic.remove({ sessionID: "ses_child", messageID: message.id })

    expect(store.data.message.ses_child).toEqual([message])
    expect(store.data.part[message.id]).toEqual([part])
  })

  test("treats a part event as confirmation when it precedes the message event", () => {
    const message = userMessage("message")
    const part = textPart(message.id)
    const store = setup({ ses_child: session("ses_child") }).store
    store.optimistic.add({ sessionID: "ses_child", message, parts: [part] })
    store.transcript.putPart(part)

    store.optimistic.remove({ sessionID: "ses_child", messageID: message.id })

    expect(store.data.message.ses_child).toEqual([message])
    expect(store.data.part[message.id]).toEqual([part])
  })

  test("clears stale parts when the initial page has none", async () => {
    const pending = deferredPage()
    const message = userMessage("message")
    const part = textPart(message.id, { id: "stale", text: "stale" })
    const store = create(messageClient(pending.promise))
    store.transcript.putMessage(message)
    store.transcript.putPart(part)
    const loading = store.sync("ses_child")

    pending.resolve(page([v2User(message.id)]))
    await loading

    // A projected user always carries its prompt text part; only the stale part is gone.
    expect(store.data.part[message.id]).toEqual([textPart(message.id)])
  })

  test("uses the successful retry response over events from a failed attempt", async () => {
    const failed = deferredPage()
    const retried = deferredPage()
    const message = userMessage("message")
    const stale = textPart(message.id, { text: "stale" })
    const intermediate = { ...stale, text: "intermediate" }
    const client = messageClient(failed.promise, retried.promise)
    const store = create(client, { retry: retryImmediately })
    store.transcript.putMessage(message)
    store.transcript.putPart(stale)
    const loading = store.sync("ses_child")

    store.transcript.putPart(intermediate)
    failed.reject(new Error("failed to fetch"))
    await client.requested(2)
    retried.resolve(page([v2User(message.id, 1, "fetched")]))
    await loading

    expect(store.data.part[message.id]).toEqual([{ ...stale, text: "fetched" }])
  })

  test("preserves part removals across message retries", async () => {
    const failed = deferredPage()
    const retried = deferredPage()
    const message = userMessage("message")
    const part = textPart(message.id)
    const client = messageClient(page([v2User(message.id)]), failed.promise, retried.promise)
    const store = create(client, { retry: retryImmediately })
    await store.sync("ses_child")
    const loading = store.sync("ses_child", { force: true })

    store.transcript.dropPart({ sessionID: "ses_child", messageID: message.id, partID: part.id })
    failed.reject(new Error("failed to fetch"))
    await client.requested(3)
    retried.resolve(page([v2User(message.id)]))
    await loading

    expect(store.data.part[message.id]).toBeUndefined()
  })

  test("accepts part omission from a successful retry", async () => {
    const failed = deferredPage()
    const retried = deferredPage()
    // An assistant can omit a part; a projected user always carries its prompt text part.
    const part = textPart("message-2")
    const client = messageClient(
      page([v2User("message-1"), v2Assistant("message-2", 2, "text")]),
      failed.promise,
      retried.promise,
    )
    const store = create(client, { retry: retryImmediately })
    await store.sync("ses_child")
    const loading = store.sync("ses_child", { force: true })

    failed.reject(new Error("failed to fetch"))
    await client.requested(3)
    retried.resolve(page([v2User("message-1"), v2Assistant("message-2", 2)]))
    await loading

    expect(store.data.part[part.messageID]).toBeUndefined()
  })

  test("clears load-owned orphan parts when all retries fail", async () => {
    const first = deferredPage()
    const second = deferredPage()
    const third = deferredPage()
    const part = textPart("message")
    const client = messageClient(first.promise, second.promise, third.promise)
    const store = create(client, { retry: retryImmediately })
    const loading = store.sync("ses_child").catch((error) => error)

    store.transcript.putPart(part)
    first.reject(new Error("failed to fetch"))
    await client.requested(2)
    second.reject(new Error("failed to fetch"))
    await client.requested(3)
    third.reject(new Error("failed to fetch"))
    await loading

    expect(store.data.part[part.messageID]).toBeUndefined()
  })

  test("preserves live updates during a forced refresh", async () => {
    const pending = deferredPage()
    const stale = userMessage("message")
    const stalePart = textPart(stale.id, { text: "stale" })
    const store = create(messageClient(page([v2User(stale.id, 1, "stale")]), pending.promise))
    await store.sync("ses_child")
    const refreshing = store.sync("ses_child", { force: true })
    const live = { ...stale, time: { created: 2 } }

    store.transcript.putMessage(live)
    store.transcript.putPart({ ...stalePart, text: "stale live" })
    pending.resolve(page([v2User(stale.id, 1, "stale")]))
    await refreshing

    expect(store.data.message.ses_child).toEqual([live])
    expect(store.data.part[stale.id]).toEqual([{ ...stalePart, text: "stale live" }])
  })

  test("keeps fetched message metadata when only a part changes", async () => {
    const pending = deferredPage()
    const part = textPart("message", { text: "stale" })
    const store = create(messageClient(page([v2User("message", 1, "stale")]), pending.promise))
    await store.sync("ses_child")
    const refreshing = store.sync("ses_child", { force: true })

    store.transcript.putPart({ ...part, text: "stale live" })
    pending.resolve(page([v2User("message", 2, "stale")]))
    await refreshing

    expect(store.data.message.ses_child).toEqual([projectedUser("message", 2)])
    expect(store.data.part.message).toEqual([{ ...part, text: "stale live" }])
  })

  test("preserves a part update when a forced refresh omits its message", async () => {
    const pending = deferredPage()
    const live = textPart("message", { text: "live" })
    const store = create(messageClient(page([v2User("message", 1, "stale")]), pending.promise))
    await store.sync("ses_child")
    const refreshing = store.sync("ses_child", { force: true })

    store.transcript.putPart(live)
    pending.resolve(page())
    await refreshing

    expect(store.data.message.ses_child).toEqual([projectedUser("message")])
    expect(store.data.part.message).toEqual([live])
  })

  test("does not restore a completed part removal from a stale refresh", async () => {
    const part = textPart("message")
    const store = create(messageClient(page([v2User("message")]), page([v2User("message")])))
    await store.sync("ses_child")
    store.transcript.dropPart({ sessionID: "ses_child", messageID: part.messageID, partID: part.id })

    await store.sync("ses_child", { force: true })

    expect(store.data.part[part.messageID]).toBeUndefined()
  })

  test("does not cache skipped optimistic parts", () => {
    const message = userMessage("message")
    const part = { id: "part", sessionID: "ses_child", messageID: message.id, type: "step-start" as const }
    const store = setup({ ses_child: session("ses_child") }).store

    store.optimistic.add({ sessionID: "ses_child", message, parts: [part] })

    expect(store.data.part[message.id]).toEqual([])
  })

  test("preserves loaded history during an incomplete refresh", async () => {
    const store = create(
      messageClient(
        page([v2User("message-1"), v2User("message-2", 2)], "older"),
        page([v2User("message-2", 2), v2User("message-3", 3)], "older"),
      ),
    )
    await store.sync("ses_child")

    await store.sync("ses_child", { force: true })

    expect(ids(store)).toEqual(["message-1", "message-2", "message-3"])
  })

  test("preserves a part update for a message being loaded from history", async () => {
    const pending = deferredPage()
    const live = textPart("message-1", { text: "live" })
    const store = create(messageClient(page([v2User("message-2", 2)], "older"), pending.promise))
    await store.sync("ses_child")
    const loading = store.history.loadMore("ses_child")

    store.transcript.putPart(live)
    pending.resolve(page([v2User("message-1", 1, "stale")]))
    await loading

    expect(store.data.part[live.messageID]).toEqual([live])
  })

  test("does not clear newer orphan parts after terminal history prepend", async () => {
    const pending = deferredPage()
    const newer = userMessage("message-3", { time: { created: 3 } })
    const part = textPart(newer.id, { text: "live" })
    const store = create(messageClient(page([v2User("message-2", 2)], "older"), pending.promise))
    await store.sync("ses_child")
    const loading = store.history.loadMore("ses_child")

    store.transcript.putPart(part)
    pending.resolve(page([v2User("message-1")]))
    await loading
    store.transcript.putMessage(newer)

    expect(store.data.part[newer.id]).toEqual([part])
  })

  test("accepts an authoritative history part after an earlier unknown-parent update", async () => {
    const pending = deferredPage()
    const history = deferredPage()
    const part = textPart("message-1", { text: "live" })
    const store = create(messageClient(pending.promise, history.promise))
    const loading = store.sync("ses_child")

    store.transcript.putPart(part)
    pending.resolve(page([v2User("message-2", 2)], "older"))
    await loading

    expect(store.data.part[part.messageID]).toEqual([part])

    const loadingHistory = store.history.loadMore("ses_child")
    history.resolve(page([v2User("message-1", 1, "stale")]))
    await loadingHistory

    expect(store.data.part[part.messageID]).toEqual([{ ...part, text: "stale" }])
  })

  test("preserves an unknown-parent part removal across pages", async () => {
    const initial = deferredPage()
    const history = deferredPage()
    const part = textPart("message-1")
    const store = create(messageClient(initial.promise, history.promise))
    const loading = store.sync("ses_child")

    store.transcript.dropPart({ sessionID: "ses_child", messageID: part.messageID, partID: part.id })
    initial.resolve(page([v2User("message-2", 2)], "older"))
    await loading
    const loadingHistory = store.history.loadMore("ses_child")
    history.resolve(page([v2User("message-1")]))
    await loadingHistory

    expect(store.data.part[part.messageID]).toBeUndefined()
  })

  test("reads todos through the todo option once until forced", async () => {
    const requests: string[] = []
    const todos = [{ content: "write tests", status: "pending", priority: "high" }]
    const store = createServerSession({} as SessionApi, {} as MessageApi, {
      todo: async (sessionID) => {
        requests.push(sessionID)
        return todos
      },
    })

    await store.todo("ses_child")
    await store.todo("ses_child")

    expect(requests).toEqual(["ses_child"])
    expect(store.data.todo.ses_child).toEqual(todos)

    await store.todo("ses_child", { force: true })

    expect(requests).toEqual(["ses_child", "ses_child"])
  })

  test("applies events without a directory store", () => {
    const ctx = setup({})
    ctx.store.apply({
      type: "session.next.created",
      properties: { timestamp: 1, sessionID: "ses_root", projectID: "project", location: { directory: "/repo" }, title: "ses_root" },
    })
    ctx.store.applyV2(
      {
        id: "evt_step_root",
        created: 2,
        type: "session.step.started",
        durable: { aggregateID: "ses_root", seq: 1, version: 1 },
        location: { directory: "/repo" },
        data: {
          sessionID: "ses_root",
          assistantMessageID: "msg_assistant",
          agent: "build",
          model: { id: "model", providerID: "provider" },
        },
      } as unknown as ClientEvent,
    )

    expect(ctx.store.get("ses_root")?.directory).toBe("/repo")
    expect(ctx.store.data.session_working("ses_root")).toBe(true)
    expect(ctx.get).toEqual([])
  })

  test("preserves pinned session content under server-wide cache pressure", () => {
    const ctx = setup({})
    const message: AssistantMessage = {
      id: "message",
      sessionID: "active",
      role: "assistant",
      time: { created: 1 },
      parentID: "parent",
      modelID: "model",
      providerID: "provider",
      mode: "build",
      agent: "agent",
      path: { cwd: "/repo", root: "/repo" },
      cost: 0,
      tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
    }
    ctx.store.pin("active")
    ctx.store.optimistic.add({ sessionID: "active", message, parts: [] })

    for (let index = 0; index < 50; index++) {
      ctx.store.remember(session(`session-${index}`))
      // `apply` touches the session cache (and evicts); the step event itself reaches the store through `applyV2`.
      ctx.store.apply({ type: "session.step.ended", properties: { sessionID: `session-${index}` } })
      ctx.store.applyV2({
        id: `evt_step_${index}`,
        created: 2,
        type: "session.step.ended",
        durable: { aggregateID: `session-${index}`, seq: 1, version: 1 },
        location: { directory: "/repo" },
        data: {
          sessionID: `session-${index}`,
          assistantMessageID: "msg_assistant",
          finish: "stop",
          cost: 0,
          tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
        },
      } as unknown as ClientEvent)
    }

    expect(ctx.store.data.message.active?.map((message) => message.id)).toEqual(["message"])
    expect(ctx.store.data.session_status["session-0"]).toBeUndefined()
  })
})
