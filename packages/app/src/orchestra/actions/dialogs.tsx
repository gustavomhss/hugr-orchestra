import { createEffect, For, on, onCleanup, Show } from "solid-js"
import { createStore, type SetStoreFunction } from "solid-js/store"
import type { Actions } from "@orchestra/schema/actions"
import { Icon } from "@orchestra/ui/icon"
import type { Dialog, ViewProps } from "./contract"
import { actionsError } from "./api"
import { createDispatchData, dispatchDefaultRef, dispatchSelection, type DispatchData } from "./dispatch-data"
import { Input, isResourceDialog, isSourceDialog, parseInputs, sourceAction, sourceAllowed, sourcePayload, sourceTitle, SourceFields } from "./source-dialogs"

type FormState = {
  owner?: Dialog
  bindingID?: Actions.BindingID
  revision?: number
  generation: number
  pending: boolean
  disposed: boolean
  provider: Actions.ProviderKind
  hostname: string
  apiOrigin: string
  remote: string
  projectPath: string
  ref: string
  raw: string
  hostnameEdited: boolean
  apiOriginEdited: boolean
  error: string
}
type Variable = { key: string; value: string; variable_type: "env_var" | "file" }

export function Dialogs(props: ViewProps) {
  const [form, setForm] = createStore<FormState>({
    pending: false,
    disposed: false,
    generation: 0,
    provider: "github",
    hostname: "github.com",
    apiOrigin: "https://api.github.com",
    remote: "origin",
    projectPath: "",
    ref: "",
    raw: "",
    hostnameEdited: false,
    apiOriginEdited: false,
    error: "",
  })
  const [dispatchData, setDispatchData] = createStore<DispatchData>({ status: "idle" })
  const inspection = createDispatchData({ model: props.model, current: () => dispatchSelection(props.model.state, form.ref), update: setDispatchData })
  let element: HTMLDialogElement | undefined
  const current = () => {
    const value = props.model.state.dialog
    return isResourceDialog(value) ? undefined : value
  }
  const binding = () => props.model.state.binding
  const provider = () => binding()?.provider.kind
  const ownerIsCurrent = (owner: Dialog, id: Actions.BindingID | undefined, revision: number | undefined, generation: number) => !form.disposed && current() === owner && binding()?.id === id && binding()?.revision === revision && form.generation === generation
  const connectOwnerIsCurrent = (owner: Dialog) => !form.disposed && current() === owner
  const close = () => { if (!form.pending && !props.model.state.submitting) { inspection.cancel(); props.model.dialog(undefined) } }

  createEffect(on(() => [current(), binding()?.id, binding()?.revision], () => {
    const owner = current()
    const selected = binding()
    if (!owner) {
      setForm({ owner: undefined, bindingID: undefined, revision: undefined, pending: false, disposed: false, generation: form.generation + 1, provider: "github", hostname: "", apiOrigin: "", remote: "", projectPath: "", ref: "", raw: "", hostnameEdited: false, apiOriginEdited: false, error: "" })
      if (element?.open) element.close()
      return
    }
      const connectPending = form.pending && form.owner === owner && owner.kind === "connect"
      setForm({
        owner,
        bindingID: selected?.id,
        revision: selected?.revision,
        pending: connectPending,
        disposed: false,
        generation: form.generation + 1,
        provider: selected?.provider.kind ?? "github",
        hostname: selected?.provider.hostname ?? "github.com",
        apiOrigin: selected?.provider.apiOrigin ?? "https://api.github.com",
        remote: selected?.remote ?? "origin",
        projectPath: selected?.projectPath ?? "",
        ref: owner.kind === "dispatch" ? dispatchDefaultRef(props.model.state, owner) : defaultRef(selected?.id, props.model.state),
        raw: "",
        hostnameEdited: false,
        apiOriginEdited: false,
        error: "",
      })
    if (element && !element.open) element.showModal()
  }))
  createEffect(on(() => [form.generation, dispatchSelection(props.model.state, form.ref)], () => {
    setForm({ raw: "", error: "" })
    void inspection.load()
  }))
  onCleanup(() => { inspection.dispose(); setForm({ disposed: true, pending: false, raw: "", projectPath: "", ref: "", error: "" }); if (element?.open) element.close() })

  const submit = (event: SubmitEvent & { currentTarget: HTMLFormElement }) => {
    event.preventDefault()
    const owner = current()
    if (!owner || form.pending || props.model.state.submitting || (owner.kind !== "connect" && !binding()) || (isSourceDialog(owner) && !sourceAllowed(owner, props)) || (owner.kind === "jobPlay" && provider() !== "gitlab")) return
    const data = new FormData(event.currentTarget)
    const id = binding()?.id
    const revision = binding()?.revision
    const generation = form.generation
    if (owner.kind === "connect") return submitConnect(owner)
    const selectedProvider = provider()
     if (!selectedProvider) return setForm("error", props.t("orchestra.actions.invalidInputs"))
    if (owner.kind === "dispatch") {
      if (!form.ref.trim()) return setForm("error", props.t("orchestra.actions.required"))
      if (dispatchData.status !== "ready" || !inspection.ready()) return
      const parsed = parseInputs(form.raw, dispatchData.definitions, selectedProvider, data)
       if (parsed.error) return setForm("error", props.t(parsed.error === "required" ? "orchestra.actions.required" : "orchestra.actions.invalidInputs"))
      const variables = selectedProvider === "gitlab" ? variablesFromForm(data) : undefined
      if (variables && "error" in variables) return setForm("error", props.t("orchestra.actions.invalidInputs"))
      return submitCommand(owner, id, revision, generation, { provider: selectedProvider, ref: form.ref.trim(), inputs: parsed.value, ...(variables ? { variables } : {}) })
    }
    if (isSourceDialog(owner)) {
      const result = sourcePayload(owner, props, data)
       if ("error" in result) return setForm("error", props.t(result.error === "required" ? "orchestra.actions.required" : "orchestra.actions.invalidInputs"))
      return submitCommand(owner, id, revision, generation, result.payload)
    }
    const payload = commandPayload(owner, selectedProvider, data)
    if (payload && "error" in payload) return setForm("error", props.t("orchestra.actions.invalidInputs"))
    if (payload) submitCommand(owner, id, revision, generation, payload)
  }

  const submitConnect = (owner: Dialog) => {
    if (!form.projectPath.trim() || !form.remote.trim() || !form.hostname.trim() || !form.apiOrigin.trim()) return setForm("error", props.t("orchestra.actions.required"))
    setForm({ pending: true, error: "" })
    const payload = { remote: form.remote.trim(), projectPath: form.projectPath.trim(), provider: { kind: form.provider, hostname: form.hostname.trim(), apiOrigin: form.apiOrigin.trim() } }
    void props.model.connect(payload).then(
      () => { if (connectOwnerIsCurrent(owner) && !props.model.state.commandError) props.model.dialog(undefined) },
      (error: unknown) => { if (connectOwnerIsCurrent(owner)) setForm("error", props.t(actionsError(error).message)) },
    ).finally(() => { if (connectOwnerIsCurrent(owner)) setForm("pending", false) })
  }
  const submitCommand = (owner: Dialog, id: Actions.BindingID | undefined, revision: number | undefined, generation: number, payload: unknown) => {
    setForm({ pending: true, error: "" })
    void props.model.submit(payload).then(undefined, (error: unknown) => { if (ownerIsCurrent(owner, id, revision, generation)) setForm("error", props.t(actionsError(error).message)) }).finally(() => { if (ownerIsCurrent(owner, id, revision, generation)) setForm("pending", false) })
  }

  return <div class="actions-page" data-component="orchestra-actions" style={{ display: "contents" }}><dialog ref={(value) => (element = value)} class="mx-dialog actions-dialog" aria-labelledby="actions-dialog-title" aria-describedby="actions-dialog-detail" onCancel={(event) => { event.preventDefault(); close() }}>
    <Show when={current() ? form.generation : undefined} keyed>{(_generation) => {
      const value = current()
      if (!value) return null
      return <form autocomplete="off" onSubmit={submit}>
        <header class="mx-dialog-head dialog-head">
          <div><h2 id="actions-dialog-title">{title(props.t, value, form.provider)}</h2><p id="actions-dialog-detail">{props.t("orchestra.actions.description")}</p></div>
          <button type="button" class="mx-btn icon" disabled={form.pending || props.model.state.submitting} aria-label={props.t("orchestra.actions.close")} onClick={close}><Icon name="close" aria-hidden="true" /></button>
        </header>
        <fieldset class="actions-dialog-fields" disabled={form.pending || props.model.state.submitting || (isSourceDialog(value) && !sourceAllowed(value, props))}>
          <div class="mx-dialog-body dialog-body"><Show when={props.model.state.commandError || form.error}><p class="mx-error" role="alert">{props.model.state.commandError ? props.t(props.model.state.commandError.message) : form.error}</p></Show><DialogFields props={props} value={value} form={form} setForm={setForm} dispatchData={dispatchData} /></div>
        </fieldset>
        <footer class="mx-dialog-foot">
          <div class="ad-footer-actions"><button type="button" class="mx-btn" autofocus={value.kind === "cancel" || value.kind === "remove"} disabled={form.pending || props.model.state.submitting} onClick={close}>{props.t("orchestra.actions.cancel")}</button>
          <Show when={value.kind !== "jobPlay" || form.provider === "gitlab"}><button type="submit" class="mx-btn primary" disabled={form.pending || props.model.state.submitting || (value.kind !== "connect" && !binding()) || (value.kind === "dispatch" && (dispatchData.status !== "ready" || !inspection.ready())) || (isSourceDialog(value) && !sourceAllowed(value, props))}>{form.pending || props.model.state.submitting ? props.t("orchestra.actions.submitting") : action(props.t, value, form.provider)}</button></Show></div>
        </footer>
      </form>
    }}</Show>
   </dialog></div>
}

