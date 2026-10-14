import type { JSX } from "solid-js"
import type { Actions } from "@orchestra/schema/actions"
import { createMemo, For, Match, Show, Switch } from "solid-js"
import { Empty, Status } from "./components"
import type { ViewProps } from "./contract"
import { duration, shortSHA, stamp } from "./format"
import { WorkflowTabs } from "./workflow-tabs"
import { canRequest } from "./request-policy"

export function WorkflowDetail(props: ViewProps) {
  const workflow = createMemo(() => {
    const binding = props.model.state.binding
    return props.model.state.workflows.status === "ready" ? props.model.state.workflows.value?.items.find((item) => item.id === props.model.state.route.workflowID && item.bindingID === binding?.id) : undefined
  })
  return <Show when={workflow()} keyed fallback={<StateView props={props} kind="workflow" />}>
    {(item) => <DetailShell props={props} title={item.name ?? item.id} subtitle={item.path}>
      <WorkflowHeader props={props} workflow={item} />
      <WorkflowTabs {...props} />
      <SourcePanel props={props} />
    </DetailShell>}
  </Show>
}

export function RunDetail(props: ViewProps) {
  const run = createMemo(() => {
    const binding = props.model.state.binding
    return props.model.state.run.status === "ready" && props.model.state.run.value?.id === props.model.state.route.runID && props.model.state.run.value?.bindingID === binding?.id ? props.model.state.run.value : undefined
  })
  return <Show when={run()} keyed fallback={<StateView props={props} kind="run" />}>
    {(item) => <DetailShell props={props} title={item.name ?? item.id} subtitle={item.id}>
      <RunHeader props={props} run={item} />
      <Tabs props={props} tabs={["graph", "jobs", "logs", "artifacts", "source"]} />
      <JobList props={props} runID={item.id} />
      <SourcePanel props={props} />
    </DetailShell>}
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
  const label = createMemo(() => props.workflow.state === "active" ? props.props.t("orchestra.actions.enabled") : props.workflow.state.startsWith("disabled_") ? props.props.t("orchestra.actions.disabled") : props.props.t("orchestra.actions.unknown"))
  return (
    <div class="detail-header">
      <div class="detail-meta">
        <span class="mx-badge">{label()}</span>
        <button type="button" class="mx-link" aria-label={props.props.t("orchestra.actions.source")} onClick={() => model.navigate({ view: "source", workflowID: props.workflow.id, path: props.workflow.path })}>
          <bdi dir="ltr">{props.workflow.path}</bdi>
        </button>
        <Show when={props.workflow.updatedAt}><span>{stamp(props.workflow.updatedAt)}</span></Show>
      </div>
      <p>{props.workflow.triggers?.join(" · ")}</p>
      <div class="heading-actions">
        <button type="button" class="mx-btn primary" disabled={!canRequest(model.state, "workflow.dispatch") || props.workflow.dispatchState === "unavailable" || props.workflow.state.startsWith("disabled") || props.workflow.state === "source_unresolved"} onClick={() => model.dialog({ kind: "dispatch", workflowID: props.workflow.id })}>
          {model.state.binding?.provider.kind === "gitlab" ? props.props.t("orchestra.actions.dispatchPipeline") : props.props.t("orchestra.actions.dispatch")}
        </button>
      </div>
    </div>
  )
}

function RunHeader(props: { props: ViewProps; run: Actions.Run }) {
  const model = props.props.model
  const workflow = createMemo(() => model.state.workflows.value?.items.find((item) => item.id === props.run.workflowID && item.bindingID === model.state.binding?.id))
  return (
    <div class="detail-header">
      <div class="detail-meta">
        <Status status={props.run.status} conclusion={props.run.conclusion} t={props.props.t} />
        <bdi>{props.run.actor ?? props.props.t("orchestra.actions.unknown")}</bdi>
        <bdi>{props.run.ref ?? props.props.t("orchestra.actions.unknown")}</bdi>
        <code dir="ltr">{shortSHA(props.run.commit)}</code>
        <span>{props.props.t("orchestra.actions.attempt")} {props.run.attempt ?? props.props.t("orchestra.actions.unknown")}</span>
      </div>
      <p>{stamp(props.run.updatedAt)} · {duration(props.run.duration) ?? props.props.t("orchestra.actions.unknown")}</p>
      <div class="detail-context">
        <Show when={workflow()}>{(item) => <button type="button" class="mx-link" aria-label={props.props.t("orchestra.actions.workflow")} onClick={() => model.navigate({ view: "workflow", workflowID: item().id })}><bdi>{item().name ?? item().id}</bdi></button>}</Show>
        <Show when={workflow()}>{(item) => <button type="button" class="mx-link" aria-label={props.props.t("orchestra.actions.source")} onClick={() => model.navigate({ view: "source", workflowID: item().id, path: item().path, ref: props.run.ref ?? undefined })}><bdi dir="ltr">{item().path}</bdi></button>}</Show>
        <button type="button" class="mx-link" disabled={!props.run.ref} aria-label={props.props.t("orchestra.actions.ref")} onClick={() => model.navigate({ view: "source", workflowID: props.run.workflowID, runID: props.run.id, path: model.state.binding?.provider.kind === "github" ? workflow()?.path : undefined, ref: props.run.ref ?? undefined })}><bdi>{props.run.ref ?? props.props.t("orchestra.actions.unknown")}</bdi></button>
        <button type="button" class="mx-link" aria-label={props.props.t("orchestra.actions.commit")} onClick={() => model.navigate({ view: "source", workflowID: props.run.workflowID, runID: props.run.id, path: model.state.binding?.provider.kind === "github" ? workflow()?.path : undefined, ref: props.run.commit })}><code dir="ltr">{shortSHA(props.run.commit)}</code></button>
      </div>
      <RunControls props={props.props} run={props.run} />
    </div>
  )
}

