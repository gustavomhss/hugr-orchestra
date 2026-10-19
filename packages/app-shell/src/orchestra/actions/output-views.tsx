import type { Actions } from "@orchestra/schema/actions"
import { createEffect, createMemo, For, Match, Show, Switch, untrack } from "solid-js"
import { createStore } from "solid-js/store"
import { Empty, Icon } from "./components"
import type { ErrorState, State, Translate, ViewProps } from "./contract"
import { bytes, duration, relative } from "./format"
import { artifactMetadata } from "./artifact-metadata"
import { canRequest } from "./request-policy"

export function Logs(props: ViewProps) {
  const [view, setView] = createStore({ query: "" })
  const state = props.model.state
  const run = createMemo(() => selectedRun(state))
  const jobs = createMemo(() => state.jobs.status === "ready" && run()
    ? state.jobs.value?.items.filter((item) => item.bindingID === state.binding?.id && item.runID === run()?.id
      && (state.route.attempt === undefined || item.attempt === undefined || item.attempt === state.route.attempt)).slice(0, 100) ?? [] : [])
  const job = createMemo(() => jobs().find((item) => item.id === state.route.jobID))
  const readable = createMemo(() => { const value = job(); return value !== undefined && logAvailable(state, value) })
  const lines = createMemo(() => state.log.status === "ready" && readable() && state.log.value
    ? (state.log.value ?? "").split("\n").map((text, index) => ({ text, number: index + 1 }))
      .filter((line) => line.text.toLowerCase().includes(view.query.toLowerCase())) : [])

  createEffect(() => {
    const owner = `${state.binding?.id ?? ""}:${state.route.runID ?? ""}:${state.route.jobID ?? ""}:${state.route.attempt ?? ""}`
    untrack(() => setView("query", ""))
    return owner
  })
  createEffect(() => {
    if (!jobs().length || jobs().some((item) => item.id === state.route.jobID) || state.route.view === "job") return
    const selected = jobs().find((item) => logAvailable(state, item) && ["failed", "failure"].includes(item.conclusion ?? item.status ?? ""))
      ?? jobs().find((item) => logAvailable(state, item)) ?? jobs()[0]
    if (selected) untrack(() => props.model.navigate({ ...state.route, tab: "logs", jobID: selected.id }))
  })

  return <section class="actions-detail detail-logs" aria-label={props.t("orchestra.actions.logs")}>
    <Switch>
      <Match when={state.jobs.status === "loading" || state.run.status === "loading"}>
        <Empty title={props.t("orchestra.actions.loading")} busy />
      </Match>
      <Match when={state.jobs.status === "error" || state.run.status === "error"}>
        <Empty title={props.t("orchestra.actions.providerRequestFailed")} error={errorCopy(props.t, state.jobs.error ?? state.run.error)} retry={{ label: props.t("orchestra.actions.loadRetry"), run: () => void props.model.refresh() }} />
      </Match>
      <Match when={!run() || !jobs().length}><Empty title={props.t("orchestra.actions.noLog")} /></Match>
      <Match when={run()}>
        <div class="log-layout">
          <section class="log-panel" aria-label={props.t("orchestra.actions.logs")}>
            <div class="log-toolbar">
              <div class="log-title"><strong><bdi>{job()?.name ?? props.t("orchestra.actions.noLog")}</bdi></strong>
                <small><Show when={job()}>{(item) => <><bdi>{runnerLabel(item(), props.t)}</bdi><span aria-hidden="true"> · </span>
                  <span>{jobDuration(item())}</span></>}</Show></small></div>
              <input type="search" class="mx-search" value={view.query} maxlength={512} placeholder={props.t("orchestra.actions.searchLog")}
                aria-label={props.t("orchestra.actions.searchLog")} onInput={(event) => setView("query", event.currentTarget.value)} />
              <button type="button" class="mx-btn" disabled={!readable() || state.log.status === "loading"}
                onClick={() => { const item = job(); if (item) void props.model.previewLog(item.id) }}>
                <Icon name="refresh" />{props.t("orchestra.actions.refresh")}</button>
              <button type="button" class="mx-btn" disabled={!readable()}
                onClick={() => { const item = job(); if (item) void props.model.download({ kind: "jobLog", id: item.id,
                  runID: item.runID, attempt: state.route.attempt ?? item.attempt }) }}>
                <Icon name="logs" />{props.t("orchestra.actions.downloadLog")}</button>
            </div>
            {/* The run sidebar lists the jobs; this line only states what the output is, and only when it is true. */}
            <Show when={["completed", "success", "failed", "canceled", "cancelled"].includes(job()?.status?.toLowerCase() ?? "")}>
              <div class="log-info"><span>{props.t("orchestra.actions.completedLog")}</span></div></Show>
            <Switch>
              <Match when={!readable()}><Empty title={props.t("orchestra.actions.noLog")} detail={props.t("orchestra.actions.unavailable")} /></Match>
              <Match when={state.log.status === "loading" || state.log.status === "idle"}><Empty title={props.t("orchestra.actions.loading")} busy /></Match>
              <Match when={state.log.status === "error"}><Empty title={props.t("orchestra.actions.providerRequestFailed")} error={errorCopy(props.t, state.log.error)} retry={{ label: props.t("orchestra.actions.loadRetry"), run: () => void props.model.refresh() }} /></Match>
              <Match when={state.log.status === "ready"}>
                <Show when={state.logTruncated || lines().length > 400}><p class="provider-note" role="status">{props.t("orchestra.actions.logTruncated")}</p></Show>
                <Show when={lines().length} fallback={<Empty title={props.t("orchestra.actions.noMatches")} />}>
                  <div class="log-output" dir="ltr" tabindex="0" aria-label={props.t("orchestra.actions.logs")}>
                    <For each={lines().slice(0, 400)}>{(line) => <div class="log-line" classList={{ error: /✕|exit code [1-9]\d*/.test(line.text) }}>
                      <span aria-hidden="true">{line.number}</span><code>{line.text}</code>
                    </div>}</For>
                  </div>
                </Show>
              </Match>
            </Switch>
          </section>
        </div>
      </Match>
    </Switch>
  </section>
}

