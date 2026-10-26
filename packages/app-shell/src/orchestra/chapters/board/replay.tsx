import { createEffect, createMemo, createSignal, For, on, onCleanup, Show } from "solid-js"
import { useLanguage } from "@/context/language"
import { useServerSDK } from "@/context/server-sdk"
import { actionKey, actorKey } from "./keys"
import { changed, fold, gaps, rewind, type Activity, type Snapshot } from "./model"

type Mark = { cursor: string | null; at: number }

// Base pace: one event per beat at 1x.
const beat = 900

// "Since you looked" (J8): the board remembers, per project and per browser, the last activity the owner saw. Replay
// rebuilds the board as it stood then by reversing the activity since, and scrubs forward through it. The board only
// ever shows states that really existed: between events nothing moves, and quiet stretches show as a hatched gap.
export function createReplay(props: { key: () => string | undefined; snapshot: () => Snapshot | undefined }) {
  const language = useLanguage()
  const sdk = useServerSDK()
  const t = language.t
  const [mark, setMark] = createSignal<Mark>()
  const [rows, setRows] = createSignal<readonly Activity[]>([])
  const [open, setOpen] = createSignal(false)
  const [at, setAt] = createSignal(0)
  const [end, setEnd] = createSignal(0)
  const [speed, setSpeed] = createSignal(1)
  const [playing, setPlaying] = createSignal(false)
  const [caught, setCaught] = createSignal(false)

  // A first visit has nothing to replay: it only sets the mark.
  createEffect(
    on(props.key, (key) => {
      setOpen(false)
      setRows([])
      setCaught(false)
      setMark(key ? read(key) : undefined)
    }),
  )
  createEffect(
    on(
      () => props.snapshot()?.cursor,
      () => {
        const key = props.key()
        const snapshot = props.snapshot()
        if (!key || !snapshot || snapshot.project.key !== key) return
        const seen = mark()
        if (!seen) return remember(key, { cursor: snapshot.cursor, at: Date.now() })
        if (open()) return
        sdk()
          .orchestra["server.board"].activity({ key, since: seen.cursor ?? undefined })
          .then(
            (result) => props.key() === key && setRows(result.filter((row) => row.timeCreated > seen.at)),
            () => undefined,
          )
      },
    ),
  )

  const remember = (key: string, next: Mark) => {
    setMark(next)
    try {
      localStorage.setItem(`orchestra.board.looked.${key}`, JSON.stringify(next))
    } catch {
      // Storage can be blocked; the replay then starts over each visit.
    }
  }

  const start = () => mark()?.at ?? 0
  // Rows the scrubber has crossed. The board is rebuilt only when this count changes, not on every frame.
  const cut = createMemo(() => rows().filter((row) => row.timeCreated <= at()).length)
  const issues = createMemo(() => {
    const snapshot = props.snapshot()
    if (!open() || !snapshot) return
    return rewind(snapshot.issues, rows().slice(cut()), start())
  })
  const touched = createMemo(() => changed(rows(), start()))
  const last = createMemo(() => (open() && cut() > 0 ? rows()[cut() - 1].issue : undefined))
  const spans = createMemo(() => gaps(rows().map((row) => row.timeCreated), start(), end()))
  const entries = createMemo(() => fold(rows()))
  const share = (time: number) => `${((time - start()) / Math.max(1, end() - start())) * 100}%`

  const finish = () => {
    setPlaying(false)
    const key = props.key()
    const snapshot = props.snapshot()
    if (!key || !snapshot) return
    // Caught up only counts when the owner reached the end.
    setCaught(true)
    remember(key, { cursor: snapshot.cursor, at: end() })
  }
  const seek = (time: number) => {
    setAt(Math.min(end(), Math.max(start(), time)))
    if (at() >= end()) finish()
  }
  const exit = () => {
    setOpen(false)
    setPlaying(false)
    if (caught()) setRows([])
  }
  const begin = () => {
    setEnd(Math.max(Date.now(), rows().at(-1)?.timeCreated ?? 0))
    setAt(start())
    setCaught(false)
    setOpen(true)
    setPlaying(true)
  }

  createEffect(() => {
    if (!playing()) return
    const timer = setInterval(() => seek(rows()[cut()]?.timeCreated ?? end()), beat / speed())
    onCleanup(() => clearInterval(timer))
  })
  createEffect(() => {
    if (!open()) return
    const escape = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) return
      event.preventDefault()
      exit()
    }
    document.addEventListener("keydown", escape)
    onCleanup(() => document.removeEventListener("keydown", escape))
  })

  const time = (value: number) =>
    new Intl.DateTimeFormat(language.intl(), { weekday: "short", hour: "2-digit", minute: "2-digit" }).format(value)
  const ref = (issue: number | null) =>
    issue === null ? "" : (props.snapshot()?.issues.find((item) => item.number === issue)?.ref ?? `#${issue}`)

  const Since = () => (
    <Show
      when={!caught() && rows().length > 0}
      fallback={
        <Show when={caught()}>
          <span class="board-since">{t("orchestra.board.replay.caught")}</span>
        </Show>
      }
    >
      <span class="board-since">
        {t("orchestra.board.replay.since")}
        <span aria-hidden="true">·</span>
        {language.plural("orchestra.board.replay.changes", rows().length)}
        <span aria-hidden="true">·</span>
        <button type="button" class="mx-link board-replay-open" disabled={open()} onClick={begin}>
          {t("orchestra.board.replay.open")}
        </button>
      </span>
    </Show>
  )

  const Bar = () => (
    <Show when={open()}>
      <section class="board-replay" aria-label={t("orchestra.board.replay.label")}>
        <div class="board-replay-bar">
          <button
            type="button"
            class="board-icon-button"
            aria-label={playing() ? t("orchestra.board.replay.pause") : t("orchestra.board.replay.play")}
            onClick={() => (at() >= end() ? (setAt(start()), setCaught(false), setPlaying(true)) : setPlaying(!playing()))}
          >
            <svg viewBox="0 0 14 14" aria-hidden="true">
              <Show when={playing()} fallback={<path d="M4.5 3v8l6-4z" />}>
                <path d="M5 3v8M9 3v8" />
              </Show>
            </svg>
          </button>
          <span class="board-quiet">
            {t("orchestra.board.replay.range", { from: time(start()) })}
          </span>
          <div class="board-replay-track">
            <For each={spans()}>
              {(gap) => (
                <span
                  class="board-replay-gap"
                  style={{ left: share(gap.from), width: `calc(${share(gap.to)} - ${share(gap.from)})` }}
                  title={t("orchestra.board.replay.gap")}
                >
                  {t("orchestra.board.replay.gap")}
                </span>
              )}
            </For>
            <For each={rows()}>{(row) => <i class="board-replay-tick" style={{ left: share(row.timeCreated) }} aria-hidden="true" />}</For>
            <input
              type="range"
              class="board-replay-range"
              min={start()}
              max={end()}
              step={1}
              value={at()}
              aria-label={t("orchestra.board.replay.label")}
              aria-valuetext={time(at())}
              onInput={(event) => (setPlaying(false), seek(Number(event.currentTarget.value)))}
            />
          </div>
          <span class="board-mono board-replay-time">{time(at())}</span>
          <span class="board-replay-speeds" role="group" aria-label={t("orchestra.board.replay.speed")}>
            <For each={[1, 2, 4]}>
              {(value) => (
                <button type="button" class="board-chip" aria-pressed={speed() === value} onClick={() => setSpeed(value)}>
                  {value}×
                </button>
              )}
            </For>
          </span>
          <button type="button" class="mx-btn" onClick={exit}>
            {t("orchestra.board.replay.exit")}
          </button>
        </div>
        <ol class="board-replay-events">
          <For each={entries()}>
            {(entry) => (
              <li>
                <button
                  type="button"
                  class="board-option"
                  aria-current={entry.row.timeCreated <= at() ? "step" : undefined}
                  onClick={() => (setPlaying(false), seek(entry.row.timeCreated))}
                >
                  <span class="board-mono">{ref(entry.row.issue)}</span>
                  <b>{t(actorKey[entry.row.actor])}</b> {t(actionKey[entry.row.action])}
                  <Show when={entry.count > 1}>
                    <span class="board-quiet">{language.plural("orchestra.board.replay.folded", entry.count)}</span>
                  </Show>
                  <span class="board-quiet">{time(entry.row.timeCreated)}</span>
                </button>
              </li>
            )}
          </For>
        </ol>
      </section>
    </Show>
  )

  return {
    issues,
    open,
    changed: (issue: number) => open() && touched().has(issue),
    moved: (issue: number) => last() === issue,
    Since,
    Bar,
  }
}

function read(key: string) {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(`orchestra.board.looked.${key}`) ?? "null")
    if (typeof value !== "object" || value === null || !("at" in value) || typeof value.at !== "number") return
    return { cursor: "cursor" in value && typeof value.cursor === "string" ? value.cursor : null, at: value.at }
  } catch {
    return
  }
}