function DialogFields(props: { props: ViewProps; value: Dialog; form: FormState; setForm: SetStoreFunction<FormState>; dispatchData: DispatchData }) {
  const t = props.props.t
  if (props.value.kind === "connect") return <ConnectFields form={props.form} setForm={props.setForm} t={t} />
  if (props.value.kind === "dispatch") return <DispatchFields form={props.form} setForm={props.setForm} data={props.dispatchData} t={t} />
  if (isSourceDialog(props.value)) return <SourceFields value={props.value} view={props.props} form={props.form} />
  if (props.value.kind === "cancel" || props.value.kind === "remove") return <p class="ad-note">{t(props.value.kind === "cancel" ? "orchestra.actions.confirmCancel" : "orchestra.actions.confirmRemove")}</p>
  if (props.value.kind === "retry") return <RetryFields form={props.form} t={t} />
   if (props.value.kind === "jobRetry") return <Show when={props.form.provider === "github"}><label class="mx-field"><span>{t("orchestra.actions.debugLogging")}</span><input name="enableDebugLogging" type="checkbox" autofocus /></label></Show>
  if (props.value.kind === "jobPlay" && props.form.provider === "gitlab") return <JobPlayFields t={t} />
  return <p class="ad-note">{t("orchestra.actions.unavailable")}</p>
}

