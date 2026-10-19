import type { Actions } from "@orchestra/schema/actions"
import { createUniqueId, Show } from "solid-js"
import { onCleanup, onMount } from "solid-js"
import type { JSX } from "solid-js"
import { createStore } from "solid-js/store"
import type { Dialog, ErrorState, State, Translate, ViewProps } from "./contract"
import { actionsError } from "./api"
import { resourcePayload } from "./resource-payload"
import { Check, Field } from "./resource-fields"
import { canRequest } from "./request-policy"
import { ResourceScopeField } from "./resource-scopes-field"
import { canConfigureLocalPolicy, canConfigureNativePolicy, localPolicyEvidence, nativePolicyEvidence, settingsPolicy } from "./settings-evidence"
type ResourceKind = "create-variable" | "edit-variable" | "delete-variable" |
  "create-environment" | "edit-environment" | "delete-environment" |
  "create-runner" | "edit-runner" | "delete-runner" |
  "create-schedule" | "edit-schedule" | "delete-schedule" |
  "delete-artifact" | "delete-cache" | "clear-caches" | "project-settings"
type ResourceDialog = Extract<Dialog, { kind: ResourceKind }>
type Data = Record<string, unknown>
type Glyph = keyof typeof paths
type NodeGlyph = keyof typeof nodePaths
const paths = {
  settings: '<circle cx="8" cy="8" r="3"/><path d="M8 1v2M8 13v2M1 8h2M13 8h2M3 3l1.5 1.5M11.5 11.5 13 13M13 3l-1.5 1.5M4.5 11.5 3 13"/>',
  close: '<path d="m4 4 8 8M12 4l-8 8"/>',
  warning: '<path d="m8 1 7 13H1ZM8 5v4M8 11v1"/>',
  lock: '<rect x="3" y="7" width="10" height="7" rx="2"/><path d="M5 7V5a3 3 0 0 1 6 0v2M8 10v2"/>',
  server: '<rect x="2" y="2" width="14" height="5" rx="1"/><rect x="2" y="9" width="14" height="5" rx="1"/><path d="M4 4.5h1M4 11.5h1M9 4.5h3M9 11.5h3"/>',
  trash: '<path d="M2 4h12M6 4V2h4v2M4 4v10h8V4M6 7v4M10 7v4"/>',
  refresh: '<path d="M13 5a5.5 5.5 0 1 0 0 6M13 1v4H9"/>',
} as const
const nodePaths = { execute: '<rect x="3" y="4" width="18" height="16" rx="2.5"/><path d="m7 9.5 3 2.5-3 2.5M12.5 15.5H17"/>', verify: '<path d="M12 3 4.6 6v5.4c0 4.6 3.1 8.2 7.4 9.6 4.3-1.4 7.4-5 7.4-9.6V6z"/><path d="m8.8 12.1 2.3 2.3 4.2-4.5"/>', write: '<path d="M7 3h7l4 4v14H7z"/><path d="M14 3v4h4M12.5 11v6M9.5 14h6"/>', command: '<path d="m5 7 5 5-5 5M12 18h7"/>' } as const
export function ResourceDialogs(props: ViewProps) {
  const state = () => props.model.state
  const selected = (): ResourceDialog | undefined => {
    const dialog = supported(state().dialog)
    if (dialog && (dialog.kind === "create-schedule" || dialog.kind === "edit-schedule" || dialog.kind === "delete-schedule") && state().binding?.provider.kind === "github") return undefined
    if (dialog?.kind === "delete-cache" && state().binding?.provider.kind === "gitlab") return undefined
    if (dialog?.kind === "clear-caches" && state().binding?.provider.kind !== "gitlab") return undefined
    return dialog
  }
  const identity = () => {
    const dialog = selected()
    return dialog ? dialogKey(state().binding?.id, dialog, state().binding?.revision) : undefined
  }
  return <Show when={identity()} keyed>{(key) => {
    const dialog = selected()
    return dialog ? <Modal props={props} state={state} dialog={dialog} identity={key} /> : null
  }}</Show>
}
function Modal(p: { props: ViewProps; state: () => State; dialog: ResourceDialog; identity: string }) {
  const [formState, setFormState] = createStore<{ error?: ErrorState }>({})
  let element: HTMLDialogElement | undefined
  let disposed = false
  const id = createUniqueId()
  const target = () => resourceFor(p.state(), p.dialog)
  const unavailable = () => disabled(p.state(), p.dialog, target())
  const close = (notify: boolean) => {
    if (notify && p.state().submitting) return
    element?.querySelector<HTMLFormElement>("form")?.reset()
    element?.close()
    if (notify && !disposed && dialogKey(p.state().binding?.id, supported(p.state().dialog), p.state().binding?.revision) === p.identity) p.props.model.dialog(undefined)
  }
  const cancel = (event: Event) => { event.preventDefault(); close(true) }
  const submit: JSX.EventHandler<HTMLFormElement, SubmitEvent> = (event) => {
    event.preventDefault()
    if (disposed || unavailable() || dialogKey(p.state().binding?.id, supported(p.state().dialog), p.state().binding?.revision) !== p.identity) return
    const binding = p.state().binding
    if (!binding) return
    const data = new FormData(event.currentTarget)
    const resource = target()
    setFormState("error", undefined)
    void Promise.resolve().then(() => {
      if (disposed || unavailable() || dialogKey(p.state().binding?.id, supported(p.state().dialog), p.state().binding?.revision) !== p.identity) return
      return p.props.model.submit(resourcePayload(data, { provider: binding.provider.kind, kind: p.dialog.kind, target: p.dialog.kind === "project-settings" ? p.dialog.target : undefined, resource }))
    })
      .catch((error: unknown) => { if (!disposed) setFormState("error", actionsError(error)) })
  }
  const change: JSX.EventHandler<HTMLFormElement, Event> = (event) => {
    const form = event.currentTarget
    const input: unknown = form.elements.namedItem("value")
    const type: unknown = form.elements.namedItem("type")
    const masked: unknown = form.elements.namedItem("masked")
    const hidden: unknown = form.elements.namedItem("hidden")
    if (input instanceof HTMLInputElement && type instanceof HTMLSelectElement) input.type = type.value === "Secret" || isChecked(masked) || isChecked(hidden) ? "password" : "text"
    if (input instanceof HTMLInputElement) input.autocomplete = input.type === "password" ? "new-password" : "off"
  }
  onMount(() => {
    if (!element) return
    const onClose = () => {
      element?.querySelector<HTMLFormElement>("form")?.reset()
      if (!disposed && dialogKey(p.state().binding?.id, supported(p.state().dialog), p.state().binding?.revision) === p.identity) p.props.model.dialog(undefined)
    }
    element.addEventListener("cancel", cancel)
    element.addEventListener("close", onClose)
    element.showModal()
    element.querySelector<HTMLElement>("input:not(:disabled),select:not(:disabled),textarea:not(:disabled),button[type=submit]:not(:disabled)")?.focus()
    onCleanup(() => {
      disposed = true
      element?.removeEventListener("cancel", cancel)
      element?.removeEventListener("close", onClose)
      element?.querySelector("form")?.reset()
      element?.close()
    })
  })
  const t = p.props.t
  return <dialog ref={element} id="dialog" class="mx-dialog actions-dialog"
    aria-labelledby={`${id}-title`} aria-describedby={`${id}-context`}>
    <form autocomplete="off" onSubmit={submit} onChange={change} aria-busy={p.state().submitting} aria-errormessage={`${id}-error`}>
      <header class="mx-dialog-head dialog-head">
        <span class={`mx-mark ad-mark ${isDanger(p.dialog.kind) ? "ad-danger" : ""}`}>
          <LocalNodeGlyph name={nodeGlyph(p.dialog.kind)} />
        </span>
        <div>
          <div class="ad-eyebrow">{headerLabel(p.state().binding?.provider.kind, t)}</div>
          <h2 id={`${id}-title`}>{title(p.dialog, target(), t)}</h2>
          <p id={`${id}-context`}>{context(p.dialog, target(), p.state().binding?.provider.kind, t)}</p>
        </div>
        <button type="button" class="mx-btn icon" disabled={p.state().submitting} aria-label={t("orchestra.actions.closeDialog")} onClick={() => close(true)}>
          <LocalGlyph name="close" />
        </button>
      </header>
      <div class="mx-dialog-body dialog-body">
        <Body model={p.props.model} dialog={p.dialog} resource={target()} state={p.state()} t={t} disabled={unavailable()} />
      </div>
      <footer class="mx-dialog-foot">
        <Show when={formState.error ?? p.state().commandError} fallback={<span aria-hidden="true" />}>{(error) => <span id={`${id}-error`} class="ad-error" role="alert">{t(error().message)}</span>}</Show>
        <div class="ad-footer-actions">
          <button type="button" class="mx-btn" disabled={p.state().submitting} onClick={() => close(true)}>{t("orchestra.actions.cancel")}</button>
          <button type="submit" class={`mx-btn ${isDanger(p.dialog.kind) ? "danger" : "primary"}`} disabled={unavailable()}>
            {p.state().submitting ? t("orchestra.actions.submitting") : submitLabel(p.dialog, target(), t)}
          </button>
        </div>
      </footer>
    </form>
  </dialog>
}
function Body(p: ViewProps & { dialog: ResourceDialog; resource?: Actions.Resource; state: State; disabled: boolean }) {
  const data = record(p.resource?.data), github = p.state.binding?.provider.kind === "github"
  const localPolicy = localPolicyEvidence(p.resource)
  if (p.dialog.kind === "clear-caches") return <Review t={p.t}
     title={p.t("orchestra.actions.futureCacheNamespace")}
     entries={[[p.t("orchestra.actions.confirmationTarget"), p.t("orchestra.actions.projectRunnerCacheNamespace")]]}
     note={p.t("orchestra.actions.clearCachesConfirmation")} glyph="refresh" />
  if (p.dialog.kind.startsWith("delete")) return <DeleteReview dialog={p.dialog} resource={p.resource} data={data} state={p.state} t={p.t} />
  if (p.dialog.kind === "project-settings" && p.dialog.target === "native") return nativePolicyFields(p)
  if (p.dialog.kind === "project-settings") return <>
    <Group title={p.t("orchestra.actions.localPolicy")}>
       <Field t={p.t} label={p.t("orchestra.actions.retention")} name="retention" value={localPolicy.retentionDays?.toString()} type="number" min="1" required disabled={p.disabled} hint={p.t("orchestra.actions.localPolicyDetail")} />
       <Field t={p.t} label={p.t("orchestra.actions.execution")} name="policy" value={localPolicy.execution} select={[{ value: "Project default", label: p.t("orchestra.actions.policyProjectDefault") }, { value: "Restricted to approved actions", label: p.t("orchestra.actions.policyRestricted") }]} required disabled={p.disabled} />
    </Group>
    <Note t={p.t} title={p.t("orchestra.actions.localPolicy")} text={p.t("orchestra.actions.localPolicyDetail")} glyph="lock" />
  </>
  if (p.dialog.kind.endsWith("variable")) return <VariableBody {...p} data={data} github={github} />
  if (p.dialog.kind.endsWith("environment")) return <EnvironmentBody {...p} data={data} github={github} />
  if (p.dialog.kind.endsWith("runner")) return <RunnerBody {...p} data={data} github={github} />
  return <ScheduleBody {...p} data={data} />
}
function nativePolicyFields(p: { resource?: Actions.Resource; state: State; t: Translate; disabled: boolean }) {
  const policy = nativePolicyEvidence(p.resource)
  return <>
    <Group title={p.t("orchestra.actions.nativePolicy")}>
      <Show when={p.state.binding?.provider.kind === "github"}><Field t={p.t} label={p.t("orchestra.actions.execution")} name="policy" value={policy.value} select={[{ value: "Project default", label: p.t("orchestra.actions.policyProjectDefault") }, { value: "Restricted to approved actions", label: p.t("orchestra.actions.policyRestricted") }]} required disabled={p.disabled} /></Show>
      <Show when={!policy.value || p.state.binding?.provider.kind !== "github"}><p class="mx-note">{p.t(p.state.binding?.provider.kind === "gitlab" || policy.unavailable ? "orchestra.actions.unavailable" : "orchestra.actions.unknown")}</p></Show>
      <Show when={policy.settings}>{(settings) => <details><summary>{p.t("orchestra.actions.definition")}</summary><pre dir="ltr">{JSON.stringify(settings(), null, 2)}</pre></details>}</Show>
    </Group>
    <Note t={p.t} title={p.t("orchestra.actions.nativePolicy")} text={p.t("orchestra.actions.nativePolicyDetail")} glyph="lock" />
  </>
}
function VariableBody(p: ViewProps & { dialog: ResourceDialog; resource?: Actions.Resource; state: State; disabled: boolean; data: Data; github: boolean }) {
  const flags = flagsOf(p.resource), secret = Boolean(!p.resource || p.resource.sensitive || text(p.data, "type") === "Secret" || flags.includes("Masked") || flags.includes("Hidden"))
  const redacted = Boolean(p.resource && secret)
  return <>
    <Show when={redacted}>
      <Note t={p.t} title={p.github ? p.t("orchestra.actions.existingValueRedacted.github") : p.t("orchestra.actions.existingValueRedacted.gitlab")} text={p.github ? p.t("orchestra.actions.existingValueRedacted.github.detail") : p.t("orchestra.actions.existingValueRedacted.gitlab.detail")} glyph="lock" />
    </Show>
    <Group title={p.t("orchestra.actions.identityScope")}>
       <Field t={p.t} label={p.t("orchestra.actions.name")} name="name" value={p.resource?.name} required mono locked={Boolean(p.resource && (!p.github || secret))} disabled={p.disabled} placeholder={p.t("orchestra.actions.variableNamePlaceholder")} hint={p.t("orchestra.actions.variableNameHint")} />
      <Grid>
        <Field t={p.t} label={p.t("orchestra.actions.variableTypeLabel")} name="type" value={text(p.data, "type") || "Secret"} locked={Boolean(p.resource)} select={[{ value: "Secret", label: p.t("orchestra.actions.secret") }, { value: "Variable", label: p.t("orchestra.actions.variable") }]} disabled={p.disabled} />
        <ResourceScopeField model={p.model} t={p.t} name="scope" value={p.resource?.scope ?? ("scope" in p.dialog ? p.dialog.scope : undefined) ?? p.state.filters.scope} locked={p.github && Boolean(p.resource)} disabled={p.disabled} />
      </Grid>
    </Group>
    <Group title={p.t(redacted ? "orchestra.actions.replacementValue" : "orchestra.actions.configurationValue")}>
      <Field t={p.t} label={p.t(redacted ? "orchestra.actions.newValue" : "orchestra.actions.variableValueLabel")} name="value" value={secret ? "" : text(p.data, "value")} sensitive={secret} required disabled={p.disabled} mono placeholder={p.t(redacted ? "orchestra.actions.replacementValuePlaceholder" : "orchestra.actions.valuePlaceholder")} hint={p.t(redacted ? "orchestra.actions.replacementValueHint" : "orchestra.actions.valueHint")} />
    </Group>
    <Show when={!p.github}>
      <Group title={p.t("orchestra.actions.gitlabVariableControls")}>
        <Check t={p.t} label={p.t("orchestra.actions.protectedRefsOnly")} name="protected" checked={flags.includes("Protected")} disabled={p.disabled} hint={p.t("orchestra.actions.protectedRefsOnly.detail")} />
        <Check t={p.t} label={p.t("orchestra.actions.maskInJobLogs")} name="masked" checked={flags.includes("Masked") || !p.resource} disabled={p.disabled} hint={p.t("orchestra.actions.maskInJobLogs.detail")} />
        <Check t={p.t} label={p.t("orchestra.actions.hidden")} name="hidden" checked={flags.includes("Hidden")} disabled={p.disabled || Boolean(p.resource)} hint={p.resource ? p.t("orchestra.actions.hidden.editHint") : p.t("orchestra.actions.hidden.createHint")} />
      </Group>
    </Show>
  </>
}
function EnvironmentBody(p: { dialog: ResourceDialog; resource?: Actions.Resource; state: State; t: Translate; disabled: boolean; data: Data; github: boolean }) {
  return <>
    <Group title={p.t("orchestra.actions.deploymentTarget")}>
      <Field t={p.t} label={p.t("orchestra.actions.environment")} name="name" value={p.resource?.name || ""} required disabled={p.disabled} placeholder={p.t("orchestra.actions.environmentPlaceholder")} />
    </Group>
    <Group title={p.t("orchestra.actions.protectionRules")}>
      <Field t={p.t} label={p.t("orchestra.actions.requiredReviewers")} name="reviewers" value={text(p.data, "reviewers")} disabled={p.disabled} hint={p.t("orchestra.actions.reviewersHint")} />
       <Field t={p.t} label={p.t("orchestra.actions.refs")} name="refs" value={p.github ? text(p.data, "refs") : "*"} locked={!p.github} required disabled={p.disabled} mono hint={p.t(p.github ? "orchestra.actions.refsHint" : "orchestra.actions.gitlabEnvironmentRefs")} />
      {p.github && <Field t={p.t} label={p.t("orchestra.actions.waitTimerMinutes")} name="timer" value={text(p.data, "timer")} type="number" min="0" disabled={p.disabled} hint={p.t("orchestra.actions.waitTimerHint")} />}
       <Check t={p.t} label={p.t("orchestra.actions.preventSelfReview")} name="preventSelfReview" checked={unknownBool(p.data["preventSelfReview"], true)} disabled={p.disabled || !p.github && Boolean(p.resource)} hint={p.t("orchestra.actions.preventSelfReview.detail")} />
    </Group>
    <Show when={!p.github}><Note t={p.t} title={p.t("orchestra.actions.protectedEnvironmentAvailability")} text={p.t("orchestra.actions.protectedEnvironmentAvailability.detail")} glyph="lock" /></Show>
  </>
}
function RunnerBody(p: { dialog: ResourceDialog; resource?: Actions.Resource; state: State; t: Translate; disabled: boolean; data: Data; github: boolean }) {
  const labels = listText(p.data, "labels") || listText(p.data, "tags")
  return <>
    <Group title={p.t("orchestra.actions.runnerConfiguration")}>
      <Field t={p.t} label={p.t("orchestra.actions.runnerName")} name="name" value={p.resource?.name || ""} locked={p.github && Boolean(p.resource)} required disabled={p.disabled} placeholder={p.t("orchestra.actions.runnerNamePlaceholder")} />
       <Field t={p.t} label={p.t(p.github ? "orchestra.actions.labels" : "orchestra.actions.tags")} name="labels" value={Array.isArray(p.data.labels ?? p.data.tags) ? JSON.stringify(p.data.labels ?? p.data.tags) : labels} required disabled={p.disabled} hint={p.t("orchestra.actions.exactRunnerLabels")} />
       <Field t={p.t} label={p.t("orchestra.actions.platform")} name="platform" value={text(p.data, "platform")} locked={p.github && Boolean(p.resource)} required select={["Linux x64", "Linux ARM64", "macOS ARM64", "macOS x64", "Windows x64"].map((value) => ({ value, label: value }))} disabled={p.disabled} />
      <Show when={p.github && !p.resource}><Field t={p.t} label={p.t("orchestra.actions.runnerGroupID")} name="runnerGroupID" type="number" min="1" required disabled={p.disabled} /></Show>
    </Group>
    <Note t={p.t} title={p.t("orchestra.actions.installRunner")} text={p.t("orchestra.actions.installRunner.detail")} glyph="server" />
  </>
}
function ScheduleBody(p: { dialog: ResourceDialog; resource?: Actions.Resource; state: State; t: Translate; disabled: boolean; data: Data }) {
  const zone = text(p.data, "zone")
  const zones = ["UTC", "America/Sao_Paulo", "Europe/London"]
  if (zone && !zones.includes(zone)) zones.push(zone)
  const owner = p.resource?.owner || text(p.data, "owner") || text(p.data, "actor")
  return <>
    <Group title={p.t("orchestra.actions.scheduleConfiguration")}>
      <Field t={p.t} label={p.t("orchestra.actions.name")} name="name" value={p.resource?.name || ""} required disabled={p.disabled} placeholder={p.t("orchestra.actions.scheduleNamePlaceholder")} />
      <Grid>
        <Field t={p.t} label={p.t("orchestra.actions.resourceCron")} name="cron" value={text(p.data, "cron")} required disabled={p.disabled} mono hint={p.t("orchestra.actions.cronHint")} />
        <Field t={p.t} label={p.t("orchestra.actions.timezone")} name="zone" value={zone} select={zones.map((value) => ({ value, label: value }))} disabled={p.disabled} />
      </Grid>
      <Field t={p.t} label={p.t("orchestra.actions.ref")} name="ref" value={text(p.data, "ref")} required disabled={p.disabled} mono hint={p.t("orchestra.actions.scheduleRefHint")} />
       <Show when={p.resource}><Check t={p.t} label={p.t("orchestra.actions.replaceScheduleOverrides")} name="replaceOverrides" checked={false} disabled={p.disabled} hint={p.t("orchestra.actions.preserveScheduleOverrides")} /></Show>
        <Field t={p.t} label={p.t("orchestra.actions.overrideNamespace")} name="inputMode" value="variable" select={[{ value: "variable", label: p.t("orchestra.actions.variable") }, { value: "input", label: p.t("orchestra.actions.inputs") }]} required disabled={p.disabled} />
        <Field t={p.t} label={p.t("orchestra.actions.inputVariable")} name="input" value="" disabled={p.disabled} placeholder={p.t("orchestra.actions.inputPlaceholder")} hint={p.t("orchestra.actions.inputVariableHint")} />
    </Group>
    <Note t={p.t} title={p.t("orchestra.actions.executionIdentity")} text={p.t("orchestra.actions.executionIdentity.detail", { owner })} glyph="lock" />
  </>
}
function DeleteReview(p: { dialog: ResourceDialog; resource?: Actions.Resource; data: Data; state: State; t: Translate }) {
  const r = p.resource, entries: [string, string][] = [[p.t("orchestra.actions.resourceLabel"), r?.name || ("id" in p.dialog ? p.dialog.id ?? "" : "")]]
  if (r?.scope !== undefined) entries.push([p.t("orchestra.actions.scope"), r.scope === "Repository" && p.state.binding?.provider.kind === "gitlab" ? p.t("orchestra.actions.project") : r.scope])
  if (p.dialog.kind === "delete-variable") entries.push([p.t("orchestra.actions.variableTypeLabel"), text(p.data, "type")])
  if (p.dialog.kind === "delete-artifact") { entries.push([p.t("orchestra.actions.run"), text(p.data, "runID") || text(p.data, "run")]); entries.push([p.t("orchestra.actions.ref"), text(p.data, "ref")]) }
  if (p.dialog.kind === "delete-cache") entries.push([p.t("orchestra.actions.ref"), text(p.data, "ref")])
  const note = p.dialog.kind === "delete-variable" ? p.t("orchestra.actions.deleteVariable.detail")
    : p.dialog.kind === "delete-environment" ? p.t("orchestra.actions.deleteEnvironment.detail")
    : p.dialog.kind === "delete-runner" ? p.t("orchestra.actions.deleteRunner.detail")
    : p.dialog.kind === "delete-schedule" ? p.t("orchestra.actions.deleteSchedule.detail")
    : p.dialog.kind === "delete-cache" ? p.t("orchestra.actions.deleteCache.detail")
    : p.dialog.kind === "delete-artifact" ? p.t("orchestra.actions.deleteArtifact.detail")
    : p.t("orchestra.actions.deleteResource.detail")
  return <Review t={p.t} title={p.t("orchestra.actions.removeResource")} entries={entries} note={note} glyph="trash" />
}
function Review(p: { t: Translate; title: string; entries: readonly (readonly [string, string])[]; note: string; glyph: Glyph }) {
  return <>
    <div class="ad-review-context"><dl class="wf-kv">
      {p.entries.map((entry) => <><dt>{entry[0]}</dt><dd><bdi>{entry[1]}</bdi></dd></>)}
    </dl></div>
    <Note t={p.t} title={p.title} text={p.note} glyph={p.glyph} />
  </>
}
function Group(p: { title: string; children: JSX.Element }) { return <fieldset class="ad-group"><legend>{p.title}</legend><div class="ad-group-body">{p.children}</div></fieldset> }
function Grid(p: { children: JSX.Element }) { return <div class="ad-field-grid">{p.children}</div> }
function Note(p: { t: Translate; title: string; text: string; glyph: Glyph }) { return <aside class="info-card ad-note"><LocalGlyph name={p.glyph} /><div><strong>{p.title}</strong><p>{p.text}</p></div></aside> }
function LocalGlyph(p: { name: Glyph }) { return <svg class="wf-ic" viewBox="0 0 16 16" aria-hidden="true" innerHTML={paths[p.name]} /> }
function LocalNodeGlyph(p: { name: NodeGlyph }) { return <svg viewBox="0 0 24 24" aria-hidden="true" innerHTML={nodePaths[p.name]} /> }

