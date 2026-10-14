import { Actions } from "@orchestra/schema/actions"
import { Schema } from "effect"
import { actionsError, ActionsRequestError, CreateWorkflowForm, decodeAction, requestError, ResourceForms, ReviewSourceForm, type ActionsCommand, type ActionsScope, type createActionsAPI, type ResourceAction } from "./api"
import type { Dialog, ErrorState, State } from "./contract"
import { canEditSource, immutableSource, sourceIdentity, type createRequestOwner, type createSourceDraft } from "./requests"
import { canRequest } from "./request-policy"
import { canRequestAction, resourceWritable } from "./action-eligibility"
import { readProposalSource } from "./proposal-source"

type Phase = { clientID: string; operationID?: Actions.OperationID; kind: Actions.OperationKind }
export type ActionsPending = { clientID: string; binding: Actions.BindingRef; operationID?: Actions.OperationID; intent?: Actions.OperationIntent; phases?: readonly Phase[] }
type Lease = ActionsPending & { scope: ActionsScope; command?: ActionsCommand; operation?: Actions.Operation; failure?: ErrorState; uncertain: boolean; restored?: boolean; sent?: boolean }
type Selection = ReturnType<typeof selection>
type Review = { base: Actions.SourceBase; source?: Actions.Source; path: string; create: boolean;
  form: { branch: string; message: string; title: string; text: string }; step: number; phases: Phase[]; clients: string[];
  branched?: Actions.SourceBase; written?: Actions.Source }

