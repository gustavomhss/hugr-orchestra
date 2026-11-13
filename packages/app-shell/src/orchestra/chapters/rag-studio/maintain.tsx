import { createEffect, For, Show } from "solid-js"
import { createStore } from "solid-js/store"
import { useLanguage } from "@/context/language"
import { useSDK } from "@/context/sdk"
import { showToast } from "@/utils/toast"
import type { ChapterPageProps } from "@/orchestra/chapter-route"
import { MxBadge } from "../kit"
import { settlePipelineRead } from "./pipeline"
import { roster, setRoster, statusKey, statusTone, touchRoster } from "./roster"

import { pathDir, pathName } from "./source-text"

const passes = [
  { pass: "reparse", label: "orchestra.ragStudio.readAgain", note: "orchestra.ragStudio.pass.read", needsFile: true },
  { pass: "rechunk", label: "orchestra.ragStudio.cutAgain", note: "orchestra.ragStudio.pass.cut", needsFile: true },
  {
    pass: "redo_numbers",
    label: "orchestra.ragStudio.redoNumbers",
    note: "orchestra.ragStudio.pass.numbers",
    needsFile: true,
  },
  {
    pass: "orphan_delete",
    label: "orchestra.ragStudio.removePieces",
    note: "orchestra.ragStudio.pass.orphan",
    needsFile: false,
  },
] as const

const boundaries = [
  { value: "document", label: "orchestra.ragStudio.document" },
  { value: "line", label: "orchestra.ragStudio.line" },
] as const

const metrics = ["cosine", "dot", "distance"] as const
const numerics = ["float32", "int8", "binary"] as const

type Metric = (typeof metrics)[number]
type Numeric = (typeof numerics)[number]
type Boundary = (typeof boundaries)[number]["value"]

