import { Actions } from "@orchestra/schema/actions"
import { Option, Schema } from "effect"
import { batch, createEffect, createSignal, untrack, type JSX } from "solid-js"
import type { Dialog, Filters, Model, Route } from "./contract"
import type { ActionsPreference } from "./model"

export { selectedRoute } from "./selection"

export const resourceLinks = [
  ["artifacts", "orchestra.actions.artifacts", "box"],
  ["environments", "orchestra.actions.environments", "branch"],
  ["variables", "orchestra.actions.variables", "code"],
  ["runners", "orchestra.actions.runners", "local"],
  ["caches", "orchestra.actions.caches", "box"],
  ["schedules", "orchestra.actions.schedules", "retry"],
] as const

const text = Schema.String.check(Schema.isMaxLength(2048))
const routeSchema = Schema.Struct({
  view: Schema.Literals(["library", "runs", "workflow", "run", "job", "source", "resources", "settings", "local"]),
  workflowID: Schema.optional(text), runID: Schema.optional(text), jobID: Schema.optional(text),
  attempt: Schema.optional(Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 1000000 }))),
  path: Schema.optional(text), ref: Schema.optional(text),
  resourceKind: Schema.optional(Schema.Literals(["artifacts", "environments", "variables", "runners", "caches", "schedules"])),
  tab: Schema.optional(Schema.Literals(["graph", "jobs", "logs", "artifacts", "source"])),
})
const preferencesSchema = Schema.Struct({
  bindingID: Schema.optional(Actions.BindingID),
  route: Schema.optional(routeSchema),
  filters: Schema.optional(Schema.Struct({
    query: Schema.optional(text), status: Schema.optional(text), ref: Schema.optional(text), event: Schema.optional(text), scope: Schema.optional(text),
  })),
})

/** Persist navigation only: no SDK data, source drafts, log text, credentials or command payloads. */
export function navigationPreferences(value: unknown): ActionsPreference {
  const decoded = Schema.decodeUnknownOption(preferencesSchema)(value)
  if (Option.isNone(decoded)) return { route: { view: "library" } }
  return decoded.value
}

const queryKeys = {
  bindingID: "actionsBinding", view: "actionsView", workflowID: "actionsWorkflow", runID: "actionsRun",
  jobID: "actionsJob", attempt: "actionsAttempt", path: "actionsPath", ref: "actionsRef",
  resourceKind: "actionsResource", tab: "actionsTab", query: "actionsQuery", status: "actionsStatus",
  filterRef: "actionsFilterRef", event: "actionsEvent", scope: "actionsFilterScope",
} as const

type Query = Record<string, string | string[] | undefined>
export function readNavigation(query: Query): ActionsPreference | undefined {
  if (typeof query.actionsView !== "string") return undefined
  const string = (key: string) => typeof query[key] === "string" ? query[key] : undefined
  const decoded = Schema.decodeUnknownOption(preferencesSchema)({
    bindingID: string(queryKeys.bindingID),
    route: {
      view: string(queryKeys.view), workflowID: string(queryKeys.workflowID), runID: string(queryKeys.runID),
      jobID: string(queryKeys.jobID), attempt: string(queryKeys.attempt) ? Number(string(queryKeys.attempt)) : undefined,
      path: string(queryKeys.path), ref: string(queryKeys.ref), resourceKind: string(queryKeys.resourceKind), tab: string(queryKeys.tab),
    },
    filters: { query: string(queryKeys.query) ?? "", status: string(queryKeys.status) ?? "",
      ref: string(queryKeys.filterRef) ?? "", event: string(queryKeys.event) ?? "", scope: string(queryKeys.scope) },
  })
  return Option.isSome(decoded) ? decoded.value : undefined
}

export function navigationQuery(value: ActionsPreference) {
  const route = value.route ?? { view: "library" }
  return {
    actionsBinding: value.bindingID, actionsView: route.view, actionsWorkflow: route.workflowID,
    actionsRun: route.runID, actionsJob: route.jobID, actionsAttempt: route.attempt?.toString(),
    actionsPath: route.path, actionsRef: route.ref, actionsResource: route.resourceKind, actionsTab: route.tab,
    actionsQuery: value.filters?.query || undefined, actionsStatus: value.filters?.status || undefined,
    actionsFilterRef: value.filters?.ref || undefined, actionsEvent: value.filters?.event || undefined, actionsFilterScope: value.filters?.scope || undefined,
  }
}

export function navigationKey(value: ActionsPreference) {
  return JSON.stringify(navigationQuery(value))
}

export function completeFilters(value?: Partial<Filters>): Filters {
  return { query: value?.query ?? "", status: value?.status ?? "", ref: value?.ref ?? "", event: value?.event ?? "", ...(value?.scope ? { scope: value.scope } : {}) }
}

export function resourceDialog(value?: Dialog) {
  return value !== undefined && (value.kind === "project-settings" || resourceDialogKinds.includes(value.kind))
}

/**
 * Query parameters keep chapter navigation in the existing router's Back/Forward stack.
 *
 * A link applies when its `actionsScope` is this server and directory. A link without `actionsScope` applies only
 * when it names an `actionsBinding` that this directory's binding list contains: a binding belongs to exactly one
 * directory, so it proves the scope. Any other unscoped link is ignored and the URL is rewritten to the selection.
 */