function RunControls(props: { props: ViewProps; run: Actions.Run }) {
  const provider = createMemo(() => props.props.model.state.binding?.provider.kind)
  const retryable = createMemo(() => provider() === "github" ? props.run.status === "completed" : props.run.status === "failed" || props.run.status === "canceled")
  const active = createMemo(() => provider() === "github" ? ["queued", "in_progress", "requested", "waiting"].includes(props.run.status ?? "") : ["created", "pending", "running"].includes(props.run.status ?? ""))
  return <div class="heading-actions"><Show when={retryable()}><button type="button" class="mx-btn" onClick={() => props.props.model.dialog({ kind: "retry", runID: props.run.id })}>{props.props.t("orchestra.actions.retry")}</button></Show><Show when={active()}><button type="button" class="mx-btn" onClick={() => props.props.model.dialog({ kind: "cancel", runID: props.run.id })}>{props.props.t("orchestra.actions.stop")}</button></Show></div>
}

function JobHeader(props: { props: ViewProps; job: Actions.Job }) {
  return <div class="detail-header"><div class="detail-meta"><Status status={props.job.status} conclusion={props.job.conclusion} t={props.props.t} /><bdi>{props.job.runner ?? props.props.t("orchestra.actions.unknown")}</bdi><code dir="ltr">{props.job.id}</code><Show when={props.job.attempt}><span>{props.props.t("orchestra.actions.attempt")} {props.job.attempt}</span></Show><button type="button" class="mx-link" aria-label={props.props.t("orchestra.actions.run")} onClick={() => props.props.model.navigate({ view: "run", runID: props.job.runID })}>{props.props.t("orchestra.actions.run")}</button></div><JobFacts props={props.props} job={props.job} /></div>
}

function JobFacts(props: { props: ViewProps; job: Actions.Job }) {
  const joined = createMemo(() => {
    const graph = props.props.model.state.graph.status === "ready" ? props.props.model.state.graph.value : undefined
    const run = props.props.model.state.run.status === "ready" ? props.props.model.state.run.value : undefined
    const binding = props.props.model.state.binding
    const workflow = props.props.model.state.workflows.value?.items.find((item) => item.id === run?.workflowID && item.bindingID === binding?.id)
    return Boolean(props.job.definitionID && graph?.state === "complete" && run && binding && workflow && props.job.runID === run.id && run.id === props.props.model.state.route.runID && props.job.bindingID === binding.id && run.bindingID === binding.id && graph.source.bindingID === binding.id && graph.source.path === workflow.path && graph.source.commit && graph.source.commit === run.commit && graph.source.ref === run.commit && graph.jobs.some((item) => item.id === props.job.definitionID))
  })
  return <dl class="mx-meta"><dt>{props.props.t("orchestra.actions.runner")}</dt><dd><bdi>{props.job.runner ?? props.props.t("orchestra.actions.unknown")}</bdi></dd><dt>{props.props.t("orchestra.actions.definition")}</dt><dd dir="ltr">{joined() ? props.job.definitionID : props.props.t("orchestra.actions.unjoined")}</dd></dl>
}

function JobSteps(props: { props: ViewProps; job: Actions.Job }) {
  const provider = createMemo(() => props.props.model.state.binding?.provider.kind)
  const retryable = createMemo(() => provider() === "github" ? props.job.status === "completed" : props.job.status === "failed" || props.job.status === "canceled")
  return <div class="collection-section"><h2>{props.props.t("orchestra.actions.steps")}</h2><Show when={props.job.steps.length} fallback={<p>{props.props.t("orchestra.actions.noSteps")}</p>}><div class="mx-table"><For each={props.job.steps.slice(0, 100)}>{(step) => <div class="mx-row"><span class="mx-grow"><bdi>{step.name}</bdi><small>{stamp(step.startedAt)} · {stamp(step.finishedAt)}</small></span><Status status={step.status} conclusion={step.conclusion} t={props.props.t} /></div>}</For></div></Show><Show when={retryable() || provider() === "gitlab" && props.job.status === "manual"}><div class="mx-card-foot"><Show when={retryable()}><button type="button" class="mx-btn" onClick={() => props.props.model.dialog({ kind: "jobRetry", jobID: props.job.id })}>{props.props.t("orchestra.actions.retryJob")}</button></Show><Show when={provider() === "gitlab" && props.job.status === "manual"}><button type="button" class="mx-btn" onClick={() => props.props.model.dialog({ kind: "jobPlay", jobID: props.job.id })}>{props.props.t("orchestra.actions.play")}</button></Show></div></Show></div>
}

