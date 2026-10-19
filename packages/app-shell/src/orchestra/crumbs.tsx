import { useNavigate } from "@solidjs/router"
import { createEffect, createSignal, For, onCleanup, Show } from "solid-js"

// A trail item is plain text, or a link back to somewhere ("home / project / session title").
export type Crumb = string | { label: string; onSelect: () => void }

// Extra titlebar crumbs below the chapter name ("Workflows / Governed WP execution / Run #1042"). A chapter page
// sets them for its current view and clears them when it unmounts, so other routes show none.
const [trail, setTrail] = createSignal<Crumb[]>([])

export const setCrumbTrail = (items: Crumb[]) =>
  setTrail((current) =>
    current.length === items.length && current.every((item, index) => item === items[index]) ? current : items,
  )

// Set while a session or draft page is open: the leading "home" crumb then links back to Home.
const [home, setHome] = createSignal<(() => void) | undefined>()

// Session and draft pages place themselves under their project: "home / <project> / <session title>".
export function SessionCrumbs(props: { project?: Crumb; title: string }) {
  const navigate = useNavigate()
  createEffect(() => {
    setHome(() => () => navigate("/"))
    setCrumbTrail([...(props.project ? [props.project] : []), props.title])
  })
  onCleanup(() => {
    setHome(undefined)
    setCrumbTrail([])
  })
  return null
}

// The chapter name followed by the trail, for the titlebar's breadcrumb. The leading name links to Home on session pages.
export function CrumbTrail(props: { label: string }) {
  return (
    <>
      <span>
        <Show when={home()} fallback={props.label}>
          <button type="button" data-slot="orchestra-crumb-link" onClick={() => home()?.()}>
            {props.label}
          </button>
        </Show>
      </span>
      <For each={trail()}>
        {(item) => (
          <>
            <span aria-hidden="true">/</span>
            <span class="truncate" style={{ "max-width": "240px" }}>
              {typeof item === "string" ? (
                item
              ) : (
                <button type="button" data-slot="orchestra-crumb-link" onClick={item.onSelect}>
                  {item.label}
                </button>
              )}
            </span>
          </>
        )}
      </For>
    </>
  )
}