export function synchronizeNavigation(input: {
  model: Model
  scope: string
  query: () => Query
  write: (query: ReturnType<typeof navigationQuery> & { actionsScope: string }, replace: boolean) => void
  /** The binding the model last persisted as wanted; when it no longer exists the model selects none. */
  wanted?: () => Actions.BindingID | undefined
}) {
  const cursor: { written: string; route: string; initialized: boolean; selection?: ActionsPreference } = { written: "", route: "", initialized: false }
  const snapshot = (): ActionsPreference => ({ bindingID: input.model.state.binding?.id,
    route: { ...input.model.state.route }, filters: { ...input.model.state.filters } })
  // Wait until the model has resolved its binding: acting on the query while that first read is in flight re-enters
  // selectBinding/navigate, whose clear() resets the slot the in-flight read was about to fill. The read is resolved
  // once a binding is selected, or when none will be: a failed read, no bindings, or a stale persisted binding.
  const settled = () => {
    const state = input.model.state
    if (state.bindings.status === "error") return true
    if (state.bindings.status !== "ready") return false
    const wanted = input.wanted?.()
    return state.binding !== undefined || !state.bindings.value?.some((item) => item.id === (wanted ?? item.id))
  }
  // Writing waits for the first read of the query, so an initial link is applied before the selection overwrites it.
  const [synced, setSynced] = createSignal(false)
  createEffect(() => {
    const query = input.query()
    if (!settled()) return
    const target = query.actionsScope === input.scope || (query.actionsScope === undefined && typeof query.actionsBinding === "string")
      ? readNavigation(query) : undefined
    untrack(() => setSynced(true))
    if (!target || navigationKey(target) === cursor.written) return
    untrack(() => {
      const state = input.model.state
      const binding = state.bindings.value?.find((item) => item.id === target.bindingID)
      if (target.bindingID && !binding) {
        input.write({ ...navigationQuery(snapshot()), actionsScope: input.scope }, true)
        return
      }
      cursor.written = navigationKey(target)
      cursor.selection = target
      cursor.route = JSON.stringify([target.bindingID, target.route])
      cursor.initialized = true
      batch(() => {
        if (binding && binding.id !== state.binding?.id) input.model.selectBinding(binding.id)
        if (JSON.stringify(completeFilters(target.filters)) !== JSON.stringify(state.filters)) input.model.filter(completeFilters(target.filters))
        if (target.route && JSON.stringify(target.route) !== JSON.stringify(state.route)) input.model.navigate(target.route)
      })
      // A dirty draft can reject navigation. Restore the accepted selection rather than lying in the URL.
      if (state.commandError?.kind === "source_dirty") input.write({ ...navigationQuery(snapshot()), actionsScope: input.scope }, true)
    })
  })
  createEffect(() => {
    const value = snapshot()
    if (value.route?.view !== "local" && (!synced() || !settled())) return
    const key = navigationKey(value)
    if (key === cursor.written) return
    const route = JSON.stringify([value.bindingID, value.route])
    const replace = !cursor.initialized || route === cursor.route || completesSelection(cursor.selection, value)
    cursor.written = key
    cursor.route = route
    cursor.initialized = true
    cursor.selection = value
    untrack(() => input.write({ ...navigationQuery(value), actionsScope: input.scope }, replace))
  })
}

/** Loading native identity completes an existing history entry; user selection changes create entries. */
export function completesSelection(before: ActionsPreference | undefined, value: ActionsPreference) {
  if (!before || before.bindingID !== value.bindingID || !before.route || !value.route) return false
  const prior = before.route
  const next = value.route
  if (!(["view", "runID", "jobID", "attempt", "resourceKind"] as const).every((key) => prior[key] === next[key])) return false
  if (prior.workflowID !== next.workflowID && (prior.workflowID || !prior.runID)) return false
  return (!prior.path || prior.path === next.path) && (!prior.ref || prior.ref === next.ref) && (!prior.tab || prior.tab === next.tab)
}

const resourceDialogKinds: readonly Dialog["kind"][] = [
  "create-variable", "edit-variable", "delete-variable", "create-environment", "edit-environment", "delete-environment",
  "create-runner", "edit-runner", "delete-runner", "create-schedule", "edit-schedule", "delete-schedule",
  "delete-artifact", "delete-cache", "clear-caches",
]

export const tabKeydown: JSX.EventHandler<HTMLElement, KeyboardEvent> = (event) => {
  if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return
  const current = event.target
  if (!(current instanceof HTMLButtonElement) || current.getAttribute("role") !== "tab") return
  const tabs = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]:not(:disabled)'))
  if (!tabs.length) return
  const forward = event.key === "ArrowRight" ? !current.matches(":dir(rtl)") : current.matches(":dir(rtl)")
  const index = event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1
    : (tabs.indexOf(current) + (forward ? 1 : -1) + tabs.length) % tabs.length
  event.preventDefault()
  tabs[index]?.focus()
  tabs[index]?.click()
}
