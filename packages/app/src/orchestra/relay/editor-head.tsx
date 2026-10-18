import { createSignal, type JSX, Show } from "solid-js"
import type { RelayDocument, RelayKind } from "./client"
import { HeadBadge } from "./parts"
import { relayPath } from "./route"
import { Ic, Menu, type MenuItem, useRelayCopy } from "./ui"

export type SaveState = { state: "saved" | "saving" | "error" | "conflict"; dirty: boolean; error: string }

// Editor header: back and crumb on the left, Editor / Activity in the middle (hooks only), autosave and Publish on
// the right, then Test and Install for hooks or Use in chat for a published workflow.
export function EditorHead(props: {
  kind: RelayKind
  document: RelayDocument
  name: string
  readOnly?: boolean
  tab: "editor" | "runs"
  // Hooks only: the decisions behind the Activity tab.
  runCount: number | undefined
  // An install exists, so the toggle works even after an unpublish.
  installExists?: boolean
  installKnown?: boolean
  save: SaveState
  issues: { text: string; node?: string }[]
  canPublish: boolean
  installed?: boolean
  installBusy?: boolean
  menu: MenuItem[]
  go: (path: string) => void
  onRename: (name: string) => void
  onIssue: (node: string | undefined) => void
  onPublish: () => void
  onTest: () => void
  onInstall: (next: boolean) => void
  onReload: () => void
  onRetry?: () => void
  onUseInChat?: () => void
}) {
  const copy = useRelayCopy()
  const [menu, setMenu] = createSignal<HTMLElement>()
  const [issuesAnchor, setIssuesAnchor] = createSignal<HTMLElement>()
  let nameInput!: HTMLInputElement
  const workflow = () => props.kind === "workflow"
  const library = () => relayPath.library(props.kind)
  const libraryName = () => copy.t(workflow() ? "orchestra.workflows.title" : "orchestra.hooks.title")
  const published = () => !!props.document.activeVersionId
  // Why Publish is off, by what is going on right now.
  const publishReason = () => {
    if (props.canPublish || props.readOnly) return undefined
    if (props.issues.length) return copy.t("orchestra.workflows.editor.publishIssues")
    if (props.save.state === "conflict") return copy.t("orchestra.workflows.editor.publishConflict")
    if (props.save.state === "error") return copy.t("orchestra.workflows.editor.publishNotSaved")
    if (props.save.state === "saving" || props.save.dirty) return copy.t("orchestra.workflows.editor.publishSaving")
    return copy.t("orchestra.workflows.editor.publishNothing")
  }
  // The name field commits on blur, and pressing Publish blurs it first. The commit marks the draft unsaved, which
  // switches Publish off before the press completes as a click, so a pending rename is committed and published here.
  const publishWithRename = () => {
    const value = nameInput.value.trim()
    if (props.readOnly || !value || value === props.name || document.activeElement !== nameInput) return
    props.onRename(value)
    props.onPublish()
  }
  return (
    <header class="wf-head">
      <div class="wf-head-left">
        <a
          class="mx-btn icon"
          href={library()}
          aria-label={copy.t("orchestra.workflows.editor.back", { name: libraryName() })}
          title={copy.t("orchestra.workflows.editor.back", { name: libraryName() })}
          onClick={(event) => {
            event.preventDefault()
            props.go(library())
          }}
        >
          <Ic name="back" />
        </a>
        <nav class="wf-crumb" aria-label={copy.t("orchestra.workflows.editor.crumb")}>
          <a
            href={library()}
            onClick={(event) => {
              event.preventDefault()
              props.go(library())
            }}
          >
            {libraryName()}
          </a>
          <span class="sep" aria-hidden="true">
            /
          </span>
          <input
            ref={nameInput}
            class="wf-name"
            value={props.name}
            readOnly={props.readOnly}
            size={Math.max(8, props.name.length)}
            aria-label={copy.t(workflow() ? "orchestra.workflows.editor.name" : "orchestra.hooks.editor.name")}
            onInput={(event) => (event.currentTarget.size = Math.max(8, event.currentTarget.value.length))}
            onChange={(event) => {
              const value = event.currentTarget.value.trim()
              if (value && value !== props.name) return props.onRename(value)
              event.currentTarget.value = props.name
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") event.currentTarget.blur()
              if (event.key !== "Escape") return
              event.preventDefault()
              event.stopPropagation()
              event.currentTarget.value = props.name
              event.currentTarget.blur()
            }}
          />
        </nav>
        <span class="wf-badges">
          <Show when={!props.readOnly}><HeadBadge document={props.document} /></Show>
        </span>
      </div>
      {/* Workflow executions are hidden while the server has no run routes; the empty cell keeps the header centred. */}
      <Show when={!workflow()} fallback={<span />}>
        <div class="wf-range" role="tablist" aria-label={copy.t("orchestra.workflows.editor.view")}>
          <button
            type="button"
            role="tab"
            aria-selected={props.tab === "editor"}
            onClick={() => props.go(relayPath.editor(props.kind, props.document.id))}
          >
            {copy.t("orchestra.workflows.editor.editor")}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={props.tab === "runs"}
            onClick={() => props.go(relayPath.history(props.kind, props.document.id))}
          >
            {copy.t("orchestra.hooks.tab.activity")}
            <Show when={props.runCount !== undefined}>
              <span class="wf-count">{props.runCount}</span>
            </Show>
          </button>
        </div>
      </Show>
      <div class="wf-head-right">
        <Show when={!props.readOnly} fallback={<span class="wf-save">{copy.t("orchestra.workflows.history.readOnly")}</span>}>
          <SaveStatus save={props.save} onRetry={props.onRetry} onReload={props.onReload} />
        </Show>
        <Show when={props.issues.length}>
          <button
            type="button"
            class="wf-issues"
            aria-haspopup="menu"
            onClick={(event) => setIssuesAnchor(event.currentTarget)}
          >
            <Ic name="warn" />
            {copy.count(
              props.issues.length,
              "orchestra.workflows.count.issue.one",
              "orchestra.workflows.count.issue.other",
            )}
          </button>
        </Show>
        <Show when={!workflow()}>
          <button type="button" class="mx-btn" onClick={props.onTest}>
            <Ic name="test" />
            {copy.t("orchestra.hooks.test")}
          </button>
        </Show>
        <Show when={publishReason()}>
          {(reason) => (
            <span class="wf-publish-reason" id="wf-publish-reason" title={reason()}>
              {reason()}
            </span>
          )}
        </Show>
        <button
          type="button"
          class={props.canPublish ? "mx-btn primary" : "mx-btn"}
          aria-describedby={publishReason() ? "wf-publish-reason" : undefined}
          disabled={!props.canPublish}
          onPointerDown={publishWithRename}
          onClick={props.onPublish}
        >
          <Ic name="upload" />
          {copy.t("orchestra.workflows.editor.publish")}
        </button>
        <Show
          when={workflow()}
          fallback={
            <span class="wf-install">
              <Show when={props.installKnown !== false} fallback={<span>{copy.t("orchestra.workflows.hookState.unknown")}</span>}>
              <button
                type="button"
                class="mx-toggle"
                role="switch"
                aria-checked={!!props.installed}
                aria-label={copy.t("orchestra.hooks.editor.installLabel")}
                title={published() || props.installExists ? undefined : copy.t("orchestra.hooks.publishFirst")}
                disabled={(!published() && !props.installExists) || props.installBusy}
                onClick={() => props.onInstall(!props.installed)}
              />
              {copy.t(
                props.installed
                  ? "orchestra.hooks.installed"
                  : props.installExists
                    ? "orchestra.hooks.editor.paused"
                    : "orchestra.hooks.notInstalled",
              )}
              </Show>
            </span>
          }
        >
          <Show when={published() && props.onUseInChat}>
            <button
              type="button"
              class={props.canPublish ? "mx-btn" : "mx-btn primary"}
              title={copy.t("orchestra.workflows.editor.useInChatTitle")}
              onClick={props.onUseInChat}
            >
              {copy.t("orchestra.workflows.editor.useInChat")}
            </button>
          </Show>
        </Show>
        <button
          type="button"
          class="mx-btn icon"
          aria-haspopup="menu"
          aria-label={copy.t("orchestra.workflows.editor.more")}
          onClick={(event) => setMenu(event.currentTarget)}
        >
          <Ic name="more" />
        </button>
      </div>
      <Show when={menu()}>
        {(anchor) => (
          <Menu
            anchor={anchor()}
            label={copy.t("orchestra.workflows.editor.more")}
            items={props.menu}
            onClose={() => setMenu(undefined)}
          />
        )}
      </Show>
      <Show when={issuesAnchor()}>
        {(anchor) => (
          <Menu
            anchor={anchor()}
            class="wf-pop issues"
            label={copy.count(
              props.issues.length,
              "orchestra.workflows.count.issue.one",
              "orchestra.workflows.count.issue.other",
            )}
            items={props.issues.map((issue) => ({
              label: issue.text,
              icon: "warn" as const,
              run: () => props.onIssue(issue.node),
            }))}
            onClose={() => setIssuesAnchor(undefined)}
          />
        )}
      </Show>
    </header>
  )
}

