import { For, Show } from "solid-js"
import type { Actions } from "@orchestra/schema/actions"
import type { Dialog, ViewProps } from "./contract"
import { isRecord, parseInputs } from "./input-definitions"
import { canRequest } from "./request-policy"
import { canEditSource, sourceProposalPath } from "./requests"
import { sourceDraftDirty } from "./source-draft-ui"

export { githubDefinitions, headerDefinitions } from "./input-definitions"
export { parseInputs }

export function isResourceDialog(value: Dialog | undefined) {
  return value !== undefined && ["create-variable", "edit-variable", "delete-variable", "create-environment", "edit-environment", "delete-environment", "create-runner", "edit-runner", "delete-runner", "create-schedule", "edit-schedule", "delete-schedule", "delete-artifact", "delete-cache", "clear-caches"].includes(value.kind)
}

export function isSourceDialog(value: Dialog) {
  return value.kind === "create-workflow" || value.kind === "approval" || value.kind === "review-source" || value.kind === "project-settings"
}

export function Input(props: { definition: Actions.InputDefinition; t: ViewProps["t"] }) {
  const item = props.definition
  const label = <span>{item.name === "debug" ? props.t("orchestra.actions.debugLogging") : item.name}{item.required ? <b aria-hidden="true">*</b> : null}</span>
  const name = `input:${item.name}`
  if (item.type === "boolean") return <label class="mx-field">{label}<input name={name} type="checkbox" checked={item.default === true} />{item.description ? <small>{item.description}</small> : null}</label>
  if ((item.type === "choice" || item.type === "environment") && item.options) return <label class="mx-field">{label}<select name={name} required={item.required}><option value="" selected={item.default === undefined}></option><For each={item.options}>{(option, index) => <option value={String(index())} selected={Object.is(option, item.default)}>{String(option)}</option>}</For></select>{item.description ? <small>{item.description}</small> : null}</label>
  if (item.type === "array") return <label class="mx-field">{label}<textarea name={name} required={item.required} dir="ltr">{item.default !== undefined ? JSON.stringify(item.default) : ""}</textarea>{item.description ? <small>{item.description}</small> : null}</label>
  return <label class="mx-field">{label}<input name={name} type={item.type === "number" ? "number" : "text"} step={item.type === "number" ? "any" : undefined} required={item.required} value={typeof item.default === "string" || typeof item.default === "number" ? String(item.default) : ""} />{item.description ? <small>{item.description}</small> : null}</label>
}

export function SourceFields(props: { value: Dialog; view: ViewProps; form: { provider: Actions.ProviderKind } }) {
  const t = props.view.t
  if (props.value.kind === "create-workflow") return <>
    <fieldset class="ad-group"><legend>{t("orchestra.actions.sourceConfiguration")}</legend><div class="ad-group-body">
      <label class="mx-field"><span>{t("orchestra.actions.name")}</span><input name="name" autofocus required placeholder={t("orchestra.actions.sourceNamePlaceholder")} /></label>
      <label class="mx-field"><span>{t("orchestra.actions.path")}</span><input name="path" required dir="ltr" maxlength={2048} value={props.form.provider === "github" ? ".github/workflows/build.yml" : ".gitlab/ci/build.yml"} /><small>{t(props.form.provider === "github" ? "orchestra.actions.sourcePathHint.github" : "orchestra.actions.sourcePathHint.gitlab")}</small></label>
      <label class="mx-field"><span>{t("orchestra.actions.template")}</span><select name="template"><option value="build-test">{t("orchestra.actions.templateBuildTest")}</option><option value="release">{t("orchestra.actions.templateRelease")}</option><option value="blank">{t("orchestra.actions.templateBlank")}</option></select></label>
    </div></fieldset>
    <p class="ad-note"><strong>{t("orchestra.actions.sourceDraftFirst")}</strong> {t(props.form.provider === "github" ? "orchestra.actions.sourceDraftFirst.github" : "orchestra.actions.sourceDraftFirst.gitlab")}</p>
  </>
  if (props.value.kind === "approval") return <>
    <RunContext value={props.value} view={props.view} />
    <fieldset class="ad-group"><legend>{t("orchestra.actions.reviewDeployment")}</legend><div class="ad-group-body">
      <label class="mx-field"><span>{t("orchestra.actions.reviewDeployment")}</span><select name="decision" autofocus><option value="approve">{t("orchestra.actions.approve")}</option><option value="reject">{t("orchestra.actions.reject")}</option></select></label>
      <label class="mx-field"><span>{t("orchestra.actions.comment")}</span><textarea name="comment" required /></label>
    </div></fieldset>
  </>
  if (props.value.kind === "review-source") return <>
    <SourceContext view={props.view} />
    <fieldset class="ad-group"><legend>{t("orchestra.actions.reviewSource")}</legend><div class="ad-group-body">
      <label class="mx-field"><span>{t("orchestra.actions.branch")}</span><input name="branch" autofocus required dir="ltr" value="actions-update-ci" /></label>
      <label class="mx-field"><span>{t("orchestra.actions.message")}</span><input name="message" required value={t("orchestra.actions.sourceCommitDefault")} /></label>
      <label class="mx-field"><span>{t("orchestra.actions.reviewTitle")}</span><input name="title" required value={t("orchestra.actions.sourceReviewTitleDefault")} /></label>
    </div></fieldset>
    <p class="ad-note"><strong>{t("orchestra.actions.sourceIdentityNote")}</strong> {t(props.form.provider === "github" ? "orchestra.actions.sourceIdentityNote.github" : "orchestra.actions.sourceIdentityNote.gitlab")}</p>
  </>
  const policy = policyResource(props.view.model.state.resources.value?.items, props.view.model.state.binding?.id)
  return <fieldset class="ad-group"><legend>{t("orchestra.actions.projectSettings")}</legend><div class="ad-group-body">
    <label class="mx-field"><span>{t("orchestra.actions.retention")}</span><input name="retentionDays" autofocus required type="number" min="1" step="1" value={policy?.retentionDays ?? ""} /></label>
    <label class="mx-field"><span>{t("orchestra.actions.execution")}</span><select name="execution" value={policy?.execution ?? "Project default"}><option value="Project default">{t("orchestra.actions.default")}</option><option value="Restricted to approved actions">{t("orchestra.actions.execution")}</option><Show when={policy?.execution && policy.execution !== "Project default" && policy.execution !== "Restricted to approved actions"}><option value={policy?.execution}>{policy?.execution}</option></Show></select></label>
    <p class="ad-note">{policy?.scope ?? t("orchestra.actions.inherited")}{policy?.owner && policy.owner !== policy.scope ? ` · ${policy.owner}` : ""}</p>
  </div></fieldset>
}

