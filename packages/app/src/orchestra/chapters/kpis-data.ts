import type { SessionListInput, SessionListOutput } from "@opencode-ai/client/promise"

export type UsageSession = Pick<SessionListOutput["data"][number], "id" | "title" | "tokens" | "cost" | "location">
export class UsageUnavailable extends Error {}

export function aggregateUsage(sessions: readonly UsageSession[], complete: boolean) {
  if (!complete) return
  const unique = [...new Map(sessions.map((session) => [session.id, session])).values()]
  const tokens = unique.reduce(
    (total, session) => ({
      input: total.input + session.tokens.input,
      output: total.output + session.tokens.output,
      reasoning: total.reasoning + session.tokens.reasoning,
      read: total.read + session.tokens.cache.read,
      write: total.write + session.tokens.cache.write,
    }),
    { input: 0, output: 0, reasoning: 0, read: 0, write: 0 },
  )
  return {
    sessions: unique.length,
    tokens,
    total: tokens.input + tokens.output + tokens.reasoning + tokens.read + tokens.write,
    // Zero is ambiguous: the V2 runner currently records zero even for paid turns.
    cost:
      unique.length > 0 && unique.every((session) => session.cost > 0)
        ? unique.reduce((total, session) => total + session.cost, 0)
        : undefined,
    top: unique
      .map((session) => ({
        id: session.id,
        title: session.title,
        total:
          session.tokens.input +
          session.tokens.output +
          session.tokens.reasoning +
          session.tokens.cache.read +
          session.tokens.cache.write,
        cost: session.cost > 0 ? session.cost : undefined,
      }))
      .sort((a, b) => b.total - a.total || a.id.localeCompare(b.id))
      .slice(0, 5),
  }
}

export async function loadUsage(input: {
  directory: string
  list: (
    query: SessionListInput,
    options: { signal: AbortSignal },
  ) => Promise<{ data: readonly UsageSession[]; cursor: SessionListOutput["cursor"] }>
  signal: AbortSignal
  progress: (count: number) => void
}) {
  const sessions = new Map<string, UsageSession>()
  const cursors = new Set<string>()
  let cursor: string | undefined
  for (;;) {
    input.signal.throwIfAborted()
    const page = await input.list(
      { directory: input.directory, limit: 100, order: "desc", cursor },
      { signal: input.signal },
    )
    input.signal.throwIfAborted()
    if (!Array.isArray(page.data) || !page.cursor || (page.cursor.next != null && typeof page.cursor.next !== "string"))
      throw new UsageUnavailable()
    page.data.forEach((session) => {
      if (
        typeof session.id !== "string" ||
        typeof session.title !== "string" ||
        session.location?.directory !== input.directory ||
        ![
          session.cost,
          session.tokens?.input,
          session.tokens?.output,
          session.tokens?.reasoning,
          session.tokens?.cache?.read,
          session.tokens?.cache?.write,
        ].every((value) => typeof value === "number" && Number.isFinite(value) && value >= 0)
      )
        throw new UsageUnavailable()
      sessions.set(session.id, session)
    })
    input.progress(sessions.size)
    if (!page.cursor.next) return aggregateUsage([...sessions.values()], true)!
    if (cursors.has(page.cursor.next)) throw new Error("Repeated usage cursor")
    cursors.add(page.cursor.next)
    cursor = page.cursor.next
  }
}

// Export the displayed rows with raw numeric values and no hidden session data.
export function usageCsv(rows: readonly (readonly (string | number)[])[]) {
  return (
    rows
      .map((row) =>
        row
          .map((value) => {
            const text = String(value)
            const safe = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text
            return `"${safe.replaceAll('"', '""')}"`
          })
          .join(","),
      )
      .join("\r\n") + "\r\n"
  )
}
