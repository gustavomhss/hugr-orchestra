import { For, Show } from "solid-js"
import { createStore } from "solid-js/store"
import { useLanguage } from "@/context/language"
import { useSDK } from "@/context/sdk"
import type { ChapterPageProps } from "@/orchestra/chapter-route"

const lights = ["not_in_corpus", "search_miss", "dropped_before_model", "sent"] as const

function lightKey(light: (typeof lights)[number]) {
  if (light === "not_in_corpus") return "orchestra.ragStudio.light.not_in_corpus" as const
  if (light === "search_miss") return "orchestra.ragStudio.light.search_miss" as const
  if (light === "dropped_before_model") return "orchestra.ragStudio.light.dropped_before_model" as const
  return "orchestra.ragStudio.light.sent" as const
}

export function Question(props: ChapterPageProps) {
  const language = useLanguage()
  const sdk = useSDK()
  const [state, setState] = createStore({
    text: "",
    light: null as (typeof lights)[number] | null,
    status: "" as "" | "not_yet_read" | "read" | "failed",
    optional: false,
    span: null as { sourceId: string; start: number; end: number } | null,
    source: "",
  })
  const location = () => ({ directory: props.directory })

  return (
    <section>
      <h2>{language.t("orchestra.ragStudio.question")}</h2>
      <form
        onSubmit={(event) => {
          event.preventDefault()
          const text = state.text
          void sdk()
            .orchestra.ragStudio.revision({ location: location() })
            .then((opened) => sdk().orchestra.ragStudio.ask({ location: location(), revisionId: opened.data.id, text }))
            .then(async (result) => {
              const span = result.data.span
              const source = span
                ? (await sdk().orchestra.ragStudio.source({ location: location(), sourceId: span.sourceId })).data.text
                : ""
              setState({
                light: result.data.light,
                status: result.data.fileStatus ?? "",
                optional: result.data.retrievalOptional,
                span,
                source,
              })
            })
        }}
      >
        <label>
          {language.t("orchestra.ragStudio.questionText")}
          <input value={state.text} onInput={(event) => setState({ text: event.currentTarget.value })} />
        </label>
        <button type="submit">{language.t("orchestra.ragStudio.ask")}</button>
      </form>
      <ul>
        <For each={lights}>
          {(light) => (
            <li data-on={state.light === light ? "true" : "false"}>
              {language.t(lightKey(light))}
            </li>
          )}
        </For>
      </ul>
      <Show when={state.status}>
        <p>{language.t(state.status === "read" ? "orchestra.ragStudio.status.read" : state.status === "failed" ? "orchestra.ragStudio.status.failed" : "orchestra.ragStudio.status.not_yet_read")}</p>
      </Show>
      <Show when={state.optional}>
        <p>{language.t("orchestra.ragStudio.retrieval")}</p>
      </Show>
      <Show when={state.span}>
        {(span) => (
          <p>
            {state.source.slice(0, span().start)}
            <mark>{state.source.slice(span().start, span().end)}</mark>
            {state.source.slice(span().end)}
          </p>
        )}
      </Show>
      <p>{language.t("orchestra.ragStudio.embeddingOff")}</p>
    </section>
  )
}