export function sourceTitle(t: ViewProps["t"], value: Dialog, provider: Actions.ProviderKind) {
  if (value.kind === "create-workflow") return t(provider === "github" ? "orchestra.actions.createWorkflow" : "orchestra.actions.createConfiguration")
  if (value.kind === "approval") return t("orchestra.actions.reviewDeployment")
  if (value.kind === "review-source") return t("orchestra.actions.reviewSource")
  return t("orchestra.actions.projectSettings")
}

export function sourceAction(t: ViewProps["t"], value: Dialog) {
  if (value.kind === "create-workflow") return t("orchestra.actions.create")
  if (value.kind === "approval") return t("orchestra.actions.confirm")
  if (value.kind === "review-source") return t("orchestra.actions.reviewSource")
  return t("orchestra.actions.save")
}

export function sourceAllowed(value: Dialog, view: ViewProps) {
  const bindingID = view.model.state.binding?.id
  if (!bindingID) return false
  const operations = value.kind === "approval" ? ["deployment.review"] : value.kind === "review-source" ? ["source.branch", "source.review", "source.write"] : value.kind === "project-settings" ? [] : ["source.write"]
  if (!operations.every((operation) => canRequest(view.model.state, operation))) return false
  if (value.kind === "approval") {
    const run = view.model.state.run.value
    return run !== undefined && run.id === value.runID && run.bindingID === bindingID
  }
  if (value.kind === "review-source") return canEditSource(view.model.state, view.model.state.source.status === "ready" ? view.model.state.source.value : undefined)
  if (value.kind === "project-settings") {
    const policy = policyResource(view.model.state.resources.value?.items, bindingID)
    return !policy?.inherited && !policy?.readOnly
  }
  return true
}

export function sourcePayload(value: Dialog, view: ViewProps, data: FormData) {
  const provider = view.model.state.binding?.provider.kind
  if (!provider) return { error: "invalid" as const }
  if (!sourceAllowed(value, view)) return { error: "invalid" as const }
  if (value.kind === "create-workflow") {
    const name = String(data.get("name") ?? "").trim()
    const path = String(data.get("path") ?? "").trim()
    if (!name || !path) return { error: "required" as const }
    if (!sourceProposalPath(provider, path)) return { error: "invalid" as const }
    const template = templateValue(data.get("template"))
    return { payload: { provider, name, path, template, content: workflowTemplate(provider, template, name) } }
  }
  if (value.kind === "approval") {
    const run = view.model.state.run.value
    if (!run || run.bindingID !== view.model.state.binding?.id || run.id !== value.runID) return { error: "invalid" as const }
    const decision = data.get("decision") === "reject" ? "reject" as const : "approve" as const
    const comment = String(data.get("comment") ?? "").trim()
    return comment ? { payload: { provider, decision, comment } } : { error: "required" as const }
  }
  if (value.kind === "review-source") {
    const branch = String(data.get("branch") ?? "").trim()
    const message = String(data.get("message") ?? "").trim()
    const title = String(data.get("title") ?? "").trim()
    if (!branch || !message || !title) return { error: "required" as const }
    return { payload: { provider, branch, message, title, content: view.model.state.draft } }
  }
  const bindingID = view.model.state.binding?.id
  const policy = policyResource(view.model.state.resources.value?.items, bindingID)
  if (policy?.inherited || policy?.readOnly || view.model.state.capabilities.value?.some((item) => item.operation === "resource.update" && item.state === "unavailable")) return { error: "invalid" as const }
  const retention = Number(data.get("retentionDays"))
  const execution = String(data.get("execution") ?? "")
  if (!execution) return { error: "required" as const }
  return Number.isInteger(retention) && retention >= 1 ? { payload: { provider, retentionDays: retention, execution } } : { error: "invalid" as const }
}

