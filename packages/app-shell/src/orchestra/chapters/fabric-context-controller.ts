import type { Orchestra } from "@orchestra/client"
import { FabricContext } from "@orchestra/schema/fabric-context"
import { Schema } from "effect"
import { batch } from "solid-js"
import { createStore } from "solid-js/store"

export type FabricContextIssue = "authentication" | "denied" | "conflict" | "invalid" | "unavailable"

const decodePage = Schema.decodeUnknownSync(FabricContext.Page)
const decodeInfo = Schema.decodeUnknownSync(FabricContext.Info)
const decodeRef = Schema.decodeUnknownSync(FabricContext.Ref)

/** One ephemeral owner and captured generated client. No authority or sensitive persistence is created here. */
export function createFabricContextController(client: Pick<ReturnType<typeof Orchestra.make>, "fabricContexts">) {
  const page = () => ({
    items: [] as FabricContext.Ref[],
    after: undefined as FabricContext.ID | undefined,
    loaded: false,
    loading: false,
    error: undefined as FabricContextIssue | undefined,
  })
  const [state, setState] = createStore({
    list: page(),
    preparing: page(),
    starting: false,
    connectionError: undefined as FabricContextIssue | undefined,
    active: undefined as FabricContext.Info | undefined,
    selected: undefined as FabricContext.Ref | undefined,
    resolving: false,
    resolveError: undefined as FabricContextIssue | undefined,
    create: {
      key: undefined as string | undefined,
      loading: false,
      error: undefined as FabricContextIssue | undefined,
    },
    remove: {
      ref: undefined as FabricContext.Ref | undefined,
      key: undefined as string | undefined,
      loading: false,
      error: undefined as FabricContextIssue | undefined,
    },
  })
  const owner = { live: true, abort: new AbortController(), resolve: undefined as AbortController | undefined }
  const epochs = { start: 0, list: 0, preparing: 0, resolve: 0, create: 0, remove: 0 }
  const current = (kind: keyof typeof epochs, epoch: number) => owner.live && epochs[kind] === epoch
  const clearContext = () => {
    owner.resolve?.abort()
    epochs.resolve++
    setState({ active: undefined, selected: undefined, resolving: false, resolveError: undefined })
  }

  async function load(kind: "list" | "preparing", after?: FabricContext.ID) {
    if (!owner.live || state[kind].loading) return
    const epoch = ++epochs[kind]
    setState(kind, { loading: true, error: undefined })
    try {
      const value = await client.fabricContexts[kind](after ? { after } : undefined, { signal: owner.abort.signal })
      if (!current(kind, epoch)) return
      const valuePage = decodePage(value)
      const previous = after ? state[kind].items : []
      setState(kind, {
        items: [...previous.filter((ref) => !valuePage.items.some((next) => next.id === ref.id)), ...valuePage.items],
        after: valuePage.after,
        loaded: true,
        loading: false,
        error: undefined,
      })
    } catch (error) {
      if (!current(kind, epoch)) return
      const issue = publicIssue(error)
      batch(() => {
        if (issue === "authentication" || issue === "denied") clearContext()
        setState(kind, { loaded: true, loading: false, error: issue })
      })
    }
  }

  async function start(ready: PromiseLike<void>) {
    if (!owner.live || state.starting) return
    const epoch = ++epochs.start
    setState({ starting: true, connectionError: undefined })
    try {
      await ready
      if (!current("start", epoch)) return
      setState("starting", false)
      void load("list")
      void load("preparing")
    } catch (error) {
      if (current("start", epoch)) setState({ starting: false, connectionError: publicIssue(error) })
    }
  }

  async function open(ref: FabricContext.Ref) {
    if (!owner.live) return
    const target = { id: ref.id, generation: ref.generation }
    clearContext()
    const epoch = epochs.resolve
    const abort = new AbortController()
    owner.resolve = abort
    setState({ selected: target, resolving: true, resolveError: undefined })
    try {
      const value = await client.fabricContexts.resolve(target, {
        signal: AbortSignal.any([owner.abort.signal, abort.signal]),
      })
      if (!current("resolve", epoch)) return
      const info = decodeInfo(value)
      if (!sameReference(info.context, target)) {
        setState({ resolving: false, resolveError: "unavailable" })
        return
      }
      setState({ active: info, resolving: false, resolveError: undefined })
    } catch (error) {
      if (current("resolve", epoch)) setState({ resolving: false, resolveError: publicIssue(error) })
    }
  }

  // In-flight reads before a successful mutation must not republish obsolete rows afterwards.
  function refresh() {
    epochs.list++
    epochs.preparing++
    setState("list", "loading", false)
    setState("preparing", "loading", false)
    void load("list")
    void load("preparing")
  }

  async function create(retry = false) {
    if (!owner.live || state.create.loading) return
    const key = retry ? state.create.key : crypto.randomUUID()
    if (!key) return
    const epoch = ++epochs.create
    setState("create", { key, loading: true, error: undefined })
    try {
      const value = await client.fabricContexts.create({ "idempotency-key": key }, { signal: owner.abort.signal })
      if (!current("create", epoch)) return
      const info = decodeInfo(value)
      batch(() => {
        setState("create", { key: undefined, loading: false, error: undefined })
        setState("list", "items", (refs) => [info.context, ...refs.filter((ref) => ref.id !== info.context.id)])
      })
      refresh()
      // Creation's Location is not a substitute for current resolution before mounting directory providers.
      await open(info.context)
    } catch (error) {
      if (current("create", epoch)) setState("create", { loading: false, error: publicIssue(error) })
    }
  }

  async function deliverRemove(intent: { ref: FabricContext.Ref; key: string }) {
    if (!owner.live || state.remove.loading) return
    const epoch = ++epochs.remove
    setState("remove", { ref: intent.ref, key: intent.key, loading: true, error: undefined })
    if (sameReference(state.selected, intent.ref)) clearContext()
    try {
      const value = await client.fabricContexts.remove(
        { ...intent.ref, "idempotency-key": intent.key },
        { signal: owner.abort.signal },
      )
      if (!current("remove", epoch)) return
      const tombstone = decodeRef(value)
      if (tombstone.id !== intent.ref.id || tombstone.generation !== intent.ref.generation + 1) {
        setState("remove", { loading: false, error: "unavailable" })
        return
      }
      batch(() => {
        setState("list", "items", (refs) => refs.filter((ref) => ref.id !== tombstone.id))
        setState("preparing", "items", (refs) => refs.filter((ref) => ref.id !== tombstone.id))
        setState("remove", { ref: undefined, key: undefined, loading: false, error: undefined })
      })
      refresh()
    } catch (error) {
      if (current("remove", epoch)) setState("remove", { loading: false, error: publicIssue(error) })
    }
  }

  return {
    state,
    start,
    load,
    open,
    create,
    remove(ref: FabricContext.Ref) {
      if (!owner.live || state.remove.loading) return
      return deliverRemove({ ref: { id: ref.id, generation: ref.generation }, key: crypto.randomUUID() })
    },
    retryRemove() {
      const ref = state.remove.ref
      const key = state.remove.key
      if (ref && key) return deliverRemove({ ref: { id: ref.id, generation: ref.generation }, key })
    },
    dispose() {
      owner.live = false
      owner.resolve?.abort()
      owner.abort.abort()
    },
  }
}

function sameReference(left: FabricContext.Ref | undefined, right: FabricContext.Ref) {
  return left?.id === right.id && left.generation === right.generation
}

function publicIssue(error: unknown): FabricContextIssue {
  if (typeof error !== "object" || error === null || !("_tag" in error)) return "unavailable"
  switch (error._tag) {
    case "UnauthorizedError":
      return "authentication"
    case "ForbiddenError":
      return "denied"
    case "ConflictError":
      return "conflict"
    case "InvalidRequestError":
      return "invalid"
    default:
      return "unavailable"
  }
}
