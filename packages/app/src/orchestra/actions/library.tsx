import type { Actions } from "@orchestra/schema/actions"
import { createMemo, For, Match, Show, Switch } from "solid-js"
import { createStore } from "solid-js/store"
import { Empty, Icon, Status } from "./components"
import type { Model, Translate, ViewProps } from "./contract"
import { duration, stamp } from "./format"
import { WorkflowTabs } from "./workflow-tabs"
import { canRequestAction } from "./action-eligibility"
import { libraryPresentation, workflowState } from "./library-presentation"

export function Library(props: ViewProps & { embedded?: boolean }) {
  const model = props.model
  // Workflow states are not run statuses. Keep these bounded-page filters out of native run requests.
  const [filters, setFilters] = createStore({ query: "", status: "" })
  const collection = createMemo(() => libraryPresentation(model.state, filters))
  return (
    <section class="actions-collection mx-page" aria-label={props.t("orchestra.actions.library")}>
      <Show when={!props.embedded}><PageHeader props={props} /></Show>
      <Show when={model.state.binding} fallback={<Empty title={props.t("orchestra.actions.noConnection")} />}>
        {(binding) => <>
          <Show when={!props.embedded}><BindingStrip props={props} binding={binding()} /></Show>
          <Show when={collection().actualOrchestraCI}>{(workflow) => <button type="button" class="collection-reference"
            onClick={() => model.navigate({ view: "workflow", workflowID: workflow().id, path: workflow().path, ref: workflow().defaultRef, tab: "graph" })}>
            <span class="mx-mark"><Icon name="workflow" /></span><span class="collection-reference-copy">
              <strong>{props.t("orchestra.actions.actualOrchestraCI")} · <bdi>{workflow().name ?? workflow().id}</bdi></strong>
              <small><bdi>{binding().projectPath}</bdi> · <bdi dir="ltr">{workflow().path}</bdi></small>
            </span><span class="collection-reference-context">{props.t("orchestra.actions.open")}<Icon name="arrow" /></span>
          </button>}</Show>
          <Toolbar t={props.t} query={filters.query} status={filters.status} statuses={collection().statuses} workflows onFilter={setFilters} />
          <div class="section-title collection-section"><div class="mx-grow">
            <h2>{props.t(binding().provider.kind === "gitlab" ? "orchestra.actions.pipelineConfigurations" : "orchestra.actions.library")}</h2>
            <Show when={model.state.workflows.status === "ready"}><small aria-label={props.t("orchestra.actions.library")}>
              {props.t("orchestra.actions.libraryCount", { shown: collection().workflows.length, loaded: collection().page.length })}
            </small></Show>
          </div><span class="mx-badge">{props.t("orchestra.actions.source")}</span></div>
          <Show when={binding().provider.kind === "gitlab"} fallback={<p class="provider-note">{props.t("orchestra.actions.sourcePathHint.github")}</p>}>
            <p class="provider-note">{props.t("orchestra.actions.gitlabLibraryNote")}
              <For each={collection().page}>{(workflow) => <> · <bdi dir="ltr">{workflow.path}</bdi></>}</For>
            </p>
          </Show>
          <WorkflowState props={props} page={collection().page} workflows={collection().workflows} latest={collection().latest} />
          <Show when={model.state.workflows.value?.next}>
            <button type="button" class="mx-btn" onClick={() => void model.more("workflows")}>{props.t("orchestra.actions.more")}</button>
          </Show>
          <section class="collection-runs" aria-label={props.t("orchestra.actions.runs")}>
            <div class="section-title collection-section"><div class="mx-grow"><h2>{props.t("orchestra.actions.recentRuns")}</h2></div>
              <button type="button" class="mx-btn" onClick={() => model.navigate({ view: "runs" })}>{props.t("orchestra.actions.allRuns")}</button></div>
            <RunState props={{ model, t: props.t }} page={collection().recent} runs={collection().recent} />
          </section>
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
    <Match when={model.state.workflows.status === "idle" || model.state.workflows.status === "loading"}><p role="status">{props.props.t("orchestra.actions.loading")}</p></Match>
    <Match when={model.state.workflows.status === "error"}><p role="alert">{props.props.t(model.state.workflows.error?.message ?? "orchestra.actions.unavailable")}</p></Match>
    <Match when={!props.page.length}><Empty title={props.props.t("orchestra.actions.emptyWorkflows")} /></Match>
    <Match when={props.page.length && !props.workflows.length}><Empty title={props.props.t("orchestra.actions.noMatches")} /></Match>
    <Match when={props.workflows.length}><div class="workflow-grid"><For each={props.workflows}>{(workflow) => <WorkflowCard props={props.props} workflow={workflow} run={props.latest.get(workflow.id)} />}</For></div></Match>
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
    <Toolbar t={props.t} query={props.model.state.filters.query} status={props.model.state.filters.status} statuses={statuses()} onFilter={(patch) => props.model.filter(patch)} />
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
    <Match when={props.props.model.state.runs.status === "idle" || props.props.model.state.runs.status === "loading"}><p role="status">{props.props.t("orchestra.actions.loading")}</p></Match>
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

function Toolbar(props: { t: Translate; query: string; status: string; statuses: readonly (string | null | undefined)[]; workflows?: boolean; onFilter: (patch: Partial<{ query: string; status: string }>) => void }) {
  return <div class="collection-toolbar mx-toolbar"><div class="search-wrap"><Icon name="search" /><input type="search" class="mx-search" value={props.query} placeholder={props.t("orchestra.actions.search")} aria-label={props.t("orchestra.actions.search")} onInput={(event) => props.onFilter({ query: event.currentTarget.value })} /></div>
    <div class="wf-range" role="group" aria-label={props.t("orchestra.actions.status")}>
      <button type="button" aria-pressed={!props.status} onClick={() => props.onFilter({ status: "" })}>{props.t("orchestra.actions.all")}</button>
      <For each={options(props.statuses)}>{(value) => <button type="button" aria-pressed={props.status === value} onClick={() => props.onFilter({ status: value })}>
        <Show when={props.workflows} fallback={<Status status={value} t={props.t} />}>
          {value === "active" ? props.t("orchestra.actions.active") : value === "disabled" ? props.t("orchestra.actions.disabled") : <bdi>{value}</bdi>}
        </Show>
      </button>}</For>
    </div>
  </div>
}

function FilterSelect(props: { label: string; aria: string; selected: string; values: readonly string[]; all: string; onChange: (value: string) => void }) {
  return <label>{props.label} <select aria-label={props.aria} value={props.selected} onChange={(event) => props.onChange(event.currentTarget.value)}><option value="">{props.all}</option><For each={props.values}>{(value) => <option value={value}>{value}</option>}</For></select></label>
}

function WorkflowCard(props: { props: ViewProps; workflow: Actions.Workflow; run?: Actions.Run }) {
  const model = props.props.model
   const status = createMemo(() => workflowState(props.workflow.state))
   const label = () => status().label
  const allowed = () => props.workflow.bindingID === model.state.binding?.id && canRequestAction(model.state, {
    kind: "workflow.dispatch", target: { workflowID: props.workflow.id, path: props.workflow.path },
  })
  const source = () => model.navigate({ view: "source", workflowID: props.workflow.id, path: props.workflow.path, ref: props.workflow.defaultRef })
  return <article class="mx-card workflow-card">
    <div class="mx-card-top"><span class="mx-mark"><Icon name="workflow" /></span><div class="mx-grow">
      <h3><button type="button" class="title-link mx-link" onClick={() => model.navigate({ view: "workflow", workflowID: props.workflow.id })}><bdi>{props.workflow.name ?? props.workflow.id}</bdi></button></h3>
      <button type="button" class="collection-path title-link mx-link" onClick={source}><bdi dir="ltr">{props.workflow.path}</bdi></button>
    </div><span class={`mx-badge ${status().tone}`} title={status().label ? undefined : props.props.t("orchestra.actions.unknown")}>
      <bdi><Show when={label()} keyed fallback={props.workflow.state || props.props.t("orchestra.actions.unknown")}>{(value) => props.props.t(value)}</Show></bdi>
    </span></div>
    <Show when={props.workflow.updatedAt}><small><time dateTime={props.workflow.updatedAt}>{stamp(props.workflow.updatedAt)}</time></small></Show>
    <Show when={props.workflow.triggers?.length}><div class="collection-triggers" aria-label={props.props.t("orchestra.actions.event")}>
      <For each={props.workflow.triggers}>{(event) => <span class="mx-badge"><bdi>{event}</bdi></span>}</For>
    </div></Show>
    <div class="collection-preview" aria-label={props.props.t("orchestra.actions.nativeMetadata")}>
      <div class="collection-preview-head"><span>{props.props.t("orchestra.actions.nativeMetadata")}</span>
        <button type="button" class="title-link mx-link" onClick={source}>{props.props.t("orchestra.actions.yamlSource")}<Icon name="code" /></button></div>
      <dl class="wf-kv"><dt>{props.props.t("orchestra.actions.ref")}</dt><dd><bdi>{props.workflow.defaultRef ?? props.props.t("orchestra.actions.unknown")}</bdi></dd>
        <dt>{props.props.t(model.state.binding?.provider.kind === "gitlab" ? "orchestra.actions.dispatchPipeline" : "orchestra.actions.dispatch")}</dt>
         <dd>{props.props.t(props.workflow.dispatchState === "available" ? "orchestra.actions.available" : props.workflow.dispatchState === "unavailable" ? "orchestra.actions.unavailable" : "orchestra.actions.unknown")}</dd></dl>
      <small>{props.props.t("orchestra.actions.metadataOnly")}</small>
    </div>
    <div class="collection-last"><span class="collection-last-label">{props.props.t("orchestra.actions.latestRun")}</span>
      <Switch><Match when={model.state.runs.status === "idle" || model.state.runs.status === "loading"}><span role="status">{props.props.t("orchestra.actions.loading")}</span></Match>
        <Match when={model.state.runs.status === "error"}><span role="alert">{props.props.t(model.state.runs.error?.message ?? "orchestra.actions.unavailable")}</span></Match>
        <Match when={props.run}>{(run) => <>
          <button type="button" class="collection-last-run title-link mx-link" onClick={() => model.navigate({ view: "run", runID: run().id })}>
            <Status status={run().status} conclusion={run().conclusion} t={props.props.t} /><span><bdi dir="ltr">#{run().id}</bdi> · {stamp(run().createdAt)}</span>
          </button><small><bdi>{run().ref}</bdi> · {duration(run().duration)}</small>
        </>}</Match><Match when={true}><strong>{props.props.t("orchestra.actions.emptyRuns")}</strong></Match></Switch>
    </div>
    <footer class="mx-card-foot"><button type="button" class="mx-btn primary" disabled={!allowed()} onClick={() => {
      if (allowed()) model.dialog({ kind: "dispatch", workflowID: props.workflow.id })
    }}><Icon name="play" />{props.props.t(model.state.binding?.provider.kind === "gitlab" ? "orchestra.actions.dispatchPipeline" : "orchestra.actions.dispatch")}</button>
      <div><button type="button" class="mx-btn" onClick={() => model.navigate({ view: "workflow", workflowID: props.workflow.id })}>{props.props.t("orchestra.actions.open")}</button>
        <button type="button" class="mx-btn" onClick={source}><Icon name="code" />{props.props.t("orchestra.actions.source")}</button></div>
    </footer>
  </article>
}

function RunTable(props: { model: Model; t: Translate; runs: readonly Actions.Run[] }) {
  return <div class="mx-table runs-table"><For each={props.runs}>{(run) => <button type="button" class="mx-row run-row" onClick={() => props.model.navigate({ view: "run", runID: run.id })}><span class="mx-grow"><strong><bdi>{run.name ?? run.id}</bdi></strong><small dir="ltr">#{run.id} · {props.t("orchestra.actions.attempt")} {run.attempt ?? props.t("orchestra.actions.unknown")}</small><small><bdi>{run.actor ?? props.t("orchestra.actions.unknown")}</bdi></small></span><span><bdi>{run.ref ?? props.t("orchestra.actions.unknown")}</bdi><small>{run.event}</small></span><Status status={run.status} conclusion={run.conclusion} t={props.t} /><span>{duration(run.duration) ?? props.t("orchestra.actions.unknown")}<small>{stamp(run.updatedAt)}</small></span></button>}</For></div>
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
