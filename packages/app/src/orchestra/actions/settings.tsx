import { createEffect, For, on, onCleanup, Show } from "solid-js"
import { createStore } from "solid-js/store"
import type { Actions } from "@orchestra/schema/actions"
import type { ViewProps } from "./contract"
import { actionsError } from "./api"
import { canConfigureLocalPolicy, canConfigureNativePolicy, localPolicyEvidence, nativePolicyEvidence, settingsConnection, settingsPolicy } from "./settings-evidence"

type SettingsState = {
  open: boolean
  pending: boolean
  disposed: boolean
  generation: number
  request?: number
  nextRequest: number
  id?: Actions.BindingID
  revision?: number
  error: string
}

export function Settings(props: ViewProps) {
  const [view, setView] = createStore<SettingsState>({
    open: false,
    pending: false,
    disposed: false,
    generation: 0,
    nextRequest: 0,
    error: "",
  })
  let dialog: HTMLDialogElement | undefined
  const bindings = () => props.model.state.bindings.value ?? []
  const selected = () => props.model.state.binding
  const capabilityRows = () => [
    { label: props.t("orchestra.actions.runs"), requirements: [["runs.list", "runs.read"], ["jobs.list", "jobs.read"], ["logs.read"]] },
    { label: props.t("orchestra.actions.dispatch"), requirements: [["workflow.dispatch"], ["run.retry"], ["run.cancel"]] },
    { label: props.t("orchestra.actions.resources"), requirements: [["resource.create"], ["resource.update"], ["resource.delete"]] },
    { label: props.t("orchestra.actions.reviewDeployment"), requirements: [["deployment.review"]] },
    { label: props.t("orchestra.actions.source"), requirements: [["source.read"], ["source.write"], ["source.review"]] },
    { label: props.t("orchestra.actions.logs"), requirements: [["logs.live"], ["logs.tail"]] },
  ]
  const capability = (requirements: readonly (readonly string[])[]) => capabilityValue(props.model.state.capabilities.status, props.model.state.capabilities.value, requirements)
  const policy = () => settingsPolicy(props.model.state)
  const localPolicy = () => localPolicyEvidence(policy())
  const nativePolicy = () => nativePolicyEvidence(policy())
  const connection = () => settingsConnection(props.model.state)
  const ownerMatches = (generation: number, id?: Actions.BindingID, revision?: number) =>
    !view.disposed && view.open && view.generation === generation && view.id === id && view.revision === revision
  const close = () => {
    if (view.pending || props.model.state.submitting) return
    setView({ open: false, id: undefined, revision: undefined, error: "" })
  }

  createEffect(on(() => [view.open, view.id, view.revision, selected()?.id, selected()?.revision], () => {
    if (view.open && (view.id !== selected()?.id || view.revision !== selected()?.revision)) {
      setView({ open: false, error: "" })
      if (!view.pending) setView({ id: undefined, revision: undefined })
      if (dialog?.open) dialog.close()
      return
    }
    if (!dialog) return
    if (view.open && !dialog.open) dialog.showModal()
    if (!view.open && dialog.open) dialog.close()
  }))
  onCleanup(() => {
    setView({ disposed: true, open: false, error: "" })
    if (dialog?.open) dialog.close()
  })

  const remove = (event: SubmitEvent & { currentTarget: HTMLFormElement }) => {
    event.preventDefault()
    const id = view.id
    const revision = view.revision
    const selectedBinding = selected()
    if (!ownerMatches(view.generation, id, revision) || !selectedBinding || selectedBinding.id !== id || selectedBinding.revision !== revision || view.pending || props.model.state.submitting) return
    const generation = view.generation
    const request = view.nextRequest + 1
    setView({ pending: true, request, nextRequest: request, error: "" })
    void props.model.removeBinding().then(
      () => {
        if (ownerMatches(generation, id, revision) && !props.model.state.commandError) {
          setView({ open: false, pending: false, request: undefined, id: undefined, revision: undefined })
        }
      },
      (error: unknown) => {
        if (ownerMatches(generation, id, revision)) setView("error", props.t(actionsError(error).message))
      },
    ).finally(() => {
      if (!view.disposed && view.request === request) setView({ pending: false, request: undefined })
    })
  }

  const select = (event: Event & { currentTarget: HTMLSelectElement }) => {
    if (view.pending || props.model.state.submitting) return
    const binding = bindings().find((item) => item.id === event.currentTarget.value)
    if (binding) props.model.selectBinding(binding.id)
  }

  const openRemoval = (binding: Actions.Binding) => {
    if (view.pending || props.model.state.submitting) return
    setView({ open: true, generation: view.generation + 1, id: binding.id, revision: binding.revision, error: "" })
  }

  return <section class="mx-page actions-page actions-resources ar-settings" data-component="orchestra-actions">
    <div class="mx-inner">
      <div class="mx-heading">
         <div><div class="mx-eyebrow">{props.t("orchestra.actions.projectSettings")}</div><h1>{props.t("orchestra.actions.projectSettings")}</h1><p>{props.t("orchestra.actions.description")}</p></div>
        <button class="mx-btn primary" type="button" disabled={view.pending || props.model.state.submitting} onClick={() => props.model.dialog({ kind: "connect" })}>{props.t("orchestra.actions.connect")}</button>
      </div>
      <Show when={props.model.state.unsupported}><p class="mx-error" role="alert">{props.t("orchestra.actions.unsupported")}</p></Show>
      <Show when={props.model.state.bindings.status === "loading"}><p class="mx-note">{props.t("orchestra.actions.loading")}</p></Show>
       <Show when={props.model.state.bindings.status === "error"}><p class="mx-error" role="alert">{props.t(props.model.state.bindings.error?.message ?? "orchestra.actions.unavailable")}</p></Show>
      <Show when={props.model.state.bindings.status === "ready" && bindings().length === 0}><p class="mx-empty">{props.t("orchestra.actions.noConnection")}</p></Show>
      <Show when={bindings().length > 0}>
        <label class="mx-field"><span>{props.t("orchestra.actions.provider")}</span><select disabled={view.pending || props.model.state.submitting} value={selected()?.id ?? ""} onChange={select}>
          <option value="">{props.t("orchestra.actions.default")}</option>
          <For each={bindings()}>{(binding) => <option value={binding.id}>{binding.provider.kind === "github" ? props.t("orchestra.actions.github") : props.t("orchestra.actions.gitlab")} · {binding.account ?? binding.projectID} · {binding.id} · {binding.provider.hostname} · {binding.projectPath}</option>}</For>
        </select></label>
      </Show>
      <div class="settings-grid">
      <Show when={selected()}>{(binding) => <article class="mx-card ar-setting-card">
        <div class="mx-card-top"><div class="mx-grow"><h3>{binding().provider.kind === "github" ? props.t("orchestra.actions.github") : props.t("orchestra.actions.gitlab")}</h3><p><bdi dir="auto">{binding().account ?? binding().projectID}</bdi></p></div><span class={`mx-badge ${connection().state === "available" ? "good" : ""}`}>{props.t(connection().label)}</span></div>
         <dl class="wf-kv ar-facts">
          <dt>{props.t("orchestra.actions.provider")}</dt><dd>{binding().provider.kind === "github" ? props.t("orchestra.actions.github") : props.t("orchestra.actions.gitlab")}</dd>
          <dt>{props.t("orchestra.actions.hostname")}</dt><dd dir="ltr"><bdi>{binding().provider.hostname}</bdi></dd>
          <dt>{props.t("orchestra.actions.apiOrigin")}</dt><dd dir="ltr"><bdi>{binding().provider.apiOrigin}</bdi></dd>
          <dt>{props.t("orchestra.actions.remote")}</dt><dd dir="ltr"><bdi>{binding().remote}</bdi></dd>
          <dt>{props.t("orchestra.actions.projectPath")}</dt><dd dir="ltr"><bdi>{binding().projectPath}</bdi></dd>
          <dt>{props.t("orchestra.actions.projectId")}</dt><dd dir="ltr"><bdi>{binding().projectID}</bdi></dd>
          <dt>{props.t("orchestra.actions.bindingId")}</dt><dd dir="ltr"><bdi>{binding().id}</bdi></dd>
          <dt>{props.t("orchestra.actions.revision")}</dt><dd dir="ltr">{binding().revision}</dd>
          <dt>{props.t("orchestra.actions.account")}</dt><dd><bdi>{binding().account ?? props.t("orchestra.actions.unknown")}</bdi></dd>
          <dt>{props.t("orchestra.actions.provider")}</dt><dd><code dir="ltr">{binding().provider.kind === "github" ? "gh" : "glab"}</code></dd>
           <dt>{props.t("orchestra.actions.status")}</dt><dd>{capabilityLabel(props.t, capability([["runs.list", "runs.read"]]).state)}</dd>
        </dl>
        <div class="mx-card-foot"><span></span><button class="mx-btn danger" type="button" disabled={view.pending || props.model.state.submitting} onClick={() => openRemoval(binding())}>{props.t("orchestra.actions.disconnect")}</button></div>
      </article>}</Show>
         <article class="mx-card ar-setting-card">
           <div class="mx-card-top"><h3>{props.t("orchestra.actions.capabilities")}</h3></div>
           <Show when={props.model.state.capabilities.status === "loading"}><p class="mx-note">{props.t("orchestra.actions.loading")}</p></Show>
            <Show when={props.model.state.capabilities.status === "error"}><p class="mx-error" role="alert">{props.t(props.model.state.capabilities.error?.message ?? "orchestra.actions.unavailable")}</p></Show>
           <div class="ar-capabilities"><For each={capabilityRows()}>{(row) => {
             const value = () => capability(row.requirements)
             return <div class="capability"><span>{row.label}</span><span><strong>{capabilityLabel(props.t, value().state)}</strong>{value().reason ? <small>{value().reason}</small> : null}{value().scope ? <small><bdi>{value().scope}</bdi></small> : null}</span></div>
           }}</For></div>
         </article>
         <article class="mx-card ar-setting-card">
            <div class="mx-card-top"><h3>{props.t("orchestra.actions.localPolicy")}</h3></div>
           <Show when={props.model.state.resources.status === "loading"}><p class="mx-note">{props.t("orchestra.actions.loading")}</p></Show>
            <Show when={props.model.state.resources.status === "error"}><p class="mx-error" role="alert">{props.t(props.model.state.resources.error?.message ?? "orchestra.actions.unavailable")}</p></Show>
           <dl class="wf-kv ar-facts">
              <dt>{props.t("orchestra.actions.retention")}</dt><dd>{localPolicy().retentionDays ?? props.t("orchestra.actions.unknown")}</dd>
              <dt>{props.t("orchestra.actions.execution")}</dt><dd><bdi dir="auto">{localPolicy().execution ?? props.t("orchestra.actions.unknown")}</bdi></dd>
            </dl>
            <p class="mx-note">{props.t("orchestra.actions.localPolicyDetail")}</p>
            <div class="mx-card-foot"><span></span><button class="mx-btn" type="button" disabled={!canConfigureLocalPolicy(props.model.state) || view.pending} onClick={() => props.model.dialog({ kind: "project-settings", target: "local" })}>{props.t("orchestra.actions.edit")}</button></div>
          </article>
          <article class="mx-card ar-setting-card">
            <div class="mx-card-top"><h3>{props.t("orchestra.actions.nativePolicy")}</h3></div>
            <Show when={props.model.state.resources.status === "loading"}><p class="mx-note">{props.t("orchestra.actions.loading")}</p></Show>
            <Show when={props.model.state.resources.status === "error"}><p class="mx-error" role="alert">{props.t(props.model.state.resources.error?.message ?? "orchestra.actions.unavailable")}</p></Show>
            <dl class="wf-kv ar-facts">
              <dt>{props.t("orchestra.actions.execution")}</dt><dd>{selected()?.provider.kind === "gitlab" || nativePolicy().unavailable ? props.t("orchestra.actions.unavailable") : nativePolicy().value === "Project default" ? props.t("orchestra.actions.policyProjectDefault") : nativePolicy().value === "Restricted to approved actions" ? props.t("orchestra.actions.policyRestricted") : props.t("orchestra.actions.unknown")}</dd>
              <dt>{props.t("orchestra.actions.scope")}</dt><dd><bdi dir="auto">{policy()?.scope ?? props.t("orchestra.actions.unknown")}</bdi></dd>
            </dl>
            <Show when={nativePolicy().settings}>{(settings) => <details><summary>{props.t("orchestra.actions.definition")}</summary><pre dir="ltr">{JSON.stringify(settings(), null, 2)}</pre></details>}</Show>
            <p class="mx-note">{props.t("orchestra.actions.nativePolicyDetail")}</p>
            <div class="mx-card-foot"><span></span><button class="mx-btn" type="button" disabled={!canConfigureNativePolicy(props.model.state) || view.pending} onClick={() => props.model.dialog({ kind: "project-settings", target: "native" })}>{props.t("orchestra.actions.edit")}</button></div>
          </article>
      </div>
    </div>
    <dialog ref={(value) => (dialog = value)} class="mx-dialog actions-dialog" aria-labelledby="actions-remove-title" aria-describedby="actions-remove-detail" onCancel={(event) => { event.preventDefault(); close() }}>
      <form onSubmit={remove}>
        <header class="mx-dialog-head dialog-head">
           <div><h2 id="actions-remove-title">{props.t("orchestra.actions.disconnect")}</h2><p id="actions-remove-detail">{props.t("orchestra.actions.confirmDisconnect")}</p></div>
           <button type="button" class="mx-btn" disabled={view.pending || props.model.state.submitting} aria-label={props.t("orchestra.actions.close")} onClick={close}>{props.t("orchestra.actions.close")}</button>
        </header>
        <fieldset disabled={view.pending || props.model.state.submitting}>
           <div class="mx-dialog-body dialog-body">
              <Show when={view.error || props.model.state.commandError}><p class="mx-error" role="alert">{view.error || props.t(props.model.state.commandError?.message ?? "orchestra.actions.unavailable")}</p></Show>
             <p class="ad-note">{props.t("orchestra.actions.confirmDisconnect")}</p>
           </div>
        </fieldset>
        <footer class="mx-dialog-foot">
           <div class="ad-footer-actions"><button type="button" class="mx-btn" autofocus disabled={view.pending || props.model.state.submitting} onClick={close}>{props.t("orchestra.actions.cancel")}</button>
           <button type="submit" class="mx-btn danger" disabled={view.pending || props.model.state.submitting}>{view.pending || props.model.state.submitting ? props.t("orchestra.actions.submitting") : props.t("orchestra.actions.confirm")}</button></div>
        </footer>
      </form>
    </dialog>
  </section>
}

function capabilityValue(status: "idle" | "loading" | "ready" | "error", items: readonly Actions.Capability[] | undefined, requirements: readonly (readonly string[])[]) {
  if (status !== "ready") return { state: "unknown" as const, reason: undefined, scope: undefined }
  const resolved = requirements.map((names) => items?.filter((item) => names.includes(item.operation)) ?? [])
  if (resolved.some((group) => group.some((item) => item.state === "unavailable"))) return { state: "unavailable" as const, reason: resolved.flat().find((item) => item.state === "unavailable")?.reason, scope: resolved.flat().find((item) => item.scope)?.scope }
  if (resolved.every((group) => group.some((item) => item.state === "available"))) return { state: "available" as const, reason: resolved.flat().find((item) => item.reason)?.reason, scope: resolved.flat().find((item) => item.scope)?.scope }
  return { state: "unknown" as const, reason: resolved.flat().find((item) => item.reason)?.reason, scope: resolved.flat().find((item) => item.scope)?.scope }
}

function capabilityLabel(t: ViewProps["t"], state: "available" | "unavailable" | "unknown") {
  if (state === "available") return t("orchestra.actions.available")
  if (state === "unavailable") return t("orchestra.actions.unavailable")
  return t("orchestra.actions.unknown")
}
