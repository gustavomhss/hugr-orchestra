import { For } from "solid-js"
import { useLanguage } from "@/context/language"
import { useSettings } from "@/context/settings"
import { WALLPAPER_DIM_MAX, WALLPAPERS } from "./catalog"
import "./picker.css"

// The Settings background picker: one radio per bundled photo. Arrow keys, Home and End move the selection,
// like the theme and permission pickers.
export function WallpaperPicker(props: { label: string }) {
  const language = useLanguage()
  const settings = useSettings()
  const move = (event: KeyboardEvent & { currentTarget: HTMLDivElement }) => {
    const ids = WALLPAPERS.map((item): string => item.id)
    const index = ids.indexOf(settings.appearance.wallpaper())
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
    settings.appearance.setWallpaper(ids[target])
    event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="radio"]')[target]?.focus()
  }

  return (
    <div
      class="orchestra-wallpapers"
      role="radiogroup"
      aria-label={props.label}
      data-action="settings-wallpaper"
      onKeyDown={move}
    >
      <For each={WALLPAPERS}>
        {(item) => (
          <button
            type="button"
            role="radio"
            data-wallpaper={item.id}
            aria-checked={settings.appearance.wallpaper() === item.id}
            tabindex={settings.appearance.wallpaper() === item.id ? 0 : -1}
            onClick={() => settings.appearance.setWallpaper(item.id)}
          >
            <img src={item.thumb} alt="" loading="lazy" draggable={false} />
            <span data-slot="name">{language.t(`orchestra.settings.wallpaper.${item.id}`)}</span>
          </button>
        )}
      </For>
    </div>
  )
}

export function WallpaperDim() {
  const language = useLanguage()
  const settings = useSettings()
  const percent = () => Math.round(settings.appearance.wallpaperDim() * 100)
  return (
    <label class="orchestra-wallpaper-dim">
      <span data-slot="label">{language.t("orchestra.settings.wallpaper.dim")}</span>
      <input
        type="range"
        min="0"
        max={WALLPAPER_DIM_MAX * 100}
        step="5"
        value={percent()}
        data-action="settings-wallpaper-dim"
        aria-label={language.t("orchestra.settings.wallpaper.dim")}
        aria-valuetext={`${percent()}%`}
        onInput={(event) => settings.appearance.setWallpaperDim(Number(event.currentTarget.value) / 100)}
      />
      <span data-slot="value">{percent()}%</span>
    </label>
  )
}
