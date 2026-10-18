export * as ActionsSchedules from "./schedules"

import { Actions } from "@orchestra/schema/actions"
import { Effect, Schema } from "effect"
import { ActionsContract } from "../contract"
import { GitHubNative } from "../github/native"
import { ActionsGitLabNative } from "../gitlab/native"
import { GitLabCommandInputs } from "../gitlab/commands/inputs"
import { GitLabCommandNative } from "../gitlab/commands/native"
import { ActionsResourceNative } from "./native"
import { ActionsScheduleYaml } from "./schedule-yaml"

const Value = Schema.Union([Schema.String, Schema.Number, Schema.Boolean, Schema.Array(Schema.Json)])
const Variable = Schema.Struct({ key: Schema.NonEmptyString, value: Schema.String,
  variable_type: Schema.optionalKey(Schema.Literals(["env_var", "file"])) })
const Form = Schema.Struct({ provider: Actions.ProviderKind, name: Schema.NonEmptyString, cron: Schema.NonEmptyString,
  zone: Schema.NonEmptyString, ref: Schema.NonEmptyString, input: Schema.optionalKey(Schema.String),
  inputMode: Schema.optionalKey(Schema.Literals(["input", "variable"])), inputs: Schema.optionalKey(Schema.Record(Schema.String, Value)),
  variables: Schema.optionalKey(Schema.Array(Variable)), enabled: Schema.optionalKey(Schema.Boolean) })
const Toggle = Schema.Struct({ provider: Schema.Literal("gitlab"), enabled: Schema.Boolean })
const Schedule = Schema.Struct({ id: ActionsGitLabNative.ID, description: Schema.String, ref: Schema.NonEmptyString,
  cron: Schema.NonEmptyString, cron_timezone: Schema.NonEmptyString, active: Schema.Boolean,
  updated_at: Schema.NonEmptyString, next_run_at: Schema.optionalKey(Schema.NullOr(Schema.String)),
  owner: Schema.Struct({ id: ActionsGitLabNative.ID, username: Schema.NonEmptyString }),
  variables: Schema.optionalKey(Schema.Array(Schema.Struct({ key: Schema.NonEmptyString, variable_type: Schema.Literals(["env_var", "file"]) }))),
  inputs: Schema.optionalKey(Schema.Array(Schema.Struct({ name: Schema.NonEmptyString, value: Value }))) })
const Workflow = Schema.Struct({ id: GitHubNative.ID, path: Schema.NonEmptyString, name: Schema.NonEmptyString, state: Schema.NonEmptyString })

export type Publish = (binding: Actions.Binding, intent: Actions.OperationIntent, source: Actions.Source, text: string) => Effect.Effect<ActionsContract.CommandResult, import("../error").ActionsError>
type Services = ActionsResourceNative.Services & { readonly publish?: Publish }

