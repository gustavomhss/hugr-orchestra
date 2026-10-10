import { createEffect, For, onCleanup, Show } from "solid-js"
import { createStore } from "solid-js/store"
import { useLanguage } from "@/context/language"
import type { Model } from "./integrations-contract"
import { IntegrationsDialog, type IntegrationForm } from "./integrations-dialogs"
import { MxBadge, MxPage } from "./kit"
import "./integrations.css"

export function IntegrationsScreen(props: { model: Model; basic: boolean; onAuthorize: (bearer: string) => void }) {
  const language = useLanguage()
  const [state, setState] = createStore({
    form: undefined as IntegrationForm | undefined,
    sessionID: undefined as string | undefined,
    opener: undefined as HTMLButtonElement | undefined,
    accounts: [] as string[],
    targets: [] as string[],
    bindings: [] as string[],
  })
  const focus = { active: true, epoch: 0, heading: undefined as HTMLHeadingElement | undefined }
  // Keep DOM keys through temporary empty refresh windows. Missing live rows stay hidden; no DTO is cached.
  createEffect(() => {
    const accounts = props.model.state.connections.map((item) => item.connection.id)
    const targets = props.model.state.targets.map((item) => item.target.id)
    const bindings = props.model.state.bindings.map((item) => item.sessionID)
    const busy = props.model.state.busy
    setState("accounts", (previous) => (busy ? [...new Set([...previous, ...accounts])] : accounts))
    setState("targets", (previous) => (busy ? [...new Set([...previous, ...targets])] : targets))
    setState("bindings", (previous) => (busy ? [...new Set([...previous, ...bindings])] : bindings))
  })
  const auth = { current: undefined as HTMLFormElement | undefined }
  onCleanup(() => {
    auth.current?.reset()
    focus.active = false
    focus.epoch++
    if (props.model.state.busy || props.model.state.retryable) props.model.cancel()
  })
  const disabled = () => props.model.state.busy || props.model.state.status === "loading"
  const account = () =>
    props.model.state.connections.find((item) => item.connection.id === props.model.state.connectionID)
  const target = () => props.model.state.targets.find((item) => item.target.id === props.model.state.targetID)
  const open = (form: IntegrationForm, opener: HTMLButtonElement, sessionID?: string) => {
    focus.epoch++
    setState({ form, opener, sessionID })
  }
  return (
    <MxPage
      id="orchestra-integrations"
      title={language.t("orchestra.integrations.title")}
      description={language.t("orchestra.integrations.description")}
      action={
        <button
          type="button"
          class="mx-btn primary"
          disabled={disabled()}
          onClick={(event) => open("connect", event.currentTarget)}
        >
          {language.t("orchestra.integrations.connect")}
        </button>
      }
    >
      <div class="integrations-screen" aria-busy={props.model.state.busy}>
        <p class="mx-note">{language.t("orchestra.integrations.supported")}</p>
        <Show when={!props.basic}>
          <form
            class="integrations-auth"
            ref={(element) => {
              auth.current = element
            }}
            autocomplete="off"
            onSubmit={(event) => {
              event.preventDefault()
              if (props.basic || disabled()) return
              const bearer = String(new FormData(event.currentTarget).get("bearer") ?? "")
              event.currentTarget.reset()
              props.onAuthorize(bearer)
            }}
          >
            <h2>{language.t("orchestra.integrations.auth")}</h2>
            <label class="mx-field">
              <span>{language.t("orchestra.integrations.bearer")}</span>
              <input name="bearer" type="password" dir="ltr" required autocomplete="off" disabled={disabled()} />
            </label>
            <p class="mx-note">{language.t("orchestra.integrations.authHint")}</p>
            <button type="submit" class="mx-btn" disabled={disabled()}>
              {language.t("orchestra.integrations.applyAuth")}
            </button>
            <button type="button" class="mx-btn" onClick={() => auth.current?.reset()}>
              {language.t("orchestra.integrations.cancel")}
            </button>
          </form>
        </Show>
        <div class="integrations-controls">
          <Show when={!props.model.state.readRetryable}>
            <button type="button" class="mx-btn" disabled={disabled()} onClick={() => void props.model.load()}>
              {language.t("orchestra.integrations.refresh")}
            </button>
          </Show>
          <Show when={props.model.state.after}>
            <button type="button" class="mx-btn" disabled={disabled()} onClick={() => void props.model.load(true)}>
              {language.t("orchestra.integrations.more")}
            </button>
          </Show>
        </div>
        <Show when={props.model.state.status === "loading"}>
          <p role="status">{language.t("orchestra.integrations.loading")}</p>
        </Show>
        <Show when={props.model.state.busy}>
          <div class="integrations-controls">
            <p role="status">{language.t("orchestra.integrations.busy")}</p>
            <button type="button" class="mx-btn" onClick={() => props.model.cancel()}>
              {language.t("orchestra.integrations.cancel")}
            </button>
          </div>
        </Show>
        <Show when={props.model.state.failure || (props.model.state.status === "error" && !props.model.state.busy)}>
          <div role="alert" class="mx-error integrations-controls">
            <p>{language.t(`orchestra.integrations.error.${props.model.state.failure ?? "request"}`)}</p>
            <Show when={props.model.state.retryable}>
              <button type="button" class="mx-btn" disabled={disabled()} onClick={() => void props.model.retry()}>
                {language.t("orchestra.integrations.retry")}
              </button>
              <button type="button" class="mx-btn" disabled={disabled()} onClick={() => props.model.cancel()}>
                {language.t("orchestra.integrations.cancel")}
              </button>
            </Show>
            <Show when={props.model.state.readRetryable}>
              <button type="button" class="mx-btn" disabled={disabled()} onClick={() => void props.model.retryRead()}>
                {language.t("orchestra.integrations.refresh")}
              </button>
            </Show>
          </div>
        </Show>
        <Show when={props.model.state.receipt}>
          {(receipt) => (
            <p role="status">
              {language.t(receipt().reused ? "orchestra.integrations.reused" : "orchestra.integrations.saved")}
            </p>
          )}
        </Show>
        <Show when={props.model.state.status === "ready"}>
          <p class="mx-note">{language.t("orchestra.integrations.live")}</p>
          <Show when={!props.model.state.connections.length}>
            <p role="status">{language.t("orchestra.integrations.empty")}</p>
          </Show>
        </Show>
        <h2
          id="integrations-accounts-title"
          tabindex={-1}
          ref={(element) => {
            focus.heading = element
          }}
        >
          {language.t("orchestra.integrations.accounts")}
        </h2>
        <ul class="integrations-list" aria-labelledby="integrations-accounts-title">
          <For each={state.accounts}>
            {(id) => {
              const item = () => props.model.state.connections.find((item) => item.connection.id === id)
              return (
                <li class="mx-card" hidden={!item()}>
                  <button
                    type="button"
                    class="mx-btn integrations-select"
                    disabled={disabled() || !item()}
                    aria-pressed={id === props.model.state.connectionID}
                    onClick={() => {
                      const current = item()
                      if (!current) return
                      focus.epoch++
                      void props.model.select({ ...current, connection: { ...current.connection } })
                    }}
                  >
                    <bdi>{item()?.connection.provider}</bdi>
                    <Show when={item()?.label}>
                      <bdi>{item()?.label}</bdi>
                    </Show>
                    <bdi dir="ltr">
                      <code>{id}</code>
                    </bdi>
                  </button>
                  <Show when={item()}>
                    {(current) => (
                      <div class="mx-meta">
                        <MxBadge>{language.t(`orchestra.integrations.state.${current().state}`)}</MxBadge>
                        <MxBadge>{language.t(`orchestra.integrations.credential.${current().credential}`)}</MxBadge>
                      </div>
                    )}
                  </Show>
                </li>
              )
            }}
          </For>
        </ul>
        <Show when={props.model.state.connectionID}>
          <section aria-labelledby="integrations-targets-title">
            <h2 id="integrations-targets-title">{language.t("orchestra.integrations.targets")}</h2>
            <div class="integrations-controls">
              <button
                type="button"
                class="mx-btn"
                disabled={disabled() || account()?.state !== "active"}
                onClick={(event) => open("createTarget", event.currentTarget)}
              >
                {language.t("orchestra.integrations.createTarget")}
              </button>
              <button
                type="button"
                class="mx-btn"
                disabled={disabled() || account()?.state !== "active"}
                onClick={(event) => open("disconnect", event.currentTarget)}
              >
                {language.t("orchestra.integrations.disconnect")}
              </button>
            </div>
            <Show when={!props.model.state.targets.length && !disabled() && !props.model.state.failure}>
              <p role="status">{language.t("orchestra.integrations.noTargets")}</p>
            </Show>
            <ul class="integrations-list">
              <For each={state.targets}>
                {(id) => {
                  const item = () => props.model.state.targets.find((item) => item.target.id === id)
                  return (
                    <li hidden={!item()}>
                      <button
                        type="button"
                        class="mx-btn integrations-select"
                        disabled={disabled() || !item()}
                        aria-pressed={id === props.model.state.targetID}
                        onClick={() => {
                          const current = item()
                          if (!current) return
                          focus.epoch++
                          void props.model.selectTarget({ target: { ...current.target } })
                        }}
                      >
                        <bdi>{item()?.target.environment}</bdi>
                        <bdi dir="ltr">
                          <code>{id}</code>
                        </bdi>
                      </button>
                    </li>
                  )
                }}
              </For>
            </ul>
            <Show when={props.model.state.targetsAfter}>
              <button type="button" class="mx-btn" disabled={disabled()} onClick={() => void props.model.moreTargets()}>
                {language.t("orchestra.integrations.more")}
              </button>
            </Show>
          </section>
        </Show>
        <Show when={props.model.state.targetID}>
          <section aria-labelledby="integrations-bindings-title">
            <div class="integrations-controls">
              <button
                type="button"
                class="mx-btn"
                disabled={disabled() || !target()}
                onClick={(event) => open("retarget", event.currentTarget)}
              >
                {language.t("orchestra.integrations.retarget")}
              </button>
              <button
                type="button"
                class="mx-btn"
                disabled={disabled() || !target()}
                onClick={(event) => open("remove", event.currentTarget)}
              >
                {language.t("orchestra.integrations.remove")}
              </button>
            </div>
            <h2 id="integrations-bindings-title">{language.t("orchestra.integrations.bindings")}</h2>
            <p class="mx-note">{language.t("orchestra.integrations.bindingHint")}</p>
            <button
              type="button"
              class="mx-btn"
              disabled={disabled() || !target()}
              onClick={(event) => open("bind", event.currentTarget)}
            >
              {language.t("orchestra.integrations.bind")}
            </button>
            <Show when={!props.model.state.bindings.length && !disabled() && !props.model.state.failure}>
              <p role="status">{language.t("orchestra.integrations.noBindings")}</p>
            </Show>
            <ul class="integrations-list">
              <For each={state.bindings}>
                {(id) => {
                  const item = () => props.model.state.bindings.find((item) => item.sessionID === id)
                  return (
                    <li class="mx-card" hidden={!item()}>
                      <bdi dir="ltr">
                        <code>{id}</code>
                      </bdi>
                      <ul>
                        <For each={item()?.actions ?? []}>
                          {(action) => (
                            <li>
                              <bdi dir="ltr">
                                <code>{action}</code>
                              </bdi>
                            </li>
                          )}
                        </For>
                      </ul>
                      <button
                        type="button"
                        class="mx-btn"
                        disabled={disabled() || !item()}
                        onClick={(event) => {
                          const current = item()
                          if (current) open("unbind", event.currentTarget, current.sessionID)
                        }}
                      >
                        {language.t("orchestra.integrations.unbind")}
                      </button>
                    </li>
                  )
                }}
              </For>
            </ul>
            <Show when={props.model.state.bindingsAfter}>
              <button
                type="button"
                class="mx-btn"
                disabled={disabled()}
                onClick={() => void props.model.moreBindings()}
              >
                {language.t("orchestra.integrations.more")}
              </button>
            </Show>
          </section>
        </Show>
      </div>
      <Show when={state.form}>
        {(kind) => {
          const epoch = focus.epoch
          const model = props.model
          const isCurrent = () => focus.active && epoch === focus.epoch && props.model === model
          return (
            <IntegrationsDialog
              model={model}
              kind={kind()}
              sessionID={state.sessionID}
              opener={state.opener}
              fallbackFocus={() => focus.heading}
              isCurrent={isCurrent}
              onClose={() => {
                if (isCurrent()) setState({ form: undefined, sessionID: undefined, opener: undefined })
              }}
            />
          )
        }}
      </Show>
    </MxPage>
  )
}
