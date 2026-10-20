import type { Message, Part, Session } from "../compat/sdk-v2-client"
import type { SessionMessageInfo } from "../compat/vendored-client-promise"
import { downloadText } from "./download"
import type { ServerApi } from "./server"
import type { ServerProtocol } from "./server-protocol"
import { normalizeSessionInfo } from "./session"
import { compareMessages, normalizeSessionMessages } from "./session-message"

// Matches the exact `{ info, messages: [{ info, parts }] }` structure produced by `orchestra export` CLI
export type SessionExportData = {
  info: Session
  messages: {
    info: Message
    parts: Part[]
  }[]
}

export type SessionExportClient = {
  session: {
    get: (input: { sessionID: string }) => Promise<{ data?: Session | null }>
    messages: (input: { sessionID: string }) => Promise<{ data?: SessionExportData["messages"] | null }>
  }
}

export type SessionExportApi = {
  session: Pick<ServerApi["session"], "get">
  message: Pick<ServerApi["message"], "list">
}

const exportPageSize = 200

export async function fetchSessionExport(input: {
  sessionID: string
  client: SessionExportClient
  api?: SessionExportApi
  protocol?: PromiseLike<ServerProtocol>
}): Promise<SessionExportData> {
  if (input.api && input.protocol && (await input.protocol) === "v2") return fetchV2SessionExport(input.sessionID, input.api)
  const [sessionRes, messagesRes] = await Promise.all([
    input.client.session.get({ sessionID: input.sessionID }),
    input.client.session.messages({ sessionID: input.sessionID }),
  ])

  if (!sessionRes?.data) {
    throw new Error(`Session not found: ${input.sessionID}`)
  }
  if (!messagesRes?.data) {
    throw new Error(`Failed to load messages for session: ${input.sessionID}`)
  }

  return {
    info: sessionRes.data,
    messages: messagesRes.data,
  }
}

export function sessionExportFilename(session: { id: string; title?: string; slug?: string }) {
  const name = session.title || session.slug || session.id
  const clean = name
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/gi, "-")
    .replace(/^-+|-+$/g, "")
  return `${clean || session.id}.json`
}

export function downloadSessionExport(filename: string, data: unknown) {
  downloadText(filename, JSON.stringify(data, null, 2), "application/json")
}

// The V2 server keeps a message log, not V1 messages and parts; the file is built from it the way the timeline is, so
// it keeps the `orchestra export` shape.
async function fetchV2SessionExport(sessionID: string, api: SessionExportApi): Promise<SessionExportData> {
  const read = async (cursor?: string): Promise<SessionMessageInfo[]> => {
    const page = await api.message.list(
      cursor ? { sessionID, limit: exportPageSize, cursor } : { sessionID, limit: exportPageSize, order: "asc" },
    )
    if (!page.cursor.next || page.data.length < exportPageSize) return [...page.data]
    return [...page.data, ...(await read(page.cursor.next))]
  }
  const [info, source] = await Promise.all([api.session.get({ sessionID }), read()])
  const normalized = normalizeSessionMessages(sessionID, source)
  return {
    info: normalizeSessionInfo(info),
    messages: normalized.messages
      .sort(compareMessages)
      .map((message) => ({ info: message, parts: normalized.parts.get(message.id) ?? [] })),
  }
}
