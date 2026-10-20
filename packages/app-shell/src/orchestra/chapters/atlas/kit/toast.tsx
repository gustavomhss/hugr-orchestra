import { onCleanup, Show } from "solid-js"
import { createStore } from "solid-js/store"
import { Icon } from "./chips"
import type { AtlasIconName } from "./icons"

// The mock's #toast: one message at a time, gone after 3.2 s.
export function createToaster() {
  const [state, setState] = createStore({ text: "", icon: "check" as AtlasIconName, shown: false })
  const timer: { id?: ReturnType<typeof setTimeout> } = {}
  onCleanup(() => clearTimeout(timer.id))
  return {
    state,
    show(text: string, icon: AtlasIconName = "check") {
      setState({ text, icon, shown: true })
      clearTimeout(timer.id)
      timer.id = setTimeout(() => setState("shown", false), 3200)
    },
  }
}

export function Toast(props: { toaster: ReturnType<typeof createToaster> }) {
  return (
    <div role="status" aria-live="polite">
      <Show when={props.toaster.state.shown}>
        <div class="at-toast">
          <Icon name={props.toaster.state.icon} />
          <span>{props.toaster.state.text}</span>
        </div>
      </Show>
    </div>
  )
}
