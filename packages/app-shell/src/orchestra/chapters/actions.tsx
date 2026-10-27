import type { Actions } from "@orchestra/schema/actions"
import { useSearchParams } from "@solidjs/router"
import { createEffect, createMemo, createUniqueId, For, lazy, Match, onCleanup, Show, Suspense, Switch } from "solid-js"
import { createStore } from "solid-js/store"
import { useLanguage } from "@/context/language"
import { usePlatform } from "@/context/platform"
import { useServerSDK } from "@/context/server-sdk"
import { Persist, persisted } from "@/utils/persist"
import type { ChapterPageProps } from "../chapter-route"
import { setCrumbTrail } from "../crumbs"
import { createActionsAPI } from "../actions/api"
import { Empty, Icon, type IconName } from "../actions/components"
import type { Model, Route, Translate, ViewProps } from "../actions/contract"
import { navigationPreferences, readNavigation, resourceDialog, resourceLinks, selectedRoute, synchronizeNavigation, tabKeydown } from "../actions/entry-routing"
import { label } from "../actions/matrix"
import { runJobs, runJoins } from "../actions/run-joins"
import { createActionsModel, type ActionsPreference } from "../actions/model"
import { saveActionsResponse } from "../actions/save"
import { canRequest } from "../actions/request-policy"
import { settingsConnection } from "../actions/settings-evidence"
import "./kit.css"
import "../relay/relay.css"
import "../actions/actions.css"
import "../actions/actions-detail.css"
import "../actions/actions-library.css"
import "../actions/actions-graph.css"
import "../actions/actions-run.css"
import "../actions/actions-resources.css"
import "../actions/actions-source.css"
import "../actions/actions-dialogs.css"
import "../actions/actions-settings.css"
import "../actions/actions-shell.css"

const Library = lazy(async () => {
  const { Library } = await import("../actions/library")
  return { default: Library }
})
const RunHistory = lazy(async () => {
  const { RunHistory } = await import("../actions/library")
  return { default: RunHistory }
})
const WorkflowDetail = lazy(async () => {
  const { WorkflowDetail } = await import("../actions/detail")
  return { default: WorkflowDetail }
})
const RunDetail = lazy(async () => {
  const { RunDetail } = await import("../actions/detail")
  return { default: RunDetail }
})
const JobDetail = lazy(async () => {
  const { JobDetail } = await import("../actions/detail")
  return { default: JobDetail }
})
const Graph = lazy(async () => {
  const { Graph } = await import("../actions/graph")
  return { default: Graph }
})
const SourceView = lazy(() => import("../actions/source-view"))
const Logs = lazy(async () => {
  const { Logs } = await import("../actions/output-views")
  return { default: Logs }
})
const Artifacts = lazy(async () => {
  const { Artifacts } = await import("../actions/output-views")
  return { default: Artifacts }
})
const Resources = lazy(async () => {
  const { Resources } = await import("../actions/resources")
  return { default: Resources }
})
const Settings = lazy(async () => {
  const { Settings } = await import("../actions/settings")
  return { default: Settings }
})
const Dialogs = lazy(async () => {
  const { Dialogs } = await import("../actions/dialogs")
  return { default: Dialogs }
})
const ResourceDialogs = lazy(async () => {
  const { ResourceDialogs } = await import("../actions/resource-dialogs")
  return { default: ResourceDialogs }
})
const CommandOutput = lazy(async () => {
  const { CommandOutput } = await import("../actions/command-output")
  return { default: CommandOutput }
})
const LocalPipelines = lazy(() => import("./cicd"))
const Guardrails = lazy(() => import("./guardrails/guardrails"))

