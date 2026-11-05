import { For, Show } from "solid-js"
import { createStore } from "solid-js/store"
import { useLanguage } from "@/context/language"
import { useSDK } from "@/context/sdk"
import type { ChapterPageProps } from "@/orchestra/chapter-route"

const passes = [
  { pass: "reparse", label: "orchestra.ragStudio.readAgain" },
  { pass: "rechunk", label: "orchestra.ragStudio.cutAgain" },
  { pass: "redo_numbers", label: "orchestra.ragStudio.redoNumbers" },
  { pass: "orphan_delete", label: "orchestra.ragStudio.removePieces" },
] as const

export function Maintain(props: ChapterPageProps) {
  const language = useLanguage()
  const sdk = useSDK()
  const [state, setState] = createStore({
    sourceId: "",
    boundary: "line",
    leftId: "",
    snapshot: "",
    rows: [] as Array<{ id: string; changed: boolean }>,
  })
  const location = () => ({ directory: props.directory })

  return (
    <section>
      <h2>{language.t("orchestra.ragStudio.maintain")}</h2>
      <label>
        {language.t("orchestra.ragStudio.files")}
        <input value={state.sourceId} onInput={(event) => setState({ sourceId: event.currentTarget.value })} />
      </label>
      <div>
        <For each={passes}>
          {(item) => (
            <button
              type="button"
              onClick={() =>
                void sdk().orchestra.ragStudio.pass({
                  location: location(),
                  pass: item.pass,
                  sourceId: state.sourceId,
                })
              }
            >
              {language.t(item.label)}
            </button>
          )}
        </For>
      </div>
      <form
        onSubmit={(event) => {
          event.preventDefault()
          void sdk()
            .orchestra.ragStudio.revision({ location: location() })
            .then((left) => {
              setState({ leftId: left.data.id, snapshot: left.data.snapshot })
              return sdk().orchestra.ragStudio.pipelineUpdate({
                location: location(),
                field: "boundary",
                value: state.boundary,
              })
            })
        }}
      >
        <label>
          {language.t("orchestra.ragStudio.boundary")}
          <input value={state.boundary} onInput={(event) => setState({ boundary: event.currentTarget.value })} />
        </label>
        <button type="submit">{language.t("orchestra.ragStudio.boundary")}</button>
      </form>
      <button
        type="button"
        onClick={() =>
          void sdk()
            .orchestra.ragStudio.revision({ location: location() })
            .then((right) =>
              sdk().orchestra.ragStudio.compare({
                location: location(),
                leftId: state.leftId,
                rightId: right.data.id,
                proofSetId: state.snapshot,
              }),
            )
            .then((compared) => {
              if ("rejected" in compared.data) return
              setState({
                rows: compared.data.questions.map((row) => ({
                  id: row.id,
                  changed: row.startChanged || row.endChanged || row.textChanged,
                })),
              })
            })
        }
      >
        {language.t("orchestra.ragStudio.question")}
      </button>
      <Show when={state.rows.length > 0}>
        <ul>
          <For each={state.rows}>
            {(row) => (
              <li>
                {row.id} · {language.t(row.changed ? "orchestra.ragStudio.changed" : "orchestra.ragStudio.unchanged")}
              </li>
            )}
          </For>
        </ul>
      </Show>
    </section>
  )
}