export function createActionsCommands(input: {
  api: ReturnType<typeof createActionsAPI>; owner: ReturnType<typeof createRequestOwner>; state: () => State
  update: (patch: Partial<State>) => void; editor?: ReturnType<typeof createSourceDraft>
  pending?: ActionsPending; remember?: (pending?: ActionsPending) => void
}) {
  let selected: Selection | undefined
  let review: Review | undefined
  let lease: Lease | undefined = input.pending ? { ...input.pending, scope: { bindingID: input.pending.binding.id, revision: input.pending.binding.revision }, uncertain: true, restored: true } : undefined
  const error = (cause: unknown) => input.update({ commandError: actionsError(cause) })
  const admissionError = () => new ActionsRequestError(input.state().commandError?.kind === "outcome_unknown"
    || input.state().operation?.state === "outcome_unknown" || input.state().operation?.state === "sending" ? "outcome_unknown" : "capability_unavailable")
  if (lease) error(new ActionsRequestError("outcome_unknown"))
  const remember = (active?: Lease) => input.remember?.(active ? { clientID: active.clientID, binding: active.binding,
    operationID: active.operationID, intent: active.intent, ...(active.phases?.length ? { phases: active.phases.slice(-3) } : {}) } : undefined)
  const matches = (captured: Selection) => !!input.state().binding
    && (captured.dialog.kind !== "review-source" || input.state().dialog?.kind === "review-source")
    && JSON.stringify(selection(input.state(), captured.dialog, captured.operation)) === JSON.stringify(captured)
  const receive = (operation: Actions.Operation, active: Lease, read = false) => {
    if (operation.bindingID !== active.scope.bindingID || operation.clientID !== active.clientID || (active.operationID && operation.id !== active.operationID)
      || (active.intent && (operation.kind !== active.intent.kind || JSON.stringify(decodeAction(Actions.OperationTarget, operation.target)) !== JSON.stringify(decodeAction(Actions.OperationTarget, active.intent.target)))))
      throw new ActionsRequestError("invalid_response")
    if (!read) input.owner.cancel("receipt")
    active.operationID = operation.id
    active.operation = { ...operation, reason: undefined }
    active.uncertain = ambiguous(operation, active)
    remember(review || active.intent?.kind === "source.branch" || active.intent?.kind === "source.write" || active.uncertain || operation.state === "prepared" ? active : undefined)
    input.update({ operation: active.operation })
  }
  const refreshReceipt = (recover = false) => {
    const active = lease
    if (!active || input.owner.disposed || (!active.operationID && (!recover || !active.intent))) return Promise.resolve()
    return input.owner.run("receipt", active.clientID, async (handle) => {
      const operation = active.operationID ? await input.api.receipt(active.scope, active.operationID, handle.signal)
        : await input.api.prepare(active.scope, decodeAction(Actions.OperationIntent, active.intent), handle.signal)
      if (!handle.current() || lease !== active) return
      receive(operation, active, true)
      input.update({ commandError: operationFailure(operation, active.failure) ?? (active.uncertain ? actionsError(new ActionsRequestError("outcome_unknown"))
        : operation.state === "prepared" && input.state().commandError?.kind !== "outcome_unknown" ? input.state().commandError : undefined) })
    }, (cause) => error(active.uncertain ? new ActionsRequestError("outcome_unknown") : cause), true)
  }
  const perform = async (command: ActionsCommand, captured: Selection, handle: { signal: AbortSignal; current: () => boolean }, reuse = false, initialID?: string) => {
    const previous = lease
    const clientID = reuse && previous ? previous.clientID : initialID ?? crypto.randomUUID()
    const binding = { id: captured.scope.bindingID, revision: captured.scope.revision }
    const active: Lease = reuse && previous ? previous : { clientID, binding, scope: captured.scope,
      intent: immutable({ clientID, binding, kind: command.kind, target: command.target, expected: command.expected }), command: immutable(command), uncertain: false,
      phases: review?.phases.slice(-3) }
    lease = active
    remember(active)
    let sending = false
    try {
      if (!matches(captured)) throw new ActionsRequestError("binding_stale")
      if (!canRequestAction(input.state(), command, handle)) throw admissionError()
      const prepared = active.operation ?? await input.api.prepare(active.scope, decodeAction(Actions.OperationIntent, active.intent), handle.signal)
      if (!handle.current()) return
      receive(prepared, active)
      if (known(prepared)) return prepared
      const preparationFailure = operationFailure(prepared, active.failure)
      if (preparationFailure) { input.update({ commandError: preparationFailure }); return }
      if (prepared.state !== "prepared" || active.restored || active.sent || !active.command) { active.uncertain = true; error(new ActionsRequestError("outcome_unknown")); return }
      if (!matches(captured)) throw new ActionsRequestError("binding_stale")
      if (!canRequestAction(input.state(), command, handle)) throw admissionError()
      active.failure = undefined
      sending = true
      // A late prepared receipt cannot authorize another send after a lost execution response.
      active.sent = true
      const execution = await input.api.execute(active.scope, prepared.id, active.command, handle.signal)
      if (!handle.current()) return
      const operation = execution.operation
      receive(operation, active)
      const executionFailure = operationFailure(operation, active.failure)
      if (executionFailure) { input.update({ commandError: executionFailure }); return }
      if (!known(operation)) { active.uncertain = true; remember(active); error(new ActionsRequestError("outcome_unknown")); return }
      if (command.kind === "source.review" && execution.output && (execution.output.kind !== "sourceReview"
        || execution.output.id !== operation.result?.resourceID)) throw new ActionsRequestError("outcome_unknown")
      if (execution.output && matches(captured)) input.update({ commandOutput: execution.output })
      return operation
    } catch (cause) {
      if (!handle.current()) return
      const safe = requestError(cause)
      active.operationID ??= safe.operationID
      active.uncertain = safe.kind === "outcome_unknown" || safe.disposition === "unknown" || (safe.disposition === undefined && ["transport_failed", "invalid_response"].includes(safe.kind))
      active.failure = active.uncertain ? undefined : actionsError(safe)
      remember(active.uncertain || active.operationID || review ? active : undefined)
      error(active.uncertain ? new ActionsRequestError("outcome_unknown") : safe)
      if (active.operationID && sending) await refreshReceipt()
    }
  }
  const start = (work: (handle: { signal: AbortSignal; current: () => boolean }, clientID: string) => Promise<void>, clientID: string = crypto.randomUUID()) => {
    input.update({ submitting: true, commandError: undefined, commandOutput: undefined })
    return input.owner.run("command", clientID, async (handle) => {
      try { await work(handle, clientID) } finally { if (handle.current()) input.update({ submitting: false }) }
    }, (cause) => { input.update({ submitting: false }); error(cause) }, true)
  }
  const submit = (payload: unknown) => {
    if (input.owner.disposed || input.state().submitting) return Promise.resolve()
    if (lease?.uncertain) return refreshReceipt()
    const captured = selected
    if (!captured?.valid || !matches(captured)) { error(new ActionsRequestError("binding_stale")); return Promise.resolve() }
    try {
      if (captured.dialog.kind === "create-workflow") {
        const form = decodeAction(CreateWorkflowForm, payload)
        if (form.provider && form.provider !== captured.provider) throw new ActionsRequestError("invalid_input")
        if (!input.editor) throw new ActionsRequestError("source_unresolved")
        return input.editor.create(form.path, form.ref ?? captured.route.ref, form.content ?? form.text ?? template(captured.provider, form.name, form.template))
      }
      if (captured.dialog.kind === "review-source") {
        const form = decodeAction(ReviewSourceForm, payload)
        const created = input.editor?.created
        const source = created ? undefined : input.editor?.base ?? input.state().source.value
        const baseline = created ? input.state().draftBase : source && { bindingID: source.bindingID, ref: source.ref, commit: source.commit }
        if (!baseline?.commit || baseline.bindingID !== captured.scope.bindingID || immutableSource(input.state(), baseline)
          || (created ? created.path !== captured.route.path || created.ref !== baseline.ref || input.state().source.status !== "idle"
            : !source || source.version.startsWith("draft:")) || !canEditSource(input.state(), source)) throw new ActionsRequestError("source_unresolved")
        const base = decodeAction(Actions.SourceBase, baseline)
        if (!["source.branch", "source.write", "source.review"].every((kind) => canRequest(input.state(), kind))) throw new ActionsRequestError("capability_unavailable")
        if (form.provider && form.provider !== captured.provider || form.branch === base.ref || immutableSource(input.state(), { ref: form.branch })) throw new ActionsRequestError("invalid_input")
        const text = form.content ?? form.text ?? input.state().draft
        const values = { branch: form.branch, message: form.message, title: form.title, text }
        if (text !== input.state().draft) throw new ActionsRequestError("source_conflict")
        if (review && JSON.stringify(review.form) !== JSON.stringify(values)) throw new ActionsRequestError("intent_conflict")
        if (!review && lease?.restored && (lease.phases?.length || lease.intent?.kind.startsWith("source."))) throw new ActionsRequestError("outcome_unknown")
        review ??= { base, source: source && decodeAction(Actions.Source, source), path: created?.path ?? source?.path ?? "",
          create: !!created, form: values, step: 0, phases: [], clients: [crypto.randomUUID(), crypto.randomUUID(), crypto.randomUUID()] }
        const plan = review
        return start(async (handle) => {
          while (plan.step < 3 && handle.current()) {
            if (review !== plan || !matches(captured)) throw new ActionsRequestError("binding_stale")
            const scope = captured.scope
            if (plan.step === 1 && !plan.branched || plan.step === 2 && !plan.written) throw new ActionsRequestError("source_unresolved")
            const target = plan.step === 0 ? { path: plan.path, ref: plan.base.ref, resourceID: plan.form.branch }
              : { path: plan.path, ref: plan.form.branch, ...(plan.step === 2 ? { resourceID: plan.base.ref } : {}) }
            const command: ActionsCommand = plan.step === 0 ? { kind: "source.branch", target, expected: { commit: plan.base.commit, ...(plan.source ? { sourceVersion: plan.source.version } : {}) },
              input: { provider: captured.provider, branch: plan.form.branch } }
              : plan.step === 1 ? { kind: "source.write", target, expected: { commit: plan.branched?.commit, ...(plan.source ? { sourceVersion: plan.source.version } : {}) },
                input: { provider: captured.provider, text: plan.form.text, message: plan.form.message, mode: plan.create ? "create" : "update" } }
              : { kind: "source.review", target, expected: { commit: plan.written?.commit, sourceVersion: plan.written?.version },
                input: { provider: captured.provider, title: plan.form.title, text: plan.form.message } }
            const reuse = lease?.clientID === plan.clients[plan.step]
            const operation = await perform(command, captured, handle, reuse, plan.clients[plan.step])
            if (!handle.current() || review !== plan || !matches(captured) || !operation || !known(operation)) return
            // ACKs and readbacks are independent; receipt callbacks never advance this plan.
            if (operation.result?.unattributed || !operation.result?.resourceID || (plan.step === 0 && operation.result.resourceID !== plan.form.branch)) {
              if (lease) { lease.uncertain = true; remember(lease) }
              error(new ActionsRequestError("outcome_unknown")); return
            }
            if (plan.step === 0) {
              const observed = decodeAction(Actions.SourceBase, await input.api.sourceBase(scope, plan.form.branch, handle.signal))
              if (!handle.current() || review !== plan || !matches(captured)) return
              if (observed.bindingID !== scope.bindingID || observed.ref !== plan.form.branch || observed.commit !== plan.base.commit)
                throw new ActionsRequestError("source_conflict")
              if (plan.source) {
                 const native = await readProposalSource(input.api, scope, captured.provider, { path: plan.path, ref: plan.form.branch }, handle.signal)
                if (!handle.current() || review !== plan || !matches(captured)) return
                if (sourceIdentity(native) !== sourceIdentity({ ...plan.source, ref: plan.form.branch }) || native.text !== plan.source.text)
                  throw new ActionsRequestError("source_conflict")
              }
              plan.branched = observed
            }
            if (plan.step === 1) {
               const observed = await readProposalSource(input.api, scope, captured.provider, { path: plan.path, ref: plan.form.branch }, handle.signal)
              if (!handle.current() || review !== plan || !matches(captured)) return
              if (observed.bindingID !== scope.bindingID || observed.ref !== plan.form.branch || observed.path !== plan.path
                || observed.text !== plan.form.text || !observed.commit || observed.commit === plan.branched?.commit
                || observed.version.startsWith("draft:") || operation.result.resourceID !== observed.commit) throw new ActionsRequestError("source_conflict")
              plan.written = decodeAction(Actions.Source, observed)
            }
            plan.phases.push({ clientID: operation.clientID, operationID: operation.id, kind: operation.kind })
            plan.step++
            if (lease) { lease.phases = plan.phases.slice(-3); remember(lease) }
          }
          if (handle.current() && review === plan && matches(captured) && plan.step === 3 && plan.written) {
            input.editor?.published(plan.written)
            review = undefined
            remember()
            input.update({ dialog: undefined, commandError: undefined })
            selected = undefined
          }
        }, plan.clients[plan.step])
      }
      if (lease?.restored && lease.phases?.length) throw new ActionsRequestError("outcome_unknown")
      const command = resolve(captured, payload)
      if (!canRequestAction(input.state(), command)) throw admissionError()
      const prepared = lease?.operation?.state === "prepared" ? lease.command : undefined
      if (prepared && (JSON.stringify(prepared.target) !== JSON.stringify(command.target) || JSON.stringify(prepared.input) !== JSON.stringify(command.input))) throw new ActionsRequestError("intent_conflict")
      const reuse = !!prepared
      return start(async (handle, clientID) => {
        if (command.kind === "workflow.dispatch") {
          const source = await input.api.source(captured.scope, { path: captured.path ?? "", ref: command.target.ref ?? "" }, handle.signal)
          if (!handle.current() || !matches(captured)) return
          if (source.bindingID !== captured.scope.bindingID || source.path !== captured.path || source.ref !== command.target.ref) throw new ActionsRequestError("source_conflict")
          if (prepared?.expected?.sourceVersion && source.version !== prepared.expected.sourceVersion) throw new ActionsRequestError("source_conflict")
          command.expected = { sourceVersion: source.version, commit: source.commit }
        }
        const operation = await perform(command, captured, handle, reuse, clientID)
        if (operation && known(operation) && handle.current()) { input.update({ dialog: undefined, commandError: undefined }); selected = undefined }
      }, reuse ? lease?.clientID : undefined)
    } catch (cause) { error(cause); return Promise.resolve() }
  }
  return {
    submit, refreshReceipt,
    get sourceDiscardBlocked() { return !!lease?.uncertain || !!review },
    dialog(dialog?: Dialog) {
      if (input.owner.disposed || input.state().submitting) return
      input.editor?.cancelCreate()
      if ((!dialog && lease?.uncertain) || (review && dialog?.kind !== "review-source")) {
        if (lease) { lease.command = undefined; lease.restored = true; remember(lease) }
        review = undefined
      }
      try { selected = dialog && dialog.kind !== "connect" ? selection(input.state(), dialog) : undefined }
      catch (cause) { selected = undefined; input.update({ dialog }); error(cause); return }
      input.update({ dialog, commandError: lease?.uncertain ? input.state().commandError : undefined, commandOutput: undefined })
    },
    resourceAction(action: "play" | "pause" | "keep", resource: Actions.Resource) {
      if (input.owner.disposed || input.state().submitting) return Promise.resolve()
      if (lease?.uncertain) return refreshReceipt()
      const found = [...(input.state().resources.value?.items ?? []), ...(input.state().artifacts.value?.items ?? [])]
        .find((item) => item.id === resource.id && item.kind === resource.kind && item.scope === resource.scope && item.bindingID === resource.bindingID)
      if (!found) { error(new ActionsRequestError("binding_stale")); return Promise.resolve() }
      const kind = action === "keep" ? "artifact.keep" : action === "play" ? "schedule.play" : "resource.update"
      const dialog: Dialog = { kind: resource.kind === "schedules" ? "edit-schedule" : "delete-artifact", id: found.id, scope: found.scope }
      const captured = selection(input.state(), dialog, kind)
      if (!captured.valid || (action === "keep" ? resource.kind !== "artifacts" : resource.kind !== "schedules")) { error(new ActionsRequestError("invalid_input")); return Promise.resolve() }
      const data = metadata(found)
      const command: ActionsCommand = { kind,
        target: { resourceKind: found.kind, resourceID: found.id, scope: found.scope ?? captured.namespace }, action,
        expected: typeof data.resourceVersion === "string" ? { resourceVersion: data.resourceVersion } : undefined,
        input: action === "pause" ? { provider: captured.provider, enabled: data.enabled === false || data.active === false || found.status?.toLowerCase() === "paused" } : { provider: captured.provider } }
      if (!canRequestAction(input.state(), command)) { error(admissionError()); return Promise.resolve() }
      return start(async (handle, clientID) => { await perform(command, captured, handle, false, clientID) })
    },
    workflowState(enabled: boolean, workflowID: string) {
      if (input.owner.disposed || input.state().submitting) return Promise.resolve()
      if (lease?.uncertain) return refreshReceipt()
      if (!input.state().binding) { error(new ActionsRequestError("binding_missing")); return Promise.resolve() }
      const captured = selection(input.state(), { kind: "dispatch", workflowID })
      if (!captured.path || captured.provider !== "github") { error(new ActionsRequestError("capability_unavailable")); return Promise.resolve() }
      const command: ActionsCommand = { kind: enabled ? "workflow.enable" : "workflow.disable", target: { workflowID, path: captured.path }, input: { provider: "github", enabled } }
      if (!captured.valid || !canRequestAction(input.state(), command)) { error(admissionError()); return Promise.resolve() }
      return start(async (handle, clientID) => { await perform(command, captured, handle, false, clientID) })
    },
    dispose() { input.editor?.cancelCreate(); input.owner.cancel("command"); input.owner.cancel("receipt");
      selected = undefined; lease = undefined; review = undefined; input.update({ commandOutput: undefined, submitting: false }) },
  }
}

