import { Dialog } from "@kobalte/core/dialog"
import { useDialog } from "@orchestra/ui/context/dialog"
import { iconNames } from "@orchestra/ui/icons/provider"
import { ProviderIcon } from "@orchestra/ui/provider-icon"
import { children, createMemo, createResource, For, type JSX, onCleanup, Show } from "solid-js"
import { createStore } from "solid-js/store"
import { ExternalLink } from "@/components/external-link"
import { useLanguage } from "@/context/language"
import { usePlatform } from "@/context/platform"
import { useServerSDK } from "@/context/server-sdk"
import {
  authorizationURL,
  type CatalogEntry,
  connectableIntegration,
  errorMessage,
  noteKey,
  visiblePrompts,
} from "./providers-data"

// The mock's provider mark: the real brand when the sprite has it, the neutral model mark otherwise.
export function ProviderBrand(props: { id: string }) {
  return (
    <Show
      when={(iconNames as readonly string[]).includes(props.id)}
      fallback={
        <svg class="mx-brand" viewBox="0 0 24 24" aria-hidden="true">
          <path
            d="m12 3 8 4.5v9L12 21l-8-4.5v-9L12 3Zm0 0v18M4 7.5l8 4.5 8-4.5"
            fill="none"
            stroke="currentColor"
            stroke-width="1.5"
            stroke-linejoin="round"
          />
        </svg>
      }
    >
      <ProviderIcon id={props.id} class="mx-brand" aria-hidden="true" />
    </Show>
  )
}

// Mock `modal()`: header with title, subtitle and close; body with one alert line; Cancel plus an optional submit.
function MxDialog(props: {
  title: string
  description: string
  error?: string
  submit?: string
  busy?: boolean
  bodyClass?: string
  onSubmit?: () => void
  children?: JSX.Element
}) {
  const language = useLanguage()
  const body = children(() => props.children)
  return (
    <Dialog.Content class="mx-dialog providers-dialog" data-component="orchestra-providers-dialog">
      <form
        autocomplete="off"
        onSubmit={(event) => {
          event.preventDefault()
          props.onSubmit?.()
        }}
      >
        <header class="mx-dialog-head">
          <div>
            <Dialog.Title as="h2">{props.title}</Dialog.Title>
            <Dialog.Description as="p">{props.description}</Dialog.Description>
          </div>
          <Dialog.CloseButton type="button" class="mx-link" aria-label={language.t("orchestra.providers.closeDialog")}>
            <svg class="providers-close" viewBox="0 0 16 16" aria-hidden="true">
              <path d="m4 4 8 8m0-8-8 8" />
            </svg>
          </Dialog.CloseButton>
        </header>
        <Show when={body() || props.error}>
          <div class={props.bodyClass ? `mx-dialog-body ${props.bodyClass}` : "mx-dialog-body"}>
            <Show when={props.error}>
              <p class="mx-error" role="alert">
                {props.error}
              </p>
            </Show>
            {body()}
          </div>
        </Show>
        <footer class="mx-dialog-foot">
          {/* Kobalte names a close button "Dismiss" unless told otherwise; keep the visible word as its name. */}
          <Dialog.CloseButton type="button" class="mx-btn" aria-label={language.t("common.cancel")}>
            {language.t("common.cancel")}
          </Dialog.CloseButton>
          <Show when={props.submit}>
            <button class="mx-btn primary" type="submit" disabled={props.busy}>
              {props.submit}
            </button>
          </Show>
        </footer>
      </form>
    </Dialog.Content>
  )
}

export function ProviderPickerDialog(props: {
  entries: CatalogEntry[]
  onConnect: (entry: CatalogEntry) => void
  onCustom: () => void
}) {
  const language = useLanguage()
  return (
    <MxDialog
      title={language.t("orchestra.providers.connect")}
      description={language.t("orchestra.providers.picker.description")}
      bodyClass="providers-picker"
    >
      <div class="mx-table">
        <For each={props.entries}>
          {(entry) => (
            <div class="mx-row" data-provider-id={entry.id}>
              <ProviderBrand id={entry.id} />
              <div class="mx-grow">
                <strong>{entry.name}</strong>
                <Show when={summary(entry, language.t)}>{(text) => <small>{text()}</small>}</Show>
              </div>
              <button type="button" class="mx-btn" onClick={() => props.onConnect(entry)}>
                {language.t("common.connect")}
              </button>
            </div>
          )}
        </For>
      </div>
      <p class="mx-note">
        <button type="button" class="mx-btn" onClick={props.onCustom}>
          {language.t("dialog.provider.custom.label")}
        </button>
      </p>
    </MxDialog>
  )
}