export function Maintain(props: ChapterPageProps) {
  const language = useLanguage()
  const sdk = useSDK()
  const [state, setState] = createStore({
    sourceId: "",
    boundary: "document" as Boundary,
    leftId: "",
    snapshot: "",
    remembered: false,
    busy: false,
    refused: false,
    compared: false,
    notice: "" as "" | "done" | "na" | "error" | "no_key",
    pipeError: false,
    compareError: false,
    parser: "plain",
    tokenizer: "utf16",
    embeddingModel: "",
    queryModel: "",
    metric: "cosine" as Metric,
    numericType: "float32" as Numeric,
    k: "4",
    kSaved: 4,
    dimension: "0",
    dimensionSaved: 0,
    rows: [] as Array<{ label: string; changed: boolean }>,
  })
  const location = () => ({ directory: props.directory })
  let pipelineRead = 0
  const reportPipeline = (error: unknown) => {
    console.error(error)
    if (!roster.pipelineFailed) showToast({ variant: "error", title: language.t("common.requestFailed") })
    setRoster("pipelineFailed", true)
  }
  const selected = () => roster.sources.find((source) => source.id === state.sourceId)
  const named = () => roster.embeddingModel.length > 0

  const apply = (data: {
    boundary: string
    parser: string
    tokenizer: string
    embeddingModel: string
    queryModel: string
    metric: Metric
    numericType: Numeric
    k: number
    dimension: number
  }) => {
    setState({
      boundary: data.boundary === "line" ? "line" : "document",
      parser: data.parser,
      tokenizer: data.tokenizer,
      embeddingModel: data.embeddingModel,
      queryModel: data.queryModel,
      metric: data.metric,
      numericType: data.numericType,
      k: String(data.k),
      kSaved: data.k,
      dimension: String(data.dimension),
      dimensionSaved: data.dimension,
      pipeError: false,
    })
    setRoster("embeddingModel", data.embeddingModel)
  }

  const saved = (data: {
    boundary: string
    metric: Metric
    numericType: Numeric
    k: number
    dimension: number
    embeddingModel: string
  }) => {
    const kDirty = state.k !== String(state.kSaved)
    const dimensionDirty = state.dimension !== String(state.dimensionSaved)
    setState({
      boundary: data.boundary === "line" ? "line" : "document",
      metric: data.metric,
      numericType: data.numericType,
      k: kDirty ? state.k : String(data.k),
      kSaved: data.k,
      dimension: dimensionDirty ? state.dimension : String(data.dimension),
      dimensionSaved: data.dimension,
      pipeError: false,
    })
    setRoster("embeddingModel", data.embeddingModel)
  }

  const update = (field: "boundary" | "k" | "dimension" | "metric" | "numeric_type", value: string | number) =>
    sdk()
      .orchestra.ragStudio.pipelineUpdate({ location: location(), field, value })
      .then((result) => {
        saved(result.data)
        return true
      })
      .catch(() => {
        setState({ pipeError: true })
        return false
      })

  createEffect(() => {
    const directory = props.directory
    const started = ++pipelineRead
    setRoster({ pipelineKnown: false, pipelineFailed: false })
    void settlePipelineRead({
      read: Promise.resolve().then(() => sdk().orchestra.ragStudio.pipeline({ location: { directory } })),
      current: () => started === pipelineRead && props.directory === directory,
      apply: (result) => {
        apply(result.data)
        setRoster({ pipelineKnown: true, pipelineFailed: false })
      },
      report: reportPipeline,
    })
  })

  createEffect(() => {
    if (!state.sourceId) return
    if (roster.sources.some((source) => source.id === state.sourceId)) return
    setState({ sourceId: "" })
  })

  const commitCount = (field: "k" | "dimension", raw: string) => {
    const value = Number(raw)
    const saved = field === "k" ? state.kSaved : state.dimensionSaved
    if (!Number.isInteger(value) || value < 0) {
      setState(field, String(saved))
      return
    }
    if (value === saved) return
    void update(field, value)
  }

  return (
    <section>
      <h3 class="mx-section">{language.t("orchestra.ragStudio.maintain")}</h3>
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
      <Show when={roster.status === "ready"}>
        <Show
          when={roster.pipelineKnown}
          fallback={
            <Show when={roster.pipelineFailed}>
              <p class="mx-error rag-follow" role="alert">
                {language.t("common.requestFailed")}
              </p>
            </Show>
          }
        >
        <h3 class="mx-section">{language.t("orchestra.ragStudio.pipeline")}</h3>
        <div class="mx-table">
          <div class="mx-row rag-stage">
            <div class="mx-grow">
              <strong>{language.t("orchestra.ragStudio.parser")}</strong>
              <small>{language.t("orchestra.ragStudio.storedCut")}</small>
            </div>
            <MxBadge>
              <Show when={state.parser === "plain"} fallback={<bdi dir="ltr">{state.parser}</bdi>}>
                {language.t("orchestra.ragStudio.plain")}
              </Show>
            </MxBadge>
          </div>
          <div class="mx-row rag-stage" role="group" aria-label={language.t("orchestra.ragStudio.boundary")}>
            <div class="mx-grow">
              <strong>{language.t("orchestra.ragStudio.boundary")}</strong>
              <small>{language.t("orchestra.ragStudio.boundaryNote")}</small>
            </div>
            <div class="rag-segment">
              <For each={boundaries}>
                {(item) => (
                  <button
                    class="mx-btn"
                    type="button"
                    aria-pressed={state.boundary === item.value}
                    onClick={() => {
                      if (state.boundary === item.value) return
                      void update("boundary", item.value)
                    }}
                  >
                    {language.t(item.label)}
                  </button>
                )}
              </For>
            </div>
          </div>
          <div class="mx-row rag-stage">
            <div class="mx-grow">
              <strong>{language.t("orchestra.ragStudio.tokenizer")}</strong>
              <small>{language.t("orchestra.ragStudio.storedCut")}</small>
            </div>
            <MxBadge>
              <Show when={state.tokenizer === "utf16"} fallback={<bdi dir="ltr">{state.tokenizer}</bdi>}>
                {language.t("orchestra.ragStudio.utf16")}
              </Show>
            </MxBadge>
          </div>
          <div class="mx-row rag-stage">
            <div class="mx-grow">
              <strong>{language.t("orchestra.ragStudio.wordSearch")}</strong>
              <small>{language.t("orchestra.ragStudio.wordNote")}</small>
            </div>
            <MxBadge>{language.t("orchestra.ragStudio.alwaysOn")}</MxBadge>
          </div>
          <div class="mx-row rag-stage">
            <div class="mx-grow">
              <strong>{language.t("orchestra.ragStudio.pieces")}</strong>
              <small>{language.t("orchestra.ragStudio.piecesNote")}</small>
            </div>
            <label class="mx-field rag-k">
              <input
                value={state.k}
                inputmode="numeric"
                autocomplete="off"
                aria-label={language.t("orchestra.ragStudio.pieces")}
                onInput={(event) => setState("k", event.currentTarget.value)}
                onBlur={(event) => commitCount("k", event.currentTarget.value)}
                onKeyDown={(event) => {
                  if (event.key !== "Enter") return
                  event.preventDefault()
                  event.currentTarget.blur()
                }}
              />
            </label>
          </div>
          <div class="mx-row rag-stage">
            <div class="mx-grow">
              <strong>{language.t("orchestra.ragStudio.model")}</strong>
              <small>{language.t("orchestra.ragStudio.modelNote")}</small>
            </div>
            <label class="mx-field rag-span">
              <input
                value={state.embeddingModel}
                spellcheck={false}
                autocomplete="off"
                aria-label={language.t("orchestra.ragStudio.model")}
                onInput={(event) => setState("embeddingModel", event.currentTarget.value)}
              />
            </label>
          </div>
          <div class="mx-row rag-stage">
            <div class="mx-grow">
              <strong>{language.t("orchestra.ragStudio.queryModel")}</strong>
              <small>{language.t("orchestra.ragStudio.queryNote")}</small>
            </div>
            <label class="mx-field rag-span">
              <input
                value={state.queryModel}
                spellcheck={false}
                autocomplete="off"
                aria-label={language.t("orchestra.ragStudio.queryModel")}
                onInput={(event) => setState("queryModel", event.currentTarget.value)}
              />
            </label>
            <button
              class="mx-btn"
              type="button"
              onClick={() => {
                const model = state.embeddingModel.trim()
                const query = state.queryModel.trim()
                setState({ embeddingModel: model, queryModel: query, pipeError: false })
                void sdk()
                  .orchestra.ragStudio.pipelineUpdate({
                    location: location(),
                    field: "embedding_model",
                    value: model,
                  })
                  .then(() =>
                    sdk().orchestra.ragStudio.pipelineUpdate({
                      location: location(),
                      field: "query_model",
                      value: query,
                    }),
                  )
                  .then((result) => {
                    saved(result.data)
                    setState({
                      embeddingModel: result.data.embeddingModel,
                      queryModel: result.data.queryModel,
                    })
                  })
                  .catch(() => setState({ pipeError: true }))
              }}
            >
              {language.t("orchestra.ragStudio.useModel")}
            </button>
          </div>
          <div class="mx-row rag-stage">
            <div class="mx-grow">
              <strong>{language.t("orchestra.ragStudio.dimension")}</strong>
              <small>{language.t("orchestra.ragStudio.dimensionNote")}</small>
            </div>
            <label class="mx-field rag-k">
              <input
                value={state.dimension}
                inputmode="numeric"
                autocomplete="off"
                aria-label={language.t("orchestra.ragStudio.dimension")}
                onInput={(event) => setState("dimension", event.currentTarget.value)}
                onBlur={(event) => commitCount("dimension", event.currentTarget.value)}
                onKeyDown={(event) => {
                  if (event.key !== "Enter") return
                  event.preventDefault()
                  event.currentTarget.blur()
                }}
              />
            </label>
          </div>
          <div class="mx-row rag-stage" role="group" aria-label={language.t("orchestra.ragStudio.numeric")}>
            <div class="mx-grow">
              <strong>{language.t("orchestra.ragStudio.numeric")}</strong>
              <small>{language.t("orchestra.ragStudio.numericNote")}</small>
            </div>
            <div class="rag-segment">
              <For each={numerics}>
                {(kind) => (
                  <button
                    class="mx-btn"
                    type="button"
                    aria-pressed={state.numericType === kind}
                    onClick={() => {
                      if (state.numericType === kind) return
                      void update("numeric_type", kind)
                    }}
                  >
                    {language.t(numericKey(kind))}
                  </button>
                )}
              </For>
            </div>
          </div>
          <div class="mx-row rag-stage" role="group" aria-label={language.t("orchestra.ragStudio.metric")}>
            <div class="mx-grow">
              <strong>{language.t("orchestra.ragStudio.metric")}</strong>
              <small>{language.t("orchestra.ragStudio.metricNote")}</small>
            </div>
            <div class="rag-segment">
              <For each={metrics}>
                {(metric) => (
                  <button
                    class="mx-btn"
                    type="button"
                    aria-pressed={state.metric === metric}
                    onClick={() => {
                      if (state.metric === metric) return
                      void update("metric", metric)
                    }}
                  >
                    {language.t(metricKey(metric))}
                  </button>
                )}
              </For>
            </div>
          </div>
          <div class="mx-row rag-stage">
            <div class="mx-grow">
              <strong>{language.t("orchestra.ragStudio.fusion")}</strong>
              <small>{language.t("orchestra.ragStudio.fusionNote")}</small>
            </div>
            <MxBadge>
              {language.t(named() ? "orchestra.ragStudio.fusionRank" : "orchestra.ragStudio.fusionOff")}
            </MxBadge>
          </div>
        </div>
        <Show when={state.pipeError}>
          <p class="mx-error rag-follow" role="alert">
            {language.t("orchestra.ragStudio.actionError")}
          </p>
        </Show>
        </Show>

        <h3 class="mx-section">{language.t("orchestra.ragStudio.passes")}</h3>
        <Show when={roster.sources.length === 0}>
          <div class="mx-empty">
            <strong>{language.t("orchestra.ragStudio.empty")}</strong>
          </div>
        </Show>
        <Show when={roster.sources.length > 0}>
          <div class="mx-table">
            <For each={roster.sources}>
              {(source) => (
                <button
                  type="button"
                  class="mx-row rag-pick"
                  aria-pressed={state.sourceId === source.id}
                  onClick={() => setState({ sourceId: source.id, notice: "" })}
                >
                  <span class="mx-grow">
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
                  </span>
                  <MxBadge tone={statusTone(source.status)}>{language.t(statusKey(source.status))}</MxBadge>
                </button>
              )}
            </For>
          </div>
        </Show>
        <Show when={roster.sources.length > 0 && !selected()}>
          <p class="mx-note">{language.t("orchestra.ragStudio.pickFile")}</p>
        </Show>
        <Show when={selected()}>
          {(source) => (
            <p class="mx-note rag-path" dir="ltr">
              <bdi>{source().path}</bdi>
            </p>
          )}
        </Show>
        <div class="mx-table rag-follow">
          <For each={passes}>
            {(item) => (
              <div class="mx-row rag-stage">
                <div class="mx-grow">
                  <strong>{language.t(item.label)}</strong>
                  <small>{language.t(item.note)}</small>
                </div>
                <button
                  class="mx-btn"
                  type="button"
                  aria-label={language.t(item.label)}
                  disabled={state.busy || (item.needsFile && !state.sourceId)}
                  onClick={() => {
                    if (state.busy) return
                    if (item.needsFile && !state.sourceId) return
                    setState({ busy: true, notice: "" })
                    void sdk()
                      .orchestra.ragStudio.pass({
                        location: location(),
                        pass: item.pass,
                        sourceId: state.sourceId,
                      })
                      .then((result) => {
                        touchRoster()
                        if ("result" in result.data && result.data.result === "no_key") {
                          setState({ busy: false, notice: "no_key" })
                          return
                        }
                        if ("result" in result.data) {
                          setState({ busy: false, notice: "na" })
                          return
                        }
                        setState({ busy: false, notice: "done" })
                      })
                      .catch(() => setState({ busy: false, notice: "error" }))
                  }}
                >
                  {language.t("orchestra.ragStudio.run")}
                </button>
              </div>
            )}
          </For>
        </div>
        <Show when={state.notice === "done"}>
          <p class="mx-note" role="status">
            {language.t("orchestra.ragStudio.done")}
          </p>
        </Show>
        <Show when={state.notice === "no_key"}>
          <p class="mx-error" role="alert">
            {language.t("orchestra.ragStudio.noKey")}
          </p>
        </Show>
        <Show when={state.notice === "na"}>
          <p class="mx-note" role="status">
            {language.t("orchestra.ragStudio.notApplicable")}
          </p>
        </Show>
        <Show when={state.notice === "error"}>
          <p class="mx-error" role="alert">
            {language.t("orchestra.ragStudio.actionError")}
          </p>
        </Show>

        <h3 class="mx-section">{language.t("orchestra.ragStudio.compareSection")}</h3>
        <p class="mx-note">{language.t("orchestra.ragStudio.oneStage")}</p>
        <div class="rag-actions">
          <button
            class="mx-btn"
            type="button"
            disabled={state.busy}
            onClick={() => {
              setState({ busy: true, refused: false, notice: "", compareError: false })
              void sdk()
                .orchestra.ragStudio.revision({ location: location() })
                .then((left) =>
                  setState({
                    busy: false,
                    leftId: left.data.id,
                    snapshot: left.data.snapshot,
                    remembered: true,
                    refused: false,
                    compareError: false,
                  }),
                )
                .catch(() => setState({ busy: false, compareError: true }))
            }}
          >
            {language.t("orchestra.ragStudio.remember")}
          </button>
          <button
            class="mx-btn"
            type="button"
            disabled={!state.leftId || state.busy}
            onClick={() => {
              if (!state.leftId || state.busy) return
              setState({ busy: true, refused: false, compareError: false })
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
                  if ("rejected" in compared.data) {
                    setState({ busy: false, refused: true, compared: false, rows: [] })
                    return
                  }
                  setState({
                    busy: false,
                    refused: false,
                    compared: true,
                    rows: compared.data.questions
                      .map((row) => ({
                        label: row.text,
                        changed: row.startChanged || row.endChanged || row.textChanged,
                      }))
                      .sort((left, right) => Number(right.changed) - Number(left.changed)),
                  })
                })
                .catch(() => setState({ busy: false, compareError: true }))
            }}
          >
            {language.t("orchestra.ragStudio.compare")}
          </button>
        </div>
        <Show when={state.remembered}>
          <p class="mx-note" role="status">
            {language.t("orchestra.ragStudio.remembered")}
          </p>
        </Show>
        <Show when={state.compareError}>
          <p class="mx-error" role="alert">
            {language.t("orchestra.ragStudio.actionError")}
          </p>
        </Show>
        <Show when={state.refused}>
          <p class="mx-error" role="alert">
            {language.t("orchestra.ragStudio.compareRefused")}
          </p>
        </Show>
        <Show when={state.compared && state.rows.length === 0}>
          <p class="mx-note">{language.t("orchestra.ragStudio.noQuestions")}</p>
        </Show>
        <Show when={state.rows.length > 0}>
          <div class="mx-table rag-follow">
            <For each={state.rows}>
              {(row) => (
                <div class="mx-row" data-changed={row.changed ? "true" : undefined}>
                  <div class="mx-grow">
                    <strong>
                      <bdi>{row.label}</bdi>
                    </strong>
                  </div>
                  <MxBadge>
                    {language.t(row.changed ? "orchestra.ragStudio.changed" : "orchestra.ragStudio.unchanged")}
                  </MxBadge>
                </div>
              )}
            </For>
          </div>
        </Show>
      </Show>
    </section>
  )
}

function metricKey(metric: Metric) {
  if (metric === "dot") return "orchestra.ragStudio.dot" as const
  if (metric === "distance") return "orchestra.ragStudio.distance" as const
  return "orchestra.ragStudio.cosine" as const
}

function numericKey(kind: Numeric) {
  if (kind === "int8") return "orchestra.ragStudio.int8" as const
  if (kind === "binary") return "orchestra.ragStudio.binary" as const
  return "orchestra.ragStudio.float32" as const
}
