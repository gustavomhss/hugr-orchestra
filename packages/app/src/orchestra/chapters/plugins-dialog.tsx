import { Dialog } from "@kobalte/core/dialog"
import { DialogV2 } from "@opencode-ai/ui/v2/dialog-v2"
import { For, Show, type JSX } from "solid-js"
import { useLanguage } from "@/context/language"
import { CAVEMAN_ID, INTENSITIES, intensity, type Intensity, type LlmBehavior } from "./plugins-data"

// Mark copied from the approved mock's plugins icon.
export function PluginIcon() {
  return (
    <svg class="plugins-ic" viewBox="0 0 16 16" aria-hidden="true">
      <path d="M2 3h4a2 2 0 1 1 4 0h4v4a2 2 0 1 0 0 4v3h-4a2 2 0 1 0-4 0H2V3Z" />
    </svg>
  )
}

export function BehaviorDialog(props: {
  behavior?: LlmBehavior
  onSave: (next: LlmBehavior) => void
  onRemove: (id: string) => void
  onCancel: () => void
}) {
  const language = useLanguage()
  const id = props.behavior?.id ?? crypto.randomUUID()
  const caveman = id === CAVEMAN_ID
  return (
    <PluginsDialog
      title={
        props.behavior
          ? language.t("orchestra.plugins.dialog.configure", { name: props.behavior.name })
          : language.t("orchestra.plugins.dialog.add")
      }
      subtitle={language.t("orchestra.plugins.dialog.subtitle")}
      submit={language.t("orchestra.plugins.save")}
      onCancel={props.onCancel}
      onSubmit={(data) =>
        props.onSave({
          id,
          name: String(data.get("name")).trim(),
          description: String(data.get("description")).trim(),
          instructions: String(data.get("instructions")),
          enabled: props.behavior?.enabled ?? true,
          ...(caveman ? { intensity: INTENSITIES.find((item) => item === data.get("intensity")) ?? "full" } : {}),
        })
      }
    >
      <Field label={language.t("orchestra.plugins.field.name")}>
        <input name="name" type="text" required value={props.behavior?.name ?? ""} />
      </Field>
      <Field label={language.t("orchestra.plugins.field.description")}>
        <input name="description" type="text" required value={props.behavior?.description ?? ""} />
      </Field>
      <Show when={caveman && props.behavior}>
        {(behavior) => (
          <Field label={language.t("orchestra.plugins.field.intensity")}>
            <select name="intensity">
              <For each={INTENSITIES}>
                {(item: Intensity) => (
                  <option value={item} selected={item === intensity(behavior())}>
                    {item}
                  </option>
                )}
              </For>
            </select>
          </Field>
        )}
      </Show>
      <Field label={language.t("orchestra.plugins.field.instructions")}>
        <textarea name="instructions">{props.behavior?.instructions ?? ""}</textarea>
      </Field>
      <Show when={props.behavior}>
        {(behavior) => (
          <button type="button" class="mx-btn" onClick={() => props.onRemove(behavior().id)}>
            {language.t("orchestra.plugins.remove")}
          </button>
        )}
      </Show>
    </PluginsDialog>
  )
}

export function RemoveDialog(props: { profile: string; onConfirm: () => void; onCancel: () => void }) {
  const language = useLanguage()
  return (
    <PluginsDialog
      title={language.t("orchestra.plugins.removeTitle")}
      subtitle={language.t("orchestra.plugins.removeSubtitle")}
      submit={language.t("orchestra.plugins.confirm")}
      onCancel={props.onCancel}
      onSubmit={props.onConfirm}
    >
      <p class="mx-note">{language.t("orchestra.plugins.removeNote", { profile: props.profile })}</p>
    </PluginsDialog>
  )
}

// Mock `.mx-dialog` markup inside the app's dialog layer, which owns focus, Escape and the backdrop.
function PluginsDialog(props: {
  title: string
  subtitle: string
  submit: string
  onSubmit: (data: FormData) => void
  onCancel: () => void
  children: JSX.Element
}) {
  const language = useLanguage()
  return (
    <DialogV2 fit containerClass="mx-dialog plugins-dialog">
      <form
        autocomplete="off"
        onSubmit={(event) => {
          event.preventDefault()
          props.onSubmit(new FormData(event.currentTarget))
        }}
      >
        <header class="mx-dialog-head">
          <div>
            <Dialog.Title>{props.title}</Dialog.Title>
            <Dialog.Description>{props.subtitle}</Dialog.Description>
          </div>
          <Dialog.CloseButton
            data-slot="dialog-close-button"
            class="mx-link plugins-close"
            aria-label={language.t("orchestra.plugins.dialog.close")}
          >
            <svg class="plugins-ic" viewBox="0 0 16 16" aria-hidden="true">
              <path d="m4 4 8 8m0-8-8 8" />
            </svg>
          </Dialog.CloseButton>
        </header>
        <div class="mx-dialog-body">{props.children}</div>
        <footer class="mx-dialog-foot">
          <button type="button" class="mx-btn" onClick={props.onCancel}>
            {language.t("orchestra.plugins.cancel")}
          </button>
          <button type="submit" class="mx-btn primary">
            {props.submit}
          </button>
        </footer>
      </form>
    </DialogV2>
  )
}

function Field(props: { label: string; children: JSX.Element }) {
  return (
    <label class="mx-field">
      <span>{props.label}</span>
      {props.children}
    </label>
  )
}
