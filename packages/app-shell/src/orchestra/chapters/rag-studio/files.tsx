import { createEffect, For, Show } from "solid-js"
import { createStore } from "solid-js/store"
import { useLanguage } from "@/context/language"
import { useSDK } from "@/context/sdk"
import type { ChapterPageProps } from "@/orchestra/chapter-route"

type Status = "not_yet_read" | "read" | "failed"

function statusKey(status: Status) {
  if (status === "read") return "orchestra.ragStudio.status.read" as const
  if (status === "failed") return "orchestra.ragStudio.status.failed" as const
  return "orchestra.ragStudio.status.not_yet_read" as const
}

export function Files(props: ChapterPageProps) {
  const language = useLanguage()
  const sdk = useSDK()
  const [state, setState] = createStore({
    sources: [] as Array<{ id: string; path: string; status: Status }>,
    text: "",
    cuts: [] as Array<{ start: number; end: number }>,
    path: "",
    error: "" as "" | "load" | "atlas" | "permission",
  })
  const location = () => ({ directory: props.directory })

  const load = () =>
    sdk()
      .orchestra.ragStudio.sources({ location: location() })
      .then((result) => setState({ sources: result.data, error: "" }))
      .catch(() => setState({ error: "load" }))

  createEffect(() => {
    props.directory
    void load()
  })

  const paint = (text: string, cuts: Array<{ start: number; end: number }>) => {
    if (cuts.length === 0) return text
    const pieces: string[] = []
    let cursor = 0
    for (const cut of cuts) {
      pieces.push(text.slice(cursor, cut.start))
      pieces.push(text.slice(cut.start, cut.end))
      cursor = cut.end
    }
    pieces.push(text.slice(cursor))
    return pieces
  }

  return (
    <section>
      <h2>{language.t("orchestra.ragStudio.files")}</h2>
      <form
        onSubmit={(event) => {
          event.preventDefault()
          const path = state.path
          void sdk()
            .orchestra.ragStudio.admit({ location: location(), path })
            .then(async (result) => {
              if ("refused" in result.data) {
                setState({ error: result.data.refused })
                return
              }
              await sdk().orchestra.ragStudio.parse({ location: location(), sourceId: result.data.id })
              setState({ path: "", error: "" })
              await load()
            })
            .catch(() => setState({ error: "load" }))
        }}
      >
        <label>
          {language.t("orchestra.ragStudio.path")}
          <input value={state.path} onInput={(event) => setState({ path: event.currentTarget.value })} />
        </label>
        <button type="submit">{language.t("orchestra.ragStudio.admit")}</button>
      </form>
      <Show when={state.error === "atlas"}>
        <p>{language.t("orchestra.ragStudio.refused.atlas")}</p>
      </Show>
      <Show when={state.error === "permission"}>
        <p>{language.t("orchestra.ragStudio.refused.permission")}</p>
      </Show>
      <Show when={state.sources.length === 0} fallback={
        <ul>
          <For each={state.sources}>
            {(source) => (
              <li>
                <button
                  type="button"
                  onClick={() =>
                    void sdk()
                      .orchestra.ragStudio.source({ location: location(), sourceId: source.id })
                      .then((result) =>
                        setState({
                          text: result.data.text,
                          cuts: result.data.chunks.map((chunk) => ({ start: chunk.start, end: chunk.end })),
                        }),
                      )
                  }
                >
                  {source.path}
                </button>
                {" · "}
                {language.t(statusKey(source.status))}
                <button
                  type="button"
                  onClick={() =>
                    void sdk()
                      .orchestra.ragStudio.remove({ location: location(), sourceId: source.id })
                      .then(() => load())
                  }
                >
                  {language.t("orchestra.ragStudio.removePieces")}
                </button>
              </li>
            )}
          </For>
        </ul>
      }>
        <p>{language.t("orchestra.ragStudio.empty")}</p>
      </Show>
      <Show when={state.text}>
        <p>
          <For each={paint(state.text, state.cuts)}>
            {(piece, index) => <Show when={index() % 2 === 1} fallback={piece}><mark>{piece}</mark></Show>}
          </For>
        </p>
      </Show>
    </section>
  )
}
