import type { JSX } from "solid-js"
import type { Actions } from "@orchestra/schema/actions"
import { createMemo, For, Match, Show, Switch } from "solid-js"
import { Empty, Icon, Status } from "./components"
import type { Data, State, ViewProps } from "./contract"
import { duration, relative, shortSHA, stamp } from "./format"
import { WorkflowTabs } from "./workflow-tabs"
import { canRequestAction } from "./action-eligibility"
import { canRequest } from "./request-policy"
import { jobDuration, logAvailable, runArtifacts, runnerLabel } from "./output-views"
import { join } from "./matrix"

export function WorkflowDetail(props: ViewProps) {
  const workflow = createMemo(() => {
    const binding = props.model.state.binding
    return props.model.state.workflows.status === "ready" ? props.model.state.workflows.value?.items.find((item) => item.id === props.model.state.route.workflowID && item.bindingID === binding?.id) : undefined
  })
  return <Show when={workflow()} keyed fallback={<StateView props={props} kind="workflow" />}>
    {(item) => <section class="actions-detail mx-page detail-frame" aria-label={props.t("orchestra.actions.workflow")}>
      <WorkflowHeader props={props} workflow={item} />
      <WorkflowTabs {...props} />
    </section>}
  </Show>
}

export function RunDetail(props: ViewProps) {
  const run = createMemo(() => {
    const binding = props.model.state.binding
    return props.model.state.run.status === "ready" && props.model.state.run.value?.id === props.model.state.route.runID && props.model.state.run.value?.bindingID === binding?.id ? props.model.state.run.value : undefined
  })
  return <Show when={run()} keyed fallback={<StateView props={props} kind="run" />}>
    {(item) => <section class="actions-detail mx-page detail-frame" aria-label={props.t("orchestra.actions.run")}>
      <RunHeader props={props} run={item} />
      <Tabs props={props} tabs={["graph", "jobs", "logs", "artifacts", "source"]} counts={{
        jobs: knownCount(props.model.state.jobs, runJobs(props.model.state, item.id).length),
        artifacts: knownCount(props.model.state.artifacts, runArtifacts(props.model.state, item.id).length),
      }} />
      <JobList props={props} runID={item.id} />
    </section>}
  </Show>
}

export function JobDetail(props: ViewProps) {
  const job = createMemo(() => {
    const binding = props.model.state.binding
    const route = props.model.state.route
    return props.model.state.jobs.status === "ready" ? props.model.state.jobs.value?.items.slice(0, 100).find((item) => item.id === route.jobID && item.runID === route.runID && item.bindingID === binding?.id) : undefined
  })
  return <Show when={job()} keyed fallback={<StateView props={props} kind="job" />}>
    {(item) => <DetailShell props={props} title={item.name} subtitle={item.id}>
      <JobHeader props={props} job={item} />
      <JobSteps props={props} job={item} />
    </DetailShell>}
  </Show>
}

