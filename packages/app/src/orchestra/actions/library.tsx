import type { Actions } from "@orchestra/schema/actions"
import { createMemo, For, Match, Show, Switch } from "solid-js"
import { Empty, Icon, Status } from "./components"
import type { Model, Translate, ViewProps } from "./contract"
import { duration, stamp } from "./format"
import { WorkflowTabs } from "./workflow-tabs"
import { visibleWorkflows } from "./selection"
import { canRequest } from "./request-policy"

export function Library(props: ViewProps & { embedded?: boolean }) {
  const model = props.model
  const page = createMemo(() => model.state.workflows.value?.items.filter((item) => item.bindingID === model.state.binding?.id).slice(0, 100) ?? [])
  const workflows = createMemo(() => visibleWorkflows(page(), model.state.filters))
  const latest = createMemo(() => latestRuns(model.state.binding?.id, model.state.runs.value?.items.slice(0, 100) ?? []))
  return (
    <section class="actions-collection mx-page" aria-label={props.t("orchestra.actions.library")}>
      <Show when={!props.embedded}><PageHeader props={props} /></Show>
      <Show when={model.state.binding} fallback={<Empty title={props.t("orchestra.actions.noConnection")} />}>
        {(binding) => <>
          <Show when={!props.embedded}><BindingStrip props={props} binding={binding()} /></Show>
          <Toolbar model={model} t={props.t} statuses={page().map((item) => item.state)} />
          <WorkflowState props={props} page={page()} workflows={workflows()} latest={latest()} />
          <Show when={model.state.workflows.value?.next}>
            <button type="button" class="mx-btn" onClick={() => void model.more("workflows")}>{props.t("orchestra.actions.more")}</button>
          </Show>
          <RunHistoryView model={model} t={props.t} embedded />
        </>}
      </Show>
    </section>
  )
}

export function RunHistory(props: ViewProps & { embedded?: boolean }) {
  return <Show when={props.model.state.binding} fallback={<Empty title={props.t("orchestra.actions.noConnection")} />}><Show when={props.model.state.route.workflowID}><div class="actions-library"><WorkflowTabs {...props} /></div></Show><RunHistoryView model={props.model} t={props.t} header={!props.embedded} /></Show>
}

function WorkflowState(props: { props: ViewProps; page: readonly Actions.Workflow[]; workflows: readonly Actions.Workflow[]; latest: Map<string, Actions.Run> }) {
  const model = props.props.model
  return <Switch>
    <Match when={model.state.workflows.status === "loading"}><p role="status">{props.props.t("orchestra.actions.loading")}</p></Match>
    <Match when={model.state.workflows.status === "error"}><p role="alert">{props.props.t(model.state.workflows.error?.message ?? "orchestra.actions.unavailable")}</p></Match>
    <Match when={!props.page.length}><Empty title={props.props.t("orchestra.actions.emptyWorkflows")} /></Match>
    <Match when={props.page.length && !props.workflows.length}><Empty title={props.props.t("orchestra.actions.noMatches")} /></Match>
    <Match when={props.workflows.length}><div class="mx-grid"><For each={props.workflows}>{(workflow) => <WorkflowCard props={props.props} workflow={workflow} run={props.latest.get(workflow.id)} />}</For></div></Match>
  </Switch>
}

function RunHistoryView(props: { model: Model; t: Translate; embedded?: boolean; header?: boolean }) {
  const page = createMemo(() => props.model.state.runs.value?.items.filter((item) => item.bindingID === props.model.state.binding?.id
    && (!props.model.state.route.workflowID || item.workflowID === props.model.state.route.workflowID)).slice(0, 100) ?? [])
  const runs = createMemo(() => filterRuns(page(), props.model.state.filters))
  const refs = createMemo(() => withSelected(options(page().map((run) => run.ref)), props.model.state.filters.ref))
  const events = createMemo(() => withSelected(options(page().map((run) => run.event)), props.model.state.filters.event))
  const statuses = createMemo(() => options(page().flatMap((run) => [run.status, run.conclusion])))
  return <section class={props.embedded ? "actions-collection collection-runs" : "actions-collection mx-page"} aria-label={props.t("orchestra.actions.runs")}>
    <Show when={props.header !== false}><header class="mx-heading"><div><h2>{props.t("orchestra.actions.runs")}</h2></div><Show when={!props.embedded}><button type="button" class="mx-btn" onClick={() => void props.model.refresh()}>{props.t("orchestra.actions.refresh")}</button></Show></header></Show>
    <Show when={!props.embedded}><Toolbar model={props.model} t={props.t} statuses={statuses()} /></Show>
    <div class="mx-toolbar collection-filters">
      <FilterSelect label={props.t("orchestra.actions.ref")} aria={props.t("orchestra.actions.ref")} selected={props.model.state.filters.ref} values={refs()} all={props.t("orchestra.actions.allRefs")} onChange={(value) => props.model.filter({ ref: value })} />
      <FilterSelect label={props.t("orchestra.actions.event")} aria={props.t("orchestra.actions.event")} selected={props.model.state.filters.event} values={events()} all={props.t("orchestra.actions.allEvents")} onChange={(value) => props.model.filter({ event: value })} />
    </div>
    <RunState props={props} page={page()} runs={runs()} />
    <Show when={props.model.state.runs.value?.next}><button type="button" class="mx-btn" onClick={() => void props.model.more("runs")}>{props.t("orchestra.actions.more")}</button></Show>
  </section>
}

