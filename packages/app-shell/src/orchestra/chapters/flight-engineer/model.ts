import type { MeetingListOutput, MeetingReadOutput } from "@orchestra/client"

// Pure logic for the Flight Engineer screens: what the server's shapes mean on screen.
export type Detail = MeetingReadOutput["data"]
export type Summary = MeetingListOutput["data"]["items"][number]
export type Card = Detail["card"]
export type Asserter = Detail["card"]["decisions"][number]["asserter"]
export type Party = { readonly id: string; readonly name: string } | "me"

// The generated client types numbers as number or a non-finite string.
export function num(value: number | string | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0
}

export type Speaker = { kind: "me" } | { kind: "person"; name: string } | { kind: "unknown"; number: number }

// "me" is the owner, a person is named, {unknown:N} is an unidentified voice shown as "Speaker N".
export function speaker(asserter: Asserter): Speaker {
  if (asserter === "me") return { kind: "me" }
  if ("unknown" in asserter) return { kind: "unknown", number: num(asserter.unknown) }
  return { kind: "person", name: asserter.name }
}

function same(asserter: Asserter, party: Party | undefined) {
  if (party === undefined) return false
  if (asserter === "me" || party === "me") return asserter === party
  if ("unknown" in asserter) return false
  return asserter.id === party.id
}

// Something the asserter said about a task that is not theirs is second-hand: the owner never said it.
export function hearsay(asserter: Asserter, owner?: Party) {
  if (asserter === "me") return false
  return !same(asserter, owner)
}

// Ephemeral meetings keep no transcript, so an item has nothing to jump to.
export function jumpable(item: { startMs?: number | string | null; quote: string }) {
  return typeof item.startMs === "number" && Number.isFinite(item.startMs) && item.quote !== ""
}

// Consolidation runs after stop; the card is polled until it settles. A budget keeps the poll from being endless.
export const pollLimit = 90

export function polling(card: Pick<Card, "status">, attempts: number) {
  return card.status === "pending" && attempts < pollLimit
}

// A slow start, then a steady beat: fast enough to feel alive, slow enough to be cheap.
export function pollDelay(attempts: number) {
  return Math.min(1500 + attempts * 500, 6000)
}

export function clock(ms: number) {
  const total = Math.max(0, Math.floor(ms / 1000))
  const seconds = String(total % 60).padStart(2, "0")
  const minutes = Math.floor(total / 60) % 60
  const hours = Math.floor(total / 3600)
  if (hours === 0) return `${String(minutes).padStart(2, "0")}:${seconds}`
  return `${hours}:${String(minutes).padStart(2, "0")}:${seconds}`
}

export function minutes(meeting: Pick<Summary, "startedAt" | "endedAt">) {
  const ended = num(meeting.endedAt)
  if (ended === 0) return undefined
  return Math.max(1, Math.round((ended - num(meeting.startedAt)) / 60000))
}

export type Tab = "all" | "week" | "open"

const week = 7 * 24 * 60 * 60 * 1000

export function inTab(meeting: Summary, tab: Tab, now: number) {
  if (tab === "week") return num(meeting.startedAt) >= now - week
  if (tab === "open") return num(meeting.counts.openCommitments) > 0
  return true
}

// The list carries no card status, so the badge only says what the list knows.
export function listStatus(meeting: Summary): "recording" | "open" | "ended" {
  if (num(meeting.endedAt) === 0) return "recording"
  return num(meeting.counts.openCommitments) > 0 ? "open" : "ended"
}

export type Verdict = "confirmed" | "disputed" | "dismissed"

// Dismissing hides an item here; the server keeps it until the meeting itself is deleted.
export function visible<T extends { id: string }>(items: readonly T[], dismissed: ReadonlySet<string>) {
  return items.filter((item) => !dismissed.has(item.id))
}

export type Refusal = "unavailable" | "running" | "missing_meeting" | "other"

export function refusal(error: unknown): Refusal {
  if (typeof error !== "object" || error === null || !("name" in error) || error.name !== "MeetingError") return "other"
  const data = "data" in error ? error.data : undefined
  const reason = typeof data === "object" && data !== null && "reason" in data ? data.reason : undefined
  if (reason === "unavailable" || reason === "running" || reason === "missing_meeting") return reason
  return "other"
}

export type StartOptions = { retention: "kept" | "ephemeral"; consent: "announced" | "not-needed" | "unknown" }

const symbols: Record<string, string> = {
  command: "⌘",
  cmd: "⌘",
  meta: "⌘",
  super: "⌘",
  control: "⌃",
  ctrl: "⌃",
  alt: "⌥",
  option: "⌥",
  shift: "⇧",
  return: "↩",
  enter: "↩",
  escape: "⎋",
  esc: "⎋",
  backspace: "⌫",
  delete: "⌦",
  tab: "⇥",
  up: "↑",
  down: "↓",
  left: "←",
  right: "→",
  plus: "+",
}

// An Electron accelerator as key caps. CommandOrControl is ⌘ on a Mac and Ctrl elsewhere.
export function keycaps(accelerator: string, mac: boolean) {
  return accelerator
    .split(/\+(?=.)/)
    .filter((part) => part !== "")
    .map((part) => {
      const lower = part.toLowerCase()
      if (lower === "commandorcontrol" || lower === "cmdorctrl") return mac ? "⌘" : "Ctrl"
      if (!mac && (lower === "control" || lower === "ctrl")) return "Ctrl"
      if (!mac && lower === "alt") return "Alt"
      if (!mac && lower === "shift") return "Shift"
      return symbols[lower] ?? (part.length === 1 ? part.toUpperCase() : part)
    })
}

type Press = { key: string; metaKey: boolean; ctrlKey: boolean; altKey: boolean; shiftKey: boolean }

const modifierKeys = new Set(["Meta", "Control", "Alt", "Shift", "AltGraph", "CapsLock"])

// The accelerator a key press records, or undefined while only modifiers are held or none is held at all.
export function accelerator(press: Press, mac: boolean) {
  if (modifierKeys.has(press.key)) return undefined
  if (!(press.metaKey || press.ctrlKey || press.altKey)) return undefined
  const key = press.key === " " ? "Space" : press.key.length === 1 ? press.key.toUpperCase() : press.key.replace(/^Arrow/, "")
  const parts = [
    mac ? (press.metaKey ? "Command" : undefined) : press.ctrlKey ? "Control" : undefined,
    mac ? (press.ctrlKey ? "Control" : undefined) : press.metaKey ? "Super" : undefined,
    press.altKey ? "Alt" : undefined,
    press.shiftKey ? "Shift" : undefined,
    key,
  ]
  return parts.filter((part): part is string => part !== undefined).join("+")
}