function ConnectFields(props: { form: FormState; setForm: SetStoreFunction<FormState>; t: ViewProps["t"] }) {
  return <>
    <label class="mx-field">
      <span>{props.t("orchestra.actions.provider")}</span>
       <select autofocus value={props.form.provider} onChange={(event) => {
        const provider = providerKind(event.currentTarget.value)
        if (!provider) return
        const hostname = props.form.hostnameEdited ? props.form.hostname : provider === "github" ? "github.com" : "gitlab.com"
        props.setForm({ provider, hostname, ...(props.form.apiOriginEdited ? {} : { apiOrigin: defaultApiOrigin(provider, hostname) }) })
      }}>
        <option value="github">{props.t("orchestra.actions.github")}</option>
        <option value="gitlab">{props.t("orchestra.actions.gitlab")}</option>
      </select>
    </label>
    <label class="mx-field"><span>{props.t("orchestra.actions.hostname")}</span><input name="hostname" dir="ltr" required value={props.form.hostname} onInput={(event) => {
      const hostname = event.currentTarget.value
      props.setForm({ hostname, hostnameEdited: true, ...(props.form.apiOriginEdited ? {} : { apiOrigin: defaultApiOrigin(props.form.provider, hostname) }) })
    }} /></label>
     <label class="mx-field"><span>{props.t("orchestra.actions.apiOrigin")}</span><input name="apiOrigin" dir="ltr" type="url" required value={props.form.apiOrigin} onInput={(event) => props.setForm({ apiOrigin: event.currentTarget.value, apiOriginEdited: true })} /></label>
    <label class="mx-field"><span>{props.t("orchestra.actions.remote")}</span><input name="remote" required value={props.form.remote} onInput={(event) => props.setForm("remote", event.currentTarget.value)} /></label>
    <label class="mx-field"><span>{props.t("orchestra.actions.projectPath")}</span><input name="projectPath" dir="ltr" required value={props.form.projectPath} onInput={(event) => props.setForm("projectPath", event.currentTarget.value)} /></label>
  </>
}

