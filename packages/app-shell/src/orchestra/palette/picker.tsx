import { For } from "solid-js"
import { useLanguage } from "@/context/language"
import { useOrchestraPalette } from "./context"
import "./picker.css"
import "./generated/swatches.css"

// The Settings theme picker: one radio per Orchestra palette, each previewed as its background, glass and text.
// Arrow keys, Home and End move the selection, like the permission segments.
export function PalettePicker(props: { label: string }) {
  const language = useLanguage()
  const palette = useOrchestraPalette()
  const move = (event: KeyboardEvent & { currentTarget: HTMLDivElement }) => {
    const ids = palette.palettes.map((item) => item.id)
    const index = ids.indexOf(palette.id())
    const rtl = getComputedStyle(event.currentTarget).direction === "rtl"
    const step = { ArrowDown: 1, ArrowUp: -1, ArrowRight: rtl ? -1 : 1, ArrowLeft: rtl ? 1 : -1 }[event.key]
    const target =
      event.key === "Home"
        ? 0
        : event.key === "End"
          ? ids.length - 1
          : step === undefined
            ? undefined
            : (index + step + ids.length) % ids.length
    if (target === undefined) return
    event.preventDefault()
    void palette.select(ids[target])
    event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="radio"]')[target]?.focus()
  }

  return (
    <div
      class="orchestra-palettes"
      role="radiogroup"
      aria-label={props.label}
      data-action="settings-palette"
      onKeyDown={move}
    >
      <For each={palette.palettes}>
        {(item) => (
          <button
            type="button"
            role="radio"
            data-palette={item.id}
            aria-checked={palette.id() === item.id}
            tabindex={palette.id() === item.id ? 0 : -1}
            onClick={() => void palette.select(item.id)}
          >
            <span data-slot="preview" aria-hidden="true">
              <For each={item.id === "system" ? ["dark", "light"] : [item.id]}>
                {(id) => (
                  <span data-palette-swatch={id}>
                    <span data-slot="glass">
                      <i data-slot="text" />
                      <i data-slot="muted" />
                      <i data-slot="accent" />
                    </span>
                  </span>
                )}
              </For>
            </span>
            <span data-slot="name">{language.t(`orchestra.settings.palette.${item.id}`)}</span>
          </button>
        )}
      </For>
    </div>
  )
}