export function make(services: Services): ActionsContract.ResourceDomain {
  return {
    list: Effect.fn("ActionsSchedules.list")(function* (binding: Actions.Binding, input: Actions.ResourceListInput) {
      const frozen = yield* ActionsResourceNative.checked(binding, () => ActionsResourceNative.selection(binding, input, "schedules", ["resourceID", "cursor", "limit"]))
      const current = frozen.binding
      if (current.provider.kind === "github") return yield* githubList(services, current, frozen.input)
      yield* ActionsGitLabNative.make(services.transport).project(current)
      const selected = yield* ActionsResourceNative.checked(current, () => GitHubNative.selection(current, "gitlab.schedules", {}, frozen.input.cursor, frozen.input.limit))
      const root = `projects/${current.projectID}/pipeline_schedules`
      if (frozen.input.resourceID !== undefined) {
        const id = yield* ActionsResourceNative.checked(current, () => ActionsResourceNative.id(current, frozen.input.resourceID ?? ""))
        const response = yield* ActionsResourceNative.get(services, current, `${root}/${id}`)
        const native = yield* ActionsResourceNative.checked(current, () => ActionsResourceNative.decode(current, Schedule, response.data))
        if (String(native.id) !== id) return yield* ActionsResourceNative.error(current, "binding_stale", "Native schedule ID differs from the requested project schedule")
        return { items: [resource(current, native)], total: 1, capturedAt: Date.now() }
      }
      const response = yield* ActionsResourceNative.get(services, current, root, { page: selected.page, per_page: selected.per_page })
      return yield* ActionsResourceNative.checked(current, () => {
        const native = ActionsResourceNative.decode(current, Schema.Array(Schedule), response.data)
        return { items: native.map((item) => resource(current, item)), capturedAt: Date.now(), ...ActionsResourceNative.pagination(current, response, selected, native.length) }
      })
    }),
    perform: Effect.fn("ActionsSchedules.perform")(function* (binding: Actions.Binding, intent: Actions.OperationIntent, payload: ActionsContract.Json) {
      const frozen = yield* ActionsResourceNative.checked(binding, () => ActionsResourceNative.capture(binding, intent, payload, "schedules",
        ["resource.create", "resource.update", "resource.delete", "schedule.play", "schedule.takeOwnership"], ["workflowID"]))
      const current = frozen.binding
      const admitted = frozen.intent
      if (current.provider.kind === "github") return yield* githubEdit(services, current, admitted, frozen.payload)
      if (admitted.target.workflowID !== undefined && admitted.target.workflowID !== ActionsGitLabNative.workflowID(current))
        return yield* ActionsResourceNative.error(current, "invalid_input", "Schedule workflow does not identify the bound project CI configuration")
      const input = yield* ActionsResourceNative.checked(current, () => {
        const value = admitted.kind === "resource.create" ? ActionsResourceNative.input(current, Form, frozen.payload)
          : admitted.kind === "resource.update" ? ActionsResourceNative.input(current, Schema.Union([Form, Toggle]), frozen.payload)
            : ActionsResourceNative.input(current, ActionsResourceNative.ProviderOnly, frozen.payload)
        if (value.provider !== "gitlab") throw ActionsResourceNative.error(current, "invalid_input", "Schedule payload belongs to another provider")
        if (admitted.kind === "resource.create" && (admitted.target.resourceID !== undefined || admitted.expected?.resourceVersion !== undefined))
          throw ActionsResourceNative.error(current, "invalid_input", "New project schedules have no existing resource ID/version")
        if (admitted.kind !== "resource.create" && admitted.target.resourceID === undefined)
          throw ActionsResourceNative.error(current, "invalid_input", "Schedule mutation requires an admitted native schedule ID")
        if (Schema.is(Form)(value)) {
          if (value.ref !== admitted.target.ref)
            throw ActionsResourceNative.error(current, "invalid_input", "Schedule execute ref differs from admission")
          ActionsScheduleYaml.cron(current, value.cron)
          GitHubNative.ref(current, value.ref)
          if (value.zone.length > 255 || /[\x00-\x1f\x7f]/.test(value.zone))
            throw ActionsResourceNative.error(current, "invalid_input", "Schedule timezone must be a bounded native timezone name")
        }
        return value
      })
      const form = Schema.is(Form)(input) ? input : undefined
      const authority = yield* ActionsResourceNative.authority(services, current, admitted.kind === "schedule.takeOwnership" ? 40 : 30)
      const selectedSource = yield* ActionsResourceNative.source(services, current, admitted)
      const id = admitted.target.resourceID
      const native = id === undefined ? undefined : yield* getSchedule(services, current, id)
      if (native) yield* ActionsResourceNative.checked(current, () => {
        ActionsResourceNative.requireVersion(current, admitted, version(native))
        if (admitted.kind === "resource.update" && native.owner.username !== current.account)
          throw ActionsResourceNative.error(current, "permission_denied", "Schedule editing requires its current owner; take ownership before editing")
        if (admitted.kind === "resource.delete" && native.owner.username !== current.account && (authority.level ?? 0) < 40)
          throw ActionsResourceNative.error(current, "permission_denied", "Deleting another actor's schedule requires the native Maintainer role")
        if (!form && admitted.target.ref !== undefined && !sameRef(native.ref, admitted.target.ref))
          throw ActionsResourceNative.error(current, "source_conflict", "Native schedule ref differs from the admitted execution ref")
      })
      const overrides = form ? yield* ActionsResourceNative.checked(current, () => formOverrides(current, form)) : undefined
      if (overrides?.variables?.length) yield* ActionsResourceNative.checked(current, () => {
        if (!authority.project) throw ActionsResourceNative.error(current, "capability_unavailable", "Schedule variable policy was not observed")
        GitLabCommandNative.variables(current, authority.project, authority.level ?? 0, true)
      })
      if (overrides?.inputs !== undefined) {
        const observation = yield* ActionsResourceNative.before(current, ActionsGitLabNative.make(services.transport).metadata(current))
        yield* ActionsResourceNative.checked(current, () => ActionsGitLabNative.requireVersion(current, observation, [18, 1], "schedule inputs"))
        const project = yield* ActionsResourceNative.before(current, ActionsGitLabNative.make(services.transport).project(current))
        const path = ActionsGitLabNative.configPath(project)
        if (!path || !ActionsGitLabNative.localPath(path)) return yield* ActionsResourceNative.error(current, "source_unresolved", "Schedule inputs require an authoritative local CI spec header")
        if (!selectedSource || admitted.target.path !== undefined && admitted.target.path !== path)
          return yield* ActionsResourceNative.error(current, "source_unresolved", "Schedule inputs require the captured native CI path/ref/commit")
        const source = yield* ActionsResourceNative.before(current, services.reader.source(current, { path, ref: selectedSource.commit }))
        if (source.bindingID !== current.id || source.path !== path || source.ref !== selectedSource.commit || source.commit !== selectedSource.commit)
          return yield* ActionsResourceNative.error(current, "source_unresolved", "Schedule input declarations were not proved at the admitted source ref")
        yield* ActionsResourceNative.before(current, GitLabCommandInputs.check(current, services.transport, source, overrides.inputs))
      }
      const path = `${authority.root}/pipeline_schedules${id === undefined ? "" : `/${id}`}`
      if (admitted.kind === "schedule.play") {
        const response = yield* ActionsResourceNative.send(services, current, { method: "POST", path: `${path}/play` }, [201])
        yield* ActionsResourceNative.after(current, ActionsResourceNative.checked(current, () => {
          const data = ActionsResourceNative.decode(current, Schema.Struct({ message: Schema.Literal("201 Created") }), response.data, true)
          return data
        }))
        return { acknowledgement: { resourceID: id, unattributed: true } }
      }
      if (admitted.kind === "schedule.takeOwnership") {
        const response = yield* ActionsResourceNative.send(services, current, { method: "POST", path: `${path}/take_ownership` }, [201, 200])
        return yield* ActionsResourceNative.after(current, ActionsResourceNative.checked(current, () => {
          const data = ActionsResourceNative.decode(current, Schedule, response.data, true)
          if (String(data.id) !== id || data.owner.username !== current.account)
            throw ActionsResourceNative.error(current, "outcome_unknown", "Schedule ownership response did not prove the current actor", "unknown")
          return { acknowledgement: { resourceID: String(data.id) } }
        }))
      }
      if (admitted.kind === "resource.delete") {
        yield* ActionsResourceNative.send(services, current, { method: "DELETE", path }, [204])
        return { acknowledgement: { resourceID: id } }
      }
      if (overrides?.inputs !== undefined && native && native.inputs === undefined)
        return yield* ActionsResourceNative.error(current, "capability_unavailable", "Existing schedule input names were not observed; replacement cannot be planned safely")
      const body: ActionsContract.Json | undefined = form ? { description: form.name, cron: form.cron, cron_timezone: form.zone, ref: form.ref,
        ...(form.enabled === undefined ? {} : { active: form.enabled }), ...(overrides?.inputs === undefined ? {} : { inputs: [
          ...Object.entries(overrides.inputs).map(([name, value]) => ({ name, value })),
          ...(native?.inputs ?? []).filter((item) => !Object.hasOwn(overrides.inputs ?? {}, item.name)).map((item) => ({ name: item.name, destroy: true })),
        ] }) }
        : Schema.is(Toggle)(input) ? { active: input.enabled } : undefined
      if (!body) return yield* ActionsResourceNative.error(current, "invalid_input", "Schedule command requires its exact native form")
      if (overrides?.variables && native && native.variables === undefined)
        return yield* ActionsResourceNative.error(current, "capability_unavailable", "Existing schedule variable keys/types were not observed; variable edits cannot be planned safely")
      const response = yield* ActionsResourceNative.send(services, current, { method: id === undefined ? "POST" : "PUT", path, body }, id === undefined ? [201] : [200])
      const written = yield* ActionsResourceNative.after(current, ActionsResourceNative.checked(current, () => {
        const data = ActionsResourceNative.decode(current, Schedule, response.data, true)
        if (id !== undefined && String(data.id) !== id || form &&
          (data.description !== form.name || data.cron !== form.cron || data.cron_timezone !== form.zone || !sameRef(data.ref, form.ref)) ||
          Schema.is(Toggle)(input) && data.active !== input.enabled)
          throw ActionsResourceNative.error(current, "outcome_unknown", "Native schedule did not acknowledge the requested form fields", "unknown")
        if (id === undefined && data.owner.username !== current.account)
          throw ActionsResourceNative.error(current, "outcome_unknown", "New schedule response did not prove current actor ownership", "unknown")
        return data
      }))
      if (overrides?.inputs !== undefined) {
        const observed = written.inputs === undefined ? yield* ActionsResourceNative.after(current, getSchedule(services, current, String(written.id))) : written
        yield* ActionsResourceNative.after(current, ActionsResourceNative.checked(current, () => {
          if (observed.inputs === undefined || !Schema.toEquivalence(Schema.Json)(Object.fromEntries(observed.inputs.map((item) => [item.name, item.value])), overrides.inputs ?? {}))
            throw ActionsResourceNative.error(current, "outcome_unknown", "Native schedule did not acknowledge the requested input values", "unknown")
        }))
      }
      // Variable endpoints are separate writes. Once the schedule write succeeds,
      // any later failure is partial/unknown; never roll back or automatically retry.
      if (overrides?.variables) yield* ActionsResourceNative.after(current, Effect.forEach(overrides.variables, (variable) => Effect.gen(function* () {
        const exists = native?.variables?.some((item) => item.key === variable.key) ?? false
        const variableResponse = yield* ActionsResourceNative.send(services, current, { method: exists ? "PUT" : "POST",
          path: `${authority.root}/pipeline_schedules/${written.id}/variables${exists ? `/${encodeURIComponent(variable.key)}` : ""}`, body: variable }, exists ? [200] : [201])
        yield* ActionsResourceNative.checked(current, () => {
          const data = ActionsResourceNative.decode(current, Variable, variableResponse.data, true)
          if (data.key !== variable.key || data.value !== variable.value || data.variable_type !== (variable.variable_type ?? "env_var"))
            throw ActionsResourceNative.error(current, "outcome_unknown", "Schedule variable response did not acknowledge its exact native key/type/value", "unknown")
        })
      }), { concurrency: 1 }))
      if (overrides?.variables && native?.variables) yield* ActionsResourceNative.after(current, Effect.forEach(
        native.variables.filter((item) => !overrides.variables?.some((variable) => variable.key === item.key)),
        (variable) => Effect.gen(function* () {
          const response = yield* ActionsResourceNative.send(services, current, { method: "DELETE",
            path: `${authority.root}/pipeline_schedules/${written.id}/variables/${encodeURIComponent(variable.key)}` }, [202])
          yield* ActionsResourceNative.checked(current, () => {
            const deleted = ActionsResourceNative.decode(current, Schema.Struct({ key: Schema.NonEmptyString, variable_type: Schema.Literals(["env_var", "file"]) }), response.data, true)
            if (deleted.key !== variable.key || deleted.variable_type !== variable.variable_type)
              throw ActionsResourceNative.error(current, "outcome_unknown", "Schedule variable deletion did not acknowledge its exact native key/type", "unknown")
          })
        }), { concurrency: 1 },
      ))
      return { acknowledgement: { resourceID: String(written.id) } }
    }),
  }
}

