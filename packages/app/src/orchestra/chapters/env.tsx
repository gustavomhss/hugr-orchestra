import { Dialog } from "@kobalte/core/dialog"
import { getFilename } from "@opencode-ai/core/util/path"
import { createMemo, For, onCleanup, Show } from "solid-js"
import { createStore } from "solid-js/store"
import { useGlobal } from "@/context/global"
import { useLanguage } from "@/context/language"
import type { ChapterPageProps } from "@/orchestra/chapter-route"
import { displayName } from "@/pages/layout/helpers"
import { pathKey } from "@/utils/path-key"
import { envEntries, parseEnv, removeEnv, serializeEnv, writeEnv, type EnvLine } from "./env-document"
import { MxBadge, MxPage } from "./kit"
import "./env.css"

// Values live only in this component: never in profile config, storage or requests.
export default function EnvPage(props: ChapterPageProps) {
  const language = useLanguage()
  const global = useGlobal()
  const [state, setState] = createStore({
    lines: [] as EnvLine[],
    filename: ".env",
    loading: false,
    error: "" as "" | "read" | "download",
    search: "",
    revealed: {} as Record<number, boolean>,
    dialog: "" as "" | "edit" | "view" | "remove",
    draft: {
      index: undefined as number | undefined,
      name: "",
      key: "",
      value: "",
      multiline: false,
      error: "" as "" | "invalid" | "duplicate" | "readonly",
    },
  })
  const entries = createMemo(() => envEntries(state.lines))
  const rows = createMemo(() => {
    const query = state.search.trim().toLowerCase()
    return entries().rows.filter((row) => row.assignment.key.toLowerCase().includes(query))
  })
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
  const lifetime = { disposed: false, import: 0 }
  onCleanup(() => {
    lifetime.disposed = true
    lifetime.import++
  })
  let input: HTMLInputElement | undefined
  const available =
    typeof File !== "undefined" &&
    typeof File.prototype.arrayBuffer === "function" &&
    typeof TextDecoder !== "undefined" &&
    typeof Blob !== "undefined" &&
    typeof URL.createObjectURL === "function"

  async function open(file: File) {
    const request = ++lifetime.import
    setState({ loading: true, error: "", dialog: "" })
    const result = await file
      .arrayBuffer()
      .then((bytes) => new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes))
      .then(
        (source) => ({ lines: parseEnv(source) }),
        () => ({ error: true }),
      )
    if (lifetime.disposed || request !== lifetime.import) return
    setState("loading", false)
    if ("error" in result) {
      setState("error", "read")
      return
    }
    setState({ lines: result.lines, filename: file.name, revealed: {} })
  }

  function edit(index?: number) {
    const assignment = index === undefined ? undefined : state.lines[index]?.assignment
    setState({
      error: "",
      dialog: "edit",
      draft: {
        index,
        name: assignment?.key ?? "",
        key: assignment?.key ?? "",
        value: assignment?.value ?? "",
        multiline: /[\r\n]/.test(assignment?.value ?? ""),
        error: "",
      },
    })
  }

  function save() {
    const index = state.draft.index
    const result = writeEnv(state.lines, index, state.draft.key.trim(), state.draft.value)
    if ("error" in result) {
      setState("draft", "error", result.error)
      return
    }
    // An edited key is masked again, as in the approved flow; other rows keep their state.
    setState({
      lines: result.lines,
      dialog: "",
      revealed: index === undefined ? state.revealed : { ...state.revealed, [index]: false },
    })
  }

  function remove() {
    const index = state.draft.index
    if (index === undefined) return
    // Line indices after the removed assignment shift up by one; keep each row's reveal state.
    const revealed = Object.fromEntries(
      Object.entries(state.revealed).flatMap(([key, value]) => {
        const line = Number(key)
        if (line === index) return []
        return [[line > index ? line - 1 : line, value]]
      }),
    )
    setState({ lines: removeEnv(state.lines, index), dialog: "", revealed, error: "" })
  }

  function download() {
    try {
      const url = URL.createObjectURL(new Blob([serializeEnv(state.lines)], { type: "text/plain;charset=utf-8" }))
      const link = document.createElement("a")
      link.href = url
      link.download = state.filename
      link.click()
      // Keep the URL alive until the browser has consumed the download click.
      setTimeout(() => URL.revokeObjectURL(url), 1000)
      setState("error", "")
    } catch {
      setState("error", "download")
    }
  }

  const title = () => {
    if (state.dialog === "view") return state.filename
    if (state.dialog === "remove") return language.t("orchestra.env.dialog.remove", { key: state.draft.name })
    if (state.draft.index === undefined) return language.t("orchestra.env.dialog.add")
    return language.t("orchestra.env.dialog.edit", { key: state.draft.name })
  }
  const subtitle = () => {
    if (state.dialog === "view") return language.t("orchestra.env.dialog.preview", { profile: profile() })
    if (state.dialog === "remove") return language.t("orchestra.env.dialog.removeHint")
    return language.t("orchestra.env.dialog.editHint")
  }
  const busy = () => !available || state.loading

  return (
    <MxPage
      id="orchestra-env"
      eyebrow={language.t("orchestra.env.eyebrow", { profile: profile() })}
      title={language.t("orchestra.env.title")}
      description={language.t("orchestra.env.description")}
      action={
        <button type="button" class="mx-btn primary" disabled={busy()} onClick={() => input?.click()}>
          {language.t("orchestra.env.import")}
        </button>
      }
    >
      <div class="env-body" data-component="env-page" aria-busy={state.loading}>
        <input
          ref={input}
          hidden
          type="file"
          aria-label={language.t("orchestra.env.import")}
          onChange={(event) => {
            const file = event.currentTarget.files?.[0]
            event.currentTarget.value = ""
            if (file) void open(file)
          }}
        />
        <div class="mx-toolbar">
          <input
            class="mx-search"
            placeholder={language.t("orchestra.env.search")}
            aria-label={language.t("orchestra.env.search")}
            value={state.search}
            spellcheck={false}
            autocomplete="off"
            onInput={(event) => setState("search", event.currentTarget.value)}
          />
          <MxBadge>
            <bdi>{profile()}</bdi>
          </MxBadge>
        </div>
        <div class="mx-toolbar">
          <button type="button" class="mx-btn" disabled={busy()} onClick={() => edit()}>
            {language.t("orchestra.env.add")}
          </button>
          <button type="button" class="mx-btn" disabled={busy()} onClick={download}>
            {language.t("orchestra.env.download")}
          </button>
          <button
            type="button"
            class="mx-btn"
            disabled={state.loading}
            onClick={() => setState({ dialog: "view", error: "" })}
          >
            {language.t("orchestra.env.view")}
          </button>
          <MxBadge>
            {language.t(entries().rows.length === 1 ? "orchestra.env.count.one" : "orchestra.env.count.other", {
              count: entries().rows.length,
            })}
          </MxBadge>
        </div>
        <Show when={!available}>
          <p class="mx-error" role="status">
            {language.t("orchestra.env.unavailable")}
          </p>
        </Show>
        <Show when={state.loading}>
          <p class="mx-note env-status" role="status">
            {language.t("orchestra.env.loading")}
          </p>
        </Show>
        <Show when={state.error}>
          <p class="mx-error" role="alert">
            {language.t(state.error === "download" ? "orchestra.env.error.download" : "orchestra.env.error.read")}
          </p>
        </Show>
        <Show
          when={rows().length}
          fallback={
            <Show when={!state.loading}>
              <div class="mx-empty">
                <Show when={entries().rows.length} fallback={language.t("orchestra.env.empty")}>
                  {language.t("orchestra.env.noMatch")}
                </Show>
                <Show when={!entries().rows.length}>
                  <br />
                  {language.t("orchestra.env.emptyHint")}
                </Show>
              </div>
            </Show>
          }
        >
          <div class="mx-table">
            <For each={rows()}>
              {(row) => (
                <div class="mx-row env-row" data-env-key={row.assignment.key}>
                  <div class="mx-grow">
                    <strong>
                      <code dir="ltr">{row.assignment.key}</code>
                    </strong>
                    <small>
                      <code dir="ltr">
                        {state.revealed[row.index] ? row.assignment.value : language.t("orchestra.env.mask")}
                      </code>
                    </small>
                  </div>
                  <button
                    type="button"
                    class="mx-btn"
                    onClick={() => setState("revealed", row.index, !state.revealed[row.index])}
                  >
                    {language.t(state.revealed[row.index] ? "orchestra.env.hide" : "orchestra.env.reveal")}
                  </button>
                  <button type="button" class="mx-btn" disabled={state.loading} onClick={() => edit(row.index)}>
                    {language.t("orchestra.env.edit")}
                  </button>
                  <button
                    type="button"
                    class="mx-btn"
                    disabled={state.loading}
                    onClick={() =>
                      setState({
                        dialog: "remove",
                        error: "",
                        draft: { ...state.draft, index: row.index, name: row.assignment.key },
                      })
                    }
                  >
                    {language.t("orchestra.env.remove")}
                  </button>
                </div>
              )}
            </For>
          </div>
        </Show>
        <Show when={entries().preserved}>
          <p class="mx-note" role="note" data-slot="env-preserved">
            {language.plural("orchestra.env.preserved", entries().preserved)}
          </p>
        </Show>
        <p class="mx-note">{language.t("orchestra.env.memory")}</p>
      </div>
      <Dialog open={!!state.dialog} onOpenChange={(open) => !open && setState("dialog", "")}>
        <Dialog.Portal>
          <Dialog.Overlay class="env-dialog-backdrop" />
          <div class="env-dialog-layer">
            <Dialog.Content class="mx-dialog env-dialog" data-env-dialog={state.dialog}>
              <form
                autocomplete="off"
                onSubmit={(event) => {
                  event.preventDefault()
                  if (state.dialog === "edit") save()
                  if (state.dialog === "remove") remove()
                }}
              >
                <header class="mx-dialog-head">
                  <div>
                    <Dialog.Title>
                      {/* File names and key names read left to right whatever their first letter. */}
                      <bdi dir="ltr">{title()}</bdi>
                    </Dialog.Title>
                    <Dialog.Description>{subtitle()}</Dialog.Description>
                  </div>
                  <Dialog.CloseButton class="mx-link" aria-label={language.t("orchestra.env.dialog.close")}>
                    <svg class="env-icon" viewBox="0 0 16 16" aria-hidden="true">
                      <path d="m4 4 8 8m0-8-8 8" />
                    </svg>
                  </Dialog.CloseButton>
                </header>
                <div class="mx-dialog-body">
                  <Show when={state.dialog === "edit" && state.draft.error}>
                    <p class="mx-error" role="alert">
                      {language.t(`orchestra.env.error.${state.draft.error || "invalid"}`)}
                    </p>
                  </Show>
                  <Show when={state.dialog === "edit"}>
                    <label class="mx-field">
                      <span>{language.t("orchestra.env.key")}</span>
                      <input
                        name="key"
                        required
                        dir="ltr"
                        spellcheck={false}
                        value={state.draft.key}
                        onInput={(event) => setState("draft", "key", event.currentTarget.value)}
                      />
                    </label>
                    <label class="mx-field">
                      <span>{language.t("orchestra.env.value")}</span>
                      <Show
                        when={state.draft.multiline}
                        fallback={
                          <input
                            name="value"
                            dir="ltr"
                            spellcheck={false}
                            value={state.draft.value}
                            onInput={(event) => setState("draft", "value", event.currentTarget.value)}
                          />
                        }
                      >
                        <textarea
                          name="value"
                          dir="ltr"
                          spellcheck={false}
                          value={state.draft.value}
                          onInput={(event) => setState("draft", "value", event.currentTarget.value)}
                        />
                      </Show>
                    </label>
                  </Show>
                  <Show when={state.dialog === "view"}>
                    <pre class="mx-log env-file" dir="ltr">
                      {serializeEnv(state.lines).replace(/\r\n?/g, "\n")}
                    </pre>
                  </Show>
                  <Show when={state.dialog === "remove"}>
                    <p class="mx-note">{language.t("orchestra.env.dialog.removeNote", { profile: profile() })}</p>
                  </Show>
                </div>
                <footer class="mx-dialog-foot">
                  <Dialog.CloseButton class="mx-btn">{language.t("orchestra.env.cancel")}</Dialog.CloseButton>
                  <Show when={state.dialog === "edit" || state.dialog === "remove"}>
                    <button type="submit" class="mx-btn primary">
                      {language.t(state.dialog === "remove" ? "orchestra.env.dialog.confirm" : "orchestra.env.apply")}
                    </button>
                  </Show>
                </footer>
              </form>
            </Dialog.Content>
          </div>
        </Dialog.Portal>
      </Dialog>
    </MxPage>
  )
}
