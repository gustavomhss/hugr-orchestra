import { createEffect, createMemo, For, Match, onCleanup, Show, Switch, untrack } from "solid-js"
import { createStore } from "solid-js/store"
import { Empty, Icon } from "./components"
import type { ViewProps } from "./contract"
import { RunDetail, WorkflowDetail } from "./detail"
import { canRequest } from "./request-policy"
import { canEditSource, immutableSource } from "./requests"
import { sourceDiscardBlocked, sourceDraftDirty, sourceUnloadGuard } from "./source-draft-ui"

export function SourceView(props: ViewProps) {
  const state = props.model.state
  const [view, setView] = createStore({ ref: "", discard: false })
  const dirty = createMemo(() => sourceDraftDirty(state))
  const discardBlocked = createMemo(() => sourceDiscardBlocked(state) || props.model.sourceDiscardBlocked)
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
  const sourceError = createMemo(() => {
    const message = state.source.error?.message
    return message && message !== "orchestra.actions.noSource" && message !== "orchestra.actions.unavailable" ? props.t(message) : undefined
  })
  // Idle counts as loading only when the model's source read can resolve path and ref (mirrors model.ts source()).
  const pending = createMemo(() => state.source.status === "loading" || state.source.status === "idle"
    && Boolean((path() ?? (!historical() || state.binding?.provider.kind === "github" ? workflow()?.path : undefined))
      && (historical() ? state.run.value?.commit : state.route.ref)))
  const diagnostics = createMemo(() => state.diagnostics.slice(0, 32))

  createEffect(() => {
    if (!dirty() || typeof window === "undefined") return
    onCleanup(sourceUnloadGuard(window, dirty))
  })
  createEffect(() => {
    if (!dirty() || discardBlocked()) setView("discard", false)
  })

  createEffect(() => {
    const ref = state.route.ref ?? originalSource()?.ref ?? ""
    untrack(() => setView("ref", ref))
  })
  const selectRef = (event: SubmitEvent) => {
    event.preventDefault()
    if (historical() || !view.ref.trim()) return
    props.model.navigate({ ...state.route, path: path(), ref: view.ref.trim(), tab: "source" })
  }

  return <>
    {/* Run and workflow sources keep their header and tab row; a draft with no catalog workflow keeps a plain back line. */}
    <Switch>
      <Match when={historical()}><RunDetail {...props} /></Match>
      <Match when={workflow() && state.route.workflowID}><WorkflowDetail {...props} /></Match>
      <Match when={true}><div class="actions-detail detail-frame"><div class="detail-top">
        <button type="button" class="mx-btn" onClick={() => props.model.navigate({ view: "library" })}>{props.t("orchestra.actions.previous")}</button>
        <h2><bdi>{path() ?? props.t("orchestra.actions.source")}</bdi></h2>
      </div></div></Match>
    </Switch>
    <section class="actions-detail detail-source" aria-label={props.t("orchestra.actions.source")}>
    <div class="source-toolbar">
      <span><Show when={path()}><Icon name="code" /><bdi dir="ltr">{path()}</bdi></Show>
        <Show when={historical()}><span class="mx-badge">{props.t("orchestra.actions.sourceImmutable")}</span></Show>
        <Show when={permission() !== "orchestra.actions.unknown"}><span class="source-access">{props.t("orchestra.actions.access")}: {props.t(permission())}</span></Show></span>
      <div>
        <Show when={!historical()} fallback={<Show when={originalSource()?.ref}>{(ref) => <span class="mx-badge"><bdi dir="ltr">{ref().slice(0, 7)}</bdi></span>}</Show>}>
          <form onSubmit={selectRef}><label><span>{props.t("orchestra.actions.ref")}</span>
            <input dir="ltr" value={view.ref} maxlength={2048}
              disabled={state.submitting} onInput={(event) => setView("ref", event.currentTarget.value)} /></label>
            <button type="submit" class="mx-btn" disabled={!view.ref.trim() || state.submitting}>{props.t("orchestra.actions.open")}</button>
          </form>
        </Show>
        <button type="button" class="mx-btn" disabled={!(originalSource() || draftOnly()) || state.graph.status === "loading" || state.submitting}
          onClick={() => void props.model.validateSource()}><Icon name="check" />{props.t("orchestra.actions.validate")}</button>
        <button type="button" class="mx-btn primary" disabled={!canReview()}
          onClick={() => props.model.dialog({ kind: "review-source" })}>{props.t("orchestra.actions.reviewSource")}</button>
        <Show when={dirty()}><button type="button" class="mx-btn" disabled={discardBlocked()}
          onClick={() => setView("discard", true)}>{props.t("orchestra.actions.discardSource")}</button></Show>
      </div>
    </div>
    <Show when={view.discard && dirty()}><div class="provider-note" role="group" aria-label={props.t("orchestra.actions.confirmDiscardSource")}>
      <p>{props.t("orchestra.actions.confirmDiscardSource")}</p>
      <button type="button" class="mx-btn" onClick={() => setView("discard", false)}>{props.t("orchestra.actions.cancel")}</button>
      <button type="button" class="mx-btn danger" disabled={discardBlocked()} onClick={() => {
        if (discardBlocked()) return
        props.model.discardSource()
        setView("discard", false)
      }}>{props.t("orchestra.actions.confirm")}</button>
    </div></Show>
    <Switch>
      <Match when={state.source.status === "error"}><Empty title={props.t("orchestra.actions.noSource")} error={sourceError()} /></Match>
      <Match when={originalSource() || draftOnly()}>
        <textarea class="source-editor" id="source-editor" aria-label={props.t("orchestra.actions.source")} spellcheck={false}
          dir="ltr" readOnly={!editable() || view.discard} value={immutableSource(state, originalSource() ?? state.draftBase) ? originalSource()?.text ?? "" : state.draft}
          onInput={(event) => { if (editable() && !view.discard) props.model.editSource(event.currentTarget.value) }} />
        <div class="source-footer">
          <Show when={dirty()}><p>{props.t("orchestra.actions.sourceProposed")}</p></Show>
          <Show when={originalSource()}><p>{props.t("orchestra.actions.sourceSaved")}</p></Show>
          <Show when={originalSource()}>{(source) => <dl class="wf-kv">
            <dt>{props.t("orchestra.actions.path")}</dt><dd><bdi dir="ltr">{source().path}</bdi></dd>
            <dt>{props.t("orchestra.actions.ref")}</dt><dd><bdi dir="ltr">{source().ref}</bdi></dd>
            <dt>{props.t("orchestra.actions.commit")}</dt><dd><code dir="ltr">{source().commit ?? props.t("orchestra.actions.unknown")}</code></dd>
            <dt>{props.t("orchestra.actions.revision")}</dt><dd><code dir="ltr">{source().version}</code></dd>
          </dl>}</Show>
          <Show when={draftOnly() && state.draftBase}>{(base) => <dl class="wf-kv">
            <dt>{props.t("orchestra.actions.path")}</dt><dd><bdi dir="ltr">{state.route.path}</bdi></dd>
            <dt>{props.t("orchestra.actions.sourceBase")}</dt><dd><bdi dir="ltr">{base().ref}</bdi></dd>
            <dt>{props.t("orchestra.actions.commit")}</dt><dd><code dir="ltr">{base().commit}</code></dd>
          </dl>}</Show>
          <p>{props.t(historical() ? "orchestra.actions.nativeRetry" : state.binding?.provider.kind === "gitlab"
            ? "orchestra.actions.sourceIdentityNote.gitlab" : "orchestra.actions.sourceIdentityNote.github")}</p>
          <Show when={state.graph.status === "loading"}><p role="status">{props.t("orchestra.actions.loading")}</p></Show>
          <Show when={state.graph.status === "error"}><p role="alert">{props.t("orchestra.actions.unavailable")}</p></Show>
          <Show when={state.graph.status === "ready" && state.graph.value}><p role="status">{props.t("orchestra.actions.validate")}: {props.t(
            state.graph.value?.state === "complete" ? "orchestra.actions.sourceParsed" : "orchestra.actions.partialGraph")}</p></Show>
          <Show when={diagnostics().length}><ul role="status"><For each={diagnostics()}>{(message) => <li><bdi dir="auto">{message}</bdi></li>}</For></ul></Show>
          <Show when={originalSource()?.diagnostics?.length}><ul><For each={originalSource()?.diagnostics?.slice(0, 32)}>{(message) => <li><bdi dir="auto">{message}</bdi></li>}</For></ul></Show>
        </div>
      </Match>
      <Match when={pending()}><Empty title={props.t("orchestra.actions.loading")} busy /></Match>
      <Match when={true}><Empty title={props.t("orchestra.actions.noSource")} /></Match>
    </Switch>
    </section>
  </>
}

export default SourceView