export function Artifacts(props: ViewProps) {
  const state = props.model.state
  const run = createMemo(() => selectedRun(state))
  const items = createMemo(() => { const value = run(); return value ? runArtifacts(state, value.id) : [] })
  return <section class="actions-detail detail-artifacts" aria-label={props.t("orchestra.actions.artifacts")}>
    <div class="detail-list-heading"><div><h2>{props.t("orchestra.actions.artifacts")}</h2><small>{props.t("orchestra.actions.artifacts.detail")}</small></div>
      <span class="mx-badge">{props.t("orchestra.actions.outputs", { count: items().length })}</span></div>
    <Switch>
      <Match when={state.artifacts.status === "loading" || state.run.status === "loading"}><Empty title={props.t("orchestra.actions.loading")} busy /></Match>
      <Match when={state.artifacts.status === "error" || state.run.status === "error"}>
        <Empty title={props.t("orchestra.actions.providerRequestFailed")} error={errorCopy(props.t, state.artifacts.error ?? state.run.error)} retry={{ label: props.t("orchestra.actions.loadRetry"), run: () => void props.model.refresh() }} />
      </Match>
      <Match when={!run() || !items().length}><Empty title={props.t("orchestra.actions.emptyArtifacts")} detail={props.t("orchestra.actions.artifacts.emptyDetail")} /></Match>
      <Match when={items().length}>
        <div class="mx-table"><For each={items()}>{(item) => <ArtifactRow {...props} item={item} />}</For></div>
        <Show when={state.artifacts.value?.next}><button type="button" class="mx-btn" onClick={() => void props.model.more("artifacts")}>{props.t("orchestra.actions.more")}</button></Show>
      </Match>
    </Switch>
  </section>
}