export default function ActionsChapter(props: ChapterPageProps) {
  const language = useLanguage()
  const platform = usePlatform()
  const sdk = useServerSDK()
  const api = createActionsAPI({ server: props.server, fetch: platform.fetch, directory: props.directory })
  const [query, setQuery] = useSearchParams()
  const [preferences, setPreferences, , ready] = persisted(
    { ...Persist.serverWorkspace(sdk().scope, props.directory, `actions:${api.preferenceKey}`),
      migrate: (value) => ({ navigation: navigationPreferences(isRecord(value) ? value.navigation : undefined) }) },
    createStore<{ navigation: ActionsPreference }>({ navigation: { route: { view: "library" } } }), platform,
  )
  const t: Translate = (key, params) => language.t(key, params)
  return <section class="actions-page mx-page wf-scope" data-component="orchestra-actions" aria-label={t("orchestra.actions.title")}
    style={{ display: "flex", "flex-direction": "column", overflow: "hidden" }}>
    <Show when={ready()} fallback={<Empty title={t("orchestra.actions.loading")} busy />}>
      <Workbench server={props.server} directory={props.directory} api={api} t={t}
        preferences={query.actionsScope === api.preferenceKey ? readNavigation(query) ?? preferences.navigation : preferences.navigation}
        remember={(value) => setPreferences("navigation", navigationPreferences(value))} wanted={() => preferences.navigation.bindingID}
        save={(response) => saveActionsResponse(response, platform)} query={() => query}
        write={(value, replace) => setQuery(value, { replace, scroll: false })} />
    </Show>
  </section>
}