function formOverrides(binding: Actions.Binding, input: typeof Form.Type) {
  if ([input.input !== undefined, input.inputs !== undefined, input.variables !== undefined].filter(Boolean).length > 1)
    throw ActionsResourceNative.error(binding, "invalid_input", "Schedule overrides require one unambiguous input/variable representation")
  if (input.inputMode !== undefined && input.input === undefined)
    throw ActionsResourceNative.error(binding, "invalid_input", "Schedule inputMode requires the mock input field")
  const pair = input.input ? /^([A-Za-z_][A-Za-z0-9_]{0,254})=([\s\S]*)$/.exec(input.input) : undefined
  if (input.input && !pair) throw ActionsResourceNative.error(binding, "invalid_input", "Schedule input field requires one exact key=value pair")
  const inputs = input.inputs ?? (input.input !== undefined && input.inputMode === "input" ? pair ? { [pair[1]]: pair[2] } : {} : undefined)
  const variables = input.variables ?? (input.input !== undefined && input.inputMode !== "input" ? pair ? [{ key: pair[1], value: pair[2], variable_type: "env_var" as const }] : [] : undefined)
  if (variables && (new Set(variables.map((item) => item.key)).size !== variables.length || variables.some((item) => !/^[A-Za-z0-9_]{1,255}$/.test(item.key))))
    throw ActionsResourceNative.error(binding, "invalid_input", "Schedule variables require unique bounded native keys")
  if (variables && variables.length > 100 || inputs && Object.keys(inputs).length > 100 || input.input !== undefined && input.input.length > 1024 * 1024)
    throw ActionsResourceNative.error(binding, "invalid_input", "Schedule override configuration exceeds the bounded resource edit limit")
  return { inputs, variables }
}

