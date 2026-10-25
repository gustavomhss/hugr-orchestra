import type { Message, Part, Session } from "@/v2-wire"

import type { SessionMessageInfo } from "@/v2-legacy"


import { downloadText } from "./download"
import type { ServerApi } from "./server"
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

export type SessionExportApi = {
  session: Pick<ServerApi["session"], "get">
  message: Pick<ServerApi["message"], "list">
}

const exportPageSize = 200

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

// The server keeps a message log, not messages and parts; the file is built from it the way the timeline is, so it
// keeps the `orchestra export` shape.
export async function fetchSessionExport(input: { sessionID: string; api: SessionExportApi }): Promise<SessionExportData> {
  const sessionID = input.sessionID
  const api = input.api
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
