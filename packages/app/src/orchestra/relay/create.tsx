import { createSignal, For, Show } from "solid-js"
import type { RelayDocument } from "./client"
import { createAction } from "./dialogs"
import type { Flow } from "./graph"
import { TemplateCard } from "./parts"
import { blankWorkflow, copyWorkflow } from "./presets"
import type { RelaySource } from "./source"
import { RelayDialog, useRelayCopy } from "./ui"

// The first workflow in the profile is the default template; an empty profile starts blank.
export const templateID = (documents: RelayDocument[]) => documents[0]?.id ?? "blank"

export function CreateWorkflowDialog(props: {
  source: RelaySource
  flows: Map<string, Flow>
  initial: string
  onClose: () => void
  onCreated: (id: string) => void
}) {
  const copy = useRelayCopy()
  const action = createAction()
  const documents = () => props.source.list().slice(0, 5)
  const nameOf = (id: string) => {
    const source = props.source.list().find((item) => item.id === id)
    return source
      ? copy.t("orchestra.workflows.create.copyName", { name: source.name })
      : copy.t("orchestra.workflows.template.blank")
  }
  const [pick, setPick] = createSignal(props.initial)
  const [name, setName] = createSignal(nameOf(props.initial))
  const [invalid, setInvalid] = createSignal(false)
  let input!: HTMLInputElement
  const create = () => {
    const value = name().trim()
    if (!value) {
      setInvalid(true)
      input.focus()
      return
    }
    const source = props.source.list().find((item) => item.id === pick())
    return action.run(async () => {
      const created = await props.source.client.create(
        source ? copyWorkflow(source, value) : blankWorkflow(value, copy.t("orchestra.workflows.type.start")),
      )
      props.source
        .queryClient()
        .setQueryData(props.source.key("documents"), (list: RelayDocument[] | undefined) => [created, ...(list ?? [])])
      props.onCreated(created.id)
    })
  }
  return (
    <RelayDialog
      title={copy.t("orchestra.workflows.create.title")}
      description={copy.t("orchestra.workflows.create.description")}
      wide
      onClose={props.onClose}
      onSubmit={create}
      foot={
        <>
          <button type="button" class="mx-btn" onClick={props.onClose}>
            {copy.t("orchestra.workflows.dialog.cancel")}
          </button>
          <button type="submit" class="mx-btn primary" disabled={action.busy()}>
            {copy.t("orchestra.workflows.create.submit")}
          </button>
        </>
      }
    >
      <label class="mx-field" classList={{ invalid: invalid() }}>
        <span>{copy.t("orchestra.workflows.create.name")}</span>
        <input
          ref={(element) => {
            input = element
            queueMicrotask(() => element.select())
          }}
          name="name"
          value={name()}
          aria-invalid={invalid()}
          onInput={(event) => {
            setName(event.currentTarget.value)
            setInvalid(false)
          }}
        />
        <Show when={invalid()}>
          <span class="mx-hint" role="alert" style={{ color: "var(--mx-bad)" }}>
            {copy.t("orchestra.workflows.create.nameRequired")}
          </span>
        </Show>
      </label>
      <div class="mx-field" style={{ "margin-bottom": "0" }}>
        <span id="wf-template-label">{copy.t("orchestra.workflows.create.template")}</span>
        <div class="wf-tpl-grid" role="radiogroup" aria-labelledby="wf-template-label">
          <For each={["blank", ...documents().map((document) => document.id)]}>
            {(id) => (
              <TemplateCard
                id={id}
                radio
                selected={pick() === id}
                flows={props.flows}
                documents={props.source.list()}
                onPick={(next) => {
                  setPick(next)
                  setName(nameOf(next))
                  setInvalid(false)
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
