import { Capability } from "@orchestra/schema/capability"
import { CapabilityManagement } from "@orchestra/schema/capability-management"
import { CapabilitySetup } from "@orchestra/schema/capability-setup"
import { Option, Schema } from "effect"
import { getOwner, onCleanup } from "solid-js"
import { createStore } from "solid-js/store"
import type { Api, Connection, Failure, Model, Receipt, State, Target } from "./integrations-contract"

export function createIntegrationModel(api: Api, requestKey: () => string = () => crypto.randomUUID()): Model {
  const [state, set] = createStore<{ -readonly [K in keyof State]: State[K] }>({
    status: "loading", connections: [], targets: [], bindings: [], busy: false,
  })
  let disposed = false
  let generation = 0
  let reading: AbortController | undefined
  let writing: AbortController | undefined
  let connection: Capability.ConnectionRef | undefined
  let target: Capability.TargetRef | undefined
  // Neither credentials nor idempotency keys enter the reactive/public store.
  let operation: { run: (signal: AbortSignal) => Promise<Receipt>; clear: () => void } | undefined

  const clear = () => {
    operation?.clear()
    operation = undefined
  }

  const fence = () => {
    reading?.abort()
    reading = undefined
    return ++generation
  }
  const read = async (run: (signal: AbortSignal) => Promise<() => void>) => {
    if (disposed) return
    const version = fence()
    const controller = new AbortController()
    reading = controller
    set({ status: "loading", failure: undefined })
    const applied = await Promise.resolve().then(() => {
      if (disposed || version !== generation) throw "invalid"
      return run(controller.signal)
    }).then((apply) => {
      if (disposed || version !== generation) return false
      apply()
      set({ status: "ready", failure: undefined })
      return true
    }, (error: unknown) => {
      if (disposed || version !== generation) return false
      set({ status: "error", failure: failure(error, false) })
      return false
    })
    if (reading === controller) reading = undefined
    return applied
  }
  const load = async (more = false, committed = false) => {
    if (disposed || (state.busy && !committed) || (more && !state.after)) return
    const after = more ? state.after : undefined
    // Coverage is live rows/current actor, never all records or provider readiness.
    return read(async (signal) => {
      const page = decode(CapabilityManagement.ConnectionPage, await api.list(after, { signal }))
      if (page.items.length > 32) throw "invalid"
      return () => {
        set({ connections: rows(more ? state.connections : [], page.items, (row) => row.connection.id,
          512 - state.targets.length - state.bindings.length), after: page.after })
      }
    })
  }
  const readTargets = async (more = false) => {
    if (!connection || (more && !state.targetsAfter)) return
    const ref = connection
    const after = more ? state.targetsAfter : undefined
    return read(async (signal) => {
      const page = decode(CapabilityManagement.TargetPage, await api.targets(ref.id, after, { signal }))
      if (page.items.length > 32 || page.items.some((row) => row.target.connectionID !== ref.id)) throw "invalid"
      return () => {
        const items = rows(more ? state.targets : [], page.items, (row) => row.target.id, 512 - state.bindings.length)
        set({ targets: items, connections: state.connections.slice(Math.max(0, state.connections.length + items.length
          + state.bindings.length - 512)), targetsAfter: page.after })
      }
    })
  }
  const readBindings = async (more = false) => {
    if (!target || (more && !state.bindingsAfter)) return
    const ref = target
    const after = more ? state.bindingsAfter : undefined
    return read(async (signal) => {
      const page = decode(CapabilityManagement.BindingPage, await api.bindings(ref.id, after, { signal }))
      if (page.items.length > 32) throw "invalid"
      return () => {
        const items = rows(more ? state.bindings : [], page.items, (row) => row.sessionID, 512 - state.targets.length)
        set({ bindings: items, connections: state.connections.slice(Math.max(0, state.connections.length
          + state.targets.length + items.length - 512)), bindingsAfter: page.after })
      }
    })
  }
  const select = async (input: Connection) => {
    if (disposed || state.busy) return
    fence()
    clear()
    target = undefined
    try {
      connection = decode(CapabilityManagement.Connection, input).connection
      set({ connectionID: connection.id, targetID: undefined, targets: [], bindings: [], targetsAfter: undefined,
        bindingsAfter: undefined, receipt: undefined })
    } catch {
      connection = undefined
      set({ status: "error", failure: "invalid", connectionID: undefined, targetID: undefined,
        targets: [], bindings: [], targetsAfter: undefined, bindingsAfter: undefined })
      return
    }
    await readTargets()
  }
  const selectTarget = async (input: Target) => {
    if (disposed || state.busy) return
    fence()
    clear()
    try {
      const value = decode(CapabilityManagement.Target, input).target
      if (value.connectionID !== connection?.id) throw "invalid"
      target = value
      set({ targetID: target.id, bindings: [], bindingsAfter: undefined, receipt: undefined })
    } catch {
      target = undefined
      set({ status: "error", failure: "invalid", targetID: undefined, bindings: [], bindingsAfter: undefined })
      return
    }
    await readBindings()
  }
  const refresh = async () => {
    // A committed receipt survives a failed read; the closed intent can never be redriven.
    const selectedConnection = connection?.id
    const selectedTarget = target?.id
    if (!(await load(false, true)) || disposed) return
    connection = state.connections.find((row) => row.connection.id === selectedConnection)?.connection
    target = undefined
    set({ connectionID: connection?.id, targetID: undefined, targets: [], bindings: [], targetsAfter: undefined,
      bindingsAfter: undefined })
    if (!connection) return
    if (!(await readTargets()) || disposed) return
    target = state.targets.find((row) => row.target.id === selectedTarget)?.target
    set("targetID", target?.id)
    if (target) await readBindings()
  }
  const retry = async () => {
    if (disposed || state.busy || !operation) return
    fence()
    const intent = operation
    const controller = new AbortController()
    writing = controller
    set({ busy: true, failure: undefined, receipt: undefined })
    const receipt = await Promise.resolve().then(() => intent.run(controller.signal)).then((value) => value, (error: unknown) => {
      if (!disposed && operation === intent) set({ status: "error", failure: failure(error, true) })
      return undefined
    })
    if (disposed || operation !== intent) return
    if (!receipt) {
      writing = undefined
      set("busy", false)
      return
    }
    clear()
    set({ receipt, failure: undefined })
    await refresh()
    if (!disposed && writing === controller) {
      writing = undefined
      set("busy", false)
    }
  }
  const mutate = <S extends Schema.Decoder<unknown>, R extends Schema.Decoder<Schema.Json>>(
    schema: S, input: unknown,
    send: (value: S["Type"], key: string, signal: AbortSignal) => Promise<Receipt>, result: R,
  ) => {
    if (disposed || state.busy) return Promise.resolve()
    clear()
    set({ receipt: undefined, failure: undefined })
    // Capture synchronously at call time, before any promise can yield to caller edits.
    try {
      let value: S["Type"] | undefined = decode(schema, input)
      let key: string | undefined = decode(Schema.NonEmptyString, requestKey())
      operation = {
        clear: () => { value = undefined; key = undefined },
        run: async (signal) => {
          if (value === undefined || key === undefined || signal.aborted) throw "invalid"
          const reply = await send(structuredClone(value), key, signal)
          if (value === undefined || key === undefined || signal.aborted) throw "invalid"
          const receipt = decode(CapabilityManagement.Receipt, reply)
          const data = decode(result, receipt.data)
          // Reject reflected private keys even in otherwise valid receipt metadata.
          const publicJSON = JSON.stringify({ ...receipt, data })
          if (publicJSON.includes(JSON.stringify(key).slice(1, -1)) || (value && typeof value === "object" && "key" in value
            && typeof value.key === "string" && publicJSON.includes(JSON.stringify(value.key).slice(1, -1)))) throw "invalid"
          return { ...receipt, data }
        },
      }
    } catch {
      set({ status: "error", failure: "invalid" })
      return Promise.resolve()
    }
    return retry()
  }
  const cancel = () => {
    if (disposed) return
    fence()
    writing?.abort()
    writing = undefined
    clear()
    set({ busy: false, receipt: undefined, status: "error", failure: "request" })
  }
  const dispose = () => {
    if (disposed) return
    disposed = true
    fence()
    writing?.abort()
    writing = undefined
    clear()
    connection = undefined
    target = undefined
    set({ status: "loading", connections: [], targets: [], bindings: [], busy: false, connectionID: undefined,
      targetID: undefined, after: undefined, targetsAfter: undefined, bindingsAfter: undefined,
      failure: undefined, receipt: undefined })
  }
  if (getOwner()) onCleanup(dispose)
  return {
    state, load: async (more) => { await load(more) }, select, selectTarget, retry, cancel, dispose,
    moreTargets: async () => { if (!disposed && !state.busy) await readTargets(true) },
    moreBindings: async () => { if (!disposed && !state.busy) await readBindings(true) },
    connect: (input) => mutate(CapabilitySetup.Input, input,
      (value, key, signal) => api.connect(value, key, { signal }), CapabilitySetup.Result),
    createTarget: (input) => mutate(CapabilityManagement.CreateTargetInput, { connection, input },
      (value, key, signal) => api.createTarget(value.connection, value.input, key, { signal }), CapabilityManagement.Target),
    retargetTarget: (input) => mutate(CapabilityManagement.RetargetInput, { target, input },
      (value, key, signal) => api.retargetTarget(value.target, value.input, key, { signal }), CapabilityManagement.Target),
    removeTarget: () => mutate(CapabilityManagement.RemoveTargetInput, { target },
      (value, key, signal) => api.removeTarget(value.target, key, { signal }), Schema.Null),
    disconnect: () => mutate(CapabilityManagement.DisconnectInput, { connection },
      (value, key, signal) => api.disconnect(value.connection, key, { signal }), Schema.Null),
    bind: (input) => mutate(CapabilityManagement.PutBindingInput, { target, input },
      (value, key, signal) => api.bind(value.target, value.input, key, { signal }), Schema.Null),
    unbind: (sessionID) => mutate(CapabilityManagement.RemoveBindingInput, { target, sessionID },
      (value, key, signal) => api.unbind(value.target, value.sessionID, key, { signal }), Schema.Null),
  }
}

