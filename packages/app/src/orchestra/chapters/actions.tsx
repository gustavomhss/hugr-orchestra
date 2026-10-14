import { useSearchParams } from "@solidjs/router"
import { createEffect, createMemo, For, lazy, Match, onCleanup, Show, Suspense, Switch, untrack } from "solid-js"
import { createStore } from "solid-js/store"
import { useLanguage } from "@/context/language"
import { usePlatform } from "@/context/platform"
import { useServerSDK } from "@/context/server-sdk"
import { Persist, persisted } from "@/utils/persist"
import type { ChapterPageProps } from "../chapter-route"
import { createActionsAPI } from "../actions/api"
import { Empty, Icon, Status, type IconName } from "../actions/components"
import type { Model, Route, Translate, ViewProps } from "../actions/contract"
import { navigationPreferences, readNavigation, resourceDialog, resourceLinks, selectedRoute, synchronizeNavigation, tabKeydown } from "../actions/entry-routing"
import { createActionsModel, type ActionsPreference } from "../actions/model"
import { saveActionsResponse } from "../actions/save"
import { canRequest } from "../actions/request-policy"
import { settingsConnection } from "../actions/settings-evidence"
import "./kit.css"
import "../actions/actions.css"
import "../actions/actions-detail.css"

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

export default function Actions(props: ChapterPageProps) {
  const language = useLanguage()
  const platform = usePlatform()
  const sdk = useServerSDK()
  // Probe the native combined server surface even when the session SDK detected protocol v1.
  const api = createActionsAPI({ server: props.server, fetch: platform.fetch, directory: props.directory })
  const [query, setQuery] = useSearchParams()
  const [preferences, setPreferences, , ready] = persisted(
    { ...Persist.serverWorkspace(sdk().scope, props.directory, `actions:${api.preferenceKey}`),
      migrate: (value) => ({ navigation: navigationPreferences(isRecord(value) ? value.navigation : undefined) }) },
    createStore<{ navigation: ActionsPreference }>({ navigation: { route: { view: "library" } } }), platform,
  )
  const t: Translate = (key, params) => language.t(key, params)
  return <section class="actions-page mx-page" data-component="orchestra-actions" aria-label={t("orchestra.actions.title")}
    style={{ display: "flex", "flex-direction": "column", overflow: "hidden" }}>
    <Show when={ready()} fallback={<Empty title={t("orchestra.actions.loading")} busy />}>
      <Workbench server={props.server} directory={props.directory} api={api} t={t}
        preferences={query.actionsScope === api.preferenceKey ? readNavigation(query) ?? preferences.navigation : preferences.navigation}
        remember={(value) => setPreferences("navigation", navigationPreferences(value))}
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
  const [view, setView] = createStore({ query: "", ref: "" })
  const workflow = createMemo(() => state.workflows.value?.items.find((item) => item.bindingID === state.binding?.id
    && item.id === (state.route.workflowID ?? state.run.value?.workflowID)))
   const run = createMemo(() => state.run.status === "ready" && state.run.value && state.run.value.id === state.route.runID
    && state.run.value.bindingID === state.binding?.id ? state.run.value : undefined)
  const jobs = createMemo(() => state.jobs.status === "ready" ? state.jobs.value?.items.filter((item) =>
    item.bindingID === state.binding?.id && item.runID === state.route.runID
    && (state.route.attempt === undefined || item.attempt === undefined || item.attempt === state.route.attempt)).slice(0, 100) ?? [] : [])
  const catalog = createMemo(() => state.workflows.value?.items.filter((item) => item.bindingID === state.binding?.id
    && `${item.name ?? ""} ${item.path}`.toLowerCase().includes(view.query.toLowerCase())).slice(0, 100) ?? [])
  const canCreate = createMemo(() => canRequest(state, "source.write"))
  const sourceTab = () => state.route.view === "source" || state.route.tab === "source"
  const tab = () => state.route.tab ?? (state.route.view === "workflow" ? "graph" : state.route.view === "job" ? "logs" : "jobs")
  const contextual = () => ["workflow", "run", "job", "source"].includes(state.route.view) || state.route.view === "runs" && Boolean(state.route.workflowID)
  const loading = () => <Empty title={props.t("orchestra.actions.loading")} busy />

  synchronizeNavigation({ model, scope: props.api.preferenceKey, query: props.query, write: props.write })
  createEffect(() => {
    const ref = state.route.ref ?? ""
    untrack(() => setView("ref", ref))
  })
  createEffect(() => {
    const value = run()
    if (!value || !state.route.runID || state.route.ref === value.commit) return
    untrack(() => model.navigate({ ...state.route, ref: value.commit }))
  })

  const nav = (label: string, route: Route, icon: IconName, selected: boolean) =>
    <button type="button" class="actions-nav-item" classList={{ selected }} aria-current={selected ? "page" : undefined}
      onClick={() => model.navigate(route)}><Icon name={icon} /><span><bdi>{label}</bdi></span></button>
  return <>
    <div class="actions-workbench">
      <aside class="actions-sidebar actions-context" aria-label={props.t("orchestra.actions.title")}>
        <header class="actions-context-head"><span class="mx-mark"><Icon name="workflow" /></span>
          <div><strong>{props.t("orchestra.actions.title")}</strong><small><bdi>{state.binding?.projectPath ?? props.directory}</bdi></small></div></header>
        <div class="context-group">
          {nav(props.t("orchestra.actions.library"), { view: "library" }, "workflow", state.route.view === "library")}
          {nav(props.t("orchestra.actions.runs"), { view: "runs" }, "retry", state.route.view === "runs" && !state.route.workflowID)}
        </div>
        <Show when={workflow()}>{(item) => <div class="context-selection">
          <strong><bdi>{item().name ?? item().id}</bdi></strong><small><bdi dir="ltr">{item().path}</bdi></small>
          {nav(props.t("orchestra.actions.graph"), { view: "workflow", workflowID: item().id, path: item().path, ref: state.route.runID ? undefined : state.route.ref, tab: "graph" }, "workflow", state.route.view === "workflow" && tab() === "graph")}
          {nav(props.t("orchestra.actions.executions"), { view: "runs", workflowID: item().id }, "retry", state.route.view === "runs" && state.route.workflowID === item().id)}
          {nav(props.t("orchestra.actions.source"), { view: "source", workflowID: item().id, path: item().path, ref: state.route.runID ? undefined : state.route.ref, tab: "source" }, "code", sourceTab() && !state.route.runID)}
        </div>}</Show>
        <Show when={state.route.runID}><div class="context-group"><div class="context-label">{props.t("orchestra.actions.run")} <code dir="ltr">{state.route.runID}</code></div>
          <For each={[["graph", "orchestra.actions.graph", "workflow"], ["jobs", "orchestra.actions.jobs", "local"],
            ["logs", "orchestra.actions.logs", "logs"], ["artifacts", "orchestra.actions.artifacts", "box"], ["source", "orchestra.actions.source", "code"]] as const}>
            {(item) => nav(props.t(item[1]), { ...state.route, view: "run", tab: item[0] }, item[2], tab() === item[0])}</For>
          <Show when={jobs().length}><div class="context-label">{props.t("orchestra.actions.jobs")}</div><For each={jobs()}>{(job) =>
            <button type="button" class="actions-nav-item context-job" classList={{ selected: state.route.jobID === job.id }}
              aria-current={state.route.jobID === job.id ? "page" : undefined}
              onClick={() => model.navigate({ ...state.route, view: tab() === "logs" ? "run" : "job", jobID: job.id, tab: "logs" })}>
              <span><bdi>{job.name}</bdi><Status status={job.status} conclusion={job.conclusion} t={props.t} /></span>
            </button>}</For></Show>
        </div></Show>
        <Show when={!contextual() && state.route.view !== "runs" && state.workflows.value?.items.some((item) => item.bindingID === state.binding?.id)}><div class="context-group">
          <div class="context-label">{props.t("orchestra.actions.library")}</div>
          <input type="search" class="context-search" value={view.query} maxlength={512} placeholder={props.t("orchestra.actions.search")}
            aria-label={props.t("orchestra.actions.search")} onInput={(event) => setView("query", event.currentTarget.value)} />
          <For each={catalog()}>{(item) => nav(item.name ?? item.id, { view: "workflow", workflowID: item.id }, "workflow", false)}</For>
          <Show when={!catalog().length}><small>{props.t("orchestra.actions.noMatches")}</small></Show>
        </div></Show>
        <div class="context-group context-project"><div class="context-label">{props.t("orchestra.actions.projectResources")}</div>
          <For each={resourceLinks}>{(item) => nav(props.t(item[1]), { view: "resources", resourceKind: item[0] }, item[2],
            state.route.view === "resources" && (state.route.resourceKind ?? "artifacts") === item[0])}</For>
          {nav(props.t("orchestra.actions.settings"), { view: "settings" }, "settings", state.route.view === "settings")}
        </div>
        <footer class="context-footer">{nav(props.t("orchestra.actions.local"), { view: "local" }, "local", state.route.view === "local")}
          <small>{props.t("orchestra.actions.localHint")}</small></footer>
      </aside>
      <main class="actions-main" aria-label={props.t("orchestra.actions.title")}>
        <div class="actions-library actions-entry-header" style={{ "padding-block-end": "0" }}>
          <nav class="mx-eyebrow" aria-label={props.t("orchestra.actions.title")}>
            <button type="button" class="mx-link" onClick={() => model.navigate({ view: "library" })}>{props.t("orchestra.actions.title")}</button>
            <Show when={workflow()}>{(item) => <><span aria-hidden="true"> / </span><button type="button" class="mx-link"
              onClick={() => model.navigate({ view: "workflow", workflowID: item().id })}><bdi>{item().name ?? item().id}</bdi></button></>}</Show>
            <Show when={run()}>{(item) => <><span aria-hidden="true"> / </span><button type="button" class="mx-link"
              onClick={() => model.navigate({ view: "run", runID: item().id })}><bdi dir="ltr">{item().id}</bdi></button></>}</Show>
          </nav>
          <Show when={!contextual()}><header class="mx-heading"><div><h1>{props.t("orchestra.actions.title")}</h1><p>{props.t("orchestra.actions.description")}</p></div>
            <div class="heading-actions"><button type="button" class="mx-btn" disabled={state.submitting} onClick={() => void model.refresh()}>
              <Icon name="refresh" />{props.t("orchestra.actions.refresh")}</button>
              <Show when={state.route.view === "library"}><button type="button" class="mx-btn primary" disabled={!canCreate()} onClick={() => model.dialog({ kind: "create-workflow" })}>
                <Icon name="plus" />{props.t(state.binding?.provider.kind === "gitlab" ? "orchestra.actions.createConfiguration" : "orchestra.actions.createWorkflow")}</button></Show></div>
          </header>
          <div class="repo-strip"><label class="provider-label"><Icon name={state.binding?.provider.kind === "gitlab" ? "gitlab" : state.binding ? "github" : "workflow"} />
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
          </div></Show>
          <Show when={!contextual()}><nav class="wf-tabs" role="tablist" aria-label={props.t("orchestra.actions.title")} onKeyDown={tabKeydown}>
            <For each={[["library", "orchestra.actions.library"], ["runs", "orchestra.actions.runs"],
              ["resources", "orchestra.actions.resources"], ["settings", "orchestra.actions.settings"]] as const}>{(item) =>
              <button type="button" role="tab" class="wf-tab" aria-selected={state.route.view === item[0]} tabindex={state.route.view === item[0] ? 0 : -1}
                onClick={() => model.navigate({ view: item[0] })}>{props.t(item[1])}</button>}</For>
          </nav></Show>
          <Show when={state.route.view === "workflow" && tab() === "graph"}><form class="source-toolbar" onSubmit={(event) => {
            event.preventDefault(); if (view.ref.trim()) model.navigate({ ...state.route, ref: view.ref.trim() })
          }}><label>{props.t("orchestra.actions.ref")} <input dir="ltr" value={view.ref} maxlength={2048} aria-label={props.t("orchestra.actions.ref")}
            onInput={(event) => setView("ref", event.currentTarget.value)} /></label><button type="submit" class="mx-btn" disabled={!view.ref.trim()}>{props.t("orchestra.actions.open")}</button></form></Show>
          <ContextActions model={model} t={props.t} />
          <Show when={run() && state.binding?.provider.kind === "github"}><label class="execution-history">{props.t("orchestra.actions.attempt")}
            <input type="number" min={1} max={run()?.attempt ?? 1} step={1} aria-label={props.t("orchestra.actions.attempt")}
              value={state.route.attempt ?? run()?.attempt ?? 1} onChange={(event) => {
                const attempt = Number(event.currentTarget.value)
                if (Number.isSafeInteger(attempt) && attempt > 0 && attempt <= (run()?.attempt ?? 1)) model.navigate({ ...state.route, attempt })
              }} /></label></Show>
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
            <Match when={state.route.view === "settings"}><div class="[&>section>.mx-inner>.mx-heading]:hidden"><Settings model={model} t={props.t} /></div></Match>
            <Match when={state.bindings.status === "loading"}><Empty title={props.t("orchestra.actions.loading")} busy /></Match>
            <Match when={state.unsupported}><Empty title={props.t("orchestra.actions.unsupported")} /></Match>
            <Match when={state.bindings.status === "error"}><Empty title={props.t("orchestra.actions.providerRequestFailed")} error={props.t("orchestra.actions.unavailable")} /></Match>
            <Match when={!state.binding}><Empty title={props.t("orchestra.actions.noConnection")} /></Match>
            <Match when={state.route.view === "resources"}><Resources model={model} t={props.t} /></Match>
            <Match when={state.route.view === "library"}><Library model={model} t={props.t} embedded /></Match>
            <Match when={state.route.view === "runs"}><RunHistory model={model} t={props.t} embedded /></Match>
            <Match when={sourceTab()}><SourceView model={model} t={props.t} /></Match>
            <Match when={state.route.view === "workflow"}><WorkflowDetail model={model} t={props.t} /><Graph model={model} t={props.t} /></Match>
            <Match when={state.route.view === "job"}><JobDetail model={model} t={props.t} /><OutputPanel model={model} t={props.t} /></Match>
            <Match when={state.route.view === "run"}><RunDetail model={model} t={props.t} /><OutputPanel model={model} t={props.t} /></Match>
          </Switch>
        </Suspense>
      </main>
    </div>
    <Show when={state.dialog}><Suspense fallback={loading()}><Show when={resourceDialog(state.dialog)} fallback={<Dialogs model={model} t={props.t} />}>
      <ResourceDialogs model={model} t={props.t} />
    </Show></Suspense></Show>
    <Show when={state.commandOutput}><Suspense fallback={loading()}><CommandOutput model={model} t={props.t} /></Suspense></Show>
  </>
}

