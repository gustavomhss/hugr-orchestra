// The desktop side of the meeting API: start, append final segments, stop. Main has no SDK client, so this is plain
// fetch with the owned server's Basic credentials. Appends queue and retry until they land; segment ids are chosen
// here, so a retried append is idempotent on the server.

export type MeetingServer = { url: string; username?: string; password?: string; directory?: string }
export type MeetingSegment = { id: string; track: "me" | "them"; text: string; startMs: number; endMs: number }

const RETRY_MS = 2000

// The owned server's requests from main: Basic credentials, and the meeting's directory as the request's Location.
export function liveRequest(server: MeetingServer) {
  const headers = new Headers({ "content-type": "application/json" })
  if (server.password)
    headers.set(
      "authorization",
      `Basic ${Buffer.from(`${server.username ?? "orchestra"}:${server.password}`).toString("base64")}`,
    )
  const endpoint = (path: string) => {
    const url = new URL(path, server.url)
    if (server.directory) url.searchParams.set("location[directory]", server.directory)
    return url
  }
  return {
    endpoint,
    headers,
    async post(path: string, body: unknown) {
      const response = await fetch(endpoint(path), { method: "POST", headers, body: JSON.stringify(body) })
      if (!response.ok) throw new Error(`${path} answered ${response.status}: ${await response.text()}`)
      return response
    },
  }
}

export function meetingClient(
  server: MeetingServer,
  hooks: { failed(reason: string, pending: number, offlineMs: number): void; recovered(): void } = {
    failed() {},
    recovered() {},
  },
) {
  const post = liveRequest(server).post
  const state = {
    pending: [] as MeetingSegment[],
    sending: undefined as Promise<void> | undefined,
    retry: undefined as ReturnType<typeof setTimeout> | undefined,
    // When the first append of the current failure run failed; undefined while appends land.
    failingSince: undefined as number | undefined,
  }

  // One append in flight at a time; whatever queued meanwhile goes in the next batch.
  const send = (meetingID: string): Promise<void> => {
    if (state.sending) return state.sending
    if (state.pending.length === 0) return Promise.resolve()
    const batch = state.pending.length
    state.sending = post("/api/meeting/segments", { meetingID, segments: state.pending.slice() })
      .then(
        () => {
          state.pending = state.pending.slice(batch)
          if (state.failingSince !== undefined) hooks.recovered()
          state.failingSince = undefined
        },
        (error) => {
          state.failingSince ??= Date.now()
          hooks.failed(String(error), state.pending.length, Date.now() - state.failingSince)
          clearTimeout(state.retry)
          state.retry = setTimeout(() => void send(meetingID), RETRY_MS)
        },
      )
      .finally(() => {
        state.sending = undefined
      })
    return state.sending.then(() => (state.failingSince === undefined ? send(meetingID) : undefined))
  }

  return {
    async start(sessionID: string, title: string) {
      const info: { id: string; timeStarted: number } = await (await post("/api/meeting/start", { sessionID, title, consent: "unknown" })).json()
      return info
    },
    append(meetingID: string, segment: MeetingSegment) {
      state.pending.push(segment)
      void send(meetingID)
    },
    // Sends what is still queued once more, then stops the meeting. Segments that still fail are reported, not lost
    // silently: the caller gets the count.
    async stop(meetingID: string) {
      clearTimeout(state.retry)
      await send(meetingID)
      await post("/api/meeting/stop", { meetingID })
      return { unsent: state.pending.length }
    },
  }
}
