import { useNavigate } from "@solidjs/router"
import { createEffect, createSignal, on, onCleanup, Show } from "solid-js"
import { useLanguage } from "@/context/language"
import type { ServerSDK } from "@/context/server-sdk"
import { showToast } from "@/utils/toast"
import "./host.css"
import { devMeetings } from "./dev"
import { homeLastClaim, settleLastMeeting } from "./last-meeting"
import { runClaim } from "./run-state"
import { clock, num } from "./model"
import { Keys, Note } from "./parts"
import { useFlight } from "./run"
import { serverMeetings, type Page } from "./source"
import { createWarm } from "../../warm"

// The latest meeting per server and directory, kept so Home shows it at once the next time it opens.
const latest = createWarm<{ meeting: Page["items"][number] | undefined }>(8)

// Sidebar mark while a meeting runs: a red dot and the elapsed time, the same one in every window surface.
export function FlightNavChip() {
  const flight = useFlight()
  const t = useLanguage().t
  return (
    <Show when={runClaim(flight.store.runKnown, flight.store.run.running) === "running"}>
      <span class="fe-live-chip" data-slot="orchestra-nav-live" title={t("orchestra.flightEngineer.recording")}>
        <i class="fe-dot" aria-hidden="true" />
        <span aria-hidden="true">{clock(flight.elapsed())}</span>
        <span class="orchestra-sr-only">{t("orchestra.flightEngineer.nav.running", { time: clock(flight.elapsed()) })}</span>
      </span>
    </Show>
  )
}

// Home card. Idle: the last meeting and a Start button. Running: the title, the time, Open and Stop.
export function HomeFlightCard(props: { sdk: ServerSDK; directory: string }) {
  const flight = useFlight()
  const language = useLanguage()
  const t = language.t
  const navigate = useNavigate()
  const meetings = () => devMeetings() ?? (props.directory ? serverMeetings(() => props.sdk, props.directory) : undefined)
  const warmKey = () => `${props.sdk.scope}\0${props.directory}`
  const cached = latest.read(warmKey())?.meeting
  const [last, setLast] = createSignal(cached)
  const [confirmed, setConfirmed] = createSignal(cached !== undefined)
  const [lastFailed, setLastFailed] = createSignal(false)
  let lastRead = 0
  const reportLast = (error: unknown) => {
    console.error(error)
    if (!lastFailed()) showToast({ variant: "error", title: t("orchestra.flightEngineer.meetings.failed") })
    setLastFailed(true)
  }
  createEffect(
    on(
      () => (flight.store.run.running ? undefined : meetings()),
      (source) => {
        const started = ++lastRead
        if (!source) return
        const abort = new AbortController()
        onCleanup(() => abort.abort())
        void settleLastMeeting({
          read: source.list({ limit: 1 }, abort.signal),
          current: () => started === lastRead && !abort.signal.aborted,
          apply: (page) => {
            latest.write(warmKey(), { meeting: page.items[0] })
            setLast(page.items[0])
            setConfirmed(true)
            setLastFailed(false)
          },
          report: reportLast,
        })
      },
    ),
  )
  const claim = () => homeLastClaim({ meeting: last() !== undefined, confirmed: confirmed(), failed: lastFailed() })
  const shown = () => runClaim(flight.store.runKnown, flight.store.run.running)
  const hotkey = () => flight.store.hotkeys.find((item) => item.action === "start-stop")?.accelerator ?? "CommandOrControl+Shift+M"
  const open = (to = "") => navigate(`/orchestra/flight-engineer${to}`)
  const when = (time: number) =>
    new Intl.DateTimeFormat(language.intl(), { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(time)

  return (
    <Show when={flight.available()}>
      <section class="fe-home" aria-labelledby="fe-home-title">
        <Show
          when={shown() === "running" && flight.store.run.running ? flight.store.run : undefined}
          fallback={
            <Show
              when={shown() === "idle"}
              fallback={
                <div class="fe-home-text">
                  <div class="fe-home-eyebrow">{t("orchestra.flightEngineer.title")}</div>
                  <h2 id="fe-home-title">{t("orchestra.flightEngineer.title")}</h2>
                  <Show when={flight.store.runFailed}>
                    <Note tone="bad">{t("common.requestFailed")}</Note>
                  </Show>
                </div>
              }
            >
              <>
                <div class="fe-home-text">
                  <div class="fe-home-eyebrow">{t("orchestra.flightEngineer.title")}</div>
                  <h2 id="fe-home-title">{t("orchestra.flightEngineer.home.idle")}</h2>
                  <p>
                    <Show when={claim() === "meeting" && last()}>
                      {(meeting) => (
                        <button type="button" class="mx-link" onClick={() => open(`/meetings/${encodeURIComponent(meeting().id)}`)}>
                          {t("orchestra.flightEngineer.home.last", { title: meeting().title, time: when(num(meeting().startedAt)) })}
                        </button>
                      )}
                    </Show>
                    <Show when={claim() === "none"}>{t("orchestra.flightEngineer.home.none")}</Show>
                  </p>
                  <Show when={lastFailed()}>
                    <Note tone="bad">{t("orchestra.flightEngineer.meetings.failed")}</Note>
                  </Show>
                </div>
                <div class="fe-home-actions">
                  <button type="button" class="mx-btn primary" onClick={flight.requestStart}>
                    {t("orchestra.flightEngineer.start")}
                  </button>
                  <Keys accelerator={hotkey()} />
                </div>
              </>
            </Show>
          }
        >
          {(run) => (
            <>
              <div class="fe-home-text">
                <div class="fe-home-eyebrow">
                  <i class="fe-dot" aria-hidden="true" /> {t("orchestra.flightEngineer.recording")}
                </div>
                <h2 id="fe-home-title">{run().title}</h2>
                <output class="fe-home-time">{clock(flight.elapsed())}</output>
              </div>
              <div class="fe-home-actions">
                <button type="button" class="mx-btn" onClick={() => open()}>
                  {t("orchestra.flightEngineer.home.open")}
                </button>
                <button type="button" class="mx-btn danger" disabled={flight.store.stopBusy} onClick={() => void flight.stop()}>
                  {t("orchestra.flightEngineer.stop")}
                </button>
              </div>
              <Show when={flight.store.stopFailed}>
                <Note tone="bad">{t("common.requestFailed")}</Note>
              </Show>
            </>
          )}
        </Show>
      </section>
    </Show>
  )
}
