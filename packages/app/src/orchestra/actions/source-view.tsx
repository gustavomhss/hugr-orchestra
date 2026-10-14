import { createEffect, createMemo, For, Match, Show, Switch, untrack } from "solid-js"
import { createStore } from "solid-js/store"
import { Empty, Icon } from "./components"
import type { ViewProps } from "./contract"
import { selectedRoute, tabKeydown } from "./entry-routing"
import { WorkflowTabs } from "./workflow-tabs"
import { canRequest } from "./request-policy"
import { canEditSource, immutableSource } from "./requests"

export function SourceView(props: ViewProps) {
  const state = props.model.state
  const [view, setView] = createStore({ ref: "" })
  const historical = createMemo(() => Boolean(state.route.runID || state.route.view === "run" || state.route.view === "job"))
  const originalSource = createMemo(() => {
    const source = state.source.value
    if (state.source.status !== "ready" || !source || source.bindingID !== state.binding?.id) return undefined
    if (historical()) {
      const run = state.run.value
      if (state.run.status !== "ready" || !run || run.id !== state.route.runID || run.bindingID !== source.bindingID
        || !run.commit || source.commit !== run.commit || source.ref !== run.commit
        || (state.route.path && source.path !== state.route.path)) return undefined
      return source
    }
    if (state.route.ref && source.ref !== state.route.ref || state.route.path && source.path !== state.route.path) return undefined
    return source
  })
  const draftOnly = createMemo(() => !historical() && state.route.view === "source" && Boolean(state.route.path && state.draftBase?.commit)
    && state.draftBase?.bindingID === state.binding?.id && state.draftBase?.ref === state.route.ref && state.source.status === "idle")
  const editable = createMemo(() => Boolean(originalSource() || draftOnly()) && canEditSource(state, originalSource()))
  const canReview = createMemo(() => editable() && Boolean(draftOnly() ? state.draftBase?.commit : originalSource()?.commit)
    && (draftOnly() || state.draft !== originalSource()?.text) && canRequest(state, "source.branch") && canRequest(state, "source.review"))
  const permission = createMemo(() => {
    const evidence = state.capabilities.status === "ready" ? state.capabilities.value?.filter((item) => item.operation === "source.write") : undefined
    if (evidence?.some((item) => item.state === "unavailable")) return "orchestra.actions.unavailable"
    if (evidence?.some((item) => item.state === "unknown")) return "orchestra.actions.unknown"
    return evidence?.some((item) => item.state === "available") ? "orchestra.actions.available" : "orchestra.actions.unknown"
  })
  const workflow = createMemo(() => state.workflows.value?.items.find((item) => item.bindingID === state.binding?.id
    && item.id === (state.route.workflowID ?? state.run.value?.workflowID)))
  const path = createMemo(() => state.route.path ?? originalSource()?.path)
  const diagnostics = createMemo(() => state.diagnostics.slice(0, 32))

  createEffect(() => {
    const ref = state.route.ref ?? originalSource()?.ref ?? ""
    untrack(() => setView("ref", ref))
  })
  const selectRef = (event: SubmitEvent) => {
    event.preventDefault()
    if (historical() || !view.ref.trim()) return
    props.model.navigate({ ...state.route, path: path(), ref: view.ref.trim(), tab: "source" })
  }

  return <section class="actions-detail detail-source" aria-label={props.t("orchestra.actions.source")}>
    <header class="detail-top">
      <button type="button" class="mx-btn" onClick={() => {
        const item = workflow()
        props.model.navigate(item ? historical() ? { view: "runs", workflowID: item.id }
          : selectedRoute(state, { view: "workflow", workflowID: item.id }) : { view: "library" })
      }}>
        {props.t("orchestra.actions.previous")}</button>
      <h2><bdi>{workflow()?.name ?? state.run.value?.name ?? props.t("orchestra.actions.source")}</bdi></h2>
    </header>
    <Show when={historical() || !workflow()} fallback={<WorkflowTabs {...props} />}><nav class="wf-tabs" role="tablist" aria-label={props.t(historical() ? "orchestra.actions.run" : "orchestra.actions.workflow")} onKeyDown={tabKeydown}>
      <button type="button" role="tab" class="wf-tab" aria-selected={false} tabindex={-1}
        disabled={!workflow() && !state.route.runID} onClick={() => props.model.navigate(selectedRoute(state,
          { ...state.route, view: historical() ? "run" : "workflow", tab: "graph" }))}>{props.t("orchestra.actions.graph")}</button>
      <Show when={historical()}><For each={["jobs", "logs", "artifacts"] as const}>{(tab) => <button type="button" role="tab" class="wf-tab"
        aria-selected={false} tabindex={-1} onClick={() => props.model.navigate({ ...state.route, view: "run", tab })}>
        {props.t(tab === "jobs" ? "orchestra.actions.jobs" : tab === "logs" ? "orchestra.actions.logs" : "orchestra.actions.artifacts")}</button>}</For></Show>
      <Show when={!historical() && workflow()}><button type="button" role="tab" class="wf-tab" aria-selected={false} tabindex={-1}
        onClick={() => { const item = workflow(); if (item) props.model.navigate({ view: "runs", workflowID: item.id }) }}>
        {props.t("orchestra.actions.executions")}</button></Show>
      <button type="button" role="tab" class="wf-tab" aria-selected={true}>{props.t("orchestra.actions.source")}</button>
    </nav></Show>
    <div class="source-toolbar">
      <span><Icon name="code" /><bdi dir="ltr">{path() ?? props.t("orchestra.actions.noSource")}</bdi></span>
      <div>
        <Show when={!historical()} fallback={<span class="mx-badge"><bdi dir="ltr">{originalSource()?.ref}</bdi></span>}>
          <form onSubmit={selectRef}><label>{props.t("orchestra.actions.ref")}
            <input dir="ltr" value={view.ref} maxlength={2048} aria-label={props.t("orchestra.actions.ref")}
              disabled={state.submitting} onInput={(event) => setView("ref", event.currentTarget.value)} /></label>
            <button type="submit" class="mx-btn" disabled={!view.ref.trim() || state.submitting}>{props.t("orchestra.actions.open")}</button>
          </form>
        </Show>
        <button type="button" class="mx-btn" disabled={!(originalSource() || draftOnly()) || state.graph.status === "loading" || state.submitting}
          onClick={() => void props.model.validateSource()}><Icon name="check" />{props.t("orchestra.actions.validate")}</button>
        <button type="button" class="mx-btn primary" disabled={!canReview()}
          onClick={() => props.model.dialog({ kind: "review-source" })}>{props.t("orchestra.actions.reviewSource")}</button>
      </div>
    </div>
    <Switch>
      <Match when={state.source.status === "loading"}><Empty title={props.t("orchestra.actions.loading")} busy /></Match>
      <Match when={state.source.status === "error"}><Empty title={props.t("orchestra.actions.noSource")}
        error={props.t(state.source.error?.message ?? "orchestra.actions.unavailable")} /></Match>
      <Match when={originalSource() || draftOnly()}>
        <div class="provider-note" role="status"><Icon name="code" />
          {props.t("orchestra.actions.access")}: {props.t(permission())}
        </div>
        <textarea class="source-editor" id="source-editor" aria-label={props.t("orchestra.actions.source")} spellcheck={false}
          dir="ltr" readOnly={!editable()} value={immutableSource(state, originalSource() ?? state.draftBase) ? originalSource()?.text ?? "" : state.draft}
          onInput={(event) => { if (editable()) props.model.editSource(event.currentTarget.value) }} />
        <div class="source-footer">
          <Show when={originalSource()}>{(source) => <dl class="wf-kv">
            <dt>{props.t("orchestra.actions.path")}</dt><dd><bdi dir="ltr">{source().path}</bdi></dd>
            <dt>{props.t("orchestra.actions.ref")}</dt><dd><bdi dir="ltr">{source().ref}</bdi></dd>
            <dt>{props.t("orchestra.actions.commit")}</dt><dd><code dir="ltr">{source().commit ?? props.t("orchestra.actions.unknown")}</code></dd>
            <dt>{props.t("orchestra.actions.revision")}</dt><dd><code dir="ltr">{source().version}</code></dd>
          </dl>}</Show>
          <Show when={draftOnly() && state.draftBase}>{(base) => <dl class="wf-kv">
            <dt>{props.t("orchestra.actions.path")}</dt><dd><bdi dir="ltr">{state.route.path}</bdi></dd>
            <dt>{props.t("orchestra.actions.ref")}</dt><dd><bdi dir="ltr">{base().ref}</bdi></dd>
            <dt>{props.t("orchestra.actions.commit")}</dt><dd><code dir="ltr">{base().commit}</code></dd>
          </dl>}</Show>
          <p>{props.t(historical() ? "orchestra.actions.nativeRetry" : "orchestra.actions.schedules.githubNoteTitle")}</p>
          <Show when={state.graph.status === "loading"}><p role="status">{props.t("orchestra.actions.loading")}</p></Show>
          <Show when={state.graph.status === "error"}><p role="alert">{props.t("orchestra.actions.unavailable")}</p></Show>
          <Show when={state.graph.status === "ready" && state.graph.value}><p role="status">{props.t("orchestra.actions.validate")}: {props.t(
            state.graph.value?.state === "complete" ? "orchestra.actions.available" : "orchestra.actions.partialGraph")}</p></Show>
          <Show when={diagnostics().length}><ul role="status"><For each={diagnostics()}>{(message) => <li><bdi dir="auto">{message}</bdi></li>}</For></ul></Show>
          <Show when={originalSource()?.diagnostics?.length}><ul><For each={originalSource()?.diagnostics?.slice(0, 32)}>{(message) => <li><bdi dir="auto">{message}</bdi></li>}</For></ul></Show>
        </div>
      </Match>
      <Match when={true}><Empty title={props.t("orchestra.actions.noSource")} /></Match>
    </Switch>
  </section>
}

export default SourceView
