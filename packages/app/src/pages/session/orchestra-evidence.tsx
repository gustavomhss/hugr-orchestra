import type { Message, Part } from "@opencode-ai/sdk/v2"
import { Icon } from "@opencode-ai/ui/v2/icon"
import {
  type Accessor,
  createEffect,
  createMemo,
  createSignal,
  createUniqueId,
  For,
  type JSX,
  Match,
  on,
  Show,
  Switch,
  untrack,
} from "solid-js"
import { useLanguage } from "@/context/language"
import { useSDK } from "@/context/sdk"
import { useSync } from "@/context/sync"
import { useParams } from "@solidjs/router"
import type { EvidenceComposerActions } from "./composer/session-evidence-actions"
import { createEvidenceCache, type ExecutionEvidence, isShellTool } from "./orchestra-evidence-data"
import { EvidenceActions } from "./orchestra-evidence-actions"
import { type TestCountKey, type TestCounts, type TestRunner } from "./orchestra-evidence-parse"

// The timeline seam: one call per mounted assistant part. Returning undefined keeps the
// existing part renderer; shell parts get a wrapper that falls back to it until a
// completed run yields evidence, so the output is never rendered twice.
export type ExecutionEvidenceInput = {
  part: Accessor<Part>
  message: Accessor<Message>
  output: () => JSX.Element
  openOutput: () => void
  onSizeChange?: () => void
}

const RUNNER_LABEL: Record<TestRunner, string> = {
  bun: "bun test",
  vitest: "Vitest",
  jest: "Jest",
  playwright: "Playwright",
  pytest: "pytest",
  go: "go test",
  cargo: "cargo test",
}
const COUNT_ORDER: TestCountKey[] = [
  "failed",
  "errors",
  "interrupted",
  "passed",
  "flaky",
  "skipped",
  "todo",
  "notRun",
  "noTests",
]
const FAILURES_SHOWN = 6

export function createExecutionEvidenceRenderer(input: {
  actions: EvidenceComposerActions
  enabled: Accessor<boolean>
  sessionKey: Accessor<string>
}) {
  const sdk = useSDK()
  const sync = useSync()
  const params = useParams()
  const cache = createEvidenceCache()
  const sources = createMemo(
    () => new Map((sync().data.session_message[params.id ?? ""] ?? []).map((message) => [message.id, message])),
  )
  createEffect(on(input.sessionKey, () => cache.clear(), { defer: true }))

  return (seam: ExecutionEvidenceInput) => {
    const initial = seam.part()
    if (initial.type !== "tool" || !isShellTool(initial.tool) || !untrack(input.enabled)) return
    const evidence = createMemo(() => {
      const part = seam.part()
      if (part.type !== "tool") return
      const message = seam.message()
      const parent = message.role === "assistant" ? sources().get(message.parentID) : undefined
      // Live projection can also index its synthetic assistant. The raw shell
      // parent remains authoritative, including interruption and missing end time.
      const source = parent?.type === "shell" ? parent : sources().get(message.id)
      return cache.read(part, { scope: sdk().scope, directory: sdk().directory }, source)
    })
    return (
      <Show when={evidence()} fallback={seam.output()}>
        {(value) => <EvidenceCard evidence={value()} seam={seam} actions={input.actions} />}
      </Show>
    )
  }
}

