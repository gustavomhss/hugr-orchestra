import { Dialog } from "@kobalte/core/dialog"
import { CapabilityManagement } from "@orchestra/schema/capability-management"
import { CapabilitySetup } from "@orchestra/schema/capability-setup"
import { Option, Schema } from "effect"
import { For, onCleanup, onMount, Show } from "solid-js"
import { createStore } from "solid-js/store"
import { useLanguage } from "@/context/language"
import type { Model } from "./integrations-contract"
import { INTEGRATION_PROVIDERS } from "./integrations-model"

export type IntegrationForm = "connect" | "createTarget" | "retarget" | "bind" | "remove" | "disconnect" | "unbind"

export function IntegrationsDialog(props: {
  model: Model
  kind: IntegrationForm
  sessionID?: string
  onClose: () => void
  opener?: HTMLButtonElement
  fallbackFocus: () => HTMLElement | undefined
  isCurrent: () => boolean
}) {
  const language = useLanguage()
  const opener = props.opener
  const [state, setState] = createStore({
    invalid: false,
    provider: INTEGRATION_PROVIDERS[0].id as string,
    resourceChecked: false,
    sessionMissing: false,
  })
  const form = { current: undefined as HTMLFormElement | undefined }
  onCleanup(() => form.current?.reset())
  onMount(() => {
    if (props.kind === "bind") void props.model.loadSessions()
  })
  const keyHint = () => INTEGRATION_PROVIDERS.find((item) => item.id === state.provider)?.hint
  // The actions example follows the provider of the account the target belongs to.
  const actionsExample = () => {
    const provider = props.model.state.connections.find(
      (item) => item.connection.id === props.model.state.connectionID,
    )?.connection.provider
    const item = INTEGRATION_PROVIDERS.find((item) => item.id === provider)
    return item?.available ? item.actionsHint : undefined
  }
  const checkResource = (text: string) => {
    setState("resourceChecked", true)
    return props.model.checkResource(text)
  }
  const close = () => {
    form.current?.reset()
    if (!props.isCurrent()) return
    if (props.model.state.busy || props.model.state.retryable) props.model.cancel()
    props.onClose()
  }
  const destructive = () => ["remove", "disconnect", "unbind"].includes(props.kind)
  const title = () => language.t(`orchestra.integrations.${props.kind}`)
  const hint = () =>
    language.t(
      props.kind === "connect"
        ? "orchestra.integrations.keyHint"
        : props.kind === "bind"
          ? "orchestra.integrations.bindingHint"
          : props.kind === "disconnect"
            ? "orchestra.integrations.disconnectHint"
            : props.kind === "remove"
              ? "orchestra.integrations.removeHint"
              : props.kind === "unbind"
                ? "orchestra.integrations.unbindHint"
                : "orchestra.integrations.resourceHint",
    )
  const invalid = () => setState("invalid", true)
  const submit = (element: HTMLFormElement) => {
    if (props.model.state.busy || !props.isCurrent()) return
    const values = new FormData(element)
    // Reset before validation or handing an input to the controller: neither errors nor retries keep DOM secrets.
    element.reset()
    if (props.kind === "connect") {
      const input = Schema.decodeUnknownOption(CapabilitySetup.Input)({
        provider: values.get("provider"),
        key: values.get("key"),
        ...(values.get("label") ? { label: values.get("label") } : {}),
      })
      if (Option.isNone(input)) return invalid()
      void props.model.connect(input.value)
    }
    if (props.kind === "createTarget" || props.kind === "retarget") {
      const resource = checkResource(String(values.get("resource") ?? ""))
      if (resource === undefined) return
      const input = Schema.decodeUnknownOption(CapabilityManagement.TargetInput)({
        environment: values.get("environment"),
        resource,
      })
      if (Option.isNone(input)) return invalid()
      void (props.kind === "createTarget"
        ? props.model.createTarget(input.value)
        : props.model.retargetTarget(input.value))
    }
    if (props.kind === "bind") {
      // A typed ID wins over the picker, which stays advisory when the session list cannot load.
      const sessionID = String(values.get("sessionID") ?? "").trim() || String(values.get("sessionPick") ?? "")
      setState("sessionMissing", !sessionID)
      if (!sessionID) return
      const input = Schema.decodeUnknownOption(CapabilityManagement.BindingInput)({
        sessionID,
        actions: String(values.get("actions") ?? "")
          .split(/\r?\n/)
          .map((line) => line.trim())
          .filter(Boolean),
      })
      if (Option.isNone(input)) return invalid()
      void props.model.bind(input.value)
    }
    if (props.kind === "remove") void props.model.removeTarget()
    if (props.kind === "disconnect") void props.model.disconnect()
    if (props.kind === "unbind") {
      const input = Schema.decodeUnknownOption(CapabilityManagement.RemoveBindingInput)({
        target: { ...props.model.state.targets.find((item) => item.target.id === props.model.state.targetID)?.target },
        sessionID: props.sessionID,
      })
      if (Option.isNone(input)) return invalid()
      void props.model.unbind(input.value.sessionID)
    }
    props.onClose()
  }
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) close()
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay class="integrations-backdrop" />
        <div class="integrations-layer">
          <Dialog.Content
            class="mx-dialog integrations-dialog"
            onCloseAutoFocus={(event) => {
              event.preventDefault()
              if (!props.isCurrent()) return
              const fallback = props.fallbackFocus()
              const active = form.current?.ownerDocument.activeElement
              // A newer dialog/page may already own focus when Kobalte delivers this close callback.
              if (
                active &&
                active !== active.ownerDocument.body &&
                !form.current?.contains(active) &&
                active !== opener &&
                active !== fallback
              )
                return
              const current = opener?.isConnected && !opener.disabled && !opener.closest("[hidden]") ? opener : fallback
              if (current?.isConnected) current.focus()
            }}
          >
            <form
              ref={(element) => {
                form.current = element
              }}
              autocomplete="off"
              onReset={() => setState("provider", INTEGRATION_PROVIDERS[0].id)}
              onSubmit={(event) => {
                event.preventDefault()
                submit(event.currentTarget)
              }}
            >
              <header class="mx-dialog-head">
                <div>
                  <Dialog.Title as="h2">{title()}</Dialog.Title>
                  <Dialog.Description>{hint()}</Dialog.Description>
                </div>
                <Dialog.CloseButton type="button" class="mx-link" aria-label={language.t("common.close")}>
                  {language.t("common.close")}
                </Dialog.CloseButton>
              </header>
              <fieldset class="mx-dialog-body integrations-fields" disabled={props.model.state.busy}>
                <Show when={props.kind === "disconnect"}>
                  <bdi dir="ltr">
                    <code>{props.model.state.connectionID}</code>
                  </bdi>
                </Show>
                <Show when={props.kind !== "connect" && props.kind !== "disconnect" && props.kind !== "createTarget"}>
                  <bdi dir="ltr">
                    <code>{props.model.state.targetID}</code>
                  </bdi>
                </Show>
                <Show when={state.invalid}>
                  <p role="alert" class="mx-error">
                    {language.t("orchestra.integrations.error.invalid")}
                  </p>
                </Show>
                <Show when={props.kind === "connect"}>
                  <label class="mx-field">
                    <span>{language.t("orchestra.integrations.provider")}</span>
                    <select name="provider" onChange={(event) => setState("provider", event.currentTarget.value)}>
                      <For each={INTEGRATION_PROVIDERS.filter((item) => item.available)}>
                        {(item) => <option value={item.id}>{language.t(item.name)}</option>}
                      </For>
                      <optgroup label={language.t("orchestra.integrations.providerUnavailable")}>
                        <For each={INTEGRATION_PROVIDERS.filter((item) => !item.available)}>
                          {(item) => (
                            <option value={item.id} disabled>
                              {language.t(item.name)}
                            </option>
                          )}
                        </For>
                      </optgroup>
                    </select>
                  </label>
                  <label class="mx-field">
                    <span>{language.t("orchestra.integrations.key")}</span>
                    <input
                      name="key"
                      type="password"
                      dir="ltr"
                      required
                      maxlength={4096}
                      autocomplete="off"
                      aria-describedby="integrations-key-hint"
                    />
                  </label>
                  <Show when={keyHint()}>
                    {(hint) => (
                      <p id="integrations-key-hint" class="mx-note">
                        {language.t(hint())}
                      </p>
                    )}
                  </Show>
                  <label class="mx-field">
                    <span>{language.t("orchestra.integrations.label")}</span>
                    <input name="label" dir="auto" maxlength={128} />
                  </label>
                </Show>
                <Show when={props.kind === "createTarget" || props.kind === "retarget"}>
                  <label class="mx-field">
                    <span>{language.t("orchestra.integrations.environment")}</span>
                    <input name="environment" dir="auto" required />
                  </label>
                  <label class="mx-field">
                    <span>{language.t("orchestra.integrations.resource")}</span>
                    <textarea
                      name="resource"
                      dir="ltr"
                      required
                      spellcheck={false}
                      aria-invalid={state.resourceChecked && !!props.model.state.resourceError}
                      onChange={(event) => checkResource(event.currentTarget.value)}
                    />
                  </label>
                  <Show when={state.resourceChecked && props.model.state.resourceError}>
                    <p role="alert" class="mx-error">
                      {language.t("orchestra.integrations.resourceError")}
                    </p>
                  </Show>
                </Show>
                <Show when={props.kind === "bind"}>
                  <Show when={props.model.state.sessions.length}>
                    <label class="mx-field">
                      <span>{language.t("orchestra.integrations.sessionPick")}</span>
                      <select
                        name="sessionPick"
                        aria-invalid={state.sessionMissing}
                        onChange={() => setState("sessionMissing", false)}
                      >
                        <option value="" />
                        <For each={props.model.state.sessions}>
                          {(session) => (
                            <option value={session.id} dir="auto">
                              {session.title || session.id}
                            </option>
                          )}
                        </For>
                      </select>
                    </label>
                  </Show>
                  <Show when={props.model.state.sessionsStatus === "loading"}>
                    <p role="status" class="mx-note">
                      {language.t("orchestra.integrations.sessionsLoading")}
                    </p>
                  </Show>
                  <Show when={props.model.state.sessionsStatus === "ready" && !props.model.state.sessions.length}>
                    <p role="status" class="mx-note">
                      {language.t("orchestra.integrations.sessionsEmpty")}
                    </p>
                  </Show>
                  <Show when={props.model.state.sessionsStatus === "error"}>
                    <p role="status" class="mx-note">
                      {language.t("orchestra.integrations.sessionsError")}
                    </p>
                  </Show>
                  <label class="mx-field">
                    <span>
                      {language.t(
                        props.model.state.sessions.length
                          ? "orchestra.integrations.sessionTyped"
                          : "orchestra.integrations.session",
                      )}
                    </span>
                    <input
                      name="sessionID"
                      dir="ltr"
                      required={!props.model.state.sessions.length}
                      aria-invalid={state.sessionMissing}
                      onInput={() => setState("sessionMissing", false)}
                    />
                  </label>
                  <Show when={state.sessionMissing}>
                    <p role="alert" class="mx-error">
                      {language.t("orchestra.integrations.sessionMissing")}
                    </p>
                  </Show>
                  <label class="mx-field">
                    <span>{language.t("orchestra.integrations.actions")}</span>
                    <textarea
                      name="actions"
                      dir="ltr"
                      required
                      spellcheck={false}
                      aria-describedby="integrations-actions-hint integrations-actions-example"
                    />
                  </label>
                  <p id="integrations-actions-hint" class="mx-note">
                    {language.t("orchestra.integrations.actionsHint")}
                  </p>
                  <Show when={actionsExample()}>
                    {(example) => (
                      <p id="integrations-actions-example" class="mx-note">
                        {language.t(example())}
                      </p>
                    )}
                  </Show>
                </Show>
                <Show when={props.kind === "unbind"}>
                  <bdi dir="ltr">
                    <code>{props.sessionID}</code>
                  </bdi>
                </Show>
              </fieldset>
              <footer class="mx-dialog-foot">
                <Dialog.CloseButton
                  type="button"
                  class="mx-btn"
                  aria-label={language.t("orchestra.integrations.cancel")}
                >
                  {language.t("orchestra.integrations.cancel")}
                </Dialog.CloseButton>
                <button
                  type="submit"
                  class={destructive() ? "mx-btn danger" : "mx-btn primary"}
                  disabled={props.model.state.busy}
                >
                  {destructive() ? title() : language.t("orchestra.integrations.save")}
                </button>
              </footer>
            </form>
          </Dialog.Content>
        </div>
      </Dialog.Portal>
    </Dialog>
  )
}
