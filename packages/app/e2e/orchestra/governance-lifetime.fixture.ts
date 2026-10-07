import { createComponent, createEffect, Show } from "solid-js"
import { createStore } from "solid-js/store"
import { render } from "solid-js/web"
import { DialogProvider, useDialog } from "@opencode-ai/ui/context/dialog"
import { Dialog, DialogTitle } from "@opencode-ai/ui/v2/dialog-v2"

// Real shared dialog roots and keyed owners; only the route/data surroundings are reduced.
function Harness() {
  const dialog = useDialog()
  const [state, setState] = createStore({ route: "server-a" })
  const first = { dispose: undefined as (() => void) | undefined, open: undefined as (() => void) | undefined }
  const route = document.createElement("output")
  route.setAttribute("aria-label", "Owning route")
  createEffect(() => {
    route.textContent = state.route
  })

  function Owner(props: { server: string }) {
    const owned = useDialog()
    const open = () =>
      void owned.showOwned((dispose) => {
        first.dispose ??= dispose
        return surface(`Governance ${props.server}`, "governance-owned-dialog")
      })
    first.open ??= open
    return button("Open governance", open)
  }

  return [
    route,
    button("Home", () => setState("route", "home")),
    button("Server B", () => setState("route", "server-b")),
    button("Replace dialog", () => void dialog.show(() => surface("Replacement", "governance-other-dialog"))),
    button("Push dialog", () => void dialog.push(() => surface("Newer", "governance-other-dialog"))),
    button("Dispose first dialog", () => first.dispose?.()),
    button("Open from disposed owner", () => first.open?.()),
    button("Close latest and leave", () => {
      dialog.close()
      setState("route", "home")
    }),
    Show({
      get when() {
        return state.route === "home" ? undefined : state.route
      },
      keyed: true,
      children: (server) => createComponent(Owner, { server }),
    }),
  ]
}

function surface(title: string, className: string) {
  return createComponent(Dialog, {
    class: className,
    get children() {
      return createComponent(DialogTitle, { children: title })
    },
  })
}

function button(label: string, onClick: () => void) {
  const element = document.createElement("button")
  element.textContent = label
  element.addEventListener("click", onClick)
  return element
}

export function mount() {
  render(
    () =>
      createComponent(DialogProvider, {
        get children() {
          return createComponent(Harness, {})
        },
      }),
    document.getElementById("root")!,
  )
}
