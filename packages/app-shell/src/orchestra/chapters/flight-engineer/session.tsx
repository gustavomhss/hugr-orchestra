import { createEffect, createSignal, Match, onCleanup, Show, Switch } from "solid-js"
import type { LivePermission, LiveReadiness, LiveSource } from "@/context/platform"
import { useLanguage } from "@/context/language"
import { MxBadge } from "../kit"
import { clock } from "./model"
import { Glyph, Keys, Meter } from "./parts"
import type { useFlight } from "./run"

type Flight = ReturnType<typeof useFlight>

// The chapter's first screen: ready to start, or a running meeting. The transcript, suggestions and answers live in
// the overlay; the bridge sends this window only the run state and the audio levels.
export function Session(props: { flight: Flight; openSettings: () => void }) {
  return (
    <Show
      when={props.flight.store.run.running && props.flight.store.run}
      fallback={<Idle flight={props.flight} openSettings={props.openSettings} />}
    >
      {(run) => <Running flight={props.flight} run={run() as RunningState} />}
    </Show>
  )
}

const startStop = "CommandOrControl+Shift+M"
const hotkeyOf = (flight: Flight) => flight.store.hotkeys.find((item) => item.action === "start-stop")?.accelerator ?? startStop

type RunningState = Extract<Flight["store"]["run"], { running: true }>

function Idle(props: { flight: Flight; openSettings: () => void }) {
  const language = useLanguage()
  const t = language.t
  const readiness = () => props.flight.store.readiness
  return (
    <>
      <div class="fe-split">
        <section class="mx-card fe-hero" aria-labelledby="fe-idle-title">
          <MxBadge>{t("orchestra.flightEngineer.idle.badge")}</MxBadge>
          <h2 id="fe-idle-title">{t("orchestra.flightEngineer.idle.title")}</h2>
          <p>{t("orchestra.flightEngineer.idle.body")}</p>
          <div class="fe-start">
            <button type="button" class="mx-btn primary" disabled={props.flight.store.starting} onClick={() => props.flight.requestStart()}>
              {t("orchestra.flightEngineer.start")}
            </button>
            <span class="fe-or">
              {t("orchestra.flightEngineer.orPress")} <Keys accelerator={hotkeyOf(props.flight)} />
            </span>
          </div>
          <Show when={props.flight.store.protection !== undefined}>
            <p class="fe-protect">
              <Glyph name="shield" />
              {props.flight.store.protection ? t("orchestra.flightEngineer.protection.on") : t("orchestra.flightEngineer.protection.off")}
            </p>
          </Show>
        </section>
        <section class="mx-card" aria-labelledby="fe-ready-title">
          <h3 id="fe-ready-title" class="fe-card-title">
            {t("orchestra.flightEngineer.readiness")}
          </h3>
          <Show when={readiness()} fallback={<p class="fe-quiet">{t("orchestra.flightEngineer.readiness.loading")}</p>}>
            {(value) => <Readiness flight={props.flight} value={value()} openSettings={props.openSettings} />}
          </Show>
        </section>
      </div>
      <Tips flight={props.flight} />
    </>
  )
}

function permissionLabel(permission: LivePermission, t: ReturnType<typeof useLanguage>["t"]) {
  if (permission === "granted") return t("orchestra.flightEngineer.ready")
  if (permission === "denied") return t("orchestra.flightEngineer.denied")
  return t("orchestra.flightEngineer.needed")
}

