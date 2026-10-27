import { Button } from "@orchestra/ui/button"
import { useDialog } from "@orchestra/ui/context/dialog"
import { Icon } from "@orchestra/ui/icon"
import { List } from "@orchestra/ui/list"
import { ProviderIcon } from "@orchestra/ui/provider-icon"
import { Spinner } from "@orchestra/ui/spinner"
import { TextField } from "@orchestra/ui/text-field"
import { ButtonV2 } from "@orchestra/ui/v2/button-v2"
import { DialogBody, DialogHeader, DialogTitle, DialogV2 } from "@orchestra/ui/v2/dialog-v2"
import { TextInputV2 } from "@orchestra/ui/v2/text-input-v2"
import { SecretInputV2 } from "@/components/secret-input-v2"
import { showToast } from "@/utils/toast"
import {
  type Accessor,
  type Component,
  createEffect,
  createMemo,
  createUniqueId,
  For,
  Match,
  onCleanup,
  onMount,
  Show,
  Switch,
} from "solid-js"
import { createStore } from "solid-js/store"
import { ExternalLink } from "@/components/external-link"
import { useServerSDK } from "@/context/server-sdk"
import { useLanguage } from "@/context/language"
import { useProviderDiscovery, useProviders } from "@/hooks/use-providers"
import { createProviderResource } from "@/hooks/provider-catalog"
import { formatServerError } from "@/utils/server-errors"
import { authorizationURL, connectableIntegration } from "@/orchestra/chapters/providers-data"
import { useClaudeMode } from "@/orchestra/use-claude-mode"
import { CustomProviderForm } from "./dialog-custom-provider"
import { createProviderConnectionState, formatError, type ConnectMethod } from "./provider-connection"

const CUSTOM_ID = "_custom"
// Not a provider: the first picker row enables Claude mode (Maestro on the user's Claude subscription).
const CLAUDE_MODE_ID = "_claude-mode"

export function useProviderConnectController(options: { onBack?: () => void } = {}) {
  const [store, setStore] = createStore({ selected: undefined as string | undefined })
  const reset = () => setStore("selected", undefined)

  return {
    selected: () => store.selected,
    select: (provider?: string) => setStore("selected", provider),
    back: options.onBack ?? reset,
  }
}

export const DialogConnectProvider: Component<{
  directory?: Accessor<string | null | undefined>
  controller?: ReturnType<typeof useProviderConnectController>
}> = (props) => {
  const fallback = useProviderConnectController()
  const controller = props.controller ?? fallback
  const language = useLanguage()
  const sdk = useServerSDK()
  // Back returns to the provider list from anything picked in it, and to wherever the dialog was opened from
  // (`controller.back`) when it opened straight on a provider.
  const picked = { value: false }
  const leave = () => (picked.value ? controller.select(undefined) : controller.back())
  const back = { current: leave }
  let focusHost: HTMLDivElement | undefined
  const holdFocus = () => focusHost?.focus({ preventScroll: true })
  const select = (provider?: string) => {
    picked.value = true
    back.current = leave
    controller.select(provider)
  }

  function Content() {
    return (
      <Switch>
        <Match when={controller.selected() === CUSTOM_ID}>
          <CustomProviderForm autofocus={false} />
        </Match>
        <Match when={controller.selected() && controller.selected() !== CUSTOM_ID ? controller.selected() : undefined}>
          {(provider) => (
            <ProviderConnection
              provider={provider()}
              directory={props.directory}
              onBack={leave}
              setBack={(handler) => (back.current = handler)}
            />
          )}
        </Match>
        <Match when={true}>
          <ProviderPickerV2 directory={props.directory} onSelect={select} onPrepare={holdFocus} />
        </Match>
      </Switch>
    )
  }

  return (
    <DialogV2
      containerClass="!h-[min(calc(100vh_-_16px),512px)] !w-[min(calc(100vw_-_16px),640px)]"
      class="[font-family:var(--v2-font-family-sans)] [&_[data-slot=dialog-header]]:!px-5 [&_[data-slot=dialog-header-title]]:!text-[15px] [&_[data-slot=dialog-header-title]]:!tracking-[-0.13px]"
    >
      <DialogHeader closeLabel={language.t("common.close")}>
        <Show
          when={controller.selected()}
          fallback={<DialogTitle>{language.t("command.provider.connect")}</DialogTitle>}
        >
          <button
            type="button"
            class="flex size-5 items-center justify-center rounded-sm text-v2-icon-icon-muted hover:bg-v2-overlay-simple-overlay-hover focus-visible:bg-v2-overlay-simple-overlay-hover focus-visible:outline-none"
            onClick={() => back.current()}
            aria-label={language.t("common.goBack")}
          >
            <Icon name="arrow-left" size="small" />
          </button>
        </Show>
      </DialogHeader>
      <DialogBody class="min-h-0 flex-1 overflow-hidden px-2 pb-2">
        <div ref={focusHost} tabIndex={-1} class="flex min-h-0 flex-1 flex-col outline-none">
          <Show when={sdk()} keyed>
            {(_client) => <Content />}
          </Show>
        </div>
      </DialogBody>
    </DialogV2>
  )
}

