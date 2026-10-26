import { createEffect, onCleanup, onMount, Show } from "solid-js"
import { createStore } from "solid-js/store"
import { useLanguage } from "@/context/language"
import { usePlatform } from "@/context/platform"
import { useServerSDK } from "@/context/server-sdk"
import { useServerSync } from "@/context/server-sync"
import { setMaestroEngine } from "@/orchestra/claude-mode-entry"
import { showToast } from "@/utils/toast"
import { readAccount, sendCode, startSignIn } from "./claude-mode-account"
import { errorMessage } from "./providers-data"

const POLL_MS = 2500

// Maestro on Claude Code: pick the engine and sign in to Claude from the app. Claude Code opens the browser itself
// when sign-in starts, so the returned URL is only the "Browser didn't open?" fallback and is never opened here.
export function ClaudeModeSection() {
  const language = useLanguage()
  const platform = usePlatform()
  const sdk = useServerSDK()
  const sync = useServerSync()
  const [state, setState] = createStore({
    // A pending choice shows only while its write is in flight, like the route select.
    engine: undefined as "orchestra" | "claude-code" | undefined,
    account: undefined as { signedIn: boolean; email?: string; subscription?: string } | undefined,
    loaded: false,
    signing: false,
    url: undefined as string | undefined,
    code: "",
    sending: false,
    error: undefined as string | undefined,
  })
  const engine = () =>
    state.engine ?? (sync().data.config.agent?.maestro?.engine === "claude-code" ? "claude-code" : "orchestra")
  const providers = () => sdk().orchestra.providers
  // Sign-in failures arrive as `{ name, data: { message } }`; the message is Claude Code's own stderr.
  const failed = (error: unknown) =>
    language.t("orchestra.providers.claudeMode.failed", {
      message: errorMessage(error, language.t("common.requestFailed")),
    })

  const refresh = async () => {
    const result = await readAccount(providers())
    setState("loaded", true)
    if (!result) return
    setState("account", result)
    if (result.signedIn) setState({ signing: false, url: undefined, code: "", error: undefined })
  }
  onMount(() => void refresh())
  // The CLI stores the login itself, so the status is the only signal that a browser or pasted-code sign-in finished.
  createEffect(() => {
    if (!state.signing) return
    const timer = setInterval(() => void refresh(), POLL_MS)
    onCleanup(() => clearInterval(timer))
  })

  const chooseEngine = async (value: string) => {
    const next = value === "claude-code" ? "claude-code" : "orchestra"
    setState("engine", next)
    await setMaestroEngine(sync(), next)
      .catch((error: unknown) =>
        showToast({
          title: language.t("common.requestFailed"),
          description: errorMessage(error, language.t("common.requestFailed")),
        }),
      )
      .finally(() => setState("engine", undefined))
  }

  const signIn = async () => {
    setState({ signing: true, url: undefined, code: "", error: undefined })
    const result = await startSignIn(providers())
    if ("url" in result) return setState("url", result.url)
    setState({ signing: false, error: failed(result.error) })
  }
  const cancel = () => setState({ signing: false, url: undefined, code: "", error: undefined })
  const submit = async () => {
    const code = state.code.trim()
    if (!code || state.sending) return
    setState({ sending: true, error: undefined })
    const result = await sendCode(providers(), code)
    setState("sending", false)
    if ("error" in result) return setState("error", failed(result.error))
    setState("code", "")
    void refresh()
  }

  const account = () => {
    const value = state.account
    if (!value?.email) return language.t("orchestra.providers.claudeMode.signedInAnonymous")
    if (!value.subscription) return language.t("orchestra.providers.claudeMode.signedIn", { email: value.email })
    return language.t("orchestra.providers.claudeMode.signedInPlan", {
      email: value.email,
      subscription: value.subscription,
    })
  }

  return (
    <section class="providers-claude" aria-labelledby="orchestra-providers-claude-mode" data-providers-claude-mode>
      <h3 class="mx-section" id="orchestra-providers-claude-mode">
        {language.t("orchestra.providers.claudeMode")}
      </h3>
      <p id="orchestra-providers-claude-mode-description" class="mx-note providers-claude-description">
        {language.t("orchestra.providers.claudeMode.description")}
      </p>
      <div class="mx-table">
        <div class="mx-row">
          <div class="mx-grow">
            <strong>{language.t("orchestra.providers.claudeMode.engine")}</strong>
          </div>
          <label class="mx-field providers-claude-engine">
            <select
              data-providers-claude-engine
              aria-label={language.t("orchestra.providers.claudeMode.engine")}
              disabled={state.engine !== undefined}
              aria-describedby="orchestra-providers-claude-mode-description"
              onChange={(event) => void chooseEngine(event.currentTarget.value)}
            >
              {/* Selection lives on the options: a select value set before its option exists is lost. */}
              <option value="orchestra" selected={engine() === "orchestra"}>
                {language.t("orchestra.providers.claudeMode.engine.orchestra")}
              </option>
              <option value="claude-code" selected={engine() === "claude-code"}>
                {language.t("orchestra.providers.claudeMode.engine.claudeCode")}
              </option>
            </select>
          </label>
        </div>
        <div class="mx-row" data-providers-claude-account>
          <div class="mx-grow">
            <strong>{language.t("orchestra.providers.claudeMode.account")}</strong>
            <Show when={state.account?.signedIn}>
              <small>{account()}</small>
            </Show>
            <Show when={state.signing}>
              <small role="status">{language.t("orchestra.providers.claudeMode.waiting")}</small>
            </Show>
          </div>
          <Show when={state.loaded && !state.account?.signedIn && !state.signing}>
            <button type="button" class="mx-btn primary" onClick={() => void signIn()}>
              {language.t("orchestra.providers.claudeMode.signIn")}
            </button>
          </Show>
        </div>
        <Show when={state.signing}>
          <form
            class="mx-row providers-claude-signin"
            onSubmit={(event) => {
              event.preventDefault()
              void submit()
            }}
          >
            <div class="mx-grow">
              <Show when={state.url}>
                {(url) => (
                  <button type="button" class="mx-link" onClick={() => platform.openExternal(url())}>
                    {language.t("orchestra.providers.claudeMode.fallback")}
                  </button>
                )}
              </Show>
              <label class="mx-field">
                <span>{language.t("orchestra.providers.claudeMode.code")}</span>
                <input
                  autocomplete="off"
                  spellcheck={false}
                  value={state.code}
                  onInput={(event) => setState("code", event.currentTarget.value)}
                />
              </label>
            </div>
            <button type="submit" class="mx-btn primary" disabled={!state.code.trim() || state.sending}>
              {language.t("orchestra.providers.claudeMode.submit")}
            </button>
            <button type="button" class="mx-btn" onClick={cancel}>
              {language.t("common.cancel")}
            </button>
          </form>
        </Show>
        <Show when={state.error}>
          {(message) => (
            <div class="mx-row">
              <p class="mx-error providers-claude-error" role="alert">
                {message()}
              </p>
            </div>
          )}
        </Show>
      </div>
    </section>
  )
}
