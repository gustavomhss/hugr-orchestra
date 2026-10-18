import { Actions } from "@orchestra/schema/actions"
import { Option, Schema } from "effect"
import { getOwner, onCleanup } from "solid-js"
import { createStore, unwrap } from "solid-js/store"
import { actionsError, ActionsRequestError, type ActionsScope, type createActionsAPI } from "./api"
import { createActionsCommands, type ActionsPending } from "./commands"
import { initial, type Data, type Filters, type Model, type Route, type State } from "./contract"
import { createRequestOwner, createSourceDraft, previewResponse, saveResponse, sourceDiscardBlocked } from "./requests"
import { selectedRoute } from "./selection"
import { readPolicy } from "./policy"
import { readDialog } from "./dialog-data"
import { createActionsInspection } from "./inspection"
import { readProposalSource } from "./proposal-source"
import { saveLocalPolicy } from "./local-policy"
import { validTransfer } from "./transfer-selection"

export type ActionsPreference = { bindingID?: Actions.BindingID; route?: Route; filters?: Partial<Filters>; pending?: ActionsPending }
export type ActionsPreferences = ActionsPreference & { save?: (value: ActionsPreference) => void }
type PageKind = "workflows" | "runs" | "jobs" | "artifacts" | "resources"

/** Construct synchronously inside the chapter's Solid owner; persistence belongs to its caller. */
export function createActionsModel(input: {
  api: ReturnType<typeof createActionsAPI>
  save: (response: Response) => Promise<void>
  preferences?: ActionsPreferences
}): Model {
  const defaults = initial()
  const [state, setState] = createStore<State>({ ...defaults, route: { ...(input.preferences?.route ?? defaults.route) },
    filters: { ...defaults.filters, ...input.preferences?.filters } })
  const owner = createRequestOwner()
  const pages: Partial<Record<PageKind, string>> = {}
  let wanted = input.preferences?.bindingID
  let pending = input.preferences?.pending
  const update = (patch: Partial<State>) => { if (!owner.disposed) setState(patch) }
  const identity = () => JSON.stringify([state.binding?.id, state.binding?.revision, state.route, state.filters])
  const persist = () => input.preferences?.save?.({ bindingID: state.binding?.id ?? wanted,
    route: { ...unwrap(state.route) }, filters: { ...unwrap(state.filters) }, ...(pending ? { pending } : {}) })
  const editor = createSourceDraft({ api: input.api, owner, state: () => state, update,
    error: (cause) => typeof cause === "string" ? actionsError(new ActionsRequestError(cause)) : actionsError(cause) })
  const commands = createActionsCommands({ api: input.api, owner, state: () => state, update, pending, editor,
    remember(value) { pending = value; persist() } })
  const clear = (keepSource = false) => {
    delete pages.workflows
    delete pages.runs
    delete pages.jobs
    delete pages.artifacts
    delete pages.resources
    if (!keepSource) editor.reset()
    update({ capabilities: { status: "idle" }, workflows: { status: "idle" }, runs: { status: "idle" }, run: { status: "idle" },
      jobs: { status: "idle" }, source: keepSource ? { ...unwrap(state.source) } : { status: "idle" }, graph: { status: "idle" }, artifacts: { status: "idle" }, resources: { status: "idle" },
      ...(keepSource ? {} : { draft: "", diagnostics: [] }),
      log: { status: "idle" }, logTruncated: false, dialog: undefined, commandOutput: undefined })
  }
  const load = <T>(slot: string, key: string, prior: Data<T>, write: (value: Data<T>) => void,
    read: (signal: AbortSignal) => Promise<T>) => {
    if (owner.disposed) return Promise.resolve()
    write({ status: "loading", value: prior.value })
    return owner.run(slot, key, async (handle) => {
      const value = await read(handle.signal)
      if (handle.current()) write({ status: "ready", value })
    }, (error) => {
      write({ status: "error", error: actionsError(error) })
      if (actionsError(error).kind === "unsupported") update({ unsupported: true })
    })
  }
  const scope = (binding: Actions.Binding): ActionsScope => ({ bindingID: binding.id, revision: binding.revision })
  const bound = <T extends { bindingID: Actions.BindingID }>(value: T, target: ActionsScope) => {
    if (value.bindingID !== target.bindingID) throw new ActionsRequestError("binding_stale")
    return value
  }
  const page = (kind: PageKind, target: ActionsScope, cursor = pages[kind]) => {
    const route = { ...unwrap(state.route) }
    const filters = { ...unwrap(state.filters) }
    const attempt = route.attempt ?? state.run.value?.attempt
    const key = JSON.stringify([target, route, filters, cursor, attempt, state.run.value?.commit])
    if (kind === "resources" || kind === "artifacts") {
      const resourceKind = kind === "artifacts" ? "artifacts" : route.resourceKind ?? "artifacts"
      return load(kind, key, state[kind], (data) => {
        if (data.status === "ready") pages[kind] = cursor
        update(kind === "resources" ? { resources: data } : { artifacts: data })
      }, async (signal) => {
        const value = await input.api.resources(target, { kind: resourceKind, ...(resourceKind === "variables" && filters.scope ? { scope: filters.scope } : {}), ...(route.runID ? { runID: route.runID } : {}), ...(resourceKind === "caches" && state.binding?.provider.kind === "gitlab" ? {} : { cursor, limit: 30 }) }, signal)
        value.items.forEach((item) => { bound(item, target); if (item.kind !== resourceKind) throw new ActionsRequestError("invalid_response") })
        if (value.items.length > 30) throw new ActionsRequestError("metadata_truncated")
        if (!filters.query) return value
        const query = filters.query.toLowerCase()
        return { ...value, total: undefined, items: value.items.filter((item) => [item.id, item.name, item.scope].some((field) => field?.toLowerCase().includes(query))) }
      })
    }
    if (kind === "workflows") return load(kind, key, state.workflows, (data) => {
      if (data.status === "ready") pages.workflows = cursor
      update({ workflows: data })
    }, async (signal) => {
      const value = await input.api.workflows(target, { cursor, limit: 30 }, signal)
      value.items.forEach((item) => bound(item, target))
      return value
    })
    if (kind === "runs") return load(kind, key, state.runs, (data) => {
      if (data.status === "ready") pages.runs = cursor
      update({ runs: data })
    }, async (signal) => {
       const value = await input.api.runs(target, { cursor, limit: route.view === "library" ? 10 : 30,
         workflowID: route.workflowID, ...(route.view === "library" ? {} : { status: filters.status || undefined,
           ref: filters.ref || undefined, event: filters.event || undefined }) }, signal)
      value.items.forEach((item) => {
        bound(item, target)
        if (route.workflowID && item.workflowID !== route.workflowID) throw new ActionsRequestError("binding_stale")
      })
      // Native run list has no free-text query. Search only this bounded page, retaining its cursor.
      if (route.view === "library" || !filters.query) return value
      const query = filters.query.toLowerCase()
      return { ...value, total: undefined, items: value.items.filter((item) =>
        [item.id, item.name, item.commit, item.ref, item.actor, item.event].some((field) => field?.toLowerCase().includes(query))) }
    })
    const runID = route.runID
    if (!runID) return Promise.resolve()
    if (kind === "jobs") return load(kind, key, state.jobs, (data) => {
      if (data.status === "ready") pages.jobs = cursor
      update({ jobs: data })
    }, async (signal) => {
      const value = await input.api.jobs(target, { runID, attempt, cursor }, signal)
      value.items.forEach((item) => {
        bound(item, target)
        if (item.runID !== route.runID || (attempt !== undefined && item.attempt !== undefined && item.attempt !== attempt))
          throw new ActionsRequestError("binding_stale")
      })
      return value
    })
    return Promise.resolve()
  }
  const source = async (target: ActionsScope, selection: Route, graph: boolean) => {
    if (editor.created && state.draftBase && selection.view === "source" && selection.path === editor.created.path && selection.ref === state.draftBase.ref) return
    const route = selectedRoute(state, selection)
    if (!route.runID && route.ref && JSON.stringify(route) !== JSON.stringify(selection)) { update({ route }); persist() }
    const run = route.runID && state.run.value ? { ...unwrap(state.run.value) } : undefined
    const workflowID = route.workflowID ?? run?.workflowID
    const workflow = state.workflows.value?.items.find((item) => item.id === workflowID)
    // GitLab's project config slot cannot prove a historical pipeline's source path.
    const path = route.path ?? (!run || state.binding?.provider.kind === "github" ? workflow?.path : undefined)
    // A run's source is immutable; configuration refs come from explicit selection or native catalog.
    const ref = run ? run.commit : route.ref
    if (!path || !ref || (route.runID && run?.id !== route.runID)) {
      const error = actionsError(new ActionsRequestError("source_unresolved"))
      update(graph ? { graph: { status: "error", error } } : { source: { status: "error", error } })
      return
    }
    const query = { path, ref }
    const validate = (value: Actions.Source) => {
      bound(value, target)
      if (value.path !== path || value.ref !== ref || (run?.commit && value.commit !== run.commit))
        throw new ActionsRequestError("source_conflict")
      return value
    }
    if (graph) return load("graph", JSON.stringify([target, query]), state.graph, (data) => {
      if (data.status === "ready" && data.value && !editor.install({ ...data.value.source, editable: data.value.source.editable && !route.runID })) {
        update({ graph: { status: "error", error: actionsError(new ActionsRequestError("source_conflict")) } }); return
      }
      update({ graph: data })
    }, async (signal) => {
      const value = await input.api.graph(target, query, signal)
      validate(value.source)
      return value
    })
    return load("source", JSON.stringify([target, query]), state.source, (data) => {
      if (data.status === "ready" && data.value) { editor.install({ ...data.value, editable: data.value.editable && !route.runID }); return }
      update({ source: { ...data, value: editor.base ?? data.value } })
    }, async (signal) =>
      validate(await readProposalSource(input.api, target, state.binding?.provider.kind ?? "github", query, signal, false)))
  }
  const view = (force: boolean) => owner.run("view", identity(), async (handle) => {
    if (state.route.view === "local") return
    if (force || state.bindings.status !== "ready") {
      await load("bindings", input.api.directory, state.bindings, (data) => update({ bindings: data }), (signal) => input.api.bindings(signal))
      if (!handle.current() || state.bindings.status !== "ready") return
      update({ unsupported: false })
      const binding = state.bindings.value?.find((item) => item.id === (wanted ?? state.binding?.id))
        ?? (wanted === undefined && state.binding === undefined ? state.bindings.value?.[0] : undefined)
      if (binding?.directory !== undefined && binding.directory !== input.api.directory) throw new ActionsRequestError("binding_stale")
      if (binding?.id !== state.binding?.id || binding?.revision !== state.binding?.revision) {
        if (editor.dirty()) { update({ commandError: actionsError(new ActionsRequestError("source_conflict")) }); return }
        owner.reset("view")
        clear()
        update({ binding, ...(binding?.id !== state.binding?.id ? { filters: { ...unwrap(state.filters), scope: undefined } } : {}) })
      }
      wanted ??= binding?.id
      persist()
    }
    if (!handle.current() || !state.binding) return
    const target = scope(state.binding)
    const route = { ...unwrap(state.route) }
    if (force || state.capabilities.status === "idle")
      await load("capabilities", JSON.stringify(target), state.capabilities, (data) => update({ capabilities: data }),
        (signal) => input.api.capabilities(target, signal))
    if (!handle.current()) return
    if (route.view === "settings") {
      await load("settings", JSON.stringify(target), state.resources, (data) => update({ resources: data }), (signal) => readPolicy(input.api, target, signal))
      return
    }
    if (route.view === "resources") { await page("resources", target); return }
    if (route.view === "library") { await Promise.all([page("workflows", target), page("runs", target)]); return }
    if (route.view === "runs") { await page("runs", target); return }
    if (route.runID) {
      const runID = route.runID
      await load("run", JSON.stringify([target, runID]), state.run, (data) => update({ run: data }), async (signal) => {
        const value = bound(await input.api.run(target, runID, signal), target)
        if (value.id !== runID || (route.workflowID && value.workflowID !== route.workflowID)) throw new ActionsRequestError("binding_stale")
        return value
      })
      if (!handle.current() || state.run.status !== "ready") return
    }
    // A link may name only the run: complete workflow, path and commit from the loaded run in place, since a
    // navigate() would clear() the run it just read.
    const selection = route.runID ? selectedRoute(state, route) : route
    if (JSON.stringify(selection) !== JSON.stringify(route)) { update({ route: selection }); persist() }
    const tab = selection.tab ?? (route.view === "workflow" ? "graph" : route.view === "source" ? "source" : route.view === "job" ? "logs" : "jobs")
    if (route.view === "workflow") {
      if (state.workflows.status !== "ready") await page("workflows", target)
      if (!handle.current()) return
    }
    if (tab === "artifacts") { await page("artifacts", target); return }
    if (tab === "source" || tab === "graph") {
      // Without a ref, configuration source resolves the workflow's native default ref from the catalog.
      if ((!selection.path || (!selection.runID && !selection.ref)) && state.workflows.status !== "ready") await page("workflows", target)
      if (handle.current() && tab === "graph" && route.runID) await page("jobs", target)
      if (handle.current()) await source(target, selection, tab === "graph")
      return
    }
    await page("jobs", target)
    if (handle.current() && tab === "logs" && route.jobID) await previewLog(route.jobID)
  }, (error) => update({ commandError: actionsError(error) }))
  const refresh = () => Promise.all([view(true), commands.refreshReceipt(true)]).then(() => undefined)
  const navigate = (route: Route) => {
    if (owner.disposed) return
    if (!editor.leave(route)) return
    const workflows = { ...unwrap(state.workflows) }
    const capabilities = { ...unwrap(state.capabilities) }
    owner.reset()
    clear(editor.dirty())
    // Keep at most the current workflow page so native paths survive detail navigation.
    update({ route: { ...route }, workflows: route.view === "library" ? { status: "idle" } : workflows,
      capabilities: capabilities.status === "ready" ? capabilities : { status: "idle" } })
    persist()
    void view(false)
  }
  const previewLog = (jobID: string) => {
    const binding = state.binding
    const job = state.jobs.value?.items.find((item) => item.id === jobID)
    if (!binding || !job || job.bindingID !== binding.id || job.runID !== state.route.runID
      || (state.route.attempt !== undefined && job.attempt !== undefined && job.attempt !== state.route.attempt)) {
      update({ log: { status: "error", error: actionsError(new ActionsRequestError("binding_stale")) } })
      return Promise.resolve()
    }
    const target = { kind: "jobLog" as const, id: jobID, runID: job.runID, attempt: state.route.attempt ?? job.attempt }
    const nativeScope = scope(binding)
    update({ log: { status: "loading" }, logTruncated: false })
    return owner.run("log", JSON.stringify([nativeScope, target]), async (handle) => {
      const response = await input.api.transfer(nativeScope, target, handle.signal)
      const preview = await previewResponse(response, handle.signal)
      if (handle.current()) update({ log: { status: "ready", value: preview.text }, logTruncated: preview.truncated })
    }, (error) => update({ log: { status: "error", error: actionsError(error) } }))
  }
  const mutation = (key: string, work: (signal: AbortSignal) => Promise<void>) => {
    if (owner.disposed || state.submitting) return Promise.resolve()
    update({ submitting: true, commandError: undefined })
    return owner.run("connection", key, async (handle) => {
      try { await work(handle.signal) }
      finally { if (handle.current()) update({ submitting: false }) }
    }, (error) => update({ submitting: false, commandError: actionsError(error) }), true)
  }
  const dispose = () => {
    if (owner.disposed) return
    clear()
    update({ bindings: { status: "idle" }, binding: undefined, operation: undefined, commandError: undefined, submitting: false })
    owner.dispose()
    commands.dispose()
  }
  if (getOwner()) onCleanup(dispose)
  // Publish the wanted binding before the first read, so URL synchronization can tell a stale one from one in flight.
  persist()
  void view(false)
  if (pending?.operationID) void commands.refreshReceipt()
  return {
    state, navigate, refresh, previewLog, dispose,
    ...createActionsInspection({ api: input.api, state: () => state, disposed: () => owner.disposed }),
    get sourceDiscardBlocked() { return sourceDiscardBlocked(state) || commands.sourceDiscardBlocked },
    discardSource() {
      if (owner.disposed || sourceDiscardBlocked(state) || commands.sourceDiscardBlocked) return
      const created = !!editor.created
      editor.abandon()
      if (created && !editor.dirty()) navigate({ view: "library" })
    },
    dialog(dialog) {
      owner.cancel("dialog-data")
      if (!dialog || !state.binding || !["project-settings", "approval", "edit-environment"].includes(dialog.kind)) { commands.dialog(dialog); return }
      commands.dialog(undefined)
      const target = scope(state.binding)
      const prior = state.resources.value
      update({ resources: { status: "loading", value: prior } })
      void owner.run("dialog-data", JSON.stringify([target, dialog]), async (handle) => {
        const value = await readDialog(input.api, target, dialog, prior, handle.signal)
        value.items.forEach((item) => bound(item, target))
        if (!handle.current()) return
        update({ resources: { status: "ready", value } })
        commands.dialog(dialog)
      }, (cause) => update({ resources: { status: "error", error: actionsError(cause) } }))
    },
    submit(payload) {
      if (state.dialog?.kind !== "project-settings" || state.dialog.target === "native") return commands.submit(payload)
      return saveLocalPolicy({ api: input.api, state: () => state, update, mutation, refresh: () => view(true) }, payload)
    },
    editSource: editor.edit, validateSource: editor.validate, resourceAction: commands.resourceAction, workflowState: commands.workflowState,
    filter(patch) {
      if (owner.disposed) return
      update({ filters: { ...unwrap(state.filters), ...patch } })
      navigate({ ...unwrap(state.route) })
    },
    selectBinding(id) {
      if (owner.disposed) return
      if (!editor.leave()) return
      owner.reset()
      clear()
      wanted = id
      const binding = state.bindings.value?.find((item) => item.id === id)
      // Run status filters are provider-native (GitHub `failure`, GitLab `failed`); never carry one across providers.
      const status = binding?.provider.kind === state.binding?.provider.kind ? state.filters.status : ""
      update({ binding, filters: { ...unwrap(state.filters), scope: undefined, status }, commandError: undefined, route: { view: "library" } })
      persist()
      void view(false)
    },
    more(kind) {
      const resource = state.route.view === "resources" && kind === "artifacts" ? "resources" : kind
      if (owner.disposed || !state.binding || state[resource].status === "error") return Promise.resolve()
      const cursor = state[resource].value?.next
      if (!cursor) return Promise.resolve()
      return page(resource, scope(state.binding), cursor)
    },
    connect(payload) {
      if (!editor.leave()) return Promise.resolve()
      const decoded = Schema.decodeUnknownOption(Actions.BindingInput, { onExcessProperty: "error" })(payload)
      if (Option.isNone(decoded)) { update({ commandError: actionsError(new ActionsRequestError("invalid_input")) }); return Promise.resolve() }
      const value = structuredClone(decoded.value)
      const captured = identity()
      return mutation("connect", async (signal) => {
        const binding = await input.api.connect(value, signal)
        if (owner.disposed) return
        if (binding.directory !== input.api.directory) throw new ActionsRequestError("binding_stale")
        if (identity() !== captured) {
          update({ bindings: { status: "idle" } })
          await view(true)
          return
        }
        owner.reset()
        clear()
        wanted = binding.id
        update({ binding, filters: { ...unwrap(state.filters), scope: undefined }, dialog: undefined, route: { view: "library" } })
        persist()
        await view(true)
      })
    },
    removeBinding() {
      if (!editor.leave()) return Promise.resolve()
      const binding = state.binding
      if (!binding) return Promise.resolve()
      const target = scope(binding)
      const captured = identity()
      return mutation(`remove:${target.bindingID}:${target.revision}`, async (signal) => {
        await input.api.removeBinding(target, signal)
        if (owner.disposed) return
        if (state.binding?.id !== target.bindingID || state.binding.revision !== target.revision) {
          update({ bindings: { status: "idle" } })
          await view(true)
          return
        }
        const route = identity() === captured ? { view: "settings" as const } : { ...unwrap(state.route) }
        owner.reset()
        clear()
        wanted = target.bindingID
        update({ binding: undefined, filters: { ...unwrap(state.filters), scope: undefined }, bindings: { status: "idle" }, route })
        await view(true)
      })
    },
    download(payload) {
      const binding = state.binding
      const decoded = Schema.decodeUnknownOption(Actions.TransferInput, { onExcessProperty: "error" })(payload)
      if (!binding || Option.isNone(decoded) || !validTransfer(state, decoded.value)) {
        update({ commandError: actionsError(new ActionsRequestError("binding_stale")) })
        return Promise.resolve()
      }
      const target = structuredClone(decoded.value)
      const nativeScope = scope(binding)
      return owner.run("download", JSON.stringify([nativeScope, target]), async (handle) => {
        const response = await input.api.transfer(nativeScope, target, handle.signal)
        if (handle.current()) { await saveResponse(response, handle.signal, input.save); return }
        await response.body?.cancel().catch(() => undefined)
      }, (error) => update({ commandError: actionsError(error) }))
    },
  }
}