function JobList(props: { props: ViewProps; runID: string }) {
  const jobs = createMemo(() => props.props.model.state.jobs.value?.items.filter((item) => item.runID === props.runID && item.bindingID === props.props.model.state.binding?.id).slice(0, 100) ?? [])
   return <Show when={props.props.model.state.route.tab === "jobs"}><section class="collection-section"><h2>{props.props.t("orchestra.actions.jobs")}</h2><Switch><Match when={props.props.model.state.jobs.status === "loading"}><p role="status">{props.props.t("orchestra.actions.loading")}</p></Match><Match when={props.props.model.state.jobs.status === "error"}><p role="alert">{props.props.t(props.props.model.state.jobs.error?.message ?? "orchestra.actions.unavailable")}</p></Match><Match when={!jobs().length}><Empty title={props.props.t("orchestra.actions.emptyJobs")} /></Match><Match when={jobs().length}><div class="mx-table"><For each={jobs()}>{(job) => <button type="button" class="mx-row" onClick={() => props.props.model.navigate({ ...props.props.model.state.route, view: "job", jobID: job.id })}><span class="mx-grow"><strong><bdi>{job.name}</bdi></strong><small><bdi>{job.runner ?? props.props.t("orchestra.actions.unknown")}</bdi></small></span><Status status={job.status} conclusion={job.conclusion} t={props.props.t} /></button>}</For></div></Match></Switch><Show when={props.props.model.state.jobs.value?.next}><button type="button" class="mx-btn" onClick={() => void props.props.model.more("jobs")}>{props.props.t("orchestra.actions.more")}</button></Show></section></Show>
}

function SourcePanel(props: { props: ViewProps }) {
  const source = createMemo(() => props.props.model.state.source.value)
  const workflow = createMemo(() => {
    const route = props.props.model.state.route
    const run = props.props.model.state.run.value
    const workflowID = route.view === "run" ? run?.workflowID : route.workflowID
    return props.props.model.state.workflows.value?.items.find((item) => item.id === workflowID && item.bindingID === props.props.model.state.binding?.id)
  })
  const valid = createMemo(() => {
    const value = source()
    const route = props.props.model.state.route
    const binding = props.props.model.state.binding
    const run = props.props.model.state.run.value
    if (!value || value.bindingID !== binding?.id || !workflow() || value.path !== workflow()?.path || (route.path && value.path !== route.path) || (route.ref && value.ref !== route.ref)) return false
    if (route.view === "run") return Boolean(props.props.model.state.run.status === "ready" && run && run.id === route.runID && run.bindingID === binding?.id && value.commit && value.commit === run.commit)
    return route.view === "workflow" && props.props.model.state.workflows.status === "ready"
  })
   return <Show when={props.props.model.state.route.tab === "source"}><section class="detail-source"><Switch><Match when={props.props.model.state.source.status === "loading"}><p role="status">{props.props.t("orchestra.actions.loading")}</p></Match><Match when={props.props.model.state.source.status === "error"}><p role="alert">{props.props.t(props.props.model.state.source.error?.message ?? "orchestra.actions.unavailable")}</p></Match><Match when={valid() && source()}><pre dir="ltr" aria-label={props.props.t("orchestra.actions.source")}>{source()?.text}</pre></Match><Match when={true}><Empty title={props.props.t("orchestra.actions.noSource")} /></Match></Switch></section></Show>
}

function Tabs(props: { props: ViewProps; tabs: readonly ("graph" | "jobs" | "logs" | "artifacts" | "source")[] }) {
  return <nav class="wf-tabs" role="tablist" aria-label={props.props.t("orchestra.actions.source")}><For each={props.tabs}>{(tab) => <button type="button" role="tab" class="mx-btn" aria-selected={props.props.model.state.route.tab === tab} onClick={() => props.props.model.navigate({ ...props.props.model.state.route, tab })}>{tabLabel(props.props.t, tab)}</button>}</For></nav>
}

function DetailShell(props: { props: ViewProps; title: string; subtitle: string; children: JSX.Element }) {
  return <section class="actions-detail mx-page"><header class="mx-heading"><div><button type="button" class="mx-link" onClick={() => props.props.model.navigate({ view: "library" })}>{props.props.t("orchestra.actions.previous")}</button><h1><bdi>{props.title}</bdi></h1><p dir="ltr">{props.subtitle}</p></div></header>{props.children}</section>
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