function WorkflowHeader(props: { props: ViewProps; workflow: Actions.Workflow }) {
  const model = props.props.model
  const t = props.props.t
  const github = () => model.state.binding?.provider.kind === "github"
  const active = () => props.workflow.state === "active"
  // Core leaves catalog triggers empty for GitHub; the parsed `on:` of a loaded graph for the same file fills them.
  const triggers = createMemo(() => {
    if (props.workflow.triggers?.length) return props.workflow.triggers
    const graph = model.state.graph.status === "ready" ? model.state.graph.value : undefined
    if (!github() || !graph || graph.source.bindingID !== props.workflow.bindingID || graph.source.path !== props.workflow.path) return []
    const on = graph.triggers
    if (typeof on === "string") return [on]
    if (Array.isArray(on)) return on.filter((item): item is string => typeof item === "string")
    return on && typeof on === "object" ? Object.keys(on) : []
  })
  return <>
    <div class="detail-top"><Back props={props.props} /></div>
    <header class="detail-header">
      <div class="mx-heading detail-heading">
        <div class="mx-grow">
          <div class="mx-eyebrow">{t(github() ? "orchestra.actions.github" : "orchestra.actions.gitlab")} · {t("orchestra.actions.sourceConfiguration")}</div>
          <h1><bdi>{props.workflow.name ?? props.workflow.id}</bdi></h1>
          <div class="detail-meta">
            <span class="mx-badge" classList={{ good: active() || props.workflow.state === "configured" }}>{t(active() || props.workflow.state === "configured" ? "orchestra.actions.active" : props.workflow.state.startsWith("disabled_") ? "orchestra.actions.disabled" : "orchestra.actions.unknown")}</span>
            <Show when={props.workflow.updatedAt}><time datetime={props.workflow.updatedAt} title={stamp(props.workflow.updatedAt)}>{relative(props.workflow.updatedAt)}</time></Show>
          </div>
        </div>
        <div class="heading-actions">
          <Show when={github()}><button type="button" class="mx-btn"
            disabled={props.workflow.bindingID !== model.state.binding?.id || !canRequest(model.state, active() ? "workflow.disable" : "workflow.enable")
              || !(active() || props.workflow.state.startsWith("disabled_"))}
            onClick={() => void model.workflowState(!active(), props.workflow.id)}>
            {t(active() ? "orchestra.actions.disableWorkflow" : "orchestra.actions.enableWorkflow")}</button></Show>
          <button type="button" class="mx-btn primary" disabled={props.workflow.bindingID !== model.state.binding?.id || !canRequestAction(model.state, { kind: "workflow.dispatch", target: { workflowID: props.workflow.id, path: props.workflow.path } })} onClick={() => model.dialog({ kind: "dispatch", workflowID: props.workflow.id })}>
            <Icon name="play" />{t(github() ? "orchestra.actions.dispatch" : "orchestra.actions.dispatchPipeline")}</button>
        </div>
      </div>
      <div class="detail-context">
        <button type="button" class="title-link detail-source-link" title={t("orchestra.actions.source")} onClick={() => model.navigate({ view: "source", workflowID: props.workflow.id, path: props.workflow.path, tab: "source" })}>
          <Icon name="code" size={13} /><bdi dir="ltr">{props.workflow.path}</bdi></button>
        <Show when={triggers().length}><div class="collection-triggers" role="group" aria-label={t("orchestra.actions.sourceTriggers")}>
          <For each={triggers()}>{(trigger) => <span class="mx-badge"><bdi dir="ltr">{trigger}</bdi></span>}</For></div></Show>
      </div>
    </header>
  </>
}

