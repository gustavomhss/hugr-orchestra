import { Dialog } from "@kobalte/core/dialog"
import { CapabilityManagement } from "@orchestra/schema/capability-management"
import { CapabilitySetup } from "@orchestra/schema/capability-setup"
import { Option, Schema } from "effect"
import { onCleanup, Show } from "solid-js"
import { createStore } from "solid-js/store"
import { useLanguage } from "@/context/language"
import type { Model } from "./integrations-contract"

export type IntegrationForm = "connect" | "createTarget" | "retarget" | "bind" | "remove" | "disconnect" | "unbind"

export function IntegrationsDialog(props: {
  model: Model
  kind: IntegrationForm
  sessionID?: string
  onClose: () => void
  opener?: HTMLButtonElement
}) {
  const language = useLanguage()
  const opener = props.opener
  const [state, setState] = createStore({ invalid: false })
  const form = { current: undefined as HTMLFormElement | undefined }
  onCleanup(() => form.current?.reset())
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
    if (props.model.state.busy) return
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
      const resource = Schema.decodeUnknownOption(Schema.UnknownFromJsonString)(values.get("resource"))
      if (Option.isNone(resource)) return invalid()
      const input = Schema.decodeUnknownOption(CapabilityManagement.TargetInput)({
        environment: values.get("environment"),
        resource: resource.value,
      })
      if (Option.isNone(input)) return invalid()
      void (props.kind === "createTarget"
        ? props.model.createTarget(input.value)
        : props.model.retargetTarget(input.value))
    }
    if (props.kind === "bind") {
      const input = Schema.decodeUnknownOption(CapabilityManagement.BindingInput)({
        sessionID: values.get("sessionID"),
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
        if (!open) {
          props.model.cancel()
          props.onClose()
        }
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay class="integrations-backdrop" />
        <div class="integrations-layer">
          <Dialog.Content
            class="mx-dialog integrations-dialog"
            onCloseAutoFocus={(event) => {
              event.preventDefault()
              opener?.focus()
            }}
          >
            <form
              ref={(element) => {
                form.current = element
              }}
              autocomplete="off"
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
                <Dialog.CloseButton
                  type="button"
                  class="mx-link"
                  aria-label={language.t("orchestra.integrations.close")}
                >
                  {language.t("orchestra.integrations.close")}
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
                    <select name="provider">
                      <option value="slack">Slack</option>
                      <option value="discord">Discord</option>
                    </select>
                  </label>
                  <label class="mx-field">
                    <span>{language.t("orchestra.integrations.key")}</span>
                    <input name="key" type="password" dir="ltr" required maxlength={4096} autocomplete="off" />
                  </label>
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
                    <textarea name="resource" dir="ltr" required spellcheck={false} />
                  </label>
                </Show>
                <Show when={props.kind === "bind"}>
                  <label class="mx-field">
                    <span>{language.t("orchestra.integrations.session")}</span>
                    <input name="sessionID" dir="ltr" required />
                  </label>
                  <label class="mx-field">
                    <span>{language.t("orchestra.integrations.actions")}</span>
                    <textarea
                      name="actions"
                      dir="ltr"
                      required
                      spellcheck={false}
                      aria-describedby="integrations-actions-hint"
                    />
                  </label>
                  <p id="integrations-actions-hint" class="mx-note">
                    {language.t("orchestra.integrations.actionsHint")}
                  </p>
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
