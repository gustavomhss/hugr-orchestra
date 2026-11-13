import { release } from "node:os"
import { BrowserWindow, shell } from "electron"
import type { LiveRunState, LiveSource } from "@orchestra/app/live"

import { isNoAnswer, LIVE_PROMPTS, NO_ANSWER, parseAnswer, parseStopSummary, worthSuggesting } from "./live-answer"
import { readTranscriptionKey } from "./live-key"
import { renameMeeting, type MeetingServer } from "./live-meeting-client"
import type { LiveDeliveryOwner } from "./live-delivery-owner-contract"
import type { LiveOverlay } from "./live-overlay"
import type { LiveOverlayError, LiveOverlaySource, LiveOverlayView } from "./live-overlay-state"
import { PANES, sourcePermissions, systemAudioAvailable } from "./live-readiness"
import type { Caption } from "./live-segmenter"
import { startSenses } from "./live-senses"
import { sessionClient, type LivePrompt, type LiveSessionEvent } from "./live-session-client"
import { defaultTitle, liveSettings, modelRef } from "./live-settings"
import { transportLog } from "./live-transport-log"

// One meeting end to end: the live seat's session, the senses, and the overlay. The owner's actions in the overlay
// become prompts to the seat; the seat's replies become answers and the stop summary. One request is outstanding at a
// time, and it settles when the session goes idle.

type Request = {
  kind: "answer" | "suggestion" | "stop" | "notice"
  source: LiveOverlaySource
  question?: string
  sentAt: number
  firstAt?: number
  text: string
  dropped?: boolean
  // The seat's `live_look` call: the turn that asked waits for the frame. A steered frame is admitted at once but
  // reaches the history only at a later step boundary, so steps before that reply blind: their text is not shown and
  // an idle seen then is held.
  look?: { idled?: boolean }
}

type Meeting = {
  sessionID: string
  client: ReturnType<typeof sessionClient>
  senses?: Awaited<ReturnType<typeof startSenses>>
  log: ReturnType<typeof transportLog>
  abort: AbortController
  meetingID?: string
  localID?: string
  localClosed: boolean
  completed: boolean
  summarySent: boolean
  suppressSummary: boolean
  stopping?: Promise<void>
  closing?: Promise<void>
  tasks: Set<Promise<unknown>>
  sources: Record<LiveSource, boolean>
  title: string
  startedAt: number
  captions: boolean
  lines: Caption[]
  lastQuestion?: string
  request?: Request
}

export type LiveLoop = ReturnType<typeof registerLiveLoop>

