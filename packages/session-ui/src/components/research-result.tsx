import { For, Show, createMemo, createEffect, createUniqueId, onCleanup } from "solid-js"
import { createStore } from "solid-js/store"
import { Option, Schema } from "effect"
import { Research } from "@orchestra/schema/research"
import { useI18n } from "@orchestra/ui/context/i18n"
import { Button } from "@orchestra/ui/button"
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
  terminal: Schema.Struct({
    reason: Schema.Literals(["ended", "blocked", "failed", "interrupted", "running"]),
    hostDetail: Schema.optional(Schema.String),
  }),
})
const decodeEnvelope = Schema.decodeUnknownOption(Schema.fromJsonString(Envelope))

export function ResearchResult(props: { value: unknown; sessionID?: string }) {
  const data = useData()
  const i18n = useI18n()
  // Solid stores attach non-enumerable symbols that strict Research schemas reject.
  // Decode the JSON wire shape while tracking nested metadata updates through the proxy.
  const result = createMemo(() => Option.getOrUndefined(decodeEnvelope(JSON.stringify(props.value))))
  const card = createMemo(() =>
    result()?.card.parsed && result()?.referencesChecked ? result()?.discovery : undefined,
  )
  const documents = createMemo(() => result()?.documents ?? result()?.corpus?.documents ?? [])
  const scope = createMemo(() => ({
    key: Symbol(),
    result: result(),
    sessionID: props.sessionID,
    directory: data.directory,
    parentSessionID: data.sessionID,
    store: data.store,
  }))
  const [state, setState] = createStore<{
    scope?: symbol
    selected?: Research.DocumentReceipt
    document?: string
    failed: boolean
    pending: boolean
  }>({ failed: false, pending: false })
  const active: { controller?: AbortController } = {}
  const documentID = createUniqueId()
  const selected = () => (state.scope === scope().key ? state.selected : undefined)
  const isSelected = (receipt: Research.DocumentReceipt) =>
    selected()?.artifact.id === receipt.artifact.id && selected()?.artifact.revision === receipt.artifact.revision
  const canOpen = (receipt: Research.DocumentReceipt) =>
    !!data.readResearchArtifact && !!props.sessionID && receipt.binding.executionSessionID === props.sessionID
  createEffect(() => {
    const current = scope()
    setState({ scope: current.key, selected: undefined, document: undefined, failed: false, pending: false })
    // Context replacement and disposal must stop continuation, not only hide its final result.
    onCleanup(() => active.controller?.abort())
  })
  const open = async (receipt: Research.DocumentReceipt) => {
    const read = data.readResearchArtifact
    if (!read || !canOpen(receipt) || (isSelected(receipt) && state.pending)) return
    const current = scope()
    active.controller?.abort()
    const controller = new AbortController()
    active.controller = controller
    setState({ scope: current.key, selected: receipt, pending: true, failed: false, document: undefined })
    await loadResearchDocument(receipt, read, controller.signal)
      .then((text) => {
        if (!controller.signal.aborted && scope() === current) setState({ document: text })
      })
      .catch(() => {
        if (!controller.signal.aborted && scope() === current) setState({ failed: true })
      })
      .finally(() => {
        if (!controller.signal.aborted && scope() === current) setState({ pending: false })
      })
  }
  return (
    <Show when={result()}>
      {(value) => (
        <section
          data-component="research-result"
          aria-labelledby={`${documentID}-terminal`}
          style={{ "padding-block": "0.75rem", "text-align": "start" }}
        >
          <p id={`${documentID}-terminal`} dir="auto">
            {i18n.t(`ui.research.terminal.${value().terminal.reason}`)}
          </p>
          <Show when={card()} fallback={<p dir="auto">{i18n.t("ui.research.unverified")}</p>}>
            {(answer) => (
              <>
                <p dir="auto">{i18n.t(`ui.research.sufficiency.${answer().sufficiency}`)}</p>
                <Markdown text={answer().answer} />
                <For each={answer().limitations}>{(limit) => <p dir="auto">{limit}</p>}</For>
              </>
            )}
          </Show>
          <div style={{ display: "flex", "flex-wrap": "wrap", gap: "0.5rem" }}>
            <For each={documents()}>
              {(receipt) => (
                <Button
                  type="button"
                  size="small"
                  disabled={!canOpen(receipt) || (isSelected(receipt) && state.pending)}
                  aria-controls={documentID}
                  aria-pressed={isSelected(receipt)}
                  onClick={() => void open(receipt)}
                  style={{
                    "white-space": "normal",
                    "text-align": "start",
                    "max-inline-size": "100%",
                    "overflow-wrap": "anywhere",
                    "block-size": "auto",
                    "min-block-size": "1.5rem",
                    "padding-block": "0.125rem",
                  }}
                >
                  <bdi dir="auto">{receipt.title}</bdi>
                </Button>
              )}
            </For>
          </div>
          <p role="status" dir="auto">
            <Show when={selected() && state.pending}>{i18n.t("ui.research.documentLoading")}</Show>
            <Show when={selected() && state.failed}>{i18n.t("ui.research.documentUnavailable")}</Show>
          </p>
          <div
            id={documentID}
            role={selected() ? "region" : undefined}
            aria-labelledby={selected() ? `${documentID}-title` : undefined}
            aria-busy={!!selected() && state.pending}
          >
            <Show when={selected()}>
              {(receipt) => (
                <>
                  <h3 id={`${documentID}-title`} dir="auto">
                    {receipt().title}
                  </h3>
                  <Show when={state.document !== undefined}>
                    <Markdown text={state.document ?? ""} />
                  </Show>
                </>
              )}
            </Show>
          </div>
        </section>
      )}
    </Show>
  )
}