function Readiness(props: { flight: Flight; value: LiveReadiness; openSettings: () => void }) {
  const t = useLanguage().t
  const source = (name: LiveSource, available: boolean) => (
    <Show when={available} fallback={<MxBadge tone="bad">{t("orchestra.flightEngineer.unsupported")}</MxBadge>}>
      <Show
        when={props.value.permissions[name] === "granted"}
        fallback={
          <>
            <MxBadge tone="bad">{permissionLabel(props.value.permissions[name], t)}</MxBadge>
            <button type="button" class="mx-btn" onClick={() => void props.flight.ask(name)}>
              {name === "microphone" ? t("orchestra.flightEngineer.grant.microphone") : t("orchestra.flightEngineer.grant.systemAudio")}
            </button>
          </>
        }
      >
        <MxBadge tone="good">{t("orchestra.flightEngineer.ready")}</MxBadge>
      </Show>
    </Show>
  )
  return (
    <div class="fe-list">
      <div class="fe-line">
        <span class="fe-ico"><Glyph name="microphone" /></span>
        <div class="mx-grow">
          <strong>{t("orchestra.flightEngineer.microphone")}</strong>
          <small>{props.value.microphone?.label ?? t("orchestra.flightEngineer.microphone.none")}</small>
        </div>
        {source("microphone", true)}
      </div>
      <div class="fe-line">
        <span class="fe-ico"><Glyph name="speaker" /></span>
        <div class="mx-grow">
          <strong>{t("orchestra.flightEngineer.systemAudio")}</strong>
          <small>
            {props.value.systemAudio.available
              ? t("orchestra.flightEngineer.systemAudio.detail")
              : t("orchestra.flightEngineer.systemAudio.old")}
          </small>
        </div>
        {source("system-audio", props.value.systemAudio.available)}
      </div>
      <div class="fe-line">
        <span class="fe-ico"><Glyph name="key" /></span>
        <div class="mx-grow">
          <strong>{t("orchestra.flightEngineer.key")}</strong>
          <small>{t("orchestra.flightEngineer.key.detail")}</small>
        </div>
        <Show
          when={props.value.transcriptionKey}
          fallback={
            <>
              <MxBadge tone="bad">{t("orchestra.flightEngineer.key.missing")}</MxBadge>
              <button type="button" class="mx-btn" onClick={props.openSettings}>{t("orchestra.flightEngineer.openSettings")}</button>
            </>
          }
        >
          <MxBadge tone="good">{t("orchestra.flightEngineer.saved")}</MxBadge>
        </Show>
      </div>
      <div class="fe-line">
        <span class="fe-ico"><Glyph name="model" /></span>
        <div class="mx-grow">
          <strong>{t("orchestra.flightEngineer.model")}</strong>
          <small>{props.value.answerModel?.id ?? t("orchestra.flightEngineer.model.default")}</small>
        </div>
        <Switch>
          <Match when={props.value.answerModel?.reachable === false}>
            <MxBadge tone="bad">{t("orchestra.flightEngineer.model.unreachable")}</MxBadge>
          </Match>
          <Match when={props.value.answerModel?.reachable === true}>
            <MxBadge tone="good">{t("orchestra.flightEngineer.ready")}</MxBadge>
          </Match>
          <Match when={true}>
            <MxBadge>{t("orchestra.flightEngineer.model.unknown")}</MxBadge>
          </Match>
        </Switch>
      </div>
    </div>
  )
}

function Tips(props: { flight: Flight }) {
  const t = useLanguage().t
  const hotkeys = () => props.flight.store.hotkeys
  const keys = (action: "ask" | "toggle-overlay" | "start-stop") =>
    hotkeys().find((item) => item.action === action)?.accelerator
  return (
    <section class="mx-card fe-tips" aria-labelledby="fe-tips-title">
      <h3 id="fe-tips-title" class="fe-card-title">{t("orchestra.flightEngineer.tips")}</h3>
      <div class="fe-tip-grid">
        <p>
          <strong>{t("orchestra.flightEngineer.tips.ask")}</strong>
          <span>
            <Show when={keys("ask")}>{(value) => <Keys accelerator={value()} />}</Show> {t("orchestra.flightEngineer.tips.askBody")}
          </span>
        </p>
        <p>
          <strong>{t("orchestra.flightEngineer.tips.overlay")}</strong>
          <span>
            <Show when={keys("toggle-overlay")}>{(value) => <Keys accelerator={value()} />}</Show> {t("orchestra.flightEngineer.tips.overlayBody")}
          </span>
        </p>
        <p>
          <strong>{t("orchestra.flightEngineer.tips.stop")}</strong>
          <span>
            <Show when={keys("start-stop")}>{(value) => <Keys accelerator={value()} />}</Show> {t("orchestra.flightEngineer.tips.stopBody")}
          </span>
        </p>
      </div>
    </section>
  )
}