function record(value: unknown): Data {
  return isRecord(value) ? value : {}
}

function isRecord(value: unknown): value is Data {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function text(data: Data, key: string): string {
  const value = data[key]
  return typeof value === "string" || typeof value === "number" || typeof value === "boolean" ? String(value) : ""
}

function listText(data: Data, key: string): string {
  const value = data[key]
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === "string").join(", ")
  return text(data, key)
}

function unknownBool(value: unknown, fallback = false): boolean {
  return typeof value === "boolean" ? value : fallback
}

function flagsOf(resource?: Actions.Resource): string[] {
  const value = record(resource?.data).flags
  if (Array.isArray(value)) return value.filter((flag): flag is string => typeof flag === "string")
  return typeof value === "string" ? value.split(/[·,\s]+/).filter(Boolean) : []
}
function sensitiveResource(resource?: Actions.Resource): boolean {
  const flags = flagsOf(resource)
  const data = record(resource?.data)
  return Boolean(resource && (resource.sensitive || text(data, "type") === "Secret" || flags.includes("Masked") || flags.includes("Hidden")))
}

function isChecked(value: unknown): boolean {
  return value instanceof HTMLInputElement && value.checked
}

function resourceFor(state: State, dialog: ResourceDialog): Actions.Resource | undefined {
  const items = [...(state.resources.value?.items ?? []), ...(state.artifacts.value?.items ?? [])]
  if (dialog.kind === "project-settings") return settingsPolicy(state)
  if (!("id" in dialog) || !dialog.id) return undefined
  const expected = dialog.kind.endsWith("variable") ? "variables" : dialog.kind.endsWith("environment") ? "environments" : dialog.kind.endsWith("runner") ? "runners" : dialog.kind.endsWith("schedule") ? "schedules" : dialog.kind === "delete-artifact" ? "artifacts" : "caches"
  return items.find((item) => item.bindingID === state.binding?.id && item.kind === expected && item.id === dialog.id && (!("scope" in dialog) || dialog.scope === undefined || item.scope === dialog.scope))
}