function DispatchFields(props: { form: FormState; setForm: SetStoreFunction<FormState>; data: DispatchData; t: ViewProps["t"] }) {
  return <>
    <label class="mx-field"><span>{props.t("orchestra.actions.ref")}</span><input name="ref" autofocus dir="ltr" required value={props.form.ref} onInput={(event) => props.setForm("ref", event.currentTarget.value)} /></label>
    <Show when={props.data.status === "loading"}><p class="ad-note" role="status">{props.t("orchestra.actions.loading")}</p></Show>
    <Show when={props.data.error}>{(error) => <p class="mx-error" role="alert">{props.t(error().message)}</p>}</Show>
    <Show when={props.data.status === "idle"}><p class="ad-note">{props.t("orchestra.actions.noSource")}</p></Show>
    <Show when={props.data.status === "ready"}>
      <Show when={props.data.definitions} fallback={<label class="mx-field"><span>{props.t("orchestra.actions.rawInputs")}</span><textarea name="raw" dir="ltr" value={props.form.raw} onInput={(event) => props.setForm("raw", event.currentTarget.value)} /></label>}>
        {(definition) => <fieldset class="ad-group"><legend>{props.t("orchestra.actions.inputs")}</legend><div class="ad-group-body"><For each={definition()}>{(item) => <Input definition={item} t={props.t} />}</For></div></fieldset>}
      </Show>
    </Show>
     <Show when={props.form.provider === "gitlab"}>
       <fieldset class="ad-group">
         <legend>{props.t("orchestra.actions.variables")}</legend>
         <div class="ad-group-body">
           <label class="mx-field"><span>{props.t("orchestra.actions.variableKey")}</span><input name="pipelineKey" /></label>
           <label class="mx-field"><span>{props.t("orchestra.actions.variableValue")}</span><input name="pipelineValue" type="password" /></label>
           <label class="mx-field"><span>{props.t("orchestra.actions.variableType")}</span><select name="pipelineType"><option value="env_var">{props.t("orchestra.actions.envVariable")}</option><option value="file">{props.t("orchestra.actions.fileVariable")}</option></select></label>
         </div>
       </fieldset>
     </Show>
  </>
}

function RetryFields(props: { form: FormState; t: ViewProps["t"] }) {
  return <>
    <p class="ad-note">{props.t("orchestra.actions.nativeRetry")}</p>
    <label class="mx-field"><span>{props.t("orchestra.actions.retry")}</span><select name="mode" autofocus><option value="failed">{props.t("orchestra.actions.retryFailed")}</option><Show when={props.form.provider === "github"}><option value="all">{props.t("orchestra.actions.retryAll")}</option></Show></select></label>
      <Show when={props.form.provider === "github"}><label class="mx-field"><span>{props.t("orchestra.actions.debugLogging")}</span><input name="enableDebugLogging" type="checkbox" /></label></Show>
  </>
}

