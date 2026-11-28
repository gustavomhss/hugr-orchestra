import { test } from "bun:test"
import type { retry } from "@orchestra/core/util/retry"
import type { MessageListOutput } from "@/server-api"
import type { SessionMessageInfo } from "@/session-types"
import type { Message, Part, Session } from "@/v2-wire"
import type { ServerApi } from "@/utils/server"
import { sessionMessagePartID } from "@/utils/session-message"
import { createServerSession, type ServerSession } from "./server-session"


export type SessionApi = Pick<ServerApi["session"], "get" | "message">
export type MessageApi = ServerApi["message"]
type UserMessage = Extract<Message, { role: "user" }>
export type AssistantMessage = Extract<Message, { role: "assistant" }>
type TextPart = Extract<Part, { type: "text" }>

export const session = (id: string, parentID?: string): Session => ({
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
export const v2User = (id: string, created = 1, text = "text"): SessionMessageInfo => ({
  id,
  type: "user",
  text,
  time: { created },
})

export const v2Assistant = (id: string, created: number, text?: string): SessionMessageInfo => ({
  id,
  type: "assistant",
  agent: "build",
  model: { id: "model", providerID: "provider" },
  content: text === undefined ? [] : [{ type: "text", text }],
  time: { created, completed: created },
})

// Wire-shaped messages, used for live events and optimistic input.
export const userMessage = (id: string, input: Partial<UserMessage> = {}): UserMessage => ({
  id,
  sessionID: "ses_child",
  role: "user",
  time: { created: 1 },
  agent: "build",
  model: { providerID: "provider", modelID: "model" },
  ...input,
})

// A user message as the store projects it from a page with no preceding agent or model selection.
export const projectedUser = (id: string, created = 1): UserMessage => ({
  id,
  sessionID: "ses_child",
  role: "user",
  time: { created },
  agent: "",
  model: { providerID: "", modelID: "" },
})

export const textPart = (messageID: string, input: Partial<TextPart> = {}): TextPart => ({
  id: sessionMessagePartID(messageID, "text", 0),
  sessionID: "ses_child",
  messageID,
  type: "text",
  text: "text",
  ...input,
})

// Fixtures list messages oldest first; the API returns each page newest first.
export const page = (data: SessionMessageInfo[] = [], next?: string): MessageListOutput => ({
  data: data.toReversed(),
  cursor: { next },
})

export const deferredPage = () => Promise.withResolvers<MessageListOutput>()

export const ids = (store: ServerSession) => store.data.message.ses_child?.map((message) => message.id)

export function messageClient(...pages: Array<MessageListOutput | Promise<MessageListOutput>>) {
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

export const create = (client: ReturnType<typeof messageClient>, options: { retry?: typeof retry } = {}) =>
  createServerSession(client.sessionApi, client.messageApi, { ...options, todo: async () => [] })

export const retryImmediately: typeof retry = async (task, options = {}) => {
  const attempts = options.attempts ?? 3
  for (let attempt = 0; ; attempt++) {
    try {
      return await task()
    } catch (error) {
      if (attempt === attempts - 1) throw error
    }
  }
}

export function setup(sessions: Record<string, Session>) {
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

