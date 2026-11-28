import { batch, createEffect, For, onCleanup, Show } from "solid-js"
import { createStore, reconcile } from "solid-js/store"
import { useLanguage } from "@/context/language"
import { useSDK } from "@/context/sdk"
import type { ChapterPageProps } from "@/orchestra/chapter-route"
import { MxBadge } from "../kit"
import { statusKey, statusTone, useRagRoster } from "./roster"
import { pathDir, pathName, SourceText } from "./source-text"

export function Files(props: ChapterPageProps) {
  const language = useLanguage()
  const sdk = useSDK()
  const { roster, setRoster } = useRagRoster()
  const [state, setState] = createStore({
    path: "",
    busy: false,
    refusal: "" as "" | "atlas" | "permission",
    writeFailed: false,
    reader: "idle" as "idle" | "loading" | "ready" | "error",
    text: "",
    cuts: [] as Array<{ start: number; end: number }>,
  })
  const location = { directory: props.directory }
  const selected = () => roster.sources.find((source) => source.id === roster.openId)
  let selection = 0
  let sourceRead = 0
  let listRead = 0
  let active = true
  onCleanup(() => { active = false })

  const openSource = (sourceId: string) => {
    const started = ++sourceRead
    batch(() => {
      setRoster("openId", sourceId)
      setState({ reader: "loading", text: "", cuts: [] })
    })
    return sdk().orchestra.ragStudio.source({ location, sourceId }).then(
      (result) => {
        if (!active || started !== sourceRead) return
        setState({
          reader: "ready",
          text: result.data.text,
          cuts: result.data.chunks.map((chunk) => ({ start: chunk.start, end: chunk.end })),
        })
      },
      (error: unknown) => {
        if (!active || started !== sourceRead) return
        console.error(error)
        setState("reader", "error")
      },
    )
  }

  const load = (quiet: boolean, admitted?: { id: string; selection: number }) => {
    const started = ++listRead
    if (!quiet) setRoster("status", "loading")
    return sdk().orchestra.ragStudio.sources({ location }).then(
      (result) => {
        if (!active || started !== listRead) return
        return batch(() => {
          setRoster("sources", reconcile(result.data.map((row) => ({ id: row.id, path: row.path, status: row.status }))))
          setRoster("status", "ready")
          const admittedId = admitted?.selection === selection ? admitted.id : undefined
          const nextId = roster.sources.some((source) => source.id === admittedId) ? admittedId : roster.openId
          if (!nextId) return
          if (roster.sources.some((source) => source.id === nextId)) return openSource(nextId)
          sourceRead += 1
          setRoster("openId", "")
          setState({ reader: "idle", text: "", cuts: [] })
        })
      },
      (error: unknown) => {
        if (!active || started !== listRead) return
        console.error(error)
        setRoster("status", "error")
      },
    )
  }

  createEffect(() => { void load(roster.revision > 0) })

  return (
    <section class="rag-section">
      <form
        class="rag-form"
        onSubmit={(event) => {
          event.preventDefault()
          const path = state.path.trim()
          if (!path || state.busy) return
          setState({ busy: true, refusal: "", writeFailed: false })
          const selectedAtSubmit = selection
          const api = sdk().orchestra.ragStudio
          void api.admit({ location, path }).then(async (result) => {
            if ("refused" in result.data) {
              if (active) setState({ busy: false, refusal: result.data.refused })
              return
            }
            await api.parse({ location, sourceId: result.data.id })
            if (!active) return
            setState({ path: state.path.trim() === path ? "" : state.path, busy: false, refusal: "" })
            await load(true, { id: result.data.id, selection: selectedAtSubmit })
          }).catch((error: unknown) => {
            if (!active) return
            console.error(error)
            setState({ busy: false, writeFailed: true })
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
        <button class="mx-btn primary" type="submit" disabled={state.busy || !state.path.trim()}>
          {language.t("orchestra.ragStudio.admit")}
        </button>
      </form>
      <Show when={state.refusal}>
        {(refusal) => (
          <p class="mx-error" role="alert">{language.t(`orchestra.ragStudio.refused.${refusal()}`)}</p>
        )}
      </Show>
      <Show when={state.writeFailed}>
        <p class="mx-error" role="alert">{language.t("orchestra.ragStudio.actionError")}</p>
      </Show>
      <Show when={roster.status === "loading"}>
        <div class="mx-empty" role="status">{language.t("orchestra.ragStudio.loading")}</div>
      </Show>
      <Show when={roster.status === "error"}>
        <div class="mx-empty" role="alert">
          <strong>{language.t("orchestra.ragStudio.error")}</strong>
          <button class="mx-btn" type="button" onClick={() => void load(false)}>{language.t("common.retry")}</button>
        </div>
      </Show>
      <Show when={roster.status === "ready" && roster.sources.length === 0}>
        <div class="mx-empty"><strong>{language.t("orchestra.ragStudio.empty")}</strong></div>
      </Show>
      <Show when={roster.status === "ready" && roster.sources.length > 0}>
        <div class="rag-columns rag-library">
          <div class="mx-table rag-inventory" role="list" aria-label={language.t("orchestra.ragStudio.files")}>
            <For each={roster.sources}>
              {(source) => (
                <div class="mx-row rag-file" role="listitem" data-selected={roster.openId === source.id ? "true" : undefined}>
                  <button
                    class="rag-file-open"
                    type="button"
                    aria-pressed={roster.openId === source.id}
                    onClick={() => {
                      selection += 1
                      void openSource(source.id)
                    }}
                  >
                    <span class="mx-grow">
                      <strong><bdi>{pathName(source.path)}</bdi></strong>
                      <Show when={pathDir(source.path)}>
                        {(dir) => <small dir="ltr"><bdi>{dir()}</bdi></small>}
                      </Show>
                    </span>
                    <MxBadge tone={statusTone(source.status)}>{language.t(statusKey(source.status))}</MxBadge>
                  </button>
                  <button
                    class="mx-btn danger rag-file-remove"
                    type="button"
                    onClick={() => {
                      setState("writeFailed", false)
                      void sdk().orchestra.ragStudio.remove({ location, sourceId: source.id }).then(
                        () => {
                          if (!active) return
                          batch(() => {
                            setRoster("sources", reconcile(roster.sources.filter((row) => row.id !== source.id)))
                            if (roster.openId !== source.id) return
                            sourceRead += 1
                            setRoster("openId", "")
                            setState({ reader: "idle", text: "", cuts: [] })
                          })
                          return load(true)
                        },
                        (error: unknown) => {
                          if (!active) return
                          console.error(error)
                          setState("writeFailed", true)
                        },
                      )
                    }}
                  >
                    {language.t("orchestra.ragStudio.remove")}
                  </button>
                </div>
              )}
            </For>
          </div>
          <section class="rag-evidence" aria-label={language.t("orchestra.ragStudio.cuts")}>
            <div class="rag-evidence-head">
              <h2>{language.t("orchestra.ragStudio.cuts")}</h2>
              <Show when={selected()}>
                {(source) => <p class="rag-path" dir="ltr"><bdi>{source().path}</bdi></p>}
              </Show>
            </div>
            <Show when={state.reader === "idle"}>
              <p class="rag-evidence-note">{language.t("orchestra.ragStudio.pickFile")}</p>
            </Show>
            <Show when={state.reader === "loading"}>
              <p class="rag-evidence-note" role="status">{language.t("common.loading")}</p>
            </Show>
            <Show when={state.reader === "error"}>
              <div class="rag-evidence-note" role="alert">
                <p class="mx-error">{language.t("orchestra.ragStudio.actionError")}</p>
                <button class="mx-btn" type="button" onClick={() => void openSource(roster.openId)}>
                  {language.t("common.retry")}
                </button>
              </div>
            </Show>
            <Show when={state.reader === "ready"}>
              <Show when={state.text} fallback={<p class="rag-evidence-note">{language.t("orchestra.ragStudio.notRecorded")}</p>}>
                <SourceText text={state.text} cuts={state.cuts} />
              </Show>
            </Show>
          </section>
        </div>
      </Show>
    </section>
  )
}