function RunHeader(props: { props: ViewProps; run: Actions.Run }) {
  const model = props.props.model
  const t = props.props.t
  const workflow = createMemo(() => model.state.workflows.value?.items.find((item) => item.id === props.run.workflowID && item.bindingID === model.state.binding?.id))
  const github = () => model.state.binding?.provider.kind === "github"
  const attempt = () => model.state.route.attempt ?? props.run.attempt
  // "7 jobs · 15 executions": definitions from a graph at this run's commit, executions from a complete job page; unknown parts are omitted.
  const counts = createMemo(() => {
    const graph = model.state.graph.status === "ready" ? model.state.graph.value : undefined
    const definitions = graph && graph.source.bindingID === props.run.bindingID && graph.source.commit === props.run.commit ? graph.jobs.length : undefined
    const executions = knownCount(model.state.jobs, runJobs(model.state, props.run.id).length)
    return [definitions === undefined ? "" : definitions === 1 ? t("orchestra.actions.definitionCountOne") : t("orchestra.actions.definitionCount", { count: definitions }),
      executions === undefined ? "" : executions === 1 ? t("orchestra.actions.executionCountOne") : t("orchestra.actions.executionCount", { count: executions })]
      .filter(Boolean).join(" · ")
  })
  return <>
    <div class="detail-top">
      <Back props={props.props} />
      <Show when={workflow()}>{(item) => <button type="button" class="title-link detail-workflow-link" title={t("orchestra.actions.workflow")}
        onClick={() => model.navigate({ view: "workflow", workflowID: item().id })}><bdi>{item().name ?? item().id}</bdi></button>}</Show>
      <Show when={github() ? props.run.attempt : undefined}>{(latest) => {
        const choose = (input: string) => {
          const value = Number(input)
          if (Number.isSafeInteger(value) && value > 0 && value <= latest()) model.navigate({ ...model.state.route, attempt: value })
        }
        // A select lists recent attempts; a long retry history falls back to the bounded number input.
        return <label class="execution-history run-attempt">{t("orchestra.actions.attempt")}
          <Show when={latest() <= 50} fallback={<input type="number" min={1} max={latest()} step={1} value={attempt() ?? latest()} onChange={(event) => choose(event.currentTarget.value)} />}>
            <select onChange={(event) => choose(event.currentTarget.value)}><For each={Array.from({ length: latest() }, (_, index) => latest() - index)}>{(number) =>
              <option value={number} selected={number === (attempt() ?? latest())}>{t("orchestra.actions.attemptOption", { number })}</option>}</For></select>
          </Show>
        </label>
      }}</Show>
    </div>
    <header class="detail-header">
      <div class="mx-heading detail-heading">
        <div class="mx-grow">
          <div class="mx-eyebrow">{t(github() ? "orchestra.actions.github" : "orchestra.actions.gitlab")} · <bdi dir="ltr">{runLabel(props.run, t)}</bdi></div>
          <h1><bdi>{runTitle(props.run) ?? workflow()?.name ?? props.run.id}</bdi></h1>
          <div class="detail-meta">
            <Status status={props.run.status} conclusion={props.run.conclusion} t={t} />
            <span><bdi>{props.run.event}</bdi> · <bdi>{props.run.actor ?? t("orchestra.actions.unknown")}</bdi></span>
            <span><time datetime={props.run.updatedAt} title={stamp(props.run.updatedAt)}>{relative(props.run.updatedAt)}</time> · {duration(props.run.duration)}</span>
          </div>
        </div>
        <RunActions props={props.props} run={props.run} />
      </div>
      <div class="detail-context">
        <Show when={workflow()}>{(item) => <button type="button" class="title-link detail-source-link" title={t("orchestra.actions.source")}
          onClick={() => model.navigate({ view: "source", workflowID: item().id, path: item().path, ref: props.run.ref ?? undefined })}>
          <Icon name="code" size={13} /><bdi dir="ltr">{item().path}</bdi></button>}</Show>
        <span><Icon name="branch" size={13} />
          <button type="button" class="title-link" disabled={!props.run.ref} title={t("orchestra.actions.ref")} onClick={() => model.navigate({ view: "source", workflowID: props.run.workflowID, runID: props.run.id, path: github() ? workflow()?.path : undefined, ref: props.run.ref ?? undefined })}>
            <bdi>{props.run.ref ?? t("orchestra.actions.unknown")}</bdi></button>
          <button type="button" class="title-link" title={t("orchestra.actions.commit")} onClick={() => model.navigate({ view: "source", workflowID: props.run.workflowID, runID: props.run.id, path: github() ? workflow()?.path : undefined, ref: props.run.commit })}>
            <code dir="ltr">{shortSHA(props.run.commit)}</code></button></span>
        {/* The top-line select already names the attempt on GitHub; the chip covers providers without it. */}
        <Show when={!github() && attempt()}>{(number) => <span class="mx-badge">{t("orchestra.actions.attemptOption", { number: number() })}</span>}</Show>
        <Show when={counts()}>{(text) => <span>{text()}</span>}</Show>
      </div>
    </header>
  </>
}