function sameRef(native: string, selected: string) {
  return native === selected || !selected.startsWith("refs/") && (native === `refs/heads/${selected}` || native === `refs/tags/${selected}`)
}

function version(native: typeof Schedule.Type) {
  return ActionsResourceNative.version({ id: String(native.id), name: native.description, ref: native.ref,
    cron: native.cron, zone: native.cron_timezone, enabled: native.active, ownerID: String(native.owner.id), updatedAt: native.updated_at })
}

function resource(binding: Actions.Binding, native: typeof Schedule.Type): Actions.Resource {
  return { id: String(native.id), bindingID: binding.id, kind: "schedules", name: native.description, scope: ActionsResourceNative.scope(binding), owner: native.owner.username,
    status: native.active ? "Active" : "Paused", data: { nativeID: String(native.id), cron: native.cron, zone: native.cron_timezone, ref: native.ref,
      enabled: native.active, actor: native.owner.username, ownerID: String(native.owner.id), currentActor: binding.account ?? null,
      ownedByCurrentActor: native.owner.username === binding.account, editable: native.owner.username === binding.account,
      nextRunAt: native.next_run_at ?? null, resourceVersion: version(native), inputValuesRedacted: true,
      inputNames: native.inputs?.map((item) => item.name) ?? [], variableKeys: native.variables?.map((item) => ({ key: item.key, type: item.variable_type })) ?? [] } }
}