function ContextActions(props: ViewProps) {
  const state = props.model.state
  const workflow = createMemo(() => state.route.view === "workflow" && state.workflows.status === "ready"
    ? state.workflows.value?.items.find((item) => item.id === state.route.workflowID && item.bindingID === state.binding?.id) : undefined)
  const run = createMemo(() => state.run.status === "ready" && state.run.value && state.run.value.id === state.route.runID
    && state.run.value.bindingID === state.binding?.id ? state.run.value : undefined)
  const current = () => !state.route.attempt || state.route.attempt === run()?.attempt
   const allowed = (operation: string) => canRequest(state, operation)
  const terminal = () => ["completed", "success", "failed", "canceled", "cancelled", "skipped"].includes(run()?.status ?? "")
  return <div class="heading-actions">
    <Show when={workflow() && state.binding?.provider.kind === "github"}><button type="button" class="mx-btn"
      disabled={!allowed(workflow()?.state === "active" ? "workflow.disable" : "workflow.enable")
        || !(workflow()?.state === "active" || workflow()?.state.startsWith("disabled_"))}
      onClick={() => { const item = workflow(); if (item) void props.model.workflowState(item.state !== "active", item.id) }}>
      {props.t(workflow()?.state === "active" ? "orchestra.actions.disabled" : "orchestra.actions.enabled")}</button></Show>
    <Show when={run()}>{(item) => <>
      <Show when={["waiting", "manual"].includes(item().status ?? "")}><button type="button" class="mx-btn primary"
        disabled={!current() || !allowed("deployment.review")} onClick={() => props.model.dialog({ kind: "approval", runID: item().id })}>
        {props.t("orchestra.actions.reviewDeployment")}</button></Show>
      <button type="button" class="mx-btn danger" disabled={!current() || !terminal() || !allowed("run.delete")}
        onClick={() => props.model.dialog({ kind: "remove", runID: item().id })}>{props.t("orchestra.actions.remove")}</button>
    </>}</Show>
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
