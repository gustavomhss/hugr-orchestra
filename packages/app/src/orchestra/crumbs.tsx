import { createSignal, For } from "solid-js"

// Extra titlebar crumbs below the chapter name ("Workflows / Governed WP execution / Run #1042"). A chapter page
// sets them for its current view and clears them when it unmounts, so other routes show none.
const [trail, setTrail] = createSignal<string[]>([])

export const setCrumbTrail = (items: string[]) =>
  setTrail((current) =>
    current.length === items.length && current.every((item, index) => item === items[index]) ? current : items,
  )

// The chapter name followed by the trail, for the titlebar's breadcrumb.
export function CrumbTrail(props: { label: string }) {
  return (
    <>
      <span>{props.label}</span>
      <For each={trail()}>
        {(item) => (
          <>
            <span aria-hidden="true">/</span>
            <span class="truncate" style={{ "max-width": "240px" }}>
              {item}
            </span>
          </>
        )}
      </For>
    </>
  )
}