function hasTarget(dialog: ResourceDialog, resource?: Actions.Resource): boolean {
  return dialog.kind === "project-settings" ? resource?.kind === "policy" : !dialog.kind.startsWith("edit") && !dialog.kind.startsWith("delete") || Boolean(resource)
}

function historical(state: State, resource?: Actions.Resource): boolean {
  if (!resource || resource.kind !== "artifacts") return false
  const data = record(resource.data), runID = text(data, "runID") || text(data, "run"), run = state.run.value
  return Boolean(data.historical === true || runID && state.run.status === "ready" && run && run.bindingID === state.binding?.id && run.id === runID && state.route.attempt !== undefined && run.attempt !== state.route.attempt)
}

function capable(state: State, operation: string, resource?: Actions.Resource): boolean { return canRequest(state, operation, resource?.scope) }

function operation(dialog: ResourceDialog): string {
  if (dialog.kind === "clear-caches") return "cache.clear"
  if (dialog.kind === "project-settings") return "resource.update"
  if (dialog.kind.startsWith("delete")) return dialog.kind === "delete-runner" ? "runner.remove" : "resource.delete"
  if (dialog.kind.startsWith("edit")) return "resource.update"
  return dialog.kind === "create-runner" ? "runner.register" : "resource.create"
}
function disabled(state: State, dialog: ResourceDialog, resource?: Actions.Resource): boolean {
  if (dialog.kind === "project-settings") return !(dialog.target === "native" ? canConfigureNativePolicy(state, resource) : canConfigureLocalPolicy(state, resource))
  const data = record(resource?.data), inherited = resource?.kind === "runners" && (data.inherited === true || text(data, "origin").startsWith("Inherited"))
  const ready = resource?.kind === "artifacts" ? state.artifacts.status === "ready" || state.resources.status === "ready" : state.resources.status === "ready"
  return state.submitting || state.unsupported || !state.binding || !ready || !hasTarget(dialog, resource) || Boolean(data.historical === true || inherited || historical(state, resource))
    || data.readOnly === true || data.readonly === true || dialog.kind === "edit-environment" && state.binding.provider.kind === "gitlab" && (data.reviewersReadOnly === true || typeof data.reviewers !== "string" || typeof data.preventSelfReview !== "boolean") || dialog.kind.startsWith("edit") && data.editable === false || !capable(state, operation(dialog), resource)
}
function dialogKey(binding: string | undefined, dialog?: ResourceDialog, revision?: number): string {
  if (!dialog) return `${binding ?? ""}:${revision ?? ""}:none`
  const id = "id" in dialog ? dialog.id ?? "" : ""
  const scope = "scope" in dialog ? dialog.scope ?? "" : ""
  return JSON.stringify([binding, revision, dialog.kind, id, scope, dialog.kind === "project-settings" ? dialog.target ?? "local" : ""])
}
function supported(dialog: Dialog | undefined): ResourceDialog | undefined {
  if (!dialog) return undefined
  switch (dialog.kind) {
    case "project-settings": case "create-variable": case "edit-variable": case "delete-variable": case "create-environment": case "edit-environment": case "delete-environment":
    case "create-runner": case "edit-runner": case "delete-runner": case "create-schedule": case "edit-schedule": case "delete-schedule":
    case "delete-artifact": case "delete-cache": case "clear-caches":
      return dialog
    default:
      return undefined
  }
}
function isDanger(kind: ResourceKind): boolean { return kind === "clear-caches" || kind.startsWith("delete") }
function nodeGlyph(kind: ResourceKind): NodeGlyph { return kind.endsWith("variable") ? "verify" : kind.endsWith("environment") ? "write" : kind.endsWith("runner") ? "execute" : "command" }
function headerLabel(providerKind: string | undefined, t: Translate): string { return t("orchestra.actions.projectScope", { provider: t(providerKind === "github" ? "orchestra.actions.github" : "orchestra.actions.gitlab") }) }
function title(dialog: ResourceDialog, resource: Actions.Resource | undefined, t: Translate): string {
   if (dialog.kind === "clear-caches") return t("orchestra.actions.clearProjectRunnerCachesTitle")
  if (dialog.kind === "project-settings") return t(dialog.target === "native" ? "orchestra.actions.nativePolicy" : "orchestra.actions.settings.policy")
  if (dialog.kind.startsWith("delete")) return t("orchestra.actions.deleteResourceTitle", {
    name: resource?.name ?? ("id" in dialog ? dialog.id ?? "" : ""),
  })
  if (dialog.kind === "create-variable") return t("orchestra.actions.newSecretOrVariable")
  if (dialog.kind === "edit-variable") return sensitiveResource(resource) ? t("orchestra.actions.replaceVariable", { name: resource?.name ?? "" }) : t("orchestra.actions.editVariable", { name: resource?.name ?? "" })
  if (dialog.kind === "create-environment") return t("orchestra.actions.newEnvironment")
  if (dialog.kind === "edit-environment") return t("orchestra.actions.configureEnvironment", { name: resource?.name ?? "" })
  if (dialog.kind === "create-runner") return t("orchestra.actions.addProjectRunner")
  if (dialog.kind === "edit-runner") return t("orchestra.actions.configureRunner", { name: resource?.name ?? "" })
  if (dialog.kind === "create-schedule") return t("orchestra.actions.newPipelineSchedule")
  return t("orchestra.actions.editPipelineSchedule")
}
function context(dialog: ResourceDialog, resource: Actions.Resource | undefined, providerKind: string | undefined, t: Translate): string {
   if (dialog.kind === "clear-caches") return t("orchestra.actions.clearCachesConfirmation")
  if (dialog.kind === "project-settings") return t(dialog.target === "native" ? "orchestra.actions.nativePolicyDetail" : "orchestra.actions.localPolicyDetail")
  if (dialog.kind === "create-variable") return t("orchestra.actions.variableCreateContext")
  if (dialog.kind === "edit-variable") return t("orchestra.actions.variableEditContext", { scope: resource?.scope ?? "", type: text(record(resource?.data), "type") })
  if (dialog.kind === "create-environment" || dialog.kind === "edit-environment") return t("orchestra.actions.environmentContext")
  if (dialog.kind === "create-runner" || dialog.kind === "edit-runner") return t("orchestra.actions.runnerContext")
  if (dialog.kind === "create-schedule" || dialog.kind === "edit-schedule") return t("orchestra.actions.scheduleContext")
  if (dialog.kind.startsWith("delete")) return t("orchestra.actions.removeResource")
  return t("orchestra.actions.projectScope", { provider: t(providerKind === "github" ? "orchestra.actions.github" : "orchestra.actions.gitlab") })
}
function submitLabel(dialog: ResourceDialog, resource: Actions.Resource | undefined, t: Translate): string {
  if (dialog.kind === "project-settings") return t("orchestra.actions.save")
  if (isDanger(dialog.kind)) return t(dialog.kind === "clear-caches" ? "orchestra.actions.clearProjectRunnerCaches" : "orchestra.actions.confirm")
   if (dialog.kind === "edit-variable" && sensitiveResource(resource)) return t("orchestra.actions.replaceValueAction")
  return dialog.kind.startsWith("edit") ? t("orchestra.actions.save") : t("orchestra.actions.create")
}
