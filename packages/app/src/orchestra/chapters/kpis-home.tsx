import { createMemo, onCleanup, onMount, Show } from "solid-js"
import { createStore } from "solid-js/store"
import { Dynamic } from "solid-js/web"
import type { HomeController } from "@/pages/home/home-controller"

export function RecordedUsageHome(props: { home: HomeController }) {
  const [state, setState] = createStore({ view: undefined as typeof import("./kpis").RecordedUsage | undefined })
  const owner = createMemo(
    () => {
      const selection = props.home.selection.value()
      const ctx = props.home.server.focusedContext()
      if (!selection.directory || !ctx) return
      return { key: `${selection.server}\0${selection.directory}`, directory: selection.directory, sdk: ctx.sdk }
    },
    undefined,
    { equals: (a, b) => a?.key === b?.key },
  )

  onMount(() => {
    const pending = { task: undefined as ReturnType<typeof setTimeout> | undefined }
    // A task after the animation frame lets Home paint before importing or requesting usage.
    // Import without lazy(): a pending lazy() suspends the route Suspense outside the router's
    // transition, and a navigation committed meanwhile leaves this Home's DOM in place of the
    // next route.
    const frame = requestAnimationFrame(() => {
      pending.task = setTimeout(async () => {
        const { RecordedUsage } = await import("./kpis")
        setState("view", () => RecordedUsage)
      }, 0)
    })
    onCleanup(() => {
      cancelAnimationFrame(frame)
      clearTimeout(pending.task)
    })
  })

  return (
    <Show when={state.view}>
      {(view) => (
        <Show when={owner()} keyed>
          {(owner) => <Dynamic component={view()} directory={owner.directory} sdk={owner.sdk} />}
        </Show>
      )}
    </Show>
  )
}
