import { For, Match, Show, Switch } from "solid-js"
import { MxPage } from "../chapters/kit"
import type { RelayDocument } from "./client"
import { ConfirmDialog, DeleteDialog, failure, PublishDialog, ShortcutsDialog } from "./dialogs"
import type { openDraft } from "./drafts"
import type { Flow } from "./graph"
import { TestDialog } from "./hook-activity"
import { HookQueryStatus, type HookQueryState } from "./hook-status"
import type { useWorkflowChat } from "./chat"
import { profileDrafts } from "./drafts"
import { type RelayRoute, relayPath } from "./route"
import type { RelaySource } from "./source"
import { Ic, useRelayCopy } from "./ui"
import { showToast } from "@/utils/toast"

export type EditorDialog = "publish" | "unpublish" | "revert" | "delete" | "keys" | "test"
export type TestResult = { path: string[]; result: string; label: string }

const DRAFT_REASON = {
  error: "orchestra.workflows.drafts.reason.error",
  conflict: "orchestra.workflows.drafts.reason.conflict",
  saving: "orchestra.workflows.drafts.reason.saving",
  saved: "orchestra.workflows.drafts.reason.unsaved",
} as const

// Shown instead of the editor when every draft slot is taken, so one of them has to be resolved first.
export function DraftsFull(props: {
  source: RelaySource
  kind: "workflow" | "hook"
  go: (path: string, replace?: boolean) => void
}) {
  const copy = useRelayCopy()
  return (
    <MxPage
      id="relay-drafts-full"
      title={copy.t("orchestra.workflows.drafts.full")}
      description={copy.t("orchestra.workflows.drafts.resolve")}
    >
      <For each={profileDrafts(props.source)}>
        {(pending) => (
          <button
            type="button"
            class="mx-btn"
            onClick={() => props.go(relayPath.editor(pending.state.flow.kind, pending.state.base.id))}
          >
            {pending.state.name}
            <small class="wf-draft-reason">{copy.t(DRAFT_REASON[pending.state.save.state])}</small>
          </button>
        )}
      </For>
      <button type="button" class="mx-btn" onClick={() => props.go(relayPath.library(props.kind))}>
        {copy.t("orchestra.workflows.editor.back", {
          name: copy.t(props.kind === "workflow" ? "orchestra.workflows.title" : "orchestra.hooks.title"),
        })}
      </button>
    </MxPage>
  )
}

// The notices above the canvas: a failed export, and the hook queries the page waits on.
export function EditorNotices(props: {
  kind: "workflow" | "hook"
  source: RelaySource
  exportError?: string
  installed: boolean
  decisionsReady: boolean
  decisions: HookQueryState["query"]
  onDismissExport: () => void
  plain: (text: string) => string
}) {
  const copy = useRelayCopy()
  return (
    <div class="wf-notices">
      <Show when={props.exportError}>
        {(message) => (
          <div class="wf-alert wf-notice" role="alert" data-slot="relay-export-error">
            <Ic name="warn" />
            <div>
              <strong>{copy.t("orchestra.workflows.export.failed")}</strong>
              <span>{props.plain(message())}</span>
            </div>
            <button
              type="button"
              class="mx-btn icon"
              aria-label={copy.t("orchestra.workflows.dialog.close")}
              title={copy.t("orchestra.workflows.dialog.close")}
              onClick={props.onDismissExport}
            >
              <Ic name="close" />
            </button>
          </div>
        )}
      </Show>
      <Show when={props.kind === "hook" && !props.source.installs.isSuccess}>
        <HookQueryStatus kind="installs" query={props.source.installs} />
      </Show>
      <Show when={props.kind === "hook" && props.installed && !props.decisionsReady}>
        <HookQueryStatus kind="activity" query={props.decisions} />
      </Show>
    </div>
  )
}

// A past run's canvas that is loading, failed to load, or no longer exists.
export function HistoryUnavailable(props: {
  failed: boolean
  loading: boolean
  onRetry: () => void
  onBack: () => void
}) {
  const copy = useRelayCopy()
  return (
    <div class="mx-page" data-slot="relay-history-unavailable">
      <p role={props.failed ? "alert" : "status"}>
        {copy.t(
          props.failed
            ? "orchestra.workflows.history.error"
            : props.loading
              ? "orchestra.workflows.history.loading"
              : "orchestra.workflows.history.unavailable",
        )}
      </p>
      <Show when={props.failed}>
        <button type="button" class="mx-btn" onClick={props.onRetry}>
          {copy.t("orchestra.workflows.retry")}
        </button>
      </Show>
      <button type="button" class="mx-btn" onClick={props.onBack}>
        {copy.t("orchestra.workflows.history.back")}
      </button>
    </div>
  )
}