export function ProviderConnectDialog(props: {
  id: string
  name: string
  directory: string
  onConnected: () => Promise<void>
}) {
  const language = useLanguage()
  const dialog = useDialog()
  const sdk = useServerSDK()
  const platform = usePlatform()
  const location = { directory: props.directory }
  const [integration] = createResource(() =>
    sdk()
      .api.integration.get({ integrationID: props.id, location })
      .then((result) => connectableIntegration(result.data)),
  )
  // Unsettled or failed reads must not suspend the chapter route; the API key method is the fallback.
  const loading = () => integration.state === "pending" || integration.state === "unresolved"
  const methods = createMemo(() => {
    const values = (integration.state === "ready" ? (integration()?.methods ?? []) : []).flatMap((method) =>
      method.type === "key" || method.type === "oauth" ? [method] : [],
    )
    return values.length ? values : [{ type: "key" as const }]
  })
  const [state, setState] = createStore({
    method: 0,
    key: "",
    code: "",
    answers: {} as Record<string, string>,
    error: undefined as string | undefined,
    busy: false,
    attempt: undefined as undefined | { attemptID: string; url: string; instructions: string; mode: "auto" | "code" },
  })
  const method = () => methods()[state.method] ?? methods()[0]
  const prompts = createMemo(() => {
    const current = method()
    return visiblePrompts(current.type === "oauth" ? (current.prompts ?? []) : [], state.answers)
  })
  const alive = { value: true, timer: undefined as ReturnType<typeof setTimeout> | undefined }
  onCleanup(() => {
    alive.value = false
    if (alive.timer) clearTimeout(alive.timer)
  })

  const fail = (error: unknown) =>
    setState({ busy: false, error: errorMessage(error, language.t("common.requestFailed")) })
  // A failed or expired automatic sign-in cannot be resumed; return to the method form so it can start again.
  const restart = (error: unknown) => {
    fail(error)
    setState("attempt", undefined)
  }
  const finish = async () => {
    await props.onConnected().catch(() => undefined)
    if (alive.value) dialog.close()
  }
  const poll = (attemptID: string) => {
    void sdk()
      .api.integration.oauth.status({ integrationID: props.id, attemptID, location })
      .then((result) => {
        if (!alive.value) return
        if (result.data.status === "complete") return finish()
        if (result.data.status === "failed") return restart(result.data.message)
        if (result.data.status === "expired") return restart(language.t("common.requestFailed"))
        alive.timer = setTimeout(() => poll(attemptID), 1_000)
      })
      .catch((error) => alive.value && restart(error))
  }

  const submit = async () => {
    const current = method()
    // Automatic sign-in completes by polling; Enter in its read-only code field must not submit an empty code.
    if (state.busy || state.attempt?.mode === "auto") return
    if (current.type === "key" && !state.key.trim()) {
      setState("error", language.t("orchestra.providers.connectDialog.keyRequired"))
      return
    }
    if (state.attempt?.mode === "code" && !state.code.trim()) {
      setState("error", language.t("orchestra.providers.connectDialog.codeRequired"))
      return
    }
    setState({ busy: true, error: undefined })
    if (current.type === "key") {
      await sdk()
        .api.integration.connect.key({ integrationID: props.id, location, key: state.key.trim() })
        .then(finish, fail)
      return
    }
    const attempt = state.attempt
    if (attempt) {
      await sdk()
        .api.integration.oauth.complete({
          integrationID: props.id,
          attemptID: attempt.attemptID,
          code: state.code,
          location,
        })
        .then(finish, fail)
      return
    }
    await sdk()
      .api.integration.oauth.connect({
        integrationID: props.id,
        methodID: current.id,
        inputs: prompts().values,
        location,
      })
      .then((result) => {
        if (!alive.value) return
        const url = authorizationURL(result.data.url)
        if (!url) return fail(language.t("orchestra.providers.connectDialog.badLink"))
        // The Orchestra console recognizes the desktop shell by its own OAuth client.
        if (props.id === "opencode" && platform.platform === "desktop")
          url.searchParams.set("client_id", "opencode-desktop")
        setState({ busy: false, attempt: { ...result.data, url: url.href } })
        if (result.data.mode === "auto") poll(result.data.attemptID)
      }, fail)
  }

  return (
    <MxDialog
      title={language.t("provider.connect.title", { provider: props.name })}
      description={language.t("orchestra.providers.connectDialog.description")}
      error={state.error}
      busy={state.busy || loading()}
      submit={state.attempt?.mode === "auto" ? undefined : language.t("orchestra.providers.connectDialog.submit")}
      onSubmit={() => void submit()}
    >
      <label class="mx-field">
        <span>{language.t("orchestra.providers.connectDialog.method")}</span>
        <select
          name="method"
          disabled={loading() || state.busy || !!state.attempt}
          onChange={(event) =>
            setState({ method: Number(event.currentTarget.value), error: undefined, attempt: undefined, code: "" })
          }
        >
          <For each={methods()}>
            {(item, index) => (
              <option value={String(index())} selected={index() === state.method}>
                {item.type === "oauth" ? item.label : language.t("provider.connect.method.apiKey")}
              </option>
            )}
          </For>
        </select>
      </label>
      <Show when={method().type === "key"}>
        <label class="mx-field">
          <span>{language.t("orchestra.providers.connectDialog.key")}</span>
          <input
            name="credential"
            type="password"
            autocomplete="off"
            spellcheck={false}
            value={state.key}
            onInput={(event) => setState({ key: event.currentTarget.value, error: undefined })}
          />
        </label>
      </Show>
      <Show when={method().type === "oauth" && !state.attempt}>
        <For each={prompts().shown}>
          {(prompt) => (
            <label class="mx-field">
              <span>{prompt.message}</span>
              <Show
                when={prompt.type === "select" ? prompt : undefined}
                fallback={
                  <input
                    name={prompt.key}
                    required
                    placeholder={prompt.type === "text" ? prompt.placeholder : undefined}
                    value={state.answers[prompt.key] ?? ""}
                    onInput={(event) => setState("answers", prompt.key, event.currentTarget.value)}
                  />
                }
              >
                {(select) => (
                  <select
                    name={select().key}
                    onChange={(event) => setState("answers", select().key, event.currentTarget.value)}
                  >
                    <For each={select().options}>
                      {(option) => (
                        <option value={option.value} selected={option.value === prompts().values[select().key]}>
                          {option.label}
                        </option>
                      )}
                    </For>
                  </select>
                )}
              </Show>
            </label>
          )}
        </For>
      </Show>
      <Show when={state.attempt}>
        {(attempt) => (
          <>
            <p class="mx-note providers-authorize">
              <ExternalLink href={attempt().url} class="mx-link">
                {language.t("orchestra.providers.connectDialog.authorize")}
              </ExternalLink>
            </p>
            <Show
              when={attempt().mode === "code"}
              fallback={
                <>
                  <label class="mx-field">
                    <span>{language.t("orchestra.providers.connectDialog.confirmation")}</span>
                    <input readOnly value={confirmation(attempt().instructions)} />
                  </label>
                  <p class="mx-note" role="status">
                    {language.t("orchestra.providers.connectDialog.waiting")}
                  </p>
                </>
              }
            >
              <label class="mx-field">
                <span>{language.t("orchestra.providers.connectDialog.code")}</span>
                <input
                  name="code"
                  autocomplete="off"
                  spellcheck={false}
                  value={state.code}
                  onInput={(event) => setState({ code: event.currentTarget.value, error: undefined })}
                />
              </label>
            </Show>
          </>
        )}
      </Show>
    </MxDialog>
  )
}

