import type { LeanCoverage } from "@orchestra/schema/lean-coverage"
import type { LeanDashboard } from "@orchestra/schema/lean-dashboard"
import { createStore } from "solid-js/store"
import { pathKey } from "@/utils/path-key"

export class LeanResponseError extends Error {
  constructor(readonly reason: "scope" | "history") {
    super(reason)
  }
}

export type LeanOwner = {
  server: string
  directory: string
  transport: LeanDashboard.Transport
}

type Pending = LeanCoverage.ItemID | "profile"
type State = {
  key?: string
  data?: LeanDashboard.Info
  loading: boolean
  error?: string
  pending: ReadonlySet<Pending>
  history?: LeanDashboard.History
  historyLoading: boolean
  historyError?: string
}

/** One selected native owner; no browser preferences or Session-cache totals. */
export function createLeanController(describe: (error: unknown) => { message: string; unavailable?: boolean }) {
  const [state, setState] = createStore<State>({ loading: false, pending: new Set(), historyLoading: false })
  const requests = new Set<AbortController>()
  let owner: LeanOwner | undefined
  let read: AbortController | undefined
  let detail: AbortController | undefined
  let selected: LeanCoverage.ItemID | undefined
  let sequence = 0
  let accepted = 0
  let disposed = false

  const cancel = () => {
    requests.forEach((request) => request.abort())
    requests.clear()
  }
  const request = () => {
    const abort = new AbortController()
    requests.add(abort)
    return abort
  }
  const current = (active: LeanOwner, abort: AbortController) =>
    !disposed && owner === active && !abort.signal.aborted
  const scoped = (active: LeanOwner, value: { scope: LeanDashboard.Scope }) => {
    if (pathKey(value.scope.directory) !== pathKey(active.directory)) throw new LeanResponseError("scope")
  }
  const failure = (error: unknown, history = false) => {
    const result = describe(error)
    if (result.unavailable) {
      cancel()
      selected = undefined
      setState({ data: undefined, history: undefined, pending: new Set(), loading: false, historyLoading: false })
    }
    setState(history && !result.unavailable ? "historyError" : "error", result.message)
  }

  const refresh = async () => {
    const active = owner
    if (!active || disposed) return
    read?.abort()
    const abort = (read = request())
    const order = ++sequence
    setState({ loading: true, error: undefined })
    try {
      const data = await active.transport.read(abort.signal)
      if (!current(active, abort)) return
      scoped(active, data)
      if (order >= accepted) {
        accepted = order
        setState("data", data)
      }
    } catch (error) {
      if (current(active, abort)) failure(error)
    } finally {
      requests.delete(abort)
      if (current(active, abort)) setState("loading", false)
    }
  }

  const update = async (value: LeanDashboard.Update) => {
    const active = owner
    const key = value.itemID ?? "profile"
    if (!active || disposed || !state.data || state.pending.has(key)) return
    const abort = request()
    const order = ++sequence
    read?.abort()
    setState({ pending: new Set([...state.pending, key]), loading: false, error: undefined })
    try {
      const data = await active.transport.update(value, abort.signal)
      if (!current(active, abort)) return
      scoped(active, data)
      if (order >= accepted) {
        accepted = order
        setState("data", data)
      }
    } catch (error) {
      if (current(active, abort)) failure(error)
    } finally {
      requests.delete(abort)
      if (current(active, abort)) {
        setState("pending", new Set([...state.pending].filter((item) => item !== key)))
        // Reconcile concurrent server writes from a new GET, without hiding write errors.
        if (state.pending.size === 0 && !state.error) await refresh()
      }
    }
  }

  const history = async (itemID: LeanCoverage.ItemID) => {
    const active = owner
    if (!active || disposed || !state.data) return
    detail?.abort()
    const abort = (detail = request())
    const changed = selected !== itemID
    selected = itemID
    setState({ history: changed ? undefined : state.history, historyLoading: true, historyError: undefined })
    try {
      const data = await active.transport.history(itemID, abort.signal)
      if (!current(active, abort)) return
      scoped(active, data)
      if (data.itemID !== itemID || data.executions.some((item) => item.itemID !== itemID))
        throw new LeanResponseError("history")
      setState("history", data)
    } catch (error) {
      if (current(active, abort)) failure(error, true)
    } finally {
      requests.delete(abort)
      if (current(active, abort)) setState("historyLoading", false)
    }
  }

  return {
    state,
    refresh,
    update,
    history,
    async select(next: LeanOwner) {
      if (disposed) return
      cancel()
      owner = { ...next }
      selected = undefined
      accepted = 0
      setState({
        key: `${next.server}\0${pathKey(next.directory)}`,
        data: undefined, history: undefined, error: undefined, historyError: undefined,
        pending: new Set(), loading: false, historyLoading: false,
      })
      await refresh()
    },
    dispose() {
      disposed = true
      owner = undefined
      cancel()
    },
  }
}