function RunState(props: { props: { model: Model; t: Translate }; page: readonly Actions.Run[]; runs: readonly Actions.Run[] }) {
  return <Switch>
    <Match when={props.props.model.state.runs.status === "loading"}><p role="status">{props.props.t("orchestra.actions.loading")}</p></Match>
    <Match when={props.props.model.state.runs.status === "error"}><p role="alert">{props.props.t(props.props.model.state.runs.error?.message ?? "orchestra.actions.unavailable")}</p></Match>
    <Match when={!props.page.length}><Empty title={props.props.t("orchestra.actions.emptyRuns")} /></Match>
    <Match when={props.page.length && !props.runs.length}><Empty title={props.props.t("orchestra.actions.noMatches")} /></Match>
    <Match when={props.runs.length}><RunTable model={props.props.model} t={props.props.t} runs={props.runs} /></Match>
  </Switch>
}

function PageHeader(props: { props: ViewProps }) {
  return <header class="mx-heading"><div><div class="mx-eyebrow">{props.props.t("orchestra.actions.title")}</div><h1>{props.props.t("orchestra.actions.title")}</h1><p>{props.props.t("orchestra.actions.description")}</p></div><button type="button" class="mx-btn" onClick={() => void props.props.model.refresh()}>{props.props.t("orchestra.actions.refresh")}</button></header>
}

function BindingStrip(props: { props: ViewProps; binding: Actions.Binding }) {
  return <div class="repo-strip"><span class="provider-label"><bdi>{props.props.t(props.binding.provider.kind === "github" ? "orchestra.actions.github" : "orchestra.actions.gitlab")}</bdi></span><bdi class="repo-name">{props.binding.projectPath}</bdi><span class="collection-provider-host" dir="ltr">{props.binding.provider.hostname}</span><code dir="ltr">{props.binding.id}</code></div>
}

function Toolbar(props: { model: Model; t: Translate; statuses: readonly (string | null | undefined)[] }) {
  const statusOptions = createMemo(() => withSelected(options(props.statuses), props.model.state.filters.status))
  return <div class="actions-collection collection-toolbar mx-toolbar"><input class="mx-search" value={props.model.state.filters.query} placeholder={props.t("orchestra.actions.search")} aria-label={props.t("orchestra.actions.search")} onInput={(event) => props.model.filter({ query: event.currentTarget.value })} /><label>{props.t("orchestra.actions.status")} <select aria-label={props.t("orchestra.actions.status")} value={props.model.state.filters.status} onChange={(event) => props.model.filter({ status: event.currentTarget.value })}><option value="">{props.t("orchestra.actions.all")}</option><For each={statusOptions()}>{(value) => <option value={value}>{value}</option>}</For></select></label></div>
}

function FilterSelect(props: { label: string; aria: string; selected: string; values: readonly string[]; all: string; onChange: (value: string) => void }) {
  return <label>{props.label} <select aria-label={props.aria} value={props.selected} onChange={(event) => props.onChange(event.currentTarget.value)}><option value="">{props.all}</option><For each={props.values}>{(value) => <option value={value}>{value}</option>}</For></select></label>
}

