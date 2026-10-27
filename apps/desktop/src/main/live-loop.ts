import { release } from "node:os"
import { BrowserWindow, shell } from "electron"
import type { LiveRunState, LiveSource } from "@orchestra/app/live"

import { isNoAnswer, LIVE_PROMPTS, NO_ANSWER, parseAnswer, parseStopSummary, worthSuggesting } from "./live-answer"
import { readTranscriptionKey } from "./live-key"
import { renameMeeting, type MeetingServer } from "./live-meeting-client"
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
  server: () => Promise<MeetingServer>
  logDirectory: string
  openSettings: () => void
}) {
  const overlay = options.overlay
  const state = { meeting: undefined as Meeting | undefined, starting: false }
  const settings = liveSettings()
  const runListeners = new Set<(state: LiveRunState) => void>()
  const levelListeners = new Set<(levels: Record<LiveSource, number>) => void>()

  const runState = (): LiveRunState => {
    const meeting = state.meeting
    if (!meeting?.senses || !meeting.meetingID) return { running: false }
    return { running: true, meetingID: meeting.meetingID, title: meeting.title, startedAt: meeting.startedAt, sources: meeting.sources }
  }
  const emitRunState = () => runListeners.forEach((listener) => listener(runState()))

  const send = async (meeting: Meeting, request: Omit<Request, "sentAt" | "text">, prompt: LivePrompt, queue = false) => {
    if (meeting.request && request.kind !== "notice") return
    meeting.request = { ...request, sentAt: Date.now(), text: "" }
    if (overlay.state().error?.kind === "answer") overlay.setError(undefined)
    await meeting.client.prompt(meeting.sessionID, prompt, queue ? "queue" : "steer").catch((error) => {
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
    const frame = await meeting.senses
      ?.look(BrowserWindow.getAllWindows().filter((win) => win.webContents.getURL().includes("/live/")))
      .catch((error) => {
        meeting.log.write({ event: "look-failed", reason: String(error) })
        return undefined
      })
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
      (await meeting.client.prompt(meeting.sessionID, prompt, "steer").then(
        () => true,
        (error) => {
          meeting.log.write({ event: "prompt-failed", kind: request.kind, reason: String(error) })
          return false
        },
      ))
    // Admitted frames clear the look when they reach the history, which may already have happened.
    if (meeting.request !== request || !request.look || admitted) return
    const idled = request.look.idled
    request.look = undefined
    if (idled) settle(meeting)
  }

  const stop = async (meeting: Meeting) => {
    overlay.stop()
    overlay.setView({ kind: "stop-pending", title: meeting.title, durationMs: Date.now() - meeting.startedAt })
    const result = await meeting.senses?.stop().catch((error) => {
      meeting.log.write({ event: "senses-stop-failed", reason: String(error) })
      return undefined
    })
    meeting.log.write({ event: "stopped", unsent: result?.unsent })
    meeting.senses = undefined
    emitRunState()
    // The stop summary outranks whatever was still being answered.
    meeting.request = undefined
    await send(meeting, { kind: "stop", source: "memory" }, { text: LIVE_PROMPTS.stop })
  }

  const handle = (meeting: Meeting, action: Parameters<Parameters<LiveOverlay["onAction"]>[0]>[0]) => {
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
    if (action.kind === "stop" && running) return stop(meeting)
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
    const meeting = state.meeting
    if (meeting) void handle(meeting, action)
  })

  return {
    settings,
    running: () => state.starting || state.meeting?.senses !== undefined,
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
    async rename(meetingID: string, title: string) {
      const next = title.trim()
      if (!next) return
      const saved = await renameMeeting(await options.server(), meetingID, next).catch((error) => {
        transportLog(options.logDirectory, meetingID).write({ event: "rename-failed", reason: String(error) })
        throw error
      })
      if (state.meeting?.meetingID !== meetingID) return
      state.meeting.title = saved
      emitRunState()
    },
    async start(title?: string) {
      if (state.starting || state.meeting?.senses) return { ok: false as const, reason: "running" as const }
      if (!readTranscriptionKey()) return { ok: false as const, reason: "no-key" as const }
      const wanted = settings.get()
      const permissions = sourcePermissions()
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
      state.starting = true
      // The previous meeting's stream stays open until the next start, so its summary and open items can still land.
      state.meeting?.abort.abort()
      state.meeting = undefined
      const result = await begin(title?.trim() || defaultTitle(), sources, wanted).finally(() => {
        state.starting = false
      })
      return result
    },
    async stop() {
      const meeting = state.meeting
      if (meeting?.senses) await stop(meeting)
    },
    destroy() {
      state.meeting?.abort.abort()
      void state.meeting?.senses?.stop()
    },
  }

  async function begin(title: string, sources: Record<LiveSource, boolean>, wanted: ReturnType<typeof settings.get>) {
    const server = await options.server()
    const client = sessionClient(server)
    const sessionID = await client.create(modelRef(wanted.answerModel)).catch((error) => {
      transportLog(options.logDirectory, "session").write({ event: "session-failed", reason: String(error) })
      return undefined
    })
    if (!sessionID) return { ok: false as const, reason: "server" as const }
    const meeting: Meeting = {
      sessionID,
      client,
      log: transportLog(options.logDirectory, sessionID),
      abort: new AbortController(),
      sources,
      title,
      startedAt: Date.now(),
      captions: false,
      lines: [],
    }
    state.meeting = meeting
    void client.follow(sessionID, (event) => onSession(meeting, event), meeting.abort.signal)
    // The indicator shows before capture starts, so the permission notes the senses raise while starting are seen.
    overlay.start(meeting.startedAt, wanted.suggestions)
    if (wanted.sources["system-audio"] && !sources["system-audio"])
      meeting.log.write({ event: "sources", microphone: sources.microphone, systemAudio: false })
    const senses = await startSenses({
      server,
      sessionID,
      title,
      logDirectory: options.logDirectory,
      language: wanted.language,
      sources: { microphone: sources.microphone, systemAudio: sources["system-audio"] },
      onLevels: (levels) => levelListeners.forEach((listener) => listener(levels)),
      onEvent: (event) => onSenses(meeting, event),
    }).catch((error) => {
      meeting.log.write({ event: "senses-failed", reason: String(error) })
      return undefined
    })
    if (!senses) {
      overlay.stop()
      meeting.abort.abort()
      state.meeting = undefined
      return { ok: false as const, reason: "capture" as const }
    }
    meeting.senses = senses
    meeting.meetingID = senses.meetingID
    emitRunState()
    return { ok: true as const, meetingID: senses.meetingID }
  }
}

function openPrivacy(error?: LiveOverlayError) {
  if (process.platform !== "darwin") return
  const pane = error?.kind === "permission" && error.microphone === "denied" ? "microphone" : "system-audio"
  void shell.openExternal(PANES[pane])
}
