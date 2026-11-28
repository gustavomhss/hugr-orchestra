import { For, Match, onCleanup, Show, Switch } from "solid-js"
import { createStore } from "solid-js/store"
import { useLanguage } from "@/context/language"
import { useSDK } from "@/context/sdk"
import type { ChapterPageProps } from "@/orchestra/chapter-route"
import { MxBadge } from "../kit"
import { pipelineClaim } from "./pipeline"
import { statusKey, statusTone, useRagRoster, type SourceStatus } from "./roster"
import { settleSourceRead, sourceClaim } from "./source-read"

import { SourceText } from "./source-text"

const lights = ["not_in_corpus", "search_miss", "dropped_before_model", "sent"] as const

function fileStatus(status: "" | SourceStatus) {
  if (!status) return undefined
  return status
}

function lightKey(light: (typeof lights)[number]) {
  if (light === "not_in_corpus") return "orchestra.ragStudio.light.not_in_corpus" as const
  if (light === "search_miss") return "orchestra.ragStudio.light.search_miss" as const
  if (light === "dropped_before_model") return "orchestra.ragStudio.light.dropped_before_model" as const
  return "orchestra.ragStudio.light.sent" as const
}

export function Question(props: ChapterPageProps) {
  const language = useLanguage()
  const sdk = useSDK()
  const { roster } = useRagRoster()
  const [state, setState] = createStore({
    text: "",
    askedText: "",
    revisionId: "",
    busy: false,
    asked: false,
    light: null as (typeof lights)[number] | null,
    status: "" as "" | SourceStatus,
    optional: false,
    span: null as { sourceId: string; start: number; end: number } | null,
    sourcePath: "",
    source: "",
    dropped: [] as string[],
    prompt: "",
    sense: "off" as "off" | "missing" | "fused",
    saved: false,
    error: false,
    sourceKnown: false,
    sourceFailed: false,
  })
  const location = () => ({ directory: props.directory })
  const claim = () => pipelineClaim(roster.pipelineKnown, roster.embeddingModel)
  const sourcePane = () => sourceClaim(state.sourceKnown, state.sourceFailed)
  let askRead = 0
  onCleanup(() => { askRead += 1 })
  const reportSource = (error: unknown) => {
    console.error(error)
    setState("sourceFailed", true)
  }

  return (
    <section class="rag-section">
      <div class="rag-section-head">
        <h2>{language.t("orchestra.ragStudio.diagnosis")}</h2>
        <Show
          when={claim() === "named" ? roster.embeddingModel : undefined}
          fallback={
            <Show
              when={claim() === "off"}
              fallback={
                <Show when={roster.pipelineFailed}>
                  <p role="alert">{language.t("common.requestFailed")}</p>
                </Show>
              }
            >
              <MxBadge>{language.t("orchestra.ragStudio.embeddingOff")}</MxBadge>
            </Show>
          }
        >
          {(model) => <MxBadge>{language.t("orchestra.ragStudio.embeddingNamed", { model: model() })}</MxBadge>}
        </Show>
      </div>
      <ol class="rag-lights">
        <For each={lights}>
          {(light) => (
            <li
              data-on={state.light === light ? "true" : "false"}
              aria-current={state.light === light ? "true" : undefined}
            >
              <span class="rag-light-mark" aria-hidden="true" />
              <span class="rag-light-name">{language.t(lightKey(light))}</span>
            </li>
          )}
        </For>
      </ol>
      <form
        class="rag-form"
        onSubmit={(event) => {
          event.preventDefault()
          const text = state.text.trim()
          if (!text || state.busy) return
          const directory = props.directory
          const started = ++askRead
          setState({
            busy: true,
            asked: false,
            light: null,
            saved: false,
            error: false,
            sourceKnown: false,
            sourceFailed: false,
            sourcePath: "",
            source: "",
          })
          const current = () => started === askRead && props.directory === directory
          const api = sdk().orchestra.ragStudio
          void api.revision({ location: { directory } })
            .then((opened) => {
              if (!current()) return
              return api.ask({ location: { directory }, revisionId: opened.data.id, text })
            })
            .then(async (response) => {
              if (!response || !current()) return
              const result = response.data
              const span = result.span
              setState("dropped", result.dropped.slice())
              await settleSourceRead({
                read: span ? api.source({ location: { directory }, sourceId: span.sourceId }) : undefined,
                current,
                apply: (opened) => {
                  const detail = opened.data
                  // Source detail is live. Only display a span that still matches the diagnosis.
                  if (
                    !span ||
                    detail.source.id !== span.sourceId ||
                    detail.source.status !== "read" ||
                    span.start < 0 ||
                    span.end > detail.text.length ||
                    !detail.text.slice(span.start, span.end).includes(text)
                  ) {
                    setState("sourceFailed", true)
                    return
                  }
                  setState({
                    sourcePath: detail.source.path,
                    source: detail.text,
                    dropped: result.dropped.map((id) => detail.chunks.find((chunk) => chunk.id === id)?.text || id),
                    sourceKnown: true,
                  })
                },
                report: reportSource,
              })
              if (!current()) return
              setState({
                busy: false,
                asked: true,
                askedText: text,
                revisionId: result.revisionId,
                light: result.light,
                status: result.fileStatus ?? "",
                optional: result.retrievalOptional,
                span,
                prompt: result.promptText,
                sense: result.sense,
              })
            })
            .catch((error: unknown) => {
              if (!current()) return
              console.error(error)
              setState({ busy: false, error: true })
            })
        }}
      >
        <label class="mx-field">
          <span>{language.t("orchestra.ragStudio.questionText")}</span>
          <input
            value={state.text}
            autocomplete="off"
            onInput={(event) => setState({ text: event.currentTarget.value })}
          />
        </label>
        <button class="mx-btn primary" type="submit" disabled={state.busy || !state.text.trim()}>
          {language.t("orchestra.ragStudio.ask")}
        </button>
      </form>
      <Show when={state.error}>
        <p class="mx-error" role="alert">{language.t("orchestra.ragStudio.actionError")}</p>
      </Show>
      <Show when={state.asked}>
        <div class="rag-result">
          <div class="rag-result-head">
            <bdi>{state.askedText}</bdi>
            <Show when={state.span && sourcePane() === "recorded"}>
              <button
                class="mx-btn"
                type="button"
                disabled={state.busy}
                onClick={() => {
                  const span = state.span
                  if (!span || state.busy) return
                  const started = askRead
                  setState({ busy: true, error: false })
                  void sdk().orchestra.ragStudio.question({
                    location: location(),
                    revisionId: state.revisionId,
                    text: state.askedText,
                    span,
                  }).then(
                    () => { if (started === askRead) setState({ busy: false, saved: true }) },
                    (error: unknown) => {
                      if (started !== askRead) return
                      console.error(error)
                      setState({ busy: false, error: true })
                    },
                  )
                }}
              >
                {language.t("orchestra.ragStudio.save")}
              </button>
            </Show>
          </div>
          <Show when={state.saved}>
            <p class="mx-note" role="status">{language.t("orchestra.ragStudio.saved")}</p>
          </Show>
          <div class="rag-columns rag-diagnosis">
            <section class="rag-evidence" aria-label={language.t("orchestra.ragStudio.sourcePassage")}>
              <div class="rag-evidence-head">
                <h3>{language.t("orchestra.ragStudio.sourcePassage")}</h3>
                <Show when={fileStatus(state.status)}>
                  {(status) => <MxBadge tone={statusTone(status())}>{language.t(statusKey(status()))}</MxBadge>}
                </Show>
                <Show when={sourcePane() === "recorded" && state.sourcePath}>
                  <p class="rag-path" dir="ltr"><bdi>{state.sourcePath}</bdi></p>
                </Show>
              </div>
              <Switch>
                <Match when={sourcePane() === "recorded" && state.source}>
                  <SourceText text={state.source} cuts={state.span ? [state.span] : []} />
                </Match>
                <Match when={sourcePane() === "failed"}>
                  <p class="rag-evidence-note">{language.t("orchestra.ragStudio.sourceUnavailable")}</p>
                </Match>
                <Match when={true}>
                  <p class="rag-evidence-note">{language.t("orchestra.ragStudio.notRecorded")}</p>
                </Match>
              </Switch>
            </section>
            <section class="rag-evidence rag-trace" aria-label={language.t("orchestra.ragStudio.trace")}>
              <div class="rag-evidence-head"><h3>{language.t("orchestra.ragStudio.trace")}</h3></div>
              <div class="rag-trace-body">
                <Show when={state.light === "sent"}>
                  <p>{language.t("orchestra.ragStudio.sentNote")}</p>
                </Show>
                <Show when={state.optional}>
                  <p>{language.t("orchestra.ragStudio.retrieval")}</p>
                </Show>
                <Show when={state.sense === "missing"}>
                  <p>{language.t("orchestra.ragStudio.sense.missing")}</p>
                </Show>
                <Show when={state.sense === "fused"}>
                  <p>{language.t("orchestra.ragStudio.sense.fused")}</p>
                </Show>
                <Show when={state.prompt}>
                  <details class="rag-trace-detail" open>
                    <summary>{language.t("orchestra.ragStudio.prompt")}</summary>
                    <pre class="mx-log rag-source" dir="ltr" tabindex="0">{state.prompt}</pre>
                  </details>
                </Show>
                <Show when={state.dropped.length > 0}>
                  <details class="rag-trace-detail">
                    <summary>{language.t("orchestra.ragStudio.leftOut")}</summary>
                    <ul>
                      <For each={state.dropped}>
                        {(text) => <li class="rag-passage">{text}</li>}
                      </For>
                    </ul>
                  </details>
                </Show>
                <dl class="rag-trace-revision">
                  <dt>{language.t("orchestra.ragStudio.revision")}</dt>
                  <dd><bdi>{state.revisionId}</bdi></dd>
                </dl>
              </div>
            </section>
          </div>
        </div>
      </Show>
    </section>
  )
}