function Workbench(props: ChapterPageProps & {
  api: ReturnType<typeof createActionsAPI>
  t: Translate
  preferences: ActionsPreference
  remember: (value: ActionsPreference) => void
  wanted: () => ActionsPreference["bindingID"]
  save: (response: Response) => Promise<void>
  query: Parameters<typeof synchronizeNavigation>[0]["query"]
  write: Parameters<typeof synchronizeNavigation>[0]["write"]
}) {
  const native = createActionsModel({ api: props.api, save: props.save,
    preferences: { ...navigationPreferences(props.preferences), save: props.remember } })
  onCleanup(native.dispose)
  const model: Model = { ...native, get sourceDiscardBlocked() { return native.sourceDiscardBlocked },
    navigate: (route) => native.navigate(selectedRoute(native.state, route)) }
  const state = model.state
  const [view, setView] = createStore({ query: "" })
  const ids = createUniqueId()
  // A loaded run names its workflow only while that run is the selection; settings and resources keep none.
  const workflow = createMemo(() => state.workflows.value?.items.find((item) => item.bindingID === state.binding?.id
    && item.id === (state.route.workflowID ?? (state.route.runID ? state.run.value?.workflowID : undefined))))
  const run = createMemo(() => state.run.status === "ready" && state.run.value && state.run.value.id === state.route.runID
    && state.run.value.bindingID === state.binding?.id ? state.run.value : undefined)
  const jobs = createMemo(() => state.jobs.status === "ready" && state.route.runID ? runJobs(state, state.route.runID) : [])
  // `#<number>` when the provider numbers runs, otherwise the native id.
  const runLabel = () => {
    const value = run()
    return props.t("orchestra.actions.runNumber", { id: value?.number === undefined ? state.route.runID ?? "" : `#${value.number}` })
  }
  // Jobs group by workflow definition once the run's graph is loaded (matrix executions counted); otherwise by name.
  const groups = createMemo(() => {
    const joins = runJoins(state)
    const single = (job: Actions.Job) => ({ id: job.id, label: job.name, jobs: [job] })
    if (!joins.graph) return jobs().map(single)
    return [...joins.graph.jobs.flatMap((definition) => {
      const members = jobs().filter((job) => joins.jobs.get(job.id)?.id === definition.id)
      return members.length ? [{ id: definition.id, label: label(definition), jobs: members }] : []
    }), ...jobs().filter((job) => !joins.jobs.has(job.id)).map(single)]
  })
  // Count only what is known: a native total, or a list whose last page is loaded. A truncated page shows none.
  const loaded = (data: { status: string; value?: { items: readonly { bindingID: string }[]; next?: string; total?: number } }) =>
    data.status !== "ready" || !data.value ? undefined
      : data.value.total ?? (data.value.next ? undefined : data.value.items.filter((item) => item.bindingID === state.binding?.id).length)
  const catalog = createMemo(() => state.workflows.value?.items.filter((item) => item.bindingID === state.binding?.id
    && `${item.name ?? ""} ${item.path}`.toLowerCase().includes(view.query.toLowerCase())).slice(0, 100) ?? [])
  const canCreate = createMemo(() => canRequest(state, "source.write"))
  const sourceTab = () => state.route.view === "source" || state.route.tab === "source"
  const tab = () => state.route.tab ?? (state.route.view === "workflow" ? "graph" : state.route.view === "job" ? "logs" : "jobs")
  const contextual = () => ["workflow", "run", "job", "source"].includes(state.route.view) || state.route.view === "runs" && Boolean(state.route.workflowID)
  const loading = () => <Empty title={props.t("orchestra.actions.loading")} busy />

  synchronizeNavigation({ model, scope: props.api.preferenceKey, query: props.query, write: props.write, wanted: props.wanted })
  // The titlebar names the chapter ("Orchestra / Actions"); the trail adds the current selection like the mock.
  createEffect(() => {
    const resource = resourceLinks.find((item) => item[0] === (state.route.resourceKind ?? "artifacts"))
    const job = state.route.jobID ? jobs().find((item) => item.id === state.route.jobID) : undefined
    setCrumbTrail([
      ...(workflow() ? [workflow()?.name ?? workflow()?.id ?? ""] : []),
      ...(state.route.runID ? [runLabel()] : []),
      ...(job ? [job.name] : []),
      ...(state.route.view === "runs" && !state.route.workflowID ? [props.t("orchestra.actions.shell.runs")] : []),
      ...(state.route.view === "resources" && resource ? [props.t(resource[1])] : []),
      ...(state.route.view === "settings" ? [props.t("orchestra.actions.shell.settings")] : []),
      ...(state.route.view === "local" ? [props.t("orchestra.actions.local")] : []),
      ...(state.route.view === "guardrails" ? [props.t("orchestra.actions.guardrails")] : []),
    ])
  })
  onCleanup(() => setCrumbTrail([]))

  // Route and selection are accessors: items rendered once by For or Show must follow the current route.
  const nav = (text: string, route: () => Route, icon: IconName, selected: () => boolean, count?: () => number | undefined) =>
    <button type="button" class="actions-nav-item" title={text} classList={{ selected: selected() }} aria-current={selected() ? "page" : undefined}
      onClick={() => model.navigate(route())}><Icon name={icon} /><span><bdi>{text}</bdi></span>
      <Show when={count?.()}>{(value) => <span class="context-count">{value()}</span>}</Show></button>
  return <>
    <div class="actions-workbench">
      <aside class="actions-sidebar actions-context" aria-label={props.t("orchestra.actions.title")}>
        <header class="actions-context-head"><span class="mx-mark"><Icon name={state.binding?.provider.kind === "gitlab" ? "gitlab" : state.binding ? "github" : "workflow"} /></span>
          <div><strong>{props.t(state.binding?.provider.kind === "gitlab" ? "orchestra.actions.gitlab" : state.binding ? "orchestra.actions.github" : "orchestra.actions.title")}</strong><small><bdi>{state.binding?.projectPath ?? props.directory}</bdi></small></div></header>
        <div class="context-group" role="group" aria-labelledby={`${ids}-browse`}><div class="context-label" id={`${ids}-browse`}>{props.t("orchestra.actions.shell.browse")}</div>
          {nav(props.t("orchestra.actions.shell.allWorkflows"), () => ({ view: "library" }), "workflow", () => state.route.view === "library")}
          {nav(props.t("orchestra.actions.shell.allRuns"), () => ({ view: "runs" }), "retry", () => state.route.view === "runs" && !state.route.workflowID)}
          {nav(props.t("orchestra.actions.guardrails"), () => ({ view: "guardrails" }), "shield", () => state.route.view === "guardrails")}
        </div>
        <Show when={workflow()}>{(item) => <div class="context-selection">
          <strong><bdi>{item().name ?? item().id}</bdi></strong><small><bdi dir="ltr">{item().path}</bdi></small>
          {nav(props.t("orchestra.actions.graph"), () => ({ view: "workflow", workflowID: item().id, path: item().path, ref: state.route.runID ? undefined : state.route.ref, tab: "graph" }), "workflow", () => state.route.view === "workflow" && tab() === "graph")}
          {nav(props.t("orchestra.actions.executions"), () => ({ view: "runs", workflowID: item().id }), "retry", () => state.route.view === "runs" && state.route.workflowID === item().id)}
          {nav(props.t("orchestra.actions.source"), () => ({ view: "source", workflowID: item().id, path: item().path, ref: state.route.runID ? undefined : state.route.ref, tab: "source" }), "code", () => sourceTab() && !state.route.runID)}
        </div>}</Show>
        <Show when={state.route.runID}><div class="context-group" role="group" aria-labelledby={`${ids}-run`}>
          <div class="context-label" id={`${ids}-run`}>{runLabel()}</div>
          <For each={[["graph", "orchestra.actions.graph", "workflow"], ["jobs", "orchestra.actions.jobs", "local"],
            ["logs", "orchestra.actions.logs", "logs"], ["artifacts", "orchestra.actions.artifacts", "box"], ["source", "orchestra.actions.source", "code"]] as const}>
            {(item) => nav(props.t(item[1]), () => ({ ...state.route, view: "run", tab: item[0] }), item[2], () => ["run", "job"].includes(state.route.view) && tab() === item[0])}</For>
        </div></Show>
        <Show when={groups().length}><div class="context-group context-jobs" role="group" aria-labelledby={`${ids}-jobs`}>
          <div class="context-label" id={`${ids}-jobs`}>{props.t("orchestra.actions.jobs")} <span>{jobs().length}</span></div>
          <For each={groups()}>{(group) => nav(group.label, () => ({ ...state.route, view: "run", jobID: group.jobs[0]?.id, tab: tab() === "logs" ? "logs" : "graph" }),
            "local", () => group.jobs.some((job) => job.id === state.route.jobID), () => group.jobs.length > 1 ? group.jobs.length : undefined)}</For>
        </div></Show>
        <Show when={!contextual() && state.workflows.value?.items.some((item) => item.bindingID === state.binding?.id)}><div class="context-group context-catalog" role="group" aria-labelledby={`${ids}-workflows`}>
          <div class="context-label" id={`${ids}-workflows`}>{props.t("orchestra.actions.shell.workflows")} <span>{loaded(state.workflows)}</span></div>
          <input type="search" class="context-search" value={view.query} maxlength={512} placeholder={props.t("orchestra.actions.shell.findWorkflow")}
            aria-label={props.t("orchestra.actions.shell.findWorkflow")} onInput={(event) => setView("query", event.currentTarget.value)} />
          <div class="context-catalog-list"><For each={catalog()}>{(item) =>
            <button type="button" class="actions-nav-item" onClick={() => model.navigate({ view: "workflow", workflowID: item.id })}>
              <Icon name="workflow" /><span><bdi>{item.name ?? item.id}</bdi></span>
              <Show when={item.state.startsWith("disabled")}><span class="context-origin">{props.t("orchestra.actions.shell.off")}</span></Show>
            </button>}</For></div>
          <Show when={!catalog().length}><small>{props.t("orchestra.actions.noMatches")}</small></Show>
        </div></Show>
        <div class="context-group context-project"><div class="context-label">{props.t("orchestra.actions.projectResources")}</div>
          <For each={resourceLinks}>{(item) => nav(props.t(item[1]), () => ({ view: "resources", resourceKind: item[0] }), item[2],
            () => state.route.view === "resources" && (state.route.resourceKind ?? "artifacts") === item[0])}</For>
          {nav(props.t("orchestra.actions.settings"), () => ({ view: "settings" }), "settings", () => state.route.view === "settings")}
        </div>
        <footer class="context-footer">{nav(props.t("orchestra.actions.local"), () => ({ view: "local" }), "local", () => state.route.view === "local")}
          <small>{props.t("orchestra.actions.localHint")}</small></footer>
      </aside>
      <main class="actions-main" aria-label={props.t("orchestra.actions.title")}>
        <div class="actions-library actions-entry-header" style={{ "padding-block-end": "0" }}>
          <Show when={contextual()}><nav class="mx-eyebrow" aria-label={props.t("orchestra.actions.title")}>
            <button type="button" class="mx-link" onClick={() => model.navigate({ view: "library" })}>{props.t("orchestra.actions.title")}</button>
            <Show when={workflow()}>{(item) => <><span aria-hidden="true"> / </span><button type="button" class="mx-link"
              onClick={() => model.navigate({ view: "workflow", workflowID: item().id })}><bdi>{item().name ?? item().id}</bdi></button></>}</Show>
            <Show when={run()}>{(item) => <><span aria-hidden="true"> / </span><button type="button" class="mx-link"
              onClick={() => model.navigate({ view: "run", runID: item().id })}><bdi dir="ltr">{item().id}</bdi></button></>}</Show>
          </nav></Show>
          <Show when={!contextual()}><header class="mx-heading"><div><div class="mx-eyebrow">{props.t("orchestra.actions.eyebrow")}</div><h1>{props.t("orchestra.actions.title")}</h1><p>{props.t("orchestra.actions.description")}</p></div>
            <div class="heading-actions"><button type="button" class="mx-btn" disabled={state.submitting} onClick={() => void model.refresh()}>
              <Icon name="refresh" />{props.t("orchestra.actions.refresh")}</button>
              <Show when={state.route.view === "library"}><button type="button" class="mx-btn primary" disabled={!canCreate()} onClick={() => model.dialog({ kind: "create-workflow" })}>
                <Icon name="plus" />{props.t(state.binding?.provider.kind === "gitlab" ? "orchestra.actions.createConfiguration" : "orchestra.actions.createWorkflow")}</button></Show></div>
          </header>
          <Show when={state.route.view !== "guardrails"}><div class="repo-strip"><label class="provider-label"><Icon name={state.binding?.provider.kind === "gitlab" ? "gitlab" : state.binding ? "github" : "workflow"} />
            <span>{props.t("orchestra.actions.provider")}</span><select aria-label={props.t("orchestra.actions.provider")} value={state.binding?.id ?? ""}
              disabled={state.submitting || state.bindings.status !== "ready"} onChange={(event) => {
                const binding = state.bindings.value?.find((item) => item.id === event.currentTarget.value)
                if (binding) model.selectBinding(binding.id)
              }}>
              <option value="" disabled>{props.t("orchestra.actions.default")}</option>
              <For each={state.bindings.value ?? []}>{(binding) => <option value={binding.id}>
                {props.t(binding.provider.kind === "github" ? "orchestra.actions.github" : "orchestra.actions.gitlab")} · {binding.projectPath} · {binding.provider.hostname}
              </option>}</For></select></label>
            <Show when={state.binding}>{(binding) => <><span class="divider" /><bdi class="repo-name">{binding().projectPath}</bdi>
              <code dir="ltr">{binding().provider.hostname}</code><span class={`mx-badge ${settingsConnection(state).state === "available" ? "good" : ""}`}>{props.t(settingsConnection(state).label)}</span></>}</Show>
            <button type="button" class="mx-btn repo-connection" disabled={state.submitting} onClick={() => model.dialog({ kind: "connect" })}>
              <Icon name="settings" />{props.t("orchestra.actions.connect")}</button>
          </div></Show></Show>
          <Show when={!contextual()}><nav class="wf-tabs" role="tablist" aria-label={props.t("orchestra.actions.title")} onKeyDown={tabKeydown}>
            <For each={[["library", "orchestra.actions.shell.workflows", "workflow"], ["runs", "orchestra.actions.shell.runs", "retry"],
              ["guardrails", "orchestra.actions.guardrails", "shield"], ["resources", "orchestra.actions.resources", "box"], ["settings", "orchestra.actions.shell.settings", "settings"]] as const}>{(item) =>
              <button type="button" role="tab" class="wf-tab" aria-selected={state.route.view === item[0]} tabindex={state.route.view === item[0] ? 0 : -1}
                onClick={() => model.navigate({ view: item[0] })}><Icon name={item[2]} />{props.t(item[1])}
                <Show when={item[0] === "library" ? loaded(state.workflows) : item[0] === "runs" ? loaded(state.runs) : undefined}>{(count) =>
                  <span class="wf-count">{count()}</span>}</Show></button>}</For>
          </nav></Show>
          <ContextActions model={model} t={props.t} />
          <Show when={state.commandError}>{(error) => <p class="mx-error" role="alert">{props.t(error().message)}</p>}</Show>
          <Show when={state.operation}><div class="provider-note" role="status"><strong>{props.t("orchestra.actions.receipt")}</strong>
            <code dir="ltr"> {state.operation?.id}</code> <span>{props.t(state.operation?.state === "accepted" ? "orchestra.actions.accepted"
              : state.operation?.state === "confirmed" ? "orchestra.actions.confirm"
              : state.operation?.state === "outcome_unknown" ? "orchestra.actions.unknownOutcome"
              : state.operation?.state === "sending" ? "orchestra.actions.submitting"
               : state.operation?.state === "rejected" || state.operation?.state === "expired" ? "orchestra.actions.unavailable" : "orchestra.actions.queued")}</span>
             <button type="button" class="mx-btn" disabled={state.submitting} onClick={() => void model.refresh()}>{props.t("orchestra.actions.refresh")}</button></div></Show>
        </div>
        <Suspense fallback={loading()}>
          <Switch>
            <Match when={state.route.view === "local"}><LocalPipelines server={props.server} directory={props.directory} /></Match>
            <Match when={state.route.view === "guardrails"}><div class="actions-library gr-host"><Guardrails directory={props.directory} /></div></Match>
            <Match when={state.route.view === "settings"}><div class="[&>section>.mx-inner>.mx-heading]:hidden"><Settings model={model} t={props.t} /></div></Match>
            <Match when={state.bindings.status === "loading"}><Empty title={props.t("orchestra.actions.loading")} busy /></Match>
            <Match when={state.unsupported}><Empty title={props.t("orchestra.actions.unsupported")} /></Match>
            <Match when={state.bindings.status === "error"}><Empty title={props.t("orchestra.actions.title")} error={props.t(state.bindings.error?.message ?? "orchestra.actions.unavailable")} retry={{ label: props.t("orchestra.actions.loadRetry"), run: () => void model.refresh() }} /></Match>
            <Match when={!state.binding}><Empty title={props.t("orchestra.actions.noConnection")} /></Match>
            <Match when={state.route.view === "resources"}><Resources model={model} t={props.t} /></Match>
            <Match when={state.route.view === "library"}><Library model={model} t={props.t} embedded /></Match>
            <Match when={state.route.view === "runs"}><Show when={state.route.workflowID}><WorkflowDetail model={model} t={props.t} /></Show><RunHistory model={model} t={props.t} embedded /></Match>
            <Match when={sourceTab()}><SourceView model={model} t={props.t} /></Match>
            <Match when={state.route.view === "workflow"}><WorkflowDetail model={model} t={props.t} /><Graph model={model} t={props.t} /></Match>
            <Match when={state.route.view === "job"}><JobDetail model={model} t={props.t} /><OutputPanel model={model} t={props.t} /></Match>
            <Match when={state.route.view === "run"}><RunDetail model={model} t={props.t} /><OutputPanel model={model} t={props.t} /></Match>
          </Switch>
        </Suspense>
      </main>
    </div>
    <Show when={state.dialog}><Suspense><Show when={resourceDialog(state.dialog)} fallback={<Dialogs model={model} t={props.t} />}>
      <ResourceDialogs model={model} t={props.t} />
    </Show></Suspense></Show>
    <Show when={state.commandOutput}><Suspense><CommandOutput model={model} t={props.t} /></Suspense></Show>
  </>
}

