import { createMemo, onCleanup, onMount, Show } from "solid-js"
import { createStore } from "solid-js/store"
import type { ActionKey } from "@/i18n/actions"
import { usePlatform } from "@/context/platform"
import type { ViewProps } from "./contract"

/** Enrollment material belongs to this live response, never to preferences or receipt replay. */
export function CommandOutput(props: ViewProps) {
  const platform = usePlatform()
  const [view, setView] = createStore<{ copied: boolean; error?: ActionKey }>({ copied: false })
  let element: HTMLDialogElement | undefined
  let disposed = false
  const output = () => props.model.state.commandOutput
  const material = createMemo(() => {
    const value = output()
    return value?.kind === "runnerJit" ? value.encodedConfiguration
      : value?.kind === "runnerToken" || value?.kind === "triggerToken" ? value.token : undefined
  })
  const reviewURL = createMemo(() => {
    const value = output()
    const url = value?.kind === "sourceReview" ? URL.parse(value.url) : undefined
    return url?.protocol === "https:" && url.host === props.model.state.binding?.provider.hostname && !url.username && !url.password
      ? url.href : undefined
  })
  const close = () => props.model.dialog(undefined)
  const copy = () => {
    const value = material()
    if (!value) return
    void navigator.clipboard.writeText(value).then(() => { if (!disposed) setView({ copied: true, error: undefined }) },
      () => { if (!disposed) setView("error", "orchestra.actions.copyOutputFailed") })
  }
  onMount(() => element?.showModal())
  onCleanup(() => {
    disposed = true
    const input = element?.querySelector("input")
    if (input) input.value = ""
    element?.close()
  })
  return <dialog ref={element} class="mx-dialog actions-dialog" aria-labelledby="actions-output-title"
    onCancel={(event) => { event.preventDefault(); close() }}>
    <form method="dialog" onSubmit={(event) => { event.preventDefault(); close() }}>
      <header class="mx-dialog-head"><div><h2 id="actions-output-title">{props.t(material() ? "orchestra.actions.installRunner" : "orchestra.actions.reviewSource")}</h2></div></header>
      <div class="mx-dialog-body">
        <Show when={material()}>{(value) => <>
          <p>{props.t("orchestra.actions.oneTimeOutput")}</p>
          <label class="mx-field"><span>{props.t("orchestra.actions.installationMaterial")}</span>
            <input type="password" readonly autocomplete="off" dir="ltr" value={value()} />
          </label>
          <button type="button" class="mx-btn" onClick={copy}>{props.t(view.copied ? "orchestra.actions.outputCopied" : "orchestra.actions.copyOutput")}</button>
        </>}</Show>
        <Show when={reviewURL()}>{(url) => <button type="button" class="mx-btn" onClick={() => platform.openExternal(url())}>{props.t("orchestra.actions.open")}</button>}</Show>
        <Show when={view.error}>{(key) => <p class="mx-error" role="alert">{props.t(key())}</p>}</Show>
      </div>
      <footer class="mx-dialog-foot"><button type="submit" class="mx-btn primary" autofocus>{props.t("orchestra.actions.close")}</button></footer>
    </form>
  </dialog>
}
