import { createEffect, createSignal, For, onCleanup, Show } from "solid-js"
import { useLanguage } from "@/context/language"
import { MxBadge } from "../kit"
import type { StartOptions } from "./model"
import { Glyph, Note } from "./parts"
import { useFlight } from "./run"

const consents = ["announced", "not-needed", "unknown"] as const
const retentions = ["kept", "ephemeral"] as const

// Both dialogs live above the whole app, so a start from the keyboard, the Home card or Settings reaches them.
export function FlightEngineerHost() {
  const flight = useFlight()
  return (
    <>
      <Show when={flight.store.dialog === "consent"}>
        <Consent />
      </Show>
      <Show when={flight.store.dialog === "permission"}>
        <Permissions />
      </Show>
    </>
  )
}

// A modal with the float-glass material of the approved permission mock. It closes on Escape and returns focus.
function Frame(props: { id: string; title: string; close: () => void; children: import("solid-js").JSX.Element }) {
  const t = useLanguage().t
  let dialog: HTMLDialogElement | undefined
  createEffect(() => {
    if (!dialog || dialog.open) return
    dialog.showModal()
    const previous = document.activeElement
    onCleanup(() => previous instanceof HTMLElement && previous.focus())
  })
  return (
    <dialog
      ref={dialog}
      class="fe-modal"
      aria-labelledby={props.id}
      onCancel={(event) => {
        event.preventDefault()
        props.close()
      }}
    >
      <header>
        <h2 id={props.id}>{props.title}</h2>
        <button type="button" class="mx-link" aria-label={t("orchestra.flightEngineer.close")} onClick={props.close}>
          <Glyph name="close" />
        </button>
      </header>
      {props.children}
    </dialog>
  )
}

function Consent() {
  const flight = useFlight()
  const t = useLanguage().t
  // No consent is preselected: the answer is a decision made at every start. Retention starts on the safe, kept default.
  const [consent, setConsent] = createSignal<StartOptions["consent"] | undefined>()
  const [retention, setRetention] = createSignal<StartOptions["retention"]>("kept")
  return (
    <Frame id="fe-consent-title" title={t("orchestra.flightEngineer.consent.title")} close={flight.closeDialog}>
      <p class="fe-modal-lead">{t("orchestra.flightEngineer.consent.body")}</p>
      <fieldset>
        <legend>{t("orchestra.flightEngineer.consent.question")}</legend>
        <For each={consents}>
          {(value) => (
            <label class="fe-choice">
              <input type="radio" name="fe-consent" checked={consent() === value} onChange={() => setConsent(value)} />
              <span>
                <strong>{t(`orchestra.flightEngineer.consent.${value}` as "orchestra.flightEngineer.consent.unknown")}</strong>
                <small>{t(`orchestra.flightEngineer.consent.${value}.body` as "orchestra.flightEngineer.consent.unknown.body")}</small>
              </span>
            </label>
          )}
        </For>
      </fieldset>
      <fieldset>
        <legend>{t("orchestra.flightEngineer.retention.question")}</legend>
        <For each={retentions}>
          {(value) => (
            <label class="fe-choice">
              <input type="radio" name="fe-retention" checked={retention() === value} onChange={() => setRetention(value)} />
              <span>
                <strong>{t(`orchestra.flightEngineer.retention.${value}` as "orchestra.flightEngineer.retention.kept")}</strong>
                <small>{t(`orchestra.flightEngineer.retention.${value}.body` as "orchestra.flightEngineer.retention.kept.body")}</small>
              </span>
            </label>
          )}
        </For>
      </fieldset>
      <footer>
        <button type="button" class="mx-btn" onClick={flight.closeDialog}>
          {t("orchestra.flightEngineer.cancel")}
        </button>
        <button
          type="button"
          class="mx-btn primary"
          disabled={consent() === undefined || flight.store.starting}
          onClick={() => {
            const answer = consent()
            if (answer) void flight.start({ consent: answer, retention: retention() })
          }}
        >
          {t("orchestra.flightEngineer.consent.start")}
        </button>
      </footer>
    </Frame>
  )
}

function Permissions() {
  const flight = useFlight()
  const t = useLanguage().t
  const readiness = () => flight.store.readiness
  const granted = (value: string | undefined) => value === "granted"
  const rows = [
    { source: "microphone", name: "microphone", glyph: "microphone", state: () => readiness()?.permissions.microphone },
    { source: "system-audio", name: "systemAudio", glyph: "speaker", state: () => readiness()?.permissions["system-audio"] },
  ] as const
  return (
    <Frame id="fe-permissions-title" title={t("orchestra.flightEngineer.permissions.title")} close={flight.closeDialog}>
      <p class="fe-modal-lead">{t("orchestra.flightEngineer.permissions.body")}</p>
      <ul class="fe-perms">
        <For each={rows}>
          {(row) => (
            <li>
              <Glyph name={row.glyph} />
              <span>
                <strong>{t(`orchestra.flightEngineer.${row.name}` as "orchestra.flightEngineer.microphone")}</strong>
                <small>{t(`orchestra.flightEngineer.permissions.${row.name}` as "orchestra.flightEngineer.permissions.microphone")}</small>
              </span>
              <Show
                when={granted(row.state())}
                fallback={
                  <>
                    <MxBadge tone="bad">{t("orchestra.flightEngineer.permissions.needed")}</MxBadge>
                    <button type="button" class="mx-btn" onClick={() => void flight.ask(row.source)}>
                      {t("orchestra.flightEngineer.permissions.openSettings")}
                    </button>
                  </>
                }
              >
                <MxBadge tone="good">{t("orchestra.flightEngineer.permissions.granted")}</MxBadge>
              </Show>
            </li>
          )}
        </For>
      </ul>
      <Note>{t("orchestra.flightEngineer.permissions.hint")}</Note>
      <Show when={flight.store.waiting}>
        <p class="fe-waiting" role="status">
          {t("orchestra.flightEngineer.permissions.waiting")}
        </p>
      </Show>
      <footer>
        <button type="button" class="mx-btn" onClick={flight.closeDialog}>
          {t("orchestra.flightEngineer.permissions.later")}
        </button>
        <button type="button" class="mx-btn primary" onClick={() => void flight.readiness()}>
          {t("orchestra.flightEngineer.permissions.check")}
        </button>
      </footer>
    </Frame>
  )
}
