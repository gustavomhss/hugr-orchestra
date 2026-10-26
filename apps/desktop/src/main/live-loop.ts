import { BrowserWindow, shell } from "electron"

import { isNoAnswer, LIVE_PROMPTS, parseAnswer, parseStopSummary, worthSuggesting } from "./live-answer"
import { readTranscriptionKey } from "./live-key"
import type { MeetingServer } from "./live-meeting-client"
import type { LiveOverlay } from "./live-overlay"
import type { LiveOverlayError, LiveOverlaySource, LiveOverlayView } from "./live-overlay-state"
import type { Caption } from "./live-segmenter"
import { startSenses } from "./live-senses"
import { sessionClient, type LivePrompt, type LiveSessionEvent } from "./live-session-client"
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
}

type Meeting = {
  sessionID: string
  client: ReturnType<typeof sessionClient>
  senses?: Awaited<ReturnType<typeof startSenses>>
  log: ReturnType<typeof transportLog>
  abort: AbortController
  title: string
  startedAt: number
  captions: boolean
  lines: Caption[]
  lastQuestion?: string
  request?: Request
}

const SETTINGS_PANES = {
  microphone: "x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone",
  screen: "x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture",
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

  const send = async (meeting: Meeting, request: Omit<Request, "sentAt" | "text">, prompt: LivePrompt, queue = false) => {
    if (meeting.request && request.kind !== "notice") return
    meeting.request = { ...request, sentAt: Date.now(), text: "" }
    await meeting.client.prompt(meeting.sessionID, prompt, queue ? "queue" : "steer").catch((error) => {
      meeting.log.write({ event: "prompt-failed", kind: request.kind, reason: String(error) })
      meeting.request = undefined
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
    if (failed || request.kind === "notice" || request.dropped || isNoAnswer(request.text) || !request.text.trim()) return
    overlay.pushAnswer(parseAnswer(request.text, { source: request.source, latencyMs, question: request.question }))
  }

  const onSession = (meeting: Meeting, event: LiveSessionEvent) => {
    const request = meeting.request
    if (!request) return
    if (event.kind === "delta") {
      request.firstAt ??= Date.now()
      request.text += event.delta
      return
    }
    // A turn can hold several text parts around tool calls; the last full part is the answer.
    if (event.kind === "text") {
      request.firstAt ??= Date.now()
      request.text = event.text
      return
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

  const look = async (meeting: Meeting, question?: string) => {
    // The overlay controller keeps its window private; the overlay is the only window loading the live page.
    const frame = await meeting.senses
      ?.look(BrowserWindow.getAllWindows().filter((win) => win.webContents.getURL().includes("/live/")))
      .catch((error) => {
        meeting.log.write({ event: "look-failed", reason: String(error) })
        return undefined
      })
    if (!frame) return
    const text = question ? `${LIVE_PROMPTS.look}\n${question}` : LIVE_PROMPTS.look
    await send(
      meeting,
      { kind: "answer", source: "screen", question },
      { text, files: [{ uri: `data:image/jpeg;base64,${frame.jpeg.toString("base64")}`, name: "screen.jpg" }] },
    )
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
    // The stop summary outranks whatever was still being answered.
    meeting.request = undefined
    await send(meeting, { kind: "stop", source: "memory" }, { text: LIVE_PROMPTS.stop })
  }

  const handle = (meeting: Meeting, action: Parameters<Parameters<LiveOverlay["onAction"]>[0]>[0]) => {
    const running = meeting.senses !== undefined
    if (action.kind === "ask" && running) {
      const question = action.question?.trim() || undefined
      // The bare hotkey or bar button also opens the field and quick actions while the answer comes.
      if (!question) overlay.setView({ kind: "quick" })
      return send(meeting, { kind: "answer", source: "heard", question }, { text: question ?? LIVE_PROMPTS.ask })
    }
    if (action.kind === "look" && running) return look(meeting)
    if (action.kind === "quick" && running)
      return send(meeting, { kind: "answer", source: "heard" }, { text: LIVE_PROMPTS.quick[action.id] })
    if (action.kind === "suggestion") {
      overlay.setView(overlay.state().answers.length ? { kind: "answer" } : { kind: "idle" })
      if (!action.answer || !meeting.lastQuestion || !running) return
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
    running: () => state.starting || state.meeting?.senses !== undefined,
    async start(title: string) {
      if (state.starting || state.meeting?.senses) return { ok: false as const, reason: "running" as const }
      if (!readTranscriptionKey()) return { ok: false as const, reason: "no-key" as const }
      state.starting = true
      // The previous meeting's stream stays open until the next start, so its summary and open items can still land.
      state.meeting?.abort.abort()
      state.meeting = undefined
      const result = await begin(title).finally(() => {
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

  async function begin(title: string) {
    const server = await options.server()
    const client = sessionClient(server)
    const sessionID = await client.create().catch((error) => {
      transportLog(options.logDirectory, "session").write({ event: "session-failed", reason: String(error) })
      return undefined
    })
    if (!sessionID) return { ok: false as const, reason: "server" as const }
    const meeting: Meeting = {
      sessionID,
      client,
      log: transportLog(options.logDirectory, sessionID),
      abort: new AbortController(),
      title,
      startedAt: Date.now(),
      captions: false,
      lines: [],
    }
    state.meeting = meeting
    void client.follow(sessionID, (event) => onSession(meeting, event), meeting.abort.signal)
    // The indicator shows before capture starts, so the permission notes the senses raise while starting are seen.
    overlay.start(meeting.startedAt)
    const senses = await startSenses({
      server,
      sessionID,
      title,
      logDirectory: options.logDirectory,
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
    return { ok: true as const, meetingID: senses.meetingID }
  }
}

function openPrivacy(error?: LiveOverlayError) {
  if (process.platform !== "darwin") return
  const pane = error?.kind === "permission" && error.microphone === "denied" ? "microphone" : "screen"
  void shell.openExternal(SETTINGS_PANES[pane])
}
