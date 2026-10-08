import { For, Show } from "solid-js"
import type { RelayDocument } from "./client"
import type { RelayRun } from "./runs"
import { badgeTone, RUN_TONE, runHandle } from "./format"
import { checkCount, type Flow, type Issue, nodeOf, START, steps } from "./graph"
import { Ic, useRelayCopy } from "./ui"

export function VersionBadges(props: { document: RelayDocument }) {
  const copy = useRelayCopy()
  const draftAhead = () =>
    props.document.publishedCounter !== undefined && props.document.versionCounter > props.document.publishedCounter
  return (
    <Show
      when={props.document.activeVersionId}
      fallback={
        <span class="mx-badge warm">
          {copy.t("orchestra.workflows.badge.unpublished", { version: props.document.versionCounter })}
        </span>
      }
    >
      <span class="mx-badge good">
        {props.document.publishedCounter === undefined
          ? copy.t("orchestra.workflows.badge.publishedPlain")
          : copy.t("orchestra.workflows.badge.published", { version: props.document.publishedCounter })}
      </span>
      <Show when={draftAhead()}>
        <span class="mx-badge">
          {copy.t("orchestra.workflows.badge.draft", { version: props.document.versionCounter })}
        </span>
      </Show>
    </Show>
  )
}

// The editor head shows one badge: unpublished, ahead of the live version, or published.
export function HeadBadge(props: { document: RelayDocument }) {
  const copy = useRelayCopy()
  return (
    <Show
      when={props.document.activeVersionId}
      fallback={
        <span class="mx-badge warm">
          {copy.t("orchestra.workflows.badge.unpublished", { version: props.document.versionCounter })}
        </span>
      }
    >
      <Show
        when={props.document.activeVersionId !== props.document.versionId}
        fallback={
          <span class="mx-badge good">
            {props.document.publishedCounter === undefined
              ? copy.t("orchestra.workflows.badge.publishedPlain")
              : copy.t("orchestra.workflows.badge.published", { version: props.document.publishedCounter })}
          </span>
        }
      >
        <span class="mx-badge wf-badge-full" title={copy.t("orchestra.workflows.badge.aheadTitle")}>
          {copy.t("orchestra.workflows.badge.draft", { version: props.document.versionCounter })} ·{" "}
          <span style={{ color: "var(--mx-good)" }}>
            {props.document.publishedCounter === undefined
              ? copy.t("orchestra.workflows.badge.livePlain")
              : copy.t("orchestra.workflows.badge.live", { version: props.document.publishedCounter })}
          </span>
        </span>
        {/* Narrow windows keep the live version only, as the approved mock does at 1280px. */}
        <span class="mx-badge good wf-badge-compact" title={copy.t("orchestra.workflows.badge.aheadTitle")}>
          {props.document.publishedCounter === undefined
            ? copy.t("orchestra.workflows.badge.publishedPlain")
            : copy.t("orchestra.workflows.badge.published", { version: props.document.publishedCounter })}
        </span>
      </Show>
    </Show>
  )
}

export function stateLabel(copy: ReturnType<typeof useRelayCopy>, run: RelayRun) {
  return copy.t(`orchestra.workflows.state.${run.status}`)
}

export function RunState(props: { run: RelayRun | undefined; flow: Flow | undefined }) {
  const copy = useRelayCopy()
  return (
    <Show
      when={props.run}
      fallback={
        <span class="wf-state">
          <span class="wf-dot" />
          <small>{copy.t("orchestra.workflows.last.none")}</small>
        </span>
      }
    >
      {(run) => {
        const step = () => (props.flow ? nodeOf(props.flow, run().position)?.name : undefined) ?? run().position
        return (
          <span class="wf-state wf-last">
            <span class={`wf-dot ${RUN_TONE[run().status]}`} />
            <span>
              <span>
                {stateLabel(copy, run())} · #{runHandle(run().runID)}
              </span>
              <small>
                {[run().status !== "completed" ? step() : undefined, copy.when(run().startedAt)]
                  .filter(Boolean)
                  .join(" · ")}
              </small>
            </span>
          </span>
        )
      }}
    </Show>
  )
}

export function RunBadge(props: { run: RelayRun }) {
  const copy = useRelayCopy()
  return <span class={`mx-badge ${badgeTone(RUN_TONE[props.run.status])}`}>{stateLabel(copy, props.run)}</span>
}

