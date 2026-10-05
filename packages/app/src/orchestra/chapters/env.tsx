import { createMemo, For, onCleanup, Show } from "solid-js"
import { createStore } from "solid-js/store"
import { ButtonV2 } from "@opencode-ai/ui/v2/button-v2"
import { useLanguage } from "@/context/language"
import type { ChapterPageProps } from "../chapter-route"
import { envEntries, parseEnv, removeEnv, serializeEnv, writeEnv, type EnvLine } from "./env-document"
import "./env.css"

export default function EnvPage(_props: ChapterPageProps) {
  const language = useLanguage()
  const [state, setState] = createStore({
    lines: [] as EnvLine[],
    filename: ".env",
    imported: false,
    loading: false,
    error: "" as "" | "read" | "invalid" | "duplicate" | "readonly" | "download",
    revealed: {} as Record<number, boolean>,
    editor: undefined as { index?: number; key: string; value: string; reveal: boolean } | undefined,
  })
  const entries = createMemo(() => envEntries(state.lines))
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
    setState({ loading: true, error: "", editor: undefined })
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
    setState({ lines: result.lines, filename: file.name, imported: true, revealed: {} })
  }

  function save() {
    if (!state.editor) return
    const result = writeEnv(state.lines, state.editor.index, state.editor.key, state.editor.value)
    if ("error" in result) {
      setState("error", result.error)
      return
    }
    setState({ lines: result.lines, editor: undefined, error: "", revealed: {} })
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
    } catch {
      setState("error", "download")
    }
  }

  return (
    <section class="env-page" data-component="env-page" aria-busy={state.loading}>
      <header>
        <h1>{language.t("orchestra.env.title")}</h1>
        <p>{language.t("orchestra.env.description")}</p>
      </header>
      <div class="env-toolbar">
        <ButtonV2 disabled={!available || state.loading} onClick={() => input?.click()}>
          {language.t("orchestra.env.import")}
        </ButtonV2>
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
        <ButtonV2
          disabled={!available || state.loading}
          onClick={() => setState({ editor: { key: "", value: "", reveal: false }, error: "" })}
        >
          {language.t("orchestra.env.add")}
        </ButtonV2>
        <ButtonV2 disabled={!available || state.loading || (!state.imported && !state.lines.length)} onClick={download}>
          {language.t("orchestra.env.download")}
        </ButtonV2>
        <Show when={state.imported}>
          <span class="env-filename" dir="ltr">
            {state.filename}
          </span>
        </Show>
      </div>
      <p class="env-note">{language.t("orchestra.env.memory")}</p>
      <Show when={!available}>
        <p role="status">{language.t("orchestra.env.unavailable")}</p>
      </Show>
      <Show when={state.loading}>
        <p role="status">{language.t("orchestra.env.loading")}</p>
      </Show>
      <Show when={state.error}>
        <p role="alert" class="env-error">
          {language.t(`orchestra.env.error.${state.error || "read"}`)}
        </p>
      </Show>
      <Show when={state.editor}>
        {(editor) => (
          <form
            class="env-editor"
            onSubmit={(event) => {
              event.preventDefault()
              save()
            }}
            autocomplete="off"
          >
            <label>
              {language.t("orchestra.env.key")}
              <input
                name="env-key"
                value={editor().key}
                onInput={(event) => setState("editor", "key", event.currentTarget.value)}
                spellcheck={false}
              />
            </label>
            <label>
              {language.t("orchestra.env.value")}
              <Show
                when={editor().reveal}
                fallback={
                  <input
                    name="env-value"
                    type="password"
                    value={editor().value}
                    onInput={(event) => setState("editor", "value", event.currentTarget.value)}
                    autocomplete="new-password"
                  />
                }
              >
                <textarea
                  name="env-value"
                  value={editor().value}
                  onInput={(event) => setState("editor", "value", event.currentTarget.value)}
                  spellcheck={false}
                />
              </Show>
            </label>
            <div class="env-actions">
              <ButtonV2 type="button" variant="ghost" onClick={() => setState("editor", "reveal", !editor().reveal)}>
                {language.t(editor().reveal ? "orchestra.env.hide" : "orchestra.env.reveal")}
              </ButtonV2>
              <ButtonV2 type="submit">{language.t("orchestra.env.apply")}</ButtonV2>
              <ButtonV2 type="button" variant="ghost" onClick={() => setState({ editor: undefined, error: "" })}>
                {language.t("orchestra.env.cancel")}
              </ButtonV2>
            </div>
          </form>
        )}
      </Show>
      <Show when={!state.loading && !entries().rows.length}>
        <p class="env-empty">{language.t("orchestra.env.empty")}</p>
      </Show>
      <Show when={entries().preserved}>
        <p class="env-note" role="note" data-slot="env-preserved">
          {language.plural("orchestra.env.preserved", entries().preserved)}
        </p>
      </Show>
      <div class="env-list">
        <For each={entries().rows}>
          {(row) => (
            <article class="env-row" data-env-key={row.assignment.key}>
              <div class="env-content">
                <strong>{row.assignment.key}</strong>
                <pre dir="ltr">
                  {state.revealed[row.index] ? row.assignment.value : language.t("orchestra.env.mask")}
                </pre>
              </div>
              <div class="env-actions">
                <ButtonV2
                  variant="ghost"
                  aria-pressed={!!state.revealed[row.index]}
                  onClick={() => setState("revealed", row.index, !state.revealed[row.index])}
                >
                  {language.t(state.revealed[row.index] ? "orchestra.env.hide" : "orchestra.env.reveal")}
                </ButtonV2>
                <ButtonV2
                  variant="ghost"
                  disabled={state.loading}
                  onClick={() =>
                    setState({
                      editor: { index: row.index, key: row.assignment.key, value: row.assignment.value, reveal: false },
                      error: "",
                    })
                  }
                >
                  {language.t("orchestra.env.edit")}
                </ButtonV2>
                <ButtonV2
                  variant="ghost"
                  disabled={state.loading}
                  onClick={() =>
                    setState({
                      lines: removeEnv(state.lines, row.index),
                      editor: undefined,
                      revealed: {},
                      error: "",
                    })
                  }
                >
                  {language.t("orchestra.env.remove")}
                </ButtonV2>
              </div>
            </article>
          )}
        </For>
      </div>
    </section>
  )
}
