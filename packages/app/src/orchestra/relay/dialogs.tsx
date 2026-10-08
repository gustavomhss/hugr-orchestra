import { createSignal, For, type JSX, Show } from "solid-js"
import type { RelayDocument } from "./client"
import { checkCount, type Flow, retryBudget, steps } from "./graph"
import { phaseNames } from "./parts"
import type { RelaySource } from "./source"
import { RelayDialog, useRelayCopy } from "./ui"

export const failure = (error: unknown) => (error instanceof Error && error.message ? error.message : String(error))

// Runs one async action at a time and keeps its error on screen.
export function createAction() {
  const [busy, setBusy] = createSignal(false)
  const [error, setError] = createSignal<string>()
  const run = async (action: () => Promise<unknown>) => {
    if (busy()) return
    setBusy(true)
    setError(undefined)
    const result = await action().then(
      () => undefined,
      (cause: unknown) => failure(cause),
    )
    setBusy(false)
    setError(result)
  }
  return { busy, error, run, setError }
}

function Foot(props: {
  busy: boolean
  cancel: string
  submit: JSX.Element
  danger?: boolean
  disabled?: boolean
  onCancel: () => void
}) {
  return (
    <>
      <button type="button" class="mx-btn" onClick={props.onCancel}>
        {props.cancel}
      </button>
      <button
        type="submit"
        class={props.danger ? "mx-btn danger" : "mx-btn primary"}
        disabled={props.busy || props.disabled}
      >
        {props.submit}
      </button>
    </>
  )
}

export function PublishDialog(props: {
  document: RelayDocument
  flow: Flow
  source: RelaySource
  onClose: () => void
}) {
  const copy = useRelayCopy()
  const action = createAction()
  const workflow = props.flow.kind === "workflow"
  const publish = () =>
    action.run(async () => {
      const published = await props.source.client.publish(props.document)
      props.source
        .queryClient()
        .setQueryData(props.source.key("documents"), (list: RelayDocument[] | undefined) =>
          list?.map((item) => (item.id === published.id ? published : item)),
        )
      props.onClose()
    })
  return (
    <RelayDialog
      title={copy.t("orchestra.workflows.publish.title", { version: props.document.versionCounter })}
      description={copy.t(workflow ? "orchestra.workflows.publish.workflow" : "orchestra.hooks.publish.description")}
      onClose={props.onClose}
      onSubmit={publish}
      foot={
        <Foot
          busy={action.busy()}
          cancel={copy.t("orchestra.workflows.dialog.cancel")}
          submit={copy.t("orchestra.workflows.publish.title", { version: props.document.versionCounter })}
          onCancel={props.onClose}
        />
      }
    >
      <dl class="wf-kv">
        <dt>{copy.t("orchestra.workflows.publish.name")}</dt>
        <dd>{props.document.name}</dd>
        <dt>{copy.t("orchestra.workflows.publish.live")}</dt>
        <dd>
          {props.document.publishedCounter !== undefined
            ? `v${props.document.publishedCounter}`
            : props.document.activeVersionId
              ? copy.t("orchestra.workflows.badge.publishedPlain")
              : copy.t("orchestra.workflows.publish.nothing")}
        </dd>
        <Show when={workflow}>
          <dt>{copy.t("orchestra.workflows.publish.contents")}</dt>
          <dd>
            {[
              copy.count(
                phaseNames(props.flow).length,
                "orchestra.workflows.count.phase.one",
                "orchestra.workflows.count.phase.other",
              ),
              copy.count(
                steps(props.flow).length,
                "orchestra.workflows.count.step.one",
                "orchestra.workflows.count.step.other",
              ),
              copy.count(
                checkCount(props.flow),
                "orchestra.workflows.count.check.one",
                "orchestra.workflows.count.check.other",
              ),
              copy.t("orchestra.workflows.publish.budget", { count: retryBudget(props.flow) }),
            ].join(" · ")}
          </dd>
        </Show>
      </dl>
      <Show when={action.error()}>
        <p class="mx-error" role="alert" style={{ margin: "14px 0 0" }}>
          {action.error()}
        </p>
      </Show>
    </RelayDialog>
  )
}

export function DeleteDialog(props: {
  document: RelayDocument
  kind: "workflow" | "hook"
  source: RelaySource
  onClose: () => void
  onDeleted: () => void
}) {
  const copy = useRelayCopy()
  const action = createAction()
  const remove = () =>
    action.run(async () => {
      await props.source.client.remove(props.document.id)
      props.source
        .queryClient()
        .setQueryData(props.source.key("documents"), (list: RelayDocument[] | undefined) =>
          list?.filter((item) => item.id !== props.document.id),
        )
      props.onDeleted()
    })
  return (
    <RelayDialog
      title={copy.t("orchestra.workflows.delete.title", { name: props.document.name })}
      description={copy.t(
        props.kind === "workflow" ? "orchestra.workflows.delete.workflow" : "orchestra.hooks.delete.description",
      )}
      onClose={props.onClose}
      onSubmit={remove}
      foot={
        <Foot
          busy={action.busy()}
          danger
          cancel={copy.t("orchestra.workflows.dialog.cancel")}
          submit={copy.t("orchestra.workflows.delete.confirm")}
          onCancel={props.onClose}
        />
      }
    >
      <p class="mx-note" style={{ margin: 0 }}>
        {copy.t("orchestra.workflows.delete.undo")}
      </p>
      <Show when={action.error()}>
        <p class="mx-error" role="alert" style={{ margin: "14px 0 0" }}>
          {action.error()}
        </p>
      </Show>
    </RelayDialog>
  )
}

const SHORTCUTS = [
  "palette",
  "back",
  "escape",
  "add",
  "open",
  "delete",
  "nav",
  "selectAll",
  "fit",
  "zoom",
  "reset",
  "wheel",
  "pan",
  "box",
  "help",
] as const

export function ShortcutsDialog(props: { onClose: () => void }) {
  const copy = useRelayCopy()
  return (
    <RelayDialog
      title={copy.t("orchestra.workflows.keys.title")}
      description={copy.t("orchestra.workflows.keys.description")}
      wide
      onClose={props.onClose}
      foot={
        <button type="button" class="mx-btn" onClick={props.onClose}>
          {copy.t("orchestra.workflows.dialog.close")}
        </button>
      }
    >
      <div class="wf-keys">
        <For each={SHORTCUTS}>
          {(key) => (
            <div class="mx-row">
              <span>{copy.t(`orchestra.workflows.keys.${key}`)}</span>
              <span>
                <kbd>{copy.t(`orchestra.workflows.keys.${key}.key`)}</kbd>
              </span>
            </div>
          )}
        </For>
      </div>
    </RelayDialog>
  )
}