function JobPlayFields(props: { t: ViewProps["t"] }) {
  return <>
     <label class="mx-field"><span>{props.t("orchestra.actions.variableKey")}</span><input name="key" autofocus /></label>
     <label class="mx-field"><span>{props.t("orchestra.actions.variableValue")}</span><input name="value" type="password" /></label>
    <label class="mx-field"><span>{props.t("orchestra.actions.variableType")}</span><select name="variable_type"><option value="env_var">{props.t("orchestra.actions.envVariable")}</option><option value="file" disabled>{props.t("orchestra.actions.fileVariable")}</option></select></label>
  </>
}

function commandPayload(value: Dialog, provider: Actions.ProviderKind, data: FormData) {
  if (value.kind === "retry") {
    if (provider === "gitlab") return { provider, mode: "failed" as const }
    return { provider, mode: data.get("mode") === "all" ? "all" as const : "failed" as const, ...(data.has("enableDebugLogging") ? { enableDebugLogging: true } : {}) }
  }
  if (value.kind === "cancel" || value.kind === "remove") return { provider }
  if (value.kind === "jobRetry") {
    return provider === "github" && data.has("enableDebugLogging") ? { provider, enableDebugLogging: true } : { provider }
  }
  if (value.kind === "jobPlay" && provider === "gitlab") {
    const key = String(data.get("key") ?? "").trim()
    const value = String(data.get("value") ?? "")
    const type = data.get("variable_type")
    if (type === "file") return { error: true }
    if (!key && !value) return { provider }
    if (!key) return { error: true }
    return { provider, variables: [{ key, value, variable_type: "env_var" as const }] }
  }
  return undefined
}

function variablesFromForm(data: FormData): readonly Variable[] | { error: true } | undefined {
  const key = String(data.get("pipelineKey") ?? "").trim()
  const value = String(data.get("pipelineValue") ?? "")
  const type = data.get("pipelineType") === "file" ? "file" as const : "env_var" as const
  if (!key && !value && type === "env_var") return undefined
  if (!key) return { error: true }
  return [{ key, value, variable_type: type }]
}

function providerKind(value: string): Actions.ProviderKind | undefined { return value === "github" || value === "gitlab" ? value : undefined }
function defaultApiOrigin(provider: Actions.ProviderKind, hostname: string) { return provider === "github" && hostname === "github.com" ? "https://api.github.com" : `https://${hostname}` }
function defaultRef(bindingID: Actions.BindingID | undefined, state: ViewProps["model"]["state"]): string {
  if (state.route.ref !== undefined) return state.route.ref
  const source = state.source.value
  if (bindingID && source && source.bindingID === bindingID && source.ref) return source.ref
  const run = state.run.value
  if (bindingID && run && run.bindingID === bindingID && run.ref) return run.ref
  return ""
}
function title(t: ViewProps["t"], value: Dialog, provider: Actions.ProviderKind) {
  if (value.kind === "connect") return t("orchestra.actions.connect")
  if (isSourceDialog(value)) return sourceTitle(t, value, provider)
  if (value.kind === "dispatch") return t(provider === "gitlab" ? "orchestra.actions.dispatchPipeline" : "orchestra.actions.dispatch")
  if (value.kind === "retry") return t("orchestra.actions.retry")
  if (value.kind === "cancel") return t("orchestra.actions.stop")
  if (value.kind === "remove") return t("orchestra.actions.remove")
  if (value.kind === "jobPlay") return t("orchestra.actions.play")
  return t("orchestra.actions.retryJob")
}
function action(t: ViewProps["t"], value: Dialog, provider: Actions.ProviderKind) {
  if (value.kind === "connect") return t("orchestra.actions.connect")
  if (isSourceDialog(value)) return sourceAction(t, value)
  if (value.kind === "dispatch") return t(provider === "gitlab" ? "orchestra.actions.dispatchPipeline" : "orchestra.actions.dispatch")
  if (value.kind === "cancel") return t("orchestra.actions.stop")
  if (value.kind === "remove") return t("orchestra.actions.remove")
  if (value.kind === "jobPlay") return t("orchestra.actions.play")
  return value.kind === "jobRetry" ? t("orchestra.actions.retryJob") : t("orchestra.actions.retry")
}
