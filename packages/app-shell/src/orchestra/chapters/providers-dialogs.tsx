import { Dialog } from "@kobalte/core/dialog"
import { useDialog } from "@orchestra/ui/context/dialog"
import { iconNames } from "@orchestra/ui/icons/provider"
import { ProviderIcon } from "@orchestra/ui/provider-icon"
import { Show } from "solid-js"
import { createStore } from "solid-js/store"
import { useLanguage } from "@/context/language"

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

// Mock `modal()` as a question: header with title, subtitle and close; one alert line; Cancel and the action.
export function ProviderConfirmDialog(props: {
  title: string
  description: string
  submit: string
  onConfirm: () => Promise<string | undefined>
}) {
  const language = useLanguage()
  const dialog = useDialog()
  const [state, setState] = createStore({ busy: false, error: undefined as string | undefined })
  return (
    <Dialog.Content class="mx-dialog providers-dialog" data-component="orchestra-providers-dialog">
      <form
        autocomplete="off"
        onSubmit={async (event) => {
          event.preventDefault()
          if (state.busy) return
          setState({ busy: true, error: undefined })
          const error = await props.onConfirm()
          setState({ busy: false, error })
          if (!error) dialog.close()
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
        <Show when={state.error}>
          <div class="mx-dialog-body">
            <p class="mx-error" role="alert">
              {state.error}
            </p>
          </div>
        </Show>
        <footer class="mx-dialog-foot">
          {/* Kobalte names a close button "Dismiss" unless told otherwise; keep the visible word as its name. */}
          <Dialog.CloseButton type="button" class="mx-btn" aria-label={language.t("common.cancel")}>
            {language.t("common.cancel")}
          </Dialog.CloseButton>
          <button class="mx-btn primary" type="submit" disabled={state.busy}>
            {props.submit}
          </button>
        </footer>
      </form>
    </Dialog.Content>
  )
}
