import { createEffect, createSignal, For, onCleanup, Show } from "solid-js"
import { createStore } from "solid-js/store"
import type { LiveHotkey, LiveHotkeyAction, LiveSettings, LiveSource } from "@/context/platform"
import { useLanguage } from "@/context/language"
import { MxBadge, MxToggle } from "../kit"
import { accelerator } from "./model"
import { Keys, mac, Note } from "./parts"
import type { useFlight } from "./run"

type Flight = ReturnType<typeof useFlight>

const languages = ["auto", "en-US", "pt-BR", "es-ES", "fr-FR", "de-DE", "it-IT", "ja-JP", "ko-KR", "zh-CN"]
const sources = ["microphone", "systemAudio"] as const satisfies readonly LiveSource[]
const actions = ["start-stop", "ask", "toggle-overlay", "toggle-captions"] as const satisfies readonly LiveHotkeyAction[]

// Everything the seat remembers. The speech-to-text key is write-only: this screen can replace it or clear it, never show it.
export function FlightSettings(props: { flight: Flight }) {
  const language = useLanguage()
  const t = language.t
  const seat = () => props.flight.seat()
  const [store, setStore] = createStore({
    settings: undefined as LiveSettings | undefined,
    saved: undefined as boolean | undefined,
    replacing: false,
    problem: undefined as string | undefined,
    recording: undefined as LiveHotkeyAction | undefined,
    errors: {} as Partial<Record<LiveHotkeyAction, "conflict" | "invalid">>,
  })
  const [secret, setSecret] = createSignal("")

  createEffect(() => {
    const current = seat()
    if (!current) return
    void current.getSettings().then((value) => setStore("settings", value))
    void current.hasTranscriptionKey().then((value) => setStore("saved", value))
  })

  const patch = (change: Partial<LiveSettings>) =>
    seat()
      ?.setSettings(change)
      .then((value) => setStore({ settings: value, problem: undefined }))
      .catch(() => setStore("problem", t("orchestra.flightEngineer.settings.failed")))

  const saveKey = async () => {
    const value = secret().trim()
    if (!value) return
    // The value goes to the bridge and is dropped here; nothing else reads it.
    await seat()?.setTranscriptionKey(value)
    setSecret("")
    setStore({ replacing: false, saved: true })
    void props.flight.readiness()
  }

  const removeKey = async () => {
    await seat()?.setTranscriptionKey("")
    setStore({ replacing: false, saved: false })
    void props.flight.readiness()
  }

  const protect = async (value: boolean) => {
    await seat()?.setContentProtection(value)
    props.flight.setProtection(value)
  }

  // While recording, the next key combination becomes the accelerator.
  createEffect(() => {
    const target = store.recording
    if (!target) return
    const listen = async (event: KeyboardEvent) => {
      event.preventDefault()
      event.stopPropagation()
      if (event.key === "Escape") return setStore("recording", undefined)
      const next = accelerator(event, mac)
      if (!next) return
      setStore("recording", undefined)
      const result = await seat()?.setHotkey(target, next)
      if (!result) return
      setStore("errors", target, result.ok ? undefined : result.reason)
      await props.flight.hotkeys()
    }
    window.addEventListener("keydown", listen, true)
    onCleanup(() => window.removeEventListener("keydown", listen, true))
  })

  const resetAll = async () => {
    setStore("errors", {})
    await seat()?.resetHotkeys()
    await props.flight.hotkeys()
  }

  const accelOf = (action: LiveHotkeyAction): LiveHotkey | undefined => props.flight.store.hotkeys.find((item) => item.action === action)

  return (
    <Show when={seat()} fallback={<Note>{t("orchestra.flightEngineer.desktopOnly")}</Note>}>
      <Show when={store.problem}>
        <Note tone="bad">{store.problem}</Note>
      </Show>

      <section class="mx-card fe-settings" aria-labelledby="fe-set-capture">
        <h3 id="fe-set-capture">{t("orchestra.flightEngineer.settings.capture")}</h3>

        <div class="fe-setting">
          <div>
            <strong>{t("orchestra.flightEngineer.settings.key")}</strong>
            <p>{t("orchestra.flightEngineer.settings.keyBody")}</p>
          </div>
          <div class="fe-setting-control">
            <Show
              when={store.replacing || store.saved === false}
              fallback={
                <>
                  <MxBadge tone="good">{t("orchestra.flightEngineer.saved")}</MxBadge>
                  <button type="button" class="mx-btn" onClick={() => setStore("replacing", true)}>
                    {t("orchestra.flightEngineer.settings.replace")}
                  </button>
                  <button type="button" class="mx-btn danger" onClick={() => void removeKey()}>
                    {t("orchestra.flightEngineer.settings.remove")}
                  </button>
                </>
              }
            >
              <form
                class="fe-key-form"
                onSubmit={(event) => {
                  event.preventDefault()
                  void saveKey()
                }}
              >
                <input
                  type="password"
                  autocomplete="off"
                  spellcheck={false}
                  aria-label={t("orchestra.flightEngineer.settings.keyInput")}
                  placeholder={t("orchestra.flightEngineer.settings.keyInput")}
                  value={secret()}
                  onInput={(event) => setSecret(event.currentTarget.value)}
                />
                <button type="submit" class="mx-btn primary" disabled={secret().trim() === ""}>
                  {t("orchestra.flightEngineer.settings.saveKey")}
                </button>
                <Show when={store.saved}>
                  <button
                    type="button"
                    class="mx-btn"
                    onClick={() => {
                      setSecret("")
                      setStore("replacing", false)
                    }}
                  >
                    {t("orchestra.flightEngineer.cancel")}
                  </button>
                </Show>
              </form>
            </Show>
          </div>
        </div>

        <div class="fe-setting">
          <div>
            <strong>{t("orchestra.flightEngineer.settings.sources")}</strong>
            <p>{t("orchestra.flightEngineer.settings.sourcesBody")}</p>
          </div>
          <div class="fe-setting-control fe-stack">
            <For each={sources}>
              {(source) => (
                <label class="fe-switch">
                  <span>{t(`orchestra.flightEngineer.${source}` as "orchestra.flightEngineer.microphone")}</span>
                  <MxToggle
                    label={t(`orchestra.flightEngineer.${source}` as "orchestra.flightEngineer.microphone")}
                    checked={store.settings?.sources[source] ?? false}
                    disabled={!store.settings}
                    onChange={(next) => void patch({ sources: { ...store.settings!.sources, [source]: next } })}
                  />
                </label>
              )}
            </For>
          </div>
        </div>

        <div class="fe-setting">
          <div>
            <strong>{t("orchestra.flightEngineer.settings.protection")}</strong>
            <p>{t("orchestra.flightEngineer.settings.protectionBody")}</p>
          </div>
          <div class="fe-setting-control">
            <MxToggle
              label={t("orchestra.flightEngineer.settings.protection")}
              checked={props.flight.store.protection ?? false}
              disabled={props.flight.store.protection === undefined}
              onChange={(next) => void protect(next)}
            />
          </div>
        </div>
      </section>

      <section class="mx-card fe-settings" aria-labelledby="fe-set-answers">
        <h3 id="fe-set-answers">{t("orchestra.flightEngineer.settings.answers")}</h3>

        <div class="fe-setting">
          <div>
            <strong>{t("orchestra.flightEngineer.model")}</strong>
            <p>{t("orchestra.flightEngineer.settings.modelBody")}</p>
          </div>
          <div class="fe-setting-control">
            <input
              class="fe-input"
              aria-label={t("orchestra.flightEngineer.model")}
              placeholder={t("orchestra.flightEngineer.model.default")}
              value={store.settings?.answerModel ?? ""}
              disabled={!store.settings}
              onChange={(event) => void patch({ answerModel: event.currentTarget.value.trim() || undefined })}
            />
          </div>
        </div>

        <div class="fe-setting">
          <div>
            <strong>{t("orchestra.flightEngineer.settings.language")}</strong>
            <p>{t("orchestra.flightEngineer.settings.languageBody")}</p>
          </div>
          <div class="fe-setting-control">
            <select
              class="fe-select"
              aria-label={t("orchestra.flightEngineer.settings.language")}
              disabled={!store.settings}
              value={store.settings?.language ?? "auto"}
              onChange={(event) => void patch({ language: event.currentTarget.value })}
            >
              <For each={store.settings && !languages.includes(store.settings.language) ? [store.settings.language, ...languages] : languages}>
                {(tag) => <option value={tag}>{tag === "auto" ? t("orchestra.flightEngineer.settings.auto") : tag}</option>}
              </For>
            </select>
          </div>
        </div>

        <div class="fe-setting">
          <div>
            <strong>{t("orchestra.flightEngineer.settings.suggestions")}</strong>
            <p>{t("orchestra.flightEngineer.settings.suggestionsBody")}</p>
          </div>
          <div class="fe-setting-control">
            <MxToggle
              label={t("orchestra.flightEngineer.settings.suggestions")}
              checked={store.settings?.suggestions ?? false}
              disabled={!store.settings}
              onChange={(next) => void patch({ suggestions: next })}
            />
          </div>
        </div>
      </section>

      <section class="mx-card fe-settings" aria-labelledby="fe-set-keys">
        <div class="mx-card-top">
          <h3 id="fe-set-keys" class="mx-grow">
            {t("orchestra.flightEngineer.settings.hotkeys")}
          </h3>
          <button type="button" class="mx-link" onClick={() => void resetAll()}>
            {t("orchestra.flightEngineer.settings.reset")}
          </button>
        </div>
        <For each={actions}>
          {(action) => (
            <div class="fe-setting">
              <div>
                <strong>{t(`orchestra.flightEngineer.hotkey.${action}` as "orchestra.flightEngineer.hotkey.ask")}</strong>
                <Show when={store.errors[action]}>
                  {(reason) => (
                    <p class="fe-problem" role="alert">
                      {t(`orchestra.flightEngineer.hotkey.${reason()}` as "orchestra.flightEngineer.hotkey.conflict")}
                    </p>
                  )}
                </Show>
              </div>
              <div class="fe-setting-control">
                <Show
                  when={store.recording === action}
                  fallback={
                    <>
                      <Show when={accelOf(action)}>{(item) => <Keys accelerator={item().accelerator} />}</Show>
                      <button type="button" class="mx-btn" onClick={() => setStore("recording", action)}>
                        {t("orchestra.flightEngineer.hotkey.change")}
                      </button>
                    </>
                  }
                >
                  <span class="fe-recording" role="status">
                    {t("orchestra.flightEngineer.hotkey.press")}
                  </span>
                  <button type="button" class="mx-btn" onClick={() => setStore("recording", undefined)}>
                    {t("orchestra.flightEngineer.cancel")}
                  </button>
                </Show>
              </div>
            </div>
          )}
        </For>
      </section>
    </Show>
  )
}