export function registerLiveLoop(options: {
  overlay: LiveOverlay
  delivery: Pick<LiveDeliveryOwner, "manager" | "canStart" | "connection" | "onComplete">
  server: (signal?: AbortSignal) => Promise<MeetingServer>
  logDirectory: string
  openSettings: () => void
  runtime?: {
    settings?: ReturnType<typeof liveSettings>
    readKey?: typeof readTranscriptionKey
    permissions?: typeof sourcePermissions
    senses?: typeof startSenses
  }
}) {
  const overlay = options.overlay
  const state = {
    meeting: undefined as Meeting | undefined,
    starting: undefined as AbortController | undefined,
    startup: undefined as Promise<{ ok: boolean }> | undefined,
    startupStop: undefined as Promise<void> | undefined,
    barrier: undefined as Promise<void> | undefined,
    quitting: false,
  }
  const renames = new Set<{ abort: AbortController; done: Promise<void> }>()
  const settings = options.runtime?.settings ?? liveSettings()
  const runListeners = new Set<(state: LiveRunState) => void>()
  const levelListeners = new Set<(levels: Record<LiveSource, number>) => void>()

  const runState = (): LiveRunState => {
    const meeting = state.meeting
    if (!meeting?.senses || !meeting.meetingID) return { running: false }
    return { running: true, meetingID: meeting.meetingID, title: meeting.title, startedAt: meeting.startedAt, sources: meeting.sources }
  }
  const emitRunState = () => runListeners.forEach((listener) => listener(runState()))

  const own = <A>(meeting: Meeting, task: Promise<A>) => {
    const owned: Promise<A> = task.finally(() => meeting.tasks.delete(owned))
    meeting.tasks.add(owned)
    return owned
  }
  const join = async (meeting: Meeting) => {
    while (meeting.tasks.size) await Promise.allSettled([...meeting.tasks])
  }
  const joinRenames = async () => {
    while (renames.size) await Promise.allSettled([...renames].map((rename) => rename.done))
  }
  const suppress = (meeting: Meeting) => {
    meeting.suppressSummary = true
    meeting.abort.abort()
  }
  const maybeSummary = (meeting: Meeting) => {
    if (state.meeting !== meeting || !meeting.localClosed || !meeting.completed || meeting.summarySent || meeting.suppressSummary || meeting.abort.signal.aborted) return
    meeting.summarySent = true
    meeting.request = undefined
    void send(meeting, { kind: "stop", source: "memory" }, { text: LIVE_PROMPTS.stop })
  }
  const unsubscribe = options.delivery.onComplete((completion) => {
    const meeting = state.meeting
    if (!meeting || meeting.suppressSummary || meeting.abort.signal.aborted || meeting.localID !== completion.localID || meeting.sessionID !== completion.sessionID || meeting.meetingID !== completion.meetingID) return
    meeting.completed = true
    maybeSummary(meeting)
  })

  const send = async (meeting: Meeting, request: Omit<Request, "sentAt" | "text">, prompt: LivePrompt, queue = false) => {
    if (meeting.abort.signal.aborted || state.meeting !== meeting || (meeting.request && request.kind !== "notice")) return
    const pending = { ...request, sentAt: Date.now(), text: "" }
    meeting.request = pending
    if (overlay.state().error?.kind === "answer") overlay.setError(undefined)
    await own(meeting, meeting.client.prompt(meeting.sessionID, prompt, queue ? "queue" : "steer")).catch((error) => {
      if (meeting.abort.signal.aborted || state.meeting !== meeting || meeting.request !== pending) return
      meeting.log.write({ event: "prompt-failed", kind: request.kind, reason: String(error) })
      meeting.request = undefined
      // A transport, permission or hotkey note already explains more; the answer note never covers one.
      if (request.kind === "notice" || overlay.state().error) return
      overlay.setError({ kind: "answer", reason: error instanceof Error && error.message ? error.message : String(error) })
      restoreView()
    })
  }

  const settle = (meeting: Meeting, failed?: string) => {
    const request = meeting.request
    if (!request) return
    meeting.request = undefined
    const latencyMs = (request.firstAt ?? Date.now()) - request.sentAt
    meeting.log.write({ event: "answer", kind: request.kind, latencyMs, failed })
    if (request.kind === "stop") {
      overlay.setView(
        parseStopSummary(failed ? "" : request.text, { title: meeting.title, durationMs: request.sentAt - meeting.startedAt }),
      )
      return
    }
    if (request.kind === "notice") return
    if (request.dropped) return restoreView()
    // A failure keeps what already streamed; with nothing to show, the thinking view gives way to the reason.
    if (failed && !request.text.trim() && !overlay.state().error) overlay.setError({ kind: "answer", reason: failed })
    if (isNoAnswer(request.text) || !request.text.trim()) return restoreView()
    overlay.pushAnswer(parseAnswer(request.text, { source: request.source, latencyMs, question: request.question }))
  }

  const restoreView = () => {
    if (overlay.state().view.kind === "thinking")
      overlay.setView(overlay.state().answers.length ? { kind: "answer" } : { kind: "idle" })
  }

  // Streams the answer as it arrives. A reply that may still turn out to be the no-answer token is held back.
  const stream = (request: Request) => {
    if ((request.kind !== "answer" && request.kind !== "suggestion") || request.dropped || request.look) return
    const text = request.text.trim().toLowerCase()
    if (!text || NO_ANSWER.startsWith(text) || isNoAnswer(text)) return
    overlay.streamAnswer(
      parseAnswer(request.text, { source: request.source, latencyMs: (request.firstAt ?? 0) - request.sentAt, question: request.question }),
    )
  }

  const onSession = (meeting: Meeting, event: LiveSessionEvent) => {
    if (meeting.abort.signal.aborted || state.meeting !== meeting) return
    const request = meeting.request
    if (event.kind === "look") {
      void (request ? lookFor(meeting, request, event.question) : look(meeting, event.question))
      return
    }
    if (!request) return
    // The frame is in the history: what follows is the reply to it.
    if (event.kind === "framed") {
      if (!request.look) return
      request.look = undefined
      request.text = ""
      return
    }
    if (event.kind === "busy") return
    if (event.kind === "idle" && request.look) {
      request.look.idled = true
      return
    }
    if (event.kind === "delta") {
      request.firstAt ??= Date.now()
      request.text += event.delta
      return stream(request)
    }
    // A turn can hold several text parts around tool calls; the last full part is the answer.
    if (event.kind === "text") {
      request.firstAt ??= Date.now()
      request.text = event.text
      return stream(request)
    }
    settle(meeting, event.kind === "failed" ? event.message : undefined)
  }

  const showCaptions = (meeting: Meeting) => {
    if (meeting.captions) overlay.setView({ kind: "captions", lines: meeting.lines })
  }

  const onSenses = (meeting: Meeting, event: Parameters<Parameters<typeof startSenses>[0]["onEvent"]>[0]) => {
    if (meeting.abort.signal.aborted || state.meeting !== meeting) return
    if (event.kind === "caption") {
      // Speech from the other side before the answer starts makes a suggestion stale.
      if (event.line.track === "them" && meeting.request?.kind === "suggestion" && !meeting.request.firstAt)
        meeting.request.dropped = true
      meeting.lines = [...meeting.lines.filter((line) => line.track !== event.line.track), event.line]
      return showCaptions(meeting)
    }
    if (event.kind === "segment") {
      const segment = event.segment
      if (segment.track !== "them" || !overlay.state().suggestions || meeting.request) return
      if (!worthSuggesting(segment.text, meeting.lastQuestion)) return
      meeting.lastQuestion = segment.text
      return overlay.setView({ kind: "suggestion", question: segment.text })
    }
    if (event.kind === "error") return overlay.setError(event.error)
    if (event.kind === "recovered" && overlay.state().error?.kind === event.source) overlay.setError(undefined)
  }

  const capture = async (meeting: Meeting, question?: string) => {
    // The overlay controller keeps its window private; the overlay is the only window loading the live page.
    const senses = meeting.senses
    if (!senses || meeting.abort.signal.aborted || state.meeting !== meeting) return
    const frame = await own(meeting, senses.look(BrowserWindow.getAllWindows().filter((win) => win.webContents.getURL().includes("/live/"))))
      .catch((error) => {
        meeting.log.write({ event: "look-failed", reason: String(error) })
        return undefined
      })
    if (meeting.abort.signal.aborted || state.meeting !== meeting) return
    if (!frame) return
    return {
      text: question ? `${LIVE_PROMPTS.look}\n${question}` : LIVE_PROMPTS.look,
      files: [{ uri: `data:image/jpeg;base64,${frame.jpeg.toString("base64")}`, name: "screen.jpg" }],
    } satisfies LivePrompt
  }

  const look = async (meeting: Meeting, question?: string) => {
    const prompt = await capture(meeting, question)
    if (!prompt) return
    overlay.setView({ kind: "thinking", question })
    await send(meeting, { kind: "answer", source: "screen", question }, prompt)
  }

  // The seat looked in the middle of a reply: the frame joins that reply instead of starting a request.
  const lookFor = async (meeting: Meeting, request: Request, question?: string) => {
    // The text before the look was a preamble.
    request.look = {}
    request.text = ""
    request.source = "screen"
    const prompt = await capture(meeting, question)
    const admitted =
      prompt &&
      (await own(meeting, meeting.client.prompt(meeting.sessionID, prompt, "steer")).then(
        () => true,
        (error) => {
          meeting.log.write({ event: "prompt-failed", kind: request.kind, reason: String(error) })
          return false
        },
      ))
    // Admitted frames clear the look when they reach the history, which may already have happened.
    if (meeting.abort.signal.aborted || state.meeting !== meeting || meeting.request !== request || !request.look || admitted) return
    const idled = request.look.idled
    request.look = undefined
    if (idled) settle(meeting)
  }

  const stopMeeting = (meeting: Meeting, reason: "user" | "rotation" | "quit") => {
    // Suppression is synchronous and precedes memo lookup: rotation may arrive during an existing user stop.
    if (reason !== "user") suppress(meeting)
    meeting.stopping ??= Promise.resolve().then(async () => {
      overlay.stop()
      overlay.setView({ kind: "stop-pending", title: meeting.title, durationMs: Date.now() - meeting.startedAt })
      const result = await meeting.senses?.stop().catch((error) => {
        meeting.log.write({ event: "senses-stop-failed", reason: String(error) })
        return undefined
      })
      meeting.log.write({ event: "stopped", unsent: result?.unsent })
      meeting.localClosed = result !== undefined
      meeting.senses = undefined
      meeting.request = undefined
      emitRunState()
      maybeSummary(meeting)
    })
    if (reason === "user") return meeting.stopping
    meeting.closing ??= Promise.resolve().then(async () => {
      await meeting.stopping
      await join(meeting)
      await joinRenames()
    })
    return meeting.closing
  }

  const stop = (reason: "user" | "rotation" | "quit" = "user") => {
    if (reason !== "user") {
      if (reason === "quit") state.quitting = true
      renames.forEach((rename) => rename.abort.abort())
      if (state.meeting) suppress(state.meeting)
    }
    const closing = (() => {
      if (state.starting) {
        state.starting.abort()
        overlay.stop()
        const startup = state.startup
        const meeting = state.meeting
        state.startupStop ??= Promise.resolve().then(async () => {
          await startup
          if (meeting) await join(meeting)
          await joinRenames()
        })
        return state.startupStop
      }
      if (state.meeting) return stopMeeting(state.meeting, reason)
      return joinRenames()
    })()
    if (reason === "user") return closing
    const barrier: Promise<void> = closing.finally(() => {
      if (state.barrier === barrier) state.barrier = undefined
    })
    state.barrier = barrier
    return barrier
  }

  const handle = (meeting: Meeting, action: Parameters<Parameters<LiveOverlay["onAction"]>[0]>[0]) => {
    if (meeting.abort.signal.aborted || state.meeting !== meeting) return
    const running = meeting.senses !== undefined
    if (action.kind === "ask" && running) {
      const question = action.question?.trim() || undefined
      overlay.setView({ kind: "thinking", question })
      return send(meeting, { kind: "answer", source: "heard", question }, { text: question ?? LIVE_PROMPTS.ask })
    }
    if (action.kind === "look" && running) return look(meeting)
    if (action.kind === "quick" && running) {
      overlay.setView({ kind: "thinking" })
      return send(meeting, { kind: "answer", source: "heard" }, { text: LIVE_PROMPTS.quick[action.id] })
    }
    if (action.kind === "suggestion") {
      overlay.setView(overlay.state().answers.length ? { kind: "answer" } : { kind: "idle" })
      if (!action.answer || !meeting.lastQuestion || !running) return
      overlay.setView({ kind: "thinking", question: meeting.lastQuestion })
      return send(
        meeting,
        { kind: "suggestion", source: "heard", question: meeting.lastQuestion },
        { text: LIVE_PROMPTS.suggestion(meeting.lastQuestion) },
        true,
      )
    }
    if (action.kind === "toggle-captions") {
      meeting.captions = !meeting.captions
      if (meeting.captions) return showCaptions(meeting)
      return overlay.setView(overlay.state().answers.length ? { kind: "answer" } : { kind: "idle" })
    }
    if (action.kind === "stop" && running) return stop()
    if (action.kind === "send-open-items") {
      const view = overlay.state().view
      if (view.kind === "stop-ready") overlay.setView({ ...view, openItems: [] } satisfies LiveOverlayView)
      return send(meeting, { kind: "notice", source: "memory" }, { text: LIVE_PROMPTS.sendOpenItems })
    }
    if (action.kind === "open-settings") return openPrivacy(overlay.state().error)
    if (action.kind === "change-shortcut") return options.openSettings()
    // Transcription and appends retry on their own; retry only dismisses the note.
    if (action.kind === "retry") return overlay.setError(undefined)
  }

  overlay.onAction((action) => {
    if (action.kind === "stop" && state.starting) {
      void stop()
      return
    }
    const meeting = state.meeting
    if (meeting) void handle(meeting, action)
  })

  return {
    settings,
    running: () => (state.starting !== undefined && !state.starting.signal.aborted) || state.meeting?.senses !== undefined,
    runState,
    onRunState: (listener: (state: LiveRunState) => void) => {
      runListeners.add(listener)
      return () => runListeners.delete(listener)
    },
    onLevels: (listener: (levels: Record<LiveSource, number>) => void) => {
      levelListeners.add(listener)
      return () => levelListeners.delete(listener)
    },
    toggleCaptions() {
      const meeting = state.meeting
      if (meeting?.senses) void handle(meeting, { kind: "toggle-captions" })
    },
    rename(meetingID: string, title: string) {
      const next = title.trim()
      if (state.quitting || state.barrier || state.starting || !options.delivery.canStart()) return Promise.reject(new Error("Live delivery is unavailable"))
      if (!next) return Promise.resolve()
      const abort = new AbortController()
      const done: Promise<void> = Promise.resolve().then(async () => {
        const server = await options.server(abort.signal)
        abort.signal.throwIfAborted()
        const saved = await renameMeeting(server, meetingID, next, abort.signal).catch((error) => {
          transportLog(options.logDirectory, meetingID).write({ event: "rename-failed", reason: String(error) })
          throw error
        })
        if (abort.signal.aborted || state.meeting?.meetingID !== meetingID) return
        state.meeting.title = saved
        emitRunState()
      }).finally(() => renames.delete(owned))
      const owned = { abort, done }
      renames.add(owned)
      return done
    },
    async start(title?: string) {
      if (state.quitting || state.barrier || !options.delivery.canStart()) return { ok: false as const, reason: "server" as const }
      if (state.starting || state.meeting?.senses) return { ok: false as const, reason: "running" as const }
      if (!(options.runtime?.readKey ?? readTranscriptionKey)()) return { ok: false as const, reason: "no-key" as const }
      const wanted = settings.get()
      const permissions = (options.runtime?.permissions ?? sourcePermissions)()
      if (wanted.sources.microphone && permissions.microphone === "denied")
        return { ok: false as const, reason: "permission" as const }
      // Denied or unavailable system audio does not stop the meeting: it runs on the microphone alone.
      const sources = {
        microphone: wanted.sources.microphone,
        "system-audio":
          wanted.sources["system-audio"] &&
          permissions["system-audio"] !== "denied" &&
          systemAudioAvailable(process.platform, release()),
      }
      if (!sources.microphone && !sources["system-audio"]) return { ok: false as const, reason: "capture" as const }
      const attempt = new AbortController()
      state.starting = attempt
      state.startupStop = undefined
      const previous = state.meeting
      if (previous) suppress(previous)
      renames.forEach((rename) => rename.abort.abort())
      state.meeting = undefined
      const startup = Promise.resolve().then(async () => {
        if (previous) await stopMeeting(previous, "rotation")
        await joinRenames()
        if (attempt.signal.aborted || !options.delivery.canStart()) return { ok: false as const, reason: "server" as const }
        return begin(title?.trim() || defaultTitle(), sources, wanted, attempt)
      }).catch(async (error) => {
        const meeting = state.meeting
        if (meeting?.abort === attempt) {
          await stopMeeting(meeting, "rotation")
          if (state.meeting === meeting) state.meeting = undefined
        }
        transportLog(options.logDirectory, "session").write({ event: "session-failed", reason: String(error) })
        return { ok: false as const, reason: "server" as const }
      }).finally(() => {
        if (state.starting === attempt) state.starting = undefined
        if (state.startup === startup) state.startup = undefined
      })
      state.startup = startup
      return startup
    },
    stop,
    destroy() {
      unsubscribe()
      void stop("quit").catch(() => undefined)
    },
  }

  async function begin(
    title: string,
    sources: Record<LiveSource, boolean>,
    wanted: ReturnType<typeof settings.get>,
    attempt: AbortController,
  ) {
    const server = await options.server(attempt.signal)
    if (attempt.signal.aborted || !options.delivery.canStart()) return { ok: false as const, reason: "capture" as const }
    const client = sessionClient(server, attempt.signal)
    const sessionID = await client.create(modelRef(wanted.answerModel)).catch((error) => {
      transportLog(options.logDirectory, "session").write({ event: "session-failed", reason: String(error) })
      return undefined
    })
    if (attempt.signal.aborted || !options.delivery.canStart()) return { ok: false as const, reason: "capture" as const }
    if (!sessionID) return { ok: false as const, reason: "server" as const }
    const meeting: Meeting = {
      sessionID,
      client,
      log: transportLog(options.logDirectory, sessionID),
      abort: attempt,
      sources,
      title,
      startedAt: Date.now(),
      captions: false,
      lines: [],
      localClosed: false, completed: false, summarySent: false, suppressSummary: false, tasks: new Set(),
    }
    state.meeting = meeting
    void own(meeting, client.follow(sessionID, (event) => onSession(meeting, event), meeting.abort.signal)).catch(() => undefined)
    // The indicator shows before capture starts, so the permission notes the senses raise while starting are seen.
    overlay.start(meeting.startedAt, wanted.suggestions)
    if (wanted.sources["system-audio"] && !sources["system-audio"])
      meeting.log.write({ event: "sources", microphone: sources.microphone, systemAudio: false })
    const senses = await (options.runtime?.senses ?? startSenses)({
      signal: attempt.signal,
      delivery: options.delivery.manager,
      server,
      sessionID,
      title,
      logDirectory: options.logDirectory,
      language: wanted.language,
      sources: { microphone: sources.microphone, systemAudio: sources["system-audio"] },
      onLevels: (levels) => {
        if (!attempt.signal.aborted) levelListeners.forEach((listener) => listener(levels))
      },
      onEvent: (event) => onSenses(meeting, event),
    }).catch((error) => {
      meeting.log.write({ event: "senses-failed", reason: String(error) })
      return undefined
    })
    if (attempt.signal.aborted && senses) await senses.stop().catch((error) => {
      meeting.log.write({ event: "senses-stop-failed", reason: String(error) })
    })
    if (!senses || attempt.signal.aborted) {
      overlay.stop()
      meeting.abort.abort()
      await join(meeting)
      if (state.meeting === meeting) state.meeting = undefined
      return { ok: false as const, reason: "capture" as const }
    }
    meeting.senses = senses
    meeting.meetingID = senses.meetingID
    meeting.localID = senses.localID
    // Subscribers can synchronously Stop from this notification: it must now take the running cleanup path.
    if (state.starting === attempt) state.starting = undefined
    emitRunState()
    return { ok: true as const, meetingID: senses.meetingID }
  }
}

function openPrivacy(error?: LiveOverlayError) {
  if (process.platform !== "darwin") return
  const pane = error?.kind === "permission" && error.microphone === "denied" ? "microphone" : "system-audio"
  void shell.openExternal(PANES[pane])
}
