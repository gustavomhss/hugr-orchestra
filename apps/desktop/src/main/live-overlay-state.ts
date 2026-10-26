// The live seat overlay's state. Main owns it and pushes it whole to the overlay renderer; the renderer only draws it
// and sends actions back. Kept free of Electron so the geometry and paging rules can be tested directly.

export type LiveOverlaySource = "heard" | "screen" | "memory"

export type LiveOverlayAnswer = {
  question?: string
  lead: string
  points: { text: string; source: LiveOverlaySource }[]
  latencyMs: number
}

export type LiveOverlaySense = "granted" | "denied" | "on-request"

export type LiveOverlayError =
  | { kind: "permission"; microphone: LiveOverlaySense; systemAudio: LiveOverlaySense; screen: LiveOverlaySense }
  | { kind: "stt"; attempt: number; retryInSeconds: number; closeCode: number; reason: string; watermarkMs: number }
  | { kind: "hotkey"; accelerator: string }
  | { kind: "network"; offlineMs: number }

export type LiveOverlayView =
  | { kind: "idle" }
  | { kind: "answer" }
  | { kind: "quick" }
  | { kind: "captions"; lines: { track: "me" | "them"; text: string; partial: string }[] }
  | { kind: "suggestion"; question: string }
  | { kind: "stop-pending"; title: string; durationMs: number }
  | {
      kind: "stop-ready"
      title: string
      durationMs: number
      decisions: string[]
      openItems: { text: string; owner: string }[]
      followUp: string
      saved: boolean
    }

export type LiveOverlayState = {
  // Epoch ms when capture started; the renderer derives the elapsed mm:ss. Undefined once capture stops.
  startedAt?: number
  contentProtection: boolean
  suggestions: boolean
  moving: boolean
  view: LiveOverlayView
  answers: LiveOverlayAnswer[]
  answerIndex: number
  error?: LiveOverlayError
  // The accelerators in force (defaults plus the owner's overrides), so the hints show what actually works.
  accelerators: Record<LiveOverlayHotkey, string>
  // Hotkeys that failed to register; the bar dims their hint.
  failedHotkeys: LiveOverlayHotkey[]
}

export type LiveOverlayHotkey = "ask" | "look" | "toggle" | "stop" | "previous" | "next"

export const LIVE_OVERLAY_HOTKEYS: Record<LiveOverlayHotkey, string> = {
  ask: "CommandOrControl+Enter",
  look: "CommandOrControl+Shift+Enter",
  toggle: "CommandOrControl+\\",
  stop: "CommandOrControl+Shift+.",
  previous: "CommandOrControl+[",
  next: "CommandOrControl+]",
}

// Renderer to main. Window control messages (interactive, resize, focus, move) are separate channels.
export type LiveOverlayAction =
  | { kind: "ask"; question?: string }
  | { kind: "look" }
  | { kind: "quick"; id: "say" | "follow-up" | "fact-check" | "recap" }
  | { kind: "page"; step: -1 | 1 }
  | { kind: "suggestion"; answer: boolean }
  | { kind: "toggle-suggestions" }
  | { kind: "toggle-captions" }
  | { kind: "stop" }
  | { kind: "send-open-items" }
  // The sandboxed renderer has no clipboard of its own and the panel is never focused, so main writes it.
  | { kind: "copy"; text: string }
  | { kind: "close" }
  // Recovery buttons on the error notes; whoever owns that error acts on them.
  | { kind: "open-settings" }
  | { kind: "retry" }
  | { kind: "change-shortcut" }

export const LIVE_OVERLAY_WIDTH = 600
export const LIVE_OVERLAY_BAR_HEIGHT = 54
// Transparent margin around the glass so its shadow is not clipped by the window edge.
export const LIVE_OVERLAY_MARGIN = 24
export const LIVE_OVERLAY_MOVE_STEP = 24

type Rect = { x: number; y: number; width: number; height: number }

export function initialState(contentProtection: boolean): LiveOverlayState {
  return {
    contentProtection,
    suggestions: false,
    moving: false,
    view: { kind: "idle" },
    answers: [],
    answerIndex: 0,
    accelerators: LIVE_OVERLAY_HOTKEYS,
    failedHotkeys: [],
  }
}

export function pageAnswers(state: LiveOverlayState, step: -1 | 1): LiveOverlayState {
  if (state.answers.length === 0) return state
  const answerIndex = Math.min(state.answers.length - 1, Math.max(0, state.answerIndex + step))
  return { ...state, answerIndex, view: { kind: "answer" } }
}

export function pushAnswer(state: LiveOverlayState, answer: LiveOverlayAnswer): LiveOverlayState {
  const answers = [...state.answers, answer]
  return { ...state, answers, answerIndex: answers.length - 1, view: { kind: "answer" } }
}

// Top centre of the work area, a little below the menu bar, as in the approved mocks.
export function defaultPosition(workArea: Rect) {
  return {
    x: Math.round(workArea.x + (workArea.width - windowWidth()) / 2),
    y: workArea.y + 34 - LIVE_OVERLAY_MARGIN,
  }
}

// Keeps the glass (not the transparent margin) fully inside the work area.
export function clampPosition(position: { x: number; y: number }, height: number, workArea: Rect) {
  const minX = workArea.x - LIVE_OVERLAY_MARGIN
  const minY = workArea.y - LIVE_OVERLAY_MARGIN
  const maxX = workArea.x + workArea.width - windowWidth() + LIVE_OVERLAY_MARGIN
  const maxY = workArea.y + workArea.height - height + LIVE_OVERLAY_MARGIN
  return {
    x: Math.round(Math.min(Math.max(position.x, minX), Math.max(minX, maxX))),
    y: Math.round(Math.min(Math.max(position.y, minY), Math.max(minY, maxY))),
  }
}

export function windowWidth() {
  return LIVE_OVERLAY_WIDTH + LIVE_OVERLAY_MARGIN * 2
}

export function windowHeight(contentHeight: number) {
  return Math.ceil(Math.max(contentHeight, LIVE_OVERLAY_BAR_HEIGHT)) + LIVE_OVERLAY_MARGIN * 2
}