function Running(props: { flight: Flight; run: RunningState }) {
  const language = useLanguage()
  const t = language.t
  const [levels, setLevels] = createSignal<Record<LiveSource, number>>({ microphone: 0, "system-audio": 0 })
  const [draft, setDraft] = createSignal<string>()
  createEffect(() => {
    const off = props.flight.seat()?.onLevels(setLevels)
    onCleanup(() => off?.())
  })
  const commit = () => {
    const title = draft()?.trim()
    setDraft(undefined)
    if (title && title !== props.run.title) void props.flight.rename(title)
  }
  return (
    <>
      <section class="mx-card fe-hero fe-running" aria-labelledby="fe-run-title">
        <div class="fe-run-top">
          <MxBadge tone="bad">{t("orchestra.flightEngineer.recording")}</MxBadge>
          <output class="fe-timer" aria-label={t("orchestra.flightEngineer.elapsed")}>
            {clock(props.flight.elapsed())}
          </output>
        </div>
        <Show
          when={draft() !== undefined}
          fallback={
            <h2 id="fe-run-title" class="fe-run-title">
              <button type="button" class="fe-rename" title={t("orchestra.flightEngineer.rename")} onClick={() => setDraft(props.run.title)}>
                {props.run.title}
              </button>
            </h2>
          }
        >
          <input
            class="fe-title-input"
            aria-label={t("orchestra.flightEngineer.rename")}
            value={draft()}
            ref={(element) => queueMicrotask(() => element.select())}
            onInput={(event) => setDraft(event.currentTarget.value)}
            onBlur={commit}
            onKeyDown={(event) => {
              if (event.key === "Enter") commit()
              if (event.key === "Escape") setDraft(undefined)
            }}
          />
        </Show>
        <p class="fe-meta">
          {t("orchestra.flightEngineer.startedAt", {
            time: new Intl.DateTimeFormat(language.intl(), { hour: "numeric", minute: "2-digit" }).format(props.run.startedAt),
          })}
          {" · "}
          {props.run.sources["system-audio"] ? t("orchestra.flightEngineer.sources.both") : t("orchestra.flightEngineer.sources.microphone")}
        </p>
        <div class="fe-meters">
          <Meter label={t("orchestra.flightEngineer.you")} level={levels().microphone} detail={t("orchestra.flightEngineer.microphone")} />
          <Show when={props.run.sources["system-audio"]}>
            <Meter label={t("orchestra.flightEngineer.them")} level={levels()["system-audio"]} detail={t("orchestra.flightEngineer.systemAudio")} />
          </Show>
        </div>
        <div class="fe-start">
          <button type="button" class="mx-btn danger" onClick={() => void props.flight.stop()}>
            {t("orchestra.flightEngineer.stop")}
          </button>
          <span class="fe-or">
            {t("orchestra.flightEngineer.orPress")} <Keys accelerator={hotkeyOf(props.flight)} />
          </span>
        </div>
      </section>
      <section class="mx-card fe-overlay-note" aria-labelledby="fe-overlay-title">
        <h3 id="fe-overlay-title" class="fe-card-title">{t("orchestra.flightEngineer.overlay.title")}</h3>
        <p class="fe-quiet">{t("orchestra.flightEngineer.overlay.body")}</p>
      </section>
      <Tips flight={props.flight} />
    </>
  )
}