function WorkflowCard(props: { props: ViewProps; workflow: Actions.Workflow; run?: Actions.Run }) {
  const model = props.props.model
  const label = createMemo(() => props.workflow.state === "active" ? props.props.t("orchestra.actions.enabled") : props.workflow.state.startsWith("disabled_") ? props.props.t("orchestra.actions.disabled") : props.props.t("orchestra.actions.unknown"))
   return <article class="mx-card workflow-card"><div class="mx-card-top"><span class="mx-mark"><Icon name="workflow" /></span><div class="mx-grow"><h3><button type="button" class="title-link mx-link" onClick={() => model.navigate({ view: "workflow", workflowID: props.workflow.id })}><bdi>{props.workflow.name ?? props.workflow.id}</bdi></button></h3><button type="button" class="collection-path title-link mx-link" onClick={() => model.navigate({ view: "source", workflowID: props.workflow.id, path: props.workflow.path })}><bdi dir="ltr">{props.workflow.path}</bdi></button></div><span class="mx-badge">{label()}</span></div><div class="mx-meta"><span>{props.workflow.triggers?.join(" · ")}</span><small>{stamp(props.workflow.updatedAt)}</small></div><div class="collection-last"><span class="collection-last-label">{props.props.t("orchestra.actions.run")}</span><Show when={props.run} fallback={<span>{props.props.t("orchestra.actions.unknown")}</span>}>{(run) => <button type="button" class="collection-last-run title-link mx-link" onClick={() => model.navigate({ view: "run", runID: run().id })}><Status status={run().status} conclusion={run().conclusion} t={props.props.t} /><bdi dir="ltr">#{run().id}</bdi></button>}</Show></div><footer class="mx-card-foot"><button type="button" class="mx-btn primary" disabled={!canRequest(model.state, "workflow.dispatch") || props.workflow.dispatchState === "unavailable" || props.workflow.state.startsWith("disabled") || props.workflow.state === "source_unresolved"} onClick={() => model.dialog({ kind: "dispatch", workflowID: props.workflow.id })}>{model.state.binding?.provider.kind === "gitlab" ? props.props.t("orchestra.actions.dispatchPipeline") : props.props.t("orchestra.actions.dispatch")}</button><button type="button" class="mx-btn" onClick={() => model.navigate({ view: "workflow", workflowID: props.workflow.id })}>{props.props.t("orchestra.actions.open")}</button></footer></article>
}

function RunTable(props: { model: Model; t: Translate; runs: readonly Actions.Run[] }) {
  return <div class="mx-table runs-table"><For each={props.runs}>{(run) => <button type="button" class="mx-row run-row" onClick={() => props.model.navigate({ view: "run", runID: run.id })}><span class="mx-grow"><strong><bdi>{run.name ?? run.id}</bdi></strong><small dir="ltr">#{run.id} · {props.t("orchestra.actions.attempt")} {run.attempt ?? props.t("orchestra.actions.unknown")}</small><small><bdi>{run.actor ?? props.t("orchestra.actions.unknown")}</bdi></small></span><span><bdi>{run.ref ?? props.t("orchestra.actions.unknown")}</bdi><small>{run.event}</small></span><Status status={run.status} conclusion={run.conclusion} t={props.t} /><span>{duration(run.duration) ?? props.t("orchestra.actions.unknown")}<small>{stamp(run.updatedAt)}</small></span></button>}</For></div>
}

function latestRuns(bindingID: string | undefined, runs: readonly Actions.Run[]) {
  return runs.reduce((result, run) => {
    if (run.bindingID !== bindingID) return result
    const current = result.get(run.workflowID)
    if (!current || newer(current, run)) result.set(run.workflowID, run)
    return result
  }, new Map<string, Actions.Run>())
}

function newer(current: Actions.Run, candidate: Actions.Run) {
  const currentTime = timestamp(current)
  const candidateTime = timestamp(candidate)
  return currentTime !== undefined && candidateTime !== undefined && candidateTime > currentTime
}

function timestamp(run: Actions.Run) {
  const value = run.createdAt ?? run.startedAt
  if (!value) return undefined
  const time = Date.parse(value)
  return Number.isNaN(time) ? undefined : time
}

function filterRuns(items: readonly Actions.Run[], filters: { query: string; status: string; ref: string; event: string }) {
  const query = filters.query.trim().toLowerCase()
  return items.filter((item) => (!query || `${item.name ?? ""} ${item.id} ${item.commit} ${item.actor ?? ""} ${item.ref ?? ""}`.toLowerCase().includes(query)) && (!filters.status || item.status === filters.status || item.conclusion === filters.status) && (!filters.ref || item.ref === filters.ref) && (!filters.event || item.event === filters.event))
}

function options(values: readonly (string | null | undefined)[]) {
  return [...new Set(values.filter((value): value is string => Boolean(value)))]
}

function withSelected(values: readonly string[], selected: string) {
  return selected && !values.includes(selected) ? [selected, ...values] : values
}
