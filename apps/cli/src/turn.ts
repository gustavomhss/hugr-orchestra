import type { Orchestra, PermissionsListRequestsOutput, SessionsEventsOutput } from "@orchestra/client"

type Client = ReturnType<typeof Orchestra.make>
export type Event = SessionsEventsOutput
export type PermissionRequest = PermissionsListRequestsOutput["data"][number]
export type Reply = "once" | "always" | "reject"

/**
 * Drives one admitted prompt (or command) to completion: streams the session's durable events from before the prompt,
 * answers permission requests of the session and its subagents, and waits until the history shows the prompt was
 * promoted. The server's wake is advisory, so a `wait` that returns earlier observed an idle session, not our turn.
 * Every event reaches `onEvent` once, in sequence order, even when the stream and the history both carry it.
 */
export async function runTurn(
  client: Client,
  input: {
    readonly sessionID: string
    readonly location?: { directory: string }
    readonly submit: () => Promise<{ readonly id: string }>
    readonly onEvent: (event: Event) => void
    readonly onPermission: (request: PermissionRequest) => Promise<Reply>
    readonly signal?: AbortSignal
  },
) {
  const baseline = await lastSeq(client, input.sessionID)
  const state = { seq: baseline ?? -1, promoted: new Set<string>() }
  const deliver = (event: Event) => {
    const seq = event.durable?.seq
    if (seq !== undefined) {
      if (seq <= state.seq) return
      state.seq = seq
    }
    if (event.type === "session.next.prompted") state.promoted.add((event.data as { messageID: string }).messageID)
    input.onEvent(event)
  }

  const stop = new AbortController()
  input.signal?.addEventListener("abort", () => stop.abort(), { once: true })
  const stream = (async () => {
    for await (const event of client.sessions.events({ sessionID: input.sessionID, after: baseline }, { signal: stop.signal })) deliver(event)
  })().catch(() => undefined)
  const permissions = answerPermissions(client, input.sessionID, input.location, stop.signal, input.onPermission)

  const admitted = await input.submit().catch((error) => (error instanceof Error ? error : new Error(JSON.stringify(error))))
  if (admitted instanceof Error) {
    stop.abort()
    await Promise.all([stream, permissions])
    throw admitted
  }

  const finished = await (async () => {
    for (let attempt = 0; attempt < 40; attempt++) {
      await client.sessions.wait({ sessionID: input.sessionID })
      await flush(client, input.sessionID, state, deliver)
      if (state.promoted.has(admitted.id)) return true
      await Bun.sleep(250)
    }
    return false
  })()
  stop.abort()
  await Promise.all([stream, permissions])
  return finished
}

async function lastSeq(client: Client, sessionID: string) {
  let after: number | undefined
  while (true) {
    const page = await client.sessions.history({ sessionID, after })
    after = page.data.at(-1)?.durable?.seq ?? after
    if (!page.hasMore) return after
  }
}

async function flush(client: Client, sessionID: string, state: { seq: number }, deliver: (event: Event) => void) {
  while (true) {
    const page = await client.sessions.history({ sessionID, after: state.seq < 0 ? undefined : state.seq })
    page.data.forEach((event) => deliver(event as Event))
    if (!page.hasMore) return
  }
}

/** An unanswered request would block the run forever, so every one is answered, including those of subagents. */
async function answerPermissions(
  client: Client,
  sessionID: string,
  location: { directory: string } | undefined,
  signal: AbortSignal,
  decide: (request: PermissionRequest) => Promise<Reply>,
) {
  const answered = new Set<string>()
  const family = new Map<string, boolean>([[sessionID, true]])
  const belongs = async (id: string): Promise<boolean> => {
    const known = family.get(id)
    if (known !== undefined) return known
    const parent = (await client.sessions.get({ sessionID: id }).catch(() => undefined))?.parentID
    const result = parent ? await belongs(parent) : false
    family.set(id, result)
    return result
  }
  while (!signal.aborted) {
    const requests = await client.permissions.listRequests({ location }).catch(() => undefined)
    for (const request of requests?.data ?? []) {
      if (answered.has(request.id) || !(await belongs(request.sessionID))) continue
      answered.add(request.id)
      const reply = await decide(request).catch((): Reply => "reject")
      await client.permissions.reply({ sessionID: request.sessionID, requestID: request.id, reply }).catch(() => undefined)
    }
    await Bun.sleep(200)
  }
}