function ProviderPickerV2(props: {
  directory?: Accessor<string | null | undefined>
  onSelect: (provider: string) => void
  onPrepare?: () => void
}) {
  const providers = useProviderDiscovery(props.directory)
  const language = useLanguage()
  const claudeMode = useClaudeMode(() => props.directory?.())
  const [store, setStore] = createStore({
    filter: "",
    active: undefined as string | undefined,
    connecting: undefined as string | undefined,
  })
  const featured = [CLAUDE_MODE_ID, "anthropic", "openai", "google", "openrouter", "vercel"]
  const all = createMemo(() => {
    language.locale()
    const query = store.filter.trim().toLowerCase()
    const values = [
      { id: CLAUDE_MODE_ID, name: language.t("orchestra.providers.claudeMode.use") },
      ...providers.all(),
    ]
    if (!query) return values
    return values.filter((provider) => `${provider.id} ${provider.name}`.toLowerCase().includes(query))
  })
  const popular = createMemo(() =>
    all()
      .filter((provider) => featured.includes(provider.id))
      .sort((a, b) => featured.indexOf(a.id) - featured.indexOf(b.id)),
  )
  const other = createMemo(() =>
    all()
      .filter((provider) => !featured.includes(provider.id))
      .sort((a, b) => {
        if (a.id === CUSTOM_ID) return -1
        if (b.id === CUSTOM_ID) return 1
        return a.name.localeCompare(b.name)
      }),
  )
  const rows = createMemo(() => [...popular(), ...other()])
  let picker: HTMLDivElement | undefined
  let search: HTMLInputElement | undefined

  onMount(() => search?.focus({ preventScroll: true }))

  const connect = (provider: string) => {
    if (provider === CLAUDE_MODE_ID) return void claudeMode()
    props.onPrepare?.()
    props.onSelect(provider)
  }

  const move = (event: KeyboardEvent, direction: number) => {
    const items = rows()
    if (items.length === 0) return
    const index = items.findIndex((provider) => provider.id === store.active)
    const next = index < 0 ? (direction > 0 ? 0 : items.length - 1) : (index + direction + items.length) % items.length
    setStore("active", items[next].id)
    picker
      ?.querySelector<HTMLElement>(`[data-provider-id="${CSS.escape(items[next].id)}"]`)
      ?.focus({ preventScroll: true })
    event.preventDefault()
  }

  const handleKeyDown = (event: KeyboardEvent) => {
    if (event.key === "ArrowDown") return move(event, 1)
    if (event.key === "ArrowUp") return move(event, -1)
    if (event.key !== "Enter" || !store.active) return
    connect(store.active)
    event.preventDefault()
  }

  return (
    <div ref={picker} class="flex min-h-0 flex-1 flex-col gap-4" onKeyDown={handleKeyDown}>
      <div class="shrink-0 px-1 pt-px">
        <TextInputV2
          ref={search}
          type="search"
          class="!w-full [font-family:var(--v2-font-family-sans)]"
          leadingIcon={<Icon name="magnifying-glass" size="small" />}
          placeholder={language.t("dialog.provider.search.placeholder")}
          value={store.filter}
          onInput={(event) => {
            setStore({ filter: event.currentTarget.value, active: undefined })
          }}
        />
      </div>
      <Show when={providers.error()}>
        {(error) => <ProviderLoadError error={error().cause} retry={providers.retry} />}
      </Show>
      <div class="relative min-h-0 flex-1">
        <div class="flex size-full min-h-0 flex-col gap-4 overflow-y-auto pb-8 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <For
            each={[
              { title: language.t("dialog.provider.group.popular"), items: popular },
              { title: language.t("dialog.provider.group.other"), items: other },
            ]}
          >
            {(group) => (
              <Show when={group.items().length > 0}>
                <section class="flex flex-col">
                  <div class="px-3 pb-2 text-[13px] font-[440] leading-none tracking-[-0.04px] text-v2-text-text-muted">
                    {group.title}
                  </div>
                  <For each={group.items()}>
                    {(provider) => (
                      <button
                        type="button"
                        data-provider-id={provider.id}
                        class="flex min-h-9 w-full items-center gap-2 rounded-md px-3 py-2.5 text-left text-[13px] leading-none tracking-[-0.04px] hover:bg-v2-overlay-simple-overlay-hover focus:bg-v2-overlay-simple-overlay-hover focus:outline-none"
                        classList={{ "bg-v2-overlay-simple-overlay-hover": store.active === provider.id }}
                        onMouseEnter={() => setStore("active", provider.id)}
                        disabled={store.connecting !== undefined}
                        aria-busy={store.connecting === provider.id}
                        onClick={() => connect(provider.id)}
                      >
                        <ProviderIcon
                          id={provider.id === CLAUDE_MODE_ID ? "anthropic" : provider.id}
                          class="size-4 shrink-0 text-v2-icon-icon-base"
                        />
                        <span class="min-w-0 truncate font-[530] text-v2-text-text-base">{provider.name}</span>
                        <Show when={provider.id === CUSTOM_ID}>
                          <span class="flex h-4 shrink-0 items-center rounded-xs border-[0.5px] border-v2-border-border-base bg-v2-background-bg-layer-03 px-1 text-[11px] font-[530] leading-none tracking-[0.05px] text-v2-text-text-muted">
                            {language.t("settings.providers.tag.custom")}
                          </span>
                        </Show>
                        <Show when={store.connecting === provider.id}>
                          <Spinner class="ml-auto size-4 shrink-0 text-v2-icon-icon-muted" />
                        </Show>
                      </button>
                    )}
                  </For>
                </section>
              </Show>
            )}
          </For>
          <Show when={rows().length === 0}>
            <div class="flex h-24 items-center justify-center text-[13px] font-[440] text-v2-text-text-muted">
              {language.t("dialog.provider.empty")}
            </div>
          </Show>
        </div>
        <div
          class="pointer-events-none absolute inset-x-0 bottom-0 h-10"
          style={{ background: "linear-gradient(to bottom, transparent, var(--v2-background-bg-layer-01))" }}
        />
      </div>
    </div>
  )
}

