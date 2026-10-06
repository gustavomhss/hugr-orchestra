import { createSignal, For, Show } from "solid-js"
import type { RelayDocument, RelayRun, RelayRunStatus } from "./client"
import { newestFirst, RUN_TONE, runHandle, span } from "./format"
import type { Flow } from "./graph"
import { stateLabel } from "./parts"
import { Receipt } from "./receipt"
import type { RelaySource } from "./source"
import { Ic, useRelayCopy } from "./ui"

const FILTERS = ["all", "running", "parked", "failed", "completed"] as const

// The Executions tab of one workflow: its runs on the left, the selected receipt on the right.
export function Executions(props: {
  document: RelayDocument
  flow: Flow
  runs: RelayRun[]
  selected: string | undefined
  source: RelaySource
  go: (path: string) => void
  onRun: () => void
  onOpenStep: (run: RelayRun, wp: string) => void
  onCanvas: (run: RelayRun) => void
  onSession: (sessionID: string) => void
  onSelect: (run: RelayRun) => void
}) {
  const copy = useRelayCopy()
  const [filter, setFilter] = createSignal<"all" | RelayRunStatus>("all")
  const ordered = () => newestFirst(props.runs)
  const current = () =>
    ordered().find((run) => run.runID === props.selected) ?? (props.selected ? undefined : ordered()[0])
  const shown = () => ordered().filter((run) => filter() === "all" || run.status === filter())
  return (
    <div class="wf-exec">
      <div class="wf-runs">
        <div class="wf-runs-filter" role="group" aria-label={copy.t("orchestra.workflows.runs.filter")}>
          <For each={FILTERS}>
            {(value) => (
              <button type="button" class="wf-tab" aria-pressed={filter() === value} onClick={() => setFilter(value)}>
                {value === "all"
                  ? copy.t("orchestra.workflows.filter.all")
                  : copy.t(`orchestra.workflows.state.${value}`)}
                <span
                  class="wf-count"
                  classList={{ warm: value === "parked" && props.runs.some((run) => run.status === "parked") }}
                >
                  {value === "all" ? props.runs.length : props.runs.filter((run) => run.status === value).length}
                </span>
              </button>
            )}
          </For>
        </div>
        <div class="wf-runs-list" role="listbox" aria-label={copy.t("orchestra.workflows.runs.list")}>
          <Show
            when={shown().length}
            fallback={
              <p class="wf-col-empty" style={{ margin: "8px" }}>
                {copy.t("orchestra.workflows.runs.noMatches")}
              </p>
            }
          >
            <For each={shown()}>
              {(run) => (
                <button
                  type="button"
                  class="wf-run"
                  role="option"
                  data-run={run.runID}
                  aria-selected={current()?.runID === run.runID}
                  onClick={() => props.onSelect(run)}
                >
                  <span class={`wf-dot ${RUN_TONE[run.status]}`} />
                  <b>
                    #{runHandle(run.runID)} · {stateLabel(copy, run)}
                  </b>
                  <em>{copy.clock(run.startedAt)}</em>
                  <small>
                    {[
                      run.label,
                      run.version !== undefined ? `v${run.version}` : undefined,
                      span(run.startedAt, run.endedAt, Date.now()),
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </small>
                </button>
              )}
            </For>
          </Show>
        </div>
      </div>
      <div class="wf-receipt">
        <Show
          when={current()}
          fallback={
            <div class="wf-receipt-inner">
              <div class="mx-empty wf-empty" style={{ "margin-top": "40px" }}>
                <strong>
                  {copy.t(props.selected ? "orchestra.workflows.receipt.missing" : "orchestra.workflows.runs.empty")}
                </strong>
                {copy.t(
                  props.document.activeVersionId
                    ? "orchestra.workflows.receipt.runPublished"
                    : "orchestra.workflows.receipt.publishFirst",
                )}
                <br />
                <button
                  type="button"
                  class="mx-btn primary"
                  disabled={!props.document.activeVersionId}
                  onClick={props.onRun}
                >
                  <Ic name="play" />
                  {copy.t("orchestra.workflows.editor.run")}
                </button>
              </div>
            </div>
          }
        >
          {(run) => (
            <Receipt
              run={run()}
              document={props.document}
              flow={props.flow}
              source={props.source}
              onOpenStep={(wp) => props.onOpenStep(run(), wp)}
              onCanvas={() => props.onCanvas(run())}
              onSession={props.onSession}
            />
          )}
        </Show>
      </div>
    </div>
  )
}
