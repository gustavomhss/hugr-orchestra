import {
  createContext,
  createEffect,
  createRoot,
  createSignal,
  getOwner,
  onCleanup,
  type Owner,
  type ParentProps,
  runWithOwner,
  useContext,
  type JSX,
  startTransition,
  For,
} from "solid-js"
import { Dialog as Kobalte } from "@kobalte/core/dialog"
import { makeEventListener } from "@solid-primitives/event-listener"

type DialogElement = (dispose: () => void) => JSX.Element

type Active = {
  id: string
  node: JSX.Element
  dispose: () => void
  owner: Owner
  onClose?: () => void
  closing: () => boolean
  setClosing: (closing: boolean) => void
  focus: { opener?: HTMLElement; element?: HTMLDivElement }
}

const Context = createContext<ReturnType<typeof init>>()

function init() {
  const [stack, setStack] = createSignal<Active[]>([])
  const timer = { current: undefined as ReturnType<typeof setTimeout> | undefined }
  const lock = { value: false }
  const life = { active: true }

  onCleanup(() => {
    life.active = false
    if (timer.current === undefined) return
    clearTimeout(timer.current)
    timer.current = undefined
  })

  const remove = (id: string) => {
    const current = stack().find((item) => item.id === id)
    if (!current) return
    const focused = document.activeElement
    const restore =
      stack().at(-1) === current &&
      (focused === document.body || (focused instanceof Node && current.focus.element?.contains(focused)))
    current.dispose()
    setStack((items) => items.filter((item) => item.id !== id))
    const next = stack().at(-1)
    if (!restore) return
    queueMicrotask(() => {
      if (!life.active || stack().at(-1) !== next) return
      const active = document.activeElement
      if (active && active !== document.body && active.isConnected && active !== focused) return
      const opener = current.focus.opener
      if (opener?.isConnected && (!next || next.focus.element?.contains(opener))) {
        opener.focus({ preventScroll: true })
        return
      }
      // A removed opener must not send focus behind a still-open dialog.
      next?.focus.element
        ?.querySelector<HTMLElement>("button:not(:disabled), input:not(:disabled), [tabindex='0']")
        ?.focus({ preventScroll: true })
    })
  }

  const close = (id?: string) => {
    const items = stack()
    const current = id ? items.find((item) => item.id === id) : items.at(-1)
    if (!current || lock.value) return
    lock.value = true
    current.onClose?.()
    current.setClosing(true)

    const closed = current.id
    if (timer.current !== undefined) {
      clearTimeout(timer.current)
      timer.current = undefined
    }

    timer.current = setTimeout(() => {
      timer.current = undefined
      remove(closed)
      lock.value = false
    }, 100)
  }

  createEffect(() => {
    if (stack().length === 0) return

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return
      close()
      event.preventDefault()
      event.stopPropagation()
    }

    makeEventListener(window, "keydown", onKeyDown, { capture: true })
  })

  const mount = (
    element: DialogElement,
    owner: Owner,
    onClose: (() => void) | undefined,
    layer: number,
    opener?: HTMLElement,
  ) => {
    const id = Math.random().toString(36).slice(2)
    const zIndex = 50 + layer * 10
    const focus: Active["focus"] = { opener }
    let dispose: (() => void) | undefined
    let closing: (() => boolean) | undefined
    let setClosing: ((closing: boolean) => void) | undefined

    const node = runWithOwner(owner, () =>
      createRoot((d: () => void) => {
        dispose = d
        const [isClosing, setClosingSignal] = createSignal(false)
        closing = isClosing
        setClosing = setClosingSignal
        return (
          <Kobalte
            modal={stack().at(-1)?.id === id}
            open={!isClosing()}
            onOpenChange={(open: boolean) => {
              if (open || stack().at(-1)?.id !== id) return
              close(id)
            }}
          >
            <Kobalte.Portal>
              <Kobalte.Overlay
                data-component="dialog-overlay"
                style={{ "z-index": String(zIndex) }}
                onClick={() => close(id)}
              />
              <div
                ref={(element) => (focus.element = element)}
                data-dialog-layer={layer}
                style={{
                  position: "fixed",
                  inset: "0",
                  "z-index": String(zIndex),
                  display: "flex",
                  "align-items": "center",
                  "justify-content": "center",
                  "pointer-events": "none",
                }}
              >
                {element(() => remove(id))}
              </div>
            </Kobalte.Portal>
          </Kobalte>
        )
      }),
    )

    if (!dispose || !closing || !setClosing) return

    const active: Active = { id, node, dispose, owner, onClose, closing, setClosing, focus }
    setStack((items) => [...items, active])
    return id
  }

  const push = (element: DialogElement, owner: Owner, onClose?: () => void) => {
    if (timer.current !== undefined) {
      clearTimeout(timer.current)
      timer.current = undefined
    }
    lock.value = false
    mount(
      element,
      owner,
      onClose,
      stack().length,
      document.activeElement instanceof HTMLElement ? document.activeElement : undefined,
    )
  }

  const show = (element: DialogElement, owner: Owner, onClose?: () => void) => {
    const focused = document.activeElement
    const opener = stack().some((item) => focused instanceof Node && item.focus.element?.contains(focused))
      ? stack()[0]?.focus.opener
      : focused instanceof HTMLElement
        ? focused
        : undefined
    for (const item of stack()) item.dispose()
    setStack([])
    if (timer.current !== undefined) {
      clearTimeout(timer.current)
      timer.current = undefined
    }
    lock.value = false
    return mount(element, owner, onClose, 0, opener)
  }

  return {
    stack,
    close,
    remove,
    show,
    push,
  }
}

export function DialogProvider(props: ParentProps) {
  const ctx = init()
  return (
    <Context.Provider value={ctx}>
      {props.children}
      <div data-component="dialog-stack">
        <For each={ctx.stack()}>{(item) => item.node}</For>
      </div>
    </Context.Provider>
  )
}

export function useDialog() {
  const ctx = useContext(Context)
  const owner = getOwner()

  if (!owner) {
    throw new Error("useDialog must be used within a DialogProvider")
  }
  if (!ctx) {
    throw new Error("useDialog must be used within a DialogProvider")
  }

  const owned = { id: undefined as string | undefined, disposed: false }
  onCleanup(() => {
    owned.disposed = true
    if (owned.id) ctx.remove(owned.id)
  })

  return {
    get active() {
      return ctx.stack().at(-1)
    },
    // A closed dialog stays on the stack until its exit animation ends, but it no longer owns the keyboard.
    get open() {
      return ctx.stack().some((item) => !item.closing())
    },
    show(element: DialogElement, onClose?: () => void) {
      const base = ctx.stack().at(-1)?.owner ?? owner
      return startTransition(() => ctx.show(element, base, onClose))
    },
    // Dialog roots are detached. Opt in to the calling owner's lifetime, never the active stack owner.
    showOwned(element: DialogElement, onClose?: () => void) {
      return startTransition(() => {
        if (owned.disposed) return
        owned.id = ctx.show(element, owner, onClose)
      })
    },
    push(element: DialogElement, onClose?: () => void) {
      const base = ctx.stack().at(-1)?.owner ?? owner
      return startTransition(() => ctx.push(element, base, onClose))
    },
    close() {
      ctx.close()
    },
  }
}
