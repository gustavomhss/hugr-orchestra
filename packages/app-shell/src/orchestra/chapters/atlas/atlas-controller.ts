import { createStore, unwrap } from "solid-js/store"
import { pathKey } from "@/utils/path-key"
import { createWarm } from "../../warm"
import { isAtlasEmpty, type AtlasTransport } from "./atlas-api"
import type { AtlasInput, AtlasOutput, AtlasReview, AtlasSnapshot } from "./atlas-types"

export type AtlasOwner = { server: string; directory: string; transport: AtlasTransport }
export type AtlasWrite =
  | "promote"
  | "draft"
  | "emit"
  | "link"
  | "verify"
  | "hold"
  | "release"
  | "propose"
  | "decide"
  | "answer"
  | "memoryDecide"
  | "territory"
  | "delegate"
  | "setup"
  | "mine"
export type AtlasController = ReturnType<typeof createAtlasController>
type State = {
  key?: string
  snapshot?: AtlasSnapshot
  // D34: the review log, read with the snapshot; undefined while the store is empty.
  review?: AtlasReview
  // D5: the instance worktree has no .atlas/.
  empty: boolean
  // The server has no `atlas` routes.
  unavailable: boolean
  loading: boolean
  error?: string
  health?: AtlasOutput<"health">
  reasoning: Record<string, AtlasOutput<"reasoning">>
  own: Record<string, AtlasOutput<"own">>
  pending: AtlasWrite[]
}

type Held = { snapshot?: AtlasSnapshot; review?: AtlasReview; empty: boolean }
/** The last snapshot and review read per server and directory, painted at once when Atlas opens again. */
export const createAtlasWarm = () => createWarm<Held>(8)
const shared = createAtlasWarm()
// A window focus rereads only when the last read is older than this, so alt-tabbing does not hammer the server.
export const FOCUS_REFRESH_MS = 60_000

