import { type JSX, onMount, Show } from "solid-js"
import { useLanguage } from "@/context/language"
import { backdropDismiss } from "../../dialog-backdrop"

// One native modal dialog (the mock's #dialog and its head()/foot()), like chapters/skills-dialog.tsx. The owner
// mounts it to open it and unmounts it in onClose; Escape, the backdrop and Cancel all close it.
export function AtDialog(props: {
  title: string
  text?: string
  wide?: boolean
  // A refusal the sheet cannot leave behind: a toast sits under the modal, so the reason shows here.
  error?: string
  onClose: () => void
  children: JSX.Element
  footer?: JSX.Element
}) {
  let dialog!: HTMLDialogElement
  const backdrop = backdropDismiss((target) => target.close())
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
      onPointerDown={backdrop.onPointerDown}
      onClick={backdrop.onClick}
    >
      <form
        autocomplete="off"
        // Enter in a field clicks the sheet's confirm button (see AtDialogFoot); the submit itself does nothing more.
        onSubmit={(event) => event.preventDefault()}
      >
        <header class="mx-dialog-head">
          <div>
            <h2 id="atlas-dialog-title">{props.title}</h2>
            <Show when={props.text}>
              <p>{props.text}</p>
            </Show>
          </div>
        </header>
        <div class="mx-dialog-body">
          <Show when={props.error}>
            <p class="mx-error" role="alert">
              {props.error}
            </p>
          </Show>
          {props.children}
        </div>
        {props.footer}
      </form>
    </dialog>
  )
}

// The sheet footer: a note on the left, Cancel, then the primary action. The primary action is the form's submit
// button, so Enter in a field confirms like a click; while it is disabled, Enter does nothing.
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
      <button type="submit" class="mx-btn primary" disabled={props.disabled} onClick={() => props.onConfirm()}>
        {props.label}
      </button>
    </footer>
  )
}
