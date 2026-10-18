import { getFilename } from "@orchestra/core/util/path"
import { For, Show } from "solid-js"
import { showToast } from "@/utils/toast"
import { RelayError, type RelayInstall } from "./client"
import { createAction } from "./dialogs"
import { installNotice, refreshInstalls } from "./hook-install"
import type { RelaySource } from "./source"
import { Ic, RelayDialog, useRelayCopy } from "./ui"

// The hook library dialogs that change what is installed: reset a damaged hooks file, uninstall, and set the order.

export function RepairDialog(props: { source: RelaySource; onClose: () => void }) {
  const copy = useRelayCopy()
  const action = createAction()
  const repair = () =>
    action.run(async () => {
      // A refusal (the file turned out to be valid) is worth a fresh read too.
      const repaired = await props.source.client.repair().finally(() => props.source.invalidate("installs"))
      showToast({
        title: copy.t("orchestra.hooks.repair.done"),
        description: copy.t("orchestra.hooks.repair.backup", { file: getFilename(repaired.backup) }),
      })
      props.onClose()
    })
  return (
    <RelayDialog
      title={copy.t("orchestra.hooks.repair.dialogTitle")}
      description={copy.t("orchestra.hooks.repair.dialogBody")}
      busy={action.busy()}
      onClose={props.onClose}
      onSubmit={repair}
      foot={
        <DangerFoot busy={action.busy()} submit={copy.t("orchestra.hooks.repair.confirm")} onCancel={props.onClose} />
      }
    >
      <Failure message={action.error()} />
    </RelayDialog>
  )
}

export function UninstallDialog(props: {
  install: RelayInstall
  name: string
  source: RelaySource
  onClose: () => void
}) {
  const copy = useRelayCopy()
  const action = createAction()
  // Removed either way: an install that is already gone has nothing left to uninstall, and a failed audit receipt
  // does not undo the removal, so a retry would only answer "no such install".
  const removed = (error: unknown) => {
    const code = error instanceof RelayError ? error.code : undefined
    if (code === "receipt-unrecorded") return installNotice(copy, "uninstall", error)
    if (code !== "install-missing") throw error
  }
  const uninstall = () =>
    action.run(async () => {
      await props.source.client
        .uninstall(props.install.installID)
        .catch(removed)
        .finally(() => refreshInstalls(props.source))
      props.onClose()
    })
  return (
    <RelayDialog
      title={copy.t("orchestra.hooks.uninstall.title", { name: props.name })}
      description={copy.t("orchestra.hooks.uninstall.body")}
      busy={action.busy()}
      onClose={props.onClose}
      onSubmit={uninstall}
      foot={
        <DangerFoot
          busy={action.busy()}
          submit={copy.t("orchestra.hooks.uninstall.confirm")}
          onCancel={props.onClose}
        />
      }
    >
      <Failure message={action.error()} />
    </RelayDialog>
  )
}

export function OrderDialog(props: { source: RelaySource; name: (document: string) => string; onClose: () => void }) {
  const copy = useRelayCopy()
  const action = createAction()
  const list = () => (props.source.installs.data ?? []).toSorted((a, b) => a.order - b.order)
  const move = (index: number, by: -1 | 1) =>
    action.run(async () => {
      const ids = list().map((item) => item.installID)
      const installs = await props.source.client.order(ids.toSpliced(index, 1).toSpliced(index + by, 0, ids[index]!))
      props.source.queryClient().setQueryData<RelayInstall[]>(props.source.key("installs"), installs)
    })
  return (
    <RelayDialog
      title={copy.t("orchestra.hooks.order.title")}
      description={copy.t("orchestra.hooks.order.description")}
      busy={action.busy()}
      onClose={props.onClose}
      onSubmit={props.onClose}
      foot={
        <button type="submit" class="mx-btn primary">
          {copy.t("orchestra.hooks.order.done")}
        </button>
      }
    >
      <ol class="hk-order">
        <For each={list()}>
          {(item, index) => {
            const name = () => props.name(item.document)
            return (
              <li data-install={item.installID}>
                <span class="hk-order-n">{index() + 1}</span>
                <span class="hk-order-name">{name()}</span>
                <Show when={!item.enabled}>
                  <span class="mx-badge">{copy.t("orchestra.hooks.row.paused")}</span>
                </Show>
                <button
                  type="button"
                  class="mx-btn icon"
                  aria-label={copy.t("orchestra.hooks.order.up", { name: name() })}
                  disabled={action.busy() || index() === 0}
                  onClick={() => void move(index(), -1)}
                >
                  <Ic name="chevron" class="wf-ic hk-up" />
                </button>
                <button
                  type="button"
                  class="mx-btn icon"
                  aria-label={copy.t("orchestra.hooks.order.down", { name: name() })}
                  disabled={action.busy() || index() === list().length - 1}
                  onClick={() => void move(index(), 1)}
                >
                  <Ic name="chevron" class="wf-ic hk-down" />
                </button>
              </li>
            )
          }}
        </For>
      </ol>
      <Failure message={action.error()} />
    </RelayDialog>
  )
}

function DangerFoot(props: { busy: boolean; submit: string; onCancel: () => void }) {
  const copy = useRelayCopy()
  return (
    <>
      <button type="button" class="mx-btn" disabled={props.busy} onClick={props.onCancel}>
        {copy.t("orchestra.workflows.dialog.cancel")}
      </button>
      <button type="submit" class="mx-btn danger" disabled={props.busy}>
        {props.submit}
      </button>
    </>
  )
}

function Failure(props: { message: string | undefined }) {
  return (
    <Show when={props.message}>
      <p class="mx-error" role="alert" style={{ margin: "14px 0 0" }}>
        {props.message}
      </p>
    </Show>
  )
}