export function ArtifactRow(props: ViewProps & { item: Actions.Resource }) {
  const state = props.model.state
  // The provider numbers runs (#193) only on the run itself; other artifacts keep their native run id.
  const owner = () => {
    const id = artifactOwner(props.item)
    const run = state.run.value
    if (id === undefined) return props.t("orchestra.actions.unknown")
    return run?.id === id && run.number !== undefined ? `#${run.number}` : id
  }
  const data = () => record(props.item.data)
  const metadata = createMemo(() => artifactMetadata(props.item))
  const available = () => metadata().available
  const expired = () => metadata().expired
  const historical = () => state.route.attempt !== undefined && state.route.attempt !== state.run.value?.attempt
  const writable = () => available() && !historical() && !state.submitting && data().readOnly !== true && data().inherited !== true && data().editable !== false
  const allowed = (operation: string) => writable() && canRequest(state, operation, props.item.scope)
  const size = () => {
    const value = metadata().sizeBytes
    return typeof value === "number" && Number.isFinite(value) ? bytes(value) : props.t("orchestra.actions.unknown")
  }
  const expiry = () => {
    if (expired()) return props.t("orchestra.actions.retentionEnded")
    if (state.binding?.provider.kind === "gitlab" && metadata().expiresAt === null && available()) return props.t("orchestra.actions.kept")
    const value = metadata().expiresAt
    if (typeof value !== "string" || Number.isNaN(Date.parse(value))) return props.t("orchestra.actions.unknown")
    // A past expiry the provider still reports as available reads as ended, never "Expires 3 days ago".
    return Date.parse(value) > Date.now() ? props.t("orchestra.actions.expiresRelative", { when: relative(value) }) : props.t("orchestra.actions.retentionEnded")
  }
  return <div class="mx-row detail-artifact-row">
    <span class="mx-mark"><Icon name="box" /></span>
    <div class="mx-grow"><strong><bdi>{props.item.name}</bdi></strong>
      <small>{props.t("orchestra.actions.runMetadata", { run: owner(), size: size(), expiry: expiry() })}</small></div>
    <span class="mx-badge" classList={{ good: available() }}>{props.t(expired() ? "orchestra.actions.expired" : available() ? "orchestra.actions.available" : "orchestra.actions.unavailable")}</span>
    <div class="detail-row-actions">
      <button type="button" class="mx-btn" disabled={!available()} onClick={() => void props.model.download({ kind: "artifact", id: props.item.id,
        runID: metadata().runID })}>{props.t("orchestra.actions.download")}</button>
      <Show when={state.binding?.provider.kind === "gitlab"}><button type="button" class="mx-btn" disabled={!allowed("artifact.keep")}
        onClick={() => void props.model.resourceAction("keep", props.item)}>{props.t("orchestra.actions.keep")}</button></Show>
      <button type="button" class="mx-btn danger" disabled={!allowed("resource.delete")}
        onClick={() => props.model.dialog({ kind: "delete-artifact", id: props.item.id, scope: props.item.scope })}>{props.t("orchestra.actions.delete")}</button>
    </div>
  </div>
}

/** Artifacts of one run, as listed in the Artifacts tab and counted in the run tabs. */
export function runArtifacts(state: State, runID: string) {
  return state.artifacts.status === "ready" ? state.artifacts.value?.items.filter((item) => item.kind === "artifacts"
    && item.bindingID === state.binding?.id && artifactOwner(item) === runID).slice(0, 100) ?? [] : []
}

/** Runner labels name the runner a job asked for; the runner name is the fallback. */
export function runnerLabel(job: Actions.Job, t: Translate) {
  return job.runnerLabels?.length ? job.runnerLabels.join(" · ") : job.runner ?? t("orchestra.actions.unknown")
}

export function jobDuration(job: Actions.Job) {
  return duration(job.startedAt && job.finishedAt ? (Date.parse(job.finishedAt) - Date.parse(job.startedAt)) / 1000 : undefined)
}

function selectedRun(state: State) {
  const value = state.run.value
  return state.run.status === "ready" && value && value.id === state.route.runID && value.bindingID === state.binding?.id ? value : undefined
}

export function logAvailable(state: State, job: Actions.Job) {
  if (state.unsupported || state.capabilities.status !== "ready") return false
  if (state.capabilities.value?.some((item) => item.operation === "logs.read" && item.state === "unavailable")) return false
  const status = job.status?.toLowerCase() ?? ""
  if (["created", "pending", "queued", "waiting", "manual", "skipped"].includes(status)) return false
  return state.binding?.provider.kind !== "github" || status === "completed"
}

function artifactOwner(item: Actions.Resource) {
  return artifactMetadata(item).runID
}

function record(value: unknown): Record<string, unknown> { return isRecord(value) ? value : {} }

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function errorCopy(t: Translate, error?: ErrorState) {
  return t(error?.message ?? "orchestra.actions.unavailable")
}