// The confirmations and dialogs the editor opens over the canvas.
export function EditorDialogs(props: {
  kind: "workflow" | "hook"
  id: string
  source: RelaySource
  route: Extract<RelayRoute, { page: "editor" }>
  go: (path: string, replace?: boolean) => void
  draft: NonNullable<ReturnType<typeof openDraft>>
  document: RelayDocument
  flow: Flow
  name: string
  dialog?: EditorDialog
  emptying?: { flow: Flow; names: string }
  installID?: string
  openChat: ReturnType<typeof useWorkflowChat>
  unpublish: () => Promise<unknown>
  revert: () => void
  onDialog: (next?: EditorDialog) => void
  onEmptied: () => void
  onTest: (result: TestResult) => void
}) {
  const copy = useRelayCopy()
  return (
    <>
      <Show when={props.emptying}>
        {(pending) => (
          <ConfirmDialog
            title={copy.t("orchestra.workflows.phaseEmpty.title", { name: pending().names })}
            body={copy.t("orchestra.workflows.phaseEmpty.body")}
            confirm={copy.t("orchestra.workflows.phaseEmpty.confirm")}
            onConfirm={() => props.draft.edit(pending().flow)}
            onClose={props.onEmptied}
          />
        )}
      </Show>
      <Switch>
        <Match when={props.dialog === "publish"}>
          <PublishDialog
            document={props.document}
            flow={props.flow}
            source={props.source}
            active={props.draft.active}
            install={props.kind === "hook" ? props.installID : undefined}
            retain={() => {
              props.draft.acquire()
              return props.draft.release
            }}
            onClose={() => props.onDialog()}
            onPublished={(item) => {
              if (props.kind !== "workflow") return
              showToast({
                variant: "success",
                title: copy.t("orchestra.workflows.publish.done", { name: item.name }),
                actions: [
                  { label: copy.t("orchestra.workflows.editor.useInChat"), onClick: () => props.openChat("use", item) },
                ],
              })
            }}
          />
        </Match>
        <Match when={props.dialog === "unpublish"}>
          <ConfirmDialog
            title={copy.t("orchestra.workflows.unpublish.title", { name: props.name })}
            body={copy.t(
              props.kind === "hook" ? "orchestra.hooks.unpublish.body" : "orchestra.workflows.unpublish.body",
            )}
            confirm={copy.t("orchestra.workflows.unpublish.confirm")}
            onConfirm={props.unpublish}
            onClose={() => props.onDialog()}
          />
        </Match>
        <Match when={props.dialog === "revert"}>
          <ConfirmDialog
            title={copy.t("orchestra.workflows.revert.title", { name: props.name })}
            body={copy.t("orchestra.workflows.revert.body")}
            confirm={copy.t("orchestra.workflows.revert.confirm")}
            onConfirm={props.revert}
            onClose={() => props.onDialog()}
          />
        </Match>
        <Match when={props.dialog === "delete"}>
          <DeleteDialog
            document={props.document}
            kind={props.kind}
            source={props.source}
            onClose={() => props.onDialog()}
            onDeleted={() => props.go(relayPath.library(props.kind), true)}
          />
        </Match>
        <Match when={props.dialog === "keys"}>
          <ShortcutsDialog onClose={() => props.onDialog()} />
        </Match>
        <Match when={props.dialog === "test"}>
          <TestDialog
            flow={props.flow}
            types={props.source.nodeTypes.isSuccess ? props.source.nodeTypes.data.hook : undefined}
            onClose={() => props.onDialog()}
            onResult={(result) => {
              props.onDialog()
              props.onTest(result)
              if (props.route.tab !== "editor") props.go(relayPath.editor(props.kind, props.id))
            }}
          />
        </Match>
      </Switch>
    </>
  )
}

export function DocumentsError(props: { source: RelaySource }) {
  const copy = useRelayCopy()
  return (
    <div class="mx-page">
      <p class="mx-error" role="alert">
        {copy.t("orchestra.workflows.error", { reason: failure(props.source.documents.error) })}
      </p>
      <button type="button" class="mx-btn" onClick={() => void props.source.documents.refetch()}>
        {copy.t("orchestra.workflows.retry")}
      </button>
    </div>
  )
}

// The route names a document that is neither on the server nor in a local draft.
export function EditorMissing(props: { kind: "workflow" | "hook"; go: (path: string) => void }) {
  const copy = useRelayCopy()
  return (
    <MxPage
      id="orchestra-relay-missing"
      title={copy.t(
        props.kind === "workflow" ? "orchestra.workflows.editor.missing" : "orchestra.hooks.editor.missing",
      )}
      description={copy.t("orchestra.workflows.editor.missingBody")}
    >
      <button type="button" class="mx-btn" onClick={() => props.go(relayPath.library(props.kind))}>
        {copy.t("orchestra.workflows.editor.back", {
          name: copy.t(props.kind === "workflow" ? "orchestra.workflows.title" : "orchestra.hooks.title"),
        })}
      </button>
    </MxPage>
  )
}
