import { For, Show } from "solid-js"
import { useLanguage } from "@/context/language"
import { monogram, ticks, type Trail } from "./model"

export function Ticks(props: { trail: Trail | undefined; compact?: boolean }) {
  const t = useLanguage().t
  return (
    <Show when={props.trail && narrow(props.trail, "ok")}>
      {(trail) => {
        const ci = () => ticks(trail().pr.checks)
        return (
          <Show when={ci().total > 0} fallback={<span class="board-quiet">{t("orchestra.board.ci.none")}</span>}>
            <span class="board-ticks" aria-label={t("orchestra.board.ci.label", { passed: ci().passed, total: ci().total })}>
              <span class="board-tick-run" aria-hidden="true">
                <For each={ci().states}>{(state) => <i data-state={state} />}</For>
              </span>
              <b>{ci().passed}</b>
              {t("orchestra.board.ci.of", { total: ci().total })}
            </span>
          </Show>
        )
      }}
    </Show>
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

export function narrow<S extends Trail["state"]>(trail: Trail, state: S) {
  return trail.state === state ? (trail as Extract<Trail, { state: S }>) : undefined
}

export function encode(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result).replace(/^data:[^,]*,/, ""))
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}