function EvidenceCard(props: {
  evidence: ExecutionEvidence
  seam: ExecutionEvidenceInput
  actions: EvidenceComposerActions
}) {
  const language = useLanguage()
  const id = createUniqueId()
  const [tab, setTab] = createSignal<"result" | "output">("result")
  const summary = () => props.evidence.summary
  const runner = () => RUNNER_LABEL[props.evidence.runner]
  const select = (next: "result" | "output") => {
    setTab(next)
    if (next === "output") props.seam.openOutput()
    props.seam.onSizeChange?.()
  }
  const showOutput = () => {
    select("output")
    document.getElementById(`${id}-output-tab`)?.focus()
  }
  const stateLabel = () => {
    const state = props.evidence.state
    if (state === "partial") return language.t("orchestra.output.partial")
    return language.t(`orchestra.evidence.state.${state}`)
  }
  const counts = (values: TestCounts) =>
    COUNT_ORDER.flatMap((key) => {
      const value = values[key]
      if (value === undefined) return []
      return [{ key, text: language.t(`orchestra.evidence.count.${key}`, { count: value }) }]
    })
  const result = createMemo(() => {
    const value = summary()
    const parts = [stateLabel(), ...(value ? counts(value.tests.counts).map((item) => item.text) : [])]
    const exit = props.evidence.exit
    return `${parts.join(", ")} (${exit === undefined ? language.t("orchestra.output.unknownExit") : language.t("orchestra.evidence.exit", { code: exit })})`
  })
  const keyDown = (event: KeyboardEvent) => {
    const order = ["result", "output"] as const
    const index = order.indexOf(tab())
    const next =
      event.key === "ArrowRight" || event.key === "ArrowLeft"
        ? order[(index + 1) % order.length]
        : event.key === "Home"
          ? order[0]
          : event.key === "End"
            ? order[1]
            : undefined
    if (!next) return
    event.preventDefault()
    select(next)
    document.getElementById(`${id}-${next}-tab`)?.focus()
  }

  return (
    <section
      data-orchestra-evidence
      data-part-id={props.evidence.source.partID}
      data-state={props.evidence.state}
      aria-label={language.t("orchestra.evidence.label", { command: props.evidence.source.command })}
    >
      <div data-slot="evidence-card">
        <div data-slot="evidence-tabs">
          <div data-slot="evidence-tablist" role="tablist" onKeyDown={keyDown}>
            <For each={["result", "output"] as const}>
              {(item) => (
                <button
                  type="button"
                  role="tab"
                  id={`${id}-${item}-tab`}
                  aria-selected={tab() === item}
                  aria-controls={`${id}-${item}`}
                  tabIndex={tab() === item ? 0 : -1}
                  onClick={() => select(item)}
                >
                  {language.t(item === "result" ? "orchestra.evidence.tab.result" : "orchestra.evidence.tab.output")}
                </button>
              )}
            </For>
          </div>
          <code data-slot="evidence-command" title={props.evidence.source.command}>
            <bdi dir="ltr">{props.evidence.source.command}</bdi>
          </code>
        </div>
        <div
          role="tabpanel"
          id={`${id}-result`}
          aria-labelledby={`${id}-result-tab`}
          data-slot="evidence-result"
          hidden={tab() !== "result"}
        >
          <div data-slot="evidence-head">
            <Switch>
              <Match when={props.evidence.state === "partial"}>
                <span data-slot="evidence-badge">{stateLabel()}</span>
              </Match>
              <Match when={true}>
                <span data-slot="evidence-status">
                  <Icon
                    name={
                      props.evidence.state === "passed"
                        ? "check"
                        : props.evidence.state === "failed"
                          ? "outline-xmark"
                          : "status"
                    }
                    size="small"
                    aria-hidden="true"
                  />
                  <bdi>{stateLabel()}</bdi>
                </span>
              </Match>
            </Switch>
            <button type="button" data-slot="evidence-link" onClick={showOutput}>
              <bdi>{language.t("orchestra.output.open")}</bdi>
              <Icon name="outline-square-arrow" size="small" aria-hidden="true" />
            </button>
          </div>
          <Show
            when={summary()}
            fallback={
              <div data-slot="evidence-partial">
                <p>{language.t("orchestra.evidence.partialRetained")}</p>
                <Show when={props.evidence.outputPath}>
                  {(path) => (
                    <p data-slot="evidence-meta">{language.t("orchestra.evidence.outputPath", { path: path() })}</p>
                  )}
                </Show>
              </div>
            }
          >
            {(value) => (
              <>
                <dl data-slot="evidence-rows">
                  <For
                    each={[value().groups, value().tests].flatMap((row) =>
                      row?.counts && Object.keys(row.counts).length > 0 ? [row] : [],
                    )}
                  >
                    {(row) => (
                      <div data-slot="evidence-row">
                        <dt>{language.t(`orchestra.evidence.unit.${row.unit}`)}</dt>
                        <dd>
                          <For each={counts(row.counts!)}>
                            {(item) => (
                              <span data-count={item.key}>
                                <bdi>{item.text}</bdi>
                              </span>
                            )}
                          </For>
                          <Show when={row.total !== undefined}>
                            <span data-slot="evidence-total">({row.total})</span>
                          </Show>
                        </dd>
                      </div>
                    )}
                  </For>
                </dl>
                <Show when={value().groups && !value().groups!.counts ? value().groups : undefined}>
                  {(group) => (
                    <p data-slot="evidence-line">
                      {language.t(
                        group().unit === "binaries"
                          ? "orchestra.evidence.executed.binaries"
                          : "orchestra.evidence.executed.files",
                        { count: group().total },
                      )}
                    </p>
                  )}
                </Show>
                <p
                  data-slot="evidence-line"
                  data-exit={props.evidence.exit === undefined ? "unknown" : props.evidence.exit}
                >
                  {props.evidence.exit === undefined
                    ? language.t("orchestra.output.unknownExit")
                    : language.t("orchestra.evidence.exit", { code: props.evidence.exit })}
                </p>
                <Show when={value().failures.length > 0}>
                  <div data-slot="evidence-failures">
                    <span>{language.t("orchestra.evidence.failures")}</span>
                    <ul>
                      <For each={value().failures.slice(0, FAILURES_SHOWN)}>
                        {(name) => (
                          <li dir="ltr" title={name}>
                            {name}
                          </li>
                        )}
                      </For>
                    </ul>
                    <Show when={value().failures.length > FAILURES_SHOWN}>
                      <span data-slot="evidence-meta">
                        {language.t("orchestra.evidence.failures.more", {
                          count: value().failures.length - FAILURES_SHOWN,
                        })}
                      </span>
                    </Show>
                  </div>
                </Show>
                <p data-slot="evidence-meta">
                  <bdi>
                    {value().duration
                      ? language.t("orchestra.evidence.reportedDuration", {
                          runner: runner(),
                          duration: value().duration!,
                        })
                      : language.t("orchestra.evidence.reported", { runner: runner() })}
                  </bdi>
                </p>
                <p data-slot="evidence-meta">
                  <bdi>
                    {props.evidence.durationMs === undefined
                      ? language.t("orchestra.evidence.durationUnknown")
                      : language.t("orchestra.evidence.duration", { duration: props.evidence.durationMs })}
                  </bdi>
                </p>
              </>
            )}
          </Show>
        </div>
        <div
          role="tabpanel"
          id={`${id}-output`}
          aria-labelledby={`${id}-output-tab`}
          data-slot="evidence-output"
          hidden={tab() !== "output"}
        >
          {/* The retained output is a full tool part: mount it only while its tab is shown. */}
          <Show when={tab() === "output"}>{props.seam.output()}</Show>
        </div>
      </div>
      <p data-slot="evidence-meta">
        <bdi>{language.t("orchestra.evidence.revisionUnlinked")}</bdi>
      </p>
      <EvidenceActions evidence={props.evidence} result={result()} actions={props.actions} />
    </section>
  )
}
