// JSON calls against a running V2 `serve` for one project directory (re-exported by lib.ts).

/** The password every campaign serve is started with: V2 serve answers only to its Basic credential. */
export const SERVER_PASSWORD = "omni-campaign-password"

/** JSON calls against an Orchestra server for one project directory; routes carry their /api prefix. */
export function client(url: string, directory: string, password = SERVER_PASSWORD) {
  const call = async (method: string, route: string, body?: unknown) => {
    const target = new URL(route, url)
    target.searchParams.set("location[directory]", directory)
    const response = await fetch(target, {
      method,
      signal: AbortSignal.timeout(120_000),
      headers: {
        "content-type": "application/json",
        authorization: `Basic ${Buffer.from(`orchestra:${password}`).toString("base64")}`,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    const text = await response.text()
    if (!response.ok) throw new Error(`${method} ${route} answered ${response.status}: ${text.slice(0, 500)}`)
    return text ? JSON.parse(text) : undefined
  }
  const api = {
    get: (route: string) => call("GET", route),
    post: (route: string, body?: unknown) => call("POST", route, body ?? {}),
    put: (route: string, body: unknown) => call("PUT", route, body),
    del: (route: string) => call("DELETE", route),
    /** A session on the campaign's fake model, answered by the named agent. */
    session: async (agent = "maestro") =>
      (await api.post("/api/session", { agent, model: { providerID: "test", id: "test-model" } })).data as { id: string },
    /** Admits one prompt; the runner picks it up. */
    prompt: (sessionID: string, text: string) => api.post(`/api/session/${sessionID}/prompt`, { prompt: { text } }),
    /** Blocks until the session's agent loop is idle, then throws if any durable event recorded a failure. */
    idle: async (sessionID: string) => {
      await api.post(`/api/session/${sessionID}/wait`)
      const history = (await api.get(`/api/session/${sessionID}/history`)) as { data: { type: string }[] }
      const failed = history.data.find((event) => /(^|\.)(error|failed)(\.|$)/.test(event.type))
      if (failed) throw new Error(`session ${sessionID} recorded ${failed.type}: ${JSON.stringify(failed)}`)
      return history.data
    },
    /** Every durable event of the session, oldest first. */
    events: async (sessionID: string) => {
      const found: { type: string; data: Record<string, any>; durable?: { seq: number } }[] = []
      for (let after = 0; ; ) {
        const page = (await api.get(`/api/session/${sessionID}/history?limit=100&after=${after}`)) as { data: typeof found; hasMore: boolean }
        found.push(...page.data)
        const last = page.data.at(-1)?.durable?.seq
        if (!page.hasMore || last === undefined || last <= after) return found
        after = last
      }
    },
    /** The session's tool calls folded from its events: running until a success or failure settles them. */
    tools: async (sessionID: string) => {
      const calls = new Map<string, { callID: string; tool: string; input: Record<string, any>; status: "running" | "completed" | "error"; structured?: Record<string, any>; metadata?: Record<string, any>; error?: unknown; start: number; end?: number }>()
      for (const event of await api.events(sessionID)) {
        const callID = event.data.callID as string
        if (event.type === "session.next.tool.called") calls.set(callID, { callID, tool: event.data.tool, input: event.data.input, status: "running", start: Number(event.data.timestamp) })
        const call = calls.get(callID)
        if (!call) continue
        if (event.type === "session.next.tool.success") Object.assign(call, { status: "completed", structured: event.data.structured, metadata: event.data.metadata, end: Number(event.data.timestamp) })
        if (event.type === "session.next.tool.failed") Object.assign(call, { status: "error", error: event.data.error, metadata: event.data.metadata, end: Number(event.data.timestamp) })
      }
      return [...calls.values()]
    },
    /** Sessions with a running agent loop. */
    active: async () => (await api.get("/api/session/active")).data as Record<string, { type: "running" }>,
    /** The background process trees the session's shell tool left running. */
    processes: async (sessionID: string) =>
      (await api.get(`/api/session/${sessionID}/processes`)).data as { id: string; pid: number; title: string; output: string; written: number; processes: { pid: number }[] }[],
  }
  return api
}
