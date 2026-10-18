import { createSignal, For, type JSX, onCleanup, onMount, Show } from "solid-js"
import { Portal } from "solid-js/web"
import { Dialog } from "@kobalte/core/dialog"
import { useLanguage } from "@/context/language"
import { GLYPH, type Glyph, ICON } from "./catalog"
import { ago } from "./format"
import { popupAt } from "./geometry"

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

type Press = { x: number; y: number; at: number }
// The last press anywhere, so a layer a click opens can tell the second half of a double-click on its opener from a
// deliberate click of its own.
let press: Press | undefined
if (typeof document === "object")
  document.addEventListener(
    "pointerdown",
    (event) => (press = { x: event.clientX, y: event.clientY, at: event.timeStamp }),
    true,
  )

const DOUBLE_CLICK = 500
const CLICKS = ["mousedown", "mouseup", "click", "dblclick"]

// Whether `event` is the other half of a double-click that began with `origin`: the same spot, inside the
// double-click time. A click carries its count, so a later single click at that spot is still a click.
function repeats(origin: Press | undefined, event: Event) {
  if (!origin || !(event instanceof MouseEvent) || event.timeStamp - origin.at > DOUBLE_CLICK) return false
  if (Math.hypot(event.clientX - origin.x, event.clientY - origin.y) > 8) return false
  return event.type === "pointerdown" || event.detail > 1
}

// Cancels the second half of a double-click on a control that disappears when it is clicked (a menu item), so it
// cannot land on whatever was underneath.
export function swallowRepeats() {
  const origin = press
  const stop = (event: Event) => {
    if (!repeats(origin, event)) return
    event.stopPropagation()
    event.preventDefault()
  }
  const types = ["pointerdown", ...CLICKS]
  types.forEach((type) => document.addEventListener(type, stop, true))
  setTimeout(() => types.forEach((type) => document.removeEventListener(type, stop, true)), DOUBLE_CLICK)
}

// A small popover menu anchored to a button. Escape and outside clicks close it; Escape stops there so the
// layer below stays open. It opens above the button when there is no room below, never leaves the window, and
// closes when the page scrolls or focus moves out of it.
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
  const scroll = (event: Event) => {
    if (!(event.target instanceof Node) || !ref.contains(event.target)) props.onClose()
  }
  onMount(() => {
    const box = ref.getBoundingClientRect()
    const at = popupAt(
      {
        x: getComputedStyle(props.anchor).direction === "rtl" ? rect.left : rect.right - box.width,
        top: rect.top,
        bottom: rect.bottom,
      },
      { w: box.width, h: box.height },
      { w: window.innerWidth, h: window.innerHeight },
    )
    ref.style.left = `${Math.round(at.x)}px`
    ref.style.top = `${Math.round(at.y)}px`
    document.addEventListener("pointerdown", down, true)
    window.addEventListener("keydown", key, true)
    window.addEventListener("scroll", scroll, true)
    ref.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus({ preventScroll: true })
  })
  onCleanup(() => {
    document.removeEventListener("pointerdown", down, true)
    window.removeEventListener("keydown", key, true)
    window.removeEventListener("scroll", scroll, true)
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
          onFocusOut={(event) => {
            const to = event.relatedTarget
            if (to instanceof Node && !ref.contains(to) && !props.anchor.contains(to)) props.onClose()
          }}
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
                    // The item is about to leave the page: focus goes back to the button that opened the menu, so a
                    // dialog this opens returns there when it closes.
                    props.anchor.focus({ preventScroll: true })
                    swallowRepeats()
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

// Use the same modal/focus stack as node details, including dialogs opened from a node's actions. The second click of
// a double-click on whatever opened it neither dismisses the dialog nor lands on what sits under that spot in it.
export function RelayModal(props: {
  class: string
  label?: string
  labelledby?: string
  component?: string
  busy?: boolean
  children: JSX.Element
  onClose: () => void
  focus?: (dialog: HTMLElement) => void
}) {
  const previous = document.activeElement
  const origin = press
  return (
    <Dialog open onOpenChange={(open) => !open && !props.busy && props.onClose()}>
      <Dialog.Portal>
        <div class="wf-scope">
          <div class="wf-modal-layer">
            <Dialog.Overlay class="wf-modal-backdrop" />
            <Dialog.Content
              class={props.class}
              aria-label={props.label}
              aria-labelledby={props.labelledby}
              data-component={props.component ?? "relay-modal"}
              data-relay-modal=""
              aria-busy={props.busy}
              onOpenAutoFocus={(event) => {
                event.preventDefault()
                const dialog = event.currentTarget as HTMLElement
                CLICKS.forEach((type) =>
                  dialog.addEventListener(
                    type,
                    (repeat) => {
                      if (!repeats(origin, repeat)) return
                      repeat.stopPropagation()
                      repeat.preventDefault()
                    },
                    true,
                  ),
                )
                if (props.focus) return props.focus(dialog)
                ;(
                  dialog.querySelector<HTMLElement>("[autofocus],input,textarea") ??
                  dialog.querySelector<HTMLElement>("button")
                )?.focus({ preventScroll: true })
              }}
              onCloseAutoFocus={(event) => {
                event.preventDefault()
                if (previous instanceof HTMLElement && previous.isConnected) previous.focus({ preventScroll: true })
              }}
              onEscapeKeyDown={(event) => {
                event.preventDefault()
                event.stopPropagation()
                if (!props.busy) props.onClose()
              }}
              onInteractOutside={(event) => {
                // Kobalte hands over the DOM event that caused it as `detail.originalEvent`.
                const cause: unknown = event instanceof CustomEvent ? event.detail?.originalEvent : undefined
                if (props.busy || (cause instanceof Event && repeats(origin, cause))) event.preventDefault()
              }}
            >
              {props.children}
            </Dialog.Content>
          </div>
        </div>
      </Dialog.Portal>
    </Dialog>
  )
}

export function RelayDialog(props: {
  title: string
  description?: JSX.Element
  wide?: boolean
  busy?: boolean
  label?: string
  children: JSX.Element
  foot: JSX.Element
  onClose: () => void
  onSubmit?: () => void
}) {
  const copy = useRelayCopy()
  return (
    <RelayModal
      class={`mx-dialog${props.wide ? " wide" : ""}`}
      label={props.label ?? props.title}
      busy={props.busy}
      onClose={props.onClose}
    >
      <form
        onSubmit={(event) => {
          event.preventDefault()
          if (!props.busy) props.onSubmit?.()
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
            disabled={props.busy}
            onClick={props.onClose}
          >
            <Ic name="close" />
          </button>
        </header>
        <div class="mx-dialog-body">{props.children}</div>
        <footer class="mx-dialog-foot">{props.foot}</footer>
      </form>
    </RelayModal>
  )
}
