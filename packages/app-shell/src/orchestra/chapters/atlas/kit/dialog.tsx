import { type JSX, onMount, Show } from "solid-js"
import { useLanguage } from "@/context/language"

// One native modal dialog (the mock's #dialog and its head()/foot()), like chapters/skills-dialog.tsx. The owner
// mounts it to open it and unmounts it in onClose; Escape, the backdrop and Cancel all close it.
export function AtDialog(props: {
  title: string
  text?: string
  wide?: boolean
  onClose: () => void
  onSubmit?: (event: SubmitEvent & { currentTarget: HTMLFormElement }) => void
  children: JSX.Element
  footer?: JSX.Element
}) {
  let dialog!: HTMLDialogElement
  onMount(() => {
    dialog.showModal()
    dialog.querySelector<HTMLElement>("textarea, input")?.focus()
  })
  return (
    <dialog
      ref={dialog}
      class="mx-dialog"
      classList={{ wide: !!props.wide }}
      aria-labelledby="atlas-dialog-title"
      // A Kobalte layer behind this modal can take Escape on the document; the modal is the top layer, so it takes it first.
      on:keydown={(event) => {
        if (event.key !== "Escape" || event.defaultPrevented) return
        event.preventDefault()
        dialog.close()
      }}
      onClose={() => props.onClose()}
      onClick={(event) => {
        if (event.target !== dialog) return
        const rect = dialog.getBoundingClientRect()
        const inside =
          event.clientX >= rect.left && event.clientX <= rect.right && event.clientY >= rect.top && event.clientY <= rect.bottom
        if (!inside) dialog.close()
      }}
    >
      <form
        autocomplete="off"
        onSubmit={(event) => {
          event.preventDefault()
          props.onSubmit?.(event)
        }}
      >
        <header class="mx-dialog-head">
          <div>
            <h2 id="atlas-dialog-title">{props.title}</h2>
            <Show when={props.text}>
              <p>{props.text}</p>
            </Show>
          </div>
        </header>
        <div class="mx-dialog-body">{props.children}</div>
        {props.footer}
      </form>
    </dialog>
  )
}

// The sheet footer: a note on the left, Cancel, then the primary action.
export function AtDialogFoot(props: {
  note?: JSX.Element
  label: string
  onConfirm: () => void
  onCancel: () => void
  disabled?: boolean
}) {
  const language = useLanguage()
  return (
    <footer class="mx-dialog-foot">
      <span class="at-foot-note">{props.note}</span>
      <button type="button" class="mx-btn" onClick={() => props.onCancel()}>
        {language.t("orchestra.atlas.kit.cancel")}
      </button>
      <button type="button" class="mx-btn primary" disabled={props.disabled} onClick={() => props.onConfirm()}>
        {props.label}
      </button>
    </footer>
  )
}
