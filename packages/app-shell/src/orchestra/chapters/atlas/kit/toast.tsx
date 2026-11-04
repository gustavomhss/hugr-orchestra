import { onCleanup, Show } from "solid-js"
import { createStore } from "solid-js/store"
import { useLanguage } from "@/context/language"
import { Icon } from "./chips"
import type { AtlasIconName } from "./icons"

// The mock's #toast: one message at a time, gone after 3.2 s. A refusal ("xc") is the exception: it stays until it is
// dismissed or replaced, because a person reading a refusal needs more than 3 s and a screen reader needs an alert.
export function createToaster() {
  const [state, setState] = createStore({ text: "", icon: "check" as AtlasIconName, shown: false, sticky: false })
  const timer: { id?: ReturnType<typeof setTimeout> } = {}
  onCleanup(() => clearTimeout(timer.id))
  return {
    state,
    show(text: string, icon: AtlasIconName = "check") {
      const sticky = icon === "xc"
      setState({ text, icon, shown: true, sticky })
      clearTimeout(timer.id)
      if (!sticky) timer.id = setTimeout(() => setState("shown", false), 3200)
    },
    dismiss() {
      clearTimeout(timer.id)
      setState("shown", false)
    },
  }
}

export function Toast(props: { toaster: ReturnType<typeof createToaster> }) {
  const language = useLanguage()
  const shown = (sticky: boolean) => props.toaster.state.shown && props.toaster.state.sticky === sticky
  return (
    <>
      <div role="status" aria-live="polite">
        <Show when={shown(false)}>
          <div class="at-toast">
            <Icon name={props.toaster.state.icon} />
            <span>{props.toaster.state.text}</span>
          </div>
        </Show>
      </div>
      <div role="alert">
        <Show when={shown(true)}>
          <div class="at-toast">
            <Icon name={props.toaster.state.icon} />
            <span>{props.toaster.state.text}</span>
            <button type="button" class="mx-link" onClick={() => props.toaster.dismiss()}>
              {language.t("orchestra.atlas.kit.dismiss")}
            </button>
          </div>
        </Show>
      </div>
    </>
  )
}
