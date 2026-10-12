import { createUniqueId, For, Show } from "solid-js"
import { createStore } from "solid-js/store"
import { rememberDocument } from "./cache"
import { documentProfile, type RelayDocument } from "./client"
import { createAction } from "./dialogs"
import type { Flow } from "./graph"
import { TemplateCard } from "./parts"
import { blankWorkflow, copyDocument } from "./presets"
import type { RelaySource } from "./source"
import { RelayDialog, useRelayCopy } from "./ui"

// Templates are the shipped Relay profiles the server seeded: the ones that can run first, then by name.
export const templates = (documents: RelayDocument[]) =>
  documents
    .filter((document) => documentProfile(document) !== undefined)
    .toSorted((a, b) => Number(b.runnable) - Number(a.runnable) || a.name.localeCompare(b.name))

// The first runnable profile is the default; a profile without one starts blank.
export const templateID = (documents: RelayDocument[]) =>
  templates(documents).find((document) => document.runnable)?.id ?? "blank"

export function CreateWorkflowDialog(props: {
  source: RelaySource
  flows: Map<string, Flow>
  initial: string
  onClose: () => void
  onCreated: (id: string) => void
}) {
  const copy = useRelayCopy()
  const action = createAction()
  const documents = () => templates(props.source.list())
  const nameOf = (id: string) => {
    const source = props.source.list().find((item) => item.id === id)
    return source
      ? copy.t("orchestra.workflows.create.copyName", { name: source.name })
      : copy.t("orchestra.workflows.template.blank")
  }
  const [draft, setDraft] = createStore({
    pick: props.initial,
    name: nameOf(props.initial),
    custom: false,
    invalid: false,
  })
  const nameError = createUniqueId()
  const templateLabel = createUniqueId()
  let input!: HTMLInputElement
  const create = () => {
    if (action.busy()) return
    const value = draft.name.trim()
    if (!value) {
      setDraft("invalid", true)
      input.focus()
      return
    }
    const source = documents().find((item) => item.id === draft.pick)
    if (draft.pick !== "blank" && (!source || !source.runnable)) {
      action.setError(copy.t("orchestra.workflows.create.templateUnavailable"))
      return
    }
    return action.run(async () => {
      const created = await props.source.client.create(
        source ? copyDocument(source, value) : blankWorkflow(value, copy.t("orchestra.workflows.type.start")),
      )
      await rememberDocument(props.source.queryClient(), props.source.key("documents"), created)
      props.onCreated(created.id)
    })
  }
  return (
    <RelayDialog
      title={copy.t("orchestra.workflows.create.title")}
      description={copy.t("orchestra.workflows.create.description")}
      wide
      busy={action.busy()}
      onClose={props.onClose}
      onSubmit={create}
      foot={
        <>
          <button type="button" class="mx-btn" disabled={action.busy()} onClick={props.onClose}>
            {copy.t("orchestra.workflows.dialog.cancel")}
          </button>
          <button type="submit" class="mx-btn primary" disabled={action.busy()}>
            {copy.t(action.busy() ? "orchestra.workflows.editor.saving" : "orchestra.workflows.create.submit")}
          </button>
        </>
      }
    >
      <label class="mx-field" classList={{ invalid: draft.invalid }}>
        <span>{copy.t("orchestra.workflows.create.name")}</span>
        <input
          ref={(element) => {
            input = element
            queueMicrotask(() => {
              if (!element.isConnected) return
              element.focus()
              element.select()
            })
          }}
          name="name"
          autofocus
          disabled={action.busy()}
          value={draft.name}
          aria-invalid={draft.invalid}
          aria-describedby={draft.invalid ? nameError : undefined}
          onInput={(event) => {
            setDraft({ name: event.currentTarget.value, custom: true, invalid: false })
          }}
        />
        <Show when={draft.invalid}>
          <span id={nameError} class="mx-hint" role="alert" style={{ color: "var(--mx-bad)" }}>
            {copy.t("orchestra.workflows.create.nameRequired")}
          </span>
        </Show>
      </label>
      <div class="mx-field" style={{ "margin-bottom": "0" }}>
        <span id={templateLabel}>{copy.t("orchestra.workflows.create.template")}</span>
        <div
          class="wf-tpl-grid"
          role="radiogroup"
          aria-labelledby={templateLabel}
          onKeyDown={(event) => {
            if (
              action.busy() ||
              !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)
            ) return
            const choices = [
              ...event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="radio"]:not([aria-disabled="true"])'),
            ]
            const index = choices.indexOf(event.target as HTMLButtonElement)
            if (index < 0) return
            event.preventDefault()
            const rtl = getComputedStyle(event.currentTarget).direction === "rtl"
            const forward = event.key === "ArrowDown" || event.key === (rtl ? "ArrowLeft" : "ArrowRight")
            const next =
              event.key === "Home"
                ? 0
                : event.key === "End"
                  ? choices.length - 1
                  : (index + (forward ? 1 : -1) + choices.length) % choices.length
            choices[next]?.focus()
            choices[next]?.click()
          }}
        >
          <For each={["blank", ...documents().map((document) => document.id)]}>
            {(id) => (
              <TemplateCard
                id={id}
                radio
                selected={draft.pick === id}
                disabled={action.busy()}
                tabstop={
                  id === "blank" && !documents().some((document) => document.id === draft.pick && document.runnable)
                }
                flows={props.flows}
                documents={props.source.list()}
                onPick={(next) => {
                  setDraft({ pick: next, name: draft.custom ? draft.name : nameOf(next), invalid: false })
                  action.setError(undefined)
                }}
              />
            )}
          </For>
        </div>
      </div>
      <Show when={action.error()}>
        <p class="mx-error" role="alert" style={{ margin: "14px 0 0" }}>
          {action.error()}
        </p>
      </Show>
    </RelayDialog>
  )
}