const getSchedule = Effect.fn("ActionsSchedules.get")(function* (services: Services, binding: Actions.Binding, id: string) {
  yield* ActionsResourceNative.checked(binding, () => ActionsResourceNative.id(binding, id))
  const response = yield* ActionsResourceNative.get(services, binding, `projects/${binding.projectID}/pipeline_schedules/${id}`)
  const native = yield* ActionsResourceNative.checked(binding, () => ActionsResourceNative.decode(binding, Schedule, response.data))
  if (String(native.id) !== id) return yield* ActionsResourceNative.error(binding, "binding_stale", "Native project schedule ID differs from admission")
  return native
})

const githubList = Effect.fn("ActionsSchedules.githubList")(function* (services: Services, binding: Actions.Binding, input: Actions.ResourceListInput) {
  const repo = yield* GitHubNative.repository(services.transport, binding)
  if (!repo.native.default_branch) return yield* ActionsResourceNative.error(binding, "source_unresolved", "GitHub schedule listing requires the observed native default branch")
  const response = yield* ActionsResourceNative.get(services, binding, `${repo.path}/commits/${encodeURIComponent(repo.native.default_branch)}`)
  const commit = yield* ActionsResourceNative.checked(binding, () => ActionsResourceNative.decode(binding, Schema.Struct({ sha: GitHubNative.SHA }), response.data).sha)
  const page = yield* ActionsResourceNative.before(binding, services.reader.workflows(binding, { ...(input.cursor === undefined ? {} : { cursor: input.cursor }), limit: input.limit ?? 20 }))
  // The native list keeps workflows whose file left the default branch (deleted
  // or branch-only) and GitHub-managed `dynamic/...` workflows. Neither has a
  // default-branch YAML schedule and reading their source fails, so only files
  // present in `.github/workflows` at the default-branch commit are read.
  const listing = yield* ActionsResourceNative.get(services, binding, `${repo.path}/contents/.github/workflows`, { ref: commit }).pipe(
    Effect.catch((error) => error.kind === "not_found" ? Effect.succeed(undefined) : Effect.fail(error)))
  const files = listing === undefined ? new Set<string>() : yield* ActionsResourceNative.checked(binding, () => new Set(ActionsResourceNative
    .decode(binding, Schema.Array(Schema.Struct({ type: Schema.String, path: Schema.String })), listing.data)
    .filter((entry) => entry.type === "file").map((entry) => entry.path)))
  const selected = page.items.filter((workflow) => (input.resourceID === undefined || workflow.id === input.resourceID) && files.has(workflow.path))
  // One unreadable workflow must not hide the schedules of the others: it is
  // reported as its own item carrying the failure kind instead of failing the page.
  const items = yield* Effect.forEach(selected, (workflow) => Effect.gen(function* () {
    if (workflow.bindingID !== binding.id || !/^\.github\/workflows\/[^/]+\.ya?ml$/.test(workflow.path))
      return yield* ActionsResourceNative.error(binding, "source_unresolved", "Native schedule workflow path/ownership was not proved")
    const source = yield* ActionsResourceNative.before(binding, services.reader.source(binding, { path: workflow.path, ref: commit }))
    if (source.bindingID !== binding.id || source.path !== workflow.path || source.ref !== commit || source.commit !== commit)
      return yield* ActionsResourceNative.error(binding, "source_unresolved", "Workflow schedule source did not prove the native default-branch commit")
    const schedules = yield* ActionsResourceNative.checked(binding, () => ActionsScheduleYaml.inspect(binding, source.text))
    if (!schedules.length) return undefined
    return { id: workflow.id, bindingID: binding.id, kind: "schedules" as const, name: workflow.name ?? workflow.path,
      scope: ActionsResourceNative.scope(binding), status: workflow.state === "active" ? "Active" : workflow.state,
      data: { nativeID: workflow.id, workflowID: workflow.id, path: workflow.path, sourceVersion: source.version, commit,
        resourceVersion: ActionsResourceNative.version({ workflowID: workflow.id, sourceVersion: source.version, state: workflow.state }),
        cron: schedules.map((item) => item.cron).join(" · "), schedules, zone: "UTC", ref: repo.native.default_branch ?? "",
        enabled: workflow.state === "active", origin: "Workflow YAML", editMode: "source", bestEffort: true } }
  }).pipe(Effect.catch((error) => Effect.succeed({ id: workflow.id, bindingID: binding.id, kind: "schedules" as const, name: workflow.name ?? workflow.path,
    scope: ActionsResourceNative.scope(binding), status: "Unreadable",
    data: { nativeID: workflow.id, workflowID: workflow.id, path: workflow.path, commit, ref: repo.native.default_branch ?? "", zone: "UTC", enabled: false,
      origin: "Workflow YAML", editMode: "source", bestEffort: true, unreadable: true, problem: error.message, problemKind: error.kind } }))),
  { concurrency: 4 })
  // Cursor advances native workflows, including workflows with no schedules;
  // native workflow totals are not misrepresented as schedule totals.
  return { items: items.filter((item) => item !== undefined), capturedAt: Date.now(), ...(page.next === undefined ? {} : { next: page.next }) }
})

