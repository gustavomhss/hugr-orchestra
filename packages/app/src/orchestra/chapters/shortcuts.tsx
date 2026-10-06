import { Dialog } from "@kobalte/core/dialog"
import { getFilename } from "@opencode-ai/core/util/path"
import { useDialog } from "@opencode-ai/ui/context/dialog"
import { DialogV2 } from "@opencode-ai/ui/v2/dialog-v2"
import { createComputed, createMemo, createSignal, For, onCleanup, Show } from "solid-js"
import { createStore, reconcile } from "solid-js/store"
import { formatKeybind, useCommand } from "@/context/command"
import { useGlobal } from "@/context/global"
import { useLanguage } from "@/context/language"
import { useSettings } from "@/context/settings"
import { displayName } from "@/pages/layout/helpers"
import { pathKey } from "@/utils/path-key"
import type { ChapterPageProps } from "../chapter-route"
import { MxPage } from "./kit"
import {
  captureKeybind,
  filterShortcuts,
  findConflict,
  keybindCombos,
  resetsOverride,
  shortcutRows,
  shortcutText,
  type ShortcutRow,
} from "./shortcuts-model"
import "./shortcuts.css"

const IS_MAC = typeof navigator === "object" && /(Mac|iPod|iPhone|iPad)/.test(navigator.platform)

export default function ShortcutsPage(props: ChapterPageProps) {
  const language = useLanguage()
  const command = useCommand()
  const settings = useSettings()
  const dialog = useDialog()
  const global = useGlobal()
  const [query, setQuery] = createSignal("")
  const [rows, setRows] = createStore<ShortcutRow[]>([])
  // Reconcile by id so a saved binding updates its row in place: rows stay mounted and focus can
  // return to the Edit button that opened the dialog.
  createComputed(() =>
    setRows(
      reconcile(
        shortcutRows({
          paletteTitle: language.t("command.palette"),
          catalog: command.catalog,
          options: command.options,
          overrides: settings.current.keybinds ?? {},
        }),
        { key: "id" },
      ),
    ),
  )
  const labels = (config: string | undefined) => keybindCombos(config).map((combo) => formatKeybind(combo, language.t))
  const kind = (row: ShortcutRow) => language.t(`orchestra.shortcuts.kind.${row.group}`)
  const visible = createMemo(() =>
    filterShortcuts(rows, query(), (row) =>
      shortcutText({
        title: row.title,
        kind: kind(row),
        keys: labels(row.config),
        unassigned: language.t("orchestra.shortcuts.unassigned"),
      }),
    ),
  )
  const profile = createMemo(() => {
    const directory = pathKey(props.directory)
    const project = global
      .ensureServerCtx(props.server)
      .projects.list()
      .find(
        (item) =>
          pathKey(item.worktree) === directory || item.sandboxes?.some((sandbox) => pathKey(sandbox) === directory),
      )
    return project ? displayName(project) : getFilename(props.directory) || props.directory
  })

  const edit = (row: ShortcutRow, trigger: HTMLElement) =>
    dialog.showOwned(() => (
      <ShortcutDialog
        row={row}
        rows={() => rows}
        labels={labels}
        trigger={trigger}
        onSave={(config) => {
          if (resetsOverride(row, config)) return settings.keybinds.reset(row.id)
          settings.keybinds.set(row.id, config)
        }}
      />
    ))

  return (
    <MxPage
      id="orchestra-shortcuts"
      // The kit's eyebrow is text; FSI/PDI isolate the profile name exactly as <bdi> does.
      eyebrow={language.t("orchestra.shortcuts.eyebrow", { profile: `\u2068${profile()}\u2069` })}
      title={language.t("orchestra.shortcuts.title")}
      description={language.t("orchestra.shortcuts.description")}
      action={
        <button type="button" class="mx-btn primary" onClick={() => settings.keybinds.resetAll()}>
          {language.t("orchestra.shortcuts.reset")}
        </button>
      }
    >
      <div class="mx-toolbar">
        <input
          class="mx-search"
          role="searchbox"
          value={query()}
          placeholder={language.t("orchestra.shortcuts.search")}
          aria-label={language.t("orchestra.shortcuts.searchLabel")}
          spellcheck={false}
          autocomplete="off"
          onInput={(event) => setQuery(event.currentTarget.value)}
        />
        <span class="mx-badge">
          <bdi>{profile()}</bdi>
        </span>
      </div>
      <Show
        when={visible().length}
        fallback={
          <div class="mx-empty" role="status">
            {language.t("orchestra.shortcuts.noMatches")}
          </div>
        }
      >
        <div class="mx-table" role="list" aria-label={language.t("orchestra.shortcuts.title")}>
          <For each={visible()}>
            {(row) => (
              <div class="mx-row" role="listitem" data-shortcut-id={row.id}>
                <div class="mx-grow">
                  <strong>{row.title}</strong>
                  <small>{kind(row)}</small>
                </div>
                <span class="shortcuts-keys">
                  <Show
                    when={labels(row.config).length}
                    fallback={<kbd class="mx-badge">{language.t("orchestra.shortcuts.unassigned")}</kbd>}
                  >
                    <For each={labels(row.config)}>{(label) => <kbd class="mx-badge">{label}</kbd>}</For>
                  </Show>
                </span>
                <button
                  type="button"
                  class="mx-btn"
                  aria-label={language.t("orchestra.shortcuts.editLabel", { title: row.title })}
                  onClick={(event) => edit(row, event.currentTarget)}
                >
                  {language.t("orchestra.shortcuts.edit")}
                </button>
              </div>
            )}
          </For>
        </div>
      </Show>
      <p class="mx-note">{language.t("orchestra.shortcuts.scope")}</p>
    </MxPage>
  )
}

