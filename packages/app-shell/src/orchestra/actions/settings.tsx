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
  policyFocus?: { bindingID: Actions.BindingID; revision: number; route: string; target: "local" | "native"; phase: "requested" | "loading" | "opened" }
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
  let policyInvoker: HTMLButtonElement | undefined
  let policyDialog: HTMLDialogElement | undefined
  const bindings = () => props.model.state.bindings.value ?? []
  const selected = () => props.model.state.binding
  const capabilityRows = () => [
    { label: props.t("orchestra.actions.settings.capability.read"), requirements: [["runs.list", "runs.read"], ["jobs.list", "jobs.read"], ["logs.read"]] },
    { label: props.t("orchestra.actions.settings.capability.execute"), requirements: [["workflow.dispatch"], ["run.retry"], ["run.cancel"]] },
    { label: props.t("orchestra.actions.settings.capability.resources"), requirements: [["resource.create"], ["resource.update"], ["resource.delete"]] },
    { label: props.t("orchestra.actions.settings.capability.review"), requirements: [["deployment.review"]] },
    { label: props.t("orchestra.actions.settings.capability.source"), requirements: [["source.read"], ["source.write"], ["source.review"]] },
    { label: props.t("orchestra.actions.settings.capability.live"), requirements: [["logs.live"], ["logs.tail"]] },
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
  const clearPolicyFocus = () => {
    policyInvoker = undefined
    policyDialog = undefined
    setView("policyFocus", undefined)
  }
  const editPolicy = (event: MouseEvent & { currentTarget: HTMLButtonElement }, target: "local" | "native") => {
    const binding = selected()
    if (!binding || view.disposed || event.currentTarget.disabled || !event.currentTarget.isConnected) return
    clearPolicyFocus()
    policyInvoker = event.currentTarget
    setView("policyFocus", { bindingID: binding.id, revision: binding.revision, route: JSON.stringify(props.model.state.route), target, phase: "requested" })
    props.model.dialog({ kind: "project-settings", target })
  }

  createEffect(() => {
    const owner = view.policyFocus
    if (!owner) return
    const state = props.model.state
    if (view.disposed || !policyInvoker?.isConnected || owner.bindingID !== selected()?.id || owner.revision !== selected()?.revision || owner.route !== JSON.stringify(state.route)) {
      clearPolicyFocus()
      return
    }
    if (state.dialog?.kind === "project-settings" && (state.dialog.target ?? "local") === owner.target) {
      if (owner.phase !== "opened") {
        setView("policyFocus", "phase", "opened")
        queueMicrotask(() => {
          if (view.policyFocus !== owner || state.dialog?.kind !== "project-settings" || (state.dialog.target ?? "local") !== owner.target) return
          policyDialog = policyInvoker?.ownerDocument.activeElement?.closest<HTMLDialogElement>("dialog#dialog.actions-dialog[open]") ?? undefined
        })
      }
      return
    }
    if (state.dialog) {
      if (owner.phase !== "requested") clearPolicyFocus()
      return
    }
    if (state.resources.status === "error") { clearPolicyFocus(); return }
    // Hydration temporarily clears the dialog and disables its invoker before opening it.
    if (owner.phase !== "opened") {
      if (state.resources.status === "loading" && owner.phase !== "loading") setView("policyFocus", "phase", "loading")
      return
    }
    if (state.resources.status !== "ready" || state.submitting) return
    // Run after dialog disposal and the browser's own focus restoration.
    queueMicrotask(() => {
      if (view.policyFocus !== owner || view.disposed) return
      if (!policyInvoker?.isConnected || owner.bindingID !== selected()?.id || owner.revision !== selected()?.revision || owner.route !== JSON.stringify(state.route)) {
        clearPolicyFocus()
        return
      }
      if (state.dialog || state.resources.status !== "ready" || state.submitting) return
      const invoker = policyInvoker
      const active = invoker.ownerDocument.activeElement
      const restore = !active?.isConnected || active === invoker.ownerDocument.body || active === invoker.ownerDocument.documentElement
        || active === invoker || policyDialog !== undefined && !policyDialog.open && policyDialog.contains(active)
      clearPolicyFocus()
      if (restore && invoker.isConnected && !invoker.disabled) invoker.focus({ preventScroll: true })
    })
  })

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
    clearPolicyFocus()
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

  const providerLabel = (binding: Actions.Binding) => props.t(binding.provider.kind === "github" ? "orchestra.actions.github" : "orchestra.actions.gitlab")
  const access = () => capability(capabilityRows()[1].requirements).state === "available" ? "orchestra.actions.settings.writeAccess" as const
    : capability(capabilityRows()[0].requirements).state === "available" ? "orchestra.actions.settings.readAccess" as const : "orchestra.actions.unknown" as const
  // Raw provider reasons (endpoint proofs, OAuth scope lists) stay secondary evidence, never row values.
  const evidence = () => props.model.state.capabilities.status === "ready"
    ? [...new Set((props.model.state.capabilities.value ?? []).flatMap((item) => item.reason ? [item.reason] : []))] : []

  return <section class="mx-page actions-page actions-resources ar-settings" data-component="orchestra-actions">
    <div class="mx-inner">
      <header class="ar-head">
        <span class="mx-mark ar-mark"><Mark name="command" /></span>
        <div class="ar-head-copy"><h2>{props.t("orchestra.actions.projectSettings")}</h2><p>{props.t("orchestra.actions.settings.detail")}</p>
          <Show when={selected()}>{(binding) => <div class="ar-summary">{props.t("orchestra.actions.settings.summary", { provider: providerLabel(binding()) })}</div>}</Show></div>
      </header>
      <Show when={props.model.state.unsupported}><p class="mx-error" role="alert">{props.t("orchestra.actions.unsupported")}</p></Show>
      <div class="settings-grid">
        <article class="mx-card ar-setting-card">
          <div class="mx-card-top"><span class="mx-mark ar-mark"><Mark name="read" /></span><h3>{props.t("orchestra.actions.settings.connection")}</h3>
            <Show when={selected()}><span class={`mx-badge ${connection().state === "available" ? "good" : connection().state === "unavailable" ? "warm" : ""}`}>{props.t(connection().label)}</span></Show></div>
          <Show when={props.model.state.bindings.status === "loading"}><p class="mx-note">{props.t("orchestra.actions.loading")}</p></Show>
          <Show when={props.model.state.bindings.status === "error"}><p class="mx-error" role="alert">{props.t(props.model.state.bindings.error?.message ?? "orchestra.actions.unavailable")}</p></Show>
          <Show when={props.model.state.bindings.status === "ready" && bindings().length === 0}><p class="mx-empty">{props.t("orchestra.actions.noConnection")}</p></Show>
          <Show when={bindings().length > 1}>
            <label class="mx-field"><span>{props.t("orchestra.actions.provider")}</span><select disabled={view.pending || props.model.state.submitting} value={selected()?.id ?? ""} onChange={select}>
              <option value="">{props.t("orchestra.actions.default")}</option>
              <For each={bindings()}>{(binding) => <option value={binding.id}>{providerLabel(binding)} · {binding.projectPath} · {binding.provider.hostname}{bindings().some((other) => other.id !== binding.id && other.projectPath === binding.projectPath && other.provider.hostname === binding.provider.hostname) ? ` (${binding.remote})` : ""}</option>}</For>
            </select></label>
          </Show>
          <Show when={selected()}>{(binding) => <>
            <dl class="wf-kv ar-facts">
              <dt>{props.t("orchestra.actions.provider")}</dt><dd>{providerLabel(binding())}</dd>
              <dt>{props.t("orchestra.actions.settings.host")}</dt><dd><bdi dir="ltr">{binding().provider.hostname}</bdi></dd>
              <dt>{props.t("orchestra.actions.project")}</dt><dd><bdi dir="ltr">{binding().projectPath}</bdi></dd>
              <dt>{props.t("orchestra.actions.signIn")}</dt><dd>{props.t("orchestra.actions.settings.signInValue", { cli: binding().provider.kind === "github" ? "gh" : "glab" })}</dd>
              <dt>{props.t("orchestra.actions.access")}</dt><dd>{props.t(access())}</dd>
            </dl>
            <details class="settings-details"><summary>{props.t("orchestra.actions.settings.connectionDetails")}</summary>
              <dl class="wf-kv ar-facts">
                <dt>{props.t("orchestra.actions.account")}</dt><dd><bdi>{binding().account ?? props.t("orchestra.actions.unknown")}</bdi></dd>
                <dt>{props.t("orchestra.actions.remote")}</dt><dd dir="ltr"><bdi>{binding().remote}</bdi></dd>
                <dt>{props.t("orchestra.actions.apiOrigin")}</dt><dd dir="ltr"><bdi>{binding().provider.apiOrigin}</bdi></dd>
                <dt>{props.t("orchestra.actions.projectId")}</dt><dd dir="ltr"><bdi>{binding().projectID}</bdi></dd>
                <dt>{props.t("orchestra.actions.bindingId")}</dt><dd dir="ltr"><bdi>{binding().id}</bdi></dd>
                <dt>{props.t("orchestra.actions.revision")}</dt><dd dir="ltr">{binding().revision}</dd>
              </dl>
            </details>
          </>}</Show>
          <p>{props.t("orchestra.actions.settings.connectionNote")}</p>
          <div class="mx-card-foot"><small>{props.t("orchestra.actions.settings.serverAuth")}</small><div class="settings-actions">
            <Show when={selected()}>{(binding) => <button class="mx-btn danger" type="button" disabled={view.pending || props.model.state.submitting} onClick={() => openRemoval(binding())}>{props.t("orchestra.actions.disconnect")}</button>}</Show>
            <button class="mx-btn" type="button" disabled={view.pending || props.model.state.submitting} onClick={() => props.model.dialog({ kind: "connect" })}>{props.t(selected() ? "orchestra.actions.settings.configureConnection" : "orchestra.actions.connect")}</button>
          </div></div>
        </article>
        <article class="mx-card ar-setting-card">
          <div class="mx-card-top"><span class="mx-mark ar-mark"><Mark name="verify" /></span><h3>{props.t("orchestra.actions.settings.capabilities")}</h3>
            <Show when={access() === "orchestra.actions.settings.writeAccess"}><span class="mx-badge good">{props.t("orchestra.actions.settings.writeAccess")}</span></Show></div>
          <Show when={props.model.state.capabilities.status === "loading"}><p class="mx-note">{props.t("orchestra.actions.loading")}</p></Show>
          <Show when={props.model.state.capabilities.status === "error"}><p class="mx-error" role="alert">{props.t(props.model.state.capabilities.error?.message ?? "orchestra.actions.unavailable")}</p></Show>
          <div class="ar-capabilities"><For each={capabilityRows()}>{(row) => {
            const state = () => capability(row.requirements).state
            return <div class="capability"><span>{row.label}</span><span class={`mx-badge ${state() === "available" ? "good" : state() === "unavailable" ? "warm" : ""}`}>{capabilityLabel(props.t, state())}</span></div>
          }}</For></div>
          <p>{props.t("orchestra.actions.settings.capabilitiesNote")}</p>
          <Show when={evidence().length > 0}>
            <details class="settings-details"><summary>{props.t("orchestra.actions.settings.evidence")}</summary><ul><For each={evidence()}>{(reason) => <li><bdi dir="auto">{reason}</bdi></li>}</For></ul></details>
          </Show>
        </article>
        <article class="mx-card ar-setting-card">
          <div class="mx-card-top"><span class="mx-mark ar-mark"><Mark name="write" /></span><h3>{props.t("orchestra.actions.settings.policy")}</h3>
            <Show when={policy()?.scope}>{(scope) => <span class="mx-badge"><bdi dir="auto">{scope()}</bdi></span>}</Show></div>
          <Show when={props.model.state.resources.status === "loading"}><p class="mx-note">{props.t("orchestra.actions.loading")}</p></Show>
          <Show when={props.model.state.resources.status === "error"}><p class="mx-error" role="alert">{props.t(props.model.state.resources.error?.message ?? "orchestra.actions.unavailable")}</p></Show>
          <dl class="wf-kv ar-facts">
            <dt>{props.t("orchestra.actions.retention")}</dt><dd>{localPolicy().retentionDays === undefined ? props.t("orchestra.actions.unknown") : <>{localPolicy().retentionDays} {props.t("orchestra.actions.settings.days")}</>}</dd>
            <dt>{props.t("orchestra.actions.execution")}</dt><dd><bdi dir="auto">{localPolicy().execution ?? props.t("orchestra.actions.unknown")}</bdi></dd>
          </dl>
          <p>{props.t("orchestra.actions.localPolicyDetail")}</p>
          <div class="mx-card-foot"><span></span><button class="mx-btn" type="button" disabled={!canConfigureLocalPolicy(props.model.state) || view.pending} onClick={(event) => editPolicy(event, "local")}>{props.t("orchestra.actions.settings.editLocal")}</button></div>
        </article>
        <article class="mx-card ar-setting-card">
          <div class="mx-card-top"><span class="mx-mark ar-mark"><Mark name="command" /></span><h3>{props.t("orchestra.actions.nativePolicy")}</h3></div>
          <Show when={props.model.state.resources.status === "loading"}><p class="mx-note">{props.t("orchestra.actions.loading")}</p></Show>
          <Show when={props.model.state.resources.status === "error"}><p class="mx-error" role="alert">{props.t(props.model.state.resources.error?.message ?? "orchestra.actions.unavailable")}</p></Show>
          <dl class="wf-kv ar-facts">
            <dt>{props.t("orchestra.actions.execution")}</dt><dd>{selected()?.provider.kind === "gitlab" || nativePolicy().unavailable ? props.t("orchestra.actions.unavailable") : nativePolicy().value === "Project default" ? props.t("orchestra.actions.policyProjectDefault") : nativePolicy().value === "Restricted to approved actions" ? props.t("orchestra.actions.policyRestricted") : props.t("orchestra.actions.unknown")}</dd>
            <dt>{props.t("orchestra.actions.scope")}</dt><dd><bdi dir="auto">{policy()?.scope ?? props.t("orchestra.actions.unknown")}</bdi></dd>
          </dl>
          <Show when={nativePolicy().settings}>{(settings) => <details class="settings-details"><summary>{props.t("orchestra.actions.definition")}</summary><pre dir="ltr">{JSON.stringify(settings(), null, 2)}</pre></details>}</Show>
          <p>{props.t("orchestra.actions.nativePolicyDetail")}</p>
          <div class="mx-card-foot"><span></span><button class="mx-btn" type="button" disabled={!canConfigureNativePolicy(props.model.state) || view.pending} onClick={(event) => editPolicy(event, "native")}>{props.t("orchestra.actions.settings.editNative")}</button></div>
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
  if (status !== "ready") return { state: "unknown" as const }
  const resolved = requirements.map((names) => items?.filter((item) => names.includes(item.operation)) ?? [])
  if (resolved.some((group) => group.some((item) => item.state === "unavailable"))) return { state: "unavailable" as const }
  if (resolved.every((group) => group.some((item) => item.state === "available"))) return { state: "available" as const }
  return { state: "unknown" as const }
}

function capabilityLabel(t: ViewProps["t"], state: "available" | "unavailable" | "unknown") {
  if (state === "available") return t("orchestra.actions.available")
  if (state === "unavailable") return t("orchestra.actions.unavailable")
  return t("orchestra.actions.unknown")
}

// 24-unit card marks, matching the approved mock's node glyphs.
function Mark(props: { name: "read" | "verify" | "write" | "command" }) {
  const paths = {
    read: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/>',
    verify: '<path d="M12 3 4.6 6v5.4c0 4.6 3.1 8.2 7.4 9.6 4.3-1.4 7.4-5 7.4-9.6V6z"/><path d="m8.8 12.1 2.3 2.3 4.2-4.5"/>',
    write: '<path d="M7 3h7l4 4v14H7zM14 3v4h4M12.5 11v6M9.5 14h6"/>',
    command: '<path d="m5 7 5 5-5 5M12 18h7"/>',
  }
  return <svg viewBox="0 0 24 24" aria-hidden="true" innerHTML={paths[props.name]} />
}
