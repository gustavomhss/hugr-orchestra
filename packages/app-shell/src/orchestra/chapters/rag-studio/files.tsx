import { createEffect, For, Show } from "solid-js"
import { createStore } from "solid-js/store"
import { useLanguage } from "@/context/language"
import { useSDK } from "@/context/sdk"
import type { ChapterPageProps } from "@/orchestra/chapter-route"
import { MxBadge } from "../kit"
import { roster, setRoster, statusKey, statusTone } from "./roster"
import { pathDir, pathName, SourceText } from "./source-text"

export function Files(props: ChapterPageProps) {
  const language = useLanguage()
  const sdk = useSDK()
  const [state, setState] = createStore({
    path: "",
    busy: false,
    refusal: "" as "" | "atlas" | "permission",
    openError: false,
    openPath: "",
    text: "",
    cuts: [] as Array<{ start: number; end: number }>,
  })
  const location = () => ({ directory: props.directory })

  const openSource = (sourceId: string) =>
    sdk()
      .orchestra.ragStudio.source({ location: location(), sourceId })
      .then((result) => {
        setRoster("openId", result.data.source.id)
        setState({
          openError: false,
          openPath: result.data.source.path,
          text: result.data.text,
          cuts: result.data.chunks.map((chunk) => ({ start: chunk.start, end: chunk.end })),
        })
      })
      .catch(() => setState({ openError: true }))

  const load = (quiet: boolean) => {
    if (!quiet) setRoster("status", "loading")
    return sdk()
      .orchestra.ragStudio.sources({ location: location() })
      .then((result) => {
        setRoster({
          status: "ready",
          sources: result.data.map((row) => ({ id: row.id, path: row.path, status: row.status })),
        })
        if (quiet && roster.openId) void openSource(roster.openId)
      })
      .catch(() => setRoster({ status: "error", sources: [] }))
  }

  createEffect(() => {
    props.directory
    setState({ path: "", refusal: "", openError: false, openPath: "", text: "", cuts: [] })
    setRoster("openId", "")
    void load(false)
  })

  createEffect(() => {
    if (roster.revision === 0) return
    void load(true)
  })

  return (
    <section>
      <h3 class="mx-section">{language.t("orchestra.ragStudio.files")}</h3>
      <form
        class="rag-form"
        onSubmit={(event) => {
          event.preventDefault()
          const path = state.path.trim()
          if (!path || state.busy) return
          setState({ busy: true, refusal: "", openError: false })
          void sdk()
            .orchestra.ragStudio.admit({ location: location(), path })
            .then(async (result) => {
              if ("refused" in result.data) {
                setState({ busy: false, refusal: result.data.refused })
                return
              }
              await sdk().orchestra.ragStudio.parse({ location: location(), sourceId: result.data.id })
              setState({ path: "", busy: false, refusal: "" })
              await openSource(result.data.id)
              await load(true)
            })
            .catch(() => {
              setState({ busy: false, openError: true })
              return load(true)
            })
        }}
      >
        <label class="mx-field">
          <span>{language.t("orchestra.ragStudio.path")}</span>
          <input
            value={state.path}
            spellcheck={false}
            autocomplete="off"
            onInput={(event) => setState({ path: event.currentTarget.value })}
          />
        </label>
        <button class="mx-btn" type="submit" disabled={state.busy || !state.path.trim()}>
          {language.t("orchestra.ragStudio.admit")}
        </button>
      </form>
      <Show when={state.refusal === "atlas"}>
        <p class="mx-error" role="alert">
          {language.t("orchestra.ragStudio.refused.atlas")}
        </p>
      </Show>
      <Show when={state.refusal === "permission"}>
        <p class="mx-error" role="alert">
          {language.t("orchestra.ragStudio.refused.permission")}
        </p>
      </Show>
      <Show when={state.openError}>
        <p class="mx-error" role="alert">
          {language.t("orchestra.ragStudio.actionError")}
        </p>
      </Show>
      <Show when={roster.status === "loading"}>
        <div class="mx-empty" role="status">
          {language.t("orchestra.ragStudio.loading")}
        </div>
      </Show>
      <Show when={roster.status === "error"}>
        <div class="mx-empty" role="alert">
          {language.t("orchestra.ragStudio.error")}
        </div>
      </Show>
      <Show when={roster.status === "ready" && roster.sources.length === 0}>
        <div class="mx-empty">
          <strong>{language.t("orchestra.ragStudio.empty")}</strong>
        </div>
      </Show>
      <Show when={roster.status === "ready" && roster.sources.length > 0}>
        <div class="mx-table">
          <For each={roster.sources}>
            {(source) => (
              <div class="mx-row" data-selected={roster.openId === source.id ? "true" : undefined}>
                <div class="mx-grow">
                  <strong>
                    <bdi>{pathName(source.path)}</bdi>
                  </strong>
                  <Show when={pathDir(source.path)}>
                    {(dir) => (
                      <small dir="ltr">
                        <bdi>{dir()}</bdi>
                      </small>
                    )}
                  </Show>
                </div>
                <MxBadge tone={statusTone(source.status)}>{language.t(statusKey(source.status))}</MxBadge>
                <button
                  class="mx-btn"
                  type="button"
                  aria-pressed={roster.openId === source.id}
                  onClick={() => void openSource(source.id)}
                >
                  {language.t("orchestra.ragStudio.showCut")}
                </button>
                <button
                  class="mx-btn danger"
                  type="button"
                  onClick={() => {
                    void sdk()
                      .orchestra.ragStudio.remove({ location: location(), sourceId: source.id })
                      .then(() => {
                        if (roster.openId === source.id) {
                          setRoster("openId", "")
                          setState({ openPath: "", text: "", cuts: [] })
                        }
                        return load(true)
                      })
                      .catch(() => setState({ openError: true }))
                  }}
                >
                  {language.t("orchestra.ragStudio.remove")}
                </button>
              </div>
            )}
          </For>
        </div>
      </Show>
      <Show when={state.openPath}>
        <div class="rag-follow">
          <Show when={state.cuts.length > 0}>
            <p class="mx-note">{language.t("orchestra.ragStudio.cuts")}</p>
          </Show>
          <p class="mx-note rag-path" dir="ltr">
            <bdi>{state.openPath}</bdi>
          </p>
          <Show when={state.text} fallback={<div class="mx-empty" role="status">{language.t("orchestra.ragStudio.notRecorded")}</div>}>
            <SourceText text={state.text} cuts={state.cuts} />
          </Show>
        </div>
      </Show>
    </section>
  )
}