export function Chain(props: { names: string[] }) {
  return (
    <div class="wf-chain">
      <For each={props.names}>
        {(name, index) => (
          <>
            <Show when={index() > 0}>
              <i aria-hidden="true">→</i>
            </Show>
            <span>{name}</span>
          </>
        )}
      </For>
    </div>
  )
}

export function phaseNames(flow: Flow) {
  const order = steps(flow).map((node) => node.id)
  return flow.phases
    .filter((phase) => phase.nodeIds.length)
    .toSorted((a, b) => order.indexOf(a.nodeIds[0]) - order.indexOf(b.nodeIds[0]))
    .map((phase) => phase.name)
}

// A seeded profile's objective without its "name vX — " prefix, which the card title already says.
export function templateSummary(document: RelayDocument) {
  const brief = document.nodes.find((node) => node.type === START)?.parameters.relayBrief
  const text = typeof brief === "string" ? brief.replace(/^[\w-]+ v[\d.]+ — /, "") : ""
  return text || document.description
}

export function TemplateCard(props: {
  id: string
  flows: Map<string, Flow>
  documents: RelayDocument[]
  selected?: boolean
  radio?: boolean
  onPick: (id: string) => void
}) {
  const copy = useRelayCopy()
  const document = () => props.documents.find((item) => item.id === props.id)
  const flow = () => props.flows.get(props.id)
  // Profiles whose Relay tools are not ported yet can be read in the library, but not started from here.
  const blocked = () => document()?.runnable === false
  return (
    <button
      type="button"
      class="mx-card wf-tpl"
      role={props.radio ? "radio" : undefined}
      aria-checked={props.radio ? !!props.selected : undefined}
      aria-disabled={blocked() ? "true" : undefined}
      title={blocked() ? copy.t("orchestra.workflows.template.toolsMissingTitle") : undefined}
      data-template={props.id}
      onClick={() => !blocked() && props.onPick(props.id)}
    >
      <div class="mx-card-top">
        <span class="mx-mark">
          <Ic name={props.id === "blank" ? "plus" : "workflows"} />
        </span>
        <h3>{document()?.name ?? copy.t("orchestra.workflows.template.blank")}</h3>
      </div>
      <p>
        {document()
          ? templateSummary(document()!) || copy.t("orchestra.workflows.template.copy")
          : copy.t("orchestra.workflows.template.blankBody")}
      </p>
      <Chain names={flow() ? phaseNames(flow()!) : [copy.t("orchestra.workflows.type.start")]} />
      <div class="mx-meta" style={{ "margin-top": "10px" }}>
        <Show when={flow()} fallback={<span class="mx-badge">{copy.t("orchestra.workflows.template.empty")}</span>}>
          {(current) => (
            <>
              <span class="mx-badge">
                {copy.count(
                  phaseNames(current()).length,
                  "orchestra.workflows.count.phase.one",
                  "orchestra.workflows.count.phase.other",
                )}
              </span>
              <span class="mx-badge">
                {copy.count(
                  steps(current()).length,
                  "orchestra.workflows.count.step.one",
                  "orchestra.workflows.count.step.other",
                )}
              </span>
              <span class="mx-badge">
                {copy.count(
                  checkCount(current()),
                  "orchestra.workflows.count.check.one",
                  "orchestra.workflows.count.check.other",
                )}
              </span>
            </>
          )}
        </Show>
        <Show when={blocked()}>
          <span class="mx-badge warm">{copy.t("orchestra.workflows.template.toolsMissing")}</span>
        </Show>
      </div>
    </button>
  )
}

/** Why a workflow cannot start a run, as a copy key, or undefined when it can. */
export function runBlocker(document: RelayDocument, runs: "loading" | "ready" | "unsupported" | "error") {
  if (!document.runnable) return "orchestra.workflows.row.toolsMissing" as const
  if (runs === "unsupported") return "orchestra.workflows.runs.unsupported" as const
  if (!document.activeVersionId) return "orchestra.workflows.row.publishFirst" as const
}

export function issueText(copy: ReturnType<typeof useRelayCopy>, flow: Flow, issue: Issue) {
  if (issue.code === "server") return issue.text
  const name = "node" in issue ? (nodeOf(flow, issue.node)?.name ?? "") : ""
  return copy.t(`orchestra.workflows.issue.${issue.code}`, { name })
}