// Same eligibility as before the header move: run.* via canRequestAction, delete via canRequest on the current, terminal attempt.
function RunActions(props: { props: ViewProps; run: Actions.Run }) {
  const state = props.props.model.state
  const t = props.props.t
  const github = () => state.binding?.provider.kind === "github"
  const allowed = (kind: "run.retry" | "run.retryFailed" | "run.cancel") => props.run.bindingID === state.binding?.id
    && canRequestAction(state, { kind, target: { runID: props.run.id }, expected: { commit: props.run.commit, attempt: props.run.attempt } })
  const current = () => !state.route.attempt || state.route.attempt === props.run.attempt
  const terminal = () => ["completed", "success", "failed", "canceled", "cancelled", "skipped"].includes(props.run.status ?? "")
  const retryFailed = () => allowed(github() ? "run.retryFailed" : "run.retry")
  const failed = () => ["failure", "failed", "canceled", "cancelled", "timed_out"].includes(props.run.conclusion ?? props.run.status ?? "")
  const retry = (mode: "failed" | "all") => props.props.model.dialog({ kind: "retry", runID: props.run.id, mode })
  return <div class="heading-actions">
    <Show when={current()} fallback={<span class="mx-badge">{t("orchestra.actions.historicalAttempt")}</span>}>
      <Show when={!terminal()}><button type="button" class="mx-btn" disabled={!allowed("run.cancel")}
        onClick={() => props.props.model.dialog({ kind: "cancel", runID: props.run.id })}><Icon name="stop" />{t("orchestra.actions.stop")}</button></Show>
      <Show when={failed() || retryFailed()}><button type="button" class="mx-btn primary" disabled={!retryFailed()} onClick={() => retry("failed")}>
        <Icon name="retry" />{t(github() ? "orchestra.actions.rerunFailed" : "orchestra.actions.retryFailed")}</button></Show>
      <Show when={github() && terminal()}><button type="button" class="mx-btn" disabled={!allowed("run.retry")} onClick={() => retry("all")}>
        <Icon name="retry" />{t("orchestra.actions.rerunAll")}</button></Show>
      <button type="button" class="mx-btn danger" disabled={!terminal() || !canRequest(state, "run.delete")}
        onClick={() => props.props.model.dialog({ kind: "remove", runID: props.run.id })}>{t("orchestra.actions.remove")}</button>
    </Show>
  </div>
}

function JobHeader(props: { props: ViewProps; job: Actions.Job }) {
  return <div class="detail-header"><div class="detail-meta"><Status status={props.job.status} conclusion={props.job.conclusion} t={props.props.t} /><bdi>{props.job.runner ?? props.props.t("orchestra.actions.unknown")}</bdi><code dir="ltr">{props.job.id}</code><Show when={props.job.attempt}><span>{props.props.t("orchestra.actions.attempt")} {props.job.attempt}</span></Show><button type="button" class="mx-link" aria-label={props.props.t("orchestra.actions.run")} onClick={() => props.props.model.navigate({ view: "run", runID: props.job.runID })}>{props.props.t("orchestra.actions.run")}</button></div><JobFacts props={props.props} job={props.job} /></div>
}

function JobFacts(props: { props: ViewProps; job: Actions.Job }) {
  const joined = createMemo(() => definition(props.props.model.state, props.job))
  return <dl class="mx-meta"><dt>{props.props.t("orchestra.actions.runner")}</dt><dd><bdi>{props.job.runner ?? props.props.t("orchestra.actions.unknown")}</bdi></dd><dt>{props.props.t("orchestra.actions.definition")}</dt><dd dir="ltr">{joined()?.id ?? props.props.t("orchestra.actions.unjoined")}</dd></dl>
}

function JobSteps(props: { props: ViewProps; job: Actions.Job }) {
  const provider = createMemo(() => props.props.model.state.binding?.provider.kind)
  const allowed = (kind: "job.retry" | "job.play") => props.job.bindingID === props.props.model.state.binding?.id
    && canRequestAction(props.props.model.state, { kind, target: { jobID: props.job.id, runID: props.job.runID }, expected: { attempt: props.job.attempt } })
  return <div class="collection-section"><h2>{props.props.t("orchestra.actions.steps")}</h2><Show when={props.job.steps.length} fallback={<p>{props.props.t("orchestra.actions.noSteps")}</p>}><div class="mx-table"><For each={props.job.steps.slice(0, 100)}>{(step) => <div class="mx-row"><span class="mx-grow"><bdi>{step.name}</bdi><small>{stamp(step.startedAt)} · {stamp(step.finishedAt)}</small></span><Status status={step.status} conclusion={step.conclusion} t={props.props.t} /></div>}</For></div></Show><div class="mx-card-foot"><button type="button" class="mx-btn" disabled={!allowed("job.retry")} onClick={() => props.props.model.dialog({ kind: "jobRetry", jobID: props.job.id })}>{props.props.t("orchestra.actions.retryJob")}</button><Show when={provider() === "gitlab"}><button type="button" class="mx-btn" disabled={!allowed("job.play")} onClick={() => props.props.model.dialog({ kind: "jobPlay", jobID: props.job.id })}>{props.props.t("orchestra.actions.play")}</button></Show></div></div>
}

