import type { Actions } from "@orchestra/schema/actions"
import { createMemo, For, Match, Show, Switch } from "solid-js"
import { createStore } from "solid-js/store"
import { Empty, Icon, Status } from "./components"
import type { ActionKey } from "@/i18n/actions"
import type { Model, Translate, ViewProps } from "./contract"
import { duration, relative, shortSHA, stamp } from "./format"
import { WorkflowTabs } from "./workflow-tabs"
import { canRequestAction } from "./action-eligibility"
import { libraryPresentation, runFilters, workflowFilters, workflowState } from "./library-presentation"

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
          <Show when={collection().actualOrchestraCI}>{(workflow) => {
            // The card opens the latest observed run of this workflow; without one it falls back to the workflow graph.
            const run = () => collection().latest.get(workflow().id)
            return <button type="button" class="collection-reference" onClick={() => {
              const item = run()
              if (item) return model.navigate({ view: "run", runID: item.id, workflowID: workflow().id, path: workflow().path, ref: item.commit })
              model.navigate({ view: "workflow", workflowID: workflow().id, path: workflow().path, ref: workflow().defaultRef, tab: "graph" })
            }}>
              <span class="mx-mark"><Icon name="workflow" /></span><span class="collection-reference-copy">
                <strong>{props.t("orchestra.actions.actualOrchestraCI")} · <bdi>{workflow().name ?? workflow().id}</bdi></strong>
                <small><bdi dir="ltr">{workflow().path}</bdi> · <Show when={run()} fallback={<bdi>{binding().projectPath}</bdi>}>{(item) =>
                  props.t("orchestra.actions.runAttempt", { run: item().id, attempt: item().attempt ?? props.t("orchestra.actions.unknown") })}</Show></small>
              </span><span class="collection-reference-context"><Show when={run()} fallback={props.t("orchestra.actions.open")}>{(item) =>
                <Status status={item().status} conclusion={item().conclusion} t={props.t} />}</Show><Icon name="arrow" /></span>
            </button>
          }}</Show>
          <Toolbar t={props.t} query={filters.query} status={filters.status} placeholder="orchestra.actions.searchWorkflows" filters={workflowFilters} onFilter={setFilters} />
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
  return <section class={props.embedded ? "actions-collection collection-runs" : "actions-collection mx-page"} aria-label={props.t("orchestra.actions.runs")}>
    <Show when={props.header !== false}><header class="mx-heading"><div><h2>{props.t("orchestra.actions.runs")}</h2></div><Show when={!props.embedded}><button type="button" class="mx-btn" onClick={() => void props.model.refresh()}>{props.t("orchestra.actions.refresh")}</button></Show></header></Show>
    <Toolbar t={props.t} query={props.model.state.filters.query} status={props.model.state.filters.status} placeholder="orchestra.actions.searchRuns"
      filters={runFilters(props.model.state.binding?.provider.kind)} onFilter={(patch) => props.model.filter(patch)} />
    <div class="mx-toolbar collection-filters">
      <FilterSelect label={props.t("orchestra.actions.ref")} aria={props.t("orchestra.actions.ref")} selected={props.model.state.filters.ref} values={refs()} all={props.t("orchestra.actions.allRefs")} onChange={(value) => props.model.filter({ ref: value })} />
      <FilterSelect label={props.t("orchestra.actions.event")} aria={props.t("orchestra.actions.event")} selected={props.model.state.filters.event} values={events()} all={props.t("orchestra.actions.allEvents")} onChange={(value) => props.model.filter({ event: value })} />
      <Show when={props.model.state.runs.status === "ready"}><span>{props.t("orchestra.actions.runsCount", { shown: runs().length, loaded: page().length })}</span></Show>
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