const githubEdit = Effect.fn("ActionsSchedules.githubEdit")(function* (services: Services, binding: Actions.Binding, intent: Actions.OperationIntent, payload: ActionsContract.Json) {
  if (!["resource.create", "resource.update", "resource.delete"].includes(intent.kind))
    return yield* ActionsResourceNative.error(binding, "capability_unavailable", "GitHub schedules are workflow YAML; play/ownership controls have no native schedule API")
  const input = yield* ActionsResourceNative.checked(binding, () => intent.kind === "resource.delete"
    ? ActionsResourceNative.input(binding, ActionsResourceNative.ProviderOnly, payload) : ActionsResourceNative.input(binding, Form, payload))
  if (input.provider !== "github") return yield* ActionsResourceNative.error(binding, "invalid_input", "Schedule payload belongs to another provider")
  if (!services.publish) return yield* ActionsResourceNative.error(binding, "capability_unavailable", "GitHub schedule changes require the owning SourcePublisher callback; open Edit YAML")
  const workflowID = yield* ActionsResourceNative.checked(binding, () => ActionsResourceNative.id(binding, intent.target.workflowID ?? intent.target.resourceID ?? ""))
  if (intent.target.resourceID !== undefined && intent.target.resourceID !== workflowID)
    return yield* ActionsResourceNative.error(binding, "invalid_input", "Schedule workflow and resource target identities differ")
  const authority = yield* ActionsResourceNative.authority(services, binding)
  const scopes = authority.headers["x-oauth-scopes"]?.split(",").map((scope) => scope.trim()).filter(Boolean)
  if (scopes?.length && !scopes.includes("workflow"))
    return yield* ActionsResourceNative.error(binding, "permission_denied", "Observed classic OAuth scopes deny publishing workflow-source changes")
  const repo = yield* GitHubNative.repository(services.transport, binding)
  if (!repo.native.default_branch || intent.target.ref !== repo.native.default_branch || !intent.expected?.sourceVersion || !intent.expected.commit)
    return yield* ActionsResourceNative.error(binding, "invalid_input", "GitHub schedule authoring requires captured default-branch ref, sourceVersion and commit")
  const response = yield* ActionsResourceNative.get(services, binding, `${repo.path}/actions/workflows/${workflowID}`)
  const workflow = yield* ActionsResourceNative.checked(binding, () => ActionsResourceNative.decode(binding, Workflow, response.data))
  if (String(workflow.id) !== workflowID || workflow.path !== intent.target.path || !/^\.github\/workflows\/[^/]+\.ya?ml$/.test(workflow.path))
    return yield* ActionsResourceNative.error(binding, "source_conflict", "Captured schedule source path differs from the exact native workflow")
  const source = yield* ActionsResourceNative.before(binding, services.reader.source(binding, { path: workflow.path, ref: intent.target.ref }))
  if (source.bindingID !== binding.id || source.path !== workflow.path || source.ref !== intent.target.ref || source.version !== intent.expected.sourceVersion || source.commit !== intent.expected.commit)
    return yield* ActionsResourceNative.error(binding, "source_conflict", "Workflow schedule source moved after admission")
  const text = yield* ActionsResourceNative.checked(binding, () => {
    ActionsResourceNative.requireVersion(binding, intent, ActionsResourceNative.version({ workflowID, sourceVersion: source.version, state: workflow.state }))
    const existing = ActionsScheduleYaml.inspect(binding, source.text)
    if (intent.kind === "resource.delete") return ActionsScheduleYaml.edit(binding, source.text, [])
    if (!Schema.is(Form)(input)) throw ActionsResourceNative.error(binding, "invalid_input", "Schedule command requires its exact native form")
    if (input.name !== workflow.name || input.zone !== "UTC" || input.ref !== intent.target.ref || input.input || input.inputs !== undefined || input.variables !== undefined || input.inputMode !== undefined || input.enabled !== undefined)
      throw ActionsResourceNative.error(binding, "capability_unavailable", "GitHub cron triggers have no separate name, execution inputs, timezone or pause state; edit workflow YAML explicitly")
    if (intent.kind === "resource.update" && existing.length !== 1)
      throw ActionsResourceNative.error(binding, "invalid_input", "Multiple workflow cron entries require an explicit source-editor edit")
    if (intent.kind === "resource.create" && existing.length)
      throw ActionsResourceNative.error(binding, "source_conflict", "Workflow already contains schedules; edit its existing YAML")
    return ActionsScheduleYaml.edit(binding, source.text, [{ cron: input.cron }])
  })
  return yield* services.publish(binding, intent, source, text)
})