function JobList(props: { props: ViewProps; runID: string }) {
  const state = props.props.model.state
  const jobs = createMemo(() => runJobs(state, props.runID))
  return <Show when={state.route.tab === "jobs"}><section class="collection-section detail-jobs"><h2 class="run-sr-only">{props.props.t("orchestra.actions.jobs")}</h2><Switch><Match when={state.jobs.status === "loading"}><p role="status">{props.props.t("orchestra.actions.loading")}</p></Match><Match when={state.jobs.status === "error"}><p role="alert">{props.props.t(state.jobs.error?.message ?? "orchestra.actions.unavailable")}</p></Match><Match when={!jobs().length}><Empty title={props.props.t("orchestra.actions.emptyJobs")} /></Match><Match when={jobs().length}><div class="mx-table"><For each={jobs()}>{(job) => <JobRow props={props.props} job={job} />}</For></div></Match></Switch><Show when={state.jobs.value?.next}><button type="button" class="mx-btn" onClick={() => void props.props.model.more("jobs")}>{props.props.t("orchestra.actions.more")}</button></Show></section></Show>
}

function JobRow(props: { props: ViewProps; job: Actions.Job }) {
  const model = props.props.model
  const t = props.props.t
  // Needs are shown only when the job joins the graph definition at the run's commit; otherwise they are unknown, not empty.
  // Needs are job keys, the same labels the graph nodes use; `name:` templates may hold unresolved expressions.
  const needs = createMemo(() => definition(model.state, props.job)?.needs)
  return <div class="mx-row detail-job-row">
    <div class="mx-grow"><strong><button type="button" class="title-link" onClick={() => model.navigate({ ...model.state.route, view: "job", jobID: props.job.id })}><bdi>{props.job.name}</bdi></button></strong>
      <small><bdi>{runnerLabel(props.job, t)}</bdi><Show when={needs()}>{(list) => <> · {list().length ? t("orchestra.actions.jobNeeds", { jobs: list().join(", ") }) : t("orchestra.actions.noDependencies")}</>}</Show></small></div>
    <Status status={props.job.status} conclusion={props.job.conclusion} t={t} />
    <span class="detail-job-duration">{jobDuration(props.job)}</span>
    <div class="detail-row-actions">
      <button type="button" class="mx-btn" aria-label={`${t("orchestra.actions.inspect")} ${props.job.name}`} onClick={() => model.navigate({ ...model.state.route, view: "job", jobID: props.job.id })}>{t("orchestra.actions.inspect")}</button>
      <button type="button" class="mx-btn" aria-label={`${t("orchestra.actions.logs")} ${props.job.name}`} disabled={!logAvailable(model.state, props.job)} onClick={() => model.navigate({ ...model.state.route, tab: "logs", jobID: props.job.id })}><Icon name="logs" />{t("orchestra.actions.logs")}</button>
    </div>
  </div>
}

// A count is shown only for a complete page that belongs entirely to this run and is not cut by the 100-row bound.
function knownCount(data: Data<{ readonly items: readonly unknown[]; readonly next?: string }>, owned: number) {
  const items = data.status === "ready" && !data.value?.next ? data.value?.items : undefined
  return items && items.length <= 100 && owned === items.length ? owned : undefined
}

function runJobs(state: State, runID: string) {
  return state.jobs.value?.items.filter((item) => item.runID === runID && item.bindingID === state.binding?.id).slice(0, 100) ?? []
}

// The one place a native job is joined to its graph definition (job facts and job rows).
function definition(state: State, job: Actions.Job) {
  const graph = state.graph.status === "ready" ? state.graph.value : undefined
  const run = state.run.status === "ready" ? state.run.value : undefined
  const binding = state.binding
  const workflow = state.workflows.value?.items.find((item) => item.id === run?.workflowID && item.bindingID === binding?.id)
  // A partial graph (run-time matrix values) still declares every job key and its needs.
  if (!(graph && graph.state !== "unresolved" && run && binding && workflow && job.runID === run.id && run.id === state.route.runID && job.bindingID === binding.id && run.bindingID === binding.id && graph.source.bindingID === binding.id && graph.source.path === workflow.path && graph.source.commit && graph.source.commit === run.commit && graph.source.ref === run.commit)) return undefined
  const id = [...join(new Map(graph.jobs.map((item) => [item.id, item])), [job], binding.provider.kind === "github").keys()][0]
  return graph.jobs.find((item) => item.id === id)
}