export function SaveStatus(props: {
  save: SaveState
  saved?: JSX.Element
  onRetry?: () => void
  onReload: () => void
}) {
  const copy = useRelayCopy()
  return (
    <span
      class="wf-save"
      classList={{ bad: props.save.state === "error" || props.save.state === "conflict" }}
      role="status"
      data-save={props.save.state}
    >
      <Show when={props.save.state === "conflict"}>
        {copy.t("orchestra.workflows.editor.conflict")}
        <button type="button" class="mx-link" onClick={(event) => {
          // This button disappears after reload; leave focus on a stable modal control first.
          const modal = event.currentTarget.closest<HTMLElement>('[role="dialog"]')
          ;(modal?.querySelector<HTMLElement>("[data-relay-done]") ?? modal)?.focus({ preventScroll: true })
          props.onReload()
        }}>
          {copy.t("orchestra.workflows.editor.reloadDiscard")}
        </button>
      </Show>
      <Show when={props.save.state === "error"}>
        <span>{copy.t("orchestra.workflows.editor.saveFailed")}</span>
        <span class="wf-save-error">{props.save.error}</span>
        <Show when={props.onRetry}>
          <button type="button" class="mx-link" onClick={props.onRetry}>
            {copy.t("orchestra.workflows.retry")}
          </button>
        </Show>
      </Show>
      <Show when={props.save.state === "saving" || (props.save.state === "saved" && props.save.dirty)}>
        {copy.t("orchestra.workflows.editor.saving")}
      </Show>
      <Show when={props.save.state === "saved" && !props.save.dirty}>
        <Ic name="check" />
        {props.saved ?? copy.t("orchestra.workflows.editor.saved")}
      </Show>
    </span>
  )
}
