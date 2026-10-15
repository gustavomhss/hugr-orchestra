import { createSignal, Show } from "solid-js"
import type { RelayDocument, RelayKind } from "./client"
import { HeadBadge } from "./parts"
import { relayPath } from "./route"
import { Ic, Menu, type MenuItem, useRelayCopy } from "./ui"

export type SaveState = { state: "saved" | "saving" | "error" | "conflict"; dirty: boolean; error: string }

// Editor header: back and crumb on the left, Editor / Executions in the middle, autosave, Publish and Run
// (or Test and Install for hooks) on the right.
export function EditorHead(props: {
  kind: RelayKind
  document: RelayDocument
  name: string
  tab: "editor" | "runs"
  // Hidden while the server has no run routes.
  runCount: number | undefined
  // An install exists, so the toggle works even after an unpublish.
  installExists?: boolean
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
}) {
  const copy = useRelayCopy()
  const [menu, setMenu] = createSignal<HTMLElement>()
  const [issuesAnchor, setIssuesAnchor] = createSignal<HTMLElement>()
  const workflow = () => props.kind === "workflow"
  const library = () => relayPath.library(props.kind)
  const libraryName = () => copy.t(workflow() ? "orchestra.workflows.title" : "orchestra.hooks.title")
  const published = () => !!props.document.activeVersionId
  const publishTitle = () => {
    if (props.issues.length) return copy.t("orchestra.workflows.editor.publishIssues")
    if (!props.canPublish) return copy.t("orchestra.workflows.editor.publishNothing")
    return copy.t("orchestra.workflows.editor.publishDraft", { version: props.document.versionCounter })
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
            class="wf-name"
            value={props.name}
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
          <HeadBadge document={props.document} />
        </span>
      </div>
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
          {copy.t(workflow() ? "orchestra.workflows.tab.runs" : "orchestra.hooks.tab.activity")}
          <Show when={props.runCount !== undefined}>
            <span class="wf-count">{props.runCount}</span>
          </Show>
        </button>
      </div>
      <div class="wf-head-right">
        <span
          class="wf-save"
          classList={{ bad: props.save.state === "error" || props.save.state === "conflict" }}
          aria-live="polite"
          data-save={props.save.state}
        >
          <Show when={props.save.state === "conflict"}>
            {copy.t("orchestra.workflows.editor.conflict")}
            <button type="button" class="mx-link" onClick={props.onReload}>
              {copy.t("orchestra.workflows.editor.reload")}
            </button>
          </Show>
          <Show when={props.save.state === "error"}>
            <span title={props.save.error}>{copy.t("orchestra.workflows.editor.notSaved")}</span>
          </Show>
          <Show when={props.save.state === "saving" || (props.save.state === "saved" && props.save.dirty)}>
            {copy.t("orchestra.workflows.editor.saving")}
          </Show>
          <Show when={props.save.state === "saved" && !props.save.dirty}>
            <Ic name="check" />
            {copy.t("orchestra.workflows.editor.saved")}
          </Show>
        </span>
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
        <button
          type="button"
          class="mx-btn"
          title={publishTitle()}
          disabled={!props.canPublish}
          onClick={props.onPublish}
        >
          <Ic name="upload" />
          {copy.t("orchestra.workflows.editor.publish")}
        </button>
        <Show
          when={workflow()}
          fallback={
            <span class="wf-install">
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
              {copy.t(props.installed ? "orchestra.hooks.installed" : "orchestra.hooks.notInstalled")}
            </span>
          }
        >
          <button
            type="button"
            class="mx-btn primary"
            title={copy.t("orchestra.workflows.maestroOnly")}
            disabled
          >
            <Ic name="play" />
            {copy.t("orchestra.workflows.editor.run")}
          </button>
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