// Native title (GitHub display_title, GitLab pipeline name) and run number when the provider gives them.
function runTitle(run: Actions.Run) {
  return run.title || (run.name ?? undefined)
}

function runLabel(run: Actions.Run, t: ViewProps["t"]) {
  return run.number === undefined ? t("orchestra.actions.runNumber", { id: run.id }) : t("orchestra.actions.runNumbered", { number: run.number })
}

function Tabs(props: { props: ViewProps; tabs: readonly ("graph" | "jobs" | "logs" | "artifacts" | "source")[]; counts: Partial<Record<"graph" | "jobs" | "logs" | "artifacts" | "source", number>> }) {
  return <nav class="wf-tabs" role="tablist" aria-label={props.props.t("orchestra.actions.runViews")}><For each={props.tabs}>{(tab) => <button type="button" role="tab" class="mx-btn" aria-selected={props.props.model.state.route.tab === tab}
    aria-label={props.counts[tab] === undefined ? undefined : `${tabLabel(props.props.t, tab)} ${props.counts[tab]}`} onClick={() => props.props.model.navigate({ ...props.props.model.state.route, tab })}>
    {tabLabel(props.props.t, tab)}<Show when={props.counts[tab] !== undefined}><span class="wf-count">{props.counts[tab]}</span></Show>
  </button>}</For></nav>
}

function DetailShell(props: { props: ViewProps; title: string; subtitle: string; children: JSX.Element }) {
  return <section class="actions-detail mx-page"><header class="mx-heading"><div><div class="detail-top"><Back props={props.props} /></div><h1><bdi>{props.title}</bdi></h1><p dir="ltr">{props.subtitle}</p></div></header>{props.children}</section>
}

function Back(props: { props: ViewProps }) {
  return <button type="button" class="mx-btn detail-back" onClick={() => props.props.model.navigate({ view: "library" })}><Icon name="arrow" size={14} />{props.props.t("orchestra.actions.previous")}</button>
}

function StateView(props: { props: ViewProps; kind: "workflow" | "run" | "job" }) {
  const model = props.props.model
  return <Show when={model.state.binding} fallback={<Empty title={props.props.t("orchestra.actions.noConnection")} />}><Switch><Match when={props.kind === "workflow" && model.state.workflows.status === "loading" || props.kind === "run" && model.state.run.status === "loading" || props.kind === "job" && model.state.jobs.status === "loading"}><p role="status">{props.props.t("orchestra.actions.loading")}</p></Match><Match when={props.kind === "workflow" && model.state.workflows.status === "error" || props.kind === "run" && model.state.run.status === "error" || props.kind === "job" && model.state.jobs.status === "error"}><p role="alert">{stateError(props)}</p></Match><Match when={true}><Empty title={props.props.t(props.kind === "workflow" ? "orchestra.actions.emptyWorkflows" : props.kind === "run" ? "orchestra.actions.emptyRuns" : "orchestra.actions.emptyJobs")} /></Match></Switch></Show>
}

function stateError(props: { props: ViewProps; kind: "workflow" | "run" | "job" }) {
   if (props.kind === "workflow") return props.props.t(props.props.model.state.workflows.error?.message ?? "orchestra.actions.unavailable")
   if (props.kind === "run") return props.props.t(props.props.model.state.run.error?.message ?? "orchestra.actions.unavailable")
   return props.props.t(props.props.model.state.jobs.error?.message ?? "orchestra.actions.unavailable")
}

function tabLabel(t: ViewProps["t"], tab: "graph" | "jobs" | "logs" | "artifacts" | "source") {
  if (tab === "graph") return t("orchestra.actions.graph")
  if (tab === "jobs") return t("orchestra.actions.jobs")
  if (tab === "logs") return t("orchestra.actions.logs")
  if (tab === "artifacts") return t("orchestra.actions.artifacts")
  return t("orchestra.actions.source")
}