function RunContext(props: { value: Dialog; view: ViewProps }) {
  const value = props.value
  if (value.kind !== "approval") return null
  const run = () => {
    const bindingID = props.view.model.state.binding?.id
    const candidate = props.view.model.state.run.value
    return candidate && candidate.id === value.runID && candidate.bindingID === bindingID ? candidate : undefined
  }
  return <div class="ad-review-context"><dl class="wf-kv"><dt>{props.view.t("orchestra.actions.source")}</dt><dd dir="ltr"><bdi>{run()?.commit ?? props.view.t("orchestra.actions.unknown")}</bdi></dd><dt>{props.view.t("orchestra.actions.ref")}</dt><dd dir="ltr"><bdi>{run()?.ref ?? props.view.t("orchestra.actions.unknown")}</bdi></dd><dt>{props.view.t("orchestra.actions.actor")}</dt><dd><bdi>{run()?.actor ?? props.view.t("orchestra.actions.unknown")}</bdi></dd></dl></div>
}

function SourceContext(props: { view: ViewProps }) {
  const source = () => {
    const bindingID = props.view.model.state.binding?.id
    const candidate = props.view.model.state.draftBase ?? props.view.model.state.source.value
    return candidate?.bindingID === bindingID ? candidate : undefined
  }
  return <div class="ad-review-context">
    <p>{props.view.t(sourceDraftDirty(props.view.model.state) ? "orchestra.actions.sourceProposed" : "orchestra.actions.sourceSaved")}</p>
    <dl class="wf-kv"><dt>{props.view.t("orchestra.actions.path")}</dt><dd dir="ltr"><bdi>{source() ? props.view.model.state.route.path ?? props.view.model.state.source.value?.path : props.view.t("orchestra.actions.unknown")}</bdi></dd><dt>{props.view.t("orchestra.actions.sourceBase")}</dt><dd dir="ltr"><bdi>{source()?.ref ?? props.view.t("orchestra.actions.unknown")}</bdi></dd><dt>{props.view.t("orchestra.actions.commit")}</dt><dd><code dir="ltr">{source()?.commit ?? props.view.t("orchestra.actions.unknown")}</code></dd></dl>
  </div>
}

function templateValue(value: FormDataEntryValue | null): "build-test" | "release" | "blank" { return value === "release" || value === "blank" ? value : "build-test" }
function workflowTemplate(provider: Actions.ProviderKind, template: "build-test" | "release" | "blank", name: string) {
  const title = JSON.stringify(name)
  if (template === "blank") return provider === "github" ? `name: ${title}\n\non:\n  workflow_dispatch:\n` : `stages: []\n\n# ${title}\n`
  if (template === "release") return provider === "github" ? `name: ${title}\n\non:\n  push:\n    tags: ["v*"]\njobs:\n  release:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/checkout@v4\n      - uses: oven-sh/setup-bun@v2\n      - run: bun install --frozen-lockfile\n      - run: bun run build\n      - run: tar -czf artifact.tar.gz dist\n` : `stages: [release]\n\nrelease:\n  stage: release\n  script:\n    - bun install --frozen-lockfile\n    - bun run build\n    - tar -czf artifact.tar.gz dist\n  artifacts:\n    paths:\n      - artifact.tar.gz\n`
  return provider === "github" ? `name: ${title}\n\non: [push, workflow_dispatch]\njobs:\n  build:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/checkout@v4\n      - uses: oven-sh/setup-bun@v2\n      - run: bun install --frozen-lockfile\n      - run: bun run build\n      - run: bun test\n` : `stages: [build]\n\nbuild:\n  stage: build\n  script:\n    - bun install --frozen-lockfile\n    - bun run build\n    - bun test\n`
}

export function policyResource(items: readonly Actions.Resource[] | undefined, bindingID: Actions.BindingID | undefined) {
  const item = items?.find((resource) => resource.kind === "policy" && resource.bindingID === bindingID)
  if (!item || !isRecord(item.data)) return undefined
  const policy = isRecord(item.data.policy) ? item.data.policy : item.data
  const retentionDays = typeof policy.retentionDays === "number" && Number.isInteger(policy.retentionDays) && policy.retentionDays > 0 ? policy.retentionDays : undefined
  const execution = typeof policy.execution === "string" ? policy.execution : undefined
  const inherited = item.data.inherited === true || item.data.readOnly === true || item.data.editable === false || policy.inherited === true || policy.readOnly === true || policy.editable === false || item.status === "inherited"
  const readOnly = item.data.readOnly === true || item.data.editable === false || policy.readOnly === true || policy.editable === false || item.status === "inherited"
  const scope = item.scope
  const owner = item.owner
  return retentionDays === undefined && execution === undefined && !scope && !owner && !inherited && !readOnly ? undefined : { retentionDays, execution, scope, owner, inherited, readOnly }
}