// One selected owner (server + directory), like the Lean controller. D6: the snapshot is read on select, on
// refresh, and again after every write; reasoning, own briefings and health are read on demand and cached.
export function createAtlasController(
  describe: (error: unknown) => { message: string; unavailable?: boolean },
  options: { warm?: ReturnType<typeof createAtlasWarm>; now?: () => number } = {},
) {
  const warm = options.warm ?? shared
  const now = options.now ?? Date.now
  const [state, setState] = createStore<State>({
    empty: false,
    unavailable: false,
    loading: false,
    reasoning: {},
    own: {},
    pending: [],
  })
  const requests = new Set<AbortController>()
  const life = { disposed: false, sequence: 0, accepted: 0, readAt: 0 }
  let owner: AtlasOwner | undefined
  let read: AbortController | undefined

  const request = () => {
    const abort = new AbortController()
    requests.add(abort)
    return abort
  }
  const cancel = () => {
    requests.forEach((item) => item.abort())
    requests.clear()
  }
  const current = (active: AtlasOwner, abort: AbortController) =>
    !life.disposed && owner === active && !abort.signal.aborted
  const failure = (error: unknown) => {
    const result = describe(error)
    if (result.unavailable) {
      cancel()
      setState({
        snapshot: undefined,
        review: undefined,
        empty: false,
        unavailable: true,
        loading: false,
        pending: [],
        error: undefined,
      })
      return
    }
    setState("error", result.message)
  }
  // Runs one request against the selected owner; resolves undefined when it failed or was superseded.
  const run = async <T>(call: (transport: AtlasTransport, signal: AbortSignal) => Promise<T>, abort = request()) => {
    const active = owner
    if (!active || life.disposed || state.unavailable) return
    try {
      const value = await call(active.transport, abort.signal)
      if (current(active, abort)) return value
    } catch (error) {
      if (current(active, abort)) failure(error)
    } finally {
      requests.delete(abort)
    }
  }

  const refresh = async () => {
    if (!owner || life.disposed || state.unavailable) return
    read?.abort()
    const order = ++life.sequence
    setState({ loading: true, error: undefined })
    read = request()
    // D34: the review log is read beside the snapshot, under the same abort, so the two always match.
    const [data, review] = await Promise.all([
      run((transport, signal) => transport.snapshot(signal), read),
      run((transport, signal) => transport.review(signal), read),
    ])
    if (life.disposed) return
    // A newer refresh owns the loading flag until it finishes.
    if (order === life.sequence) setState("loading", false)
    if (data === undefined || order < life.accepted) return
    life.accepted = order
    life.readAt = now()
    if (isAtlasEmpty(data)) {
      warm.write(state.key!, { empty: true })
      return setState({ snapshot: undefined, review: undefined, empty: true })
    }
    const kept = review === undefined || isAtlasEmpty(review) ? undefined : review
    warm.write(state.key!, { snapshot: data, review: kept, empty: false })
    // An unchanged read keeps the stored objects, so the model built from the snapshot is not rebuilt.
    setState({
      ...(same(state.snapshot, data) ? {} : { snapshot: data }),
      ...(same(state.review, kept) ? {} : { review: kept }),
      empty: false,
    })
  }
  // The window-focus read: skipped while the last one is recent.
  const revalidate = async () => {
    if (now() - life.readAt < FOCUS_REFRESH_MS) return
    await refresh()
  }

  const reasoning = async (id: string) => {
    if (state.reasoning[id]) return state.reasoning[id]
    const data = await run((transport, signal) => transport.reasoning(id, signal))
    if (data !== undefined) setState("reasoning", id, data)
    return data
  }
  const own = async (scope: string) => {
    if (state.own[scope]) return state.own[scope]
    const data = await run((transport, signal) => transport.own(scope, signal))
    if (data !== undefined) setState("own", scope, data)
    return data
  }
  const health = async () => {
    const data = await run((transport, signal) => transport.health(signal))
    if (data !== undefined) setState("health", data)
    return data
  }

  // A write marks its kind pending, then rereads the snapshot and the review (D6, D34). `verify` saves nothing.
  const write = async <T>(kind: AtlasWrite, call: (transport: AtlasTransport, signal: AbortSignal) => Promise<T>) => {
    setState({ pending: [...state.pending, kind], error: undefined })
    const data = await run(call)
    if (life.disposed) return data
    setState("pending", state.pending.filter((item) => item !== kind))
    if (kind !== "verify") await refresh()
    return data
  }

  return {
    state,
    refresh,
    revalidate,
    reasoning,
    own,
    health,
    promote: (input: AtlasInput<"promote">) => write("promote", (transport, signal) => transport.promote(input, signal)),
    draft: (input: AtlasInput<"draft">) => write("draft", (transport, signal) => transport.draft(input, signal)),
    emit: (input: AtlasInput<"emit">) => write("emit", (transport, signal) => transport.emit(input, signal)),
    link: (input: AtlasInput<"link">) => write("link", (transport, signal) => transport.link(input, signal)),
    verify: (input: AtlasInput<"verify">) => write("verify", (transport, signal) => transport.verify(input, signal)),
    hold: (input: AtlasInput<"hold">) => write("hold", (transport, signal) => transport.hold(input, signal)),
    release: (input: AtlasInput<"release">) => write("release", (transport, signal) => transport.release(input, signal)),
    propose: (input: AtlasInput<"propose">) => write("propose", (transport, signal) => transport.propose(input, signal)),
    decide: (input: AtlasInput<"decide">) => write("decide", (transport, signal) => transport.decide(input, signal)),
    answer: (input: AtlasInput<"answer">) => write("answer", (transport, signal) => transport.answer(input, signal)),
    memoryDecide: (input: AtlasInput<"memoryDecide">) =>
      write("memoryDecide", (transport, signal) => transport.memoryDecide(input, signal)),
    territory: (input: AtlasInput<"territory">) =>
      write("territory", (transport, signal) => transport.territory(input, signal)),
    delegate: (input: AtlasInput<"delegate">) =>
      write("delegate", (transport, signal) => transport.delegate(input, signal)),
    mine: (input: AtlasInput<"mine">) => write("mine", (transport, signal) => transport.mine(input, signal)),
    // D41: install, then index the code when install set Atlas up, then reread. One pending mark covers both, so the
    // empty state keeps showing progress until the store is read back.
    setup: async () => {
      setState({ pending: [...state.pending, "setup"], error: undefined })
      const installed = await run((transport, signal) => transport.install(signal))
      const indexed = installed?.installed ? await run((transport, signal) => transport.index(signal)) : undefined
      if (life.disposed) return { installed, indexed }
      setState("pending", state.pending.filter((item) => item !== "setup"))
      await refresh()
      return { installed, indexed }
    },
    async select(next: AtlasOwner) {
      if (life.disposed) return
      cancel()
      owner = { ...next }
      life.accepted = 0
      life.readAt = 0
      const key = `${next.server}\0${pathKey(next.directory)}`
      // A directory read before shows its last snapshot while the fresh read runs.
      const held = warm.read(key)
      setState({
        key,
        review: held?.review,
        snapshot: held?.snapshot,
        empty: held?.empty ?? false,
        unavailable: false,
        loading: false,
        error: undefined,
        health: undefined,
        reasoning: {},
        own: {},
        pending: [],
      })
      await refresh()
    },
    dispose() {
      life.disposed = true
      owner = undefined
      cancel()
    },
  }
}

// The snapshot carries no revision that covers all of its content, so reads compare serialized. Each object is
// serialized once: a read adopted into the store is compared next time by its remembered text. The store only
// ever replaces these objects whole, so the remembered text cannot go stale.
const serialized = new WeakMap<object, string | undefined>()

function same(stored: unknown, next: unknown) {
  return text(unwrap(stored)) === text(next)
}

function text(value: unknown) {
  if (typeof value !== "object" || value === null) return JSON.stringify(value)
  if (!serialized.has(value)) serialized.set(value, JSON.stringify(value))
  return serialized.get(value)
}
