// JSON calls against a running V2 `serve` for one project directory (re-exported by lib.ts).

/** The password every campaign serve is started with: V2 serve answers only to its Basic credential. */
export const SERVER_PASSWORD = "omni-campaign-password"

/** JSON calls against an Orchestra server for one project directory; routes carry their /api prefix. */
export function client(url: string, directory: string, password = SERVER_PASSWORD) {
  const call = async (method: string, route: string, body?: unknown) => {
    const response = await fetch(new URL(route, url), {
      method,
      signal: AbortSignal.timeout(120_000),
      headers: {
        "content-type": "application/json",
        authorization: `Basic ${Buffer.from(`orchestra:${password}`).toString("base64")}`,
        "x-orchestra-directory": encodeURIComponent(directory),
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
  }
  return api
}