export function CustomProviderDialog(props: {
  unavailable?: string
  onSubmit: (input: { name: string; endpoint: string; model: string }) => Promise<string | undefined>
}) {
  const language = useLanguage()
  const dialog = useDialog()
  const [state, setState] = createStore({
    name: "",
    endpoint: "http://localhost:8080/v1",
    model: "",
    error: props.unavailable,
    busy: false,
  })
  const field = (name: "name" | "endpoint" | "model", label: string) => (
    <label class="mx-field">
      <span>{label}</span>
      <input
        name={name}
        required
        disabled={!!props.unavailable}
        value={state[name]}
        onInput={(event) => setState({ [name]: event.currentTarget.value, error: undefined })}
      />
    </label>
  )
  return (
    <MxDialog
      title={language.t("provider.custom.title")}
      description={language.t("orchestra.providers.custom.description")}
      error={state.error}
      busy={state.busy || !!props.unavailable}
      submit={language.t("orchestra.providers.connectDialog.submit")}
      onSubmit={async () => {
        if (state.busy || props.unavailable) return
        setState("busy", true)
        const error = await props.onSubmit({ name: state.name, endpoint: state.endpoint, model: state.model })
        setState({ busy: false, error })
        if (!error) dialog.close()
      }}
    >
      {field("name", language.t("orchestra.providers.custom.name"))}
      {field("endpoint", language.t("orchestra.providers.custom.endpoint"))}
      {field("model", language.t("orchestra.providers.custom.model"))}
    </MxDialog>
  )
}

export function ProviderConfirmDialog(props: {
  title: string
  description: string
  submit: string
  onConfirm: () => Promise<string | undefined>
}) {
  const dialog = useDialog()
  const [state, setState] = createStore({ busy: false, error: undefined as string | undefined })
  return (
    <MxDialog
      title={props.title}
      description={props.description}
      error={state.error}
      busy={state.busy}
      submit={props.submit}
      onSubmit={async () => {
        if (state.busy) return
        setState({ busy: true, error: undefined })
        const error = await props.onConfirm()
        setState({ busy: false, error })
        if (!error) dialog.close()
      }}
    />
  )
}

function summary(entry: CatalogEntry, t: ReturnType<typeof useLanguage>["t"]) {
  const note = noteKey(entry.id)
  if (note) return t(note)
  return entry.methods
    .map((method) => (method.type === "oauth" ? method.label : t("provider.connect.method.apiKey")))
    .join(" · ")
}

function confirmation(instructions: string) {
  return instructions.includes(":") ? (instructions.split(":").pop()?.trim() ?? instructions) : instructions
}
