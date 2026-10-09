import { For, Show, createMemo, createEffect } from "solid-js"
import { createStore } from "solid-js/store"
import { Option, Schema } from "effect"
import { Research } from "@orchestra/schema/research"
import { useI18n } from "@orchestra/ui/context/i18n"
import { useData } from "../context"
import { Markdown } from "./markdown"
import { loadResearchDocument } from "./research-document"

const Envelope = Schema.Struct({
  schema: Schema.Literal("discovery-work-result-v1"),
  referencesChecked: Schema.optional(Schema.Boolean),
  card: Schema.Struct({ parsed: Schema.Boolean }),
  discovery: Schema.optional(Research.Card),
  documents: Schema.optional(Schema.Array(Research.DocumentReceipt)),
  corpus: Schema.optional(Research.Corpus),
  terminal: Schema.Struct({ reason: Schema.Literals(["ended", "blocked", "failed", "interrupted", "running"]), hostDetail: Schema.optional(Schema.String) }),
})

export function ResearchResult(props: { value: unknown; sessionID?: string }) {
  const data = useData()
  const i18n = useI18n()
  const result = createMemo(() => Option.getOrUndefined(Schema.decodeUnknownOption(Envelope)(props.value)))
  const card = createMemo(() => result()?.card.parsed && result()?.referencesChecked ? result()?.discovery : undefined)
  const documents = createMemo(() => result()?.documents ?? result()?.corpus?.documents ?? [])
  const [state, setState] = createStore({ document: "", failed: false, pending: false, generation: 0 })
  createEffect(() => {
    result()
    props.sessionID
    setState((previous) => ({ document: "", failed: false, pending: false, generation: previous.generation + 1 }))
  })
  const open = async (receipt: Research.DocumentReceipt) => {
    const read = data.readResearchArtifact
    if (!read || !props.sessionID || state.pending || receipt.binding.executionSessionID !== props.sessionID) return
    const generation = state.generation
    setState({ pending: true, failed: false, document: "" })
    await loadResearchDocument(receipt, read).then((text) => {
      if (state.generation === generation) setState({ document: text })
    }).catch(() => {
      if (state.generation === generation) setState({ failed: true })
    }).finally(() => {
      if (state.generation === generation) setState({ pending: false })
    })
  }
  return <Show when={result()}>{(value) => <section data-component="research-result" aria-busy={state.pending} style={{ "padding-block": "0.75rem", "text-align": "start" }}>
    <p dir="auto">{i18n.t(`ui.research.terminal.${value().terminal.reason}`)}</p>
    <Show when={card()} fallback={<p dir="auto">{i18n.t("ui.research.unverified")}</p>}>{(answer) => <>
      <p dir="auto">{i18n.t(`ui.research.sufficiency.${answer().sufficiency}`)}</p>
      <Markdown text={answer().answer} />
      <For each={answer().limitations}>{(limit) => <p dir="auto">{limit}</p>}</For>
    </>}</Show>
    <For each={documents()}>{(receipt) => <button type="button" disabled={state.pending || !data.readResearchArtifact} onClick={() => void open(receipt)} style={{ "margin-inline-end": "0.5rem" }}>
      <bdi dir="auto">{receipt.title}</bdi>
    </button>}</For>
    <Show when={state.failed}><p role="status" dir="auto">{i18n.t("ui.research.documentUnavailable")}</p></Show>
    <Show when={state.document}>{(text) => <Markdown text={text()} />}</Show>
  </section>}</Show>
}
