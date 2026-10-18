import { createMemo, createSignal, For, Show } from "solid-js"
import { useLocation } from "@solidjs/router"
import { rememberDocument } from "./cache"
import { createAction } from "./dialogs"
import { parseWorkflowFile } from "./import"
import { freeName } from "./presets"
import type { RelaySource } from "./source"
import { RelayDialog, useRelayCopy } from "./ui"

// Opens a workflow from the file "Download definition" wrote, or from the same JSON pasted. It is created as a new
// workflow through the ordinary create call, named like any new one: numbered when the name is already taken.
export function ImportWorkflowDialog(props: {
  source: RelaySource
  onClose: () => void
  onCreated: (id: string) => void
}) {
  const copy = useRelayCopy()
  const action = createAction(useLocation())
  const [text, setText] = createSignal("")
  const [unreadable, setUnreadable] = createSignal(false)
  const parsed = createMemo(() => (text().trim() ? parseWorkflowFile(text(), copy.t) : undefined))
  const errors = () => {
    const result = parsed()
    return result && "errors" in result ? result.errors : []
  }
  const importIt = () => {
    const result = parsed()
    if (!result || "errors" in result) return
    return action.run(async (current) => {
      const base = result.document.name ?? ""
      const name = freeName(
        props.source.list().map((item) => item.name),
        base,
        (n) => copy.t("orchestra.workflows.create.numbered", { name: base, n }),
      )
      const created = await props.source.client.create({ ...result.document, name })
      await rememberDocument(props.source.queryClient(), props.source.key("documents"), created)
      if (!current()) return
      props.onCreated(created.id)
    })
  }
  return (
    <RelayDialog
      title={copy.t("orchestra.workflows.import.title")}
      description={copy.t("orchestra.workflows.import.description")}
      wide
      busy={action.busy()}
      onClose={props.onClose}
      onSubmit={importIt}
      foot={
        <>
          <button type="button" class="mx-btn" disabled={action.busy()} onClick={props.onClose}>
            {copy.t("orchestra.workflows.dialog.cancel")}
          </button>
          <button
            type="submit"
            class="mx-btn primary"
            disabled={action.busy() || !parsed() || errors().length > 0}
          >
            {copy.t(action.busy() ? "orchestra.workflows.editor.saving" : "orchestra.workflows.import.submit")}
          </button>
        </>
      }
    >
      <label class="mx-field">
        <span>{copy.t("orchestra.workflows.import.file")}</span>
        <input
          type="file"
          name="file"
          accept=".json,application/json"
          disabled={action.busy()}
          onChange={async (event) => {
            const file = event.currentTarget.files?.[0]
            if (!file) return
            const read = await file.text().then(
              (value) => value,
              () => undefined,
            )
            setUnreadable(read === undefined)
            if (read !== undefined) setText(read)
            action.setError(undefined)
          }}
        />
      </label>
      <label class="mx-field" style={{ "margin-bottom": "0" }}>
        <span>{copy.t("orchestra.workflows.import.paste")}</span>
        <textarea
          name="definition"
          rows="10"
          spellcheck={false}
          disabled={action.busy()}
          value={text()}
          aria-invalid={errors().length > 0}
          onInput={(event) => {
            setUnreadable(false)
            setText(event.currentTarget.value)
            action.setError(undefined)
          }}
        />
      </label>
      <Show when={unreadable()}>
        <p class="mx-error" role="alert" style={{ margin: "14px 0 0" }}>
          {copy.t("orchestra.workflows.import.unreadable")}
        </p>
      </Show>
      <Show when={errors().length}>
        <ul class="mx-error" role="alert" data-slot="relay-import-errors" style={{ margin: "14px 0 0" }}>
          <For each={errors()}>{(message) => <li>{message}</li>}</For>
        </ul>
      </Show>
      <Show when={action.error()}>
        <p class="mx-error" role="alert" style={{ margin: "14px 0 0" }}>
          {action.error()}
        </p>
      </Show>
    </RelayDialog>
  )
}