function Toolbar(props: { t: Translate; query: string; status: string; placeholder: ActionKey; filters: readonly { value: string; label: ActionKey }[]; onFilter: (patch: Partial<{ query: string; status: string }>) => void }) {
  return <div class="collection-toolbar mx-toolbar"><div class="search-wrap"><Icon name="search" /><input type="search" class="mx-search" value={props.query} placeholder={props.t(props.placeholder)} aria-label={props.t(props.placeholder)} onInput={(event) => props.onFilter({ query: event.currentTarget.value })} /></div>
    <div class="wf-range" role="group" aria-label={props.t("orchestra.actions.status")}>
      <For each={props.filters}>{(filter) => <button type="button" aria-pressed={props.status === filter.value} onClick={() => props.onFilter({ status: filter.value })}>{props.t(filter.label)}</button>}</For>
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
    <Show when={props.workflow.updatedAt}><small class="collection-updated"><time dateTime={props.workflow.updatedAt}>{stamp(props.workflow.updatedAt)}</time></small></Show>
    <Show when={props.workflow.triggers?.length}><div class="collection-triggers" aria-label={props.props.t("orchestra.actions.event")}>
      <For each={props.workflow.triggers}>{(event) => <span class="mx-badge"><bdi>{event}</bdi></span>}</For>
    </div></Show>
    {/* The native list has no job preview; job definitions live behind the graph and source views. */}
    <div class="collection-preview collection-preview-empty">{props.props.t("orchestra.actions.metadataOnly")}</div>
    <div class="collection-last"><span class="collection-last-label">{props.props.t("orchestra.actions.latestRun")}</span>
      <Switch><Match when={model.state.runs.status === "idle" || model.state.runs.status === "loading"}><span role="status">{props.props.t("orchestra.actions.loading")}</span></Match>
        <Match when={model.state.runs.status === "error"}><span role="alert">{props.props.t(model.state.runs.error?.message ?? "orchestra.actions.unavailable")}</span></Match>
        <Match when={props.run}>{(run) => <>
          <button type="button" class="collection-last-run title-link mx-link" onClick={() => model.navigate({ view: "run", runID: run().id })}>
            <Status status={run().status} conclusion={run().conclusion} t={props.props.t} /><span><bdi dir="ltr">#{run().id}</bdi> · <time dateTime={run().createdAt} title={stamp(run().createdAt)}>{relative(run().createdAt)}</time></span>
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
  // Native runs carry no commit title, so the run name stays the title; the workflow name is added only when it differs.
  const workflowName = (run: Actions.Run) => {
    const name = props.model.state.workflows.value?.items.find((item) => item.bindingID === run.bindingID && item.id === run.workflowID)?.name
    return name && name !== run.name ? name : undefined
  }
  const unknown = () => props.t("orchestra.actions.unknown")
  return <div class="collection-run-list">
    <div class="run-head" aria-hidden="true"><span>{props.t("orchestra.actions.runColumn")}</span><span>{props.t("orchestra.actions.refColumn")}</span>
      <span>{props.t("orchestra.actions.resultColumn")}</span><span>{props.t("orchestra.actions.timeColumn")}</span></div>
    <div class="mx-table runs-table"><For each={props.runs}>{(run) => <button type="button" class="mx-row run-row" onClick={() => props.model.navigate({ view: "run", runID: run.id })}>
      <span class="mx-grow"><strong><bdi>{run.name ?? run.id}</bdi></strong>
        <small><Show when={workflowName(run)}>{(name) => <><bdi>{name()}</bdi> · </>}</Show><bdi dir="ltr">#{run.id}</bdi> · {props.t("orchestra.actions.attempt")} {run.attempt ?? unknown()}</small>
        <small><bdi>{run.actor ?? unknown()}</bdi></small></span>
      <span class="collection-run-ref"><span class="ref"><Icon name="branch" /><bdi>{run.ref ?? unknown()}</bdi></span><small><bdi dir="ltr">{shortSHA(run.commit)}</bdi> · <bdi>{run.event}</bdi></small></span>
      <span class="collection-run-result"><Status status={run.status} conclusion={run.conclusion} t={props.t} /></span>
      <span class="collection-run-time"><strong>{duration(run.duration)}</strong>
        <small><time dateTime={run.createdAt ?? run.updatedAt} title={stamp(run.createdAt ?? run.updatedAt)}>{relative(run.createdAt ?? run.updatedAt)}</time></small></span>
    </button>}</For></div>
  </div>
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