function decode<S extends Schema.Decoder<unknown>>(schema: S, input: unknown): S["Type"] {
  const parse = Schema.decodeUnknownOption(schema, { onExcessProperty: "error" })
  const value = parse(input)
  if (Option.isNone(value)) throw "invalid"
  // JSON detachment also handles Solid store proxies; structuredClone rejects proxies.
  const snapshot = Schema.decodeUnknownOption(Schema.UnknownFromJsonString)(JSON.stringify(value.value))
  if (Option.isNone(snapshot)) throw "invalid"
  const detached = parse(snapshot.value)
  if (Option.isNone(detached)) throw "invalid"
  return detached.value
}

function rows<T>(previous: readonly T[], incoming: readonly T[], id: (row: T) => string, limit: number) {
  if (limit <= 0) return []
  return [...new Map([...previous, ...incoming].map((row) => [id(row), row])).values()].slice(-limit)
}

function failure(error: unknown, mutation: boolean): Failure {
  if (!error || typeof error !== "object") return error === "invalid" ? (mutation ? "unknown" : "request") : "request"
  const cause = "cause" in error ? error.cause : undefined
  const status = "status" in error ? error.status : cause && typeof cause === "object" && "status" in cause ? cause.status : undefined
  const tag = "_tag" in error ? error._tag : undefined
  if (status === 401 || status === 403 || tag === "UnauthorizedError" || tag === "ForbiddenError") return "authorization"
  if (status === 404 || status === 405 || status === 501) return "unsupported"
  if (status === 400 || status === 422 || tag === "InvalidRequestError" || tag === "HttpApiSchemaError") return "invalid"
  if (typeof status === "number" || typeof tag === "string") return "request"
  return mutation ? "unknown" : "request"
}