// Mock `shortcut-edit`: capture a combination, keep the stored binding until Save, and refuse a
// combination another command already uses. The app's dialog layer suspends command keybinds
// while it is open, so the pressed keys reach the field instead of firing their commands.
function ShortcutDialog(props: {
  row: ShortcutRow
  rows: () => ShortcutRow[]
  labels: (config: string | undefined) => string[]
  trigger: HTMLElement
  onSave: (config: string) => void
}) {
  const language = useLanguage()
  const dialog = useDialog()
  const [draft, setDraft] = createSignal(props.row.config)
  const [error, setError] = createSignal("")
  let field!: HTMLInputElement
  // The app's dialog layer has no Kobalte trigger to restore focus to, so hand it back to the Edit
  // button once the dialog has unmounted (the row stays mounted because rows reconcile by id).
  onCleanup(() =>
    setTimeout(() => {
      if (props.trigger.isConnected) props.trigger.focus()
    }),
  )

  const submit = () => {
    const config = draft()
    if (!config || config === props.row.config) return dialog.close()
    const conflict = findConflict(props.rows(), props.row.id, config)
    if (conflict) {
      setError(language.t("orchestra.shortcuts.dialog.conflict", { title: conflict.title }))
      // Save took focus; hand it back to the capture field so the next combination can be pressed.
      field.focus()
      return
    }
    props.onSave(config)
    dialog.close()
  }

  return (
    <DialogV2 fit containerClass="mx-dialog shortcuts-dialog">
      <form
        autocomplete="off"
        onSubmit={(event) => {
          event.preventDefault()
          submit()
        }}
      >
        <header class="mx-dialog-head">
          <div>
            <Dialog.Title>{language.t("orchestra.shortcuts.dialog.title")}</Dialog.Title>
            <Dialog.Description>
              {language.t("orchestra.shortcuts.dialog.subtitle", { title: props.row.title })}
            </Dialog.Description>
          </div>
          <Dialog.CloseButton
            class="mx-link shortcuts-close"
            aria-label={language.t("orchestra.shortcuts.dialog.close")}
          >
            <svg class="shortcuts-ic" viewBox="0 0 16 16" aria-hidden="true">
              <path d="m4 4 8 8m0-8-8 8" />
            </svg>
          </Dialog.CloseButton>
        </header>
        <div class="mx-dialog-body">
          <p class="mx-error" role="alert" hidden={!error()}>
            {error()}
          </p>
          <label class="mx-field">
            <span>{language.t("orchestra.shortcuts.dialog.field")}</span>
            <input
              ref={field}
              name="binding"
              type="text"
              readOnly
              autofocus
              value={props.labels(draft()).join(", ")}
              placeholder={language.t("orchestra.shortcuts.unassigned")}
              onKeyDown={(event) => {
                const next = captureKeybind(event, IS_MAC)
                if (!next) return
                event.preventDefault()
                event.stopPropagation()
                setDraft(next)
                setError("")
              }}
            />
          </label>
          <p class="mx-note">
            {language.t("orchestra.shortcuts.dialog.note", {
              first: formatKeybind("mod+k", language.t),
              second: formatKeybind("mod+shift+m", language.t),
            })}
          </p>
        </div>
        <footer class="mx-dialog-foot">
          <button type="button" class="mx-btn" onClick={() => dialog.close()}>
            {language.t("orchestra.shortcuts.dialog.cancel")}
          </button>
          <button type="submit" class="mx-btn primary">
            {language.t("orchestra.shortcuts.dialog.save")}
          </button>
        </footer>
      </form>
    </DialogV2>
  )
}