function ProviderConnection(props: {
  provider: string
  directory?: Accessor<string | null | undefined>
  onBack: () => void
  setBack: (handler: () => void) => void
}) {
  const dialog = useDialog()
  const serverSDK = useServerSDK()
  const language = useLanguage()
  const providers = useProviders(props.directory)
  const directory = providers.directory
  const location = () => {
    const value = directory()
    return value ? { directory: value } : undefined
  }

  const alive = { value: true }
  const timer = { current: undefined as ReturnType<typeof setTimeout> | undefined }

  onCleanup(() => {
    alive.value = false
    if (timer.current === undefined) return
    clearTimeout(timer.current)
    timer.current = undefined
  })

  // Releases the server's sign-in attempt (and the local port its listener holds); a finished attempt ignores it.
  const cancelAttempt = (attemptID: string) =>
    void serverSDK()
      .api.integration.oauth.cancel({ integrationID: props.provider, attemptID, location: location() })
      .catch(() => undefined)

  const provider = () => providers.all().get(props.provider) ?? { name: integration.data()?.name ?? props.provider }
  const fallback = createMemo<ConnectMethod[]>(() => [
    {
      type: "key" as const,
      label: language.t("provider.connect.method.apiKey"),
    },
  ])
  const integration = createProviderResource(
    () => {
      const client = serverSDK()
      return directory() === undefined
        ? undefined
        : { provider: props.provider, directory: directory(), client, server: client.scope }
    },
    (input) =>
      input.client.api.integration
        .get({
          integrationID: input.provider,
          location: input.directory ? { directory: input.directory } : undefined,
        })
        .then((result) => connectableIntegration(result.data)),
  )
  const loading = createMemo(() => integration.loading() || directory() === undefined)
  const methods = createMemo<ConnectMethod[]>(() => {
    const values = integration
      .data()
      ?.methods.filter((method): method is ConnectMethod => method.type === "key" || method.type === "oauth")
    return values?.length ? values : fallback()
  })
  const [store, setStore, dispatch, method, , methodDetails] = createProviderConnectionState(methods, language.t)

  async function selectMethod(index: number, inputs?: Record<string, string>) {
    if (timer.current !== undefined) {
      clearTimeout(timer.current)
      timer.current = undefined
    }

    const method = methods()[index]
    dispatch({ type: "method.select", index })

    if (method.type === "oauth") {
      if (method.prompts?.length && !inputs) {
        dispatch({ type: "auth.prompt" })
        return
      }
      dispatch({ type: "auth.pending" })
      await serverSDK()
        .api.integration.oauth.connect({
          integrationID: props.provider,
          methodID: method.id,
          inputs: inputs ?? {},
          location: location(),
        })
        .then((x) => {
          if (!alive.value) return cancelAttempt(x.data.attemptID)
          // Only a web link from the server becomes the authorization target.
          const url = authorizationURL(x.data.url)
          if (!url) {
            dispatch({ type: "auth.error", error: language.t("orchestra.providers.connectDialog.badLink") })
            return
          }
          dispatch({ type: "auth.complete", authorization: { ...x.data, url: url.href } })
        })
        .catch((e) => {
          if (!alive.value) return
          dispatch({ type: "auth.error", error: formatError(e, language.t("orchestra.providers.oauth.failed")) })
        })
    }
  }

  function AuthPromptsView() {
    const [formStore, setFormStore] = createStore({
      value: {} as Record<string, string>,
      index: 0,
    })

    const prompts = createMemo(() => {
      const value = method()
      return value?.type === "oauth" ? (value.prompts ?? []) : []
    })
    const matches = (prompt: NonNullable<ReturnType<typeof prompts>[number]>, value: Record<string, string>) => {
      if (!prompt.when) return true
      const actual = value[prompt.when.key]
      if (actual === undefined) return false
      return prompt.when.op === "eq" ? actual === prompt.when.value : actual !== prompt.when.value
    }
    const current = createMemo(() => {
      const all = prompts()
      const index = all.findIndex((prompt, index) => index >= formStore.index && matches(prompt, formStore.value))
      if (index === -1) return
      return {
        index,
        prompt: all[index],
      }
    })
    const valid = createMemo(() => {
      const item = current()
      if (!item || item.prompt.type !== "text") return false
      const value = formStore.value[item.prompt.key] ?? ""
      return value.trim().length > 0
    })

    async function next(index: number, value: Record<string, string>) {
      if (store.methodIndex === undefined) return
      const next = prompts().findIndex((prompt, i) => i > index && matches(prompt, value))
      if (next !== -1) {
        setFormStore("index", next)
        return
      }
      await selectMethod(store.methodIndex, value)
    }

    async function handleSubmit(e: SubmitEvent) {
      e.preventDefault()
      const item = current()
      if (!item || item.prompt.type !== "text") return
      if (!valid()) return
      await next(item.index, formStore.value)
    }

    const item = () => current()
    const text = createMemo(() => {
      const prompt = item()?.prompt
      if (!prompt || prompt.type !== "text") return
      return prompt
    })
    const select = createMemo(() => {
      const prompt = item()?.prompt
      if (!prompt || prompt.type !== "select") return
      return prompt
    })

    return (
      <form onSubmit={handleSubmit} class="flex flex-col items-start gap-4">
        <Switch>
          <Match when={item()?.prompt.type === "text"}>
            <TextField
              type="text"
              label={text()?.message ?? ""}
              placeholder={text()?.placeholder}
              value={text() ? (formStore.value[text()!.key] ?? "") : ""}
              onChange={(value) => {
                const prompt = text()
                if (!prompt) return
                setFormStore("value", prompt.key, value)
              }}
            />
            <Button class="w-auto" type="submit" size="large" variant="primary" disabled={!valid()}>
              {language.t("common.continue")}
            </Button>
          </Match>
          <Match when={item()?.prompt.type === "select"}>
            <div class="w-full flex flex-col gap-1.5">
              <div class="text-14-regular text-text-base">{select()?.message}</div>
              <div>
                <List
                  class="px-3"
                  items={select()?.options ?? []}
                  key={(x) => x.value}
                  current={select()?.options.find((x) => x.value === formStore.value[select()!.key])}
                  onSelect={(value) => {
                    if (!value) return
                    const prompt = select()
                    if (!prompt) return
                    const nextValue = {
                      ...formStore.value,
                      [prompt.key]: value.value,
                    }
                    setFormStore("value", prompt.key, value.value)
                    void next(item()!.index, nextValue)
                  }}
                >
                  {(option) => (
                    <div class="w-full flex items-center gap-x-2">
                      <div class="w-4 h-2 rounded-[1px] bg-input-base shadow-xs-border-base flex items-center justify-center">
                        <div class="w-2.5 h-0.5 ml-0 bg-icon-strong-base hidden" data-slot="list-item-extra-icon" />
                      </div>
                      <span>{option.label}</span>
                      <span class="text-14-regular text-text-weak">{option.hint}</span>
                    </div>
                  )}
                </List>
              </div>
            </div>
          </Match>
        </Switch>
      </form>
    )
  }

  let auto = false
  // A stored API key is only verified by the first request, so its toast must not claim the provider works.
  let keySaved = false
  createEffect(() => {
    if (auto) return
    if (loading() || integration.error()) return
    if (methods().length === 1) {
      auto = true
      void selectMethod(0)
    }
  })

  async function complete() {
    if (!alive.value) return
    setStore("connected", true)
    dispatch({ type: "auth.pending" })
    const refreshed = await providers.refresh().then(
      () => true,
      (error) => {
        dispatch({ type: "auth.error", error: formatError(error, language.t("common.requestFailed")) })
        return false
      },
    )
    if (!refreshed || !alive.value) return
    dialog.close()
    showToast({
      variant: "success",
      icon: "circle-check",
      title: keySaved
        ? language.t("orchestra.providers.connectDialog.keySaved.title", { provider: provider().name })
        : language.t("provider.connect.toast.connected.title", { provider: provider().name }),
      description: keySaved
        ? language.t("orchestra.providers.connectDialog.keySaved.description")
        : language.t("provider.connect.toast.connected.description", { provider: provider().name }),
    })
  }

  function goBack() {
    if (methods().length > 1 && store.methodIndex !== undefined) {
      dispatch({ type: "method.reset" })
      return
    }
    props.onBack()
  }

  props.setBack(goBack)

  function MethodSelection() {
    return (
      <div class="flex flex-col gap-2">
        <div class="px-3 text-[13px] font-[440] leading-5 tracking-[-0.04px] text-v2-text-text-muted">
          {language.t("provider.connect.selectMethod", { provider: provider().name })}
        </div>
        <div class="flex flex-col">
          <For each={methods()}>
            {(item, index) => {
              const details = () => methodDetails(item)
              return (
                <button
                  type="button"
                  class="group flex h-9 w-full items-center gap-2 rounded-md px-3 text-left text-[13px] leading-5 tracking-[-0.04px] hover:bg-v2-overlay-simple-overlay-hover focus-visible:bg-v2-overlay-simple-overlay-hover focus-visible:outline-none"
                  onClick={() => void selectMethod(index())}
                >
                  <span class="flex h-2 w-4 shrink-0 items-center justify-center rounded-[1px] bg-v2-background-bg-base shadow-[var(--v2-elevation-button-neutral)]">
                    <span class="hidden h-0.5 w-2.5 bg-v2-icon-icon-base group-hover:block group-focus-visible:block" />
                  </span>
                  <span class="font-[530] text-v2-text-text-base">{details().label}</span>
                  <Show when={details().hint}>
                    {(hint) => <span class="font-[440] text-v2-text-text-muted">{hint()}</span>}
                  </Show>
                </button>
              )
            }}
          </For>
        </div>
      </div>
    )
  }

  function ApiAuthView() {
    let apiKey: HTMLInputElement | undefined
    let labelInput: HTMLInputElement | undefined
    const errorID = createUniqueId()
    const [formStore, setFormStore] = createStore({
      value: "",
      label: "",
      error: undefined as string | undefined,
      pending: false,
    })

    onMount(() => apiKey?.focus({ preventScroll: true }))

    async function handleSubmit(e: SubmitEvent) {
      e.preventDefault()
      if (formStore.pending) return

      const form = e.currentTarget as HTMLFormElement
      const formData = new FormData(form)
      const apiKey = formData.get("apiKey") as string
      const label = formData.get("label") as string

      if (!apiKey?.trim()) {
        setFormStore("error", language.t("provider.connect.apiKey.required"))
        return
      }

      setFormStore({ error: undefined, pending: true })
      await serverSDK()
        .api.integration.connect.key({
          integrationID: props.provider,
          location: location(),
          key: apiKey.trim(),
          label: label || undefined,
        })
        .then(() => {
          keySaved = true
          return complete()
        })
        .catch((error) => setFormStore("error", formatError(error, language.t("common.requestFailed"))))
        .finally(() => setFormStore("pending", false))
    }

    return (
      <div class="flex flex-col gap-5 px-3 text-[13px] font-[440] leading-5 tracking-[-0.04px] text-v2-text-text-muted">
        {language.t("provider.connect.apiKey.description", { provider: provider().name })}
        <form onSubmit={handleSubmit} class="flex flex-col items-start gap-5 self-stretch">
          <SecretInputV2
            ref={apiKey}
            label={language.t("provider.connect.apiKey.label", { provider: provider().name })}
            name="apiKey"
            data-input="provider-api-key"
            placeholder={language.t("provider.connect.apiKey.placeholder")}
            value={formStore.value}
            invalid={formStore.error !== undefined}
            aria-describedby={formStore.error ? errorID : undefined}
            autocomplete="off"
            spellcheck={false}
            onInput={(event) => setFormStore("value", event.currentTarget.value)}
          />
          <label class="flex w-full flex-col gap-1 font-[530] leading-4 text-v2-text-text-base">
            {language.t("provider.connect.apiKey.labelOptional")}
            <TextInputV2
              ref={labelInput}
              class="!w-full"
              name="label"
              placeholder={language.t("provider.connect.apiKey.labelPlaceholder")}
              value={formStore.label}
              onInput={(event) => setFormStore("label", event.currentTarget.value)}
            />
          </label>
          <Show when={formStore.error}>
            {(error) => (
              <div id={errorID} role="alert" class="-mt-4 text-xs text-v2-state-fg-danger">
                {error()}
              </div>
            )}
          </Show>
          <ButtonV2 type="submit" variant="contrast" data-action="provider-connect-submit" disabled={formStore.pending}>
            {language.t("common.continue")}
          </ButtonV2>
        </form>
      </div>
    )
  }

  function OAuthCodeView() {
    let codeInput: HTMLInputElement | undefined
    const errorID = createUniqueId()
    const [formStore, setFormStore] = createStore({
      value: "",
      error: undefined as string | undefined,
    })

    onMount(() => codeInput?.focus({ preventScroll: true }))

    async function handleSubmit(e: SubmitEvent) {
      e.preventDefault()

      const form = e.currentTarget as HTMLFormElement
      const formData = new FormData(form)
      const code = formData.get("code") as string

      if (!code?.trim()) {
        setFormStore("error", language.t("provider.connect.oauth.code.required"))
        return
      }

      setFormStore("error", undefined)
      const result = await serverSDK()
        .api.integration.oauth.complete({
          integrationID: props.provider,
          attemptID: store.authorization!.attemptID,
          location: location(),
          code,
        })
        .then(() => ({ ok: true as const }))
        .catch((error) => ({ ok: false as const, error }))
      if (result.ok) {
        await complete()
        return
      }
      setFormStore("error", formatError(result.error, language.t("provider.connect.oauth.code.invalid")))
    }

    return (
      <div class="flex flex-col gap-5 px-3 text-[13px] font-[440] leading-5 tracking-[-0.04px] text-v2-text-text-muted">
        <div>
          {language.t("provider.connect.oauth.code.visit.prefix")}
          <ExternalLink href={store.authorization!.url} class="text-v2-text-text-base">
            {language.t("provider.connect.oauth.code.visit.link")}
          </ExternalLink>
          {language.t("provider.connect.oauth.code.visit.suffix", { provider: provider().name })}
        </div>
        <form onSubmit={handleSubmit} class="flex flex-col items-start gap-5 self-stretch">
          <label class="flex w-full flex-col gap-1 font-[530] leading-4 text-v2-text-text-base">
            {language.t("provider.connect.oauth.code.label", { method: method()?.label ?? "" })}
            <TextInputV2
              ref={codeInput}
              class="!w-full"
              name="code"
              placeholder={language.t("provider.connect.oauth.code.placeholder")}
              value={formStore.value}
              invalid={formStore.error !== undefined}
              aria-describedby={formStore.error ? errorID : undefined}
              autocomplete="off"
              spellcheck={false}
              onInput={(event) => setFormStore("value", event.currentTarget.value)}
            />
          </label>
          <Show when={formStore.error}>
            {(error) => (
              <div id={errorID} role="alert" class="-mt-4 text-xs text-v2-state-fg-danger">
                {error()}
              </div>
            )}
          </Show>
          <ButtonV2 type="submit" variant="contrast">
            {language.t("common.continue")}
          </ButtonV2>
        </form>
      </div>
    )
  }

  function OAuthAutoView() {
    const code = createMemo(() => {
      const instructions = store.authorization?.instructions
      if (instructions?.includes(":")) {
        return instructions.split(":").pop()?.trim()
      }
      return instructions
    })

    // Cancel leaves this view while a status request may still be in flight; its answer must be ignored.
    const polling = { active: true }
    onCleanup(() => {
      polling.active = false
      // Cancel, back and closing the dialog all end here; a completed attempt is already terminal and ignores this.
      const attemptID = store.authorization?.attemptID
      if (attemptID) cancelAttempt(attemptID)
      if (timer.current === undefined) return
      clearTimeout(timer.current)
      timer.current = undefined
    })

    onMount(() => {
      const poll = async (failures = 0) => {
        const authorization = store.authorization
        if (!authorization || !alive.value || !polling.active) return
        const result = await serverSDK()
          .api.integration.oauth.status({
            integrationID: props.provider,
            attemptID: authorization.attemptID,
            location: location(),
          })
          .then((value) => ({ ok: true as const, status: value.data }))
          .catch((error) => ({ ok: false as const, error }))
        if (!alive.value || !polling.active) return
        // One dropped request must not end a sign-in the person is still completing in the browser.
        if (!result.ok && failures < 2) {
          timer.current = setTimeout(() => poll(failures + 1), 1_000)
          return
        }
        if (!result.ok) {
          dispatch({
            type: "auth.error",
            error: formatError(result.error, language.t("orchestra.providers.oauth.failed")),
          })
          return
        }
        if (result.status.status === "complete") {
          await complete()
          return
        }
        if (result.status.status === "failed") {
          dispatch({
            type: "auth.error",
            error: result.status.message || language.t("orchestra.providers.oauth.failed"),
          })
          return
        }
        if (result.status.status === "expired") {
          dispatch({ type: "auth.error", error: language.t("orchestra.providers.oauth.expired") })
          return
        }
        timer.current = setTimeout(() => poll(), 1_000)
      }
      void poll()
    })

    return (
      <div class="flex flex-col gap-6">
        <div class="text-14-regular text-text-base">
          {language.t("provider.connect.oauth.auto.visit.prefix")}
          <ExternalLink href={store.authorization!.url}>
            {language.t("provider.connect.oauth.auto.visit.link")}
          </ExternalLink>
          {language.t("provider.connect.oauth.auto.visit.suffix", { provider: provider().name })}
        </div>
        <TextField
          label={language.t("provider.connect.oauth.auto.confirmationCode")}
          class="font-mono"
          value={code()}
          readOnly
          copyable
        />
        <div class="text-14-regular text-text-base flex items-center gap-4">
          <Spinner />
          <span>{language.t("provider.connect.status.waiting")}</span>
        </div>
        <ButtonV2 class="self-start" onClick={goBack}>
          {language.t("common.cancel")}
        </ButtonV2>
      </div>
    )
  }

  return (
    <div class="flex min-h-0 flex-1 flex-col">
      <div class="flex h-10 shrink-0 items-start gap-2 px-3">
        <ProviderIcon id={props.provider} class="mt-0.5 size-4 shrink-0 text-v2-icon-icon-base" />
        <div class="text-[15px] font-[530] leading-5 tracking-[-0.13px] text-v2-text-text-base">
          <Switch>
            <Match when={props.provider === "anthropic" && method()?.label?.toLowerCase().includes("max")}>
              {language.t("provider.connect.title.anthropicProMax")}
            </Match>
            <Match when={true}>{language.t("provider.connect.title", { provider: provider().name })}</Match>
          </Switch>
        </div>
      </div>
      <div class="flex min-h-0 flex-1 flex-col">
        <div>
          <Switch>
            <Match when={loading()}>
              <div class="text-14-regular text-text-base">
                <div class="flex items-center gap-x-2">
                  <Spinner />
                  <span>{language.t("provider.connect.status.inProgress")}</span>
                </div>
              </div>
            </Match>
            <Match when={integration.error()}>
              {(error) => <ProviderLoadError error={error().cause} retry={integration.retry} />}
            </Match>
            <Match when={store.methodIndex === undefined}>
              <MethodSelection />
            </Match>
            <Match when={store.state === "pending"}>
              <div class="text-14-regular text-text-base">
                <div class="flex items-center gap-x-2">
                  <Spinner />
                  <span>{language.t("provider.connect.status.inProgress")}</span>
                </div>
              </div>
            </Match>
            <Match when={store.state === "prompt"}>
              <AuthPromptsView />
            </Match>
            <Match when={store.state === "error"}>
              <div class="text-14-regular text-text-base">
                <div class="flex items-center gap-x-2">
                  <Icon name="circle-ban-sign" class="text-icon-critical-base" />
                  <span>{language.t("provider.connect.status.failed", { error: store.error ?? "" })}</span>
                </div>
                {/* A stored sign-in only needs its refresh repeated; a failed attempt starts over. */}
                <div class="mt-3 flex flex-col">
                  <ButtonV2
                    class="self-start"
                    onClick={() => void (store.connected ? complete() : selectMethod(store.methodIndex ?? 0))}
                  >
                    {language.t("orchestra.providers.retry")}
                  </ButtonV2>
                </div>
              </div>
            </Match>
            <Match when={method()?.type === "key"}>
              <ApiAuthView />
            </Match>
            <Match when={method()?.type === "oauth"}>
              <Switch>
                <Match when={store.authorization?.mode === "code"}>
                  <OAuthCodeView />
                </Match>
                <Match when={store.authorization?.mode === "auto"}>
                  <OAuthAutoView />
                </Match>
              </Switch>
            </Match>
          </Switch>
        </div>
      </div>
    </div>
  )
}

function ProviderLoadError(props: { error: unknown; retry: () => unknown }) {
  const language = useLanguage()
  return (
    <div class="flex flex-col gap-3 px-3 py-2">
      <p role="alert">{formatServerError(props.error, language.t, language.t("common.requestFailed"))}</p>
      <ButtonV2 onClick={() => void props.retry()}>{language.t("orchestra.providers.retry")}</ButtonV2>
    </div>
  )
}
