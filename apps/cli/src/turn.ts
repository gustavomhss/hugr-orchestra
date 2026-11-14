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
    readonly submit: (signal: AbortSignal) => Promise<{ readonly id: string }>
    readonly onEvent: (event: Event) => void
    readonly onPermission: (request: PermissionRequest) => Promise<Reply>
    readonly signal?: AbortSignal
  },
) {
  const stop = new AbortController()
  const signal = input.signal ? AbortSignal.any([input.signal, stop.signal]) : stop.signal
  const baseline = await lastSeq(client, input.sessionID, signal)
  const state = { seq: baseline ?? -1, promoted: new Set<string>() }
  const deliver = (event: Event) => {
    signal.throwIfAborted()
    const seq = event.durable?.seq
    if (seq !== undefined) {
      if (seq <= state.seq) return
      state.seq = seq
    }
    if (event.type === "session.next.prompted") state.promoted.add((event.data as { messageID: string }).messageID)
    input.onEvent(event)
  }
  const failure = Promise.withResolvers<never>()
  const fail = (error: unknown) => {
    if (signal.aborted) return
    failure.reject(error)
    stop.abort(error)
  }
  const stream = (async () => {
    for await (const event of client.sessions.events({ sessionID: input.sessionID, after: baseline }, { signal }))
      deliver(event)
  })().catch(fail)
  const permissions = answerPermissions(client, input.sessionID, input.location, signal, input.onPermission).catch(fail)

  try {
    return await Promise.race([
      failure.promise,
      (async () => {
        signal.throwIfAborted()
        const admitted = await untilAborted(signal, () => input.submit(signal))
        for (let attempt = 0; attempt < 40; attempt++) {
          signal.throwIfAborted()
          await client.sessions.wait({ sessionID: input.sessionID }, { signal })
          await flush(client, input.sessionID, state, deliver, signal)
          if (state.promoted.has(admitted.id)) return true
          await Bun.sleep(250)
        }
        return false
      })(),
    ])
  } catch (error) {
    if (error instanceof Error) throw error
    throw new Error(
      typeof error === "object" && error !== null && "message" in error && typeof error.message === "string"
        ? error.message
        : String(error),
      { cause: error },
    )
  } finally {
    stop.abort()
    await Promise.all([stream, permissions])
  }
}

async function lastSeq(client: Client, sessionID: string, signal: AbortSignal) {
  let after: number | undefined
  while (true) {
    const page = await client.sessions.history({ sessionID, after }, { signal })
    after = page.data.at(-1)?.durable?.seq ?? after
    if (!page.hasMore) return after
  }
}

async function flush(
  client: Client,
  sessionID: string,
  state: { seq: number },
  deliver: (event: Event) => void,
  signal: AbortSignal,
) {
  while (true) {
    const page = await client.sessions.history({ sessionID, after: state.seq < 0 ? undefined : state.seq }, { signal })
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
  const decisions = new Map<string, Reply>()
  const family = new Map<string, boolean>([[sessionID, true]])
  const belongs = async (id: string): Promise<boolean> => {
    const known = family.get(id)
    if (known !== undefined) return known
    const parent = (await client.sessions.get({ sessionID: id }, { signal }).catch(() => undefined))?.parentID
    const result = parent ? await belongs(parent) : false
    family.set(id, result)
    return result
  }
  while (!signal.aborted) {
    const requests = await client.permissions.listRequests({ location }, { signal }).catch(() => undefined)
    for (const request of requests?.data ?? []) {
      if (answered.has(request.id) || !(await belongs(request.sessionID))) continue
      if (signal.aborted) return
      const reply = decisions.get(request.id) ?? (await untilAborted(signal, () => decide(request)))
      decisions.set(request.id, reply)
      if (signal.aborted) return
      const delivered = await client.permissions
        .reply({ sessionID: request.sessionID, requestID: request.id, reply }, { signal })
        .then(
          () => true,
          (error: unknown) =>
            typeof error === "object" && error !== null && "_tag" in error && error._tag === "PermissionNotFoundError",
        )
      if (delivered) {
        answered.add(request.id)
        decisions.delete(request.id)
      }
    }
    await Bun.sleep(200)
  }
}

/** A user callback may outlive the turn; stop awaiting it without letting its eventual rejection escape. */
async function untilAborted<A>(signal: AbortSignal, run: () => Promise<A>) {
  signal.throwIfAborted()
  const interrupted = Promise.withResolvers<never>()
  const abort = () => interrupted.reject(signal.reason)
  signal.addEventListener("abort", abort, { once: true })
  try {
    return await Promise.race([run(), interrupted.promise])
  } finally {
    signal.removeEventListener("abort", abort)
  }
}
