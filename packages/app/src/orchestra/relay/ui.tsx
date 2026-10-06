import { createSignal, For, type JSX, onCleanup, onMount, Show } from "solid-js"
import { Portal } from "solid-js/web"
import { useLanguage } from "@/context/language"
import { GLYPH, type Glyph, ICON } from "./catalog"
import { ago } from "./format"

export type IconName = keyof typeof ICON

export function Ic(props: { name: IconName; class?: string }) {
  return <svg class={props.class ?? "wf-ic"} viewBox="0 0 16 16" aria-hidden="true" innerHTML={ICON[props.name]} />
}

export function NodeGlyph(props: { name: Glyph }) {
  return <svg viewBox="0 0 24 24" aria-hidden="true" innerHTML={GLYPH[props.name]} />
}

export function useRelayCopy() {
  const language = useLanguage()
  const count = (n: number, one: Parameters<typeof language.t>[0], other: Parameters<typeof language.t>[0]) =>
    language.t(n === 1 ? one : other, { count: n })
  const when = (at: number | undefined) => {
    if (at === undefined) return ""
    const value = ago(at, Date.now())
    if (value.key === "now") return language.t("orchestra.workflows.ago.now")
    if (value.key === "minutes") return language.t("orchestra.workflows.ago.minutes", { count: value.count })
    if (value.key === "hours") return language.t("orchestra.workflows.ago.hours", { count: value.count })
    if (value.key === "yesterday") return language.t("orchestra.workflows.ago.yesterday")
    return language.t("orchestra.workflows.ago.days", { count: value.count })
  }
  const clock = (at: number | undefined) =>
    at === undefined
      ? ""
      : new Date(at).toLocaleTimeString(language.intl(), { hour: "2-digit", minute: "2-digit", hour12: false })
  return { t: language.t, count, when, clock }
}

export type MenuItem = { label: string; icon?: IconName; danger?: boolean; disabled?: boolean; run: () => void } | "-"

// A small popover menu anchored to a button. Escape and outside clicks close it; Escape stops there so the
// layer below stays open.
export function Menu(props: {
  anchor: HTMLElement
  items: MenuItem[]
  label: string
  class?: string
  onClose: () => void
}) {
  let ref!: HTMLDivElement
  const rect = props.anchor.getBoundingClientRect()
  const [style] = createSignal<JSX.CSSProperties>({
    position: "fixed",
    "z-index": "60",
    top: `${Math.round(rect.bottom + 6)}px`,
    left: `${Math.round(Math.max(8, Math.min(rect.right - 220, window.innerWidth - 340)))}px`,
  })
  const down = (event: PointerEvent) => {
    if (event.target instanceof Node && (ref.contains(event.target) || props.anchor.contains(event.target))) return
    props.onClose()
  }
  const key = (event: KeyboardEvent) => {
    if (event.key !== "Escape") return
    event.preventDefault()
    event.stopImmediatePropagation()
    props.onClose()
    props.anchor.focus()
  }
  onMount(() => {
    document.addEventListener("pointerdown", down, true)
    window.addEventListener("keydown", key, true)
    ref.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus()
  })
  onCleanup(() => {
    document.removeEventListener("pointerdown", down, true)
    window.removeEventListener("keydown", key, true)
  })
  const move = (event: KeyboardEvent) => {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return
    event.preventDefault()
    const buttons = [...ref.querySelectorAll<HTMLButtonElement>("button:not(:disabled)")]
    const index = buttons.indexOf(document.activeElement as HTMLButtonElement)
    buttons[(index + (event.key === "ArrowDown" ? 1 : -1) + buttons.length) % buttons.length]?.focus()
  }
  return (
    <Portal>
      <div class="wf-scope">
        <div
          ref={ref}
          class={`mx-menu ${props.class ?? ""}`}
          style={style()}
          role="menu"
          aria-label={props.label}
          onKeyDown={move}
        >
          <For each={props.items}>
            {(item) =>
              item === "-" ? (
                <hr />
              ) : (
                <button
                  type="button"
                  role="menuitem"
                  class={item.danger ? "danger" : undefined}
                  disabled={item.disabled}
                  onClick={() => {
                    props.onClose()
                    item.run()
                  }}
                >
                  <Show when={item.icon}>{(icon) => <Ic name={icon()} />}</Show>
                  <span>{item.label}</span>
                </button>
              )
            }
          </For>
        </div>
      </div>
    </Portal>
  )
}

// A native modal dialog in the kit's layout. Escape (the dialog's cancel event) calls onClose.
export function RelayDialog(props: {
  title: string
  description?: JSX.Element
  wide?: boolean
  label?: string
  children: JSX.Element
  foot: JSX.Element
  onClose: () => void
  onSubmit?: () => void
}) {
  const copy = useRelayCopy()
  let dialog!: HTMLDialogElement
  onMount(() => dialog.showModal())
  return (
    <dialog
      ref={dialog}
      class={`mx-dialog${props.wide ? " wide" : ""}`}
      aria-label={props.label ?? props.title}
      onCancel={(event) => {
        event.preventDefault()
        props.onClose()
      }}
    >
      <form
        method="dialog"
        onSubmit={(event) => {
          event.preventDefault()
          props.onSubmit?.()
        }}
      >
        <header class="mx-dialog-head">
          <div>
            <h2>{props.title}</h2>
            <Show when={props.description}>
              <p>{props.description}</p>
            </Show>
          </div>
          <button
            type="button"
            class="mx-btn icon"
            aria-label={copy.t("orchestra.workflows.dialog.close")}
            title={copy.t("orchestra.workflows.dialog.close")}
            onClick={props.onClose}
          >
            <Ic name="close" />
          </button>
        </header>
        <div class="mx-dialog-body">{props.children}</div>
        <footer class="mx-dialog-foot">{props.foot}</footer>
      </form>
    </dialog>
  )
}