const resourceDialogs: Partial<Record<Dialog["kind"], readonly [Actions.ResourceKind, ResourceAction]>> = {
  "create-variable": ["variables", "create"], "edit-variable": ["variables", "update"], "delete-variable": ["variables", "delete"],
  "create-environment": ["environments", "create"], "edit-environment": ["environments", "update"], "delete-environment": ["environments", "delete"],
  "create-runner": ["runners", "create"], "edit-runner": ["runners", "update"], "delete-runner": ["runners", "delete"],
  "create-schedule": ["schedules", "create"], "edit-schedule": ["schedules", "update"], "delete-schedule": ["schedules", "delete"],
  "delete-artifact": ["artifacts", "delete"], "delete-cache": ["caches", "delete"], "clear-caches": ["caches", "clear"], "project-settings": ["policy", "update"],
}
function selection(state: State, dialog: Exclude<Dialog, { kind: "connect" }>, operation?: Actions.OperationKind) {
  const binding = state.binding
  if (!binding) throw new ActionsRequestError("binding_missing")
  const family = resourceDialogs[dialog.kind]
  const resourceOperation = operation ?? (family?.[1] === "clear" ? "cache.clear" : family?.[0] === "runners" && family[1] === "create" ? "runner.register"
    : family?.[0] === "runners" && family[1] === "delete" ? "runner.remove" : family?.[1] === "create" ? "resource.create" : family?.[1] === "update" ? "resource.update" : "resource.delete")
  const id = dialog.kind === "project-settings" ? "project-settings" : "id" in dialog ? dialog.id : undefined
  const resource = id ? [...(state.resources.value?.items ?? []), ...(state.artifacts.value?.items ?? [])]
    .find((item) => item.id === id && item.kind === family?.[0] && (!("scope" in dialog) || dialog.scope === undefined || item.scope === dialog.scope)) : undefined
  const workflow = dialog.kind === "dispatch" ? state.workflows.value?.items.find((item) => item.id === dialog.workflowID) : undefined
  const job = "jobID" in dialog && state.jobs.status === "ready" ? state.jobs.value?.items.find((item) => item.id === dialog.jobID && item.bindingID === binding.id && item.runID === state.route.runID) : undefined
  const runID = "runID" in dialog ? dialog.runID : job?.runID ?? state.route.runID
  const run = state.run.value?.id === runID ? state.run.value : state.runs.value?.items.find((item) => item.id === runID)
  const source = state.draftBase ? undefined : state.source.value ?? state.graph.value?.source
  const historical = source && run && source.bindingID === binding?.id && source.commit === run.commit ? { path: source.path, sourceVersion: source.version } : undefined
  const data = resource ? metadata(resource) : undefined
  return { dialog: { ...dialog }, operation, scope: { bindingID: binding.id, revision: binding.revision }, provider: binding.provider.kind,
    namespace: `${binding.provider.kind === "github" ? "repository" : "project"}:${binding.projectID}`, route: { ...state.route }, path: workflow?.path, family,
    source: source ? sourceIdentity(source) : undefined, draftBase: state.draftBase ? JSON.stringify(state.draftBase) : undefined,
    draft: dialog.kind === "review-source" ? state.draft : undefined, resource: resource ? { id: resource.id, kind: resource.kind, scope: resource.scope, bindingID: resource.bindingID,
     name: resource.name, type: data?.type, ref: data?.ref, path: data?.path, sourceVersion: data?.sourceVersion, commit: data?.commit,
    version: typeof data?.resourceVersion === "string" ? data.resourceVersion : undefined, writable: resourceWritable(resource, resourceOperation) } : undefined,
    approvals: dialog.kind === "approval" ? state.resources.value?.items.filter((item) => item.kind === "environments" && item.bindingID === binding.id && metadata(item).runID === dialog.runID)
      .map((item) => ({ id: item.id, scope: item.scope, version: metadata(item).resourceVersion })) : undefined,
    expected: run ? { ...(run.commit ? { commit: run.commit } : {}), ...(historical ? { sourceVersion: historical.sourceVersion } : {}),
      ...((job?.attempt ?? state.route.attempt ?? run.attempt) === undefined ? {} : { attempt: job?.attempt ?? state.route.attempt ?? run.attempt }) } : undefined, historical,
    valid: !!binding && (family ? family[1] === "create" || dialog.kind === "clear-caches" || (!!resource && resource.bindingID === binding.id && resourceWritable(resource, resourceOperation))
      : ["create-workflow", "review-source"].includes(dialog.kind) ? true : dialog.kind === "dispatch" ? !!workflow && workflow.bindingID === binding.id
      : !!run && run.bindingID === binding.id && ("jobID" in dialog ? job?.bindingID === binding.id && job.runID === run.id
        && (binding.provider.kind !== "github" || job.attempt !== undefined && job.attempt === run.attempt)
        && (state.route.attempt === undefined || job.attempt === state.route.attempt) : true)) }
}
function resolve(captured: Selection, payload: unknown): ActionsCommand {
  const raw = decodeAction(Schema.Record(Schema.String, Schema.Json), payload)
  const value: Schema.JsonObject = { provider: captured.provider, ...raw, ...(captured.provider === "gitlab" && captured.family?.[0] === "variables" && raw.scope === "Repository" ? { scope: "*" } : {}) }
  if (value.provider !== captured.provider) throw new ActionsRequestError("invalid_input")
  const dialog = captured.dialog
  if (captured.family) {
    const kind = captured.family[0]
    const action = captured.family[1]
    const input = action === "delete" && kind === "variables" ? decodeAction(ResourceForms.variableDelete, { name: captured.resource?.name, type: captured.resource?.type, scope: captured.resource?.scope, ...value })
      : action === "delete" && kind === "environments" ? decodeAction(ResourceForms.environmentDelete, { name: captured.resource?.name, ...value })
       : action === "delete" && kind === "caches" && captured.provider === "github" ? decodeAction(Schema.Struct({ provider: Actions.ProviderKind, name: Schema.NonEmptyString, ref: Schema.NonEmptyString }), { ...value, name: captured.resource?.name, ref: captured.resource?.ref })
       : action === "delete" || action === "clear" ? decodeAction(Actions.ProviderCommand.fields.input, value)
      : kind === "variables" ? decodeAction(ResourceForms.variables, value) : kind === "environments" ? decodeAction(ResourceForms.environments, value)
      : kind === "runners" ? decodeAction(ResourceForms.runners, value) : kind === "schedules" ? decodeAction(ResourceForms.schedules, value) : decodeAction(ResourceForms.policy, value)
    if (captured.resource?.scope && value.scope !== undefined && value.scope !== captured.resource.scope && (captured.provider !== "gitlab" || kind !== "variables" || !captured.resource.version)) throw new ActionsRequestError("source_conflict")
    const scope = captured.resource?.scope ?? ("scope" in dialog ? dialog.scope : undefined) ?? (typeof value.scope === "string" ? value.scope : captured.namespace)
    const resourceID = kind === "policy" ? "project-settings" : captured.resource ? kind === "variables" || kind === "environments" ? captured.resource.name : captured.resource.id
      : (kind === "variables" || kind === "environments") && typeof value.name === "string" ? value.name : undefined
    return { kind: action === "clear" ? "cache.clear" : kind === "runners" && action === "create" ? "runner.register" : kind === "runners" && action === "delete" ? "runner.remove"
      : action === "create" ? "resource.create" : action === "update" ? "resource.update" : "resource.delete", action, input,
      target: { resourceKind: kind, ...(resourceID ? { resourceID } : {}), scope: kind === "policy" || kind === "environments" ? captured.provider === "github" ? "Repository" : "Project" : scope,
         ...(kind === "caches" && captured.provider === "github" && typeof captured.resource?.ref === "string" ? { ref: captured.resource.ref } : {}),
         ...(kind === "schedules" && typeof value.ref === "string" ? { ref: value.ref } : {}) }, expected: captured.resource?.version ? { resourceVersion: captured.resource.version } : undefined }
  }
  if (dialog.kind === "approval") {
    const form = decodeAction(Schema.Struct({ provider: Actions.ProviderKind, decision: Schema.Literals(["Approve", "Reject", "approve", "reject"]), comment: Schema.NonEmptyString,
      resourceID: Schema.optional(Schema.NonEmptyString), scope: Schema.optional(Schema.NonEmptyString) }), value)
    const choices = captured.approvals?.filter((item) => (form.resourceID === undefined || item.id === form.resourceID) && (form.scope === undefined || item.scope === form.scope))
    if (choices?.length !== 1) throw new ActionsRequestError("source_unresolved")
    const chosen = choices[0]
    return { kind: "deployment.review", action: "play", target: { resourceKind: "environments", resourceID: chosen.id, scope: chosen.scope, runID: dialog.runID },
      input: { provider: form.provider, decision: form.decision === "Approve" || form.decision === "approve" ? "Approve" : "Reject", comment: form.comment }, expected: { commit: captured.expected?.commit,
        attempt: captured.expected?.attempt, ...(typeof chosen.version === "string" ? { resourceVersion: chosen.version } : {}) } }
  }
  if (dialog.kind === "dispatch") return { kind: "workflow.dispatch", target: { workflowID: dialog.workflowID, path: captured.path, ref: typeof value.ref === "string" ? value.ref : undefined }, input: decodeAction(Actions.DispatchCommand.fields.input, value) }
  const target = { ...(captured.historical ? { path: captured.historical.path } : {}), ...("runID" in dialog ? { runID: dialog.runID } : { runID: captured.route.runID }), ...("jobID" in dialog ? { jobID: dialog.jobID } : {}) }
  if (dialog.kind === "retry") { const input = decodeAction(Actions.RetryCommand.fields.input, value); return { kind: input.provider === "github" && input.mode === "failed" ? "run.retryFailed" : "run.retry", target, input, expected: captured.expected } }
  if (dialog.kind === "jobPlay") return { kind: "job.play", target, input: decodeAction(Actions.JobPlayCommand.fields.input, value), expected: captured.expected }
  if (dialog.kind === "jobRetry") return { kind: "job.retry", target, input: decodeAction(Actions.JobRetryCommand.fields.input, value), expected: captured.expected }
  if (dialog.kind === "cancel" || dialog.kind === "remove") return { kind: dialog.kind === "cancel" ? "run.cancel" : "run.delete", target, input: decodeAction(Actions.ProviderCommand.fields.input, value), expected: captured.expected }
  throw new ActionsRequestError("invalid_input")
}
function known(operation: Actions.Operation) { return operation.state === "accepted" || operation.state === "confirmed" }
function ambiguous(operation: Actions.Operation, active: Lease) {
  return operation.state === "sending" || operation.state === "outcome_unknown"
    || operation.state === "prepared" && (active.restored === true || active.sent === true)
}
function operationFailure(operation: Actions.Operation, failure?: ErrorState) {
  if (operation.state === "rejected") return failure ?? actionsError(new ActionsRequestError("operation_rejected"))
  if (operation.state === "expired") return actionsError(new ActionsRequestError("operation_expired"))
}
function immutable<T>(value: T): T { if (value && typeof value === "object") { Object.values(value).forEach(immutable); Object.freeze(value) }; return value }
function metadata(resource: Actions.Resource) { return decodeAction(Schema.Record(Schema.String, Schema.Json), resource.data) }
function template(provider: Actions.ProviderKind, name: string, kind: string) {
  const blank = kind === "Blank configuration" || kind === "blank"
  const release = kind === "Release" || kind === "release"
  if (provider === "github") return `name: ${JSON.stringify(name)}\non: workflow_dispatch\njobs:${blank ? " {}\n" : `\n  ${release ? "release" : "build"}:\n    runs-on: ubuntu-latest\n    steps: []\n`}`
  return `# ${name.replaceAll("\n", " ")}\n${blank ? "stages: []\n" : `stages: [${release ? "deploy" : "build, test"}]\n`}`
}