function ContextActions(props: ViewProps) {
  const state = props.model.state
  const run = createMemo(() => state.run.status === "ready" && state.run.value && state.run.value.id === state.route.runID
    && state.run.value.bindingID === state.binding?.id ? state.run.value : undefined)
  const current = () => !state.route.attempt || state.route.attempt === run()?.attempt
  const allowed = (operation: string) => canRequest(state, operation)
  // Workflow and run header controls live in the detail headers; only deployment review has no other home yet.
  return <div class="heading-actions actions-context-actions">
    <Show when={run() && ["waiting", "manual"].includes(run()?.status ?? "")}><button type="button" class="mx-btn primary"
      disabled={!current() || !allowed("deployment.review")} onClick={() => { const item = run(); if (item) props.model.dialog({ kind: "approval", runID: item.id }) }}>
      {props.t("orchestra.actions.reviewDeployment")}</button></Show>
  </div>
}

function OutputPanel(props: ViewProps) {
  return <Switch>
    <Match when={props.model.state.route.tab === "graph"}><Graph {...props} /></Match>
    <Match when={props.model.state.route.tab === "logs"}><Logs {...props} /></Match>
    <Match when={props.model.state.route.tab === "artifacts"}><Artifacts {...props} /></Match>
  </Switch>
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}
