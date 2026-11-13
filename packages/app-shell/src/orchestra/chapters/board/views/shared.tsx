import { Show } from "solid-js"
import { useLanguage } from "@/context/language"
import { monogram } from "../model"
import { range, type Forecast } from "../plan"

type Language = ReturnType<typeof useLanguage>

export const stageKey = {
  backlog: "orchestra.board.stage.backlog",
  ready: "orchestra.board.stage.ready",
  building: "orchestra.board.stage.building",
  review: "orchestra.board.stage.review",
  queue: "orchestra.board.stage.queue",
  shipped: "orchestra.board.stage.shipped",
  intake: "orchestra.board.stage.intake",
  cut: "orchestra.board.stage.cut",
} as const

export function Ring(props: { stage: string }) {
  return (
    <svg class="board-ring" data-stage={props.stage} viewBox="0 0 14 14" aria-hidden="true">
      <circle class="board-ring-track" cx="7" cy="7" r="5.6" />
      <Show when={props.stage === "building" || props.stage === "review"}>
        <circle
          class="board-ring-fill"
          cx="7"
          cy="7"
          r="1.8"
          stroke-dasharray={props.stage === "building" ? "5.65 11.3" : "8.5 11.3"}
          transform="rotate(-90 7 7)"
        />
      </Show>
      <Show when={props.stage === "shipped"}>
        <path class="board-ring-check" d="m4.4 7.2 1.8 1.8 3.6-3.8" />
      </Show>
    </svg>
  )
}

export function Seat(props: { seat: string | null }) {
  const t = useLanguage().t
  return (
    <Show when={props.seat}>
      {(seat) => (
        <span class="board-seat" title={seat()} aria-label={t("orchestra.board.seat", { seat: seat() })}>
          {monogram(seat())}
        </span>
      )}
    </Show>
  )
}

export function Chevron() {
  return (
    <svg class="board-chevron" viewBox="0 0 12 12" aria-hidden="true">
      <path d="m3 4.5 3 3 3-3" />
    </svg>
  )
}

// J and K (or the arrows) walk the rows that are on screen, in the order they read; with the peek open it follows.
export function walk(
  event: KeyboardEvent & { currentTarget: HTMLElement },
  peek: string | undefined,
  onOpen: (ref: string) => void,
) {
  if (event.metaKey || event.ctrlKey || event.altKey) return
  const key = event.key.length === 1 ? event.key.toLowerCase() : event.key
  const delta = key === "j" || key === "ArrowDown" ? 1 : key === "k" || key === "ArrowUp" ? -1 : 0
  if (delta === 0) return
  const rows = [...event.currentTarget.querySelectorAll<HTMLElement>("[data-ref]")]
  const index = rows.findIndex((row) => row === document.activeElement)
  const next = rows[index === -1 ? 0 : Math.min(rows.length - 1, Math.max(0, index + delta))]
  if (!next) return
  event.preventDefault()
  event.stopPropagation()
  next.focus()
  if (peek && next.dataset.ref) onOpen(next.dataset.ref)
}

export function narrow<K extends Forecast["kind"]>(forecast: Forecast, kind: K) {
  return forecast.kind === kind ? (forecast as Extract<Forecast, { kind: K }>) : undefined
}

export function outlook(language: Language, forecast: Forecast) {
  if (forecast.kind === "done") return language.t("orchestra.board.forecast.done")
  if (forecast.kind === "waits") return language.t("orchestra.board.forecast.waits", { on: forecast.on })
  if (forecast.kind === "insufficient")
    return language.t("orchestra.board.forecast.insufficient", { needed: forecast.needed, shipped: forecast.shipped })
  return range(forecast.p50, forecast.p85, language.intl())
}

// An epic's line in the list: "done ~Nov 3 – 5" when it has dates, the plain outlook otherwise.
export function done(language: Language, forecast: Forecast | undefined) {
  if (!forecast) return ""
  if (forecast.kind === "dates")
    return language.t("orchestra.board.list.doneBy", { range: range(forecast.p50, forecast.p85, language.intl()) })
  return outlook(language, forecast)
}

// Stage entries are real instants, not UTC midnights, so they read in the owner's time zone.
export function localDate(language: Language, at: number) {
  return new Intl.DateTimeFormat(language.intl(), { month: "short", day: "numeric" }).format(at)
}

export function localRange(language: Language, from: number, to: number) {
  return new Intl.DateTimeFormat(language.intl(), { month: "short", day: "numeric" }).formatRange(from, to)
}
